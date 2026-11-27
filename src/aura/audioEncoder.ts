import { Mp3Encoder } from '@breezystack/lamejs';
import type { AuraAudioConfig, CutsceneCustomAudio } from './types';

// Keep safely under Firestore's 1 MiB document cap & 920,000-char validator limit
const MAX_RAW_AURA_BYTES = 660 * 1024;
const TARGET_AURA_MP3_BYTES = 620 * 1024;
const MAX_DATAURL_CHARS = 916_000;

const MAX_RAW_CUTSCENE_BYTES = 240 * 1024;
const TARGET_CUTSCENE_MP3_BYTES = 230 * 1024;
const MAX_CUTSCENE_DATAURL_CHARS = 345_000;

function inferAudioMime(file: File): string {
  if (file.type && file.type.startsWith('audio/')) {
    return file.type.split(';')[0].trim();
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'flac':
      return 'audio/flac';
    case 'webm':
      return 'audio/webm';
    default:
      return 'audio/mpeg';
  }
}

function readBlobAsAudioDataUrl(blob: Blob, forcedMime?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const commaIdx = raw.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('Failed to encode audio file.'));
        return;
      }
      const b64 = raw.slice(commaIdx + 1);
      if (forcedMime && !raw.startsWith('data:audio/')) {
        resolve(`data:${forcedMime};base64,${b64}`);
      } else {
        // Strip any ";codecs=..." suffix so dataUrl strictly matches validator regex
        const header = raw.slice(0, commaIdx);
        const cleanMime = header.replace(/^data:([^;]+).*$/, '$1');
        resolve(`data:${cleanMime};base64,${b64}`);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read audio file.'));
    reader.readAsDataURL(blob);
  });
}

interface Mp3Profile {
  sampleRate: number;
  kbps: number;
}

const MP3_PROFILES: Mp3Profile[] = [
  { sampleRate: 44100, kbps: 128 },
  { sampleRate: 44100, kbps: 96 },
  { sampleRate: 44100, kbps: 64 },
  { sampleRate: 44100, kbps: 48 },
  { sampleRate: 22050, kbps: 32 },
  { sampleRate: 22050, kbps: 24 },
  { sampleRate: 22050, kbps: 16 },
  { sampleRate: 11025, kbps: 8 },
];

function selectMp3Profile(durationSec: number, targetBytes: number): Mp3Profile {
  const safeDuration = Math.max(0.5, durationSec);
  const maxKbps = (targetBytes * 8) / safeDuration / 1000;
  for (const profile of MP3_PROFILES) {
    if (profile.kbps <= maxKbps) {
      return profile;
    }
  }
  return MP3_PROFILES[MP3_PROFILES.length - 1];
}

function encodeSamplesToMp3Blob(
  floatSamples: Float32Array,
  sampleRate: number,
  kbps: number,
): Blob {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const pcm = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < pcm.length; i += blockSize) {
    const slice = pcm.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(slice);
    if (mp3buf.length > 0) {
      chunks.push(new Uint8Array(mp3buf));
    }
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) {
    chunks.push(new Uint8Array(flushed));
  }
  const blobParts: BlobPart[] = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  return new Blob(blobParts, { type: 'audio/mpeg' });
}

export function formatAudioDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
}

function formatDurationLabel(seconds: number): string {
  return formatAudioDuration(seconds);
}

/**
 * Inspects a WAV data URL header synchronously to detect legacy ~26s 12kHz mono
 * clips produced before full-song MP3 compression was added.
 */
export function isLikelyLegacyTruncatedAudio(
  audio: Pick<AuraAudioConfig, 'mimeType' | 'dataUrl'> | undefined,
): boolean {
  if (!audio?.dataUrl) return false;
  if (audio.mimeType !== 'audio/wav' && !audio.dataUrl.startsWith('data:audio/wav;')) {
    return false;
  }
  if (audio.dataUrl.length < 450_000) return false;
  try {
    const commaIdx = audio.dataUrl.indexOf(',');
    if (commaIdx < 0) return false;
    // First 60 base64 chars decode to 45 bytes (covers the 44-byte RIFF/WAVE header)
    const headB64 = audio.dataUrl.slice(commaIdx + 1, commaIdx + 61);
    const bin = window.atob(headB64);
    if (bin.length < 44) return false;
    const view = new DataView(
      Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer,
    );
    const sampleRate = view.getUint32(24, true);
    const byteRate = view.getUint32(28, true);
    const dataSize = view.getUint32(40, true);
    const duration = byteRate > 0 ? dataSize / byteRate : 0;
    return sampleRate <= 16000 && duration >= 18 && duration <= 34;
  } catch {
    return audio.dataUrl.length >= 700_000;
  }
}

export function measureAudioDurationSec(dataUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (!dataUrl || typeof Audio === 'undefined') {
      resolve(null);
      return;
    }
    const el = new Audio();
    let settled = false;
    const finish = (val: number | null) => {
      if (settled) return;
      settled = true;
      el.removeAttribute('src');
      el.load();
      resolve(val);
    };
    const timer = window.setTimeout(() => finish(null), 4000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    el.src = dataUrl;
  });
}

