import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Rotate3d } from 'lucide-react';
import { EditableMesh, Vec3 } from '../core/mesh/EditableMesh';
import {
  DeleteActionType,
  EdgeSelectionTool,
} from '../core/mesh/advancedOperations';
import { EditSelectionMode } from '../core/mesh/operations';
import { PrimitiveOptions, PrimitiveType } from '../core/mesh/primitives';
import {
  AxisConstraint,
  CameraProjection,
  MaterialAsset,
  ModelerSettings,
  ObjectTransform,
  ObjectTransformChange,
  SceneObjectData,
  SculptSettings,
  TouchControlSettings,
  TouchModifierState,
  TransformTool,
  WorkMode,
} from '../core/project/types';
import {
  RadialActionId,
  RadialWorkMode,
} from '../core/radial/radialActions';
import { TimelapseCameraState } from '../core/timelapse/types';
import { EMPTY_MODIFIER_STATE } from '../engine/TouchGestureManager';
import {
  BoxSelectOverlayState,
  CameraPreset,
  CameraQuaternionTuple,
  ModalTransformStatus,
  ViewportContextInfo,
  ViewportEngine,
} from '../engine/ViewportEngine';
import {
  EditOperatorParams,
  EditOperatorSession,
  EditOperatorType,
  ModalTransformState,
} from '../state/useModelerStore';
import { AxisGizmoHandle, AxisGizmoWidget } from './AxisGizmoWidget';
import { CtrlAltOperationsMenu } from './CtrlAltOperationsMenu';
import { CtrlShiftPrimitivesMenu } from './CtrlShiftPrimitivesMenu';
import { EditOperatorBar } from './EditOperatorBar';
import {
  ContextMenuState,
  ViewportContextMenu,
} from './ViewportContextMenu';

export interface Viewport3DHandle {
  focusSelected: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  confirmMoveSlide: () => boolean;
  captureThumbnail: () => string | null;
  resetCamera: () => void;
  getCameraState: () => TimelapseCameraState | null;
}

interface Viewport3DProps {
  objects: SceneObjectData[];
  materials: MaterialAsset[];
  selectedObject: SceneObjectData | null;
  selectedObjectId: string | null;
  selectedObjectIds?: Set<string>;
  workMode: WorkMode;
  editSelectionMode: EditSelectionMode;
  edgeSelectionTool?: EdgeSelectionTool;
  selectedComponentIds: Set<string>;
  activeTool: TransformTool;
  axisConstraint: AxisConstraint;
  projection: CameraProjection;
  cameraRotationLocked?: boolean;
  settings: ModelerSettings;
  meshRevision: number;
  toastMessage: string | null;
  screenShiftActive: boolean;
  screenModifiers: TouchModifierState;
  operatorSession: EditOperatorSession | null;
  operatorMergedCount?: number;
  operatorError?: string | null;
  operatorStatusMessage?: string | null;
  operatorEffectiveMode?: EditSelectionMode | null;
  loopCutPreviewSegments: [Vec3, Vec3][];
  loopCutRingEdgeIds?: string[];
  loopCutFaceIds?: string[];
  loopCutIsClosed?: boolean;
  loopCutError?: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onSelectObject: (id: string | null, additive?: boolean) => void;
  onBoxSelectObjects?: (ids: string[], additive: boolean) => void;
  onSelectComponent: (
    id: string | null,
    additive: boolean,
    addOnly?: boolean,
    ctrl?: boolean,
  ) => void;
  onBoxSelectComponents?: (ids: string[], additive: boolean) => void;
  onPickLoopCutEdge: (edgeId: string | null) => void;
  onTwoFingerUndo: () => void;
  onThreeFingerRedo: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLiveObjectTransform: (id: string, transform: ObjectTransform) => void;
  onCommitObjectTransform: (
    id: string,
    before: ObjectTransform,
    after: ObjectTransform,
  ) => void;
  onCommitObjectTransforms: (changes: ObjectTransformChange[]) => void;
  onCommitMeshEdit: (
    id: string,
    before: EditableMesh,
    after: EditableMesh,
  ) => void;
  sculptSettings?: SculptSettings;
  onCommitSculptStroke?: (id: string, nextMesh: EditableMesh) => void;
  onUpdateOperatorConfig: (config: EditOperatorParams) => void;
  onConfirmOperator: () => void;
  onCancelOperator: () => void;
  onChangeAxisConstraint: (axis: AxisConstraint) => void;
  onToggleProjection: (projection: CameraProjection) => void;
  onToggleXray: () => void;
  onToggleFaceOrientation: () => void;
  onToggleGrid: () => void;
  onToggleMultiSelectTouch: () => void;
  onToggleScreenShift: () => void;
  onReleaseScreenModifiers: () => void;
  onEffectiveModifiersChange?: (mods: TouchModifierState) => void;
  onUpdateTouchSettings: (patch: Partial<TouchControlSettings>) => void;
  onUpdateRadialSlot: (
    mode: RadialWorkMode,
    slotIndex: number,
    actionId: RadialActionId | null,
  ) => void;
  onResetRadialSlot: (mode: RadialWorkMode, slotIndex: number) => void;
  onResetRadialLayout: (mode: RadialWorkMode) => void;
  onAddPrimitive: (type: PrimitiveType, options?: PrimitiveOptions) => void;
  onSelectTool: (tool: TransformTool) => void;
  onDuplicateObject: () => void;
  onApplyObjectTransform: () => void;
  onCenterObjectOrigin: () => void;
  onSeparateSelectedGeometry: () => void;
  onHideObject: (id: string) => void;
  onDeleteObject: () => void;
  onToggleWorkMode: (mode: WorkMode) => void;
  onChangeEditSelectionMode: (mode: EditSelectionMode) => void;
  onChangeEdgeSelectionTool?: (tool: EdgeSelectionTool) => void;
  onSelectEdgeTopology?: (
    kind: 'loop' | 'ring',
    targetEdgeId?: string,
  ) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onStartOperator: (type: EditOperatorType) => void;
  onSwitchMergeOperator?: (target: 'merge' | 'merge_by_distance') => void;
  onFillSelection: () => void;
  onConnectVertexPath: () => void;
  onRecalculateOutside: () => void;
  onFlipNormals: () => void;
  onQuickDissolve: () => void;
  onExecuteContextualDelete: (action: DeleteActionType) => void;
  onMarkSeams?: (isSeam: boolean) => void;
  onSelectSeams?: () => void;
  onDeselectSeams?: () => void;
  onToggleProportional: () => void;
  onToggleProportionalConnected: () => void;
  onChangeProportionalRadius: (radius: number) => void;
  onSaveProject: () => void;
  onOpenSettings: () => void;
  modalTransform?: ModalTransformState | null;
  modalCancelNonce?: number;
  paused?: boolean;
  onToggleCameraRotationLock?: () => void;
  onChangeModalClamp?: (clamp: boolean) => void;
  onCancelModalTransform?: () => void;
  onCompleteModalTransform?: (committed: boolean) => void;
  onCameraMovementCommit?: (
    camera: TimelapseCameraState,
    source: 'orbit' | 'preset' | 'projection',
  ) => void;
  reserveTopLeftCorner?: boolean;
  reserveTopLeftWrench?: boolean;
  highlightedNgonObjectId?: string | null;
  highlightedNgonFaceIds?: string[];
}

