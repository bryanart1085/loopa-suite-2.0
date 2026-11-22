import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture,
  Axis3d,
  Box,
  Camera,
  Check,
  CopyPlus,
  Download,
  FileBox,
  Focus,
  Grid,
  Grid3X3,
  Home,
  Image as ImageIcon,
  Layers,
  Lock,
  PanelRight,
  PanelTop,
  Plus,
  Settings,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import {
  DeleteActionType,
  EdgeSelectionTool,
} from '../core/mesh/advancedOperations';
import { EditSelectionMode } from '../core/mesh/operations';
import { PrimitiveOptions, PrimitiveType } from '../core/mesh/primitives';
import {
  AxisConstraint,
  CameraProjection,
  FloatingMenuCorner,
  FloatingMenuSize,
  LightType,
  ObjectShadingMode,
  SaveStatus,
  TransformTool,
  ViewportDisplayMode,
  WorkMode,
} from '../core/project/types';
import {
  RADIAL_ACTION_MAP,
  RadialActionDefinition,
  RadialActionId,
  RadialLayoutScope,
  RadialMenuKind,
  RadialSlotList,
} from '../core/radial/radialActions';
import { CameraPreset } from '../engine/ViewportEngine';
import { EditOperatorType } from '../state/useModelerStore';
import { PrimitiveMenu } from './PrimitiveMenu';
import { RadialActionIcon } from './RadialActionIcon';
import { RadialSlotEditorModal } from './RadialSlotEditorModal';
import type { WorkspaceId } from './TopBar';
import type { UVQuickAccessState, UVWorkspaceHandle } from './UVWorkspace';
import {
  DISPLAY_MODES,
  getXrayDescriptor,
  ShadingModeIcon,
  XRAY_PRESETS,
} from './ViewportDisplaySelector';

type RadialSubPickerType =
  | 'primitives'
  | 'barhome_import'
  | 'barhome_export'
  | 'barhome_views'
  | 'barhome_display';

export interface FloatingRadialMenuProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  menuKind?: RadialMenuKind;
  layoutScope: RadialLayoutScope;
  slots: RadialSlotList;
  activeWorkspace?: WorkspaceId;
  controlledIsOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  stackIndex?: 0 | 1;
  triggerIcon?: React.ReactNode;
  triggerTitle?: string;
  triggerAriaLabel?: string;
  triggerTestId?: string;
  wheelTestId?: string;
  customizeTestId?: string;

  // Layout & Tools State
  workMode: WorkMode;
  editSelectionMode: EditSelectionMode;
  edgeSelectionTool?: EdgeSelectionTool;
  activeTool: TransformTool;
  activeOperatorType?: EditOperatorType | null;
  axisConstraint: AxisConstraint;
  projection: CameraProjection;
  displayMode?: ViewportDisplayMode;
  xrayTransparency?: number;
  xrayEditMode: boolean;
  showFaceOrientation: boolean;
  showGrid: boolean;
  showAxes?: boolean;
  showLiner?: boolean;
  barhomeVisible?: boolean;
  multiSelectTouch: boolean;
  screenShiftActive: boolean;
  hasSelectedObject: boolean;
  canEditSelected: boolean;
  hasSelectedComponents: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges?: boolean;
  saveStatus?: SaveStatus;
  selectedObjectShading?: ObjectShadingMode | null;

  // Appearance & Position
  corner: FloatingMenuCorner;
  size: FloatingMenuSize;
  customPos: { xPct: number; yPct: number } | null;
  onUpdateCustomPos: (pos: { xPct: number; yPct: number }) => void;

  // Customization handlers
  onUpdateRadialSlot: (
    scope: RadialLayoutScope,
    slotIndex: number,
    actionId: RadialActionId | null,
  ) => void;
  onResetRadialSlot: (scope: RadialLayoutScope, slotIndex: number) => void;
  onResetRadialLayout: (scope: RadialLayoutScope) => void;

  // Tool handlers
  onAddPrimitive: (type: PrimitiveType, options?: PrimitiveOptions) => void;
  onAddLight?: (type: LightType) => void;
  onSelectTool: (tool: TransformTool) => void;
  onGQuickTapMove?: () => void;
  onChangeAxisConstraint: (axis: AxisConstraint) => void;
  onDuplicateObject: () => void;
  onApplyObjectTransform?: () => void;
  onCenterObjectOrigin?: () => void;
  onSeparateSelectedGeometry?: () => void;
  onDeleteObject: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onFocusSelected?: () => void;
  onToggleProjection: () => void;
  onToggleWorkMode: (mode: WorkMode) => void;
  onChangeEditSelectionMode: (mode: EditSelectionMode) => void;
  onChangeEdgeSelectionTool?: (tool: EdgeSelectionTool) => void;
  onSelectEdgeTopology?: (kind: 'loop' | 'ring') => void;
  onToggleXray: () => void;
  onSelectDisplayMode?: (mode: ViewportDisplayMode) => void;
  onChangeXrayTransparency?: (value: number) => void;
  onToggleFaceOrientation: () => void;
  onToggleGrid: () => void;
  onToggleAxes?: () => void;
  onToggleLiner?: () => void;
  onToggleBarhome?: () => void;
  onToggleMultiSelectTouch: () => void;
  onToggleScreenShift: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onStartOperator: (type: EditOperatorType) => void;
  onFillSelection: () => void;
  onConnectVertexPath: () => void;
  onRecalculateOutside: () => void;
  onFlipNormals: () => void;
  onQuickDissolve: () => void;
  onExecuteContextualDelete: (action: DeleteActionType) => void;
  onMarkSeams?: (isSeam: boolean) => void;
  onSelectSeams?: () => void;
  onDeselectSeams?: () => void;
  proportionalEnabled: boolean;
  proportionalConnectedOnly: boolean;
  onToggleProportional: () => void;
  onToggleProportionalConnected: () => void;
  onCycleProportionalFalloff?: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectAllObjects?: () => void;
  onDeselectAllObjects?: () => void;
  onSelectConnected?: () => void;
  onSetSelectedObjectShading?: (shading: ObjectShadingMode) => void;

  // UV context
  uvQuickState?: UVQuickAccessState | null;
  uvActionsRef?: React.RefObject<UVWorkspaceHandle | null>;

  // BARHOME handlers
  demoMode?: boolean;
  onCreateProjectModal?: () => void;
  onOpenProjectModal?: () => void;
  onSaveProject: () => void;
  onSaveAsProjectModal?: () => void;
  onImportNativeProject?: () => void;
  onExportNativeProject?: () => void;
  onImportExternal?: () => void;
  onExportExternal?: () => void;
  onImportObj?: () => void;
  onImportStl?: () => void;
  onImportJpg?: () => void;
  onImportPng?: () => void;
  onExportSelected?: () => void;
  onExportScene?: () => void;
  onExportObj?: () => void;
  onExportStl?: () => void;
  onReturnToGallery?: () => void;
  onOpenSettings: () => void;
}

