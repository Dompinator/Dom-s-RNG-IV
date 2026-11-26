import * as THREE from 'three';
import type { AuraAudioConfig } from '../aura/types';

export type SpatialAudioState =
  | 'none'
  | 'loading'
  | 'suspended'
  | 'playing'
  | 'muted'
  | 'error';

export interface SpatialAudioOptions {
  listener?: THREE.AudioListener;
  bufferCache?: Map<string, AudioBuffer>;
  onStateChange?: (state: SpatialAudioState) => void;
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
    if (!sound.isPlaying && !this.muted && this.distanceFactor > 0.001) {
      try {
        sound.play();
      } catch {
        // Ignore transient WebAudio error
      }
    }
    this.emitState(this.muted ? 'muted' : sound.isPlaying ? 'playing' : 'suspended');
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
        sound.setBuffer(audioBuffer);
        this.startPlaybackIfReady(sound);
      })
      .catch(() => {
        if (!this.disposed && seq === this.loadSeq) {
          this.emitState('error');
        }
      });
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

    if (
      !this.muted &&
      this.distanceFactor > 0.01 &&
      this.positionalAudio.buffer &&
      !this.positionalAudio.isPlaying
    ) {
      if (this.positionalAudio.context.state === 'running') {
        try {
          this.positionalAudio.play();
          this.emitState('playing');
        } catch {
          // Ignore
        }
      } else {
        this.bindUnlockListeners();
        this.emitState('suspended');
      }
    }
  }

  private applyEffectiveVolume() {
    if (!this.positionalAudio || !this.currentConfig) return;
    const baseVol = Math.max(0, Math.min(1, this.currentConfig.volume));
    const finalVol = this.muted ? 0 : baseVol * this.distanceFactor;
    this.positionalAudio.setVolume(finalVol);
  }

  private applyParams(sound: THREE.PositionalAudio, config: AuraAudioConfig) {
    sound.setDistanceModel('inverse');
    sound.setRefDistance(Math.max(0.5, config.refDistance));
    sound.setMaxDistance(Math.max(config.refDistance + 1, config.maxDistance));
    sound.setRolloffFactor(Math.max(0.1, config.rolloffFactor));
    sound.setLoop(config.loop);
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
