import * as THREE from 'three';
import type { AuraAudioConfig } from '../aura/types';

/**
 * Spatial 3D audio controller attached directly to an aura's 3D world anchor.
 * Sound emanates from the character's aura position in 3D space (HRTF panning +
 * distance attenuation) so nearby players and orbiting cameras hear it coming
 * physically from the aura.
 */
export class SpatialAuraAudioController {
  private camera: THREE.Camera;
  private listener: THREE.AudioListener | null = null;
  private positionalAudio: THREE.PositionalAudio | null = null;
  private currentAnchor: THREE.Object3D | null = null;
  private currentDataUrl: string | null = null;
  private currentConfig: AuraAudioConfig | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private loadSeq = 0;
  private muted = false;
  private disposed = false;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  private ensureListener(): THREE.AudioListener {
    if (!this.listener) {
      this.listener = new THREE.AudioListener();
      this.camera.add(this.listener);
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
      this.positionalAudio.setVolume(muted ? 0 : this.currentConfig.volume);
      if (!muted) {
        void this.resumeContext();
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
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

    const cached = this.bufferCache.get(config.dataUrl);
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
        this.bufferCache.set(config.dataUrl, audioBuffer);
        sound.setBuffer(audioBuffer);
        this.startPlaybackIfReady(sound);
      })
      .catch(() => {
        // Ignore corrupt/cancelled decode
      });
  }

  private applyParams(sound: THREE.PositionalAudio, config: AuraAudioConfig) {
    sound.setDistanceModel('inverse');
    sound.setRefDistance(Math.max(0.5, config.refDistance));
    sound.setMaxDistance(Math.max(config.refDistance + 1, config.maxDistance));
    sound.setRolloffFactor(Math.max(0.1, config.rolloffFactor));
    sound.setLoop(config.loop);
    sound.setVolume(this.muted ? 0 : Math.max(0, Math.min(1, config.volume)));
  }

  private startPlaybackIfReady(sound: THREE.PositionalAudio) {
    if (this.disposed || !sound.buffer) return;
    const ctx = sound.context;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (!this.disposed && this.positionalAudio === sound && !sound.isPlaying) {
          sound.play();
        }
      }).catch(() => {});
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
    this.bufferCache.clear();
    if (this.listener) {
      this.camera.remove(this.listener);
      this.listener.context.close().catch(() => {});
      this.listener = null;
    }
  }
}
