import { X } from 'lucide-react';
import { formatOdds } from '../aura/rarity';

export const DISABLE_CUTSCENE_ODDS = 1_000_000_000_000_000;

export interface RollSettings {
  quickRoll: boolean;
  minKeepOdds: number;
  minCutsceneOdds: number;
}

interface RollSettingsModalProps {
  open: boolean;
  settings: RollSettings;
  onChange: (next: RollSettings) => void;
  onClose: () => void;
}

const KEEP_PRESETS = [
  { label: 'Keep All', odds: 1 },
  { label: '1 in 1K', odds: 1_000 },
  { label: '1 in 50K', odds: 50_000 },
  { label: '1 in 1M', odds: 1_000_000 },
  { label: '1 in 10M', odds: 10_000_000 },
  { label: '1 in 100M', odds: 100_000_000 },
];

const CUTSCENE_PRESETS = [
  { label: 'All Cutscenes', odds: 1 },
  { label: '1 in 50K', odds: 50_000 },
  { label: '1 in 1M', odds: 1_000_000 },
  { label: '1 in 10M', odds: 10_000_000 },
  { label: '1 in 100M', odds: 100_000_000 },
  { label: 'Never Play', odds: DISABLE_CUTSCENE_ODDS },
];

export function formatThresholdLabel(odds: number): string {
  if (odds >= DISABLE_CUTSCENE_ODDS) return 'Off (Never)';
  if (odds <= 1) return 'All (1 in 1)';
  return formatOdds(odds);
}

export function RollSettingsModal({
  open,
  settings,
  onChange,
  onClose,
}: RollSettingsModalProps) {
  if (!open) return null;

  const cutscenesDisabled = settings.minCutsceneOdds >= DISABLE_CUTSCENE_ODDS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roll-settings-title"
        className="w-full max-w-md bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h2
              id="roll-settings-title"
              className="font-display text-base font-semibold text-white"
            >
              Roll Settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Set rarity cutoffs for keeping rolled auras and playing cutscenes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Roll Settings"
            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Minimum Keep */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="min-keep-input"
                className="text-xs font-semibold text-slate-100"
              >
                Minimum Keep
              </label>
              <span className="text-xs font-mono-num text-amber-300">
                {formatThresholdLabel(settings.minKeepOdds)}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Auras rarer than or equal to this go to Storage. Anything lower is automatically skipped.
            </p>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">1 in</span>
              <input
                id="min-keep-input"
                type="number"
                min={1}
                max={1_000_000_000_000}
                value={settings.minKeepOdds}
                onChange={(e) => {
                  const val = Math.max(
                    1,
                    Math.min(1_000_000_000_000, Math.round(Number(e.target.value) || 1)),
                  );
                  onChange({ ...settings, minKeepOdds: val });
                }}
                className="flex-1 bg-[#0b0e16] border border-white/[0.1] focus:border-amber-500/70 rounded-lg px-3 py-2 text-xs font-mono-num text-white outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {KEEP_PRESETS.map((preset) => {
                const active = settings.minKeepOdds === preset.odds;
                return (
                  <button
                    key={preset.odds}
                    type="button"
                    onClick={() => onChange({ ...settings, minKeepOdds: preset.odds })}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-amber-500/20 border-amber-400/55 text-amber-200'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-slate-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </section>

          <hr className="border-white/[0.07]" />

          {/* Minimum Cutscene */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="min-cutscene-input"
                className="text-xs font-semibold text-slate-100"
              >
                Minimum Cutscene
              </label>
              <span className="text-xs font-mono-num text-sky-300">
                {formatThresholdLabel(settings.minCutsceneOdds)}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cutscenes only play for auras at or above this rarity. Lower auras skip the cutscene and reveal directly.
            </p>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">1 in</span>
              <input
                id="min-cutscene-input"
                type="number"
                min={1}
                max={1_000_000_000_000}
                disabled={cutscenesDisabled}
                value={cutscenesDisabled ? '' : settings.minCutsceneOdds}
                placeholder={cutscenesDisabled ? 'Off (Never Play)' : '1'}
                onChange={(e) => {
                  const val = Math.max(
                    1,
                    Math.min(1_000_000_000_000, Math.round(Number(e.target.value) || 1)),
                  );
                  onChange({ ...settings, minCutsceneOdds: val });
                }}
                className="flex-1 bg-[#0b0e16] border border-white/[0.1] focus:border-sky-500/70 disabled:opacity-50 rounded-lg px-3 py-2 text-xs font-mono-num text-white outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CUTSCENE_PRESETS.map((preset) => {
                const active = settings.minCutsceneOdds === preset.odds;
                return (
                  <button
                    key={preset.odds}
                    type="button"
                    onClick={() =>
                      onChange({ ...settings, minCutsceneOdds: preset.odds })
                    }
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-sky-500/20 border-sky-400/55 text-sky-200'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-slate-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="px-5 py-3.5 border-t border-white/[0.08] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
