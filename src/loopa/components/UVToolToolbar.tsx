/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Box,
  CheckSquare,
  Compass,
  GitMerge,
  Grid,
  ImagePlus,
  Layers,
  Link2,
  Maximize2,
  RefreshCw,
  Sparkles,
  SquareDashed,
  X,
} from 'lucide-react';
import { UVProjectionType } from '../core/uv/types';

interface UVToolToolbarProps {
  objectName?: string | null;
  /** Rendered first in the toolbar (e.g. the LOOPA Ecosystem button). */
  leadingAction?: React.ReactNode;
  reserveTopLeftCorner?: boolean;
  multiSelectMode: boolean;
  keepConnected: boolean;
  showChecker: boolean;
  textureName?: string | null;
  onUnwrap: (type: UVProjectionType) => void;
  onPackIslands: () => void;
  onToggleChecker: () => void;
  onToggleMultiSelect: () => void;
  onToggleKeepConnected: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  canWeldUV?: boolean;
  onWeldUVVertices?: () => void;
  onSyncFrom3D?: () => void;
  onSyncTo3D?: () => void;
  onImportTexture?: () => void;
}

export const UVToolToolbar: React.FC<UVToolToolbarProps> = ({
  objectName,
  leadingAction,
  reserveTopLeftCorner = false,
  multiSelectMode,
  keepConnected,
  showChecker,
  textureName,
  onUnwrap,
  onPackIslands,
  onToggleChecker,
  onToggleMultiSelect,
  onToggleKeepConnected,
  onSelectAll,
  onDeselectAll,
  onInvertSelection,
  canWeldUV = false,
  onWeldUVVertices,
  onSyncFrom3D,
  onSyncTo3D,
  onImportTexture,
}) => {
  return (
    <div
      className={`min-h-12 bg-[#181a1f] border-b border-[#2b2e36] ${
        reserveTopLeftCorner ? 'pl-[104px] pr-3' : 'px-3'
      } py-1.5 flex flex-wrap items-center justify-between gap-2 z-20 transition-[padding] duration-200`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {leadingAction}
        {objectName && (
          <span className="px-2 py-1 rounded bg-[#121418] border border-[#2b2e36] text-[11px] font-semibold text-[#cbd5e1] max-w-[140px] truncate">
            {objectName}
          </span>
        )}

        <button
          type="button"
          data-testid="uv-unwrap-btn"
          onClick={() => onUnwrap('unwrap')}
          className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-semibold text-[#5ecd6e] flex items-center gap-1.5 whitespace-nowrap"
          title="Desenvolver malla respetando las costuras UV (Unwrap)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Unwrap</span>
        </button>

        <button
          type="button"
          onClick={() => onUnwrap('planar')}
          className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center gap-1 whitespace-nowrap"
          title="Proyección Plana"
        >
          <Box className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span className="hidden sm:inline">Plana</span>
        </button>

        <button
          type="button"
          onClick={() => onUnwrap('cylindrical')}
          className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center gap-1 whitespace-nowrap"
          title="Proyección Cilíndrica"
        >
          <Compass className="w-3.5 h-3.5 text-[#34d399]" />
          <span className="hidden sm:inline">Cilíndrica</span>
        </button>

        <button
          type="button"
          onClick={() => onUnwrap('spherical')}
          className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center gap-1 whitespace-nowrap"
          title="Proyección Esférica"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span className="hidden sm:inline">Esférica</span>
        </button>

        <button
          type="button"
          data-testid="uv-pack-btn"
          onClick={onPackIslands}
          className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-semibold text-[#f3f4f6] flex items-center gap-1.5 whitespace-nowrap"
          title="Organizar y empaquetar islas UV en [0, 1]"
        >
          <Layers className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span>Pack</span>
        </button>

        <div className="h-5 w-px bg-[#2b2e36]" />

        {/* Selection Operations */}
        <button
          type="button"
          data-testid="uv-select-all"
          onClick={onSelectAll}
          className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[11px] font-medium text-[#e4e6eb] flex items-center gap-1 whitespace-nowrap"
          title="Seleccionar todo en el Editor UV"
        >
          <CheckSquare className="w-3.5 h-3.5 text-[#5ecd6e]" />
          <span>Todo</span>
        </button>

        <button
          type="button"
          data-testid="uv-deselect-all"
          onClick={onDeselectAll}
          className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[11px] font-medium text-[#e4e6eb] flex items-center gap-1 whitespace-nowrap"
          title="Deseleccionar todo en el Editor UV"
        >
          <X className="w-3.5 h-3.5 text-[#9ca3af]" />
          <span>Limpiar</span>
        </button>

        <button
          type="button"
          data-testid="uv-invert-selection"
          onClick={onInvertSelection}
          className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[11px] font-medium text-[#e4e6eb] flex items-center gap-1 whitespace-nowrap"
          title="Invertir selección UV"
        >
          <SquareDashed className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span>Invertir</span>
        </button>

        <button
          type="button"
          data-testid="uv-multi-select-toggle"
          onClick={onToggleMultiSelect}
          aria-pressed={multiSelectMode}
          className={`h-8 px-2 rounded border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap transition-colors ${
            multiSelectMode
              ? 'bg-[#16261a] border-[#5ecd6e] text-[#7def8e]'
              : 'bg-[#22252d] hover:bg-[#2c313b] border-[#323640] text-[#cbd5e1]'
          }`}
          title="Activar/Desactivar selección múltiple por toque"
        >
          <span>Múltiple</span>
        </button>

        <button
          type="button"
          data-testid="uv-keep-connected-toggle"
          onClick={onToggleKeepConnected}
          aria-pressed={keepConnected}
          className={`h-8 px-2 rounded border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap transition-colors ${
            keepConnected
              ? 'bg-[#112738] border-[#38bdf8] text-[#7dd3fc]'
              : 'bg-[#22252d] hover:bg-[#2c313b] border-[#323640] text-[#cbd5e1]'
          }`}
          title="Mantener unidos los vértices y aristas compartidos (no costura)"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Unidos</span>
        </button>

        {onWeldUVVertices && (
          <button
            type="button"
            data-testid="uv-weld-btn"
            disabled={!canWeldUV}
            onClick={onWeldUVVertices}
            className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] text-[11px] font-semibold text-[#fbbf24] flex items-center gap-1 whitespace-nowrap transition-colors"
            title="Unir coordenadas UV de los vértices seleccionados (no modifica el 3D)"
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Unir UV</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {onImportTexture && (
          <button
            type="button"
            data-testid="uv-import-texture"
            onClick={onImportTexture}
            className="h-8 px-2.5 rounded bg-[#16261a] hover:bg-[#1d3322] border border-[#5ecd6e]/55 text-[11px] font-semibold text-[#7def8e] flex items-center gap-1.5 whitespace-nowrap"
            title={textureName ? `Cambiar textura: ${textureName}` : 'Importar imagen para el material'}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>{textureName ? 'Cambiar textura' : 'Importar textura'}</span>
          </button>
        )}
        {onSyncFrom3D && (
          <button
            type="button"
            data-testid="uv-sync-from-3d"
            onClick={onSyncFrom3D}
            className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[11px] font-medium text-[#cbd5e1] flex items-center gap-1 whitespace-nowrap"
            title="Traer la selección actual del visor 3D al Editor UV"
          >
            <RefreshCw className="w-3 h-3 text-[#38bdf8]" />
            <span className="hidden sm:inline">3D → UV</span>
          </button>
        )}
        {onSyncTo3D && (
          <button
            type="button"
            data-testid="uv-sync-to-3d"
            onClick={onSyncTo3D}
            className="h-8 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[11px] font-medium text-[#cbd5e1] flex items-center gap-1 whitespace-nowrap"
            title="Enviar la selección actual del Editor UV al modelo 3D"
          >
            <RefreshCw className="w-3 h-3 text-[#5ecd6e]" />
            <span className="hidden sm:inline">UV → 3D</span>
          </button>
        )}

        <button
          type="button"
          data-testid="uv-checker-toggle"
          onClick={onToggleChecker}
          className={`h-8 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            showChecker
              ? 'bg-[#16261a] border border-[#5ecd6e] text-[#5ecd6e]'
              : 'bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[#9ca3af]'
          }`}
          title="Activar/Desactivar cuadrícula Checker en 0–1"
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Checker</span>
        </button>
      </div>
    </div>
  );
};
