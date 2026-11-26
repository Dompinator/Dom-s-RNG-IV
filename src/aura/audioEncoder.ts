import type { AuraAudioConfig } from './types';

const MAX_RAW_BYTES = 640 * 1024;
const TARGET_WAV_BYTES = 620 * 1024;

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

function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Encodes an uploaded audio file into a safe base64 AuraAudioConfig
 * that stays under Firestore's 1 MiB document cap so all users hear it across devices.
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

  if (file.size <= MAX_RAW_BYTES) {
    const mime = inferAudioMime(file);
    const dataUrl = await readBlobAsAudioDataUrl(file, mime);
    if (!/^data:audio\/[a-zA-Z0-9.+_-]+;base64,/.test(dataUrl)) {
      throw new Error('Unsupported audio encoding format.');
    }
    return {
      audio: {
        fileName: file.name.slice(0, 96),
        mimeType: mime,
        dataUrl,
        ...baseDefaults,
      },
    };
  }

  // Large files: decode and downsample cleanly into a compact cloud-syncable loop
  const arrayBuf = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    const targetSampleRate = decoded.duration > 20 ? 12000 : 16000;
    const maxSamples = Math.floor((TARGET_WAV_BYTES - 44) / 2);
    const maxDuration = maxSamples / targetSampleRate;
    const renderDuration = Math.min(decoded.duration, maxDuration);
    const frameCount = Math.max(1, Math.floor(renderDuration * targetSampleRate));

    const offline = new OfflineAudioContext(1, frameCount, targetSampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0, 0, renderDuration);

    const rendered = await offline.startRendering();
    const channelData = rendered.getChannelData(0);

    // Smooth fade-in and fade-out tail so looped audio doesn't click
    const fadeSamples = Math.min(
      Math.floor(targetSampleRate * 0.25),
      Math.floor(channelData.length / 6),
    );
    for (let i = 0; i < fadeSamples; i++) {
      const gain = i / fadeSamples;
      channelData[i] *= gain;
      channelData[channelData.length - 1 - i] *= gain;
    }

    const wavBlob = encodeMonoWav(channelData, targetSampleRate);
    const dataUrl = await readBlobAsAudioDataUrl(wavBlob, 'audio/wav');

    return {
      audio: {
        fileName: file.name.slice(0, 96),
        mimeType: 'audio/wav',
        dataUrl,
        ...baseDefaults,
      },
      optimizedNote: `Compressed "${file.name}" to a ${renderDuration.toFixed(1)}s loop so it syncs across all devices.`,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}
