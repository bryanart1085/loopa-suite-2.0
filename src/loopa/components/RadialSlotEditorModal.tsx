import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban,
  Check,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  getDefaultSlotsForScope,
  getMenuKindForScope,
  RADIAL_ACTION_CATEGORIES,
  RADIAL_ACTION_LIBRARY,
  RADIAL_ACTION_MAP,
  RadialActionCategoryId,
  RadialActionId,
  RadialLayoutScope,
} from '../core/radial/radialActions';
import { RadialActionIcon } from './RadialActionIcon';

interface RadialSlotEditorModalProps {
  mode: RadialLayoutScope;
  slotIndex: number;
  currentActionId: RadialActionId | null;
  onAssignAction: (actionId: RadialActionId | null) => void;
  onRestoreDefaultSlot: () => void;
  onRestoreEntireLayout: () => void;
  onClose: () => void;
}

const SCOPE_LABELS: Record<RadialLayoutScope, string> = {
  barhome: 'Menú BARHOME',
  object: 'Herramientas · Modo Objeto',
  edit: 'Herramientas · Modo Edición',
  sculpt: 'Herramientas · Escultura (futuro)',
  uv_editing: 'Herramientas · Editor UV',
  materials: 'Herramientas · Materiales',
};

export const RadialSlotEditorModal: React.FC<RadialSlotEditorModalProps> = ({
  mode,
  slotIndex,
  currentActionId,
  onAssignAction,
  onRestoreDefaultSlot,
  onRestoreEntireLayout,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<
    RadialActionCategoryId | 'all'
  >('all');
  const [query, setQuery] = useState('');
  const backdropPointerDownRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const menuKind = getMenuKindForScope(mode);
  const availableCategories = useMemo(
    () =>
      RADIAL_ACTION_CATEGORIES.filter((cat) =>
        cat.menuKinds.includes(menuKind),
      ),
    [menuKind],
  );

  const defaultActionId = getDefaultSlotsForScope(mode)[slotIndex] ?? null;
  const currentAction = currentActionId
    ? RADIAL_ACTION_MAP[currentActionId]
    : null;
  const defaultAction = defaultActionId
    ? RADIAL_ACTION_MAP[defaultActionId]
    : null;

  const groupedActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableCategories
      .filter((cat) => activeCategory === 'all' || activeCategory === cat.id)
      .map((cat) => {
        const items = RADIAL_ACTION_LIBRARY.filter((act) => {
          if (act.category !== cat.id) return false;
          if (!act.menuKinds.includes(menuKind)) return false;
          if (!q) return true;
          return (
            act.label.toLowerCase().includes(q) ||
            act.shortLabel.toLowerCase().includes(q) ||
            act.description.toLowerCase().includes(q)
          );
        });
        return { category: cat, items };
      })
      .filter((group) => group.items.length > 0);
  }, [activeCategory, availableCategories, menuKind, query]);

  const modalNode = (
    <div
      data-testid="radial-slot-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Personalizar Botón #${slotIndex + 1} · ${SCOPE_LABELS[mode]}`}
      className="fixed inset-0 z-[70] pointer-events-auto bg-black/70 flex items-center justify-center p-3 sm:p-4 touch-manipulation select-none"
      onPointerDown={(e) => {
        e.stopPropagation();
        backdropPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (backdropPointerDownRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropPointerDownRef.current = false;
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] bg-[#1a1c22] border border-[#343844] rounded-xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2b2e37] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#5ecd6e] shrink-0" />
              <h2 className="text-sm font-semibold text-[#f3f4f6] truncate">
                Personalizar Botón #{slotIndex + 1} · {SCOPE_LABELS[mode]}
              </h2>
            </div>
            <p className="text-[11px] text-[#9ca3af] mt-0.5 truncate">
              Función actual:{' '}
              <span className="text-[#e5e7eb] font-medium">
                {currentAction ? currentAction.label : 'Espacio vacío'}
              </span>
              {' · '}
              Predeterminada:{' '}
              <span className="text-[#5ecd6e]">
                {defaultAction ? defaultAction.shortLabel : 'Espacio vacío'}
              </span>
            </p>
          </div>
          <button
            type="button"
            data-testid="radial-slot-editor-close"
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-[#2a2e38] text-[#9ca3af] hover:text-white flex items-center justify-center shrink-0"
            aria-label="Cerrar editor de botón radial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Slot Actions: Leave Empty / Restore Slot / Restore All */}
        <div className="px-4 py-2.5 bg-[#15171c] border-b border-[#262a33] flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="radial-slot-editor-clear"
            onClick={() => {
              onAssignAction(null);
              onClose();
            }}
            className={`h-10 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              currentActionId === null
                ? 'bg-[#2c313b] border-[#5ecd6e] text-[#5ecd6e]'
                : 'bg-[#1f222a] hover:bg-[#272b35] border-[#343946] text-[#e5e7eb]'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Dejar espacio vacío</span>
          </button>

          <button
            type="button"
            data-testid="radial-slot-editor-restore-slot"
            onClick={() => {
              onRestoreDefaultSlot();
              onClose();
            }}
            className="h-10 px-3 rounded-lg bg-[#1f222a] hover:bg-[#272b35] border border-[#343946] text-xs font-medium text-[#e5e7eb] flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#5ecd6e]" />
            <span>Restaurar predeterminado</span>
          </button>

          <button
            type="button"
            data-testid="radial-slot-editor-restore-all"
            onClick={() => {
              onRestoreEntireLayout();
              onClose();
            }}
            className="h-10 px-3 rounded-lg bg-[#1f222a] hover:bg-[#2b2226] border border-[#343946] text-xs font-medium text-[#cbd5e1] sm:ml-auto flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#9ca3af]" />
            <span>Restaurar todo {SCOPE_LABELS[mode]}</span>
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="px-4 pt-3 pb-2 space-y-2.5 border-b border-[#262a33] shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8e95a2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="radial-slot-editor-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                menuKind === 'barhome'
                  ? 'Buscar acción de BARHOME...'
                  : 'Buscar herramienta o acción...'
              }
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#121419] border border-[#2f333d] text-xs text-[#f3f4f6] placeholder:text-[#6b7280] outline-none focus:border-[#5ecd6e] select-text"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 cad-scroll touch-pan-x">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`h-8 px-2.5 rounded-md text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                activeCategory === 'all'
                  ? 'bg-[#5ecd6e] border-[#5ecd6e] text-[#111215]'
                  : 'bg-[#1f222a] border-[#2e3340] text-[#b4bac4] hover:text-white'
              }`}
            >
              Todas
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`h-8 px-2.5 rounded-md text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-[#5ecd6e] border-[#5ecd6e] text-[#111215]'
                    : 'bg-[#1f222a] border-[#2e3340] text-[#b4bac4] hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Categorized Action Library */}
        <div
          data-testid="radial-slot-editor-list"
          className="min-h-0 flex-1 p-4 overflow-y-auto cad-scroll space-y-4 touch-pan-y overscroll-contain"
        >
          {groupedActions.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8e95a2]">
              No se encontraron funciones con ese filtro.
            </div>
          ) : (
            groupedActions.map(({ category, items }) => (
              <section key={category.id} className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                  {category.label}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((action) => {
                    const selected = currentActionId === action.id;
                    const scopeRecommended =
                      action.supportedScopes.includes(mode);
                    return (
                      <button
                        key={action.id}
                        type="button"
                        data-testid={`radial-slot-editor-action-${action.id}`}
                        onClick={() => {
                          onAssignAction(action.id);
                          onClose();
                        }}
                        className={`min-h-[52px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                          selected
                            ? 'bg-[#2c313b] border-[#5ecd6e] text-[#f3f4f6]'
                            : 'bg-[#15171c] hover:bg-[#222630] border-[#2c303b] text-[#e5e7eb]'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-[#5ecd6e]/15 border-[#5ecd6e]/60 text-[#5ecd6e]'
                              : action.danger
                                ? 'bg-[#271b1e] border-[#593036] text-[#f87171]'
                                : 'bg-[#1f222a] border-[#333846] text-[#5ecd6e]'
                          }`}
                        >
                          <RadialActionIcon
                            icon={action.icon}
                            className="w-4 h-4"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold truncate">
                              {action.label}
                            </span>
                            {!scopeRecommended && (
                              <span className="px-1.5 py-0.5 rounded bg-[#232732] text-[9px] font-medium text-[#9ca3af] shrink-0">
                                Otro modo
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8e95a2] leading-tight line-clamp-2 mt-0.5">
                            {action.description}
                          </p>
                        </div>

                        {selected && (
                          <Check className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#2b2e37] bg-[#15171c] flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-[#8e95a2] truncate">
            Toca una función para asignarla y guardarla al instante.
          </span>
          <button
            type="button"
            data-testid="radial-slot-editor-cancel"
            onClick={onClose}
            className="h-9 px-3 rounded-lg bg-[#232732] hover:bg-[#2d3240] border border-[#383e4c] text-xs font-semibold text-[#e5e7eb] shrink-0 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
};