async function encodeFullAudioToMp3DataUrl(
  decoded: AudioBuffer,
  targetBytes: number,
  maxDataUrlChars: number,
): Promise<{ dataUrl: string; profile: Mp3Profile; encodedDuration: number }> {
  const initialProfile = selectMp3Profile(decoded.duration, targetBytes);
  const startIdx = Math.max(0, MP3_PROFILES.indexOf(initialProfile));

  for (let idx = startIdx; idx < MP3_PROFILES.length; idx++) {
    const profile = MP3_PROFILES[idx];
    const maxSecAtProfile = (targetBytes * 8) / (profile.kbps * 1000);
    const renderDuration =
      idx === MP3_PROFILES.length - 1
        ? Math.min(decoded.duration, maxSecAtProfile)
        : decoded.duration;

    const frameCount = Math.max(1, Math.floor(renderDuration * profile.sampleRate));
    const offline = new OfflineAudioContext(1, frameCount, profile.sampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0, 0, renderDuration);

    const rendered = await offline.startRendering();
    const channelData = rendered.getChannelData(0);

    // Subtle 20ms micro-fade at edges to avoid click on track start/end without altering song
    const fadeSamples = Math.min(
      Math.floor(profile.sampleRate * 0.02),
      Math.floor(channelData.length / 8),
    );
    for (let i = 0; i < fadeSamples; i++) {
      const gain = i / fadeSamples;
      channelData[i] *= gain;
      channelData[channelData.length - 1 - i] *= gain;
    }

    const mp3Blob = encodeSamplesToMp3Blob(channelData, profile.sampleRate, profile.kbps);
    const dataUrl = await readBlobAsAudioDataUrl(mp3Blob, 'audio/mpeg');
    if (dataUrl.length <= maxDataUrlChars || idx === MP3_PROFILES.length - 1) {
      return {
        dataUrl:
          dataUrl.length <= maxDataUrlChars
            ? dataUrl
            : dataUrl.slice(0, maxDataUrlChars),
        profile,
        encodedDuration: renderDuration,
      };
    }
  }

  throw new Error('Could not encode audio file within cloud size limits.');
}

/**
 * Encodes an uploaded audio file into a safe base64 AuraAudioConfig
 * preserving the entire song end-to-end while staying under Firestore's 1 MiB cap.
 */
export async function encodeAudioFileForAura(
  file: File,
  existing?: Partial<AuraAudioConfig>,
): Promise<{ audio: AuraAudioConfig; optimizedNote?: string }> {
  const isAudio =
    file.type.startsWith('audio/') ||
    file.type === 'video/webm' ||
    /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name);
  if (!isAudio) {
    throw new Error('Please choose an audio file (.mp3, .wav, .ogg, .m4a, .webm).');
  }

  const baseDefaults = {
    volume: existing?.volume ?? 0.75,
    loop: existing?.loop ?? true,
    refDistance: existing?.refDistance ?? 6,
    maxDistance: existing?.maxDistance ?? 42,
    rolloffFactor: existing?.rolloffFactor ?? 1.4,
  };

  if (file.size <= MAX_RAW_AURA_BYTES) {
    const mime = inferAudioMime(file);
    const dataUrl = await readBlobAsAudioDataUrl(file, mime);
    if (
      /^data:audio\/[a-zA-Z0-9.+_-]+;base64,/.test(dataUrl) &&
      dataUrl.length <= MAX_DATAURL_CHARS
    ) {
      return {
        audio: {
          fileName: file.name.slice(0, 96),
          mimeType: mime,
          dataUrl,
          ...baseDefaults,
        },
      };
    }
  }

  // Larger files: compress the ENTIRE song to MP3 so it plays end-to-end across all devices
  const arrayBuf = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    const { dataUrl, profile, encodedDuration } = await encodeFullAudioToMp3DataUrl(
      decoded,
      TARGET_AURA_MP3_BYTES,
      MAX_DATAURL_CHARS,
    );

    const usedWholeSong = encodedDuration >= decoded.duration - 0.5;
    const durLabel = formatDurationLabel(encodedDuration);

    return {
      audio: {
        fileName: file.name.slice(0, 96),
        mimeType: 'audio/mpeg',
        dataUrl,
        ...baseDefaults,
      },
      optimizedNote: usedWholeSong
        ? `Encoded full song "${file.name}" (${durLabel}, ${profile.kbps}kbps MP3) for cross-device sync.`
        : `Encoded "${file.name}" (${durLabel}, ${profile.kbps}kbps MP3) to fit cloud sync limit.`,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function encodeCutsceneAudioFile(
  file: File,
  existingVolume = 0.85,
): Promise<{ customAudio: CutsceneCustomAudio; optimizedNote?: string }> {
  const isAudio =
    file.type.startsWith('audio/') ||
    file.type === 'video/webm' ||
    /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name);
  if (!isAudio) {
    throw new Error('Please choose an audio file (.mp3, .wav, .ogg, .m4a, .webm).');
  }

  if (file.size <= MAX_RAW_CUTSCENE_BYTES) {
    const mime = inferAudioMime(file);
    const dataUrl = await readBlobAsAudioDataUrl(file, mime);
    if (
      /^data:audio\/[a-zA-Z0-9.+_-]+;base64,/.test(dataUrl) &&
      dataUrl.length <= MAX_CUTSCENE_DATAURL_CHARS
    ) {
      return {
        customAudio: {
          fileName: file.name.slice(0, 96),
          mimeType: mime,
          dataUrl,
          volume: existingVolume,
        },
      };
    }
  }

  const arrayBuf = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    const { dataUrl, profile, encodedDuration } = await encodeFullAudioToMp3DataUrl(
      decoded,
      TARGET_CUTSCENE_MP3_BYTES,
      MAX_CUTSCENE_DATAURL_CHARS,
    );

    return {
      customAudio: {
        fileName: file.name.slice(0, 96),
        mimeType: 'audio/mpeg',
        dataUrl,
        volume: existingVolume,
      },
      optimizedNote: `Encoded cutscene SFX "${file.name}" (${formatDurationLabel(encodedDuration)}, ${profile.kbps}kbps MP3).`,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}
