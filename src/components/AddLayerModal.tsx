import { Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import { EFFECT_CATALOG, type EffectType } from '../aura/types';
import { isExtraType, LAYER_VARIANTS } from '../aura/variants';

interface AddLayerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: EffectType, variant?: string) => void;
}

const FILTERS = [
  { id: 'all', label: 'All Layers' },
  { id: 'new', label: 'New Types' },
  { id: 'classic', label: 'Original Types' },
] as const;

export function AddLayerModal({
  open,
  onClose,
  onSelectType,
}: AddLayerModalProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  if (!open) return null;

  const needle = query.trim().toLowerCase();
  const items = EFFECT_CATALOG.flatMap((item) => {
    if (filter !== 'all' && isExtraType(item.type) !== (filter === 'new')) return [];
    const variants = LAYER_VARIANTS[item.type];
    const typeMatches = `${item.label} ${item.shortDesc}`.toLowerCase().includes(needle);
    const shown = typeMatches ? variants : variants.filter((v) => v.label.toLowerCase().includes(needle));
    return shown.length ? [{ item, variants: shown }] : [];
  });
  const styleCount = Object.values(LAYER_VARIANTS).reduce((n, list) => n + list.length, 0);

  const pick = (type: EffectType, variant?: string) => {
    onSelectType(type, variant);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Add Effect Layer
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {EFFECT_CATALOG.length} layer types and {styleCount} styles. Pick a style to add it directly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-[#151a26] border border-white/[0.08] focus-within:border-amber-500/70 rounded-md px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: wings, snow, black hole, swords..."
              aria-label="Search layers and styles"
              className="w-full bg-transparent text-xs text-slate-100 outline-none"
            />
          </div>
          <div className="flex gap-1 bg-black/35 p-1 rounded-lg">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  filter === f.id ? 'bg-[#1a2030] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto">
          {items.length === 0 && (
            <p className="col-span-full text-center text-xs text-slate-400 py-8">
              Nothing matches “{query}”.
            </p>
          )}
          {items.map(({ item, variants }) => (
            <div
              key={item.type}
              className="p-3.5 rounded-lg bg-[#161b28] border border-white/[0.07]"
            >
              <button
                type="button"
                onClick={() => pick(item.type)}
                className="group w-full text-left flex items-start justify-between gap-3 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100 group-hover:text-amber-300 transition-colors">
                    {item.label}
                    {isExtraType(item.type) && (
                      <span className="ml-2 text-[10px] font-semibold text-sky-300">NEW</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {item.shortDesc}
                  </p>
                </div>
                <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0 mt-0.5" />
              </button>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => pick(item.type, variant.id)}
                    className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-md bg-black/30 border border-white/[0.07] text-slate-300 hover:text-white hover:border-amber-500/60 transition-colors cursor-pointer"
                  >
                    {variant.color && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: `linear-gradient(135deg, ${variant.color}, ${variant.secondaryColor})` }}
                      />
                    )}
                    {variant.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
