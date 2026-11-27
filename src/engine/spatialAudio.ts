import * as THREE from 'three';
import type { AuraAudioConfig } from '../aura/types';

export type SpatialAudioState =
  | 'none'
  | 'loading'
  | 'suspended'
  | 'playing'
  | 'muted'
  | 'error';

export function toPerceptualGain(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  if (clamped <= 0.001) return 0;
  return Math.pow(clamped, 3.0);
}

export interface SpatialAudioOptions {
  listener?: THREE.AudioListener;
  bufferCache?: Map<string, AudioBuffer>;
  onStateChange?: (state: SpatialAudioState) => void;
}

export interface MusicSyncMetrics {
  active: boolean;
  level: number;
  bass: number;
  treble: number;
  beat: number;
  beatPhase: number;
}

const INACTIVE_MUSIC_METRICS: MusicSyncMetrics = {
  active: false,
  level: 0,
  bass: 0,
  treble: 0,
  beat: 0,
  beatPhase: 0,
};

interface AudioBeatTrack {
  fps: number;
  frameCount: number;
  duration: number;
  level: Float32Array;
  bass: Float32Array;
  treble: Float32Array;
  beat: Float32Array;
}

const beatTrackCache = new WeakMap<AudioBuffer, AudioBeatTrack>();

function getOrAnalyzeBeatTrack(buffer: AudioBuffer): AudioBeatTrack {
  const cached = beatTrackCache.get(buffer);
  if (cached) return cached;

  const fps = 60;
  const duration = Math.max(0.05, buffer.duration);
  const frameCount = Math.max(1, Math.ceil(duration * fps));
  const rawLevel = new Float32Array(frameCount);
  const rawBass = new Float32Array(frameCount);
  const rawTreble = new Float32Array(frameCount);

  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / fps));
  const alphaLp = 1 - Math.exp((-2 * Math.PI * 190) / sampleRate);

  let lp = 0;
  let peakLevel = 0.001;
  let peakBass = 0.001;
  let peakTreble = 0.001;

  for (let f = 0; f < frameCount; f++) {
    const start = Math.floor((f / fps) * sampleRate);
    const end = Math.min(channelData.length, start + samplesPerFrame);
    const count = Math.max(1, end - start);

    let sumSq = 0;
    let bassSq = 0;
    let trebleSq = 0;

    // Stride up to 4 samples on very high sample rates to keep analysis <2ms
    const stride = count > 600 ? 2 : 1;
    let sampled = 0;
    for (let i = start; i < end; i += stride) {
      const s = channelData[i];
      lp += alphaLp * (s - lp);
      const hi = s - lp;
      sumSq += s * s;
      bassSq += lp * lp;
      trebleSq += hi * hi;
      sampled++;
    }

    const denom = Math.max(1, sampled);
    const lvl = Math.sqrt(sumSq / denom);
    const bss = Math.sqrt(bassSq / denom);
    const trb = Math.sqrt(trebleSq / denom);

    rawLevel[f] = lvl;
    rawBass[f] = bss;
    rawTreble[f] = trb;

    if (lvl > peakLevel) peakLevel = lvl;
    if (bss > peakBass) peakBass = bss;
    if (trb > peakTreble) peakTreble = trb;
  }

  // Soft 85%-peak normalization so loud peaks don't crush normal verses
  const normL = peakLevel * 0.85;
  const normB = peakBass * 0.85;
  const normT = peakTreble * 0.85;

  const level = new Float32Array(frameCount);
  const bass = new Float32Array(frameCount);
  const treble = new Float32Array(frameCount);
  const beat = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    level[f] = Math.min(1, rawLevel[f] / normL);
    bass[f] = Math.min(1, rawBass[f] / normB);
    treble[f] = Math.min(1, rawTreble[f] / normT);
  }

  // Onset flux beat detector with fast attack and musical exponential decay
  let beatEnv = 0;
  let lastBeatFrame = -10;
  for (let f = 0; f < frameCount; f++) {
    const winStart = Math.max(0, f - 10);
    let avgEnergy = 0;
    let winLen = 0;
    for (let k = winStart; k < f; k++) {
      avgEnergy += bass[k] * 0.72 + level[k] * 0.28;
      winLen++;
    }
    const localAvg = winLen > 0 ? avgEnergy / winLen : 0;
    const currEnergy = bass[f] * 0.72 + level[f] * 0.28;
    const flux = currEnergy - localAvg * 1.18;

    if (flux > 0.055 && currEnergy > 0.14 && f - lastBeatFrame >= 5) {
      beatEnv = Math.max(beatEnv, Math.min(1, flux * 3.8 + currEnergy * 0.28));
      lastBeatFrame = f;
    } else {
      beatEnv *= 0.83;
    }
    beat[f] = beatEnv;
  }

  const track: AudioBeatTrack = {
    fps,
    frameCount,
    duration,
    level,
    bass,
    treble,
    beat,
  };
  beatTrackCache.set(buffer, track);
  return track;
}

