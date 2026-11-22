/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Box,
  CheckSquare,
  Compass,
  Crosshair,
  GitMerge,
  Grid,
  ImagePlus,
  Layers,
  Link2,
  Maximize,
  Maximize2,
  Move,
  RefreshCw,
  RotateCw,
  Sparkles,
  SquareDashed,
  SquareDashedMousePointer,
  X,
} from "lucide-react";
import { TouchModifierState } from "../core/project/types";
import { EditSelectionSubMode } from "../core/mesh/loopSelect";
import { UVProjectionType, UVSelectMode, UVTransformTool } from "../core/uv/types";

interface UVToolToolbarProps {
  objectName?: string | null;
  multiSelectMode: boolean;
  keepConnected: boolean;
  showChecker: boolean;
  textureName?: string | null;
  selectionMode: UVSelectMode;
  uvSubMode: EditSelectionSubMode;
  screenModifiers: TouchModifierState;
  transformTool: UVTransformTool;
  boxSelectActive: boolean;
  zoomPercent: number;
  onUnwrap: (type: UVProjectionType) => void;
  onPackIslands: () => void;
  onToggleChecker: () => void;
  onToggleMultiSelect: () => void;
  onToggleKeepConnected: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onSelectModeChange: (mode: UVSelectMode) => void;
  onUvSubModeChange: (mode: EditSelectionSubMode) => void;
  onToggleScreenModifier: (key: "ctrl" | "shift" | "alt") => void;
  onTransformToolChange: (tool: UVTransformTool) => void;
  onToggleBoxSelect: () => void;
  onFit01: () => void;
  onFrameAll: () => void;
  onResetUVView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset3DView: () => void;
  canWeldUV?: boolean;
  onWeldUVVertices?: () => void;
  onSyncFrom3D?: () => void;
  onSyncTo3D?: () => void;
  onImportTexture?: () => void;
}

const buttonClass =
  "h-8 min-w-0 px-2 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[11px] font-medium text-[#cbd5e1] flex items-center justify-center gap-1 whitespace-nowrap transition-colors touch-manipulation";

