import React, { useEffect } from 'react';
import {
  Box,
  Circle,
  Cone,
  Cylinder,
  Globe,
  Square,
  Torus,
  X,
} from 'lucide-react';
import { PrimitiveType } from '../core/mesh/primitives';

interface CtrlShiftPrimitivesMenuProps {
  onSelectPrimitive: (type: PrimitiveType) => void;
  onClose: () => void;
}

interface PrimitiveMenuItem {
  type: PrimitiveType;
  label: string;
  detail: string;
  icon: React.ReactNode;
}

const PRIMITIVE_ITEMS: PrimitiveMenuItem[] = [
  {
    type: 'cube',
    label: 'Cubo',
    detail: '8 vért. · 6 caras',
    icon: <Box className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    type: 'uv_sphere',
    label: 'Esfera UV',
    detail: '16 × 12 seg.',
    icon: <Globe className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    type: 'cylinder',
    label: 'Cilindro',
    detail: '16 seg. · tapas',
    icon: <Cylinder className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    type: 'cone',
    label: 'Cono',
    detail: '16 seg. · base',
    icon: <Cone className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    type: 'plane',
    label: 'Plano',
    detail: '4 vért. · 1 cara',
    icon: <Square className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    type: 'circle',
    label: 'Círculo',
    detail: '32 vért. · borde',
    icon: <Circle className="w-4 h-4 text-[#5ecd6e]" />,
  },
  {
    type: 'torus',
    label: 'Toroide',
    detail: '24 × 12 seg.',
    icon: <Torus className="w-4 h-4 text-[#5ecd6e]" />,
  },
];

export const CtrlShiftPrimitivesMenu: React.FC<CtrlShiftPrimitivesMenuProps> = ({
  onSelectPrimitive,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      data-testid="ctrl-shift-primitives-backdrop"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/25"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          onClose();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        data-testid="ctrl-shift-primitives-menu"
        role="dialog"
        aria-label="Agregar primitiva"
        onPointerDown={(e) => e.stopPropagation()}
        className="w-[260px] max-w-[92vw] rounded-xl bg-[#1a1c22] border border-[#343946] shadow-[0_16px_40px_rgba(0,0,0,0.58)] overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-[#2b2f3a] flex items-center justify-between gap-2 bg-[#16181d]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-1.5 py-0.5 rounded bg-[#272b36] border border-[#3a4050] text-[9px] font-bold tracking-wider text-[#7def8e]">
              CTRL+SHIFT
            </span>
            <span className="text-xs font-semibold text-[#f3f4f6] truncate">
              Agregar Primitiva
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú de primitivas"
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-[#2a2e38] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2 grid grid-cols-1 gap-1 max-h-[70vh] overflow-y-auto cad-scroll">
          {PRIMITIVE_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              data-primitive-type={item.type}
              onClick={() => onSelectPrimitive(item.type)}
              className="w-full min-h-[42px] px-2.5 py-1.5 rounded-lg bg-[#22252d] hover:bg-[#2b303a] active:bg-[#343a47] border border-transparent hover:border-[#5ecd6e]/45 flex items-center justify-between gap-2.5 text-left transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-md bg-[#191b21] border border-[#2d323e] flex items-center justify-center shrink-0">
                  {item.icon}
                </span>
                <span className="text-xs font-semibold text-[#f3f4f6] truncate">
                  {item.label}
                </span>
              </div>
              <span className="text-[10px] text-[#8d95a5] font-mono-tabular shrink-0">
                {item.detail}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