const _anchorWorldPos = new THREE.Vector3();

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) {
    throw new Error('Invalid audio data URL.');
  }
  const base64 = dataUrl.slice(commaIdx + 1).replace(/\s+/g, '');
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Spatial 3D audio controller attached directly to an aura's 3D world anchor.
 * Sound emanates from the character's aura position in 3D space (HRTF panning +
 * inverse-distance attenuation + smooth true-zero cutoff at maxDistance) so
 * nearby players and orbiting cameras hear it coming physically from that aura.
 */
export class SpatialAuraAudioController {
  private camera: THREE.Camera;
  private listener: THREE.AudioListener | null = null;
  private ownsListener: boolean;
  private sharedBufferCache: Map<string, AudioBuffer>;
  private ownsBufferCache: boolean;
  private onStateChange?: (state: SpatialAudioState) => void;
  private positionalAudio: THREE.PositionalAudio | null = null;
  private currentAnchor: THREE.Object3D | null = null;
  private currentDataUrl: string | null = null;
  private currentConfig: AuraAudioConfig | null = null;
  private loadSeq = 0;
  private muted = false;
  private distanceFactor = 1;
  private audioState: SpatialAudioState = 'none';
  private unlockListenersBound = false;
  private disposed = false;
  private playStartCtxTime: number | null = null;
  private hasStartedCurrentTrack = false;
  private lastLoopSetting: boolean | null = null;
  private beatTrack: AudioBeatTrack | null = null;
  private beatPhase = 0;
  private smoothLevel = 0;
  private smoothBass = 0;
  private smoothTreble = 0;
  private smoothBeat = 0;

  constructor(camera: THREE.Camera, options?: SpatialAudioOptions) {
    this.camera = camera;
    this.onStateChange = options?.onStateChange;
    if (options?.listener) {
      this.listener = options.listener;
      this.ownsListener = false;
    } else {
      this.listener = null;
      this.ownsListener = true;
    }
    if (options?.bufferCache) {
      this.sharedBufferCache = options.bufferCache;
      this.ownsBufferCache = false;
    } else {
      this.sharedBufferCache = new Map();
      this.ownsBufferCache = true;
    }
  }

  private emitState(next: SpatialAudioState) {
    if (this.audioState === next) return;
    this.audioState = next;
    this.onStateChange?.(next);
  }

  public getAudioState(): SpatialAudioState {
    return this.audioState;
  }

  private ensureListener(): THREE.AudioListener {
    if (!this.listener) {
      this.listener = new THREE.AudioListener();
      this.camera.add(this.listener);
      this.ownsListener = true;
    }
    return this.listener;
  }

  private handleGlobalUnlock = () => {
    void this.resumeContext();
  };

