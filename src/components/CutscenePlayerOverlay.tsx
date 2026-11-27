import { FastForward, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AuraProject } from '../aura/types';
import { CutsceneAudioEngine } from '../engine/cutsceneAudio';
import { renderCutsceneFrame } from '../engine/cutsceneRenderer';

interface CutscenePlayerOverlayProps {
  aura: AuraProject;
  initialMuted?: boolean;
  onComplete: () => void;
}

export function CutscenePlayerOverlay({
  aura,
  initialMuted = false,
  onComplete,
}: CutscenePlayerOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<CutsceneAudioEngine | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [muted, setMuted] = useState(initialMuted);

  const cutscene = aura.cutscene;

  useEffect(() => {
    if (!cutscene) {
      onCompleteRef.current();
      return;
    }

    const audio = new CutsceneAudioEngine();
    audioRef.current = audio;
    audio.play(cutscene, muted);

    const startMs = performance.now();
    const durationMs = Math.max(1000, cutscene.duration * 1000);
    let rafId = 0;
    let finished = false;

    const renderLoop = (nowMs: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rectW = Math.max(1, canvas.clientWidth);
        const rectH = Math.max(1, canvas.clientHeight);
        if (canvas.width !== Math.round(rectW * dpr) || canvas.height !== Math.round(rectH * dpr)) {
          canvas.width = Math.round(rectW * dpr);
          canvas.height = Math.round(rectH * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          const progress = Math.min(1, (nowMs - startMs) / durationMs);
          renderCutsceneFrame(ctx, rectW, rectH, cutscene, aura, progress, nowMs / 1000);
          ctx.restore();
        }
      }

      if (nowMs - startMs >= durationMs) {
        if (!finished) {
          finished = true;
          onCompleteRef.current();
        }
        return;
      }

      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafId);
      audio.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aura.id]);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const handleSkip = () => {
    audioRef.current?.stop();
    onCompleteRef.current();
  };

  if (!cutscene) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black flex items-center justify-center select-none">
      <canvas ref={canvasRef} className="w-full h-full block" />

      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          title={muted ? 'Unmute Cutscene Audio' : 'Mute Cutscene Audio'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black/65 hover:bg-black/85 border border-white/15 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
        >
          {muted ? (
            <VolumeX className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
          )}
          <span className="whitespace-nowrap">{muted ? 'Muted' : 'Audio'}</span>
        </button>

        <button
          type="button"
          onClick={handleSkip}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
        >
          <FastForward className="w-3.5 h-3.5" />
          <span>Skip Cutscene</span>
        </button>
      </div>
    </div>
  );
}