const SIZE_PX: Record<FloatingMenuSize, number> = {
  small: 48,
  medium: 56,
  large: 64,
};

const RING_RADIUS: Record<FloatingMenuSize, number> = {
  small: 112,
  medium: 128,
  large: 142,
};

const SLOT_LONG_PRESS_MS = 450;

const CAMERA_VIEW_PRESETS: {
  id: CameraPreset;
  label: string;
}[] = [
  { id: 'front', label: 'Frontal' },
  { id: 'back', label: 'Posterior' },
  { id: 'right', label: 'Lat. Der.' },
  { id: 'left', label: 'Lat. Izq.' },
  { id: 'top', label: 'Superior' },
  { id: 'bottom', label: 'Inferior' },
];

export const FloatingRadialMenu: React.FC<FloatingRadialMenuProps> = ({
  containerRef,
  demoMode = false,
  menuKind = 'tools',
  layoutScope,
  slots,
  activeWorkspace = 'layout',
  controlledIsOpen,
  onOpenChange,
  stackIndex = 0,
  triggerIcon,
  triggerTitle,
  triggerAriaLabel,
  triggerTestId,
  wheelTestId,
  customizeTestId,
  workMode,
  editSelectionMode,
  activeTool,
  activeOperatorType = null,
  axisConstraint,
  projection,
  displayMode = 'solid',
  xrayTransparency = 50,
  xrayEditMode,
  showFaceOrientation,
  showGrid,
  showAxes = true,
  showLiner = false,
  barhomeVisible = true,
  multiSelectTouch,
  screenShiftActive,
  hasSelectedObject,
  canEditSelected,
  hasSelectedComponents,
  canUndo,
  canRedo,
  hasUnsavedChanges = false,
  saveStatus = 'saved',
  selectedObjectShading = null,
  corner,
  size,
  customPos,
  onUpdateCustomPos,
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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : uncontrolledOpen;

  const setOpenState = (next: boolean) => {
    if (!next) {
      setActiveSubPicker(null);
      setCustomizeMode(false);
    }
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };

  const [activeSubPicker, setActiveSubPicker] =
    useState<RadialSubPickerType | null>(null);
  const [customizeMode, setCustomizeMode] = useState(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const slotHoldRef = useRef<{
    slotIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    timer: number | null;
    triggered: boolean;
  } | null>(null);

  const btnSize = SIZE_PX[size];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setViewportSize({
        width: Math.max(240, el.clientWidth),
        height: Math.max(240, el.clientHeight),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const ghostCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveSubPicker(null);
      setCustomizeMode(false);
      setEditingSlotIndex(null);
      clearSlotHold();
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveSubPicker(null);
  }, [workMode, activeWorkspace]);

  useEffect(() => {
    return () => {
      if (slotHoldRef.current?.timer != null) {
        window.clearTimeout(slotHoldRef.current.timer);
      }
      ghostCleanupRef.current?.();
      ghostCleanupRef.current = null;
    };
  }, []);

  const clearSlotHold = () => {
    if (slotHoldRef.current?.timer != null) {
      window.clearTimeout(slotHoldRef.current.timer);
      slotHoldRef.current.timer = null;
    }
  };

  const buttonPos = useMemo(() => {
    const padX = 16;
    const padTop = 58;
    const padBottom = 16;
    const maxX = Math.max(padX, viewportSize.width - btnSize - padX);
    const maxY = Math.max(padTop, viewportSize.height - btnSize - padBottom);
    const stackStep = btnSize + 12;

    if (dragPos) {
      return {
        x: Math.max(8, Math.min(viewportSize.width - btnSize - 8, dragPos.x)),
        y: Math.max(8, Math.min(viewportSize.height - btnSize - 8, dragPos.y)),
      };
    }

    if (customPos) {
      return {
        x: Math.max(
          8,
          Math.min(
            viewportSize.width - btnSize - 8,
            customPos.xPct * viewportSize.width - btnSize / 2,
          ),
        ),
        y: Math.max(
          8,
          Math.min(
            viewportSize.height - btnSize - 8,
            customPos.yPct * viewportSize.height - btnSize / 2,
          ),
        ),
      };
    }

    const stackOffset = stackIndex * stackStep;

    switch (corner) {
      case 'top-left':
        return {
          x: padX,
          y: Math.min(maxY, padTop + stackOffset),
        };
      case 'top-right':
        return {
          x: maxX,
          y: Math.min(maxY, padTop + stackOffset),
        };
      case 'bottom-left':
        return {
          x: padX,
          y: Math.max(padTop, maxY - stackOffset),
        };
      case 'bottom-right':
      default:
        return {
          x: maxX,
          y: Math.max(padTop, maxY - stackOffset),
        };
    }
  }, [btnSize, corner, customPos, dragPos, stackIndex, viewportSize]);

  const effectiveRadius = useMemo(() => {
    const maxAllowed = Math.min(viewportSize.width, viewportSize.height) / 2 - 54;
    return Math.max(86, Math.min(RING_RADIUS[size], maxAllowed));
  }, [size, viewportSize]);

  const wheelCenter = useMemo(() => {
    const rawCx = buttonPos.x + btnSize / 2;
    const rawCy = buttonPos.y + btnSize / 2;
    const safeMargin = effectiveRadius + 46;
    return {
      x: Math.max(
        safeMargin,
        Math.min(viewportSize.width - safeMargin, rawCx),
      ),
      y: Math.max(
        safeMargin + 16,
        Math.min(viewportSize.height - safeMargin - 20, rawCy),
      ),
    };
  }, [btnSize, buttonPos, effectiveRadius, viewportSize]);

  const quickDeleteAction: DeleteActionType =
    editSelectionMode === 'vertex'
      ? 'delete_vertices'
      : editSelectionMode === 'edge'
        ? 'delete_edges'
        : 'delete_only_faces';

  const hasUVMesh = Boolean(uvQuickState?.hasMesh);
  const uvToolsDisabled =
    !hasUVMesh || (activeWorkspace === 'uv_editing' && workMode !== 'edit');

  const getActionMetaState = (
    def: RadialActionDefinition,
  ): { active: boolean; disabled: boolean; label: string } => {
    let active = false;
    let disabled = false;
    let label = def.shortLabel;

    switch (def.id) {
      // BARHOME actions
      case 'barhome_open_import_menu':
        active = activeSubPicker === 'barhome_import';
        break;
      case 'barhome_open_export_menu':
        active = activeSubPicker === 'barhome_export';
        break;
      case 'barhome_open_views_menu':
        active = activeSubPicker === 'barhome_views';
        break;
      case 'barhome_open_display_menu':
        active = activeSubPicker === 'barhome_display';
        break;
      case 'save_project':
        active = saveStatus === 'unsaved' || hasUnsavedChanges;
        break;
      case 'barhome_export_selected':
        disabled = !hasSelectedObject;
        break;
      case 'display_solid':
        active = displayMode === 'solid';
        break;
      case 'display_wireframe':
        active = displayMode === 'wireframe';
        break;
      case 'display_material':
        active = displayMode === 'material';
        break;
      case 'barhome_toggle_axes':
        active = showAxes;
        break;
      case 'barhome_toggle_liner':
        active = showLiner;
        break;
      case 'barhome_toggle_barhome':
        active = barhomeVisible;
        break;

      // Layout Object / Edit tools
      case 'open_add_menu':
        active = activeSubPicker === 'primitives';
        disabled = activeWorkspace !== 'layout' || workMode !== 'object';
        break;
      case 'add_plane':
      case 'add_cube':
      case 'add_circle':
      case 'add_uv_sphere':
      case 'add_cylinder':
      case 'add_cone':
      case 'add_torus':
      case 'add_pyramid':
      case 'add_suzanne':
        disabled = activeWorkspace !== 'layout' || workMode !== 'object';
        break;
      case 'tool_select':
        active = activeTool === 'select' && !activeOperatorType;
        break;
      case 'tool_move':
        active = activeTool === 'move' && !activeOperatorType;
        break;
      case 'tool_rotate':
        active = activeTool === 'rotate' && !activeOperatorType;
        break;
      case 'tool_scale':
        active = activeTool === 'scale' && !activeOperatorType;
        break;
      case 'tool_g_move':
        disabled = activeWorkspace !== 'layout' || !hasSelectedObject;
        break;
      case 'axis_free':
        active = axisConstraint === 'free';
        break;
      case 'axis_x':
        active = axisConstraint === 'x';
        break;
      case 'axis_y':
        active = axisConstraint === 'y';
        break;
      case 'axis_z':
        active = axisConstraint === 'z';
        break;
      case 'duplicate_object':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'object' ||
          !hasSelectedObject;
        break;
      case 'apply_object_transform':
      case 'center_object_origin':
        disabled = activeWorkspace !== 'layout' || !canEditSelected;
        break;
      case 'separate_geometry':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          !canEditSelected ||
          !hasSelectedComponents;
        break;
      case 'delete_contextual':
        disabled =
          activeWorkspace !== 'layout' ||
          (workMode === 'object' ? !hasSelectedObject : !hasSelectedComponents);
        break;
      case 'dissolve_quick':
      case 'delete_edges_verts':
      case 'delete_faces_edges':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          !hasSelectedComponents;
        break;
      case 'op_extrude':
      case 'op_inset':
      case 'op_subdivide':
      case 'op_bevel':
      case 'op_loop_cut':
      case 'op_merge':
      case 'op_merge_by_distance':
      case 'op_bridge_loops':
      case 'fill_mesh':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          !hasSelectedComponents;
        break;
      case 'op_dissolve_limited':
        disabled = activeWorkspace !== 'layout' || workMode !== 'edit';
        break;
      case 'select_edge_loop':
      case 'select_connected':
      case 'uv_mark_seam':
      case 'uv_clear_seam':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          !hasSelectedComponents;
        break;
      case 'uv_select_seams':
      case 'uv_deselect_seams':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          !canEditSelected;
        break;
      case 'connect_vertex_path':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          editSelectionMode !== 'vertex' ||
          !hasSelectedComponents;
        break;
      case 'op_recalculate_normals':
      case 'op_flip_normals':
        disabled = activeWorkspace !== 'layout' || workMode !== 'edit';
        break;
      case 'select_all':
        disabled = activeWorkspace !== 'layout';
        break;
      case 'deselect_all':
        disabled =
          activeWorkspace !== 'layout' ||
          (workMode === 'edit' ? !hasSelectedComponents : !hasSelectedObject);
        break;
      case 'mode_vertex':
        active = workMode === 'edit' && editSelectionMode === 'vertex';
        disabled = activeWorkspace !== 'layout' || workMode !== 'edit';
        break;
      case 'mode_edge':
        active = workMode === 'edit' && editSelectionMode === 'edge';
        disabled = activeWorkspace !== 'layout' || workMode !== 'edit';
        break;
      case 'mode_face':
        active = workMode === 'edit' && editSelectionMode === 'face';
        disabled = activeWorkspace !== 'layout' || workMode !== 'edit';
        break;
      case 'toggle_multi_select':
        active = multiSelectTouch;
        disabled = activeWorkspace !== 'layout' || workMode !== 'edit';
        break;
      case 'toggle_shift_modifier':
        active = screenShiftActive;
        disabled = activeWorkspace !== 'layout';
        break;
      case 'work_object':
        active = workMode === 'object';
        break;
      case 'work_edit':
        active = workMode === 'edit';
        disabled = workMode !== 'edit' && !canEditSelected;
        break;
      case 'toggle_xray':
        active = xrayEditMode;
        break;
      case 'toggle_face_orientation':
        active = showFaceOrientation;
        break;
      case 'toggle_proportional':
        active = proportionalEnabled;
        disabled = activeWorkspace !== 'layout' || workMode !== 'edit';
        break;
      case 'toggle_proportional_connected':
        active = proportionalConnectedOnly;
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          !proportionalEnabled;
        break;
      case 'cycle_proportional_falloff':
        disabled =
          activeWorkspace !== 'layout' ||
          workMode !== 'edit' ||
          !proportionalEnabled;
        break;
      case 'toggle_grid':
        active = showGrid;
        break;
      case 'toggle_projection':
        label = projection === 'perspective' ? 'Orto.' : 'Persp.';
        break;

      // UV tools
      case 'uv_mode_vertex':
        active = uvQuickState?.selectionMode === 'vertex';
        disabled = uvToolsDisabled;
        break;
      case 'uv_mode_edge':
        active = uvQuickState?.selectionMode === 'edge';
        disabled = uvToolsDisabled;
        break;
      case 'uv_mode_face':
        active = uvQuickState?.selectionMode === 'face';
        disabled = uvToolsDisabled;
        break;
      case 'uv_mode_island':
        active = uvQuickState?.selectionMode === 'island';
        disabled = uvToolsDisabled;
        break;
      case 'uv_tool_move':
        active =
          Boolean(uvQuickState) &&
          !uvQuickState?.boxSelectActive &&
          uvQuickState?.transformTool === 'move';
        disabled = uvToolsDisabled;
        break;
      case 'uv_tool_rotate':
        active =
          Boolean(uvQuickState) &&
          !uvQuickState?.boxSelectActive &&
          uvQuickState?.transformTool === 'rotate';
        disabled = uvToolsDisabled;
        break;
      case 'uv_tool_scale':
        active =
          Boolean(uvQuickState) &&
          !uvQuickState?.boxSelectActive &&
          uvQuickState?.transformTool === 'scale';
        disabled = uvToolsDisabled;
        break;
      case 'uv_box_select':
        active = Boolean(uvQuickState?.boxSelectActive);
        disabled = uvToolsDisabled;
        break;
      case 'uv_toggle_checker':
        active = Boolean(uvQuickState?.showChecker);
        disabled = uvToolsDisabled;
        break;
      case 'uv_sync_to_3d':
        disabled = uvToolsDisabled || !uvQuickState?.canSyncTo3D;
        break;
      case 'uv_unwrap':
      case 'uv_planar':
      case 'uv_cylindrical':
      case 'uv_spherical':
      case 'uv_pack':
      case 'uv_select_all':
      case 'uv_deselect_all':
      case 'uv_invert_selection':
      case 'uv_sync_from_3d':
        disabled = uvToolsDisabled;
        break;

      // Materials Shading
      case 'mat_shading_flat':
        active = selectedObjectShading === 'flat';
        disabled = !selectedObjectShading;
        break;
      case 'mat_shading_smooth':
        active = selectedObjectShading === 'smooth';
        disabled = !selectedObjectShading;
        break;

      case 'undo':
        disabled = !canUndo;
        break;
      case 'redo':
        disabled = !canRedo;
        break;
      default:
        break;
    }

    return { active, disabled, label };
  };

  const closeAll = () => {
    setOpenState(false);
  };

  const toggleSubPicker = (picker: RadialSubPickerType) => {
    setActiveSubPicker((prev) => (prev === picker ? null : picker));
  };

  const executeRadialAction = (actionId: RadialActionId) => {
    switch (actionId) {
      // BARHOME actions
      case 'barhome_new_project':
        closeAll();
        onCreateProjectModal?.();
        break;
      case 'barhome_open_project':
        closeAll();
        onOpenProjectModal?.();
        break;
      case 'save_project':
        onSaveProject();
        closeAll();
        break;
      case 'barhome_save_as':
        closeAll();
        onSaveAsProjectModal?.();
        break;
      case 'barhome_open_import_menu':
        toggleSubPicker('barhome_import');
        break;
      case 'barhome_import_project':
        closeAll();
        onImportNativeProject?.();
        break;
      case 'barhome_import_obj':
        closeAll();
        onImportObj?.();
        break;
      case 'barhome_import_stl':
        closeAll();
        onImportStl?.();
        break;
      case 'barhome_import_jpg':
        closeAll();
        onImportJpg?.();
        break;
      case 'barhome_import_png':
        closeAll();
        onImportPng?.();
        break;
      case 'barhome_open_export_menu':
        toggleSubPicker('barhome_export');
        break;
      case 'barhome_export_project':
        closeAll();
        onExportNativeProject?.();
        break;
      case 'barhome_export_selected':
        closeAll();
        onExportSelected?.();
        break;
      case 'barhome_export_scene':
        closeAll();
        onExportScene?.();
        break;
      case 'barhome_export_obj':
        closeAll();
        onExportObj?.();
        break;
      case 'barhome_export_stl':
        closeAll();
        onExportStl?.();
        break;
      case 'barhome_return_gallery':
        closeAll();
        onReturnToGallery?.();
        break;
      case 'barhome_open_views_menu':
        toggleSubPicker('barhome_views');
        break;
      case 'barhome_open_display_menu':
        toggleSubPicker('barhome_display');
        break;
      case 'display_solid':
        onSelectDisplayMode?.('solid');
        closeAll();
        break;
      case 'display_wireframe':
        onSelectDisplayMode?.('wireframe');
        closeAll();
        break;
      case 'display_material':
        if (onSelectDisplayMode) {
          onSelectDisplayMode(
            displayMode === 'material' && menuKind === 'tools'
              ? 'solid'
              : 'material',
          );
        }
        closeAll();
        break;
      case 'barhome_toggle_axes':
        onToggleAxes?.();
        closeAll();
        break;
      case 'barhome_toggle_liner':
        onToggleLiner?.();
        closeAll();
        break;
      case 'barhome_toggle_barhome':
        onToggleBarhome?.();
        closeAll();
        break;

      // Camera views & projection
      case 'focus_camera':
        if (onFocusSelected) onFocusSelected();
        else onSetCameraPreset('focus');
        closeAll();
        break;
      case 'view_iso':
        onSetCameraPreset('iso');
        closeAll();
        break;
      case 'view_front':
        onSetCameraPreset('front');
        closeAll();
        break;
      case 'view_back':
        onSetCameraPreset('back');
        closeAll();
        break;
      case 'view_left':
        onSetCameraPreset('left');
        closeAll();
        break;
      case 'view_top':
        onSetCameraPreset('top');
        closeAll();
        break;
      case 'view_bottom':
        onSetCameraPreset('bottom');
        closeAll();
        break;
      case 'view_right':
        onSetCameraPreset('right');
        closeAll();
        break;
      case 'toggle_projection':
        onToggleProjection();
        closeAll();
        break;

      // Selection & Sub-modes
      case 'select_all':
        if (workMode === 'edit') {
          onSelectAll();
        } else {
          onSelectAllObjects?.();
        }
        closeAll();
        break;
      case 'deselect_all':
        if (workMode === 'edit') {
          onDeselectAll();
        } else {
          onDeselectAllObjects?.();
        }
        closeAll();
        break;
      case 'select_connected':
        onSelectConnected?.();
        closeAll();
        break;
      case 'mode_vertex':
        onChangeEditSelectionMode('vertex');
        closeAll();
        break;
      case 'mode_edge':
        onChangeEditSelectionMode('edge');
        closeAll();
        break;
      case 'mode_face':
        onChangeEditSelectionMode('face');
        closeAll();
        break;
      case 'toggle_multi_select':
        onToggleMultiSelectTouch();
        closeAll();
        break;
      case 'toggle_shift_modifier':
        onToggleScreenShift();
        closeAll();
        break;

      // Transform tools
      case 'tool_select':
        onSelectTool('select');
        closeAll();
        break;
      case 'tool_move':
        onSelectTool('move');
        closeAll();
        break;
      case 'tool_rotate':
        onSelectTool('rotate');
        closeAll();
        break;
      case 'tool_scale':
        onSelectTool('scale');
        closeAll();
        break;
      case 'tool_g_move':
        closeAll();
        onGQuickTapMove?.();
        break;
      case 'axis_free':
        onChangeAxisConstraint('free');
        closeAll();
        break;
      case 'axis_x':
        onChangeAxisConstraint('x');
        closeAll();
        break;
      case 'axis_y':
        onChangeAxisConstraint('y');
        closeAll();
        break;
      case 'axis_z':
        onChangeAxisConstraint('z');
        closeAll();
        break;

      // Creation
      case 'open_add_menu':
        toggleSubPicker('primitives');
        break;
      case 'add_plane':
        onAddPrimitive('plane');
        closeAll();
        break;
      case 'add_cube':
        onAddPrimitive('cube');
        closeAll();
        break;
      case 'add_circle':
        onAddPrimitive('circle');
        closeAll();
        break;
      case 'add_uv_sphere':
        onAddPrimitive('uv_sphere');
        closeAll();
        break;
      case 'add_cylinder':
        onAddPrimitive('cylinder');
        closeAll();
        break;
      case 'add_cone':
        onAddPrimitive('cone');
        closeAll();
        break;
      case 'add_torus':
        onAddPrimitive('torus');
        closeAll();
        break;
      case 'add_pyramid':
        onAddPrimitive('pyramid');
        closeAll();
        break;
      case 'add_suzanne':
        onAddPrimitive('suzanne');
        closeAll();
        break;
      case 'fill_mesh':
        onFillSelection();
        closeAll();
        break;
      case 'connect_vertex_path':
        onConnectVertexPath();
        closeAll();
        break;
      case 'op_recalculate_normals':
        onRecalculateOutside();
        closeAll();
        break;
      case 'op_flip_normals':
        onFlipNormals();
        closeAll();
        break;
      case 'op_extrude':
        onStartOperator('extrude');
        closeAll();
        break;
      case 'op_inset':
        onStartOperator('inset');
        closeAll();
        break;
      case 'op_subdivide':
        onStartOperator('subdivide');
        closeAll();
        break;
      case 'op_bevel':
        onStartOperator('bevel');
        closeAll();
        break;
      case 'op_loop_cut':
        onStartOperator('loop_cut');
        closeAll();
        break;
      case 'op_merge':
        onStartOperator('merge');
        closeAll();
        break;
      case 'op_merge_by_distance':
        onStartOperator('merge_by_distance');
        closeAll();
        break;
      case 'op_bridge_loops':
        onStartOperator('bridge_loops');
        closeAll();
        break;
      case 'op_dissolve_limited':
        onStartOperator('dissolve_limited');
        closeAll();
        break;
      case 'select_edge_loop':
        onSelectEdgeTopology?.('loop');
        closeAll();
        break;
      case 'duplicate_object':
        onDuplicateObject();
        closeAll();
        break;
      case 'apply_object_transform':
        onApplyObjectTransform?.();
        closeAll();
        break;
      case 'center_object_origin':
        onCenterObjectOrigin?.();
        closeAll();
        break;
      case 'separate_geometry':
        onSeparateSelectedGeometry?.();
        closeAll();
        break;
      case 'uv_mark_seam':
        onMarkSeams?.(true);
        closeAll();
        break;
      case 'uv_clear_seam':
        onMarkSeams?.(false);
        closeAll();
        break;
      case 'uv_select_seams':
        onSelectSeams?.();
        closeAll();
        break;
      case 'uv_deselect_seams':
        onDeselectSeams?.();
        closeAll();
        break;
      case 'delete_contextual':
        if (workMode === 'object') {
          onDeleteObject();
        } else {
          onExecuteContextualDelete(quickDeleteAction);
        }
        closeAll();
        break;
      case 'dissolve_quick':
        onQuickDissolve();
        closeAll();
        break;
      case 'delete_edges_verts':
        onExecuteContextualDelete('delete_edges_and_vertices');
        closeAll();
        break;
      case 'delete_faces_edges':
        onExecuteContextualDelete('delete_faces_and_edges');
        closeAll();
        break;

      // UV Workspace Tools
      case 'uv_mode_vertex':
        uvActionsRef?.current?.setSelectionMode('vertex');
        closeAll();
        break;
      case 'uv_mode_edge':
        uvActionsRef?.current?.setSelectionMode('edge');
        closeAll();
        break;
      case 'uv_mode_face':
        uvActionsRef?.current?.setSelectionMode('face');
        closeAll();
        break;
      case 'uv_mode_island':
        uvActionsRef?.current?.setSelectionMode('island');
        closeAll();
        break;
      case 'uv_tool_move':
        uvActionsRef?.current?.setTransformTool('move');
        closeAll();
        break;
      case 'uv_tool_rotate':
        uvActionsRef?.current?.setTransformTool('rotate');
        closeAll();
        break;
      case 'uv_tool_scale':
        uvActionsRef?.current?.setTransformTool('scale');
        closeAll();
        break;
      case 'uv_box_select':
        uvActionsRef?.current?.toggleBoxSelect();
        closeAll();
        break;
      case 'uv_unwrap':
        uvActionsRef?.current?.unwrap('unwrap');
        closeAll();
        break;
      case 'uv_planar':
        uvActionsRef?.current?.unwrap('planar');
        closeAll();
        break;
      case 'uv_cylindrical':
        uvActionsRef?.current?.unwrap('cylindrical');
        closeAll();
        break;
      case 'uv_spherical':
        uvActionsRef?.current?.unwrap('spherical');
        closeAll();
        break;
      case 'uv_pack':
        uvActionsRef?.current?.pack();
        closeAll();
        break;
      case 'uv_toggle_checker':
        uvActionsRef?.current?.toggleChecker();
        closeAll();
        break;
      case 'uv_select_all':
        uvActionsRef?.current?.selectAll();
        closeAll();
        break;
      case 'uv_deselect_all':
        uvActionsRef?.current?.deselectAll();
        closeAll();
        break;
      case 'uv_invert_selection':
        uvActionsRef?.current?.invertSelection();
        closeAll();
        break;
      case 'uv_sync_from_3d':
        uvActionsRef?.current?.syncFrom3D();
        closeAll();
        break;
      case 'uv_sync_to_3d':
        uvActionsRef?.current?.syncTo3D();
        closeAll();
        break;

      // Materials shading
      case 'mat_shading_flat':
        onSetSelectedObjectShading?.('flat');
        closeAll();
        break;
      case 'mat_shading_smooth':
        onSetSelectedObjectShading?.('smooth');
        closeAll();
        break;

      // History & General
      case 'undo':
        onUndo();
        closeAll();
        break;
      case 'redo':
        onRedo();
        closeAll();
        break;
      case 'work_object':
        onToggleWorkMode('object');
        closeAll();
        break;
      case 'work_edit':
        onToggleWorkMode('edit');
        closeAll();
        break;
      case 'toggle_xray':
        onToggleXray();
        closeAll();
        break;
      case 'toggle_face_orientation':
        onToggleFaceOrientation();
        closeAll();
        break;
      case 'toggle_proportional':
        onToggleProportional();
        closeAll();
        break;
      case 'toggle_proportional_connected':
        onToggleProportionalConnected();
        closeAll();
        break;
      case 'cycle_proportional_falloff':
        onCycleProportionalFalloff?.();
        closeAll();
        break;
      case 'toggle_grid':
        onToggleGrid();
        closeAll();
        break;
      case 'open_settings':
        closeAll();
        onOpenSettings();
        break;
    }
  };

  const handleTriggerPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isOpen) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: buttonPos.x,
      origY: buttonPos.y,
      moved: false,
    };
  };

  const handleTriggerPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (!d.moved && Math.hypot(dx, dy) > 8) {
      d.moved = true;
    }
    if (d.moved) {
      setDragPos({
        x: d.origX + dx,
        y: d.origY + dy,
      });
    }
  };

  const handleTriggerPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (d && d.moved) {
      const clampedX = Math.max(
        8,
        Math.min(
          viewportSize.width - btnSize - 8,
          d.origX + (e.clientX - d.startClientX),
        ),
      );
      const clampedY = Math.max(
        8,
        Math.min(
          viewportSize.height - btnSize - 8,
          d.origY + (e.clientY - d.startClientY),
        ),
      );
      setDragPos(null);
      onUpdateCustomPos({
        xPct: (clampedX + btnSize / 2) / viewportSize.width,
        yPct: (clampedY + btnSize / 2) / viewportSize.height,
      });
      return;
    }

    setActiveSubPicker(null);
    setCustomizeMode(false);
    setOpenState(!isOpen);
  };

  const handleTriggerPointerCancel = (
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    dragRef.current = null;
    setDragPos(null);
  };

  const handleSlotPointerDown = (
    slotIndex: number,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    clearSlotHold();
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const timer = window.setTimeout(() => {
      if (slotHoldRef.current && slotHoldRef.current.slotIndex === slotIndex) {
        slotHoldRef.current.triggered = true;
        slotHoldRef.current.timer = null;

        // Guard against the synthetic click generated when the user lifts their finger
        // after long-press already mounted RadialSlotEditorModal under the pointer.
        ghostCleanupRef.current?.();
        let lifted = false;
        let expireTimer: number | null = null;
        const cleanup = () => {
          window.removeEventListener('pointerup', onUp, true);
          window.removeEventListener('pointercancel', cleanup, true);
          window.removeEventListener('click', onClick, true);
          if (expireTimer !== null) window.clearTimeout(expireTimer);
          if (ghostCleanupRef.current === cleanup) {
            ghostCleanupRef.current = null;
          }
        };
        const onUp = (upEvt: PointerEvent) => {
          if (upEvt.pointerId !== pointerId) return;
          lifted = true;
          expireTimer = window.setTimeout(cleanup, 180);
        };
        const onClick = (clickEvt: MouseEvent) => {
          if (
            lifted &&
            Math.hypot(clickEvt.clientX - startX, clickEvt.clientY - startY) < 28
          ) {
            clickEvt.preventDefault();
            clickEvt.stopPropagation();
            clickEvt.stopImmediatePropagation();
            cleanup();
          }
        };
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', cleanup, true);
        window.addEventListener('click', onClick, true);
        ghostCleanupRef.current = cleanup;

        setActiveSubPicker(null);
        setEditingSlotIndex(slotIndex);
      }
    }, SLOT_LONG_PRESS_MS);

    slotHoldRef.current = {
      slotIndex,
      pointerId,
      startX,
      startY,
      timer,
      triggered: false,
    };
  };

  const handleSlotPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const hold = slotHoldRef.current;
    if (!hold || hold.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - hold.startX, e.clientY - hold.startY) > 10) {
      clearSlotHold();
    }
  };

  const handleSlotPointerUpOrCancel = () => {
    clearSlotHold();
  };

  const resolvedTitle =
    triggerTitle ??
    (menuKind === 'barhome'
      ? 'Abrir menú radial BARHOME (arrastrar para reubicar)'
      : 'Abrir menú radial de herramientas (arrastrar para reubicar)');

  const resolvedAriaLabel =
    triggerAriaLabel ??
    (menuKind === 'barhome'
      ? 'Abrir menú radial BARHOME'
      : 'Abrir menú radial de herramientas');

  const popoverLeft = Math.max(
    12,
    Math.min(viewportSize.width - 300, wheelCenter.x - 144),
  );
  const popoverTop = Math.max(12, Math.min(viewportSize.height - 380, 16));

  return (
    <>
      {/* Backdrop when radial menu is open */}
      {isOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/30 pointer-events-auto transition-opacity duration-150"
          onPointerDown={(e) => {
            e.stopPropagation();
            closeAll();
          }}
        />
      )}

      {/* Draggable Floating Circular Trigger (when closed) */}
      {!isOpen && (
        <button
          type="button"
          data-testid={triggerTestId}
          onPointerDown={handleTriggerPointerDown}
          onPointerMove={handleTriggerPointerMove}
          onPointerUp={handleTriggerPointerUp}
          onPointerCancel={handleTriggerPointerCancel}
          style={{
            width: btnSize,
            height: btnSize,
            left: buttonPos.x,
            top: buttonPos.y,
            touchAction: 'none',
          }}
          className="absolute z-30 pointer-events-auto rounded-full bg-[#181a1f] hover:bg-[#22252d] border-2 border-[#3d424f] shadow-xl flex items-center justify-center text-[#5ecd6e] transition-colors select-none cursor-grab active:cursor-grabbing"
          title={resolvedTitle}
          aria-label={resolvedAriaLabel}
        >
          {triggerIcon ?? <Aperture className="w-6 h-6" />}
        </button>
      )}

      {/* Expanded Radial Wheel Overlay */}
      {isOpen && (
        <>
          <div
            data-testid={wheelTestId}
            style={{
              left: wheelCenter.x,
              top: wheelCenter.y,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute z-40 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          >
            <div className="relative pointer-events-auto transition-transform duration-150 ease-out scale-100">
              {/* Subtle Connecting Ring Guide */}
              <div
                style={{
                  width: effectiveRadius * 2,
                  height: effectiveRadius * 2,
                }}
                className="rounded-full border border-[#3a3f4b]/75 bg-[#14161b]/65 -translate-x-1/2 -translate-y-1/2 absolute left-0 top-0 pointer-events-none"
              />

              {/* Configurable Radial Slots */}
              {slots.map((actionId, idx) => {
                const angle = -Math.PI / 2 + (idx / slots.length) * Math.PI * 2;
                const ix = Math.cos(angle) * effectiveRadius;
                const iy = Math.sin(angle) * effectiveRadius;
                const def = actionId ? RADIAL_ACTION_MAP[actionId] : null;
                const meta = def
                  ? getActionMetaState(def)
                  : { active: false, disabled: false, label: 'Vacío' };

                const isSlotDisabled =
                  !customizeMode && def !== null && meta.disabled;

                return (
                  <button
                    key={`slot-${idx}`}
                    type="button"
                    data-testid={
                      wheelTestId
                        ? `${wheelTestId}-slot-${idx}`
                        : `radial-slot-${idx}`
                    }
                    onPointerDown={(e) => handleSlotPointerDown(idx, e)}
                    onPointerMove={handleSlotPointerMove}
                    onPointerUp={handleSlotPointerUpOrCancel}
                    onPointerCancel={handleSlotPointerUpOrCancel}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingSlotIndex(idx);
                    }}
                    onClick={() => {
                      if (
                        slotHoldRef.current &&
                        slotHoldRef.current.slotIndex === idx &&
                        slotHoldRef.current.triggered
                      ) {
                        slotHoldRef.current = null;
                        return;
                      }
                      if (customizeMode || !def) {
                        setActiveSubPicker(null);
                        setEditingSlotIndex(idx);
                        return;
                      }
                      if (isSlotDisabled) return;
                      executeRadialAction(def.id);
                    }}
                    style={{
                      left: ix,
                      top: iy,
                    }}
                    title={
                      def
                        ? `${def.label} (mantener pulsado para personalizar)`
                        : 'Espacio vacío (tocar o mantener pulsado para asignar)'
                    }
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-[68px] h-[58px] rounded-xl border shadow-lg flex flex-col items-center justify-center gap-1 px-1 transition-transform duration-150 active:scale-95 touch-manipulation ${
                      !def
                        ? 'bg-[#171920]/90 hover:bg-[#232732] border-dashed border-[#3f4554] text-[#7c8496]'
                        : isSlotDisabled
                          ? 'bg-[#1a1c22] border-[#2c303a] text-[#6b7280] opacity-45'
                          : customizeMode
                            ? 'bg-[#212530] hover:bg-[#2b303e] border-[#5ecd6e]/65 text-[#f3f4f6]'
                            : meta.active
                              ? 'bg-[#2c313b] border-[#5ecd6e] text-[#5ecd6e]'
                              : def.danger
                                ? 'bg-[#23191c] hover:bg-[#352024] border-[#593036] text-[#f87171]'
                                : 'bg-[#1c1f26] hover:bg-[#272b35] border-[#383e4c] text-[#e5e7eb]'
                    }`}
                  >
                    {def ? (
                      <RadialActionIcon icon={def.icon} className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span className="text-[10px] font-semibold leading-none tracking-tight truncate max-w-[62px]">
                      {meta.label}
                    </span>
                  </button>
                );
              })}

              {/* Center Hub Close Button + Customize Trigger */}
              <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={closeAll}
                  style={{ width: btnSize, height: btnSize }}
                  className="rounded-full bg-[#242832] hover:bg-[#2d323e] border-2 border-[#5ecd6e]/75 text-[#f3f4f6] shadow-xl flex items-center justify-center transition-colors touch-manipulation"
                  aria-label="Cerrar menú radial"
                >
                  <X className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  data-testid={customizeTestId}
                  onClick={() => {
                    setActiveSubPicker(null);
                    setCustomizeMode((prev) => !prev);
                  }}
                  className={`h-7 px-2.5 rounded-md border text-[10px] font-semibold whitespace-nowrap flex items-center gap-1 shadow-md transition-colors touch-manipulation ${
                    customizeMode
                      ? 'bg-[#5ecd6e] border-[#5ecd6e] text-[#111215]'
                      : 'bg-[#181a1f] hover:bg-[#23262e] border-[#353a46] text-[#b4bac4]'
                  }`}
                  title="Alternar edición rápida del menú radial (o mantén presionado un botón)"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{customizeMode ? 'Editando' : 'Personalizar'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Full Primitive Menu Popover (triggered from Radial 'open_add_menu' slot) */}
          {activeSubPicker === 'primitives' && workMode === 'object' && (
            <div
              style={{ left: popoverLeft, top: popoverTop }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-50 pointer-events-auto"
            >
              <PrimitiveMenu
                onAddPrimitive={(type, options) => {
                  onAddPrimitive(type, options);
                  closeAll();
                }}
                onAddLight={
                  onAddLight
                    ? (type) => {
                        onAddLight(type);
                        closeAll();
                      }
                    : undefined
                }
                onClose={() => setActiveSubPicker(null)}
              />
            </div>
          )}

          {/* BARHOME Sub-Picker Popover: Importar */}
          {activeSubPicker === 'barhome_import' && (
            <div
              style={{ left: popoverLeft, top: popoverTop }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-50 w-[280px] rounded-xl bg-[#181a1f] border border-[#343a47] shadow-2xl p-2 space-y-1.5 pointer-events-auto"
            >
              <div className="px-1.5 py-1 border-b border-[#272b34] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Importar (BARHOME)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSubPicker(null)}
                  className="w-6 h-6 rounded hover:bg-[#272b35] text-[#9ca3af] hover:text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  onImportExternal?.();
                }}
                className="w-full min-h-[38px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#e4e6eb] flex items-center gap-2 text-left transition-colors"
              >
                <Download className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                <span>IMPORTAR</span>
              </button>
            </div>
          )}

          {/* BARHOME Sub-Picker Popover: Exportar & Guardar como */}
          {!demoMode && activeSubPicker === 'barhome_export' && (
            <div
              style={{ left: popoverLeft, top: popoverTop }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-50 w-[280px] rounded-xl bg-[#181a1f] border border-[#343a47] shadow-2xl p-2 space-y-1.5 pointer-events-auto"
            >
              <div className="px-1.5 py-1 border-b border-[#272b34] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Exportar y Guardar como</span>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSubPicker(null)}
                  className="w-6 h-6 rounded hover:bg-[#272b35] text-[#9ca3af] hover:text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  onSaveAsProjectModal?.();
                }}
                className="w-full min-h-[38px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#e4e6eb] flex items-center gap-2 text-left transition-colors"
              >
                <CopyPlus className="w-4 h-4 text-[#cbd5e1] shrink-0" />
                <span>Guardar como...</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  onExportNativeProject?.();
                }}
                className="w-full min-h-[38px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#e4e6eb] flex items-center gap-2 text-left transition-colors"
              >
                <Download className="w-4 h-4 text-[#34d399] shrink-0" />
                <span>Proyecto completo (.forma3d)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  onExportExternal?.();
                }}
                className="w-full min-h-[38px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#e4e6eb] flex items-center gap-2 text-left transition-colors"
              >
                <Upload className="w-4 h-4 text-[#34d399] shrink-0" />
                <span>EXPORTAR</span>
              </button>
            </div>
          )}

          {/* BARHOME Sub-Picker Popover: Vistas del Viewport */}
          {activeSubPicker === 'barhome_views' && (
            <div
              style={{ left: popoverLeft, top: popoverTop }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-50 w-[280px] rounded-xl bg-[#181a1f] border border-[#343a47] shadow-2xl p-2 space-y-2 pointer-events-auto"
            >
              <div className="px-1.5 py-1 border-b border-[#272b34] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Vistas del viewport</span>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSubPicker(null)}
                  className="w-6 h-6 rounded hover:bg-[#272b35] text-[#9ca3af] hover:text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (projection !== 'perspective') onToggleProjection();
                    closeAll();
                  }}
                  className={`min-h-[36px] px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    projection === 'perspective'
                      ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Perspectiva</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (projection !== 'orthographic') onToggleProjection();
                    closeAll();
                  }}
                  className={`min-h-[36px] px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    projection === 'orthographic'
                      ? 'bg-[#2c313b] border-[#60a5fa]/65 text-[#93c5fd]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <span>Ortográfica</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CAMERA_VIEW_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onSetCameraPreset(preset.id);
                      closeAll();
                    }}
                    className="min-h-[34px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#e4e6eb] text-left transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onSetCameraPreset('iso');
                    closeAll();
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#cbd5e1] text-left transition-colors"
                >
                  Isométrica 3D
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onFocusSelected) onFocusSelected();
                    else onSetCameraPreset('focus');
                    closeAll();
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#1e2128] hover:bg-[#272b35] text-xs font-medium text-[#5ecd6e] flex items-center gap-1.5 transition-colors"
                >
                  <Focus className="w-3.5 h-3.5 shrink-0" />
                  <span>Encuadrar</span>
                </button>
              </div>
            </div>
          )}

          {/* BARHOME Sub-Picker Popover: Configuración de visualización */}
          {activeSubPicker === 'barhome_display' && (
            <div
              style={{ left: popoverLeft, top: popoverTop }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-50 w-[288px] max-h-[75vh] overflow-y-auto cad-scroll rounded-xl bg-[#181a1f] border border-[#343a47] shadow-2xl p-2 space-y-1.5 pointer-events-auto"
            >
              <div className="px-1.5 py-1 border-b border-[#272b34] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#cbd5e1] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Visualización (BARHOME)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSubPicker(null)}
                  className="w-6 h-6 rounded hover:bg-[#272b35] text-[#9ca3af] hover:text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onToggleGrid}
                  className={`min-h-[36px] px-2 rounded-lg border text-xs font-medium flex items-center justify-between gap-1.5 transition-colors ${
                    showGrid
                      ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Grid className="w-3.5 h-3.5 shrink-0" />
                    <span>Cuadrícula</span>
                  </span>
                  {showGrid && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleAxes?.()}
                  className={`min-h-[36px] px-2 rounded-lg border text-xs font-medium flex items-center justify-between gap-1.5 transition-colors ${
                    showAxes
                      ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Axis3d className="w-3.5 h-3.5 shrink-0" />
                    <span>Ejes</span>
                  </span>
                  {showAxes && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              </div>

              {DISPLAY_MODES.map((mode) => {
                const isActive = !mode.disabled && displayMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={Boolean(mode.disabled)}
                    onClick={() => {
                      if (mode.disabled) return;
                      onSelectDisplayMode?.(mode.id);
                    }}
                    className={`w-full min-h-[36px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 text-left transition-colors ${
                      mode.disabled
                        ? 'opacity-50 cursor-not-allowed text-[#7e8592]'
                        : isActive
                          ? 'bg-[#2c313b] border border-[#5ecd6e]/65 text-[#5ecd6e]'
                          : 'hover:bg-[#252932] text-[#e4e6eb] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <ShadingModeIcon mode={mode.id} active={isActive} />
                      <span className="truncate">{mode.label}</span>
                    </span>
                    {mode.disabled ? (
                      <Lock className="w-3 h-3 shrink-0" />
                    ) : isActive ? (
                      <Check className="w-3.5 h-3.5 text-[#5ecd6e] shrink-0" />
                    ) : null}
                  </button>
                );
              })}

              {displayMode === 'xray' && onChangeXrayTransparency && (
                <div className="p-2 rounded-lg bg-[#121418] border border-[#2d323d] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#e4e6eb]">
                      Transparencia X-Ray
                    </span>
                    <span className="font-mono-tabular font-semibold text-[#5ecd6e]">
                      {xrayTransparency}% · {getXrayDescriptor(xrayTransparency)}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {XRAY_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => onChangeXrayTransparency(preset.value)}
                        className={`h-7 rounded text-[10px] font-mono-tabular font-semibold border transition-colors ${
                          xrayTransparency === preset.value
                            ? 'bg-[#2c313b] border-[#5ecd6e]/75 text-[#5ecd6e]'
                            : 'bg-[#181b21] border-[#292d37] text-[#9ca3af] hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onToggleFaceOrientation}
                className={`w-full min-h-[36px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 text-left transition-colors ${
                  showFaceOrientation
                    ? 'bg-[#2c313b] border border-[#3b82f6]/65 text-[#93c5fd]'
                    : 'hover:bg-[#252932] text-[#e4e6eb] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-flex w-3.5 h-3.5 rounded-sm overflow-hidden border border-white/25 shrink-0"
                    aria-hidden="true"
                  >
                    <span className="w-1/2 h-full bg-[#2563eb]" />
                    <span className="w-1/2 h-full bg-[#e03131]" />
                  </span>
                  <span className="truncate">Face Orientation</span>
                </span>
                {showFaceOrientation && (
                  <Check className="w-3.5 h-3.5 text-[#60a5fa] shrink-0" />
                )}
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onToggleLiner?.();
                    closeAll();
                  }}
                  className={`min-h-[36px] px-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    showLiner
                      ? 'bg-[#2c313b] border-[#5ecd6e]/65 text-[#5ecd6e]'
                      : 'bg-[#1e2128] hover:bg-[#272b35] border-transparent text-[#d1d5db]'
                  }`}
                >
                  <PanelRight className="w-3.5 h-3.5 shrink-0" />
                  <span>LINER</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeAll();
                    onOpenSettings();
                  }}
                  className="min-h-[36px] px-2 rounded-lg bg-[#1e2128] hover:bg-[#272b35] border border-transparent text-xs font-medium text-[#e4e6eb] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-[#9ca3af] shrink-0" />
                  <span>Ajustes</span>
                </button>
              </div>
            </div>
          )}

        </>
      )}

      {/* Radial Slot Configuration Editor */}
      {editingSlotIndex !== null && (
        <RadialSlotEditorModal
          mode={layoutScope}
          slotIndex={editingSlotIndex}
          currentActionId={slots[editingSlotIndex] ?? null}
          onAssignAction={(actionId) =>
            onUpdateRadialSlot(layoutScope, editingSlotIndex, actionId)
          }
          onRestoreDefaultSlot={() =>
            onResetRadialSlot(layoutScope, editingSlotIndex)
          }
          onRestoreEntireLayout={() => onResetRadialLayout(layoutScope)}
          onClose={() => setEditingSlotIndex(null)}
        />
      )}
    </>
  );
};
