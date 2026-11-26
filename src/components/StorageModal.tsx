import { Check, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import type { RarityTier } from '../aura/types';
import type { CatalogAuraEntry, StoredAuraEntry } from '../game/gameRegistry';

interface StorageModalProps {
  open: boolean;
  catalog: CatalogAuraEntry[];
  storage: StoredAuraEntry[];
  equippedAuraId: string | null;
  onClose: () => void;
  onEquip: (auraId: string | null) => void;
  onDiscard: (auraId: string) => void;
}

const FILTER_TIERS: ('All' | RarityTier)[] = [
  'All',
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
  'Mythic',
];

export function StorageModal({
  open,
  catalog,
  storage,
  equippedAuraId,
  onClose,
  onEquip,
  onDiscard,
}: StorageModalProps) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | RarityTier>('All');

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.project.id, c.project])),
    [catalog],
  );

  const resolvedItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return storage
      .map((entry) => {
        const proj = catalogMap.get(entry.auraId);
        return proj ? { entry, project: proj } : null;
      })
      .filter((x): x is { entry: StoredAuraEntry; project: NonNullable<ReturnType<typeof catalogMap.get>> } => Boolean(x))
      .filter(({ project }) => {
        if (tierFilter !== 'All' && project.rarity.classification !== tierFilter) {
          return false;
        }
        if (q && !project.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.project.rarity.baseOdds - a.project.rarity.baseOdds);
  }, [storage, catalogMap, search, tierFilter]);

  if (!open) return null;

  const equippedProject = equippedAuraId ? catalogMap.get(equippedAuraId) ?? null : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[84vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Aura Storage
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Equip any unlocked aura onto your R6 character on the baseplate.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Currently Equipped Bar */}
        <div className="px-5 py-3 bg-[#141925] border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400">Currently Equipped</div>
            {equippedProject ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-semibold text-white truncate">
                  {equippedProject.name}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span
                  className={`text-xs font-semibold ${
                    RARITY_COLOR_STYLES[equippedProject.rarity.classification].text
                  }`}
                >
                  {equippedProject.rarity.classification}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-xs font-mono-num text-slate-400">
                  {formatOdds(equippedProject.rarity.baseOdds)}
                </span>
              </div>
            ) : (
              <div className="text-sm text-slate-500 mt-0.5">No aura equipped</div>
            )}
          </div>
          {equippedProject && (
            <button
              type="button"
              onClick={() => onEquip(null)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Unequip
            </button>
          )}
        </div>

        {/* Search & Filter */}
        <div className="px-5 py-3 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stored auras..."
              className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md pl-8 pr-3 py-1.5 text-xs text-white outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-black/30 p-1 rounded-lg">
            {FILTER_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  tierFilter === tier
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        {/* Storage Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {resolvedItems.length === 0 ? (
            <div className="border border-dashed border-white/[0.1] rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-slate-300">
                {storage.length === 0
                  ? 'Your Aura Storage is empty'
                  : 'No stored auras match your filter'}
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                Press the ROLL button on the baseplate to roll auras into your storage.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {resolvedItems.map(({ entry, project }) => {
                const isEquipped = project.id === equippedAuraId;
                const style = RARITY_COLOR_STYLES[project.rarity.classification];
                const primaryColor = project.layers[0]?.color ?? '#f59e0b';
                const secondaryColor = project.layers[0]?.secondaryColor ?? '#38bdf8';

                return (
                  <div
                    key={project.id}
                    className={`p-3.5 rounded-lg border transition-colors flex flex-col justify-between gap-3 ${
                      isEquipped
                        ? 'bg-[#181f2e] border-amber-500/60'
                        : 'bg-[#141924] border-white/[0.07]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
                            style={{
                              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                            }}
                          />
                          <h3 className="text-sm font-semibold text-white truncate">
                            {project.name}
                          </h3>
                        </div>
                        <span className="text-xs font-mono-num text-slate-400 shrink-0">
                          ×{entry.count}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs mt-1.5 pl-5">
                        <span className={`font-semibold ${style.text}`}>
                          {project.rarity.classification}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="font-mono-num text-slate-400">
                          {formatOdds(project.rarity.baseOdds)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 mt-2 pl-5 line-clamp-2">
                        {project.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => onEquip(isEquipped ? null : project.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                          isEquipped
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        }`}
                      >
                        {isEquipped && <Check className="w-3.5 h-3.5" />}
                        <span>{isEquipped ? 'Equipped' : 'Equip'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDiscard(project.id)}
                        title="Remove from Storage"
                        className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-white/[0.07] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
