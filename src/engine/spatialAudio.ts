import * as THREE from 'three';
import type { AuraAudioConfig } from '../aura/types';

export interface SpatialAudioOptions {
  listener?: THREE.AudioListener;
  bufferCache?: Map<string, AudioBuffer>;
}

const _anchorWorldPos = new THREE.Vector3();

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
  private positionalAudio: THREE.PositionalAudio | null = null;
  private currentAnchor: THREE.Object3D | null = null;
  private currentDataUrl: string | null = null;
  private currentConfig: AuraAudioConfig | null = null;
  private loadSeq = 0;
  private muted = false;
  private distanceFactor = 1;
  private disposed = false;

  constructor(camera: THREE.Camera, options?: SpatialAudioOptions) {
    this.camera = camera;
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

  private ensureListener(): THREE.AudioListener {
    if (!this.listener) {
      this.listener = new THREE.AudioListener();
      this.camera.add(this.listener);
      this.ownsListener = true;
    }
    return this.listener;
  }

  public async resumeContext(): Promise<void> {
    if (!this.listener) return;
    const ctx = this.listener.context;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore until user gesture
      }
    }
    if (
      this.positionalAudio &&
      this.positionalAudio.buffer &&
      !this.positionalAudio.isPlaying &&
      !this.muted &&
      this.distanceFactor > 0.001 &&
      this.currentConfig
    ) {
      try {
        this.positionalAudio.play();
      } catch {
        // Ignore
      }
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.positionalAudio && this.currentConfig) {
      this.applyEffectiveVolume();
      if (!muted) {
        void this.resumeContext();
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
      if (!this.positionalAudio.isPlaying && this.positionalAudio.buffer) {
        void this.resumeContext();
      }
      return;
    }

    this.stopAndDetach();
    this.currentAnchor = anchor;
    this.currentDataUrl = config.dataUrl;

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
    void fetch(config.dataUrl)
      .then((res) => res.arrayBuffer())
      .then((buf) => listener.context.decodeAudioData(buf))
      .then((audioBuffer) => {
        if (this.disposed || seq !== this.loadSeq || this.positionalAudio !== sound) {
          return;
        }
        this.sharedBufferCache.set(config.dataUrl, audioBuffer);
        sound.setBuffer(audioBuffer);
        this.startPlaybackIfReady(sound);
      })
      .catch(() => {
        // Ignore corrupt/cancelled decode
      });
  }

  /**
   * Computes smooth distance-based gain cutoff so distant players' aura songs
   * fade cleanly to true 0.0 beyond maxDistance while preserving HRTF panning
   * and inverse-distance falloff inside audible range.
   */
  public updateDistanceAttenuation(listenerWorldPos: THREE.Vector3): void {
    if (this.disposed || !this.currentConfig || !this.currentAnchor || !this.positionalAudio) {
      return;
    }

    this.currentAnchor.getWorldPosition(_anchorWorldPos);
    const dist = listenerWorldPos.distanceTo(_anchorWorldPos);
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

    this.applyEffectiveVolume();

    // Resume playback if player walked into hearing range while audio context is running
    if (
      !this.muted &&
      this.distanceFactor > 0.01 &&
      this.positionalAudio.buffer &&
      !this.positionalAudio.isPlaying &&
      this.positionalAudio.context.state === 'running'
    ) {
      try {
        this.positionalAudio.play();
      } catch {
        // Ignore
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
      void ctx
        .resume()
        .then(() => {
          if (!this.disposed && this.positionalAudio === sound && !sound.isPlaying) {
            sound.play();
          }
        })
        .catch(() => {});
    } else if (!sound.isPlaying) {
      sound.play();
    }
  }

  public stopAndDetach() {
    this.loadSeq++;
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