export const Viewport3D = React.forwardRef<Viewport3DHandle, Viewport3DProps>(
  (
    {
      objects,
      materials,
      selectedObject,
      selectedObjectId,
      selectedObjectIds,
      workMode,
      editSelectionMode,
      edgeSelectionTool = 'single',
      selectedComponentIds,
      activeTool,
      axisConstraint,
      projection,
      cameraRotationLocked = false,
      settings,
      meshRevision,
      toastMessage,
      screenShiftActive,
      screenModifiers,
      operatorSession,
      operatorMergedCount = 0,
      operatorError = null,
      operatorStatusMessage = null,
      operatorEffectiveMode = null,
      loopCutPreviewSegments,
      loopCutRingEdgeIds = [],
      loopCutFaceIds = [],
      loopCutIsClosed = false,
      loopCutError = null,
      canUndo,
      canRedo,
      onSelectObject,
      onBoxSelectObjects,
      onSelectComponent,
      onBoxSelectComponents,
      onPickLoopCutEdge,
      onTwoFingerUndo,
      onThreeFingerRedo,
      onUndo,
      onRedo,
      onLiveObjectTransform,
      onCommitObjectTransform,
      onCommitObjectTransforms,
      onCommitMeshEdit,
      sculptSettings,
      onCommitSculptStroke,
      onUpdateOperatorConfig,
      onConfirmOperator,
      onCancelOperator,
      onChangeAxisConstraint,
      onToggleProjection,
      onToggleXray,
      onToggleFaceOrientation,
      onToggleGrid,
      onToggleMultiSelectTouch,
      onToggleScreenShift,
      onReleaseScreenModifiers,
      onEffectiveModifiersChange,
      onUpdateTouchSettings,
      onUpdateRadialSlot,
      onResetRadialSlot,
      onResetRadialLayout,
      onAddPrimitive,
      onSelectTool,
      onDuplicateObject,
      onApplyObjectTransform,
      onCenterObjectOrigin,
      onSeparateSelectedGeometry,
      onHideObject,
      onDeleteObject,
      onToggleWorkMode,
      onChangeEditSelectionMode,
      onChangeEdgeSelectionTool,
      onSelectEdgeTopology,
      onSelectAll,
      onDeselectAll,
      onStartOperator,
      onSwitchMergeOperator,
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
      onChangeProportionalRadius,
      onSaveProject,
      onOpenSettings,
      modalTransform = null,
      modalCancelNonce = 0,
      paused = false,
      onToggleCameraRotationLock,
      onChangeModalClamp,
      onCancelModalTransform,
      onCompleteModalTransform,
      onCameraMovementCommit,
      reserveTopLeftCorner = false,
      reserveTopLeftWrench = false,
      highlightedNgonObjectId = null,
      highlightedNgonFaceIds = [],
    },
    ref,
  ) => {
    const viewportContainerRef = useRef<HTMLDivElement | null>(null);
    const mountRef = useRef<HTMLDivElement | null>(null);
    const engineRef = useRef<ViewportEngine | null>(null);
    const gizmoRef = useRef<AxisGizmoHandle | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [boxOverlay, setBoxOverlay] = useState<BoxSelectOverlayState | null>(
      null,
    );
    const [gestureModifiers, setGestureModifiers] =
      useState<TouchModifierState>(EMPTY_MODIFIER_STATE);
    const [physicalModifiers, setPhysicalModifiers] =
      useState<TouchModifierState>(EMPTY_MODIFIER_STATE);
    const [loopCutSlideActive, setLoopCutSlideActive] = useState(false);
    const [trackballActive, setTrackballActive] = useState(false);
    const [modalStatus, setModalStatus] = useState<ModalTransformStatus | null>(
      null,
    );
    const [activeComboMenu, setActiveComboMenu] = useState<
      'primitives' | 'operations' | null
    >(null);
    const physComboCandidateRef = useRef<'primitives' | 'operations' | null>(
      null,
    );
    const physComboConsumedRef = useRef(false);

    useEffect(() => {
      const isTextTarget = (t: EventTarget | null) => {
        const el = t as HTMLElement | null;
        return Boolean(
          el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'),
        );
      };

      const syncPhysicalMods = (e: KeyboardEvent) => {
        setPhysicalModifiers((prev) => {
          const nextShift = e.shiftKey;
          const nextCtrl = e.ctrlKey || e.metaKey;
          const nextAlt = e.altKey;
          if (
            prev.shift === nextShift &&
            prev.ctrl === nextCtrl &&
            prev.alt === nextAlt
          ) {
            return prev;
          }
          return { shift: nextShift, ctrl: nextCtrl, alt: nextAlt };
        });
      };

      const onKeyDown = (e: KeyboardEvent) => {
        syncPhysicalMods(e);
        if (isTextTarget(e.target)) return;

        const isModifierKey =
          e.key === 'Control' ||
          e.key === 'Shift' ||
          e.key === 'Alt' ||
          e.key === 'Meta';
        if (!isModifierKey) {
          physComboConsumedRef.current = true;
          physComboCandidateRef.current = null;
          return;
        }

        if (!physComboConsumedRef.current) {
          const ctrl = e.ctrlKey || e.metaKey;
          if (ctrl && e.shiftKey && !e.altKey) {
            physComboCandidateRef.current = 'primitives';
          } else if (ctrl && e.altKey && !e.shiftKey) {
            physComboCandidateRef.current = 'operations';
          } else if (ctrl && e.shiftKey && e.altKey) {
            physComboCandidateRef.current = null;
          }
        }
      };

      const onKeyUp = (e: KeyboardEvent) => {
        syncPhysicalMods(e);
        const ctrl = e.ctrlKey || e.metaKey;
        const candidate = physComboCandidateRef.current;
        if (
          candidate &&
          !physComboConsumedRef.current &&
          (!ctrl || (candidate === 'primitives' && !e.shiftKey) || (candidate === 'operations' && !e.altKey))
        ) {
          physComboCandidateRef.current = null;
          if (!isTextTarget(e.target)) {
            setActiveComboMenu(candidate);
          }
        }
        if (!ctrl && !e.shiftKey && !e.altKey) {
          physComboConsumedRef.current = false;
          physComboCandidateRef.current = null;
        }
      };

      const resetPhysical = () => {
        physComboConsumedRef.current = false;
        physComboCandidateRef.current = null;
        setPhysicalModifiers(EMPTY_MODIFIER_STATE);
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', resetPhysical);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', resetPhysical);
      };
    }, []);

    const cameraPresetFnRef = useRef<(preset: CameraPreset) => void>(() => {});

    useImperativeHandle(
      ref,
      () => ({
        focusSelected() {
          engineRef.current?.setCameraPreset('focus');
        },
        setCameraPreset(preset: CameraPreset) {
          cameraPresetFnRef.current(preset);
        },
        confirmMoveSlide() {
          return engineRef.current?.confirmModalSlidePreview() ?? false;
        },
        captureThumbnail() {
          return engineRef.current?.captureThumbnailDataUrl(480, 320) ?? null;
        },
        resetCamera() {
          engineRef.current?.resetCameraToDefault();
        },
        getCameraState() {
          return engineRef.current?.getCameraState() ?? null;
        },
      }),
      [],
    );

    useEffect(() => {
      engineRef.current?.setPaused(paused);
    }, [paused]);

  const handleSelectCameraPreset = useCallback(
    (preset: CameraPreset) => {
      if (
        preset === 'front' ||
        preset === 'back' ||
        preset === 'top' ||
        preset === 'bottom' ||
        preset === 'right' ||
        preset === 'left'
      ) {
        if (projection !== 'orthographic') {
          engineRef.current?.switchProjection('orthographic');
          onToggleProjection('orthographic');
        }
      } else if (preset === 'iso') {
        if (projection !== 'perspective') {
          engineRef.current?.switchProjection('perspective');
          onToggleProjection('perspective');
        }
      }
      engineRef.current?.setCameraPreset(preset);
    },
    [onToggleProjection, projection],
  );
  cameraPresetFnRef.current = handleSelectCameraPreset;

  const handleOpenContextMenu = useCallback(
    (info: ViewportContextInfo) => {
      if (workMode === 'object') {
        if (info.hitObjectId && info.hitObjectId !== selectedObjectId) {
          onSelectObject(info.hitObjectId);
        }
      } else if (
        info.hitComponentId &&
        !selectedComponentIds.has(info.hitComponentId)
      ) {
        onSelectComponent(
          info.hitComponentId,
          Boolean(settings.multiSelectTouch || screenShiftActive),
          false,
        );
      }
      setContextMenu({
        clientX: info.clientX,
        clientY: info.clientY,
        hitObjectId: info.hitObjectId,
        hitComponentId: info.hitComponentId,
      });
    },
    [
      onSelectComponent,
      onSelectObject,
      screenShiftActive,
      selectedComponentIds,
      selectedObjectId,
      settings.multiSelectTouch,
      workMode,
    ],
  );

  const handleLoopCutSlideDelta = useCallback(
    (delta: number) => {
      if (!operatorSession || operatorSession.config.type !== 'loop_cut') return;
      const nextSlide = Math.max(
        -1,
        Math.min(1, operatorSession.config.params.slide + delta),
      );
      onUpdateOperatorConfig({
        type: 'loop_cut',
        params: { ...operatorSession.config.params, slide: nextSlide },
      });
    },
    [onUpdateOperatorConfig, operatorSession],
  );

  const handleAltTap = useCallback(() => {
    if (operatorSession) return;
    onToggleWorkMode(workMode === 'object' ? 'edit' : 'object');
  }, [onToggleWorkMode, operatorSession, workMode]);

  const handleCloseComboMenu = useCallback(() => {
    setActiveComboMenu(null);
    onReleaseScreenModifiers();
  }, [onReleaseScreenModifiers]);

  const callbacksRef = useRef({
    onSelectObject,
    onBoxSelectObjects,
    onSelectComponent,
    onBoxSelectComponents,
    onPickLoopCutEdge,
    onLoopCutSlideDelta: handleLoopCutSlideDelta,
    onTwoFingerUndo,
    onThreeFingerRedo,
    onOpenContextMenu: handleOpenContextMenu,
    onModifierStateChange: (mods: TouchModifierState) =>
      setGestureModifiers(mods),
    onAltTap: handleAltTap,
    onTrackballActiveChange: (active: boolean) => setTrackballActive(active),
    onCameraPoseChange: (quat: CameraQuaternionTuple) => {
      gizmoRef.current?.updateOrientation(quat);
    },
    onLiveObjectTransform,
    onCommitObjectTransform,
    onCommitObjectTransforms,
    onCommitMeshEdit,
    onCommitSculptStroke,
    onChangeProportionalRadius,
    onCompleteModalTransform,
    onCameraMovementCommit,
  });
  callbacksRef.current = {
    onSelectObject,
    onBoxSelectObjects,
    onSelectComponent,
    onBoxSelectComponents,
    onPickLoopCutEdge,
    onLoopCutSlideDelta: handleLoopCutSlideDelta,
    onTwoFingerUndo,
    onThreeFingerRedo,
    onOpenContextMenu: handleOpenContextMenu,
    onModifierStateChange: (mods: TouchModifierState) =>
      setGestureModifiers(mods),
    onAltTap: handleAltTap,
    onTrackballActiveChange: (active: boolean) => setTrackballActive(active),
    onCameraPoseChange: (quat: CameraQuaternionTuple) => {
      gizmoRef.current?.updateOrientation(quat);
    },
    onLiveObjectTransform,
    onCommitObjectTransform,
    onCommitObjectTransforms,
    onCommitMeshEdit,
    onCommitSculptStroke,
    onChangeProportionalRadius,
    onCompleteModalTransform,
    onCameraMovementCommit,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new ViewportEngine(container, {
      onSelectObject: (id, additive) =>
        callbacksRef.current.onSelectObject(id, additive),
      onBoxSelectObjects: (ids, additive) =>
        callbacksRef.current.onBoxSelectObjects?.(ids, additive),
      onSelectComponent: (id, additive, addOnly, ctrl) =>
        callbacksRef.current.onSelectComponent(id, additive, addOnly, ctrl),
      onBoxSelectComponents: (ids, additive) =>
        callbacksRef.current.onBoxSelectComponents?.(ids, additive),
      onBoxSelectOverlayChange: (overlay) => setBoxOverlay(overlay),
      onPickLoopCutEdge: (edgeId) =>
        callbacksRef.current.onPickLoopCutEdge(edgeId),
      onLoopCutSlideDelta: (delta) =>
        callbacksRef.current.onLoopCutSlideDelta(delta),
      onTwoFingerUndo: () => callbacksRef.current.onTwoFingerUndo(),
      onThreeFingerRedo: () => callbacksRef.current.onThreeFingerRedo(),
      onOpenContextMenu: (info) =>
        callbacksRef.current.onOpenContextMenu(info),
      onModifierStateChange: (mods) =>
        callbacksRef.current.onModifierStateChange(mods),
      onAltTap: () => callbacksRef.current.onAltTap(),
      onTrackballActiveChange: (active) =>
        callbacksRef.current.onTrackballActiveChange(active),
      onModalTransformStatusChange: (status) => setModalStatus(status),
      onCompleteModalTransform: (committed) =>
        callbacksRef.current.onCompleteModalTransform?.(committed),
      onCameraPoseChange: (quat) =>
        callbacksRef.current.onCameraPoseChange(quat),
      onCameraMovementCommit: (cam, source) =>
        callbacksRef.current.onCameraMovementCommit?.(cam, source),
      onLiveObjectTransform: (id, transform) =>
        callbacksRef.current.onLiveObjectTransform(id, transform),
      onCommitObjectTransform: (id, before, after) =>
        callbacksRef.current.onCommitObjectTransform(id, before, after),
      onCommitObjectTransforms: (changes) =>
        callbacksRef.current.onCommitObjectTransforms(changes),
      onCommitMeshEdit: (id, before, after) =>
        callbacksRef.current.onCommitMeshEdit(id, before, after),
      onCommitSculptStroke: (id, nextMesh) =>
        callbacksRef.current.onCommitSculptStroke?.(id, nextMesh),
      onChangeProportionalRadius: (radius) =>
        callbacksRef.current.onChangeProportionalRadius(radius),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const externalModifiers: TouchModifierState = useMemo(
    () => ({
      shift: screenModifiers.shift || physicalModifiers.shift,
      ctrl: screenModifiers.ctrl || physicalModifiers.ctrl,
      alt: screenModifiers.alt || physicalModifiers.alt,
    }),
    [physicalModifiers, screenModifiers],
  );

  // Open CTRL+SHIFT (Primitives) or CTRL+ALT (Special Operations) when triggered from virtual modifier panel
  useEffect(() => {
    if (operatorSession) return;
    if (screenModifiers.ctrl && screenModifiers.shift && !screenModifiers.alt) {
      setActiveComboMenu('primitives');
    } else if (screenModifiers.ctrl && screenModifiers.alt && !screenModifiers.shift) {
      setActiveComboMenu('operations');
    }
  }, [
    operatorSession,
    screenModifiers.alt,
    screenModifiers.ctrl,
    screenModifiers.shift,
  ]);

  useEffect(() => {
    engineRef.current?.syncScene({
      objects,
      materials,
      selectedObjectId,
      selectedObjectIds,
      workMode,
      editSelectionMode,
      selectedComponentIds,
      activeTool,
      axisConstraint,
      projection,
      settings,
      meshRevision,
      suppressGizmo: Boolean(operatorSession),
      virtualModifiers: externalModifiers,
      loopCutPreviewMode: operatorSession?.config.type === 'loop_cut',
      loopCutPreviewSegments,
      loopCutPreviewRingEdgeIds: loopCutRingEdgeIds,
      loopCutPreviewFaceIds: loopCutFaceIds,
      loopCutSlideActive,
      mergeCursorPosition:
        operatorSession?.config.type === 'merge' &&
        operatorSession.config.params.mode === 'cursor'
          ? (operatorSession.config.params.cursorPosition ?? [0, 0, 0])
          : null,
      modalTransformMode: modalTransform?.mode ?? null,
      modalTransformCommitOnRelease: modalTransform?.commitOnRelease ?? true,
      modalSlideClamp: modalTransform?.clamp ?? true,
      modalCancelNonce,
      cameraRotationLocked,
      sculptSettings,
      highlightedNgonObjectId,
      highlightedNgonFaceIds,
    });
  }, [
    objects,
    materials,
    selectedObjectId,
    selectedObjectIds,
    workMode,
    editSelectionMode,
    selectedComponentIds,
    activeTool,
    axisConstraint,
    projection,
    cameraRotationLocked,
    sculptSettings,
    settings,
    meshRevision,
    operatorSession,
    externalModifiers,
    loopCutPreviewSegments,
    loopCutRingEdgeIds,
    loopCutFaceIds,
    loopCutSlideActive,
    modalTransform,
    modalCancelNonce,
    highlightedNgonObjectId,
    highlightedNgonFaceIds,
  ]);

  useEffect(() => {
    setContextMenu(null);
    setActiveComboMenu(null);
    if (operatorSession?.config.type !== 'loop_cut') {
      setLoopCutSlideActive(false);
    }
    if (!modalTransform) {
      setModalStatus(null);
    }
  }, [workMode, operatorSession, modalTransform]);

  const editSelectionDetails = useMemo(() => {
    if (workMode !== 'edit' || !selectedObject) {
      return { vertexCount: 0, canInset: false };
    }
    const editable = EditableMesh.fromJSON(selectedObject.mesh);
    const verts = editable.getVertexIdsFromSelection(
      editSelectionMode,
      selectedComponentIds,
    );
    const canInset =
      (editSelectionMode === 'face' && selectedComponentIds.size > 0) ||
      editable.faces.some((f) => f.vertexIds.every((vid) => verts.has(vid)));
    return { vertexCount: verts.size, canInset };
  }, [editSelectionMode, selectedComponentIds, selectedObject, workMode]);

  const effectiveModifiers: TouchModifierState = useMemo(
    () => ({
      shift:
        gestureModifiers.shift ||
        screenModifiers.shift ||
        physicalModifiers.shift,
      ctrl:
        gestureModifiers.ctrl ||
        screenModifiers.ctrl ||
        physicalModifiers.ctrl,
      alt:
        gestureModifiers.alt ||
        screenModifiers.alt ||
        physicalModifiers.alt,
    }),
    [gestureModifiers, physicalModifiers, screenModifiers],
  );

  useEffect(() => {
    onEffectiveModifiersChange?.(effectiveModifiers);
  }, [effectiveModifiers, onEffectiveModifiersChange]);

  return (
    <main className="relative flex-1 min-w-0 h-full flex flex-col bg-[#1d1f24] overflow-hidden select-none">
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={viewportContainerRef}
        onPointerDownCapture={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
            physComboConsumedRef.current = true;
            physComboCandidateRef.current = null;
          }
        }}
        style={{
          touchAction: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        className="relative flex-1 min-h-0 w-full select-none"
      >
        <div
          ref={mountRef}
          style={{
            touchAction: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
          className="w-full h-full"
        />

        {/* Double-Tap + Drag Rectangular Box Selection Overlay */}
        {boxOverlay && (
          <div
            style={{
              left: boxOverlay.left,
              top: boxOverlay.top,
              width: boxOverlay.width,
              height: boxOverlay.height,
            }}
            className={`absolute z-20 pointer-events-none border-[1.5px] border-dashed ${
              boxOverlay.additive
                ? 'border-[#38bdf8] bg-[#38bdf8]/15'
                : 'border-[#5ecd6e] bg-[#5ecd6e]/14'
            } shadow-[0_0_0_1px_rgba(17,18,21,0.75)]`}
          >
            {(boxOverlay.width > 34 || boxOverlay.height > 22) && (
              <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-[#14161b]/92 border border-[#3a3f4b] text-[10px] font-mono-tabular font-semibold text-[#f3f4f6] whitespace-nowrap shadow">
                {boxOverlay.additive ? '+ ' : ''}
                {boxOverlay.matchCount}{' '}
                {workMode === 'object' ? 'obj.' : 'sel.'}
              </div>
            )}
          </div>
        )}

        {/* Top-Left: Trackball HUD Indicator only (tool & sub-mode selectors moved to LeftToolSidebar) */}
        {trackballActive && (
          <div
            className={`absolute top-3 ${
              reserveTopLeftCorner || reserveTopLeftWrench
                ? 'left-[196px]'
                : 'left-3'
            } z-15 pointer-events-none transition-[left] duration-200`}
          >
            <div
              data-testid="trackball-active-indicator"
              className="px-2.5 py-1.5 rounded-lg bg-[#122536] border border-[#38bdf8] text-[#7dd3fc] text-[11px] font-semibold flex items-center gap-1.5 shadow-lg pointer-events-none"
            >
              <Rotate3d className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>
                Rotación Trackball ({workMode === 'edit' ? 'Edición' : 'Objeto'})
              </span>
            </div>
          </div>
        )}

        {/* Top-Right: Interactive Z-Up Orientation Gizmo & Camera Rotation Lock */}
        <div className="absolute top-3 right-3 z-15 pointer-events-none">
          <AxisGizmoWidget
            ref={gizmoRef}
            cameraRotationLocked={cameraRotationLocked}
            onSelectPreset={handleSelectCameraPreset}
            onToggleCameraRotationLock={onToggleCameraRotationLock}
          />
        </div>

        {/* Long-Press Contextual Menu */}
        {contextMenu && (
          <ViewportContextMenu
            menu={contextMenu}
            workMode={workMode}
            editSelectionMode={editSelectionMode}
            selectedObjectName={selectedObject?.name ?? null}
            hasSelectedObject={
              workMode === 'object'
                ? Boolean(contextMenu.hitObjectId)
                : Boolean(selectedObject)
            }
            canEditSelected={Boolean(
              selectedObject &&
                selectedObject.objectType === 'mesh' &&
                !selectedObject.locked,
            )}
            selectedCount={selectedComponentIds.size}
            selectedVertexCount={editSelectionDetails.vertexCount}
            canInset={editSelectionDetails.canInset}
            showFaceOrientation={Boolean(settings.showFaceOrientation)}
            proportionalEnabled={settings.proportionalEditing.enabled}
            canUndo={canUndo}
            canRedo={canRedo}
            onClose={() => setContextMenu(null)}
            onAddPrimitive={onAddPrimitive}
            onSelectTool={onSelectTool}
            onToggleWorkMode={onToggleWorkMode}
            onChangeEditSelectionMode={onChangeEditSelectionMode}
            onDuplicateObject={onDuplicateObject}
            onHideObject={() => {
              if (selectedObjectId) onHideObject(selectedObjectId);
            }}
            onDeleteObject={onDeleteObject}
            onFocusCamera={() => engineRef.current?.setCameraPreset('focus')}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
            onSelectEdgeTopology={onSelectEdgeTopology}
            onStartOperator={onStartOperator}
            onFillSelection={onFillSelection}
            onConnectVertexPath={onConnectVertexPath}
            onToggleFaceOrientation={onToggleFaceOrientation}
            onToggleProportional={onToggleProportional}
            onRecalculateOutside={onRecalculateOutside}
            onFlipNormals={onFlipNormals}
            onExecuteContextualDelete={onExecuteContextualDelete}
            onMarkSeams={onMarkSeams}
            onSelectSeams={onSelectSeams}
            onDeselectSeams={onDeselectSeams}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        )}

        {/* Live Edit Mode Operator Parameter Bar */}
        {operatorSession && (
          <EditOperatorBar
            session={operatorSession}
            effectiveSelectionMode={operatorEffectiveMode}
            mergedCount={operatorMergedCount}
            operatorError={operatorError}
            operatorStatusMessage={operatorStatusMessage}
            loopCutFaceCount={loopCutFaceIds.length}
            loopCutIsClosed={loopCutIsClosed}
            loopCutError={loopCutError}
            loopCutSlideActive={loopCutSlideActive}
            onToggleLoopCutSlideActive={() =>
              setLoopCutSlideActive((prev) => !prev)
            }
            onSwitchMergeOperator={onSwitchMergeOperator}
            onUpdateConfig={onUpdateOperatorConfig}
            onConfirm={onConfirmOperator}
            onCancel={onCancelOperator}
          />
        )}

        {/* CTRL + SHIFT: Add Primitives Menu */}
        {activeComboMenu === 'primitives' && !operatorSession && (
          <CtrlShiftPrimitivesMenu
            onSelectPrimitive={(type) => {
              onAddPrimitive(type);
              handleCloseComboMenu();
            }}
            onClose={handleCloseComboMenu}
          />
        )}

        {/* CTRL + ALT: Special Operations Menu */}
        {activeComboMenu === 'operations' && !operatorSession && (
          <CtrlAltOperationsMenu
            workMode={workMode}
            hasSelectedObject={Boolean(selectedObject)}
            canEditSelected={Boolean(
              selectedObject &&
                selectedObject.objectType === 'mesh' &&
                !selectedObject.locked,
            )}
            hasSelectedComponents={selectedComponentIds.size > 0}
            hasFaces={Boolean(selectedObject && selectedObject.mesh.faces.length > 0)}
            onDuplicateObject={onDuplicateObject}
            onApplyObjectTransform={onApplyObjectTransform}
            onCenterObjectOrigin={onCenterObjectOrigin}
            onSeparateSelectedGeometry={onSeparateSelectedGeometry}
            onRecalculateNormalsOutside={onRecalculateOutside}
            onFlipNormals={onFlipNormals}
            onStartLimitedDissolve={() => onStartOperator('dissolve_limited')}
            onStartBridgeLoops={() => onStartOperator('bridge_loops')}
            onClose={handleCloseComboMenu}
          />
        )}

        {/* Modal G Move / Slide Live Touch Bar */}
        {modalTransform && !operatorSession && (
          <div
            data-testid="modal-transform-bar"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-xl bg-[#181a1f]/95 border shadow-[0_10px_28px_rgba(0,0,0,0.45)] flex flex-wrap items-center justify-center gap-2 max-w-[94vw] ${
              modalTransform.mode === 'move'
                ? 'border-[#5ecd6e]/80'
                : 'border-[#22d3ee]/80'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  modalTransform.mode === 'move' ? 'bg-[#5ecd6e]' : 'bg-[#22d3ee]'
                }`}
              />
              <span className="text-xs font-bold text-[#f3f4f6] whitespace-nowrap">
                {modalTransform.mode === 'vertex_slide'
                  ? 'Vertex Slide'
                  : modalTransform.mode === 'edge_slide'
                    ? 'Edge Slide'
                    : 'Mover (G)'}
              </span>
              <span className="text-[11px] font-mono-tabular text-[#9ca3af] whitespace-nowrap">
                {modalStatus
                  ? modalStatus.deltaText
                  : modalTransform.mode === 'move'
                    ? 'Arrastra para mover'
                    : 'Arrastra para deslizar'}
              </span>
            </div>

            {modalTransform.mode === 'move' ? (
              <div className="flex items-center gap-1 pl-1 border-l border-[#2e3340]">
                {(
                  [
                    { id: 'free', label: 'Libre', activeClass: 'bg-[#5ecd6e] text-[#111215]' },
                    { id: 'x', label: 'X', activeClass: 'bg-[#e05252] text-white' },
                    { id: 'y', label: 'Y', activeClass: 'bg-[#52b852] text-white' },
                    { id: 'z', label: 'Z', activeClass: 'bg-[#48bce8] text-[#111215]' },
                  ] as const
                ).map((ax) => (
                  <button
                    key={ax.id}
                    type="button"
                    onClick={() => onChangeAxisConstraint(ax.id)}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                      axisConstraint === ax.id
                        ? ax.activeClass
                        : 'bg-[#23262f] text-[#b4bac4] hover:text-white'
                    }`}
                  >
                    {ax.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1 pl-1 border-l border-[#2e3340]">
                <button
                  type="button"
                  onClick={() => onChangeModalClamp?.(!modalTransform.clamp)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                    modalTransform.clamp
                      ? 'bg-[#0e2a33] border border-[#22d3ee]/70 text-[#67e8f9]'
                      : 'bg-[#23262f] border border-[#343a47] text-[#b4bac4] hover:text-white'
                  }`}
                  title="Limitar deslizamiento entre los vértices vecinos"
                >
                  {modalTransform.clamp ? 'Tope: Sí' : 'Tope: No'}
                </button>
              </div>
            )}

            <button
              type="button"
              data-testid="modal-transform-cancel"
              onClick={() => onCancelModalTransform?.()}
              className="px-2.5 py-1 rounded-lg bg-[#2c191c] hover:bg-[#3f2024] border border-[#e05252]/60 text-[#fca5a5] text-[11px] font-bold transition-colors touch-manipulation"
            >
              Cancelar
            </button>

            {!modalTransform.commitOnRelease && (
              <button
                type="button"
                data-testid="modal-transform-confirm"
                onClick={() => engineRef.current?.confirmModalSlidePreview()}
                className="px-2.5 py-1 rounded-lg bg-[#22d3ee] hover:bg-[#67e8f9] text-[#0f1115] text-[11px] font-bold transition-colors touch-manipulation"
              >
                Confirmar
              </button>
            )}
          </div>
        )}

        {/* Transient Action Feedback Toast */}
        {toastMessage && (
          <div
            className={`absolute ${
              operatorSession
                ? 'bottom-28'
                : modalTransform
                  ? 'bottom-16'
                  : 'bottom-4'
            } left-1/2 -translate-x-1/2 z-20 px-3.5 py-2 rounded-md bg-[#181a1f] border border-[#3a3f4b] text-xs font-medium text-[#f3f4f6] shadow-lg pointer-events-none`}
          >
            {toastMessage}
          </div>
        )}
      </div>
    </main>
  );
  },
);

Viewport3D.displayName = 'Viewport3D';
