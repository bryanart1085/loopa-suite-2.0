import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Aperture, PanelTop, SlidersHorizontal, X } from 'lucide-react';
import {
  DeleteActionType,
  EdgeSelectionTool,
} from '../core/mesh/advancedOperations';
import { EditSelectionMode } from '../core/mesh/operations';
import { PrimitiveOptions, PrimitiveType } from '../core/mesh/primitives';
import {
  AxisConstraint,
  CameraProjection,
  LightType,
  ObjectShadingMode,
  SaveStatus,
  TouchControlSettings,
  TouchModifierKey,
  TouchModifierState,
  TransformTool,
  ViewportDisplayMode,
  WorkMode,
} from '../core/project/types';
import {
  RadialActionId,
  RadialLayoutScope,
} from '../core/radial/radialActions';
import type { CameraPreset } from '../engine/ViewportEngine';
import type { EditOperatorType } from '../state/useModelerStore';
import { FloatingRadialMenu } from './FloatingRadialMenu';
import type { WorkspaceId } from './TopBar';
import type { UVQuickAccessState, UVWorkspaceHandle } from './UVWorkspace';

interface FloatingRadialPairProps {
  activeWorkspace: WorkspaceId;
  boundsClassName?: string;
  floatingMenusEnabled: boolean;
  touchSettings: TouchControlSettings;
  onUpdateTouchSettings: (patch: Partial<TouchControlSettings>) => void;
  onUpdateRadialSlot: (
    scope: RadialLayoutScope,
    slotIndex: number,
    actionId: RadialActionId | null,
  ) => void;
  onResetRadialSlot: (scope: RadialLayoutScope, slotIndex: number) => void;
  onResetRadialLayout: (scope: RadialLayoutScope) => void;

  // Layout / Modeling State & Handlers
  workMode: WorkMode;
  editSelectionMode: EditSelectionMode;
  edgeSelectionTool?: EdgeSelectionTool;
  activeTool: TransformTool;
  activeOperatorType?: EditOperatorType | null;
  axisConstraint: AxisConstraint;
  projection: CameraProjection;
  displayMode: ViewportDisplayMode;
  xrayTransparency: number;
  showFaceOrientation: boolean;
  showGrid: boolean;
  showAxes: boolean;
  showLiner: boolean;
  barhomeVisible: boolean;
  multiSelectTouch: boolean;
  screenShiftActive: boolean;
  effectiveModifiers: TouchModifierState;
  screenModifiers: TouchModifierState;
  hasSelectedObject: boolean;
  canEditSelected: boolean;
  hasSelectedComponents: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges: boolean;
  saveStatus: SaveStatus;
  proportionalEnabled: boolean;
  proportionalConnectedOnly: boolean;
  selectedObjectShading?: ObjectShadingMode | null;

  onAddPrimitive: (type: PrimitiveType, options?: PrimitiveOptions) => void;
  onAddLight?: (type: LightType) => void;
  onSelectTool: (tool: TransformTool) => void;
  onGQuickTapMove: () => void;
  onChangeAxisConstraint: (axis: AxisConstraint) => void;
  onDuplicateObject: () => void;
  onApplyObjectTransform: () => void;
  onCenterObjectOrigin: () => void;
  onSeparateSelectedGeometry: () => void;
  onDeleteObject: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onFocusSelected: () => void;
  onToggleProjection: () => void;
  onToggleWorkMode: (mode: WorkMode) => void;
  onChangeEditSelectionMode: (mode: EditSelectionMode) => void;
  onChangeEdgeSelectionTool: (tool: EdgeSelectionTool) => void;
  onSelectEdgeTopology: (kind: 'loop' | 'ring') => void;
  onToggleXray: () => void;
  onSelectDisplayMode: (mode: ViewportDisplayMode) => void;
  onChangeXrayTransparency: (value: number) => void;
  onToggleFaceOrientation: () => void;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleLiner: () => void;
  onToggleBarhome: () => void;
  onToggleMultiSelectTouch: () => void;
  onToggleScreenShift: () => void;
  onSetModifier: (key: TouchModifierKey, active: boolean) => void;
  onToggleModifier: (key: TouchModifierKey) => void;
  onReleaseAllModifiers: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onStartOperator: (type: EditOperatorType) => void;
  onFillSelection: () => void;
  onConnectVertexPath: () => void;
  onRecalculateOutside: () => void;
  onFlipNormals: () => void;
  onQuickDissolve: () => void;
  onExecuteContextualDelete: (action: DeleteActionType) => void;
  onMarkSeams: (isSeam: boolean) => void;
  onSelectSeams: () => void;
  onDeselectSeams: () => void;
  onToggleProportional: () => void;
  onToggleProportionalConnected: () => void;
  onCycleProportionalFalloff: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectAllObjects: () => void;
  onDeselectAllObjects: () => void;
  onSelectConnected: () => void;
  onSetSelectedObjectShading: (shading: ObjectShadingMode) => void;

