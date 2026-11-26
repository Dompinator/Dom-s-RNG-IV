import { Plus, X } from 'lucide-react';
import { EFFECT_CATALOG, type EffectType } from '../aura/types';

interface AddLayerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectType: (type: EffectType) => void;
}

export function AddLayerModal({
  open,
  onClose,
  onSelectType,
}: AddLayerModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Add Effect Layer
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose a procedural 3D effect module to add to your aura stack.
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

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[70vh] overflow-y-auto">
          {EFFECT_CATALOG.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => {
                onSelectType(item.type);
                onClose();
              }}
              className="group text-left p-3.5 rounded-lg bg-[#161b28] hover:bg-[#1c2334] border border-white/[0.07] hover:border-amber-500/50 transition-colors flex items-start justify-between gap-3 cursor-pointer"
            >
              <div>
                <div className="text-sm font-medium text-slate-100 group-hover:text-amber-300 transition-colors">
                  {item.label}
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {item.shortDesc}
                </p>
              </div>
              <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400 shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
