import type { AuraCutsceneConfig, CutsceneAudioPreset } from '../aura/types';

function createNoiseBuffer(ctx: AudioContext, seconds = 2.0): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class CutsceneAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeStopCallbacks: Array<() => void> = [];
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private muted = false;
  private currentVolume = 0.9;

  private ensureContext(): { ctx: AudioContext; master: GainNode } | null {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.22, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.currentVolume,
        this.ctx.currentTime,
      );
      compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    // Return the compressor node? Store master + return input node:
    // Actually masterGain is output; let's route through a fresh reverb/bus per play.
    return { ctx: this.ctx, master: this.masterGain! };
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : this.currentVolume,
        this.ctx.currentTime,
        0.02,
      );
    }
    if (this.activeHtmlAudio) {
      this.activeHtmlAudio.muted = muted;
    }
  }

  public stop() {
    for (const cb of this.activeStopCallbacks) {
      try {
        cb();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeStopCallbacks = [];

    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.currentTime = 0;
      } catch {
        // Ignore
      }
      this.activeHtmlAudio = null;
    }
  }

  public play(cutscene: AuraCutsceneConfig, muted = false, startOffsetSec = 0) {
    this.stop();
    this.muted = muted;
    this.currentVolume = Math.max(0, Math.min(1, cutscene.audioVolume ?? 0.9));

    if (cutscene.customAudio?.dataUrl) {
      this.playCustomAudio(cutscene.customAudio.dataUrl, cutscene.customAudio.volume, startOffsetSec);
    }

    if (cutscene.audioPreset === 'none') return;

    const audio = this.ensureContext();
    if (!audio) return;
    const { ctx, master } = audio;
    master.gain.setValueAtTime(
      this.muted ? 0 : this.currentVolume,
      ctx.currentTime,
    );

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.85, ctx.currentTime);

    // Lush stereo-style feedback delay atmosphere
    const delayL = ctx.createDelay(1.0);
    const delayR = ctx.createDelay(1.0);
    delayL.delayTime.setValueAtTime(0.19, ctx.currentTime);
    delayR.delayTime.setValueAtTime(0.27, ctx.currentTime);
    const fb = ctx.createGain();
    fb.gain.setValueAtTime(0.36, ctx.currentTime);
    const wetFilter = ctx.createBiquadFilter();
    wetFilter.type = 'lowpass';
    wetFilter.frequency.setValueAtTime(3400, ctx.currentTime);
    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(
      cutscene.tier === 'legendary_mythic' ? 0.42 : 0.25,
      ctx.currentTime,
    );

    bus.connect(master);
    bus.connect(delayL);
    delayL.connect(delayR);
    delayR.connect(wetFilter);
    wetFilter.connect(fb);
    fb.connect(delayL);
    wetFilter.connect(wetGain);
    wetGain.connect(master);

    this.activeStopCallbacks.push(() => {
      bus.disconnect();
      wetGain.disconnect();
    });

    const total = Math.max(1.2, cutscene.duration);
    const impactRatio = cutscene.tier === 'epic' ? 0.4 : 0.48;
    const impactTime = total * impactRatio;
    const remaining = Math.max(0.4, total - startOffsetSec);
    const now = ctx.currentTime;

    this.schedulePreset(
      ctx,
      bus,
      cutscene.audioPreset,
      cutscene.tier === 'legendary_mythic',
      now - startOffsetSec,
      now,
      impactTime,
      total,
      now + remaining + 0.8,
    );
  }

  private playCustomAudio(dataUrl: string, vol: number, startOffsetSec: number) {
    try {
      const audioEl = new Audio(dataUrl);
      audioEl.volume = Math.max(0, Math.min(1, vol));
      audioEl.muted = this.muted;
      if (startOffsetSec > 0) {
        audioEl.currentTime = startOffsetSec;
      }
      this.activeHtmlAudio = audioEl;
      void audioEl.play().catch(() => {});
    } catch {
      // Ignore playback error
    }
  }

  private trackOsc(osc: OscillatorNode, stopAt: number) {
    this.activeStopCallbacks.push(() => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore
      }
    });
    osc.stop(Math.max(osc.context.currentTime + 0.05, stopAt));
  }

  private trackBuf(src: AudioBufferSourceNode, stopAt: number) {
    this.activeStopCallbacks.push(() => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore
      }
    });
    src.stop(Math.max(src.context.currentTime + 0.05, stopAt));
  }

  private schedulePreset(
    ctx: AudioContext,
    bus: GainNode,
    preset: CutsceneAudioPreset,
    isMythic: boolean,
    t0: number,
    now: number,
    impactRel: number,
    totalDur: number,
    hardEnd: number,
  ) {
    const impactAt = t0 + impactRel;
    const noiseBuf = createNoiseBuffer(ctx, 2.5);

    // 1. Buildup riser + accelerating tension ticks (when starting before impact)
    if (impactAt > now + 0.1) {
      const startAt = Math.max(now, t0);
      const silenceGap = isMythic ? 0.14 : 0.05;
      const riserEnd = Math.max(startAt + 0.08, impactAt - silenceGap);

      // Rising atmospheric sweep
      const riserOsc = ctx.createOscillator();
      const riserOsc2 = ctx.createOscillator();
      const riserFilter = ctx.createBiquadFilter();
      const riserGain = ctx.createGain();

      riserOsc.type = preset === 'infernal_brass' || preset === 'hyper_glitch' ? 'sawtooth' : 'triangle';
      riserOsc2.type = 'sine';

      const baseHz = preset === 'cosmic_sub_drop' ? 42 : preset === 'void_shatter' ? 52 : 68;
      const topHz = preset === 'hyper_glitch' ? 920 : isMythic ? 440 : 280;

      riserOsc.frequency.setValueAtTime(baseHz, startAt);
      riserOsc.frequency.exponentialRampToValueAtTime(topHz, riserEnd);
      riserOsc2.frequency.setValueAtTime(baseHz * 2, startAt);
      riserOsc2.frequency.exponentialRampToValueAtTime(topHz * 1.5, riserEnd);

      riserFilter.type = 'bandpass';
      riserFilter.Q.setValueAtTime(2.6, startAt);
      riserFilter.frequency.setValueAtTime(180, startAt);
      riserFilter.frequency.exponentialRampToValueAtTime(3600, riserEnd);

      riserGain.gain.setValueAtTime(0.001, startAt);
      riserGain.gain.exponentialRampToValueAtTime(isMythic ? 0.34 : 0.24, riserEnd - 0.04);
      riserGain.gain.linearRampToValueAtTime(0.0001, riserEnd);

      riserOsc.connect(riserFilter);
      riserOsc2.connect(riserFilter);
      riserFilter.connect(riserGain);
      riserGain.connect(bus);
      riserOsc.start(startAt);
      riserOsc2.start(startAt);
      this.trackOsc(riserOsc, riserEnd + 0.05);
      this.trackOsc(riserOsc2, riserEnd + 0.05);

      // Filtered white-noise whoosh into climax
      const whoosh = ctx.createBufferSource();
      whoosh.buffer = noiseBuf;
      whoosh.loop = true;
      const wFilter = ctx.createBiquadFilter();
      wFilter.type = 'bandpass';
      wFilter.Q.setValueAtTime(1.8, startAt);
      wFilter.frequency.setValueAtTime(240, startAt);
      wFilter.frequency.exponentialRampToValueAtTime(4800, riserEnd);
      const wGain = ctx.createGain();
      wGain.gain.setValueAtTime(0.001, startAt);
      wGain.gain.exponentialRampToValueAtTime(0.28, riserEnd - 0.03);
      wGain.gain.linearRampToValueAtTime(0.0001, riserEnd);
      whoosh.connect(wFilter);
      wFilter.connect(wGain);
      wGain.connect(bus);
      whoosh.start(startAt);
      this.trackBuf(whoosh, riserEnd + 0.05);

      // Accelerating tension pulses / glitches
      const pulseCount = isMythic ? 11 : 5;
      for (let i = 0; i < pulseCount; i++) {
        const u = i / pulseCount;
        // Ease-in spacing so ticks speed up dramatically right before climax
        const tickTime = t0 + Math.pow(u, 0.72) * (impactRel - silenceGap - 0.08);
        if (tickTime < now) continue;

        const pOsc = ctx.createOscillator();
        const pGain = ctx.createGain();
        if (preset === 'hyper_glitch') {
          pOsc.type = 'square';
          const arp = [330, 440, 554.37, 659.25, 880, 1108.73];
          pOsc.frequency.setValueAtTime(arp[i % arp.length] * (1 + u * 0.45), tickTime);
        } else if (preset === 'void_shatter') {
          pOsc.type = 'sine';
          pOsc.frequency.setValueAtTime(160 + u * 480, tickTime);
          pOsc.frequency.exponentialRampToValueAtTime(55, tickTime + 0.07);
        } else {
          pOsc.type = 'triangle';
          pOsc.frequency.setValueAtTime(220 + u * 620, tickTime);
        }

        pGain.gain.setValueAtTime(0.001, tickTime);
        pGain.gain.linearRampToValueAtTime(0.14 + u * 0.14, tickTime + 0.006);
        pGain.gain.exponentialRampToValueAtTime(0.0001, tickTime + 0.09);
        pOsc.connect(pGain);
        pGain.connect(bus);
        pOsc.start(tickTime);
        this.trackOsc(pOsc, tickTime + 0.11);
      }
    }

    // 2. Massive Impact / Drop at climax
    const dropAt = Math.max(now, impactAt);
    if (impactAt >= now - 0.35) {
      // Earth-shaking sub-bass boom
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(isMythic ? 155 : 130, dropAt);
      subOsc.frequency.exponentialRampToValueAtTime(32, dropAt + (isMythic ? 1.5 : 0.75));
      subGain.gain.setValueAtTime(0.001, dropAt);
      subGain.gain.linearRampToValueAtTime(isMythic ? 0.92 : 0.68, dropAt + 0.012);
      subGain.gain.exponentialRampToValueAtTime(0.0001, dropAt + (isMythic ? 1.9 : 0.95));
      subOsc.connect(subGain);
      subGain.connect(bus);
      subOsc.start(dropAt);
      this.trackOsc(subOsc, dropAt + 2.0);

      // Explosive transient crack / shatter burst
      const burst = ctx.createBufferSource();
      burst.buffer = noiseBuf;
      const bFilter = ctx.createBiquadFilter();
      bFilter.type = preset === 'void_shatter' ? 'highpass' : 'lowpass';
      bFilter.frequency.setValueAtTime(preset === 'void_shatter' ? 1400 : 4200, dropAt);
      if (preset !== 'void_shatter') {
        bFilter.frequency.exponentialRampToValueAtTime(220, dropAt + 0.9);
      }
      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(isMythic ? 0.65 : 0.4, dropAt);
      bGain.gain.exponentialRampToValueAtTime(0.0001, dropAt + (isMythic ? 1.1 : 0.55));
      burst.connect(bFilter);
      bFilter.connect(bGain);
      bGain.connect(bus);
      burst.start(dropAt);
      this.trackBuf(burst, dropAt + 1.2);

      // Preset-specific signature climax & reveal chords
      const chordEnd = Math.min(hardEnd, t0 + totalDur + 0.55);
      const chordNotes = this.getPresetChord(preset);

      chordNotes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const detuneOsc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        if (preset === 'infernal_brass') {
          osc.type = 'sawtooth';
          detuneOsc.type = 'sawtooth';
        } else if (preset === 'hyper_glitch') {
          osc.type = idx % 2 === 0 ? 'square' : 'sawtooth';
          detuneOsc.type = 'triangle';
        } else if (preset === 'celestial_choir' || preset === 'epic_chime') {
          osc.type = 'triangle';
          detuneOsc.type = 'sine';
        } else {
          osc.type = idx === 0 ? 'sawtooth' : 'triangle';
          detuneOsc.type = 'sine';
        }

        osc.frequency.setValueAtTime(freq, dropAt);
        detuneOsc.frequency.setValueAtTime(freq * 1.007, dropAt);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(preset === 'infernal_brass' ? 2800 : 4400, dropAt);
        filter.frequency.exponentialRampToValueAtTime(950, chordEnd);

        const voicePeak = (isMythic ? 0.16 : 0.13) / Math.sqrt(chordNotes.length);
        gain.gain.setValueAtTime(0.0001, dropAt);
        gain.gain.linearRampToValueAtTime(voicePeak, dropAt + 0.045 + idx * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, chordEnd);

        osc.connect(filter);
        detuneOsc.connect(filter);
        filter.connect(gain);
        gain.connect(bus);

        osc.start(dropAt);
        detuneOsc.start(dropAt);
        this.trackOsc(osc, chordEnd + 0.05);
        this.trackOsc(detuneOsc, chordEnd + 0.05);
      });

      // Shimmering crystal chime / bell arpeggio right after drop
      const chimeFreqs =
        preset === 'void_shatter'
          ? [1318.5, 1760, 2093, 2489, 3135.9]
          : [1046.5, 1318.5, 1567.98, 2093, 2637.02];
      const chimeCount = isMythic ? 5 : 3;
      for (let i = 0; i < chimeCount; i++) {
        const cTime = dropAt + i * (preset === 'void_shatter' ? 0.055 : 0.09);
        const cOsc = ctx.createOscillator();
        const cGain = ctx.createGain();
        cOsc.type = 'sine';
        cOsc.frequency.setValueAtTime(chimeFreqs[i % chimeFreqs.length], cTime);
        cGain.gain.setValueAtTime(0.0001, cTime);
        cGain.gain.linearRampToValueAtTime(isMythic ? 0.16 : 0.14, cTime + 0.008);
        cGain.gain.exponentialRampToValueAtTime(0.0001, cTime + 1.1);
        cOsc.connect(cGain);
        cGain.connect(bus);
        cOsc.start(cTime);
        this.trackOsc(cOsc, cTime + 1.15);
      }
    }
  }

  private getPresetChord(preset: CutsceneAudioPreset): number[] {
    switch (preset) {
      case 'cosmic_sub_drop':
        return [65.41, 130.81, 196.0, 246.94, 329.63]; // Cmaj9 wide space chord
      case 'void_shatter':
        return [55.0, 110.0, 164.81, 196.0, 261.63]; // Dark Am7
      case 'celestial_choir':
        return [146.83, 220.0, 277.18, 329.63, 440.0, 659.25]; // Radiant Dmaj9
      case 'infernal_brass':
        return [58.27, 116.54, 174.61, 207.65, 293.66]; // Heavy Bbm power brass
      case 'hyper_glitch':
        return [130.81, 261.63, 392.0, 493.88, 587.33]; // Energetic cyber maj9
      case 'epic_chime':
      default:
        return [261.63, 329.63, 392.0, 523.25]; // Bright C major triad + octave
    }
  }

  public dispose() {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
  }
}
