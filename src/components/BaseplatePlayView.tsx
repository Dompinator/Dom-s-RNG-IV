import {
  Archive,
  Check,
  Database,
  Dices,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import type { AuraProject } from '../aura/types';
import { BaseplateWorldEngine } from '../engine/BaseplateWorldEngine';
import {
  rollAuraFromCatalog,
  type CatalogAuraEntry,
  type StoredAuraEntry,
} from '../game/gameRegistry';

interface BaseplatePlayViewProps {
  catalog: CatalogAuraEntry[];
  storage: StoredAuraEntry[];
  equippedAuraId: string | null;
  totalRolls: number;
  onOpenStorage: () => void;
  onOpenRegistry: () => void;
  onRecordRoll: (rolledProject: AuraProject) => void;
  onEquipAura: (auraId: string | null) => void;
}

export function BaseplatePlayView({
  catalog,
  storage,
  equippedAuraId,
  totalRolls,
  onOpenStorage,
  onOpenRegistry,
  onRecordRoll,
  onEquipAura,
}: BaseplatePlayViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BaseplateWorldEngine | null>(null);

  const [isRolling, setIsRolling] = useState(false);
  const [autoRoll, setAutoRoll] = useState(false);
  const [previewRollName, setPreviewRollName] = useState<string>('');
  const [rolledReveal, setRolledReveal] = useState<AuraProject | null>(null);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.project.id, c.project])),
    [catalog],
  );

  const equippedAura = useMemo(
    () => (equippedAuraId ? catalogMap.get(equippedAuraId) ?? null : null),
    [equippedAuraId, catalogMap],
  );

  const enabledPool = useMemo(
    () => catalog.filter((c) => c.enabled),
    [catalog],
  );

  // Mount Baseplate 3D World Engine once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new BaseplateWorldEngine(container);
    engineRef.current = engine;
    engine.setEquippedAura(equippedAura);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync live equipped aura onto walking R6 character
  useEffect(() => {
    engineRef.current?.setEquippedAura(equippedAura);
  }, [equippedAura]);

  const performRoll = () => {
    if (isRolling || enabledPool.length === 0) return;

    setIsRolling(true);
    setRolledReveal(null);

    let tickCount = 0;
    const intervalId = window.setInterval(() => {
      tickCount++;
      const sample = enabledPool[Math.floor(Math.random() * enabledPool.length)];
      setPreviewRollName(sample.project.name);

      if (tickCount >= 9) {
        window.clearInterval(intervalId);
        const winner = rollAuraFromCatalog(catalog);
        setIsRolling(false);
        if (winner) {
          onRecordRoll(winner.project);
          setRolledReveal(winner.project);
        }
      }
    }, 75);
  };

  // Auto-roll loop when toggled on
  useEffect(() => {
    if (!autoRoll || isRolling) return;
    const timer = window.setTimeout(() => {
      performRoll();
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRoll, isRolling, rolledReveal]);

  const uniqueOwned = storage.length;
  const totalOwned = storage.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="relative flex-1 w-full h-full bg-[#090c14] overflow-hidden select-none">
      {/* Isolated Baseplate 3D WebGL Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Player Status HUD */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto bg-[#0f131d]/92 border border-white/[0.09] rounded-lg px-3.5 py-2.5 min-w-[230px]">
          <div className="text-[11px] text-slate-400">Equipped Aura</div>
          {equippedAura ? (
            <div className="mt-0.5">
              <div className="text-sm font-semibold text-white">
                {equippedAura.name}
              </div>
              <div className="flex items-center gap-1.5 text-xs mt-0.5">
                <span
                  className={`font-semibold ${
                    RARITY_COLOR_STYLES[equippedAura.rarity.classification].text
                  }`}
                >
                  {equippedAura.rarity.classification}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono-num text-slate-400">
                  {formatOdds(equippedAura.rarity.baseOdds)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm font-medium text-slate-400 mt-0.5">
              None (Roll &amp; Equip!)
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-white/[0.07] flex items-center gap-3 text-[11px] text-slate-400 font-mono-num">
            <span>Rolls: {totalRolls.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>
              Storage: {uniqueOwned} ({totalOwned})
            </span>
          </div>
        </div>

        {/* Side Menu Buttons: Storage & Registry */}
        <div className="pointer-events-auto flex flex-col gap-1.5 w-48">
          <button
            type="button"
            onClick={onOpenStorage}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0f131d]/92 hover:bg-[#171d2c] border border-white/[0.09] text-xs font-medium text-slate-100 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-400" />
              <span>Storage / Equip</span>
            </span>
            <span className="font-mono-num text-[11px] text-slate-400">
              {uniqueOwned}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenRegistry}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0f131d]/92 hover:bg-[#171d2c] border border-white/[0.09] text-xs font-medium text-slate-100 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-400" />
              <span>Roll Pool Manager</span>
            </span>
            <span className="font-mono-num text-[11px] text-slate-400">
              {enabledPool.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => engineRef.current?.resetSpawn()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0f131d]/85 hover:bg-[#171d2c] border border-white/[0.07] text-[11px] font-medium text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Respawn at Pad</span>
          </button>
        </div>
      </div>

      {/* Top-Right Controls Help */}
      <div className="hidden md:flex absolute top-4 right-4 z-10 items-center gap-2.5 bg-[#0f131d]/90 border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-slate-400">
        <span>WASD / Arrows: Walk</span>
        <span aria-hidden="true">·</span>
        <span>Shift: Sprint</span>
        <span aria-hidden="true">·</span>
        <span>Space: Jump</span>
        <span aria-hidden="true">·</span>
        <span>Drag: Orbit</span>
      </div>

      {/* Roll Result Reveal Card */}
      {rolledReveal && !isRolling && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-[340px] max-w-[92vw] bg-[#10141f]/95 border border-white/[0.14] rounded-xl p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] text-slate-400">Rolled Aura</div>
              <h3 className="font-display text-lg font-bold text-white leading-tight mt-0.5">
                {rolledReveal.name}
              </h3>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span
                  className={`font-semibold ${
                    RARITY_COLOR_STYLES[rolledReveal.rarity.classification].text
                  }`}
                >
                  {rolledReveal.rarity.classification}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono-num text-slate-300">
                  {formatOdds(rolledReveal.rarity.baseOdds)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRolledReveal(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/[0.06] cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onEquipAura(rolledReveal.id);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                equippedAuraId === rolledReveal.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {equippedAuraId === rolledReveal.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Equipped</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Equip Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Rolling Tension Indicator */}
      {isRolling && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 px-5 py-2.5 rounded-lg bg-[#10141f]/95 border border-amber-500/40 text-center shadow-2xl min-w-[240px]">
          <div className="text-[11px] text-amber-400 font-medium">Rolling...</div>
          <div className="font-display text-base font-semibold text-white mt-0.5 truncate">
            {previewRollName || '...'}
          </div>
        </div>
      )}

      {/* Empty Roll Pool Helper */}
      {enabledPool.length === 0 && (
        <div className="absolute bottom-22 left-1/2 -translate-x-1/2 z-10 bg-[#10141f]/95 border border-white/[0.12] rounded-lg px-4 py-2.5 text-center max-w-[90vw]">
          <div className="text-xs text-slate-300">
            No rollable auras in the Roll Pool yet.
          </div>
            <button
              type="button"
              onClick={onOpenRegistry}
              className="mt-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Open Roll Pool Manager
            </button>
        </div>
      )}

      {/* Bottom Center ROLL Action Bar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5">
        <button
          type="button"
          onClick={performRoll}
          disabled={isRolling || enabledPool.length === 0}
          className="flex items-center gap-2.5 px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-slate-950 font-display text-base font-bold tracking-wide shadow-2xl transition-all cursor-pointer"
        >
          <Dices className="w-5 h-5" />
          <span>{isRolling ? 'ROLLING...' : 'ROLL'}</span>
        </button>

        <button
          type="button"
          onClick={() => setAutoRoll((a) => !a)}
          className={`px-3.5 py-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
            autoRoll
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              : 'bg-[#0f131d]/95 border-white/[0.1] text-slate-300 hover:bg-[#171d2c]'
          }`}
        >
          {autoRoll ? 'Auto: ON' : 'Auto: OFF'}
        </button>
      </div>

      {/* Touch / On-screen Walk Pad for mobile/tablet */}
      <div className="md:hidden absolute bottom-20 left-4 z-10 grid grid-cols-3 gap-1 w-28">
        <div />
        <button
          type="button"
          onPointerDown={() => engineRef.current?.setTouchMove(0, 1)}
          onPointerUp={() => engineRef.current?.setTouchMove(0, 0)}
          onPointerLeave={() => engineRef.current?.setTouchMove(0, 0)}
          className="h-9 rounded bg-[#0f131d]/90 border border-white/15 text-xs text-white"
        >
          W
        </button>
        <div />
        <button
          type="button"
          onPointerDown={() => engineRef.current?.setTouchMove(-1, 0)}
          onPointerUp={() => engineRef.current?.setTouchMove(0, 0)}
          onPointerLeave={() => engineRef.current?.setTouchMove(0, 0)}
          className="h-9 rounded bg-[#0f131d]/90 border border-white/15 text-xs text-white"
        >
          A
        </button>
        <button
          type="button"
          onPointerDown={() => engineRef.current?.setTouchMove(0, -1)}
          onPointerUp={() => engineRef.current?.setTouchMove(0, 0)}
          onPointerLeave={() => engineRef.current?.setTouchMove(0, 0)}
          className="h-9 rounded bg-[#0f131d]/90 border border-white/15 text-xs text-white"
        >
          S
        </button>
        <button
          type="button"
          onPointerDown={() => engineRef.current?.setTouchMove(1, 0)}
          onPointerUp={() => engineRef.current?.setTouchMove(0, 0)}
          onPointerLeave={() => engineRef.current?.setTouchMove(0, 0)}
          className="h-9 rounded bg-[#0f131d]/90 border border-white/15 text-xs text-white"
        >
          D
        </button>
      </div>
      <button
        type="button"
        onClick={() => engineRef.current?.triggerJump()}
        className="md:hidden absolute bottom-20 right-4 z-10 px-4 py-2.5 rounded-lg bg-[#0f131d]/90 border border-white/15 text-xs font-semibold text-white"
      >
        Jump
      </button>
    </div>
  );
}