export const UVToolToolbar: React.FC<UVToolToolbarProps> = ({
  objectName,
  multiSelectMode,
  keepConnected,
  showChecker,
  textureName,
  selectionMode,
  uvSubMode,
  screenModifiers,
  transformTool,
  boxSelectActive,
  zoomPercent,
  onUnwrap,
  onPackIslands,
  onToggleChecker,
  onToggleMultiSelect,
  onToggleKeepConnected,
  onSelectAll,
  onDeselectAll,
  onInvertSelection,
  onSelectModeChange,
  onUvSubModeChange,
  onToggleScreenModifier,
  onTransformToolChange,
  onToggleBoxSelect,
  onFit01,
  onFrameAll,
  onResetUVView,
  onZoomIn,
  onZoomOut,
  onReset3DView,
  canWeldUV = false,
  onWeldUVVertices,
  onSyncFrom3D,
  onSyncTo3D,
  onImportTexture,
}) => (
  <div
    data-testid="uv-tool-toolbar"
    aria-label="Herramientas UV"
    className="shrink-0 flex flex-col gap-2 border-b border-[#2b2e36] pb-3"
  >
    {objectName && (
      <div className="px-2 py-1 rounded bg-[#121418] border border-[#2b2e36] text-[11px] font-semibold text-[#cbd5e1] truncate">
        {objectName}
      </div>
    )}

    <section className="space-y-1">
      <h3 className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-[#8e95a2]">
        Selección
      </h3>
      <div data-testid="uv-selection-modes" className="grid grid-cols-2 gap-1">
        {(
          [
            { id: "vertex", label: "Vértice" },
            { id: "edge", label: "Arista" },
            { id: "face", label: "Cara" },
            { id: "island", label: "Isla" },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            type="button"
            data-testid={`uv-mode-${mode.id}`}
            aria-pressed={selectionMode === mode.id}
            onClick={() => onSelectModeChange(mode.id)}
            className={`${buttonClass} ${
              selectionMode === mode.id ? "bg-[#5ecd6e] text-[#121418] border-[#5ecd6e]" : ""
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {selectionMode !== "island" && (
        <div data-testid="uv-submodes" className="grid grid-cols-2 gap-1">
          <button
            type="button"
            data-testid="uv-submode-single"
            aria-pressed={uvSubMode === "single"}
            onClick={() => onUvSubModeChange("single")}
            className={`${buttonClass} ${
              uvSubMode === "single" ? "bg-[#1a2c3d] text-[#38bdf8]" : ""
            }`}
          >
            Individual
          </button>
          <button
            type="button"
            data-testid="uv-submode-loop"
            aria-pressed={uvSubMode === "loop"}
            onClick={() => onUvSubModeChange("loop")}
            className={`${buttonClass} ${
              uvSubMode === "loop" ? "bg-[#1a2c3d] text-[#38bdf8]" : ""
            }`}
          >
            Bucle
          </button>
        </div>
      )}
    </section>

    <section className="space-y-1">
      <h3 className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-[#8e95a2]">
        Transformación 2D
      </h3>
      <div data-testid="uv-transform-tools" className="grid grid-cols-2 gap-1">
        {(
          [
            { id: "move", label: "Mover", icon: Move },
            { id: "rotate", label: "Rotar", icon: RotateCw },
            { id: "scale", label: "Escalar", icon: Maximize2 },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-testid={`uv-tool-${id}`}
            aria-pressed={!boxSelectActive && transformTool === id}
            onClick={() => {
              if (boxSelectActive) onToggleBoxSelect();
              onTransformToolChange(id);
            }}
            className={`${buttonClass} ${
              !boxSelectActive && transformTool === id ? "bg-[#2c313b] text-[#5ecd6e]" : ""
            }`}
            title={`${label} UV (${id === "move" ? "G" : id === "rotate" ? "R" : "S"})`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        <button
          type="button"
          data-testid="uv-tool-box"
          aria-pressed={boxSelectActive}
          onClick={onToggleBoxSelect}
          className={`${buttonClass} ${boxSelectActive ? "bg-[#1a2c3d] text-[#38bdf8]" : ""}`}
          title="Selección por área / caja (B)"
        >
          <SquareDashedMousePointer className="w-3.5 h-3.5" />
          Área
        </button>
      </div>
    </section>

    <section className="space-y-1">
      <h3 className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-[#8e95a2]">
        Modificadores
      </h3>
      <div data-testid="uv-touch-modifiers" className="grid grid-cols-3 gap-1">
        {(
          [
            {
              id: "ctrl",
              label: "CTRL",
              activeClass: "bg-[#112738] text-[#7dd3fc] border-[#38bdf8]/70",
            },
            {
              id: "shift",
              label: "SHIFT",
              activeClass: "bg-[#16261a] text-[#7def8e] border-[#5ecd6e]/70",
            },
            {
              id: "alt",
              label: "ALT",
              activeClass: "bg-[#221a35] text-[#ddd6fe] border-[#a78bfa]/70",
            },
          ] as const
        ).map((modifier) => {
          const active =
            modifier.id === "shift" ? screenModifiers.shift : screenModifiers[modifier.id];
          return (
            <button
              key={modifier.id}
              type="button"
              data-testid={`uv-modifier-${modifier.id}`}
              aria-pressed={active}
              onClick={() => onToggleScreenModifier(modifier.id)}
              className={`${buttonClass} ${active ? modifier.activeClass : ""}`}
              title={`${modifier.label}: modificador para selección táctil`}
            >
              {modifier.label}
            </button>
          );
        })}
      </div>
    </section>

    <section className="space-y-1">
      <h3 className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-[#8e95a2]">Vista</h3>
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={onFit01}
          className={buttonClass}
          title="Ajustar al espacio 0–1"
        >
          <Grid className="w-3.5 h-3.5 text-[#5ecd6e]" />
          0–1
        </button>
        <button
          type="button"
          onClick={onFrameAll}
          className={buttonClass}
          title="Encuadrar islas UV"
        >
          <Maximize className="w-3.5 h-3.5 text-[#38bdf8]" />
          Encuadrar
        </button>
        <button
          type="button"
          onClick={onResetUVView}
          className={buttonClass}
          title="Restablecer vista UV"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={onZoomOut} className={buttonClass} title="Alejar Zoom UV">
          −
        </button>
        <span className="font-mono-tabular text-[11px] text-[#5ecd6e]">{zoomPercent}%</span>
        <button type="button" onClick={onZoomIn} className={buttonClass} title="Acercar Zoom UV">
          +
        </button>
        <button
          type="button"
          onClick={onReset3DView}
          className={buttonClass}
          title="Centrar vista 3D"
        >
          <Crosshair className="w-3.5 h-3.5 text-[#38bdf8]" />
          Centrar
        </button>
      </div>
    </section>

    <section className="space-y-1">
      <h3 className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-[#8e95a2]">UV</h3>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          data-testid="uv-unwrap-btn"
          onClick={() => onUnwrap("unwrap")}
          className={`${buttonClass} text-[#5ecd6e]`}
          title="Desarrollar malla respetando las costuras UV"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Unwrap
        </button>
        <button
          type="button"
          onClick={() => onUnwrap("planar")}
          className={buttonClass}
          title="Proyección plana"
        >
          <Box className="w-3.5 h-3.5 text-[#38bdf8]" />
          Plana
        </button>
        <button
          type="button"
          onClick={() => onUnwrap("cylindrical")}
          className={buttonClass}
          title="Proyección cilíndrica"
        >
          <Compass className="w-3.5 h-3.5 text-[#34d399]" />
          Cilíndrica
        </button>
        <button
          type="button"
          onClick={() => onUnwrap("spherical")}
          className={buttonClass}
          title="Proyección esférica"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#a78bfa]" />
          Esférica
        </button>
        <button
          type="button"
          data-testid="uv-pack-btn"
          onClick={onPackIslands}
          className={`${buttonClass} col-span-2 text-[#f3f4f6]`}
          title="Organizar y empaquetar islas UV en [0, 1]"
        >
          <Layers className="w-3.5 h-3.5 text-[#f59e0b]" />
          Empaquetar islas
        </button>
      </div>
    </section>

    <section className="space-y-1">
      <h3 className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-[#8e95a2]">
        Selección y textura
      </h3>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          data-testid="uv-select-all"
          onClick={onSelectAll}
          className={buttonClass}
        >
          <CheckSquare className="w-3.5 h-3.5 text-[#5ecd6e]" />
          Todo
        </button>
        <button
          type="button"
          data-testid="uv-deselect-all"
          onClick={onDeselectAll}
          className={buttonClass}
        >
          <X className="w-3.5 h-3.5 text-[#9ca3af]" />
          Limpiar
        </button>
        <button
          type="button"
          data-testid="uv-invert-selection"
          onClick={onInvertSelection}
          className={buttonClass}
        >
          <SquareDashed className="w-3.5 h-3.5 text-[#a78bfa]" />
          Invertir
        </button>
        <button
          type="button"
          data-testid="uv-multi-select-toggle"
          aria-pressed={multiSelectMode}
          onClick={onToggleMultiSelect}
          className={`${buttonClass} ${multiSelectMode ? "bg-[#16261a] border-[#5ecd6e] text-[#7def8e]" : ""}`}
        >
          Múltiple
        </button>
        <button
          type="button"
          data-testid="uv-keep-connected-toggle"
          aria-pressed={keepConnected}
          onClick={onToggleKeepConnected}
          className={`${buttonClass} ${keepConnected ? "bg-[#112738] border-[#38bdf8] text-[#7dd3fc]" : ""}`}
        >
          <Link2 className="w-3.5 h-3.5" />
          Unidos
        </button>
        <button
          type="button"
          data-testid="uv-checker-toggle"
          aria-pressed={showChecker}
          onClick={onToggleChecker}
          className={`${buttonClass} ${showChecker ? "bg-[#16261a] border-[#5ecd6e] text-[#5ecd6e]" : ""}`}
        >
          <Grid className="w-3.5 h-3.5" />
          Checker
        </button>
        {onWeldUVVertices && (
          <button
            type="button"
            data-testid="uv-weld-btn"
            disabled={!canWeldUV}
            onClick={onWeldUVVertices}
            className={`${buttonClass} disabled:opacity-40 text-[#fbbf24] col-span-2`}
          >
            <GitMerge className="w-3.5 h-3.5" />
            Unir UV
          </button>
        )}
        {onImportTexture && (
          <button
            type="button"
            data-testid="uv-import-texture"
            onClick={onImportTexture}
            className={`${buttonClass} col-span-2 text-[#7def8e]`}
            title={
              textureName ? `Cambiar textura: ${textureName}` : "Importar imagen para el material"
            }
          >
            <ImagePlus className="w-3.5 h-3.5" />
            {textureName ? "Cambiar textura" : "Importar textura"}
          </button>
        )}
        {onSyncFrom3D && (
          <button
            type="button"
            data-testid="uv-sync-from-3d"
            onClick={onSyncFrom3D}
            className={buttonClass}
            title="Traer selección desde el visor 3D"
          >
            <RefreshCw className="w-3 h-3 text-[#38bdf8]" />
            3D → UV
          </button>
        )}
        {onSyncTo3D && (
          <button
            type="button"
            data-testid="uv-sync-to-3d"
            onClick={onSyncTo3D}
            className={buttonClass}
            title="Enviar selección al visor 3D"
          >
            <RefreshCw className="w-3 h-3 text-[#5ecd6e]" />
            UV → 3D
          </button>
        )}
      </div>
    </section>
  </div>
);