  private bindUnlockListeners() {
    if (this.unlockListenersBound || this.disposed) return;
    this.unlockListenersBound = true;
    window.addEventListener('pointerdown', this.handleGlobalUnlock, { capture: true });
    window.addEventListener('keydown', this.handleGlobalUnlock, { capture: true });
    window.addEventListener('touchstart', this.handleGlobalUnlock, {
      capture: true,
      passive: true,
    });
  }

  private unbindUnlockListeners() {
    if (!this.unlockListenersBound) return;
    this.unlockListenersBound = false;
    window.removeEventListener('pointerdown', this.handleGlobalUnlock, { capture: true });
    window.removeEventListener('keydown', this.handleGlobalUnlock, { capture: true });
    window.removeEventListener('touchstart', this.handleGlobalUnlock, { capture: true });
  }

  public async resumeContext(): Promise<void> {
    if (this.disposed || !this.listener) return;
    const ctx = this.listener.context;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Browser still requires an active user gesture
      }
    }
    this.tryPlayIfReady();
  }

  private tryPlayIfReady() {
    if (this.disposed || !this.positionalAudio || !this.currentConfig) return;
    const sound = this.positionalAudio;
    if (!sound.buffer) return;

    if (sound.context.state !== 'running') {
      this.bindUnlockListeners();
      this.emitState(this.muted ? 'muted' : 'suspended');
      return;
    }

    this.unbindUnlockListeners();
    const canAutoStart = this.currentConfig.loop || !this.hasStartedCurrentTrack;
    if (
      !sound.isPlaying &&
      !this.muted &&
      this.distanceFactor > 0.001 &&
      canAutoStart
    ) {
      try {
        sound.play();
        this.playStartCtxTime = sound.context.currentTime;
        this.hasStartedCurrentTrack = true;
      } catch {
        // Ignore transient WebAudio error
      }
    }
    const nextState: SpatialAudioState = this.muted
      ? 'muted'
      : sound.isPlaying
        ? 'playing'
        : this.hasStartedCurrentTrack && !this.currentConfig.loop
          ? 'none'
          : 'suspended';
    this.emitState(nextState);
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.positionalAudio && this.currentConfig) {
      this.applyEffectiveVolume();
      if (!muted) {
        void this.resumeContext();
      } else {
        this.emitState('muted');
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isWithinRange(): boolean {
    return Boolean(this.currentConfig && !this.muted && this.distanceFactor > 0.01);
  }

  public setAuraAudio(
    anchor: THREE.Object3D,
    config: AuraAudioConfig | undefined,
  ): void {
    if (this.disposed) return;

    if (!config || !config.dataUrl) {
      this.stopAndDetach();
      this.currentConfig = null;
      this.currentDataUrl = null;
      this.emitState('none');
      return;
    }

    this.currentConfig = config;
    const listener = this.ensureListener();

    // Update spatial & playback params live if same track is already loaded
    if (
      this.positionalAudio &&
      this.currentDataUrl === config.dataUrl &&
      this.currentAnchor === anchor
    ) {
      this.applyParams(this.positionalAudio, config);
      if (this.positionalAudio.buffer) {
        if (this.positionalAudio.isPlaying && !this.muted) {
          this.emitState('playing');
        } else {
          void this.resumeContext();
        }
      }
      return;
    }

    this.stopAndDetach();
    this.currentAnchor = anchor;
    this.currentDataUrl = config.dataUrl;
    this.emitState('loading');

    const sound = new THREE.PositionalAudio(listener);
    sound.setDirectionalCone(360, 360, 1);
    const panner = sound.getOutput();
    if (panner && 'panningModel' in panner) {
      panner.panningModel = 'HRTF';
    }
    this.applyParams(sound, config);
    anchor.add(sound);
    this.positionalAudio = sound;

    const cached = this.sharedBufferCache.get(config.dataUrl);
    if (cached) {
      this.beatTrack = getOrAnalyzeBeatTrack(cached);
      sound.setBuffer(cached);
      this.startPlaybackIfReady(sound);
      return;
    }

    const seq = ++this.loadSeq;
    let arrayBuf: ArrayBuffer;
    try {
      arrayBuf = dataUrlToArrayBuffer(config.dataUrl);
    } catch {
      this.emitState('error');
      return;
    }

    void listener.context
      .decodeAudioData(arrayBuf)
      .then((audioBuffer) => {
        if (this.disposed || seq !== this.loadSeq || this.positionalAudio !== sound) {
          return;
        }
        this.sharedBufferCache.set(config.dataUrl, audioBuffer);
        this.beatTrack = getOrAnalyzeBeatTrack(audioBuffer);
        sound.setBuffer(audioBuffer);
        this.startPlaybackIfReady(sound);
      })
      .catch(() => {
        if (!this.disposed && seq === this.loadSeq) {
          this.emitState('error');
        }
      });
  }

  public sampleMusicSync(dt: number): MusicSyncMetrics {
    if (
      this.disposed ||
      !this.positionalAudio ||
      !this.currentConfig ||
      !this.beatTrack ||
      !this.positionalAudio.isPlaying ||
      this.playStartCtxTime === null
    ) {
      return INACTIVE_MUSIC_METRICS;
    }

    const rawElapsed = Math.max(
      0,
      this.positionalAudio.context.currentTime - this.playStartCtxTime,
    );
    const track = this.beatTrack;
    const posSec = this.currentConfig.loop
      ? rawElapsed % track.duration
      : Math.min(rawElapsed, track.duration);

    if (!this.currentConfig.loop && rawElapsed >= track.duration) {
      return INACTIVE_MUSIC_METRICS;
    }

    const exactIdx = posSec * track.fps;
    const i0 = Math.min(track.frameCount - 1, Math.floor(exactIdx));
    const i1 = Math.min(track.frameCount - 1, i0 + 1);
    const frac = exactIdx - i0;

    const targetLevel =
      track.level[i0] + (track.level[i1] - track.level[i0]) * frac;
    const targetBass =
      track.bass[i0] + (track.bass[i1] - track.bass[i0]) * frac;
    const targetTreble =
      track.treble[i0] + (track.treble[i1] - track.treble[i0]) * frac;
    const targetBeat =
      track.beat[i0] + (track.beat[i1] - track.beat[i0]) * frac;

    const smoothAlpha = Math.min(1, dt * 24);
    this.smoothLevel += (targetLevel - this.smoothLevel) * smoothAlpha;
    this.smoothBass += (targetBass - this.smoothBass) * smoothAlpha;
    this.smoothTreble += (targetTreble - this.smoothTreble) * smoothAlpha;
    this.smoothBeat += (targetBeat - this.smoothBeat) * Math.min(1, dt * 36);

    this.beatPhase +=
      dt * (0.45 + this.smoothLevel * 1.35 + this.smoothBeat * 2.1);

    return {
      active: true,
      level: this.smoothLevel,
      bass: this.smoothBass,
      treble: this.smoothTreble,
      beat: this.smoothBeat,
      beatPhase: this.beatPhase,
    };
  }

  /**
   * Computes smooth distance-based gain cutoff so distant players' aura songs
   * fade cleanly to true 0.0 beyond maxDistance while preserving HRTF panning
   * and inverse-distance falloff inside audible range.
   */
  public updateDistanceAttenuation(
    originWorldPos: THREE.Vector3,
    keepLocalFull = false,
  ): void {
    if (
      this.disposed ||
      !this.currentConfig ||
      !this.currentAnchor ||
      !this.positionalAudio
    ) {
      return;
    }

    if (keepLocalFull) {
      this.distanceFactor = 1;
    } else {
      this.currentAnchor.getWorldPosition(_anchorWorldPos);
      const dist = originWorldPos.distanceTo(_anchorWorldPos);
      const maxDist = Math.max(
        this.currentConfig.refDistance + 1,
        this.currentConfig.maxDistance,
      );
      const fadeStart = maxDist * 0.72;

      if (dist >= maxDist) {
        this.distanceFactor = 0;
      } else if (dist <= fadeStart) {
        this.distanceFactor = 1;
      } else {
        const t = (dist - fadeStart) / Math.max(0.001, maxDist - fadeStart);
        // Smoothstep fade to 0 at maxDistance
        this.distanceFactor = 1 - t * t * (3 - 2 * t);
      }
    }

    this.applyEffectiveVolume();

    const canAutoStart = this.currentConfig.loop || !this.hasStartedCurrentTrack;
    if (
      !this.muted &&
      this.distanceFactor > 0.01 &&
      this.positionalAudio.buffer &&
      !this.positionalAudio.isPlaying &&
      canAutoStart
    ) {
      if (this.positionalAudio.context.state === 'running') {
        try {
          this.positionalAudio.play();
          this.playStartCtxTime = this.positionalAudio.context.currentTime;
          this.hasStartedCurrentTrack = true;
          this.emitState('playing');
        } catch {
          // Ignore
        }
      } else {
        this.bindUnlockListeners();
        this.emitState('suspended');
      }
    } else if (
      !this.positionalAudio.isPlaying &&
      this.hasStartedCurrentTrack &&
      !this.currentConfig.loop &&
      this.audioState === 'playing'
    ) {
      this.emitState('none');
    }
  }

  private applyEffectiveVolume() {
    if (!this.positionalAudio || !this.currentConfig) return;
    const baseVol = toPerceptualGain(this.currentConfig.volume);
    const finalVol = this.muted ? 0 : baseVol * this.distanceFactor;
    this.positionalAudio.setVolume(finalVol);
  }

  private applyParams(sound: THREE.PositionalAudio, config: AuraAudioConfig) {
    sound.setDistanceModel('inverse');
    sound.setRefDistance(Math.max(0.5, config.refDistance));
    sound.setMaxDistance(Math.max(config.refDistance + 1, config.maxDistance));
    sound.setRolloffFactor(Math.max(0.1, config.rolloffFactor));
    sound.setLoop(config.loop);
    if (this.lastLoopSetting === false && config.loop === true) {
      this.hasStartedCurrentTrack = false;
    }
    this.lastLoopSetting = config.loop;
    this.applyEffectiveVolume();
  }

  private startPlaybackIfReady(sound: THREE.PositionalAudio) {
    if (this.disposed || !sound.buffer) return;
    const ctx = sound.context;
    if (ctx.state === 'suspended') {
      this.bindUnlockListeners();
      this.emitState(this.muted ? 'muted' : 'suspended');
      void ctx
        .resume()
        .then(() => {
          if (!this.disposed && this.positionalAudio === sound) {
            this.tryPlayIfReady();
          }
        })
        .catch(() => {});
    } else {
      this.tryPlayIfReady();
    }
  }

  public stopAndDetach() {
    this.loadSeq++;
    this.unbindUnlockListeners();
    this.playStartCtxTime = null;
    this.hasStartedCurrentTrack = false;
    this.lastLoopSetting = null;
    this.beatTrack = null;
    this.smoothLevel = 0;
    this.smoothBass = 0;
    this.smoothTreble = 0;
    this.smoothBeat = 0;
    if (this.positionalAudio) {
      try {
        if (this.positionalAudio.isPlaying) {
          this.positionalAudio.stop();
        }
        this.positionalAudio.disconnect();
      } catch {
        // ignore
      }
      this.positionalAudio.parent?.remove(this.positionalAudio);
      this.positionalAudio = null;
    }
    this.currentAnchor = null;
  }

  public dispose() {
    this.disposed = true;
    this.stopAndDetach();
    if (this.ownsBufferCache) {
      this.sharedBufferCache.clear();
    }
    if (this.ownsListener && this.listener) {
      this.camera.remove(this.listener);
      this.listener.context.close().catch(() => {});
      this.listener = null;
    }
  }
}
