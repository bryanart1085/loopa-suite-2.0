import React, { useEffect, useMemo } from 'react';
import {
  CheckSquare,
  Copy,
  Crosshair,
  FlipHorizontal,
  Link2,
  RefreshCw,
  Scissors,
  ScissorsLineDashed,
  X,
} from 'lucide-react';
import { WorkMode } from '../core/project/types';

export interface SpecialOperationDescriptor {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  disabled: boolean;
  onExecute: () => void;
}

interface CtrlAltOperationsMenuProps {
  workMode: WorkMode;
  hasSelectedObject: boolean;
  canEditSelected: boolean;
  hasSelectedComponents: boolean;
  hasFaces: boolean;
  onDuplicateObject: () => void;
  onApplyObjectTransform: () => void;
  onCenterObjectOrigin: () => void;
  onSeparateSelectedGeometry: () => void;
  onRecalculateNormalsOutside: () => void;
  onFlipNormals: () => void;
  onStartLimitedDissolve?: () => void;
  onStartBridgeLoops?: () => void;
  onClose: () => void;
}

export const CtrlAltOperationsMenu: React.FC<CtrlAltOperationsMenuProps> = ({
  workMode,
  hasSelectedObject,
  canEditSelected,
  hasSelectedComponents,
  hasFaces,
  onDuplicateObject,
  onApplyObjectTransform,
  onCenterObjectOrigin,
  onSeparateSelectedGeometry,
  onRecalculateNormalsOutside,
  onFlipNormals,
  onStartLimitedDissolve,
  onStartBridgeLoops,
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

  const operations: SpecialOperationDescriptor[] = useMemo(() => {
    const items: SpecialOperationDescriptor[] = [
      {
        id: 'duplicate_object',
        label: 'Duplicar',
        description: hasSelectedObject
          ? 'Clonar el objeto activo en la escena'
          : 'Requiere un objeto seleccionado',
        icon: <Copy className="w-4 h-4 text-[#a78bfa]" />,
        disabled: !hasSelectedObject,
        onExecute: onDuplicateObject,
      },
      {
        id: 'apply_transform',
        label: 'Aplicar transformaciones',
        description: canEditSelected
          ? 'Hornear posición, rotación y escala en la malla'
          : 'Requiere una malla editable desbloqueada',
        icon: <CheckSquare className="w-4 h-4 text-[#a78bfa]" />,
        disabled: !canEditSelected,
        onExecute: onApplyObjectTransform,
      },
      {
        id: 'center_origin',
        label: 'Centrar origen',
        description: canEditSelected
          ? 'Mover el pivote al centro geométrico'
          : 'Requiere una malla editable desbloqueada',
        icon: <Crosshair className="w-4 h-4 text-[#a78bfa]" />,
        disabled: !canEditSelected,
        onExecute: onCenterObjectOrigin,
      },
    ];

    if (workMode === 'edit') {
      items.push({
        id: 'separate_selected',
        label: 'Separar geometría seleccionada',
        description: hasSelectedComponents
          ? 'Extraer selección como un objeto independiente'
          : 'Selecciona caras o geometría para separar',
        icon: <Scissors className="w-4 h-4 text-[#5ecd6e]" />,
        disabled: !canEditSelected || !hasSelectedComponents,
        onExecute: onSeparateSelectedGeometry,
      });

      if (onStartBridgeLoops) {
        items.push({
          id: 'bridge_loops',
          label: 'Bridge Edge Loops',
          description: hasSelectedComponents
            ? 'Conectar dos contornos abiertos seleccionados'
            : 'Requiere seleccionar dos contornos abiertos',
          icon: <Link2 className="w-4 h-4 text-[#38bdf8]" />,
          disabled: !canEditSelected || !hasSelectedComponents,
          onExecute: onStartBridgeLoops,
        });
      }

      if (hasFaces) {
        if (onStartLimitedDissolve) {
          items.push({
            id: 'limited_dissolve',
            label: 'Limited Dissolve',
            description: 'Simplificar aristas planas y vértices colineales por ángulo',
            icon: <ScissorsLineDashed className="w-4 h-4 text-[#38bdf8]" />,
            disabled: !canEditSelected,
            onExecute: onStartLimitedDissolve,
          });
        }
        items.push(
          {
            id: 'recalc_normals',
            label: 'Recalcular normales hacia afuera',
            description: hasSelectedComponents
              ? 'Orientar normales de caras seleccionadas'
              : 'Orientar normales de toda la malla',
            icon: <RefreshCw className="w-4 h-4 text-[#38bdf8]" />,
            disabled: !canEditSelected,
            onExecute: onRecalculateNormalsOutside,
          },
          {
            id: 'flip_normals',
            label: 'Invertir normales',
            description: hasSelectedComponents
              ? 'Invertir dirección de caras seleccionadas'
              : 'Invertir todas las normales de la malla',
            icon: <FlipHorizontal className="w-4 h-4 text-[#38bdf8]" />,
            disabled: !canEditSelected,
            onExecute: onFlipNormals,
          },
        );
      }
    }

    return items;
  }, [
    canEditSelected,
    hasFaces,
    hasSelectedComponents,
    hasSelectedObject,
    onApplyObjectTransform,
    onCenterObjectOrigin,
    onDuplicateObject,
    onFlipNormals,
    onRecalculateNormalsOutside,
    onSeparateSelectedGeometry,
    onStartBridgeLoops,
    onStartLimitedDissolve,
    workMode,
  ]);

  return (
    <div
      data-testid="ctrl-alt-operations-backdrop"
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
        data-testid="ctrl-alt-operations-menu"
        role="dialog"
        aria-label="Operaciones especiales"
        onPointerDown={(e) => e.stopPropagation()}
        className="w-[292px] max-w-[92vw] rounded-xl bg-[#1a1c22] border border-[#343946] shadow-[0_16px_40px_rgba(0,0,0,0.58)] overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-[#2b2f3a] flex items-center justify-between gap-2 bg-[#16181d]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-1.5 py-0.5 rounded bg-[#241c38] border border-[#5b4794] text-[9px] font-bold tracking-wider text-[#c4b5fd]">
              CTRL+ALT
            </span>
            <span className="text-xs font-semibold text-[#f3f4f6] truncate">
              Operaciones Especiales
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú de operaciones especiales"
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-[#2a2e38] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto cad-scroll">
          {operations.map((op) => (
            <button
              key={op.id}
              type="button"
              data-special-op={op.id}
              disabled={op.disabled}
              onClick={() => {
                if (op.disabled) return;
                op.onExecute();
                onClose();
              }}
              className={`w-full min-h-[46px] px-2.5 py-1.5 rounded-lg border flex items-center gap-2.5 text-left transition-colors ${
                op.disabled
                  ? 'bg-[#1c1f26] border-transparent opacity-45 cursor-not-allowed'
                  : 'bg-[#22252d] hover:bg-[#2b303a] active:bg-[#343a47] border-transparent hover:border-[#a78bfa]/45'
              }`}
            >
              <span className="w-7 h-7 rounded-md bg-[#191b21] border border-[#2d323e] flex items-center justify-center shrink-0">
                {op.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#f3f4f6] truncate">
                  {op.label}
                </div>
                <div className="text-[10px] text-[#8d95a5] truncate">
                  {op.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
