import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  Dices,
  Film,
  LogIn,
  LogOut,
  Music,
  RotateCcw,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import type { AuraProject } from '../aura/types';
import { BaseplateWorldEngine } from '../engine/BaseplateWorldEngine';
import type { SpatialAudioState } from '../engine/spatialAudio';
import { CutscenePlayerOverlay } from './CutscenePlayerOverlay';
import type { User } from '../firebase';
import {
  rollAuraFromCatalog,
  type CatalogAuraEntry,
  type StoredAuraEntry,
} from '../game/gameRegistry';
import {
  getOrCreateSessionId,
  publishPlayerState,
  removePlayerPresence,
  subscribeToServerPlayers,
  type LocalPlayerTransform,
  type RemotePlayerState,
} from '../game/multiplayerSync';

interface BaseplatePlayViewProps {
  catalog: CatalogAuraEntry[];
  storage: StoredAuraEntry[];
  equippedAuraId: string | null;
  totalRolls: number;
  isAdmin: boolean;
  authUser: User | null;
  accountUsername: string;
  onOpenAuth: () => void;
  onSignOut: () => void;
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
  isAdmin,
  authUser,
  accountUsername,
  onOpenAuth,
  onSignOut,
  onOpenStorage,
  onOpenRegistry,
  onRecordRoll,
  onEquipAura,
}: BaseplatePlayViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BaseplateWorldEngine | null>(null);

  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const displayName = accountUsername.trim().slice(0, 24) || 'Player';
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;

  const [isRolling, setIsRolling] = useState(false);
  const [autoRoll, setAutoRoll] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioState, setAudioState] = useState<SpatialAudioState>('none');
  const [previewRollName, setPreviewRollName] = useState<string>('');
  const [rolledReveal, setRolledReveal] = useState<AuraProject | null>(null);
  const [activeCutsceneAura, setActiveCutsceneAura] = useState<AuraProject | null>(null);

  const [remotePlayers, setRemotePlayers] = useState<RemotePlayerState[]>([]);
  const [audibleIds, setAudibleIds] = useState<Set<string>>(() => new Set());
  const [playersPanelOpen, setPlayersPanelOpen] = useState(true);
  const [localPosSnapshot, setLocalPosSnapshot] = useState<{ x: number; y: number; z: number }>({
    x: 0,
    y: 0,
    z: 0,
  });

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

    const engine = new BaseplateWorldEngine(container, {
      onAudioStateChange: (s) => setAudioState(s),
    });
    engineRef.current = engine;
    engine.setCatalog(catalog);
    engine.setEquippedAura(equippedAura);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep Roll Pool catalog synced inside 3D engine for remote players' equipped auras
  useEffect(() => {
    engineRef.current?.setCatalog(catalog);
  }, [catalog]);

  // Sync live equipped aura onto walking R6 character
  useEffect(() => {
    engineRef.current?.setEquippedAura(equippedAura);
  }, [equippedAura]);

  useEffect(() => {
    engineRef.current?.setAudioMuted(audioMuted);
  }, [audioMuted]);

  // Real-time shared server player subscription (works for everyone, including spectators)
  useEffect(() => {
    const sub = subscribeToServerPlayers(sessionId, (players) => {
      setRemotePlayers(players);
      engineRef.current?.setRemotePlayers(players);
    });

    const pruneInterval = window.setInterval(() => {
      const fresh = sub.getFreshRemotePlayers();
      setRemotePlayers(fresh);
      engineRef.current?.setRemotePlayers(fresh);
      if (engineRef.current) {
        setAudibleIds(new Set(engineRef.current.getAudibleRemoteSessionIds()));
        const snap = engineRef.current.getLocalPlayerSnapshot();
        setLocalPosSnapshot({ x: snap.x, y: snap.y, z: snap.z });
      }
    }, 1000);

    return () => {
      window.clearInterval(pruneInterval);
      sub.unsubscribe();
    };
  }, [sessionId]);

  // Publish verified player's live movement, pose, & equipped aura to Firestore shared server
  useEffect(() => {
    if (!authUser || !authUser.emailVerified) return;

    const ownerUid = authUser.uid;
    let disposed = false;
    let inFlight = false;
    let lastSent: (LocalPlayerTransform & { displayName: string; at: number }) | null = null;

    const sendSnapshot = (force = false) => {
      if (disposed || inFlight) return;
      const engine = engineRef.current;
      if (!engine) return;

      const snap = engine.getLocalPlayerSnapshot();
      const name = displayNameRef.current;
      const now = Date.now();

      if (!force && lastSent) {
        const moved = Math.hypot(
          snap.x - lastSent.x,
          snap.y - lastSent.y,
          snap.z - lastSent.z,
        );
        const yawDiff = Math.abs(snap.yaw - lastSent.yaw);
        const changed =
          moved > 0.06 ||
          yawDiff > 0.05 ||
          snap.pose !== lastSent.pose ||
          snap.equippedAuraId !== lastSent.equippedAuraId ||
          name !== lastSent.displayName;
        const heartbeatDue = now - lastSent.at >= 12_000;
        if (!changed && !heartbeatDue) return;
      }

      inFlight = true;
      lastSent = { ...snap, displayName: name, at: now };
      void publishPlayerState(sessionId, ownerUid, name, snap)
        .catch(() => {
          // Handled via Firestore error logger
        })
        .finally(() => {
          inFlight = false;
        });
    };

    // Initial spawn publish
    sendSnapshot(true);

    const syncInterval = window.setInterval(() => {
      sendSnapshot(false);
    }, 120);

    const onPageHide = () => {
      void removePlayerPresence(sessionId);
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    return () => {
      disposed = true;
      window.clearInterval(syncInterval);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      void removePlayerPresence(sessionId);
    };
  }, [authUser, sessionId]);

  const performRoll = () => {
    if (isRolling || activeCutsceneAura || enabledPool.length === 0) return;

    engineRef.current?.unlockAudio();
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
          if (winner.project.cutscene?.enabled) {
            setActiveCutsceneAura(winner.project);
          } else {
            setRolledReveal(winner.project);
          }
        }
      }
    }, 75);
  };

  // Auto-roll loop when toggled on (paused while rolling or cutscene is playing)
  useEffect(() => {
    if (!autoRoll || isRolling || activeCutsceneAura) return;
    const timer = window.setTimeout(() => {
      performRoll();
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRoll, isRolling, activeCutsceneAura, rolledReveal]);

  const uniqueOwned = storage.length;
  const totalOwned = storage.reduce((sum, s) => sum + s.count, 0);
  const isJoinedServer = Boolean(authUser && authUser.emailVerified);
  const onlineCount = remotePlayers.length + (isJoinedServer ? 1 : 0);

  return (
    <div className="relative flex-1 w-full h-full bg-[#090c14] overflow-hidden select-none">
      {/* Isolated Baseplate 3D WebGL Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Player Status HUD */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto bg-[#0f131d]/92 border border-white/[0.09] rounded-lg px-3.5 py-2.5 min-w-[235px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">Equipped Aura</span>
            <div className="flex items-center gap-1">
              {audioState === 'suspended' && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.unlockAudio()}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-[10px] font-semibold text-slate-950 cursor-pointer"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Enable Audio</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (audioState === 'suspended') {
                    engineRef.current?.unlockAudio();
                    return;
                  }
                  setAudioMuted((m) => !m);
                }}
                title={audioMuted ? 'Unmute Spatial Aura Audio' : 'Mute Spatial Aura Audio'}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] text-slate-200 cursor-pointer"
              >
                {audioMuted ? (
                  <>
                    <VolumeX className="w-3 h-3 text-slate-400" />
                    <span>Muted</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3 h-3 text-sky-400" />
                    <span>{audioState === 'error' ? 'Error' : 'Audio'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
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
              {equippedAura.audio && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-sky-300 truncate">
                  <Music className="w-3 h-3 shrink-0" />
                  <span className="truncate">{equippedAura.audio.fileName}</span>
                </div>
              )}
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
              <span>{isAdmin ? 'Roll Pool Manager' : 'Roll Pool'}</span>
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

      {/* Top-Right Controls Help & Live Multiplayer Server Panel */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-none">
        <div className="hidden md:flex items-center gap-2.5 bg-[#0f131d]/90 border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-slate-400">
          <span>WASD / Arrows: Walk</span>
          <span aria-hidden="true">·</span>
          <span>Shift: Sprint</span>
          <span aria-hidden="true">·</span>
          <span>Space: Jump</span>
          <span aria-hidden="true">·</span>
          <span>Drag: Orbit</span>
        </div>

        <div className="pointer-events-auto w-64 max-w-[82vw] bg-[#0f131d]/92 border border-white/[0.09] rounded-lg overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => setPlayersPanelOpen((o) => !o)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-100 hover:bg-white/[0.04] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>Shared Server</span>
              <span className="font-mono-num text-[11px] text-slate-400">
                ({onlineCount})
              </span>
            </span>
            {playersPanelOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {playersPanelOpen && (
            <div className="px-3 pb-2.5 pt-1 border-t border-white/[0.07] space-y-2">
              {isJoinedServer ? (
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    title="Edit account display username"
                    className="flex-1 min-w-0 text-left bg-black/40 hover:bg-black/60 border border-white/[0.1] rounded px-2 py-1 text-[11px] text-slate-100 truncate cursor-pointer"
                  >
                    {displayName}
                  </button>
                  <button
                    type="button"
                    onClick={onSignOut}
                    title="Sign Out"
                    className="p-1.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
              ) : authUser && !authUser.emailVerified ? (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-semibold text-amber-200 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Verify Email to Join</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-[11px] font-semibold text-sky-200 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log In / Sign Up to Join</span>
                </button>
              )}

              <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
                {isJoinedServer && (
                  <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white/[0.05] text-[11px]">
                    <span className="truncate font-medium text-white">
                      {displayName}{' '}
                      <span className="text-slate-400 font-normal">(You)</span>
                    </span>
                    <span className="truncate max-w-[96px] text-[10px] text-amber-300">
                      {equippedAura ? equippedAura.name : 'No Aura'}
                    </span>
                  </div>
                )}

                {remotePlayers.length === 0 ? (
                  <div className="text-[11px] text-slate-500 py-1 text-center">
                    {isJoinedServer
                      ? 'Waiting for other players...'
                      : 'No other players online right now.'}
                  </div>
                ) : (
                  remotePlayers.map((p) => {
                    const pAura = p.equippedAuraId
                      ? catalogMap.get(p.equippedAuraId) ?? null
                      : null;
                    const dist = Math.round(
                      Math.hypot(
                        p.x - localPosSnapshot.x,
                        p.y - localPosSnapshot.y,
                        p.z - localPosSnapshot.z,
                      ),
                    );
                    const inAudioRange = audibleIds.has(p.sessionId);

                    return (
                      <div
                        key={p.sessionId}
                        className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white/[0.03] text-[11px]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 text-slate-100 font-medium truncate">
                            <span className="truncate">{p.displayName}</span>
                            {inAudioRange && (
                              <span
                                title="Hearing this player's spatial aura audio"
                                className="text-sky-400 shrink-0"
                              >
                                ♪
                              </span>
                            )}
                          </div>
                          {pAura && (
                            <div
                              className={`text-[10px] truncate ${
                                RARITY_COLOR_STYLES[pAura.rarity.classification].text
                              }`}
                            >
                              {pAura.name}
                            </div>
                          )}
                        </div>
                        <span className="font-mono-num text-[10px] text-slate-500 shrink-0">
                          {dist}m
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
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
            {rolledReveal.cutscene?.enabled && (
              <button
                type="button"
                onClick={() => setActiveCutsceneAura(rolledReveal)}
                title="Replay Cutscene"
                className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-medium text-slate-100 transition-colors cursor-pointer"
              >
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span>Cutscene</span>
              </button>
            )}
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
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenRegistry}
              className="mt-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Open Roll Pool Manager
            </button>
          )}
        </div>
      )}

      {/* Bottom Center ROLL Action Bar */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5">
        <button
          type="button"
          onClick={performRoll}
          disabled={isRolling || Boolean(activeCutsceneAura) || enabledPool.length === 0}
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

      {activeCutsceneAura && (
        <CutscenePlayerOverlay
          aura={activeCutsceneAura}
          initialMuted={audioMuted}
          onComplete={() => {
            setRolledReveal(activeCutsceneAura);
            setActiveCutsceneAura(null);
          }}
        />
      )}
    </div>
  );
}