  // UV context
  uvQuickState?: UVQuickAccessState | null;
  uvActionsRef?: React.RefObject<UVWorkspaceHandle | null>;

  // BARHOME handlers
  demoMode?: boolean;
  onCreateProjectModal: () => void;
  onOpenProjectModal: () => void;
  onSaveProject: () => void;
  onSaveAsProjectModal: () => void;
  onImportNativeProject: () => void;
  onExportNativeProject: () => void;
  onImportExternal: () => void;
  onExportExternal: () => void;
  onImportObj: () => void;
  onImportStl: () => void;
  onImportJpg: () => void;
  onImportPng: () => void;
  onExportSelected: () => void;
  onExportScene: () => void;
  onExportObj: () => void;
  onExportStl: () => void;
  onReturnToGallery: () => void;
  onOpenSettings: () => void;
}

export const FloatingRadialPair: React.FC<FloatingRadialPairProps> = ({
  activeWorkspace,
  demoMode = false,
  boundsClassName = 'left-0 right-0',
  floatingMenusEnabled,
  touchSettings,
  onUpdateTouchSettings,
  onUpdateRadialSlot,
  onResetRadialSlot,
  onResetRadialLayout,
  workMode,
  editSelectionMode,
  edgeSelectionTool = 'single',
  activeTool,
  activeOperatorType = null,
  axisConstraint,
  projection,
  displayMode,
  xrayTransparency,
  showFaceOrientation,
  showGrid,
  showAxes,
  showLiner,
  barhomeVisible,
  multiSelectTouch,
  screenShiftActive,
  effectiveModifiers,
  screenModifiers,
  hasSelectedObject,
  canEditSelected,
  hasSelectedComponents,
  canUndo,
  canRedo,
  hasUnsavedChanges,
  saveStatus,
  proportionalEnabled,
  proportionalConnectedOnly,
  selectedObjectShading = null,
  onAddPrimitive,
  onAddLight,
  onSelectTool,
  onGQuickTapMove,
  onChangeAxisConstraint,
  onDuplicateObject,
  onApplyObjectTransform,
  onCenterObjectOrigin,
  onSeparateSelectedGeometry,
  onDeleteObject,
  onSetCameraPreset,
  onFocusSelected,
  onToggleProjection,
  onToggleWorkMode,
  onChangeEditSelectionMode,
  onChangeEdgeSelectionTool,
  onSelectEdgeTopology,
  onToggleXray,
  onSelectDisplayMode,
  onChangeXrayTransparency,
  onToggleFaceOrientation,
  onToggleGrid,
  onToggleAxes,
  onToggleLiner,
  onToggleBarhome,
  onToggleMultiSelectTouch,
  onToggleScreenShift,
  onSetModifier,
  onToggleModifier,
  onReleaseAllModifiers,
  onUndo,
  onRedo,
  onStartOperator,
  onFillSelection,
  onConnectVertexPath,
  onRecalculateOutside,
  onFlipNormals,
  onQuickDissolve,
  onExecuteContextualDelete,
  onMarkSeams,
  onSelectSeams,
  onDeselectSeams,
  onToggleProportional,
  onToggleProportionalConnected,
  onCycleProportionalFalloff,
  onSelectAll,
  onDeselectAll,
  onSelectAllObjects,
  onDeselectAllObjects,
  onSelectConnected,
  onSetSelectedObjectShading,
  uvQuickState = null,
  uvActionsRef,
  onCreateProjectModal,
  onOpenProjectModal,
  onSaveProject,
  onSaveAsProjectModal,
  onImportNativeProject,
  onExportNativeProject,
  onImportExternal,
  onExportExternal,
  onImportObj,
  onImportStl,
  onImportJpg,
  onImportPng,
  onExportSelected,
  onExportScene,
  onExportObj,
  onExportStl,
  onReturnToGallery,
  onOpenSettings,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heldModifiersRef = useRef(new Set<TouchModifierKey>());
  const [activeMenu, setActiveMenu] = useState<
    'barhome' | 'tools' | 'modifiers' | null
  >(null);

  const visibleModifierKeys = (
    ['shift', 'ctrl', 'alt'] as TouchModifierKey[]
  ).filter(
    (key) =>
      touchSettings.modifiers[key].enabled &&
      touchSettings.modifiers[key].showScreenButton,
  );
  const showModifierMenu =
    activeWorkspace === 'layout' &&
    workMode !== 'sculpt' &&
    touchSettings.modifierPanelEnabled &&
    visibleModifierKeys.length > 0;
  const isHoldMode = touchSettings.modifierPanelMode === 'hold';

  const releaseHeldModifier = useCallback(
    (key: TouchModifierKey) => {
      if (heldModifiersRef.current.delete(key)) {
        onSetModifier(key, false);
      }
    },
    [onSetModifier],
  );

  const releaseHeldModifiers = useCallback(() => {
    for (const key of heldModifiersRef.current) {
      onSetModifier(key, false);
    }
    heldModifiersRef.current.clear();
  }, [onSetModifier]);

  useEffect(() => {
    if (showModifierMenu && activeMenu === 'modifiers') return;
    releaseHeldModifiers();
    if (!showModifierMenu && activeMenu === 'modifiers') {
      setActiveMenu(null);
    }
  }, [activeMenu, releaseHeldModifiers, showModifierMenu]);

  useEffect(() => releaseHeldModifiers, [releaseHeldModifiers]);

  useEffect(() => {
    if (!activeMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMenu]);

  useEffect(() => {
    if (!floatingMenusEnabled && activeMenu !== 'modifiers') {
      setActiveMenu(null);
    }
  }, [activeMenu, floatingMenusEnabled]);

  const toolsScope: RadialLayoutScope =
    activeWorkspace === 'uv_editing'
      ? 'uv_editing'
      : activeWorkspace === 'materials'
        ? 'materials'
        : workMode;

  const toolsSlots =
    toolsScope === 'uv_editing'
      ? touchSettings.workspaceToolRadialLayouts.uv_editing
      : toolsScope === 'materials'
        ? touchSettings.workspaceToolRadialLayouts.materials
        : touchSettings.radialLayouts[workMode];

  const sharedProps = {
    containerRef,
    demoMode,
    activeWorkspace,
    workMode,
    editSelectionMode,
    edgeSelectionTool,
    activeTool,
    activeOperatorType,
    axisConstraint,
    projection,
    displayMode,
    xrayTransparency,
    xrayEditMode: displayMode === 'xray',
    showFaceOrientation,
    showGrid,
    showAxes,
    showLiner,
    barhomeVisible,
    multiSelectTouch,
    screenShiftActive,
    hasSelectedObject,
    canEditSelected,
    hasSelectedComponents,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    saveStatus,
    selectedObjectShading,
    corner: touchSettings.floatingMenuCorner,
    size: touchSettings.floatingMenuSize,
    onUpdateRadialSlot,
    onResetRadialSlot,
    onResetRadialLayout,
    onAddPrimitive,
    onAddLight,
    onSelectTool,
    onGQuickTapMove,
    onChangeAxisConstraint,
    onDuplicateObject,
    onApplyObjectTransform,
    onCenterObjectOrigin,
    onSeparateSelectedGeometry,
    onDeleteObject,
    onSetCameraPreset,
    onFocusSelected,
    onToggleProjection,
    onToggleWorkMode,
    onChangeEditSelectionMode,
    onChangeEdgeSelectionTool,
    onSelectEdgeTopology,
    onToggleXray,
    onSelectDisplayMode,
    onChangeXrayTransparency,
    onToggleFaceOrientation,
    onToggleGrid,
    onToggleAxes,
    onToggleLiner,
    onToggleBarhome,
    onToggleMultiSelectTouch,
    onToggleScreenShift,
    onUndo,
    onRedo,
    onStartOperator,
    onFillSelection,
    onConnectVertexPath,
    onRecalculateOutside,
    onFlipNormals,
    onQuickDissolve,
    onExecuteContextualDelete,
    onMarkSeams,
    onSelectSeams,
    onDeselectSeams,
    proportionalEnabled,
    proportionalConnectedOnly,
    onToggleProportional,
    onToggleProportionalConnected,
    onCycleProportionalFalloff,
    onSelectAll,
    onDeselectAll,
    onSelectAllObjects,
    onDeselectAllObjects,
    onSelectConnected,
    onSetSelectedObjectShading,
    uvQuickState,
    uvActionsRef,
    onCreateProjectModal,
    onOpenProjectModal,
    onSaveProject,
    onSaveAsProjectModal,
    onImportNativeProject,
    onExportNativeProject,
    onImportExternal,
    onExportExternal,
    onImportObj,
    onImportStl,
    onImportJpg,
    onImportPng,
    onExportSelected,
    onExportScene,
    onExportObj,
    onExportStl,
    onReturnToGallery,
    onOpenSettings,
  };

  return (
    <div
      ref={containerRef}
      data-testid="floating-radial-pair-overlay"
      className={`pointer-events-none absolute top-0 bottom-0 z-30 transition-[left,right] duration-200 ease-out ${boundsClassName}`}
    >
      {floatingMenusEnabled && (
        <>
          <FloatingRadialMenu
            {...sharedProps}
            menuKind="barhome"
            layoutScope="barhome"
            slots={touchSettings.barhomeRadialLayout}
            controlledIsOpen={activeMenu === 'barhome'}
            onOpenChange={(open) =>
              setActiveMenu((prev) =>
                open ? 'barhome' : prev === 'barhome' ? null : prev,
              )
            }
            stackIndex={1}
            triggerIcon={<PanelTop className="w-6 h-6" />}
            triggerTitle="Abrir menú radial BARHOME (arrastrar para reubicar)"
            triggerAriaLabel="Abrir menú radial BARHOME"
            triggerTestId="floating-radial-barhome-btn"
            wheelTestId="floating-radial-barhome-wheel"
            customizeTestId="floating-radial-barhome-customize"
            customPos={touchSettings.barhomeFloatingMenuCustomPos}
            onUpdateCustomPos={(pos) =>
              onUpdateTouchSettings({ barhomeFloatingMenuCustomPos: pos })
            }
          />

          <FloatingRadialMenu
            {...sharedProps}
            menuKind="tools"
            layoutScope={toolsScope}
            slots={toolsSlots}
            controlledIsOpen={activeMenu === 'tools'}
            onOpenChange={(open) =>
              setActiveMenu((prev) =>
                open ? 'tools' : prev === 'tools' ? null : prev,
              )
            }
            stackIndex={0}
            triggerIcon={<Aperture className="w-6 h-6" />}
            triggerTitle="Abrir menú radial de herramientas (arrastrar para reubicar)"
            triggerAriaLabel="Abrir menú radial de herramientas"
            triggerTestId="floating-radial-tools-btn"
            wheelTestId="floating-radial-tools-wheel"
            customizeTestId="floating-radial-tools-customize"
            customPos={touchSettings.floatingMenuCustomPos}
            onUpdateCustomPos={(pos) =>
              onUpdateTouchSettings({ floatingMenuCustomPos: pos })
            }
          />
        </>
      )}

      {activeMenu === 'modifiers' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 pointer-events-auto"
          onPointerDown={(event) => {
            event.stopPropagation();
            setActiveMenu(null);
          }}
        />
      )}

      {showModifierMenu && (
        <div className="absolute right-3 top-1/2 z-40 -translate-y-1/2 pointer-events-auto">
          {activeMenu === 'modifiers' && (
            <div
              role="group"
              aria-label="Modificadores de selección"
              className="absolute right-full top-1/2 mr-2 h-[190px] w-[128px] -translate-y-1/2"
            >
              {visibleModifierKeys.map((key) => {
                const active = effectiveModifiers[key];
                const latched = screenModifiers[key];
                const label = key.toUpperCase();
                const position = {
                  ctrl: { left: 0, top: 62 },
                  shift: { left: 56, top: 8 },
                  alt: { left: 56, top: 116 },
                }[key];
                const activeStyle =
                  key === 'shift'
                    ? 'bg-[#16261a] border-[#5ecd6e] text-[#7def8e]'
                    : key === 'ctrl'
                      ? 'bg-[#112738] border-[#38bdf8] text-[#7dd3fc]'
                      : 'bg-[#221a35] border-[#a78bfa] text-[#ddd6fe]';

                return (
                  <button
                    key={key}
                    type="button"
                    data-testid={`floating-radial-modifier-${key}`}
                    aria-pressed={active}
                    aria-label={label}
                    title={`${label} (${isHoldMode ? 'Mantener pulsado' : 'Tocar para activar/desactivar'})`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      if (isHoldMode) {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        heldModifiersRef.current.add(key);
                        onSetModifier(key, true);
                      }
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      if (isHoldMode) releaseHeldModifier(key);
                    }}
                    onPointerCancel={(event) => {
                      event.stopPropagation();
                      if (isHoldMode) releaseHeldModifier(key);
                    }}
                    onLostPointerCapture={() => {
                      if (isHoldMode) releaseHeldModifier(key);
                    }}
                    onClick={() => {
                      if (!isHoldMode) onToggleModifier(key);
                    }}
                    style={position}
                    className={`absolute h-10 w-[68px] rounded-full border text-xs font-bold tracking-wide shadow-lg transition-colors touch-manipulation ${
                      active
                        ? activeStyle
                        : 'bg-[#20232b] hover:bg-[#2a2f3a] border-[#2e3340] text-[#cbd5e1]'
                    } ${latched ? 'ring-1 ring-white/35' : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
              {(['shift', 'ctrl', 'alt'] as TouchModifierKey[]).some(
                (key) => screenModifiers[key],
              ) && (
                <button
                  type="button"
                  data-testid="floating-radial-modifiers-release-all"
                  aria-label="Soltar modificadores"
                  title="Soltar modificadores"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={onReleaseAllModifiers}
                  className="absolute left-[28px] top-[160px] flex h-7 w-[72px] items-center justify-center gap-1 rounded-full border border-[#343947] bg-[#22252e] text-[10px] font-semibold text-[#cbd5e1] hover:bg-[#2d323e]"
                >
                  <X className="h-3 w-3 text-[#5ecd6e]" />
                  Soltar
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            data-testid="floating-radial-modifiers-btn"
            aria-label="Abrir modificadores"
            aria-expanded={activeMenu === 'modifiers'}
            title="Modificadores Ctrl, Shift y Alt"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() =>
              setActiveMenu((previous) =>
                previous === 'modifiers' ? null : 'modifiers',
              )
            }
            className={`relative flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-colors ${
              activeMenu === 'modifiers'
                ? 'border-[#a78bfa] bg-[#29223b] text-[#ddd6fe]'
                : 'border-[#39404e] bg-[#171a21] text-[#d3d8e2] hover:bg-[#252a34]'
            }`}
          >
            <SlidersHorizontal className="h-5 w-5" />
            {(['shift', 'ctrl', 'alt'] as TouchModifierKey[]).some(
              (key) => effectiveModifiers[key],
            ) && (
              <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border border-[#171a21] bg-[#5ecd6e]" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};
