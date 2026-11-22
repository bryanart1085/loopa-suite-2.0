import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ModelerCoreAdapter } from '../core/adapters/modelerCoreAdapter';
import { verifyLoopaCoreSession } from '../core/coreVerify';
import { EditableMesh, Vec3 } from '../core/mesh/EditableMesh';
import {
  applyObjectTransformToMesh,
  centerMeshOrigin,
  computeDerivedEditSelection,
  deleteSelectedComponents,
  EditSelectionMode,
  resolveEdgeIdsForSeamSelection,
  selectAllComponents,
  selectConnectedComponents,
  separateGeometryFromMesh,
} from '../core/mesh/operations';
import {
  createPrimitiveMesh,
  PRIMITIVE_LABELS,
  PrimitiveOptions,
  PrimitiveType,
} from '../core/mesh/primitives';
import {
  DEFAULT_SCULPT_SETTINGS,
} from '../core/mesh/sculptBrushes';
import {
  cloneDefaultRadialLayouts,
  cloneDefaultWorkspaceToolLayouts,
  DEFAULT_BARHOME_RADIAL_LAYOUT,
  DEFAULT_RADIAL_LAYOUTS,
  getDefaultSlotsForScope,
  RADIAL_SLOT_COUNT,
  RadialActionId,
  RadialLayoutScope,
  RadialWorkMode,
} from '../core/radial/radialActions';
import {
  clearRecoveryDraftAsync,
  createDefaultToolConfigs,
  createNewProject,
  createDefaultTouchSettings,
  createProjectFolderAsync,
  DEFAULT_MODELER_SETTINGS,
  deleteProjectFolderAsync,
  deleteProjectLocally,
  deleteProjectsAsync,
  duplicateSavedProjectAsync,
  generateId,
  getActiveStoredProjectId,
  listProjectFoldersAsync,
  listRecoveryProjectIdsAsync,
  listSavedProjects,
  listSavedProjectsAsync,
  loadInitialProject,
  loadLastGizmoMode,
  loadProjectFromAnyStorage,
  loadProjectLocally,
  loadRecoveryDraftAsync,
  loadSettingsLocally,
  moveProjectsToFolderAsync,
  renameProjectFolderAsync,
  renameSavedProjectAsync,
  saveLastGizmoMode,
  saveProjectAsync,
  saveProjectLocally,
  saveRecoveryDraftAsync,
  saveSettingsLocally,
} from '../core/project/storage';
import {
  analyzeBridgeEdgeLoops,
  analyzeEdgeLoopRing,
  applyDeleteAction,
  bevelMesh,
  BevelParams,
  bridgeEdgeLoopsMesh,
  BridgeEdgeLoopsParams,
  buildEdgeSlidePlan,
  buildVertexSlidePlan,
  computeLoopCutPreviewSegments,
  DeleteActionType,
  EdgeSelectionTool,
  EditSelectionSubMode,
  extrudeMesh,
  ExtrudeParams,
  fillMesh,
  findFaceLoopDirections,
  findFirstValidLoopEdge,
  findVertexLoopDirections,
  insetFacesMesh,
  InsetParams,
  limitedDissolveMesh,
  LimitedDissolveParams,
  loopCutMesh,
  LoopCutParams,
  mergeByDistanceMesh,
  MergeByDistanceParams,
  mergeVerticesMesh,
  MergeParams,
  resolveEdgeLoopSelection,
  resolveExtrudeTarget,
  subdivideMesh,
  SubdivideParams,
} from '../core/mesh/advancedOperations';
import { connectVertexPathMesh } from '../core/mesh/connectVertexPath';
import { flipNormalsMesh, recalculateOutsideMesh } from '../core/mesh/normals';
import {
  PROPORTIONAL_FALLOFF_LIST,
  PROPORTIONAL_FALLOFF_ORDER,
  ProportionalEditingSettings,
  ProportionalFalloff,
  applyProportionalMove,
  buildProportionalDistanceField,
  clampProportionalRadius,
  computeProportionalWeights,
  inspectProportionalModifierCompatibility,
  normalizeProportionalSettings,
} from '../core/mesh/proportionalEditing';
import {
  cloneProjectForDuplicate,
  countMaterialUsageAcrossScenes,
  createLightObject,
  createProjectFromTemplate,
  addCollectionToScene,
  addSceneToProject,
  createMaterialAsset,
  createReferenceImageObject,
  DEFAULT_MATERIAL_COLOR,
  DEFAULT_MATERIAL_METALLIC,
  DEFAULT_MATERIAL_NAME,
  DEFAULT_MATERIAL_ROUGHNESS,
  DeleteCollectionResolution,
  deleteCollectionFromScene,
  deleteSceneFromProject,
  detectOrientationFromRotation,
  getActiveScene,
  isEditableMeshObject,
  moveObjectToCollectionInScene,
  normalizeLightData,
  REFERENCE_ORIENTATION_ROTATIONS,
  renameCollectionInScene,
  renameSceneInProject,
  setActiveCollectionInScene,
  switchSceneInProject,
  syncProjectMaterialsAndObjects,
  toggleCollectionExpandedInScene,
  toMaterialSlot,
  updateActiveScene,
} from '../core/project/hierarchy';
import {
  createDefaultMaterialNodeGraph,
  evaluateMaterialNodeGraph,
  normalizeMaterialGraphBaseTextureReference,
  syncMaterialFieldsToNodeGraph,
} from '../core/materials/nodeGraph';
import {
  appendTimelapseStep,
  clearTimelapseForProject,
  copyTimelapseForProject,
  getTimelapseMeta,
  getTotalTimelapseStorageBytes,
  updateTimelapseMeta,
} from '../core/timelapse/timelapseStorage';
import {
  cloneCameraState,
  DEFAULT_TIMELAPSE_CAMERA,
  extractRawSceneForTimelapse,
  formatCameraSourceLabel,
  shouldRecordCameraMovement,
} from '../core/timelapse/timelapseRecorder';
import {
  TimelapseCameraState,
  TimelapseProjectMeta,
} from '../core/timelapse/types';
import {
  buildSafeProjectFilename,
  parseNativeProjectFile,
  serializeNativeProjectFile,
} from '../core/project/projectFileFormat';
import { ObjImportResult } from '../core/io/objImport';
import { StlImportResult } from '../core/io/stlImport';
import { LoadedImageReferencePayload } from '../core/io/imageReference';
import {
  AxisConstraint,
  CameraProjection,
  ConfigurableToolKey,
  DeleteFolderResolution,
  GizmoTransformMode,
  LightData,
  LightType,
  MaterialAsset,
  ModelerSettings,
  MoveSubMode,
  ObjectShadingMode,
  ObjectTransform,
  ObjectTransformChange,
  ProjectData,
  ProjectFolder,
  ProjectRecoveryRecord,
  ProjectSummary,
  ProjectTemplateId,
  ReferenceImageData,
  ReferenceImageOrientation,
  SaveStatus,
  SceneData,
  SceneObjectData,
  SculptBrushType,
  SculptSettings,
  ToolConfigurations,
  TouchControlSettings,
  TouchModifierKey,
  TouchModifierSlotConfig,
  TouchModifierState,
  TransformTool,
  ViewportDisplayMode,
  WorkMode,
} from '../core/project/types';
import {
  DEFAULT_PROPORTIONAL_EDITING_SETTINGS as DEFAULT_PROP_SETTINGS,
} from '../core/mesh/proportionalEditing';

export type ToolResetTarget =
  | ConfigurableToolKey
  | 'rotate'
  | 'scale'
  | 'proportional';
import { SerializedEditableMesh } from '../core/mesh/EditableMesh';
import type { ProjectEcosystemMeta } from '../core/ecosystem/types';
import {
  applySingleModifierToMesh,
  buildTransformRefsFromObjects,
  evaluateObjectModifiers,
} from '../core/modifiers/evaluateModifiers';
import { clampVerticesForMirrorClipping } from '../core/modifiers/mirrorModifier';
import {
  MODIFIER_LABELS,
  ModifierDiagnostic,
  ModifierSlot,
  ModifierTransformRef,
  ModifierType,
  createDefaultBevelParams,
  createDefaultMirrorParams,
  createDefaultSolidifyParams,
  createDefaultSubdivisionParams,
  normalizeBevelParams,
  normalizeMirrorParams,
  normalizeSolidifyParams,
  normalizeSubdivisionParams,
} from '../core/modifiers/types';

export function applyComponentSelection(
  prev: ReadonlySet<string>,
  id: string | null,
  additive: boolean,
  addOnly = false,
): Set<string> {
  if (id === null) {
    if (additive || addOnly) {
      return new Set(prev);
    }
    return new Set();
  }
  if (addOnly) {
    const next = new Set(prev);
    next.add(id);
    return next;
  }
  const next = new Set(additive ? prev : []);
  if (additive && prev.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export type EditOperatorType =
  | 'extrude'
  | 'inset'
  | 'subdivide'
  | 'bevel'
  | 'loop_cut'
  | 'merge'
  | 'merge_by_distance'
  | 'dissolve_limited'
  | 'bridge_loops';

export type EditOperatorParams =
  | { type: 'extrude'; params: ExtrudeParams }
  | { type: 'inset'; params: InsetParams }
  | { type: 'subdivide'; params: SubdivideParams }
  | { type: 'bevel'; params: BevelParams }
  | { type: 'loop_cut'; params: LoopCutParams }
  | { type: 'merge'; params: MergeParams }
  | { type: 'merge_by_distance'; params: MergeByDistanceParams }
  | { type: 'dissolve_limited'; params: LimitedDissolveParams }
  | { type: 'bridge_loops'; params: BridgeEdgeLoopsParams };

export interface EditOperatorSession {
  objectId: string;
  baseMesh: SerializedEditableMesh;
  baseSelectionMode: EditSelectionMode;
  baseSelectedIds: string[];
  config: EditOperatorParams;
}

export type ModalGMode = 'move' | 'vertex_slide' | 'edge_slide';

export interface ModalTransformState {
  mode: ModalGMode;
  clamp: boolean;
  commitOnRelease?: boolean;
  source?: 'g_button' | 'move_tool';
}

interface HistorySnapshot {
  scenes: SceneData[];
  materials: MaterialAsset[];
  activeSceneId: string;
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  workMode: WorkMode;
  editSelectionMode: EditSelectionMode;
  selectedComponentIds: string[];
}

const MAX_HISTORY = 50;

function cloneScenes(scenes: SceneData[]): SceneData[] {
  return JSON.parse(JSON.stringify(scenes)) as SceneData[];
}

function cloneMaterials(materials?: MaterialAsset[]): MaterialAsset[] {
  return JSON.parse(JSON.stringify(materials ?? [])) as MaterialAsset[];
}

export function useModelerStore() {
  const initialProject = useMemo(() => loadInitialProject(), []);

  const [project, setProject] = useState<ProjectData>(initialProject);

  useEffect(() => {
    ModelerCoreAdapter.initialize();
    ModelerCoreAdapter.syncProject(project);
    verifyLoopaCoreSession(project);
  }, [project]);
  const [savedProjects, setSavedProjects] = useState<ProjectSummary[]>(() =>
    listSavedProjects(),
  );
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    () => initialProject.updatedAt ?? null,
  );
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [pendingRecovery, setPendingRecovery] =
    useState<ProjectRecoveryRecord | null>(null);
  const [startupRecoveryList, setStartupRecoveryList] = useState<
    ProjectRecoveryRecord[]
  >([]);
  const [isGalleryReady, setIsGalleryReady] = useState(false);

  const thumbnailProviderRef = useRef<(() => string | null) | null>(null);
  const cameraStateProviderRef = useRef<
    (() => TimelapseCameraState | null) | null
  >(null);
  const isModelerActiveRef = useRef(false);
  const isSavingRef = useRef(false);
  const lastAutosaveRevisionRef = useRef(-1);

  const [timelapseMeta, setTimelapseMeta] =
    useState<TimelapseProjectMeta | null>(null);
  const [timelapseTotalBytes, setTimelapseTotalBytes] = useState(0);
  const pendingTimelapseOpRef = useRef<{
    opType: string;
    label: string;
    debounceMs?: number;
  } | null>(null);
  const skipNextTimelapseEffectRef = useRef(false);
  const lastRecordedProjectRef = useRef<ProjectData>(project);
  const lastRecordedCameraRef = useRef<TimelapseCameraState>(
    DEFAULT_TIMELAPSE_CAMERA,
  );
  const timelapseDebounceTimerRef = useRef<number | null>(null);
  const timelapsePausedRef = useRef(false);

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(
    () => getActiveScene(initialProject).objects[0]?.id ?? null,
  );
  const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(() => {
    const firstId = getActiveScene(initialProject).objects[0]?.id ?? null;
    return firstId ? new Set([firstId]) : new Set();
  });
  const [workMode, setWorkMode] = useState<WorkMode>('object');
  const [editSelectionMode, setEditSelectionMode] =
    useState<EditSelectionMode>('vertex');
  const [vertexSelectionTool, setVertexSelectionTool] =
    useState<EditSelectionSubMode>('single');
  const [edgeSelectionTool, setEdgeSelectionToolState] =
    useState<EdgeSelectionTool>('single');
  const setEdgeSelectionTool = useCallback((tool: EdgeSelectionTool) => {
    setEdgeSelectionToolState(tool === 'loop' ? 'loop' : 'single');
  }, []);
  const [faceSelectionTool, setFaceSelectionTool] =
    useState<EditSelectionSubMode>('single');
  const [sculptSettings, setSculptSettings] = useState<SculptSettings>(
    () => ({
      ...DEFAULT_SCULPT_SETTINGS,
      symmetry: { ...DEFAULT_SCULPT_SETTINGS.symmetry },
    }),
  );
  const [cursor3D, setCursor3D] = useState<Vec3>([0, 0, 0]);
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [settings, setSettings] = useState<ModelerSettings>(() =>
    loadSettingsLocally(),
  );
  const [activeTool, setActiveToolState] = useState<TransformTool>(() =>
    loadLastGizmoMode(),
  );
  const [axisConstraint, setAxisConstraintState] = useState<AxisConstraint>(() =>
    settings.toolConfigs.move.defaultSubMode === 'axis' ? 'x' : 'free',
  );
  const [moveSubMode, setMoveSubModeState] = useState<MoveSubMode>(() =>
    settings.toolConfigs.move.defaultSubMode === 'axis' ? 'axis' : 'free',
  );
  const [projection, setProjectionState] = useState<CameraProjection>('perspective');
  const [cameraRotationLocked, setCameraRotationLocked] = useState<boolean>(false);
  const setProjection = useCallback((next: CameraProjection) => {
    setProjectionState(next);
  }, []);
  const toggleCameraRotationLock = useCallback(() => {
    setCameraRotationLocked((prev) => !prev);
  }, []);

  const [meshRevision, setMeshRevision] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [screenModifiers, setScreenModifiers] = useState<TouchModifierState>({
    shift: false,
    ctrl: false,
    alt: false,
  });
  const screenShiftActive = screenModifiers.shift;
  const setScreenShiftActive = useCallback((next: boolean) => {
    setScreenModifiers((prev) =>
      prev.shift === next ? prev : { ...prev, shift: next },
    );
  }, []);
  const setScreenModifier = useCallback(
    (key: TouchModifierKey, active: boolean) => {
      setScreenModifiers((prev) =>
        prev[key] === active ? prev : { ...prev, [key]: active },
      );
    },
    [],
  );
  const toggleScreenModifier = useCallback((key: TouchModifierKey) => {
    setScreenModifiers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const releaseScreenModifiers = useCallback(() => {
    setScreenModifiers((prev) =>
      prev.shift || prev.ctrl || prev.alt
        ? { shift: false, ctrl: false, alt: false }
        : prev,
    );
  }, []);
  const setActiveTool = useCallback(
    (tool: TransformTool) => {
      const switchingToMove = tool === 'move' && activeTool !== 'move';
      setActiveToolState(tool);
      if (
        tool === 'move' ||
        tool === 'rotate' ||
        tool === 'scale' ||
        tool === 'all'
      ) {
        saveLastGizmoMode(tool as GizmoTransformMode);
      }
      if (tool !== 'move') {
        setModalTransform((prev) => {
          if (prev) setModalCancelNonce((n) => n + 1);
          return null;
        });
        setMoveSubModeState(axisConstraint === 'free' ? 'free' : 'axis');
      } else if (switchingToMove) {
        const defaultMoveMode = settings.toolConfigs.move.defaultSubMode;
        if (defaultMoveMode === 'axis') {
          setMoveSubModeState('axis');
          setAxisConstraintState((prev) => (prev === 'free' ? 'x' : prev));
        } else {
          setAxisConstraintState('free');
          setMoveSubModeState('free');
        }
      }
      releaseScreenModifiers();
    },
    [
      activeTool,
      axisConstraint,
      releaseScreenModifiers,
      settings.toolConfigs.move.defaultSubMode,
    ],
  );

  const setAxisConstraint = useCallback(
    (axis: AxisConstraint) => {
      setAxisConstraintState(axis);
      setModalTransform((prev) => {
        if (prev?.source === 'move_tool') {
          setModalCancelNonce((n) => n + 1);
          return null;
        }
        return prev;
      });
      setMoveSubModeState(axis === 'free' ? 'free' : 'axis');
    },
    [],
  );
  const [operatorSession, setOperatorSession] =
    useState<EditOperatorSession | null>(null);
  const [modalTransform, setModalTransform] =
    useState<ModalTransformState | null>(null);
  const [modalCancelNonce, setModalCancelNonce] = useState(0);
  const [loopCutPickError, setLoopCutPickError] = useState<string | null>(null);

  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const savedEditSelectionsRef = useRef<
    Map<string, { mode: EditSelectionMode; ids: string[] }>
  >(new Map());
  const selectionAnchorRef = useRef<string | null>(null);
  const loopCycleRef = useRef<{
    mode: EditSelectionMode;
    seedId: string;
    dirIdx: number;
    activeIds: string[];
    baseIds: string[];
  } | null>(null);

  useEffect(() => {
    if (
      !selectionAnchorRef.current ||
      !selectedComponentIds.has(selectionAnchorRef.current)
    ) {
      let last: string | null = null;
      for (const id of selectedComponentIds) {
        last = id;
      }
      selectionAnchorRef.current = last;
    }
    if (selectedComponentIds.size === 0) {
      loopCycleRef.current = null;
    }
  }, [selectedComponentIds, selectedObjectId, editSelectionMode]);

  const saveCurrentEditSelection = useCallback(() => {
    if (workMode !== 'edit' || !selectedObjectId) return;
    savedEditSelectionsRef.current.set(selectedObjectId, {
      mode: editSelectionMode,
      ids: Array.from(selectedComponentIds),
    });
  }, [editSelectionMode, selectedComponentIds, selectedObjectId, workMode]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const registerThumbnailProvider = useCallback(
    (provider: (() => string | null) | null) => {
      thumbnailProviderRef.current = provider;
    },
    [],
  );

  const registerCameraStateProvider = useCallback(
    (provider: (() => TimelapseCameraState | null) | null) => {
      cameraStateProviderRef.current = provider;
    },
    [],
  );

  const setModelerActive = useCallback((active: boolean) => {
    isModelerActiveRef.current = active;
  }, []);

  const refreshTimelapseMeta = useCallback(
    async (targetProjectId?: string) => {
      const id = targetProjectId ?? project.id;
      const [meta, totals] = await Promise.all([
        getTimelapseMeta(id),
        getTotalTimelapseStorageBytes(),
      ]);
      if (id === project.id) {
        setTimelapseMeta(meta);
        timelapsePausedRef.current = Boolean(meta?.paused);
        if (meta?.lastCameraPose) {
          lastRecordedCameraRef.current = cloneCameraState(meta.lastCameraPose);
        }
      }
      setTimelapseTotalBytes(totals.totalBytes);
      return meta;
    },
    [project.id],
  );

  const markTimelapseOp = useCallback(
    (opType: string, label: string, debounceMs = 0) => {
      pendingTimelapseOpRef.current = { opType, label, debounceMs };
    },
    [],
  );

  const ensureBaselineForProject = useCallback(
    async (targetProj: ProjectData, forceCreate = false) => {
      const existing = await getTimelapseMeta(targetProj.id);
      if (existing) {
        setTimelapseMeta(existing);
        timelapsePausedRef.current = existing.paused;
        if (existing.lastCameraPose) {
          lastRecordedCameraRef.current = cloneCameraState(
            existing.lastCameraPose,
          );
        }
        const totals = await getTotalTimelapseStorageBytes();
        setTimelapseTotalBytes(totals.totalBytes);
        return existing;
      }

      if (!settings.timelapseAutoRecord && !forceCreate) {
        setTimelapseMeta(null);
        timelapsePausedRef.current = false;
        const totals = await getTotalTimelapseStorageBytes();
        setTimelapseTotalBytes(totals.totalBytes);
        return null;
      }

      const cam = cloneCameraState(
        cameraStateProviderRef.current?.() ?? DEFAULT_TIMELAPSE_CAMERA,
      );
      lastRecordedCameraRef.current = cam;
      const res = await appendTimelapseStep({
        projectId: targetProj.id,
        kind: 'baseline',
        opType: 'project_init',
        label: 'Estado inicial del proyecto',
        camera: cam,
        scene: extractRawSceneForTimelapse(targetProj),
        autoRecordEnabled: settings.timelapseAutoRecord,
      });
      if (res) {
        setTimelapseMeta(res.meta);
        timelapsePausedRef.current = res.meta.paused;
      }
      const totals = await getTotalTimelapseStorageBytes();
      setTimelapseTotalBytes(totals.totalBytes);
      return res?.meta ?? null;
    },
    [settings.timelapseAutoRecord],
  );

  const recordCameraMovement = useCallback(
    (
      camera: TimelapseCameraState,
      source: 'orbit' | 'preset' | 'projection',
    ) => {
      if (
        !settings.timelapseAutoRecord ||
        !settings.timelapseRecordCamera ||
        timelapsePausedRef.current ||
        !isModelerActiveRef.current
      ) {
        return;
      }
      if (!shouldRecordCameraMovement(lastRecordedCameraRef.current, camera)) {
        return;
      }
      const snapped = cloneCameraState(camera);
      lastRecordedCameraRef.current = snapped;
      const projectId = lastRecordedProjectRef.current.id;
      void appendTimelapseStep({
        projectId,
        kind: 'camera',
        opType: `camera_${source}`,
        label: formatCameraSourceLabel(source, snapped.projection),
        camera: snapped,
        autoRecordEnabled: true,
      }).then((res) => {
        if (res && res.meta.projectId === projectId) {
          setTimelapseMeta(res.meta);
        }
      });
    },
    [settings.timelapseAutoRecord, settings.timelapseRecordCamera],
  );

  const toggleTimelapseRecordingPaused = useCallback(async () => {
    const nextPaused = !timelapsePausedRef.current;
    timelapsePausedRef.current = nextPaused;
    const updated = await updateTimelapseMeta(project.id, {
      paused: nextPaused,
      enabled: settings.timelapseAutoRecord,
    });
    setTimelapseMeta(updated);
    showToast(
      nextPaused
        ? 'Grabación de Timelapse en pausa'
        : 'Grabación de Timelapse reanudada',
    );
  }, [project.id, settings.timelapseAutoRecord, showToast]);

  const clearActiveProjectTimelapse = useCallback(async () => {
    await clearTimelapseForProject(project.id);
    if (timelapseDebounceTimerRef.current !== null) {
      window.clearTimeout(timelapseDebounceTimerRef.current);
      timelapseDebounceTimerRef.current = null;
    }
    setTimelapseMeta(null);
    timelapsePausedRef.current = false;
    const totals = await getTotalTimelapseStorageBytes();
    setTimelapseTotalBytes(totals.totalBytes);
    showToast('Historial de Timelapse eliminado');
  }, [project.id, showToast]);

  const clearProjectTimelapseById = useCallback(
    async (targetProjectId: string) => {
      await clearTimelapseForProject(targetProjectId);
      if (targetProjectId === project.id) {
        setTimelapseMeta(null);
        timelapsePausedRef.current = false;
      }
      const totals = await getTotalTimelapseStorageBytes();
      setTimelapseTotalBytes(totals.totalBytes);
    },
    [project.id],
  );

  const refreshGalleryData = useCallback(async () => {
    const [nextProjects, nextFolders] = await Promise.all([
      listSavedProjectsAsync(),
      listProjectFoldersAsync(),
    ]);
    setSavedProjects(nextProjects);
    setFolders(nextFolders);
  }, []);

  // Hydrate persistent gallery index, folders, active project, and any crash recovery drafts on startup
  const initialHydrateRef = useRef(false);
  useEffect(() => {
    if (initialHydrateRef.current) return;
    initialHydrateRef.current = true;
    void (async () => {
      await refreshGalleryData();
      const recIds = await listRecoveryProjectIdsAsync();
      if (recIds.length > 0) {
        const loadedRecs: ProjectRecoveryRecord[] = [];
        for (const id of recIds) {
          const rec = await loadRecoveryDraftAsync(id);
          if (rec) loadedRecs.push(rec);
        }
        loadedRecs.sort((a, b) => b.savedAt - a.savedAt);
        setStartupRecoveryList(loadedRecs);
      }

      const storedId = getActiveStoredProjectId() ?? initialProject.id;
      const idbProj = await loadProjectFromAnyStorage(storedId);
      if (idbProj) {
        skipNextTimelapseEffectRef.current = true;
        lastRecordedProjectRef.current = idbProj;
        setProject((curr) => {
          if (curr.id === idbProj.id && idbProj.updatedAt <= curr.updatedAt) {
            return curr;
          }
          const firstId = getActiveScene(idbProj).objects[0]?.id ?? null;
          setSelectedObjectId(firstId);
          setSelectedObjectIds(firstId ? new Set([firstId]) : new Set());
          setMeshRevision((r) => r + 1);
          return idbProj;
        });
        await ensureBaselineForProject(idbProj);
      } else {
        await ensureBaselineForProject(initialProject);
      }
      setIsGalleryReady(true);
    })();
  }, [ensureBaselineForProject, initialProject, refreshGalleryData]);

  // Automatic Timelapse recorder watching visual scene/material changes in the active project
  useEffect(() => {
    const prev = lastRecordedProjectRef.current;
    if (project.id !== prev.id) {
      lastRecordedProjectRef.current = project;
      pendingTimelapseOpRef.current = null;
      return;
    }

    if (skipNextTimelapseEffectRef.current) {
      skipNextTimelapseEffectRef.current = false;
      lastRecordedProjectRef.current = project;
      pendingTimelapseOpRef.current = null;
      return;
    }

    const visualChanged =
      project.scenes !== prev.scenes ||
      project.materials !== prev.materials ||
      project.activeSceneId !== prev.activeSceneId;

    lastRecordedProjectRef.current = project;
    const pendingOp = pendingTimelapseOpRef.current;
    pendingTimelapseOpRef.current = null;

    if (
      !visualChanged ||
      !settings.timelapseAutoRecord ||
      timelapsePausedRef.current
    ) {
      return;
    }

    const opType = pendingOp?.opType ?? 'model_edit';
    const label = pendingOp?.label ?? 'Edición de modelo';
    const debounceMs = pendingOp?.debounceMs ?? 0;

    const commitStep = async (targetProj: ProjectData) => {
      const existing = await getTimelapseMeta(targetProj.id);
      if (!existing) {
        // Ensure a baseline snapshot exists before the first delta
        await appendTimelapseStep({
          projectId: targetProj.id,
          kind: 'baseline',
          opType: 'project_init',
          label: 'Estado inicial del proyecto',
          camera: cloneCameraState(lastRecordedCameraRef.current),
          scene: extractRawSceneForTimelapse(prev),
          autoRecordEnabled: true,
        });
      }

      const cam = cloneCameraState(
        cameraStateProviderRef.current?.() ?? lastRecordedCameraRef.current,
      );
      lastRecordedCameraRef.current = cam;
      const res = await appendTimelapseStep({
        projectId: targetProj.id,
        kind: 'model',
        opType,
        label,
        camera: cam,
        scene: extractRawSceneForTimelapse(targetProj),
        autoRecordEnabled: true,
      });
      if (res) {
        setTimelapseMeta(res.meta);
        const totals = await getTotalTimelapseStorageBytes();
        setTimelapseTotalBytes(totals.totalBytes);
      }
    };

    if (timelapseDebounceTimerRef.current !== null) {
      window.clearTimeout(timelapseDebounceTimerRef.current);
      timelapseDebounceTimerRef.current = null;
    }

    if (debounceMs > 0) {
      const snap = project;
      timelapseDebounceTimerRef.current = window.setTimeout(() => {
        timelapseDebounceTimerRef.current = null;
        void commitStep(snap);
      }, debounceMs);
    } else {
      void commitStep(project);
    }
  }, [project, settings.timelapseAutoRecord]);

  const activeScene = useMemo(() => getActiveScene(project), [project]);
  const activeObjects = activeScene.objects;

  const setSingleSelectedObject = useCallback((id: string | null) => {
    setSelectedObjectId(id);
    setSelectedObjectIds(id ? new Set([id]) : new Set());
  }, []);

  const makeSnapshot = useCallback(
    (
      scenes = project.scenes,
      actSceneId = project.activeSceneId,
      selObjId = selectedObjectId,
      selObjIds = selectedObjectIds,
      mode = workMode,
      subMode = editSelectionMode,
      compIds = selectedComponentIds,
      mats = project.materials,
    ): HistorySnapshot => ({
      scenes: cloneScenes(scenes),
      materials: cloneMaterials(mats),
      activeSceneId: actSceneId,
      selectedObjectId: selObjId,
      selectedObjectIds: Array.from(selObjIds),
      workMode: mode,
      editSelectionMode: subMode,
      selectedComponentIds: Array.from(compIds),
    }),
    [
      project.scenes,
      project.materials,
      project.activeSceneId,
      selectedObjectId,
      selectedObjectIds,
      workMode,
      editSelectionMode,
      selectedComponentIds,
    ],
  );

  const projectMaterials = useMemo<MaterialAsset[]>(() => {
    if (project.materials && project.materials.length > 0) {
      return project.materials;
    }
    return [
      createMaterialAsset({
        id: 'mat_default',
        name: DEFAULT_MATERIAL_NAME,
        baseColor: DEFAULT_MATERIAL_COLOR,
        metallic: DEFAULT_MATERIAL_METALLIC,
        roughness: DEFAULT_MATERIAL_ROUGHNESS,
      }),
    ];
  }, [project.materials]);

  const pushHistory = useCallback((snapshot: HistorySnapshot) => {
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const selectedObject = useMemo(
    () => activeObjects.find((o) => o.id === selectedObjectId) ?? null,
    [activeObjects, selectedObjectId],
  );

  const sceneTransformRefs = useMemo(
    () => buildTransformRefsFromObjects(activeObjects),
    [activeObjects],
  );

  const canUndo = undoStackRef.current.length > 0 && historyVersion >= 0;
  const canRedo = redoStackRef.current.length > 0 && historyVersion >= 0;

  const undo = useCallback(
    (fromGesture = false) => {
      const prev = undoStackRef.current.pop();
      if (!prev) {
        if (fromGesture) showToast('Nada que deshacer');
        return;
      }
      setOperatorSession(null);
      setModalTransform(null);
      setModalCancelNonce((n) => n + 1);
      redoStackRef.current.push(makeSnapshot());
      markTimelapseOp('undo', 'Deshacer operación');
      setProject((p) =>
        syncProjectMaterialsAndObjects({
          ...p,
          activeSceneId: prev.activeSceneId,
          materials: cloneMaterials(prev.materials),
          scenes: cloneScenes(prev.scenes),
        }),
      );
      setSelectedObjectId(prev.selectedObjectId);
      setSelectedObjectIds(
        new Set(
          prev.selectedObjectIds ??
            (prev.selectedObjectId ? [prev.selectedObjectId] : []),
        ),
      );
      setWorkMode(prev.workMode);
      setEditSelectionMode(prev.editSelectionMode);
      setSelectedComponentIds(new Set(prev.selectedComponentIds));
      releaseScreenModifiers();
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      setHistoryVersion((v) => v + 1);
      if (fromGesture) showToast('Deshacer');
    },
    [makeSnapshot, markTimelapseOp, releaseScreenModifiers, showToast],
  );

  const redo = useCallback(
    (fromGesture = false) => {
      const next = redoStackRef.current.pop();
      if (!next) {
        if (fromGesture) showToast('Nada que rehacer');
        return;
      }
      setOperatorSession(null);
      setModalTransform(null);
      setModalCancelNonce((n) => n + 1);
      undoStackRef.current.push(makeSnapshot());
      markTimelapseOp('redo', 'Rehacer operación');
      setProject((p) =>
        syncProjectMaterialsAndObjects({
          ...p,
          activeSceneId: next.activeSceneId,
          materials: cloneMaterials(next.materials),
          scenes: cloneScenes(next.scenes),
        }),
      );
      setSelectedObjectId(next.selectedObjectId);
      setSelectedObjectIds(
        new Set(
          next.selectedObjectIds ??
            (next.selectedObjectId ? [next.selectedObjectId] : []),
        ),
      );
      setWorkMode(next.workMode);
      setEditSelectionMode(next.editSelectionMode);
      setSelectedComponentIds(new Set(next.selectedComponentIds));
      releaseScreenModifiers();
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      setHistoryVersion((v) => v + 1);
      if (fromGesture) showToast('Rehacer');
    },
    [makeSnapshot, markTimelapseOp, releaseScreenModifiers, showToast],
  );

  const setProjectName = useCallback((name: string) => {
    skipNextTimelapseEffectRef.current = true;
    setProject((p) => ({ ...p, name }));
    setHasUnsavedChanges(true);
  }, []);

  const performPersistProject = useCallback(
    async (
      targetProject: ProjectData,
      options?: {
        explicitThumbnail?: string | null;
        silent?: boolean;
        captureViewport?: boolean;
      },
    ): Promise<boolean> => {
      if (isSavingRef.current) return false;
      isSavingRef.current = true;
      setSaveStatus('saving');

      try {
        let thumbnail = options?.explicitThumbnail;
        if (
          thumbnail === undefined &&
          options?.captureViewport !== false &&
          isModelerActiveRef.current &&
          thumbnailProviderRef.current
        ) {
          thumbnail = thumbnailProviderRef.current() ?? undefined;
        }

        const res = await saveProjectAsync(targetProject, {
          thumbnailDataUrl: thumbnail,
          createBackup: settings.createRecoveryBackups,
        });

        if (!res.ok || !res.project) {
          const msg =
            res.error ?? 'No se pudo guardar el proyecto en el dispositivo.';
          setSaveStatus('error');
          setLastSaveError(msg);
          showToast(msg);
          return false;
        }

        await clearRecoveryDraftAsync(res.project.id);
        setStartupRecoveryList((prev) =>
          prev.filter((r) => r.projectId !== res.project!.id),
        );

        skipNextTimelapseEffectRef.current = true;
        setProject((curr) =>
          curr.id === res.project!.id
            ? {
                ...curr,
                updatedAt: res.project!.updatedAt,
                thumbnailDataUrl: res.project!.thumbnailDataUrl,
                thumbnailUpdatedAt: res.project!.thumbnailUpdatedAt,
              }
            : curr,
        );
        await refreshGalleryData();
        setHasUnsavedChanges(false);
        setSaveStatus('saved');
        setLastSavedAt(res.project.updatedAt);
        setLastSaveError(null);
        lastAutosaveRevisionRef.current = meshRevision;
        if (!options?.silent) {
          showToast(`Proyecto "${res.project.name}" guardado`);
        }
        return true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Error inesperado al guardar.';
        setSaveStatus('error');
        setLastSaveError(msg);
        showToast(msg);
        return false;
      } finally {
        isSavingRef.current = false;
      }
    },
    [meshRevision, refreshGalleryData, settings.createRecoveryBackups, showToast],
  );

  // Reflect pending edits in live SaveStatus
  useEffect(() => {
    if (hasUnsavedChanges) {
      setSaveStatus((prev) => (prev === 'saving' ? prev : 'unsaved'));
    }
  }, [hasUnsavedChanges]);

  // Write lightweight recovery snapshot quickly after meaningful edits
  useEffect(() => {
    if (!hasUnsavedChanges || !isModelerActiveRef.current) return;
    const snapProj = project;
    const timer = window.setTimeout(() => {
      if (!isModelerActiveRef.current) return;
      const thumb = thumbnailProviderRef.current?.() ?? undefined;
      void saveRecoveryDraftAsync(snapProj, thumb);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [hasUnsavedChanges, meshRevision, project]);

  // Post-major-operation debounced autosave
  useEffect(() => {
    if (
      !settings.autosaveEnabled ||
      !hasUnsavedChanges ||
      !isModelerActiveRef.current
    ) {
      return;
    }
    if (lastAutosaveRevisionRef.current === meshRevision) return;
    const snapProj = project;
    const timer = window.setTimeout(() => {
      if (!isModelerActiveRef.current || isSavingRef.current) return;
      void performPersistProject(snapProj, { silent: true });
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [
    hasUnsavedChanges,
    meshRevision,
    performPersistProject,
    project,
    settings.autosaveEnabled,
  ]);

  // Periodic interval autosave
  useEffect(() => {
    if (!settings.autosaveEnabled) return;
    const intervalMs = Math.max(10, settings.autosaveIntervalSec) * 1000;
    const id = window.setInterval(() => {
      if (!isModelerActiveRef.current || !hasUnsavedChanges || isSavingRef.current) {
        return;
      }
      void performPersistProject(project, { silent: true });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [
    hasUnsavedChanges,
    performPersistProject,
    project,
    settings.autosaveEnabled,
    settings.autosaveIntervalSec,
  ]);

  const saveProject = useCallback(
    async (explicitThumbnail?: string | null): Promise<boolean> => {
      return performPersistProject(project, {
        explicitThumbnail,
        silent: false,
      });
    },
    [performPersistProject, project],
  );

  const saveProjectSilent = useCallback(
    async (explicitThumbnail?: string | null): Promise<boolean> => {
      return performPersistProject(project, {
        explicitThumbnail,
        silent: true,
      });
    },
    [performPersistProject, project],
  );

  /** LOOPA Core: update ecosystem metadata in memory (persisted with the next save). */
  const setEcosystemMeta = useCallback((meta: ProjectEcosystemMeta) => {
    skipNextTimelapseEffectRef.current = true;
    setProject((curr) => ({ ...curr, ecosystem: meta }));
  }, []);

  /** LOOPA Core: persist the current project together with fresh ecosystem metadata. */
  const saveProjectWithEcosystem = useCallback(
    async (
      meta: ProjectEcosystemMeta,
      explicitThumbnail?: string | null,
    ): Promise<boolean> => {
      skipNextTimelapseEffectRef.current = true;
      setProject((curr) =>
        curr.id === project.id ? { ...curr, ecosystem: meta } : curr,
      );
      return performPersistProject(
        { ...project, ecosystem: meta },
        { explicitThumbnail, silent: true },
      );
    },
    [performPersistProject, project],
  );

  const saveProjectAs = useCallback(
    async (newName: string): Promise<boolean> => {
      const trimmed = newName.trim() || `${project.name} (copia)`;
      const cloned = cloneProjectForDuplicate(project, trimmed);
      const capturedThumb = isModelerActiveRef.current
        ? thumbnailProviderRef.current?.() ?? cloned.thumbnailDataUrl ?? null
        : cloned.thumbnailDataUrl ?? null;

      const res = await saveProjectAsync(cloned, {
        thumbnailDataUrl: capturedThumb,
        createBackup: false,
      });
      if (!res.ok || !res.project) {
        const msg = res.error ?? 'No se pudo guardar la copia del proyecto.';
        setSaveStatus('error');
        setLastSaveError(msg);
        showToast(msg);
        return false;
      }
      await copyTimelapseForProject(project.id, res.project.id);
      lastRecordedProjectRef.current = res.project;
      setProject(res.project);
      await refreshTimelapseMeta(res.project.id);
      await refreshGalleryData();
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      setLastSavedAt(res.project.updatedAt);
      setLastSaveError(null);
      showToast(`Proyecto guardado como "${res.project.name}"`);
      return true;
    },
    [project, refreshGalleryData, refreshTimelapseMeta, showToast],
  );

  const hydrateProjectIntoEditor = useCallback(
    (loaded: ProjectData) => {
      if (timelapseDebounceTimerRef.current !== null) {
        window.clearTimeout(timelapseDebounceTimerRef.current);
        timelapseDebounceTimerRef.current = null;
      }
      pendingTimelapseOpRef.current = null;
      skipNextTimelapseEffectRef.current = true;
      lastRecordedProjectRef.current = loaded;
      setOperatorSession(null);
      setModalTransform(null);
      setModalCancelNonce((n) => n + 1);
      undoStackRef.current = [];
      redoStackRef.current = [];
      savedEditSelectionsRef.current.clear();
      setProject(loaded);
      setSingleSelectedObject(getActiveScene(loaded).objects[0]?.id ?? null);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      setLastSavedAt(loaded.updatedAt);
      setLastSaveError(null);
      setMeshRevision((r) => r + 1);
      setHistoryVersion((v) => v + 1);
      lastAutosaveRevisionRef.current = -1;
    },
    [releaseScreenModifiers, setSingleSelectedObject],
  );

  const createProject = useCallback(
    async (
      name: string,
      templateId: ProjectTemplateId = 'cube',
      folderId: string | null = null,
    ): Promise<ProjectData | null> => {
      const fresh = createProjectFromTemplate({
        name: name.trim() || 'Nuevo Proyecto',
        templateId,
        folderId,
      });
      const res = await saveProjectAsync(fresh, {
        thumbnailDataUrl: fresh.thumbnailDataUrl ?? null,
        createBackup: false,
      });
      const saved = res.project ?? fresh;
      if (!res.ok) {
        showToast(res.error ?? 'Error al guardar el nuevo proyecto');
        return null;
      }
      hydrateProjectIntoEditor(saved);
      lastRecordedCameraRef.current = cloneCameraState(DEFAULT_TIMELAPSE_CAMERA);
      await ensureBaselineForProject(saved);
      await refreshGalleryData();
      showToast(`Proyecto "${saved.name}" creado`);
      return saved;
    },
    [ensureBaselineForProject, hydrateProjectIntoEditor, refreshGalleryData, showToast],
  );

  const openProject = useCallback(
    async (
      projectId: string,
      options?: { skipRecoveryCheck?: boolean },
    ): Promise<boolean> => {
      const loaded =
        (await loadProjectFromAnyStorage(projectId)) ??
        loadProjectLocally(projectId);
      if (!loaded) {
        showToast('No se pudo cargar el proyecto');
        return false;
      }

      if (!options?.skipRecoveryCheck) {
        const rec = await loadRecoveryDraftAsync(projectId);
        if (rec && rec.savedAt > loaded.updatedAt) {
          setPendingRecovery(rec);
          return false;
        }
      }

      const withOpenedAt: ProjectData = {
        ...loaded,
        lastOpenedAt: Date.now(),
      };
      hydrateProjectIntoEditor(withOpenedAt);
      await ensureBaselineForProject(withOpenedAt);
      // Persist updated lastOpenedAt cleanly in background
      void saveProjectAsync(withOpenedAt, { createBackup: false }).then(() =>
        refreshGalleryData(),
      );
      showToast(`Proyecto "${loaded.name}" abierto`);
      return true;
    },
    [ensureBaselineForProject, hydrateProjectIntoEditor, refreshGalleryData, showToast],
  );

  const applyRecoveryDraft = useCallback(
    async (record: ProjectRecoveryRecord): Promise<void> => {
      const recovered: ProjectData = {
        ...record.project,
        lastOpenedAt: Date.now(),
        ...(record.thumbnailDataUrl
          ? { thumbnailDataUrl: record.thumbnailDataUrl }
          : {}),
      };
      hydrateProjectIntoEditor(recovered);
      await ensureBaselineForProject(recovered);
      setHasUnsavedChanges(true);
      setSaveStatus('unsaved');
      setPendingRecovery(null);
      showToast(`Borrador recuperado para "${recovered.name}"`);
    },
    [ensureBaselineForProject, hydrateProjectIntoEditor, showToast],
  );

  const discardRecoveryDraft = useCallback(
    async (projectId: string): Promise<void> => {
      await clearRecoveryDraftAsync(projectId);
      setStartupRecoveryList((prev) =>
        prev.filter((r) => r.projectId !== projectId),
      );
      setPendingRecovery((curr) =>
        curr?.projectId === projectId ? null : curr,
      );
      await refreshGalleryData();
    },
    [refreshGalleryData],
  );

  const dismissPendingRecovery = useCallback(() => {
    setPendingRecovery(null);
  }, []);

  const renameProjectById = useCallback(
    async (projectId: string, newName: string): Promise<boolean> => {
      const res = await renameSavedProjectAsync(projectId, newName);
      if (!res.ok || !res.project) {
        showToast(res.error ?? 'No se pudo renombrar el proyecto');
        return false;
      }
      if (project.id === projectId) {
        skipNextTimelapseEffectRef.current = true;
        setProject((p) => ({ ...p, name: res.project!.name }));
      }
      await refreshGalleryData();
      showToast(`Proyecto renombrado a "${res.project.name}"`);
      return true;
    },
    [project.id, refreshGalleryData, showToast],
  );

  const duplicateProjectById = useCallback(
    async (projectId: string, newName?: string): Promise<ProjectData | null> => {
      const res = await duplicateSavedProjectAsync(projectId, newName);
      if (!res.ok || !res.project) {
        showToast(res.error ?? 'No se pudo duplicar el proyecto');
        return null;
      }
      await refreshGalleryData();
      showToast(`Copia "${res.project.name}" creada`);
      return res.project;
    },
    [refreshGalleryData, showToast],
  );

  const removeSavedProject = useCallback(
    async (projectId: string) => {
      deleteProjectLocally(projectId);
      await deleteProjectsAsync([projectId]);
      await refreshGalleryData();
    },
    [refreshGalleryData],
  );

  const deleteProjectsByIds = useCallback(
    async (projectIds: string[]): Promise<boolean> => {
      if (projectIds.length === 0) return true;
      const res = await deleteProjectsAsync(projectIds);
      if (!res.ok) {
        showToast(res.error ?? 'No se pudieron eliminar los proyectos');
        return false;
      }
      await refreshGalleryData();
      showToast(
        projectIds.length === 1
          ? 'Proyecto eliminado'
          : `${projectIds.length} proyectos eliminados`,
      );
      return true;
    },
    [refreshGalleryData, showToast],
  );

  const moveProjectsToFolder = useCallback(
    async (projectIds: string[], folderId: string | null): Promise<boolean> => {
      if (projectIds.length === 0) return true;
      const res = await moveProjectsToFolderAsync(projectIds, folderId);
      if (!res.ok) {
        showToast(res.error ?? 'No se pudieron mover los proyectos');
        return false;
      }
      if (projectIds.includes(project.id)) {
        skipNextTimelapseEffectRef.current = true;
        setProject((p) => ({ ...p, folderId }));
      }
      await refreshGalleryData();
      showToast(
        folderId
          ? 'Proyecto(s) movido(s) a carpeta'
          : 'Proyecto(s) movido(s) a Sin carpeta',
      );
      return true;
    },
    [project.id, refreshGalleryData, showToast],
  );

  const createFolder = useCallback(
    async (name: string): Promise<ProjectFolder | null> => {
      const res = await createProjectFolderAsync(name);
      if (!res.ok || !res.folder) {
        showToast(res.error ?? 'No se pudo crear la carpeta');
        return null;
      }
      await refreshGalleryData();
      showToast(`Carpeta "${res.folder.name}" creada`);
      return res.folder;
    },
    [refreshGalleryData, showToast],
  );

  const renameFolder = useCallback(
    async (folderId: string, newName: string): Promise<boolean> => {
      const res = await renameProjectFolderAsync(folderId, newName);
      if (!res.ok) {
        showToast(res.error ?? 'No se pudo renombrar la carpeta');
        return false;
      }
      await refreshGalleryData();
      showToast('Carpeta renombrada');
      return true;
    },
    [refreshGalleryData, showToast],
  );

  const deleteFolder = useCallback(
    async (
      folderId: string,
      resolution: DeleteFolderResolution = { mode: 'unfile' },
    ): Promise<boolean> => {
      const res = await deleteProjectFolderAsync(folderId, resolution);
      if (!res.ok) {
        showToast(res.error ?? 'No se pudo eliminar la carpeta');
        return false;
      }
      if (project.folderId === folderId) {
        skipNextTimelapseEffectRef.current = true;
        setProject((p) => ({
          ...p,
          folderId:
            resolution.mode === 'move' ? resolution.targetFolderId : null,
        }));
      }
      await refreshGalleryData();
      showToast('Carpeta eliminada (proyectos conservados)');
      return true;
    },
    [project.folderId, refreshGalleryData, showToast],
  );

  const exportNativeProject = useCallback(
    async (
      targetProjectId?: string,
    ): Promise<{ filename: string; content: string; project: ProjectData } | null> => {
      const source =
        !targetProjectId || targetProjectId === project.id
          ? project
          : await loadProjectFromAnyStorage(targetProjectId);
      if (!source) {
        showToast('No se encontró el proyecto para exportar');
        return null;
      }
      const thumb =
        source.id === project.id && isModelerActiveRef.current
          ? thumbnailProviderRef.current?.() ?? source.thumbnailDataUrl ?? null
          : source.thumbnailDataUrl ?? null;
      const folderName = source.folderId
        ? folders.find((f) => f.id === source.folderId)?.name ?? null
        : null;
      const content = serializeNativeProjectFile(source, {
        folderName,
        thumbnailDataUrl: thumb,
      });
      return {
        filename: buildSafeProjectFilename(source.name),
        content,
        project: source,
      };
    },
    [folders, project, showToast],
  );

  const importNativeProject = useCallback(
    async (
      rawText: string,
      targetFolderId: string | null = null,
    ): Promise<{ ok: boolean; project?: ProjectData; error?: string }> => {
      const parsed = parseNativeProjectFile(rawText);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error };
      }

      const incoming = parsed.envelope.project;
      const existingList = await listSavedProjectsAsync();
      const idExists = existingList.some((s) => s.id === incoming.id);
      const now = Date.now();
      const readyProject: ProjectData = {
        ...incoming,
        id: idExists ? generateId('proj') : incoming.id,
        name: idExists ? `${incoming.name} (importado)` : incoming.name,
        folderId: targetFolderId ?? incoming.folderId ?? null,
        createdAt: incoming.createdAt || now,
        updatedAt: now,
      };

      const res = await saveProjectAsync(readyProject, {
        thumbnailDataUrl:
          parsed.envelope.thumbnailDataUrl ??
          readyProject.thumbnailDataUrl ??
          null,
        createBackup: false,
      });
      if (!res.ok || !res.project) {
        return {
          ok: false,
          error: res.error ?? 'No se pudo guardar el proyecto importado.',
        };
      }
      await refreshGalleryData();
      showToast(`Proyecto "${res.project.name}" importado`);
      return { ok: true, project: res.project };
    },
    [refreshGalleryData, showToast],
  );

  const addPrimitive = useCallback(
    (
      type: PrimitiveType,
      options?: PrimitiveOptions,
      targetCollectionId?: string,
    ) => {
      pushHistory(makeSnapshot());
      const mesh = createPrimitiveMesh(type, options);
      const baseName = PRIMITIVE_LABELS[type];
      const existingCount = activeObjects.filter((o) =>
        o.name.startsWith(baseName),
      ).length;
      const name = existingCount === 0 ? baseName : `${baseName} ${existingCount + 1}`;
      const resolvedCollectionId =
        targetCollectionId &&
        activeScene.collections.some((c) => c.id === targetCollectionId)
          ? targetCollectionId
          : activeScene.activeCollectionId;

      const defaultMat = projectMaterials[0];
      const newObj: SceneObjectData = {
        id: generateId('obj'),
        name,
        objectType: 'mesh',
        primitiveType: type,
        collectionId: resolvedCollectionId,
        visible: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        mesh: mesh.toJSON(),
        materialId: defaultMat.id,
        material: toMaterialSlot(defaultMat),
        shading: 'flat',
        modifiers: [],
      };

      markTimelapseOp('add_primitive', `Agregar ${name}`);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          collections: scene.collections.map((c) =>
            c.id === resolvedCollectionId ? { ...c, expanded: true } : c,
          ),
          objects: [...scene.objects, newObj],
        })),
      );
      setSingleSelectedObject(newObj.id);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(`${name} agregado`);
    },
    [
      activeObjects,
      activeScene.activeCollectionId,
      activeScene.collections,
      makeSnapshot,
      projectMaterials,
      pushHistory,
      releaseScreenModifiers,
      setSingleSelectedObject,
      showToast,
    ],
  );

  const selectObject = useCallback(
    (id: string | null, additive = false) => {
      const effectiveAdditive = additive || screenShiftActive;
      setOperatorSession(null);
      if ((workMode === 'edit' || workMode === 'sculpt') && id !== selectedObjectId) {
        if (workMode === 'edit') {
          saveCurrentEditSelection();
        }
        setWorkMode('object');
        setSelectedComponentIds(new Set());
        releaseScreenModifiers();
      }
      if (effectiveAdditive) {
        if (id === null) return;
        const next = new Set(selectedObjectIds);
        if (next.has(id)) {
          next.delete(id);
          const remaining = Array.from(next);
          setSelectedObjectIds(next);
          setSelectedObjectId(
            id === selectedObjectId
              ? (remaining[remaining.length - 1] ?? null)
              : selectedObjectId,
          );
        } else {
          next.add(id);
          setSelectedObjectIds(next);
          setSelectedObjectId(id);
        }
        return;
      }
      setSingleSelectedObject(id);
    },
    [
      releaseScreenModifiers,
      saveCurrentEditSelection,
      screenShiftActive,
      selectedObjectId,
      selectedObjectIds,
      setSingleSelectedObject,
      workMode,
    ],
  );

  const selectObjectsFromBox = useCallback(
    (ids: string[], additive: boolean) => {
      const effectiveAdditive = additive || screenShiftActive;
      setOperatorSession(null);
      const next = new Set<string>(effectiveAdditive ? selectedObjectIds : []);
      for (const id of ids) next.add(id);

      let nextPrimary: string | null = null;
      if (next.size > 0) {
        if (selectedObjectId && next.has(selectedObjectId)) {
          nextPrimary = selectedObjectId;
        } else {
          const ordered = ids.length > 0 ? ids : Array.from(next);
          nextPrimary = ordered[ordered.length - 1] ?? null;
        }
      }

      if ((workMode === 'edit' || workMode === 'sculpt') && nextPrimary !== selectedObjectId) {
        if (workMode === 'edit') {
          saveCurrentEditSelection();
        }
        setWorkMode('object');
        setSelectedComponentIds(new Set());
        releaseScreenModifiers();
      }
      setSelectedObjectIds(next);
      setSelectedObjectId(nextPrimary);
    },
    [
      releaseScreenModifiers,
      saveCurrentEditSelection,
      screenShiftActive,
      selectedObjectId,
      selectedObjectIds,
      workMode,
    ],
  );

  const selectObjectInScene = useCallback(
    (sceneId: string, objectId: string, additive = false) => {
      setOperatorSession(null);
      if (sceneId !== project.activeSceneId) {
        saveCurrentEditSelection();
        setProject((p) => switchSceneInProject(p, sceneId));
        setWorkMode('object');
        releaseScreenModifiers();
        setSelectedComponentIds(new Set());
        setMeshRevision((r) => r + 1);
        setSingleSelectedObject(objectId);
        return;
      }
      selectObject(objectId, additive);
    },
    [
      project.activeSceneId,
      releaseScreenModifiers,
      saveCurrentEditSelection,
      selectObject,
      setSingleSelectedObject,
    ],
  );

  const toggleWorkMode = useCallback(
    (nextMode: WorkMode) => {
      setOperatorSession(null);
      setModalTransform(null);
      setModalCancelNonce((n) => n + 1);
      releaseScreenModifiers();
      if (nextMode === 'edit' || nextMode === 'sculpt') {
        const modeLabel = nextMode === 'edit' ? 'Modo Edición' : 'Modo Esculpido';
        if (!selectedObject) {
          showToast(`Selecciona un objeto para entrar en ${modeLabel}`);
          return;
        }
        if (selectedObject.objectType === 'reference_image') {
          showToast(`Las referencias de imagen no permiten el ${modeLabel}`);
          return;
        }
        if (!isEditableMeshObject(selectedObject)) {
          showToast(`Este tipo de objeto no permite el ${modeLabel}`);
          return;
        }
        if (selectedObject.locked) {
          showToast('El objeto está bloqueado');
          return;
        }
        setSingleSelectedObject(selectedObject.id);
        if (nextMode === 'edit') {
          const saved = savedEditSelectionsRef.current.get(selectedObject.id);
          if (saved && saved.ids.length > 0) {
            const mesh = EditableMesh.fromJSON(selectedObject.mesh);
            const validIds = new Set<string>();
            for (const id of saved.ids) {
              const exists =
                saved.mode === 'vertex'
                  ? Boolean(mesh.getVertex(id))
                  : saved.mode === 'edge'
                    ? Boolean(mesh.getEdge(id))
                    : Boolean(mesh.getFace(id));
              if (exists) validIds.add(id);
            }
            setEditSelectionMode(saved.mode);
            setSelectedComponentIds(validIds);
          } else {
            setSelectedComponentIds(new Set());
          }
        } else {
          if (workMode === 'edit') {
            saveCurrentEditSelection();
          }
          setSelectedComponentIds(new Set());
        }
      } else {
        if (workMode === 'edit') {
          saveCurrentEditSelection();
        }
        setSelectedComponentIds(new Set());
        if (selectedObject) {
          setSingleSelectedObject(selectedObject.id);
        }
      }
      setWorkMode(nextMode);
    },
    [
      releaseScreenModifiers,
      saveCurrentEditSelection,
      selectedObject,
      setSingleSelectedObject,
      showToast,
      workMode,
    ],
  );

  /**
   * LOOPA Ecosystem: put the viewport in the work mode an app needs.
   * Sculpt needs a sculptable mesh: keeps the selected one or picks the first
   * visible, unlocked mesh in the active scene.
   */
  const enterAppWorkMode = useCallback(
    (app: 'modeler' | 'sculpt'): boolean => {
      if (app === 'modeler') {
        if (workMode === 'sculpt') toggleWorkMode('object');
        return true;
      }
      if (workMode === 'sculpt') return true;
      if (
        selectedObject &&
        isEditableMeshObject(selectedObject) &&
        !selectedObject.locked
      ) {
        toggleWorkMode('sculpt');
        return true;
      }
      const target = activeObjects.find(
        (o) => isEditableMeshObject(o) && !o.locked && o.visible !== false,
      );
      if (!target) {
        showToast('Añade un objeto de malla para esculpir en LOOPA Sculpt');
        return false;
      }
      setOperatorSession(null);
      setModalTransform(null);
      setModalCancelNonce((n) => n + 1);
      releaseScreenModifiers();
      if (workMode === 'edit') saveCurrentEditSelection();
      setSelectedComponentIds(new Set());
      setSingleSelectedObject(target.id);
      setWorkMode('sculpt');
      return true;
    },
    [
      activeObjects,
      releaseScreenModifiers,
      saveCurrentEditSelection,
      selectedObject,
      setSingleSelectedObject,
      showToast,
      toggleWorkMode,
      workMode,
    ],
  );

  const changeEditSelectionMode = useCallback(
    (mode: EditSelectionMode) => {
      setOperatorSession(null);
      setModalTransform(null);
      setModalCancelNonce((n) => n + 1);
      loopCycleRef.current = null;
      if (mode === editSelectionMode) return;
      if (selectedObject && selectedComponentIds.size > 0) {
        const mesh = EditableMesh.fromJSON(selectedObject.mesh);
        const derived = computeDerivedEditSelection(
          mesh,
          editSelectionMode,
          selectedComponentIds,
        );
        const converted =
          mode === 'vertex'
            ? derived.vertexIds
            : mode === 'edge'
              ? derived.edgeIds
              : derived.faceIds;
        setSelectedComponentIds(new Set(converted));
      } else {
        setSelectedComponentIds(new Set());
      }
      setEditSelectionMode(mode);
    },
    [editSelectionMode, selectedComponentIds, selectedObject],
  );

  const updateObjectTransform = useCallback(
    (objectId: string, transform: ObjectTransform, recordHistory = true) => {
      if (recordHistory) {
        pushHistory(makeSnapshot());
      }
      markTimelapseOp('object_transform', 'Transformar objeto', recordHistory ? 0 : 220);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) => {
            if (o.id !== objectId) return o;
            if (o.objectType === 'reference_image' && o.referenceImage) {
              return {
                ...o,
                transform,
                referenceImage: {
                  ...o.referenceImage,
                  orientation: detectOrientationFromRotation(transform.rotation),
                },
              };
            }
            return { ...o, transform };
          }),
        })),
      );
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, markTimelapseOp, pushHistory],
  );

  const commitObjectTransformsFromGizmo = useCallback(
    (changes: ObjectTransformChange[]) => {
      const changesById = new Map(changes.map((change) => [change.id, change]));
      if (changesById.size === 0) return;

      const snapshot = makeSnapshot();
      snapshot.scenes = snapshot.scenes.map((s) =>
        s.id === snapshot.activeSceneId
          ? {
              ...s,
              objects: s.objects.map((o) => {
                const change = changesById.get(o.id);
                return change ? { ...o, transform: change.before } : o;
              }),
            }
          : s,
      );
      pushHistory(snapshot);

      markTimelapseOp('object_transform_gizmo', 'Transformar objeto');
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) => {
            const change = changesById.get(o.id);
            if (!change) return o;
            if (o.objectType === 'reference_image' && o.referenceImage) {
              return {
                ...o,
                transform: change.after,
                referenceImage: {
                  ...o.referenceImage,
                  orientation: detectOrientationFromRotation(
                    change.after.rotation,
                  ),
                },
              };
            }
            return { ...o, transform: change.after };
          }),
        })),
      );
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, markTimelapseOp, pushHistory],
  );

  const commitObjectTransformFromGizmo = useCallback(
    (
      objectId: string,
      beforeTransform: ObjectTransform,
      afterTransform: ObjectTransform,
    ) => {
      commitObjectTransformsFromGizmo([
        { id: objectId, before: beforeTransform, after: afterTransform },
      ]);
    },
    [commitObjectTransformsFromGizmo],
  );

  const commitMeshEditFromGizmo = useCallback(
    (objectId: string, beforeMesh: EditableMesh, afterMesh: EditableMesh) => {
      const snapshot = makeSnapshot();
      snapshot.scenes = snapshot.scenes.map((s) =>
        s.id === snapshot.activeSceneId
          ? {
              ...s,
              objects: s.objects.map((o) =>
                o.id === objectId ? { ...o, mesh: beforeMesh.toJSON() } : o,
              ),
            }
          : s,
      );
      pushHistory(snapshot);

      const cleanAfterMesh = afterMesh.clone();
      const targetObj = activeObjects.find((o) => o.id === objectId);
      if (targetObj?.modifiers && targetObj.modifiers.length > 0) {
        const startPositions = new Map<string, Vec3>();
        const movedIds: string[] = [];
        for (const bv of beforeMesh.vertices) {
          startPositions.set(bv.id, [...bv.position]);
          const av = cleanAfterMesh.getVertex(bv.id);
          if (
            av &&
            (Math.abs(av.position[0] - bv.position[0]) > 1e-8 ||
              Math.abs(av.position[1] - bv.position[1]) > 1e-8 ||
              Math.abs(av.position[2] - bv.position[2]) > 1e-8)
          ) {
            movedIds.push(bv.id);
          }
        }
        const ownerRef: ModifierTransformRef = {
          id: targetObj.id,
          position: targetObj.transform.position,
          rotation: targetObj.transform.rotation,
          scale: targetObj.transform.scale,
        };
        clampVerticesForMirrorClipping(
          cleanAfterMesh,
          movedIds,
          startPositions,
          targetObj.modifiers,
          ownerRef,
          sceneTransformRefs,
        );
      }
      cleanAfterMesh.clearCustomNormals();

      markTimelapseOp('mesh_edit_gizmo', 'Editar geometría');
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, mesh: cleanAfterMesh.toJSON() } : o,
          ),
        })),
      );
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
    },
    [activeObjects, makeSnapshot, markTimelapseOp, pushHistory, sceneTransformRefs],
  );

  const markSelectedSeams = useCallback(
    (isSeam: boolean) => {
      if (!selectedObjectId) return;
      const targetObj = activeObjects.find((o) => o.id === selectedObjectId);
      if (!targetObj || targetObj.objectType !== 'mesh') return;

      if (selectedComponentIds.size === 0) {
        showToast('Selecciona vértices, aristas o caras en Modo Edición');
        return;
      }

      const beforeMesh = EditableMesh.fromJSON(targetObj.mesh);
      const afterMesh = beforeMesh.clone();

      const edgeIdsToUpdate = resolveEdgeIdsForSeamSelection(
        afterMesh,
        editSelectionMode,
        selectedComponentIds,
        isSeam ? 'mark' : 'clear',
      );

      if (edgeIdsToUpdate.size === 0) {
        showToast(
          editSelectionMode === 'vertex'
            ? 'Selecciona al menos 2 vértices conectados por una arista'
            : 'No hay aristas válidas en la selección actual',
        );
        return;
      }

      let changedCount = 0;
      for (const edge of afterMesh.edges) {
        if (edgeIdsToUpdate.has(edge.id)) {
          const prev = Boolean(edge.isSeam);
          if (prev !== isSeam) {
            edge.isSeam = isSeam ? true : undefined;
            if (!isSeam) delete edge.isSeam;
            changedCount++;
          }
        }
      }

      if (changedCount > 0) {
        commitMeshEditFromGizmo(selectedObjectId, beforeMesh, afterMesh);
        showToast(
          isSeam
            ? `Marcadas ${changedCount} aristas como costura UV`
            : `Eliminadas ${changedCount} costuras UV`,
        );
      } else {
        showToast(
          isSeam
            ? 'Las aristas seleccionadas ya eran costuras UV'
            : 'No había costuras UV en la selección',
        );
      }
    },
    [
      selectedObjectId,
      activeObjects,
      editSelectionMode,
      selectedComponentIds,
      commitMeshEditFromGizmo,
      showToast,
    ],
  );

  const selectSeams = useCallback(() => {
    if (!selectedObjectId) return;
    const targetObj = activeObjects.find((o) => o.id === selectedObjectId);
    if (!targetObj || targetObj.objectType !== 'mesh') return;

    const mesh = EditableMesh.fromJSON(targetObj.mesh);
    const seamEdgeIds = new Set<string>();
    for (const edge of mesh.edges) {
      if (edge.isSeam) seamEdgeIds.add(edge.id);
    }

    if (seamEdgeIds.size === 0) {
      showToast('Este objeto no tiene costuras UV marcadas');
      return;
    }

    setEditSelectionMode('edge');
    setSelectedComponentIds(seamEdgeIds);
    showToast(`Seleccionadas ${seamEdgeIds.size} costuras UV`);
  }, [
    selectedObjectId,
    activeObjects,
    setSelectedComponentIds,
    setEditSelectionMode,
    showToast,
  ]);

  const deselectSeams = useCallback(() => {
    if (!selectedObjectId) return;
    const targetObj = activeObjects.find((o) => o.id === selectedObjectId);
    if (!targetObj || targetObj.objectType !== 'mesh') return;

    const mesh = EditableMesh.fromJSON(targetObj.mesh);
    const seamEdgeIds = new Set<string>();
    for (const edge of mesh.edges) {
      if (edge.isSeam) seamEdgeIds.add(edge.id);
    }

    if (seamEdgeIds.size === 0) {
      showToast('Este objeto no tiene costuras UV');
      return;
    }

    if (editSelectionMode === 'edge') {
      const next = new Set<string>();
      let removed = 0;
      for (const eid of selectedComponentIds) {
        if (seamEdgeIds.has(eid)) {
          removed++;
        } else {
          next.add(eid);
        }
      }
      setSelectedComponentIds(next);
      showToast(
        removed > 0
          ? `Deseleccionadas ${removed} costuras UV`
          : 'No había costuras seleccionadas',
      );
      return;
    }

    const derived = computeDerivedEditSelection(
      mesh,
      editSelectionMode,
      selectedComponentIds,
    );
    const remainingEdges = new Set<string>();
    let removed = 0;
    for (const eid of derived.edgeIds) {
      if (seamEdgeIds.has(eid)) {
        removed++;
      } else {
        remainingEdges.add(eid);
      }
    }
    setEditSelectionMode('edge');
    setSelectedComponentIds(remainingEdges);
    showToast(
      removed > 0
        ? `Deseleccionadas ${removed} costuras UV`
        : 'No había costuras en la selección',
    );
  }, [
    selectedObjectId,
    activeObjects,
    editSelectionMode,
    selectedComponentIds,
    setEditSelectionMode,
    setSelectedComponentIds,
    showToast,
  ]);

  const setEditSelectionFromUV = useCallback(
    (mode: EditSelectionMode, ids: Set<string>, silent = false) => {
      if (!selectedObject || selectedObject.objectType !== 'mesh') return;
      if (selectedObject.locked) {
        if (!silent) showToast('El objeto está bloqueado');
        return;
      }
      const nextIds = new Set(ids);
      savedEditSelectionsRef.current.set(selectedObject.id, {
        mode,
        ids: Array.from(nextIds),
      });
      setWorkMode('edit');
      setEditSelectionMode(mode);
      setSelectedComponentIds(nextIds);
      if (!silent) {
        showToast(
          nextIds.size > 0
            ? `Sincronizado al 3D: ${nextIds.size} elemento(s)`
            : 'Selección 3D limpiada desde Editor UV',
        );
      }
    },
    [selectedObject, setEditSelectionMode, setSelectedComponentIds, showToast],
  );

  const renameObject = useCallback(
    (objectId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      pushHistory(makeSnapshot());
      skipNextTimelapseEffectRef.current = true;
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, name: trimmed } : o,
          ),
        })),
      }));
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, pushHistory],
  );

  const toggleObjectVisibility = useCallback(
    (objectId: string) => {
      pushHistory(makeSnapshot());
      markTimelapseOp('toggle_visibility', 'Cambiar visibilidad de objeto');
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, visible: !o.visible } : o,
          ),
        })),
      }));
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, markTimelapseOp, pushHistory],
  );

  const toggleObjectLock = useCallback(
    (objectId: string) => {
      pushHistory(makeSnapshot());
      skipNextTimelapseEffectRef.current = true;
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, locked: !o.locked } : o,
          ),
        })),
      }));
      if (objectId === selectedObjectId && (workMode === 'edit' || workMode === 'sculpt')) {
        if (workMode === 'edit') {
          saveCurrentEditSelection();
        }
        setWorkMode('object');
        releaseScreenModifiers();
        setSelectedComponentIds(new Set());
      }
      setHasUnsavedChanges(true);
    },
    [
      makeSnapshot,
      pushHistory,
      releaseScreenModifiers,
      saveCurrentEditSelection,
      selectedObjectId,
      workMode,
    ],
  );

  const duplicateObjectById = useCallback(
    (objectId: string) => {
      const targetScene =
        project.scenes.find((s) => s.objects.some((o) => o.id === objectId)) ??
        null;
      const target =
        targetScene?.objects.find((o) => o.id === objectId) ?? null;
      if (!targetScene || !target) return;

      pushHistory(makeSnapshot());
      const copy: SceneObjectData = {
        ...JSON.parse(JSON.stringify(target)),
        id: generateId('obj'),
        name: `${target.name} Copia`,
        transform: {
          position: [
            target.transform.position[0] + 0.5,
            target.transform.position[1],
            target.transform.position[2] + 0.5,
          ],
          rotation: [...target.transform.rotation] as Vec3,
          scale: [...target.transform.scale] as Vec3,
        },
      };
      markTimelapseOp('duplicate_object', `Duplicar ${target.name}`);
      setProject((p) => ({
        ...p,
        activeSceneId: targetScene.id,
        scenes: p.scenes.map((s) =>
          s.id === targetScene.id ? { ...s, objects: [...s.objects, copy] } : s,
        ),
      }));
      saveCurrentEditSelection();
      setSingleSelectedObject(copy.id);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(`Objeto duplicado: ${copy.name}`);
    },
    [
      makeSnapshot,
      project.scenes,
      pushHistory,
      releaseScreenModifiers,
      saveCurrentEditSelection,
      setSingleSelectedObject,
      showToast,
    ],
  );

  const duplicateSelectedObject = useCallback(() => {
    if (!selectedObject) return;
    duplicateObjectById(selectedObject.id);
  }, [duplicateObjectById, selectedObject]);

  const applyObjectTransform = useCallback(() => {
    if (!selectedObject) {
      showToast('Selecciona un objeto para aplicar transformaciones');
      return;
    }
    if (!isEditableMeshObject(selectedObject)) {
      showToast('Este tipo de objeto no permite aplicar transformaciones a la malla');
      return;
    }
    if (selectedObject.locked) {
      showToast('Desbloquea el objeto antes de aplicar transformaciones');
      return;
    }
    setOperatorSession(null);
    pushHistory(makeSnapshot());

    const baked = applyObjectTransformToMesh(
      EditableMesh.fromJSON(selectedObject.mesh),
      selectedObject.transform,
    );
    const bakedJson = baked.toJSON();
    const identityTransform: ObjectTransform = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    markTimelapseOp('apply_transform', `Aplicar transformaciones a ${selectedObject.name}`);
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === selectedObject.id
            ? { ...o, mesh: bakedJson, transform: identityTransform }
            : o,
        ),
      })),
    );
    releaseScreenModifiers();
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    showToast(`Transformaciones aplicadas a "${selectedObject.name}"`);
  }, [
    makeSnapshot,
    markTimelapseOp,
    pushHistory,
    releaseScreenModifiers,
    selectedObject,
    showToast,
  ]);

  const centerObjectOrigin = useCallback(() => {
    if (!selectedObject) {
      showToast('Selecciona un objeto para centrar su origen');
      return;
    }
    if (!isEditableMeshObject(selectedObject)) {
      showToast('Este tipo de objeto no permite centrar su origen geométrico');
      return;
    }
    if (selectedObject.locked) {
      showToast('Desbloquea el objeto antes de centrar su origen');
      return;
    }
    const baseMesh = EditableMesh.fromJSON(selectedObject.mesh);
    const res = centerMeshOrigin(baseMesh);
    if (!res) {
      showToast('El objeto no tiene vértices para centrar el origen');
      return;
    }
    setOperatorSession(null);
    pushHistory(makeSnapshot());

    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        selectedObject.transform.rotation[0],
        selectedObject.transform.rotation[1],
        selectedObject.transform.rotation[2],
        'XYZ',
      ),
    );
    const worldOffset = new THREE.Vector3(
      res.localOffset[0] * selectedObject.transform.scale[0],
      res.localOffset[1] * selectedObject.transform.scale[1],
      res.localOffset[2] * selectedObject.transform.scale[2],
    ).applyQuaternion(quat);

    const nextPos: Vec3 = [
      selectedObject.transform.position[0] + worldOffset.x,
      selectedObject.transform.position[1] + worldOffset.y,
      selectedObject.transform.position[2] + worldOffset.z,
    ];
    const centeredJson = res.mesh.toJSON();

    markTimelapseOp('center_origin', `Centrar origen de ${selectedObject.name}`);
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === selectedObject.id
            ? {
                ...o,
                mesh: centeredJson,
                transform: { ...o.transform, position: nextPos },
              }
            : o,
        ),
      })),
    );
    releaseScreenModifiers();
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    showToast(`Origen centrado en "${selectedObject.name}"`);
  }, [
    makeSnapshot,
    markTimelapseOp,
    pushHistory,
    releaseScreenModifiers,
    selectedObject,
    showToast,
  ]);

  const separateSelectedGeometry = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') {
      showToast('Entra en Modo Edición y selecciona geometría para separar');
      return;
    }
    if (!isEditableMeshObject(selectedObject)) {
      showToast('Este objeto no admite separación de geometría');
      return;
    }
    if (selectedObject.locked) {
      showToast('El objeto está bloqueado');
      return;
    }

    const sourceMesh = EditableMesh.fromJSON(selectedObject.mesh);
    const sepRes = separateGeometryFromMesh(
      sourceMesh,
      editSelectionMode,
      selectedComponentIds,
    );
    if (sepRes.error || !sepRes.remainingMesh || !sepRes.separatedMesh) {
      showToast(sepRes.error ?? 'No se pudo separar la geometría seleccionada');
      return;
    }

    setOperatorSession(null);
    pushHistory(makeSnapshot());

    const baseName = `${selectedObject.name} Parte`;
    const existingCount = activeObjects.filter((o) =>
      o.name.startsWith(baseName),
    ).length;
    const newName =
      existingCount === 0 ? baseName : `${baseName} ${existingCount + 1}`;

    const newObj: SceneObjectData = {
      id: generateId('obj'),
      name: newName,
      objectType: 'mesh',
      primitiveType: 'custom',
      collectionId: selectedObject.collectionId,
      visible: true,
      locked: false,
      transform: {
        position: [...selectedObject.transform.position] as Vec3,
        rotation: [...selectedObject.transform.rotation] as Vec3,
        scale: [...selectedObject.transform.scale] as Vec3,
      },
      mesh: sepRes.separatedMesh.toJSON(),
      materialId: selectedObject.materialId,
      material: { ...selectedObject.material },
      shading: selectedObject.shading ?? 'flat',
      modifiers: [],
    };

    const remainingJson = sepRes.remainingMesh.toJSON();
    markTimelapseOp('separate_geometry', `Separar geometría (${newName})`);
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: [
          ...scene.objects.map((o) =>
            o.id === selectedObject.id ? { ...o, mesh: remainingJson } : o,
          ),
          newObj,
        ],
      })),
    );
    savedEditSelectionsRef.current.delete(selectedObject.id);
    setSelectedComponentIds(new Set());
    releaseScreenModifiers();
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    showToast(`Geometría separada en "${newName}"`);
  }, [
    activeObjects,
    editSelectionMode,
    makeSnapshot,
    markTimelapseOp,
    pushHistory,
    releaseScreenModifiers,
    selectedComponentIds,
    selectedObject,
    showToast,
    workMode,
  ]);

  const deleteObject = useCallback(
    (objectId: string) => {
      const targetScene =
        project.scenes.find((s) => s.objects.some((o) => o.id === objectId)) ??
        null;
      const target =
        targetScene?.objects.find((o) => o.id === objectId) ?? null;
      if (!targetScene || !target) return;
      if (target.locked) {
        showToast('Desbloquea el objeto antes de eliminarlo');
        return;
      }
      pushHistory(makeSnapshot());
      savedEditSelectionsRef.current.delete(objectId);
      const remaining = targetScene.objects.filter((o) => o.id !== objectId);
      markTimelapseOp('delete_object', `Eliminar ${target.name}`);
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((s) =>
          s.id === targetScene.id ? { ...s, objects: remaining } : s,
        ),
      }));
      const nextSet = new Set(selectedObjectIds);
      nextSet.delete(objectId);
      if (nextSet.size === 0 && selectedObjectId === objectId) {
        setSingleSelectedObject(remaining[0]?.id ?? null);
        setWorkMode('object');
        releaseScreenModifiers();
        setSelectedComponentIds(new Set());
      } else {
        setSelectedObjectIds(nextSet);
        if (selectedObjectId === objectId) {
          const fallback = Array.from(nextSet)[0] ?? remaining[0]?.id ?? null;
          setSelectedObjectId(fallback);
          setWorkMode('object');
          releaseScreenModifiers();
          setSelectedComponentIds(new Set());
        }
      }
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
    },
    [
      makeSnapshot,
      project.scenes,
      pushHistory,
      releaseScreenModifiers,
      selectedObjectId,
      selectedObjectIds,
      setSingleSelectedObject,
      showToast,
    ],
  );

  const deleteSelectedObjects = useCallback(() => {
    const idsToDelete = new Set<string>(selectedObjectIds);
    if (selectedObjectId) idsToDelete.add(selectedObjectId);
    if (idsToDelete.size === 0) return;

    if (idsToDelete.size === 1) {
      const onlyId = Array.from(idsToDelete)[0];
      deleteObject(onlyId);
      return;
    }

    const targets = activeObjects.filter((o) => idsToDelete.has(o.id));
    const unlockedIds = new Set(targets.filter((o) => !o.locked).map((o) => o.id));
    if (unlockedIds.size === 0) {
      showToast('Desbloquea los objetos antes de eliminarlos');
      return;
    }

    pushHistory(makeSnapshot());
    for (const uid of unlockedIds) {
      savedEditSelectionsRef.current.delete(uid);
    }
    const remaining = activeObjects.filter((o) => !unlockedIds.has(o.id));
    markTimelapseOp(
      'delete_selected_objects',
      `Eliminar ${unlockedIds.size} objetos`,
    );
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: remaining,
      })),
    );
    setSingleSelectedObject(remaining[0]?.id ?? null);
    setWorkMode('object');
    releaseScreenModifiers();
    setSelectedComponentIds(new Set());
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    showToast(`${unlockedIds.size} objetos eliminados`);
  }, [
    activeObjects,
    deleteObject,
    makeSnapshot,
    pushHistory,
    releaseScreenModifiers,
    selectedObjectId,
    selectedObjectIds,
    setSingleSelectedObject,
    showToast,
  ]);

  /* ==========================================================================
   * Scene & Collection Hierarchy Actions
   * ======================================================================== */
  const createScene = useCallback(
    (name?: string) => {
      pushHistory(makeSnapshot());
      const res = addSceneToProject(project, name);
      setProject(res.project);
      setOperatorSession(null);
      setSelectedObjectId(res.scene.objects[0]?.id ?? null);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(`Escena "${res.scene.name}" creada`);
    },
    [makeSnapshot, project, pushHistory, releaseScreenModifiers, showToast],
  );

  const switchScene = useCallback(
    (sceneId: string) => {
      if (sceneId === project.activeSceneId) return;
      const target = project.scenes.find((s) => s.id === sceneId);
      if (!target) return;
      setOperatorSession(null);
      setProject((p) => switchSceneInProject(p, sceneId));
      setSelectedObjectId(target.objects[0]?.id ?? null);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setMeshRevision((r) => r + 1);
    },
    [project.activeSceneId, project.scenes, releaseScreenModifiers],
  );

  const renameScene = useCallback(
    (sceneId: string, name: string) => {
      if (!name.trim()) return;
      pushHistory(makeSnapshot());
      skipNextTimelapseEffectRef.current = true;
      setProject((p) => renameSceneInProject(p, sceneId, name));
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, pushHistory],
  );

  const deleteScene = useCallback(
    (sceneId: string) => {
      if (project.scenes.length <= 1) {
        showToast('No se puede eliminar la última escena');
        return;
      }
      pushHistory(makeSnapshot());
      const res = deleteSceneFromProject(project, sceneId);
      if (res.error) {
        showToast(res.error);
        return;
      }
      setProject(res.project);
      const nextScene = getActiveScene(res.project);
      setOperatorSession(null);
      setSelectedObjectId(nextScene.objects[0]?.id ?? null);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast('Escena eliminada');
    },
    [makeSnapshot, project, pushHistory, releaseScreenModifiers, showToast],
  );

  const createCollection = useCallback(
    (sceneId = activeScene.id, name?: string, parentId: string | null = null) => {
      pushHistory(makeSnapshot());
      const res = addCollectionToScene(project, sceneId, name, parentId);
      if (res.collection) {
        setProject(res.project);
        setHasUnsavedChanges(true);
        showToast(`Colección "${res.collection.name}" creada`);
      }
    },
    [activeScene.id, makeSnapshot, project, pushHistory, showToast],
  );

  const selectCollection = useCallback(
    (sceneId: string, collectionId: string) => {
      setProject((p) => {
        const switched =
          sceneId !== p.activeSceneId ? switchSceneInProject(p, sceneId) : p;
        return setActiveCollectionInScene(switched, sceneId, collectionId);
      });
      if (sceneId !== project.activeSceneId) {
        const target = project.scenes.find((s) => s.id === sceneId);
        setOperatorSession(null);
        setSelectedObjectId(target?.objects[0]?.id ?? null);
        setWorkMode('object');
        releaseScreenModifiers();
        setSelectedComponentIds(new Set());
        setMeshRevision((r) => r + 1);
      }
    },
    [project.activeSceneId, project.scenes, releaseScreenModifiers],
  );

  const renameCollection = useCallback(
    (sceneId: string, collectionId: string, name: string) => {
      if (!name.trim()) return;
      pushHistory(makeSnapshot());
      skipNextTimelapseEffectRef.current = true;
      setProject((p) => renameCollectionInScene(p, sceneId, collectionId, name));
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, pushHistory],
  );

  const toggleCollectionExpanded = useCallback(
    (sceneId: string, collectionId: string) => {
      skipNextTimelapseEffectRef.current = true;
      setProject((p) =>
        toggleCollectionExpandedInScene(p, sceneId, collectionId),
      );
    },
    [],
  );

  const deleteCollection = useCallback(
    (
      sceneId: string,
      collectionId: string,
      resolution: DeleteCollectionResolution,
    ) => {
      const targetScene = project.scenes.find((s) => s.id === sceneId);
      if (!targetScene) return;
      if (targetScene.collections.length <= 1) {
        showToast('Cada escena debe mantener al menos una colección');
        return;
      }
      pushHistory(makeSnapshot());
      const res = deleteCollectionFromScene(
        project,
        sceneId,
        collectionId,
        resolution,
      );
      if (res.error) {
        showToast(res.error);
        return;
      }
      setProject(res.project);
      if (
        selectedObjectId &&
        res.deletedObjectIds.includes(selectedObjectId)
      ) {
        const nextActiveScene = getActiveScene(res.project);
        setSelectedObjectId(nextActiveScene.objects[0]?.id ?? null);
        setWorkMode('object');
        releaseScreenModifiers();
        setSelectedComponentIds(new Set());
      }
      for (const did of res.deletedObjectIds) {
        savedEditSelectionsRef.current.delete(did);
      }
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(
        resolution.mode === 'move_objects'
          ? 'Colección eliminada y objetos reubicados'
          : 'Colección eliminada',
      );
    },
    [
      makeSnapshot,
      project,
      pushHistory,
      releaseScreenModifiers,
      selectedObjectId,
      showToast,
    ],
  );

  const moveObjectToCollection = useCallback(
    (sceneId: string, objectId: string, targetCollectionId: string) => {
      const scene = project.scenes.find((s) => s.id === sceneId);
      const obj = scene?.objects.find((o) => o.id === objectId);
      if (!scene || !obj || obj.collectionId === targetCollectionId) return;

      pushHistory(makeSnapshot());
      setProject((p) =>
        moveObjectToCollectionInScene(p, sceneId, objectId, targetCollectionId),
      );
      setHasUnsavedChanges(true);
      const destCol = scene.collections.find((c) => c.id === targetCollectionId);
      if (destCol) {
        showToast(`"${obj.name}" movido a ${destCol.name}`);
      }
    },
    [makeSnapshot, project.scenes, pushHistory, showToast],
  );

  /* ==========================================================================
   * Model Import (OBJ / STL) & Reference Image Actions
   * ======================================================================== */
  const importObjParts = useCallback(
    (result: ObjImportResult, targetCollectionId?: string) => {
      if (result.parts.length === 0) return;
      pushHistory(makeSnapshot());

      const baseColId =
        targetCollectionId &&
        activeScene.collections.some((c) => c.id === targetCollectionId)
          ? targetCollectionId
          : activeScene.activeCollectionId;

      let nextProject = project;
      let destCollectionId = baseColId;

      // Preserve multi-group organization by creating a dedicated collection if multiple OBJ groups exist
      if (result.parts.length > 1) {
        const colRes = addCollectionToScene(
          nextProject,
          activeScene.id,
          result.baseName,
          baseColId,
        );
        nextProject = colRes.project;
        if (colRes.collection) {
          destCollectionId = colRes.collection.id;
        }
      }

      let nextMaterials = [...projectMaterials];
      const importedMatByKey = new Map<string, MaterialAsset>();
      const fallbackMat = nextMaterials[0];

      const newObjects: SceneObjectData[] = result.parts.map((part) => {
        let assignedMat = fallbackMat;
        if (part.materialInfo) {
          const existing = importedMatByKey.get(part.materialInfo.key);
          if (existing) {
            assignedMat = existing;
          } else {
            const created = createMaterialAsset({
              name: part.materialInfo.name,
              baseColor: part.materialInfo.baseColor,
              metallic: part.materialInfo.metallic,
              roughness: part.materialInfo.roughness,
            });
            nextMaterials = [...nextMaterials, created];
            importedMatByKey.set(part.materialInfo.key, created);
            assignedMat = created;
          }
        }
        return {
          id: generateId('obj'),
          name: part.name,
          objectType: 'mesh',
          primitiveType: 'custom',
          collectionId: destCollectionId,
          visible: true,
          locked: false,
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          mesh: part.mesh.toJSON(),
          materialId: assignedMat.id,
          material: toMaterialSlot(assignedMat),
          shading: 'flat',
          modifiers: [],
        };
      });

      nextProject = {
        ...updateActiveScene(nextProject, (scene) => ({
          ...scene,
          collections: scene.collections.map((c) =>
            c.id === destCollectionId || c.id === baseColId
              ? { ...c, expanded: true }
              : c,
          ),
          objects: [...scene.objects, ...newObjects],
        })),
        materials: nextMaterials,
      };

      markTimelapseOp('import_obj', `Importar OBJ (${result.baseName})`);
      setProject(nextProject);
      setOperatorSession(null);
      setSingleSelectedObject(newObjects[0].id);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);

      const summary =
        newObjects.length > 1
          ? `OBJ "${result.baseName}" importado (${newObjects.length} grupos)`
          : `OBJ "${newObjects[0].name}" importado`;
      showToast(summary);
    },
    [
      activeScene.activeCollectionId,
      activeScene.collections,
      activeScene.id,
      makeSnapshot,
      markTimelapseOp,
      project,
      projectMaterials,
      pushHistory,
      releaseScreenModifiers,
      setSingleSelectedObject,
      showToast,
    ],
  );

  const importStlResult = useCallback(
    (result: StlImportResult, targetCollectionId?: string) => {
      pushHistory(makeSnapshot());

      const resolvedCollectionId =
        targetCollectionId &&
        activeScene.collections.some((c) => c.id === targetCollectionId)
          ? targetCollectionId
          : activeScene.activeCollectionId;

      const existingCount = activeObjects.filter((o) =>
        o.name.startsWith(result.name),
      ).length;
      const finalName =
        existingCount === 0
          ? result.name
          : `${result.name} ${existingCount + 1}`;

      const defaultMat = projectMaterials[0];
      const newObj: SceneObjectData = {
        id: generateId('obj'),
        name: finalName,
        objectType: 'mesh',
        primitiveType: 'custom',
        collectionId: resolvedCollectionId,
        visible: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        mesh: result.mesh.toJSON(),
        materialId: defaultMat.id,
        material: toMaterialSlot(defaultMat),
        shading: 'flat',
        modifiers: [],
      };

      markTimelapseOp('import_stl', `Importar STL (${finalName})`);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          collections: scene.collections.map((c) =>
            c.id === resolvedCollectionId ? { ...c, expanded: true } : c,
          ),
          objects: [...scene.objects, newObj],
        })),
      );
      setOperatorSession(null);
      setSingleSelectedObject(newObj.id);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(
        `STL "${finalName}" importado (${result.triangleCount.toLocaleString()} triángulos)`,
      );
    },
    [
      activeObjects,
      activeScene.activeCollectionId,
      activeScene.collections,
      makeSnapshot,
      markTimelapseOp,
      projectMaterials,
      pushHistory,
      releaseScreenModifiers,
      setSingleSelectedObject,
      showToast,
    ],
  );

  const importModelAsNewProject = useCallback(
    async (
      modelProject: ProjectData,
    ): Promise<{ ok: boolean; project?: ProjectData; error?: string }> => {
      const normalized = syncProjectMaterialsAndObjects(modelProject);
      const res = await saveProjectAsync(normalized, {
        thumbnailDataUrl: normalized.thumbnailDataUrl ?? null,
        createBackup: false,
      });
      if (!res.ok || !res.project) {
        return {
          ok: false,
          error:
            res.error ?? 'No se pudo guardar el proyecto del modelo importado.',
        };
      }
      await refreshGalleryData();
      showToast(`Modelo "${res.project.name}" importado como proyecto`);
      return { ok: true, project: res.project };
    },
    [refreshGalleryData, showToast],
  );

  /* ==========================================================================
   * Material Library & Object Shading Actions
   * ======================================================================== */
  const createMaterial = useCallback(
    (
      initial?: Partial<Omit<MaterialAsset, 'id'>>,
      assignToSelected = true,
    ): MaterialAsset => {
      pushHistory(makeSnapshot());
      const existingNames = new Set(projectMaterials.map((m) => m.name));
      let baseName = initial?.name?.trim() || 'Material';
      if (existingNames.has(baseName)) {
        let idx = projectMaterials.length + 1;
        while (existingNames.has(`Material ${idx}`)) idx++;
        baseName = `Material ${idx}`;
      }
      const created = createMaterialAsset({
        ...initial,
        name: baseName,
      });

      const targetIds = assignToSelected
        ? Array.from(
            selectedObjectIds.size > 0
              ? selectedObjectIds
              : selectedObjectId
                ? [selectedObjectId]
                : [],
          )
        : [];

      setProject((p) => {
        const nextMaterials = [...(p.materials ?? projectMaterials), created];
        const nextProject: ProjectData = {
          ...p,
          materials: nextMaterials,
          scenes: p.scenes.map((scene) => ({
            ...scene,
            objects: scene.objects.map((o) =>
              o.objectType === 'mesh' && targetIds.includes(o.id)
                ? {
                    ...o,
                    materialId: created.id,
                    material: toMaterialSlot(created),
                  }
                : o,
            ),
          })),
        };
        return nextProject;
      });
      setHasUnsavedChanges(true);
      showToast(`Material "${created.name}" creado`);
      return created;
    },
    [
      makeSnapshot,
      projectMaterials,
      pushHistory,
      selectedObjectId,
      selectedObjectIds,
      showToast,
    ],
  );

  const renameMaterial = useCallback(
    (materialId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const target = projectMaterials.find((m) => m.id === materialId);
      if (!target || target.name === trimmed) return;
      pushHistory(makeSnapshot());
      skipNextTimelapseEffectRef.current = true;
      setProject((p) => ({
        ...p,
        materials: (p.materials ?? projectMaterials).map((m) =>
          m.id === materialId ? { ...m, name: trimmed } : m,
        ),
      }));
      setHasUnsavedChanges(true);
      showToast(`Material renombrado a "${trimmed}"`);
    },
    [makeSnapshot, projectMaterials, pushHistory, showToast],
  );

  const pushMaterialHistorySnapshot = useCallback(() => {
    pushHistory(makeSnapshot());
  }, [makeSnapshot, pushHistory]);

  const updateMaterial = useCallback(
    (
      materialId: string,
      patch: Partial<Omit<MaterialAsset, 'id'>>,
      recordHistory = true,
    ) => {
      if (recordHistory) {
        pushHistory(makeSnapshot());
      }
      markTimelapseOp('update_material', 'Editar material', recordHistory ? 0 : 240);
      setProject((p) => {
        const currentMats = p.materials ?? projectMaterials;
        const nextMats = currentMats.map((m) => {
          if (m.id !== materialId) return m;
          const candidate = createMaterialAsset(
            { ...m, ...patch, id: m.id },
            m.name,
          );
          const candidateGraph =
            candidate.nodeGraph ?? createDefaultMaterialNodeGraph(candidate);
          const nodeGraph = patch.nodeGraph
            ? candidateGraph
            : syncMaterialFieldsToNodeGraph(
                candidateGraph,
                candidate,
                Object.keys(patch),
              );
          const graphMaterial = createMaterialAsset(
            { ...candidate, nodeGraph },
            candidate.name,
          );
          const evaluation = evaluateMaterialNodeGraph(
            nodeGraph,
            graphMaterial,
          );
          const storedNodeGraph = evaluation.ok
            ? normalizeMaterialGraphBaseTextureReference(
                nodeGraph,
                evaluation.surface.baseColorTextureUrl,
              )
            : nodeGraph;
          return evaluation.ok
            ? createMaterialAsset(
                {
                  ...graphMaterial,
                  ...evaluation.surface,
                  emissiveColor: evaluation.surface.emissionColor,
                  emissiveIntensity: evaluation.surface.emissionIntensity,
                  textureDataUrl:
                    evaluation.surface.baseColorTextureUrl ?? '',
                  textureName: evaluation.surface.textureName ?? '',
                  nodeGraph: storedNodeGraph,
                },
                graphMaterial.name,
              )
            : graphMaterial;
        });
        const updatedMat = nextMats.find((m) => m.id === materialId);
        if (!updatedMat) return p;
        const slot = toMaterialSlot(updatedMat);
        return {
          ...p,
          materials: nextMats,
          scenes: p.scenes.map((scene) => ({
            ...scene,
            objects: scene.objects.map((o) =>
              o.objectType === 'mesh' && o.materialId === materialId
                ? { ...o, material: slot }
                : o,
            ),
          })),
        };
      });
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, markTimelapseOp, projectMaterials, pushHistory],
  );

  const duplicateMaterial = useCallback(
    (materialId: string, assignToSelected = true): MaterialAsset | null => {
      const source = projectMaterials.find((m) => m.id === materialId);
      if (!source) return null;
      pushHistory(makeSnapshot());

      const existingNames = new Set(projectMaterials.map((m) => m.name));
      let copyName = `${source.name} Copia`;
      if (existingNames.has(copyName)) {
        let idx = 2;
        while (existingNames.has(`${source.name} Copia ${idx}`)) idx++;
        copyName = `${source.name} Copia ${idx}`;
      }

      const copy = createMaterialAsset({
        ...source,
        id: undefined,
        name: copyName,
      });

      const targetIds = assignToSelected
        ? Array.from(
            selectedObjectIds.size > 0
              ? selectedObjectIds
              : selectedObjectId
                ? [selectedObjectId]
                : [],
          )
        : [];

      setProject((p) => ({
        ...p,
        materials: [...(p.materials ?? projectMaterials), copy],
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.objectType === 'mesh' && targetIds.includes(o.id)
              ? {
                  ...o,
                  materialId: copy.id,
                  material: toMaterialSlot(copy),
                }
              : o,
          ),
        })),
      }));
      setHasUnsavedChanges(true);
      showToast(`Material "${copy.name}" duplicado`);
      return copy;
    },
    [
      makeSnapshot,
      projectMaterials,
      pushHistory,
      selectedObjectId,
      selectedObjectIds,
      showToast,
    ],
  );

  const deleteMaterial = useCallback(
    (materialId: string): { ok: boolean; error?: string } => {
      if (projectMaterials.length <= 1) {
        const error = 'Debe permanecer al menos un material en el proyecto.';
        showToast(error);
        return { ok: false, error };
      }
      if (!projectMaterials.some((m) => m.id === materialId)) {
        return { ok: false, error: 'Material no encontrado.' };
      }
      pushHistory(makeSnapshot());

      const remaining = projectMaterials.filter((m) => m.id !== materialId);
      const fallback = remaining[0];
      const fallbackSlot = toMaterialSlot(fallback);

      setProject((p) => ({
        ...p,
        materials: remaining,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) => {
            if (o.objectType !== 'mesh') return o;
            const hasFaceRef = o.mesh?.faces?.some(
              (f) => f.materialId === materialId,
            );
            const nextMesh = hasFaceRef
              ? {
                  ...o.mesh,
                  faces: o.mesh.faces.map((f) => {
                    if (f.materialId !== materialId) return f;
                    const { materialId: _removed, ...rest } = f;
                    return rest;
                  }),
                }
              : o.mesh;
            if (o.materialId === materialId) {
              return {
                ...o,
                mesh: nextMesh,
                materialId: fallback.id,
                material: fallbackSlot,
              };
            }
            return hasFaceRef ? { ...o, mesh: nextMesh } : o;
          }),
        })),
      }));
      setMeshRevision((r) => r + 1);
      setHasUnsavedChanges(true);
      showToast(`Material eliminado (objetos reasignados a "${fallback.name}")`);
      return { ok: true };
    },
    [makeSnapshot, projectMaterials, pushHistory, showToast],
  );

  const getMaterialUsageSummary = useCallback(
    (materialId: string) =>
      countMaterialUsageAcrossScenes(project.scenes, materialId),
    [project.scenes],
  );

  const assignMaterialToObjects = useCallback(
    (objectIds: string[], materialId: string) => {
      const mat = projectMaterials.find((m) => m.id === materialId);
      if (!mat || objectIds.length === 0) return;
      const targetSet = new Set(objectIds);
      pushHistory(makeSnapshot());
      const slot = toMaterialSlot(mat);

      markTimelapseOp('assign_material', `Asignar material ${mat.name}`);
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.objectType === 'mesh' && targetSet.has(o.id)
              ? { ...o, materialId: mat.id, material: slot }
              : o,
          ),
        })),
      }));
      setMeshRevision((r) => r + 1);
      setHasUnsavedChanges(true);
      showToast(
        objectIds.length > 1
          ? `Material "${mat.name}" asignado a ${objectIds.length} objetos`
          : `Material "${mat.name}" asignado`,
      );
    },
    [makeSnapshot, markTimelapseOp, projectMaterials, pushHistory, showToast],
  );

  const assignMaterialToFaces = useCallback(
    (objectId: string, faceIds: Set<string>, materialId: string) => {
      const mat = projectMaterials.find((m) => m.id === materialId);
      if (!mat) return;
      if (faceIds.size === 0) {
        showToast('Selecciona al menos una cara para asignar el material');
        return;
      }
      const targetObj = activeObjects.find((o) => o.id === objectId);
      if (!targetObj || targetObj.objectType !== 'mesh') return;

      const editable = EditableMesh.fromJSON(targetObj.mesh);
      let updatedCount = 0;
      for (const fid of faceIds) {
        const face = editable.getFace(fid);
        if (face) {
          if (mat.id === targetObj.materialId) {
            delete face.materialId;
          } else {
            face.materialId = mat.id;
          }
          updatedCount++;
        }
      }
      if (updatedCount === 0) {
        showToast('Las caras seleccionadas no pertenecen al objeto activo');
        return;
      }

      pushHistory(makeSnapshot());
      markTimelapseOp(
        'assign_face_material',
        `Asignar material "${mat.name}" a ${updatedCount} cara(s)`,
      );
      const nextSerialized = editable.toJSON();
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, mesh: nextSerialized } : o,
          ),
        })),
      }));
      setMeshRevision((r) => r + 1);
      setHasUnsavedChanges(true);
      showToast(
        `Material "${mat.name}" asignado a ${updatedCount} cara${updatedCount === 1 ? '' : 's'}`,
      );
    },
    [activeObjects, makeSnapshot, markTimelapseOp, projectMaterials, pushHistory, showToast],
  );

  const unassignMaterialFromFaces = useCallback(
    (objectId: string, faceIds: Set<string>) => {
      if (faceIds.size === 0) {
        showToast('Selecciona al menos una cara para desasignar su material');
        return;
      }
      const targetObj = activeObjects.find((o) => o.id === objectId);
      if (!targetObj || targetObj.objectType !== 'mesh') return;

      const editable = EditableMesh.fromJSON(targetObj.mesh);
      let changedCount = 0;
      for (const fid of faceIds) {
        const face = editable.getFace(fid);
        if (face && face.materialId) {
          delete face.materialId;
          changedCount++;
        }
      }
      if (changedCount === 0) {
        showToast('Las caras seleccionadas ya usan el material principal del objeto');
        return;
      }

      pushHistory(makeSnapshot());
      markTimelapseOp(
        'unassign_face_material',
        `Restaurar material principal en ${changedCount} cara(s)`,
      );
      const nextSerialized = editable.toJSON();
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, mesh: nextSerialized } : o,
          ),
        })),
      }));
      setMeshRevision((r) => r + 1);
      setHasUnsavedChanges(true);
      showToast(
        `${changedCount} cara${changedCount === 1 ? '' : 's'} restaurada${changedCount === 1 ? '' : 's'} al material principal`,
      );
    },
    [activeObjects, makeSnapshot, markTimelapseOp, pushHistory, showToast],
  );

  const selectFacesByMaterial = useCallback(
    (objectId: string, materialId: string) => {
      const targetObj = activeObjects.find((o) => o.id === objectId);
      if (!targetObj || targetObj.objectType !== 'mesh') return;
      if (targetObj.locked) {
        showToast('El objeto está bloqueado');
        return;
      }
      const primaryId = targetObj.materialId ?? projectMaterials[0]?.id;
      const matchingFaceIds = new Set<string>();
      for (const face of targetObj.mesh.faces) {
        const effMat = face.materialId || primaryId;
        if (effMat === materialId) {
          matchingFaceIds.add(face.id);
        }
      }

      setSingleSelectedObject(targetObj.id);
      setOperatorSession(null);
      setWorkMode('edit');
      setEditSelectionMode('face');
      setSelectedComponentIds(matchingFaceIds);
      savedEditSelectionsRef.current.set(targetObj.id, {
        mode: 'face',
        ids: Array.from(matchingFaceIds),
      });

      const matName =
        projectMaterials.find((m) => m.id === materialId)?.name ?? 'Material';
      showToast(
        matchingFaceIds.size > 0
          ? `${matchingFaceIds.size} cara(s) seleccionadas con "${matName}"`
          : `Ninguna cara usa "${matName}" en este objeto`,
      );
    },
    [activeObjects, projectMaterials, setSingleSelectedObject, showToast],
  );

  const setObjectShading = useCallback(
    (objectId: string, shading: ObjectShadingMode) => {
      const target = project.scenes
        .flatMap((s) => s.objects)
        .find((o) => o.id === objectId);
      if (!target || target.objectType !== 'mesh') return;
      if ((target.shading ?? 'flat') === shading) return;
      pushHistory(makeSnapshot());
      markTimelapseOp(
        'set_shading',
        shading === 'smooth'
          ? `Suavizado Smooth (${target.name})`
          : `Sombreado Flat (${target.name})`,
      );
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, shading } : o,
          ),
        })),
      }));
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(
        shading === 'smooth'
          ? `"${target.name}": Shade Smooth activado`
          : `"${target.name}": Shade Flat activado`,
      );
    },
    [makeSnapshot, markTimelapseOp, project.scenes, pushHistory, showToast],
  );

  /* ==========================================================================
   * Lights & Sculpting Actions
   * ======================================================================== */
  const addLightObject = useCallback(
    (lightType: LightType = 'point', targetCollectionId?: string) => {
      pushHistory(makeSnapshot());
      const resolvedCollectionId =
        targetCollectionId &&
        activeScene.collections.some((c) => c.id === targetCollectionId)
          ? targetCollectionId
          : activeScene.activeCollectionId;

      const baseName = 'Luz de punto';
      const existingCount = activeObjects.filter((o) =>
        o.name.startsWith(baseName),
      ).length;
      const name = existingCount === 0 ? baseName : `${baseName} ${existingCount + 1}`;
      const lightObj = createLightObject({
        name,
        lightType,
        collectionId: resolvedCollectionId,
      });

      markTimelapseOp('add_light', `Agregar ${name}`);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          collections: scene.collections.map((c) =>
            c.id === resolvedCollectionId ? { ...c, expanded: true } : c,
          ),
          objects: [...scene.objects, lightObj],
        })),
      );
      setOperatorSession(null);
      setSingleSelectedObject(lightObj.id);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(`${name} agregada`);
    },
    [
      activeObjects,
      activeScene.activeCollectionId,
      activeScene.collections,
      makeSnapshot,
      markTimelapseOp,
      pushHistory,
      releaseScreenModifiers,
      setSingleSelectedObject,
      showToast,
    ],
  );

  const updateLightProps = useCallback(
    (
      objectId: string,
      patch: Partial<LightData>,
      recordHistory = true,
    ) => {
      if (recordHistory) {
        pushHistory(makeSnapshot());
      }
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) => {
            if (o.id !== objectId || o.objectType !== 'light') return o;
            const nextLight = normalizeLightData({
              ...(o.light ?? {}),
              ...patch,
            });
            return {
              ...o,
              light: nextLight,
              material: {
                ...o.material,
                color: nextLight.color,
              },
            };
          }),
        })),
      }));
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, pushHistory],
  );

  const setSculptBrush = useCallback((brush: SculptBrushType) => {
    setSculptSettings((prev) =>
      prev.brush === brush ? prev : { ...prev, brush },
    );
  }, []);

  const updateSculptSettings = useCallback(
    (patch: Partial<SculptSettings>) => {
      setSculptSettings((prev) => ({
        ...prev,
        ...patch,
        radius:
          typeof patch.radius === 'number'
            ? Math.max(0.05, Math.min(5, patch.radius))
            : prev.radius,
        strength:
          typeof patch.strength === 'number'
            ? Math.max(0.02, Math.min(1, patch.strength))
            : prev.strength,
        strokeSmoothing:
          typeof patch.strokeSmoothing === 'number'
            ? Math.max(0, Math.min(0.95, patch.strokeSmoothing))
            : prev.strokeSmoothing,
        symmetry: patch.symmetry
          ? { ...prev.symmetry, ...patch.symmetry }
          : prev.symmetry,
      }));
    },
    [],
  );

  const commitSculptStroke = useCallback(
    (objectId: string, nextMesh: EditableMesh) => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target || target.objectType !== 'mesh') return;
      pushHistory(makeSnapshot());
      markTimelapseOp('sculpt_stroke', `Esculpido (${target.name})`);
      const serialized = nextMesh.toJSON();
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, mesh: serialized } : o,
          ),
        })),
      }));
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
    },
    [activeObjects, makeSnapshot, markTimelapseOp, pushHistory],
  );

  const addReferenceImage = useCallback(
    (
      payload: LoadedImageReferencePayload,
      orientation: ReferenceImageOrientation = 'front',
      targetCollectionId?: string,
    ) => {
      pushHistory(makeSnapshot());
      const resolvedCollectionId =
        targetCollectionId &&
        activeScene.collections.some((c) => c.id === targetCollectionId)
          ? targetCollectionId
          : activeScene.activeCollectionId;

      const baseName = payload.name || 'Referencia';
      const existingCount = activeObjects.filter((o) =>
        o.name.startsWith(baseName),
      ).length;
      const finalName =
        existingCount === 0 ? baseName : `${baseName} ${existingCount + 1}`;

      const refObj = createReferenceImageObject({
        name: finalName,
        collectionId: resolvedCollectionId,
        imageDataUrl: payload.imageDataUrl,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        naturalWidth: payload.naturalWidth,
        naturalHeight: payload.naturalHeight,
        orientation,
      });

      markTimelapseOp('add_reference_image', `Añadir referencia (${finalName})`);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          collections: scene.collections.map((c) =>
            c.id === resolvedCollectionId ? { ...c, expanded: true } : c,
          ),
          objects: [...scene.objects, refObj],
        })),
      );
      setOperatorSession(null);
      setSingleSelectedObject(refObj.id);
      setWorkMode('object');
      releaseScreenModifiers();
      setSelectedComponentIds(new Set());
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(`Referencia "${finalName}" añadida`);
    },
    [
      activeObjects,
      activeScene.activeCollectionId,
      activeScene.collections,
      makeSnapshot,
      pushHistory,
      releaseScreenModifiers,
      setSingleSelectedObject,
      showToast,
    ],
  );

  const updateReferenceImageProps = useCallback(
    (
      objectId: string,
      patch: Partial<
        Pick<ReferenceImageData, 'opacity' | 'orientation' | 'depthMode'>
      >,
      recordHistory = true,
    ) => {
      if (recordHistory) {
        pushHistory(makeSnapshot());
      }
      setProject((p) => ({
        ...p,
        scenes: p.scenes.map((scene) => ({
          ...scene,
          objects: scene.objects.map((o) => {
            if (
              o.id !== objectId ||
              o.objectType !== 'reference_image' ||
              !o.referenceImage
            ) {
              return o;
            }
            const nextRef: ReferenceImageData = {
              ...o.referenceImage,
              ...patch,
            };
            let nextTransform = o.transform;
            if (patch.orientation && patch.orientation !== 'free') {
              nextTransform = {
                ...o.transform,
                rotation: [...REFERENCE_ORIENTATION_ROTATIONS[patch.orientation]],
              };
            }
            return {
              ...o,
              transform: nextTransform,
              referenceImage: nextRef,
            };
          }),
        })),
      }));
      setHasUnsavedChanges(true);
    },
    [makeSnapshot, pushHistory],
  );

  const selectAllEditComponents = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') return;
    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    setSelectedComponentIds(selectAllComponents(mesh, editSelectionMode));
  }, [editSelectionMode, selectedObject, workMode]);

  const deselectAllEditComponents = useCallback(() => {
    setSelectedComponentIds(new Set());
  }, []);

  const selectConnectedEditComponents = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') return;
    if (selectedComponentIds.size === 0) {
      showToast('Selecciona al menos un elemento para seleccionar conectados');
      return;
    }
    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    const connected = selectConnectedComponents(
      mesh,
      editSelectionMode,
      selectedComponentIds,
    );
    setSelectedComponentIds(connected);
  }, [editSelectionMode, selectedComponentIds, selectedObject, showToast, workMode]);

  const selectAllSceneObjects = useCallback(() => {
    if (workMode !== 'object') return;
    const visibleIds = activeObjects.filter((o) => o.visible).map((o) => o.id);
    if (visibleIds.length === 0) return;
    setSelectedObjectIds(new Set(visibleIds));
    setSelectedObjectId((curr) =>
      curr && visibleIds.includes(curr) ? curr : visibleIds[0],
    );
  }, [activeObjects, workMode]);

  const deselectAllSceneObjects = useCallback(() => {
    if (workMode !== 'object') return;
    setSelectedObjectId(null);
    setSelectedObjectIds(new Set());
  }, [workMode]);

  const deleteSelectedEditComponents = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') return;
    if (selectedComponentIds.size === 0) {
      showToast('No hay componentes seleccionados');
      return;
    }
    pushHistory(makeSnapshot());
    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    deleteSelectedComponents(mesh, editSelectionMode, selectedComponentIds);
    mesh.clearCustomNormals();
    const updatedMeshJson = mesh.toJSON();
    markTimelapseOp('delete_components', 'Eliminar componentes de malla');
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === selectedObject.id ? { ...o, mesh: updatedMeshJson } : o,
        ),
      })),
    );
    setSelectedComponentIds(new Set());
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
  }, [
    editSelectionMode,
    makeSnapshot,
    markTimelapseOp,
    pushHistory,
    selectedComponentIds,
    selectedObject,
    showToast,
    workMode,
  ]);

  const toggleScreenShift = useCallback(() => {
    toggleScreenModifier('shift');
  }, [toggleScreenModifier]);

  const selectComponentFromViewport = useCallback(
    (id: string | null, additive: boolean, addOnly = false, ctrl = false) => {
      if (operatorSession) return;
      const effectiveAdditive = additive || screenShiftActive;
      if (ctrl && workMode === 'edit' && id === null) return;
      const activeLoopCycle = loopCycleRef.current;
      const isTapInActiveLoop =
        id !== null &&
        activeLoopCycle !== null &&
        activeLoopCycle.mode === editSelectionMode &&
        activeLoopCycle.activeIds.includes(id) &&
        activeLoopCycle.activeIds.length > 0 &&
        activeLoopCycle.activeIds.every((cid) => selectedComponentIds.has(cid));

      if (
        workMode === 'edit' &&
        (editSelectionMode === 'vertex' || editSelectionMode === 'face') &&
        (editSelectionMode === 'vertex'
          ? ctrl || vertexSelectionTool === 'loop' || isTapInActiveLoop
          : ctrl || faceSelectionTool === 'loop' || isTapInActiveLoop) &&
        id !== null &&
        !addOnly &&
        selectedObject
      ) {
        const mesh = EditableMesh.fromJSON(selectedObject.mesh);
        const dirRes =
          editSelectionMode === 'vertex'
            ? findVertexLoopDirections(mesh, id)
            : findFaceLoopDirections(mesh, id);

        if (dirRes.loops.length === 0) {
          return;
        }

        const prevCycle = activeLoopCycle;
        const isRetapOnSameSeed =
          prevCycle !== null &&
          prevCycle.mode === editSelectionMode &&
          prevCycle.seedId === id &&
          prevCycle.activeIds.length > 0 &&
          prevCycle.activeIds.every((cid) => selectedComponentIds.has(cid));

        const isTapInsideActiveLoop =
          !isRetapOnSameSeed &&
          prevCycle !== null &&
          prevCycle.mode === editSelectionMode &&
          prevCycle.activeIds.includes(id) &&
          prevCycle.activeIds.every((cid) => selectedComponentIds.has(cid)) &&
          selectedComponentIds.has(id);

        if (isRetapOnSameSeed && prevCycle) {
          const nextDirIdx =
            dirRes.loops.length > 1
              ? (prevCycle.dirIdx + 1) % dirRes.loops.length
              : 0;
          const chosen = dirRes.loops[nextDirIdx];
          const nextSet = new Set<string>(prevCycle.baseIds);
          for (const cid of chosen.ids) nextSet.add(cid);
          loopCycleRef.current = {
            mode: editSelectionMode,
            seedId: id,
            dirIdx: nextDirIdx,
            activeIds: chosen.ids,
            baseIds: prevCycle.baseIds,
          };
          selectionAnchorRef.current = id;
          setSelectedComponentIds(nextSet);
          return;
        }

        if (isTapInsideActiveLoop && prevCycle) {
          // Re-tapped a vertex/face on the currently selected loop: anchor at `id` and switch axis!
          const activeSet = new Set(prevCycle.activeIds);
          const matchingIdx = dirRes.loops.findIndex(
            (cand) =>
              cand.ids.length === activeSet.size &&
              cand.ids.every((cid) => activeSet.has(cid)),
          );
          const nextDirIdx =
            dirRes.loops.length > 1
              ? matchingIdx >= 0
                ? (matchingIdx + 1) % dirRes.loops.length
                : 1 % dirRes.loops.length
              : 0;
          const chosen = dirRes.loops[nextDirIdx];
          const nextSet = new Set<string>(prevCycle.baseIds);
          for (const cid of chosen.ids) nextSet.add(cid);
          loopCycleRef.current = {
            mode: editSelectionMode,
            seedId: id,
            dirIdx: nextDirIdx,
            activeIds: chosen.ids,
            baseIds: prevCycle.baseIds,
          };
          selectionAnchorRef.current = id;
          setSelectedComponentIds(nextSet);
          return;
        }

        const chosen = dirRes.loops[0];
        const baseIds = effectiveAdditive
          ? Array.from(selectedComponentIds)
          : [];
        const nextSet = new Set<string>(baseIds);
        for (const cid of chosen.ids) nextSet.add(cid);
        loopCycleRef.current = {
          mode: editSelectionMode,
          seedId: id,
          dirIdx: 0,
          activeIds: chosen.ids,
          baseIds,
        };
        selectionAnchorRef.current = id;
        setSelectedComponentIds(nextSet);
        if (!dirRes.valid && dirRes.reason) {
          showToast(dirRes.reason);
        }
        return;
      }

      const previousEdgeCycle = loopCycleRef.current;
      const isRetapOnCtrlEdgeLoop =
        id !== null &&
        previousEdgeCycle !== null &&
        previousEdgeCycle.mode === 'edge' &&
        previousEdgeCycle.seedId === id &&
        previousEdgeCycle.activeIds.length > 0 &&
        previousEdgeCycle.activeIds.every((eid) =>
          selectedComponentIds.has(eid),
        );
      if (
        workMode === 'edit' &&
        editSelectionMode === 'edge' &&
        (ctrl || isRetapOnCtrlEdgeLoop) &&
        id !== null &&
        !addOnly &&
        selectedObject
      ) {
        const mesh = EditableMesh.fromJSON(selectedObject.mesh);
        const candidates = (['loop', 'ring'] as const)
          .map((kind) => ({
            kind,
            result: resolveEdgeLoopSelection(mesh, id, kind),
          }))
          .filter(({ result }) => result.valid && result.edgeIds.length > 1);
        if (candidates.length === 0) {
          const loopResult = resolveEdgeLoopSelection(mesh, id, 'loop');
          const ringResult = resolveEdgeLoopSelection(mesh, id, 'ring');
          showToast(
            loopResult.reason ??
              ringResult.reason ??
              'Esta arista no pertenece a un bucle válido.',
          );
          return;
        }

        const dirIdx =
          isRetapOnCtrlEdgeLoop && candidates.length > 1
            ? (previousEdgeCycle.dirIdx + 1) % candidates.length
            : 0;
        const chosen = candidates[dirIdx];
        const baseIds = isRetapOnCtrlEdgeLoop
          ? previousEdgeCycle.baseIds
          : effectiveAdditive
            ? Array.from(selectedComponentIds)
            : [];
        const nextSet = new Set<string>(baseIds);
        for (const edgeId of chosen.result.edgeIds) nextSet.add(edgeId);
        loopCycleRef.current = {
          mode: 'edge',
          seedId: id,
          dirIdx,
          activeIds: chosen.result.edgeIds,
          baseIds,
        };
        selectionAnchorRef.current = id;
        setSelectedComponentIds(nextSet);
        return;
      }

      if (
        workMode === 'edit' &&
        editSelectionMode === 'edge' &&
        edgeSelectionTool !== 'single' &&
        id !== null &&
        !addOnly &&
        selectedObject
      ) {
        const mesh = EditableMesh.fromJSON(selectedObject.mesh);
        const loopRes = resolveEdgeLoopSelection(mesh, id, edgeSelectionTool);
        if (!loopRes.valid || loopRes.edgeIds.length < 2) {
          showToast(
            loopRes.reason ??
              'Esta arista no pertenece a un bucle válido.',
          );
          return;
        }
        loopCycleRef.current = null;
        setSelectedComponentIds((prev) => {
          const allAlreadySelected = loopRes.edgeIds.every((eid) =>
            prev.has(eid),
          );
          if (effectiveAdditive) {
            const next = new Set(prev);
            if (allAlreadySelected) {
              for (const eid of loopRes.edgeIds) next.delete(eid);
            } else {
              for (const eid of loopRes.edgeIds) next.add(eid);
            }
            if (next.has(id)) selectionAnchorRef.current = id;
            return next;
          }
          if (allAlreadySelected && prev.size === loopRes.edgeIds.length) {
            selectionAnchorRef.current = null;
            return new Set();
          }
          selectionAnchorRef.current = id;
          return new Set(loopRes.edgeIds);
        });
        return;
      }

      loopCycleRef.current = null;
      setSelectedComponentIds((prev) => {
        const next = applyComponentSelection(
          prev,
          id,
          effectiveAdditive,
          addOnly,
        );
        if (id !== null && next.has(id)) {
          selectionAnchorRef.current = id;
        } else if (next.size === 0) {
          selectionAnchorRef.current = null;
        }
        return next;
      });
    },
    [
      edgeSelectionTool,
      editSelectionMode,
      faceSelectionTool,
      operatorSession,
      screenShiftActive,
      selectedComponentIds,
      selectedObject,
      showToast,
      vertexSelectionTool,
      workMode,
    ],
  );

  const selectEdgeTopology = useCallback(
    (kind: 'loop' | 'ring', targetEdgeId?: string) => {
      if (!selectedObject || workMode !== 'edit') return;
      if (operatorSession) return;
      const mesh = EditableMesh.fromJSON(selectedObject.mesh);
      let seedEdgeId = targetEdgeId ?? null;
      if (!seedEdgeId || !mesh.getEdge(seedEdgeId)) {
        if (editSelectionMode === 'edge') {
          for (const id of selectedComponentIds) {
            if (mesh.getEdge(id)) {
              seedEdgeId = id;
              break;
            }
          }
        } else {
          const derived = computeDerivedEditSelection(
            mesh,
            editSelectionMode,
            selectedComponentIds,
          );
          seedEdgeId = derived.edgeIds.values().next().value ?? null;
        }
      }
      if (!seedEdgeId) {
        showToast('Selecciona o toca una arista primero.');
        return;
      }
      const res = resolveEdgeLoopSelection(mesh, seedEdgeId, kind);
      if (!res.valid || res.edgeIds.length < 2) {
        showToast(
          res.reason ??
            (kind === 'ring'
              ? 'La arista no pertenece a un Edge Ring cuadrangular válido.'
              : 'La arista no pertenece a un Edge Loop válido.'),
        );
        return;
      }
      if (editSelectionMode !== 'edge') {
        setEditSelectionMode('edge');
      }
      setSelectedComponentIds((prev) => {
        const base =
          editSelectionMode === 'edge' && screenShiftActive
            ? new Set(prev)
            : new Set<string>();
        for (const eid of res.edgeIds) base.add(eid);
        return base;
      });
      showToast(
        `${kind === 'ring' ? 'Anillo' : 'Bucle'}${res.isClosed ? ' cerrado' : ' abierto'}: ${res.edgeIds.length} aristas`,
      );
    },
    [
      editSelectionMode,
      operatorSession,
      screenShiftActive,
      selectedComponentIds,
      selectedObject,
      showToast,
      workMode,
    ],
  );

  const selectComponentsFromBox = useCallback(
    (ids: string[], additive: boolean) => {
      if (operatorSession) return;
      const effectiveAdditive = additive || screenShiftActive;
      setSelectedComponentIds((prev) => {
        const next = new Set<string>(effectiveAdditive ? prev : []);
        for (const id of ids) next.add(id);
        return next;
      });
    },
    [operatorSession, screenShiftActive],
  );

  const lastNonXrayModeRef = useRef<'solid' | 'wireframe' | 'material'>(
    settings.displayMode === 'wireframe' || settings.displayMode === 'material'
      ? settings.displayMode
      : 'solid',
  );

  const updateSettings = useCallback((patch: Partial<ModelerSettings>) => {
    setSettings((prev) => {
      const nextDisplayMode: ViewportDisplayMode =
        patch.displayMode
          ? patch.displayMode
          : patch.xrayEditMode !== undefined
            ? patch.xrayEditMode
              ? 'xray'
              : lastNonXrayModeRef.current
            : prev.displayMode;
      if (
        nextDisplayMode === 'solid' ||
        nextDisplayMode === 'wireframe' ||
        nextDisplayMode === 'material'
      ) {
        lastNonXrayModeRef.current = nextDisplayMode;
      }
      const nextXrayTransparency =
        patch.xrayTransparency !== undefined
          ? Math.max(10, Math.min(90, Math.round(patch.xrayTransparency)))
          : prev.xrayTransparency;

      const next: ModelerSettings = {
        ...prev,
        ...patch,
        displayMode: nextDisplayMode,
        xrayEditMode: nextDisplayMode === 'xray',
        xrayTransparency: nextXrayTransparency,
        touch: patch.touch ? { ...prev.touch, ...patch.touch } : prev.touch,
      };
      saveSettingsLocally(next);
      return next;
    });
  }, []);

  const setDisplayMode = useCallback(
    (mode: ViewportDisplayMode) => {
      updateSettings({
        displayMode: mode,
        xrayEditMode: mode === 'xray',
      });
    },
    [updateSettings],
  );

  const setXrayTransparency = useCallback(
    (value: number) => {
      const clamped = Math.max(10, Math.min(90, Math.round(value)));
      updateSettings({ xrayTransparency: clamped });
    },
    [updateSettings],
  );

  const toggleXrayDisplayMode = useCallback(() => {
    setSettings((prev) => {
      const nextMode: ViewportDisplayMode =
        prev.displayMode === 'xray' ? lastNonXrayModeRef.current : 'xray';
      if (
        prev.displayMode === 'solid' ||
        prev.displayMode === 'wireframe' ||
        prev.displayMode === 'material'
      ) {
        lastNonXrayModeRef.current = prev.displayMode;
      }
      const next: ModelerSettings = {
        ...prev,
        displayMode: nextMode,
        xrayEditMode: nextMode === 'xray',
      };
      saveSettingsLocally(next);
      return next;
    });
  }, []);

  const toggleFaceOrientation = useCallback(() => {
    setSettings((prev) => {
      const nextValue = !prev.showFaceOrientation;
      const next: ModelerSettings = {
        ...prev,
        showFaceOrientation: nextValue,
      };
      saveSettingsLocally(next);
      showToast(
        nextValue
          ? 'Face Orientation activado (Azul: exterior · Rojo: invertida)'
          : 'Face Orientation desactivado',
      );
      return next;
    });
  }, [showToast]);

  const updateProportionalSettings = useCallback(
    (patch: Partial<ProportionalEditingSettings>) => {
      setSettings((prev) => {
        const nextProp = normalizeProportionalSettings({
          ...prev.proportionalEditing,
          ...patch,
        });
        const next: ModelerSettings = {
          ...prev,
          proportionalEditing: nextProp,
        };
        saveSettingsLocally(next);
        return next;
      });
    },
    [],
  );

  const toggleProportionalEditing = useCallback(() => {
    setSettings((prev) => {
      const nextEnabled = !prev.proportionalEditing.enabled;
      const next: ModelerSettings = {
        ...prev,
        proportionalEditing: {
          ...prev.proportionalEditing,
          enabled: nextEnabled,
        },
      };
      saveSettingsLocally(next);
      showToast(
        nextEnabled
          ? `Edición proporcional activada (Radio: ${next.proportionalEditing.radius.toFixed(2)})`
          : 'Edición proporcional desactivada',
      );
      return next;
    });
  }, [showToast]);

  const toggleProportionalConnected = useCallback(() => {
    setSettings((prev) => {
      const nextConnected = !prev.proportionalEditing.connectedOnly;
      const next: ModelerSettings = {
        ...prev,
        proportionalEditing: {
          ...prev.proportionalEditing,
          connectedOnly: nextConnected,
        },
      };
      saveSettingsLocally(next);
      showToast(
        nextConnected
          ? 'Proporcional: Solo vértices conectados activado'
          : 'Proporcional: Todos los vértices dentro del radio',
      );
      return next;
    });
  }, [showToast]);

  const setProportionalFalloff = useCallback(
    (falloff: ProportionalFalloff) => {
      updateProportionalSettings({ falloff });
      const meta = PROPORTIONAL_FALLOFF_LIST.find((f) => f.id === falloff);
      if (meta) {
        showToast(`Caída proporcional: ${meta.label}`);
      }
    },
    [showToast, updateProportionalSettings],
  );

  const cycleProportionalFalloff = useCallback(() => {
    setSettings((prev) => {
      const idx = PROPORTIONAL_FALLOFF_ORDER.indexOf(
        prev.proportionalEditing.falloff,
      );
      const nextFalloff =
        PROPORTIONAL_FALLOFF_ORDER[(idx + 1) % PROPORTIONAL_FALLOFF_ORDER.length];
      const next: ModelerSettings = {
        ...prev,
        proportionalEditing: {
          ...prev.proportionalEditing,
          falloff: nextFalloff,
        },
      };
      saveSettingsLocally(next);
      const meta = PROPORTIONAL_FALLOFF_LIST.find((f) => f.id === nextFalloff);
      if (meta) {
        showToast(`Caída proporcional: ${meta.label}`);
      }
      return next;
    });
  }, [showToast]);

  const setProportionalRadius = useCallback(
    (radius: number) => {
      updateProportionalSettings({
        radius: clampProportionalRadius(radius),
      });
    },
    [updateProportionalSettings],
  );

  const updateTouchSettings = useCallback(
    (patch: Partial<TouchControlSettings>) => {
      if (
        patch.modifierPanelEnabled === false ||
        patch.modifierPanelMode !== undefined
      ) {
        releaseScreenModifiers();
      }
      setSettings((prev) => {
        const next: ModelerSettings = {
          ...prev,
          touch: { ...prev.touch, ...patch },
        };
        saveSettingsLocally(next);
        return next;
      });
    },
    [releaseScreenModifiers],
  );

  const updateTouchModifier = useCallback(
    (key: TouchModifierKey, patch: Partial<TouchModifierSlotConfig>) => {
      if (patch.enabled === false || patch.showScreenButton === false) {
        setScreenModifier(key, false);
      }
      setSettings((prev) => {
        const next: ModelerSettings = {
          ...prev,
          touch: {
            ...prev.touch,
            modifiers: {
              ...prev.touch.modifiers,
              [key]: {
                ...prev.touch.modifiers[key],
                ...patch,
              },
            },
          },
        };
        saveSettingsLocally(next);
        return next;
      });
    },
    [setScreenModifier],
  );

  const updateRadialScopeSlot = useCallback(
    (
      scope: RadialLayoutScope,
      slotIndex: number,
      actionId: RadialActionId | null,
    ) => {
      if (slotIndex < 0 || slotIndex >= RADIAL_SLOT_COUNT) return;
      setSettings((prev) => {
        if (scope === 'barhome') {
          const nextSlots = [...prev.touch.barhomeRadialLayout];
          nextSlots[slotIndex] = actionId;
          const next: ModelerSettings = {
            ...prev,
            touch: {
              ...prev.touch,
              barhomeRadialLayout: nextSlots,
            },
          };
          saveSettingsLocally(next);
          return next;
        }
        if (scope === 'uv_editing' || scope === 'materials') {
          const nextSlots = [...prev.touch.workspaceToolRadialLayouts[scope]];
          nextSlots[slotIndex] = actionId;
          const next: ModelerSettings = {
            ...prev,
            touch: {
              ...prev.touch,
              workspaceToolRadialLayouts: {
                ...prev.touch.workspaceToolRadialLayouts,
                [scope]: nextSlots,
              },
            },
          };
          saveSettingsLocally(next);
          return next;
        }
        const currentSlots = [...prev.touch.radialLayouts[scope]];
        currentSlots[slotIndex] = actionId;
        const next: ModelerSettings = {
          ...prev,
          touch: {
            ...prev.touch,
            radialLayouts: {
              ...prev.touch.radialLayouts,
              [scope]: currentSlots,
            },
          },
        };
        saveSettingsLocally(next);
        return next;
      });
    },
    [],
  );

  const resetRadialScopeSlot = useCallback(
    (scope: RadialLayoutScope, slotIndex: number) => {
      if (slotIndex < 0 || slotIndex >= RADIAL_SLOT_COUNT) return;
      const fallback = getDefaultSlotsForScope(scope)[slotIndex] ?? null;
      updateRadialScopeSlot(scope, slotIndex, fallback);
      showToast('Botón restaurado al valor predeterminado');
    },
    [showToast, updateRadialScopeSlot],
  );

  const resetRadialScopeLayout = useCallback(
    (scope: RadialLayoutScope) => {
      setSettings((prev) => {
        if (scope === 'barhome') {
          const next: ModelerSettings = {
            ...prev,
            touch: {
              ...prev.touch,
              barhomeRadialLayout: [...DEFAULT_BARHOME_RADIAL_LAYOUT],
            },
          };
          saveSettingsLocally(next);
          return next;
        }
        if (scope === 'uv_editing' || scope === 'materials') {
          const defaults = cloneDefaultWorkspaceToolLayouts();
          const next: ModelerSettings = {
            ...prev,
            touch: {
              ...prev.touch,
              workspaceToolRadialLayouts: {
                ...prev.touch.workspaceToolRadialLayouts,
                [scope]: defaults[scope],
              },
            },
          };
          saveSettingsLocally(next);
          return next;
        }
        const defaults = cloneDefaultRadialLayouts();
        const next: ModelerSettings = {
          ...prev,
          touch: {
            ...prev.touch,
            radialLayouts: {
              ...prev.touch.radialLayouts,
              [scope]: defaults[scope],
            },
          },
        };
        saveSettingsLocally(next);
        return next;
      });
      showToast('Distribución radial restaurada');
    },
    [showToast],
  );

  const updateRadialSlot = useCallback(
    (
      mode: RadialWorkMode,
      slotIndex: number,
      actionId: RadialActionId | null,
    ) => {
      updateRadialScopeSlot(mode, slotIndex, actionId);
    },
    [updateRadialScopeSlot],
  );

  const resetRadialSlot = useCallback(
    (mode: RadialWorkMode, slotIndex: number) => {
      resetRadialScopeSlot(mode, slotIndex);
    },
    [resetRadialScopeSlot],
  );

  const resetRadialLayout = useCallback(
    (mode: RadialWorkMode) => {
      resetRadialScopeLayout(mode);
    },
    [resetRadialScopeLayout],
  );

  const resetTouchSettings = useCallback(() => {
    setSettings((prev) => {
      const next: ModelerSettings = {
        ...prev,
        touch: createDefaultTouchSettings(),
      };
      saveSettingsLocally(next);
      return next;
    });
    showToast('Controles táctiles y menú radial restaurados');
  }, [showToast]);

  const updateToolConfig = useCallback(
    <K extends ConfigurableToolKey>(
      toolKey: K,
      patch: Partial<ToolConfigurations[K]>,
    ) => {
      setSettings((prev) => {
        const next: ModelerSettings = {
          ...prev,
          toolConfigs: {
            ...prev.toolConfigs,
            [toolKey]: {
              ...prev.toolConfigs[toolKey],
              ...patch,
            },
          },
        };
        saveSettingsLocally(next);
        return next;
      });
    },
    [],
  );

  const resetToolConfig = useCallback(
    (target: ToolResetTarget) => {
      const defaults = createDefaultToolConfigs();
      setSettings((prev) => {
        let next: ModelerSettings = prev;
        if (target === 'rotate') {
          next = {
            ...prev,
            snapRotateDeg: DEFAULT_MODELER_SETTINGS.snapRotateDeg,
          };
        } else if (target === 'scale') {
          next = {
            ...prev,
            snapScaleStep: DEFAULT_MODELER_SETTINGS.snapScaleStep,
          };
        } else if (target === 'proportional') {
          next = {
            ...prev,
            proportionalEditing: { ...DEFAULT_PROP_SETTINGS },
          };
        } else if (target === 'move') {
          next = {
            ...prev,
            snapTranslateStep: DEFAULT_MODELER_SETTINGS.snapTranslateStep,
            toolConfigs: {
              ...prev.toolConfigs,
              move: { ...defaults.move },
            },
          };
        } else {
          next = {
            ...prev,
            toolConfigs: {
              ...prev.toolConfigs,
              [target]: { ...defaults[target] },
            },
          };
        }
        saveSettingsLocally(next);
        return next;
      });
      showToast('Configuración de herramienta restaurada');
    },
    [showToast],
  );

  const resetAllToolConfigs = useCallback(() => {
    const defaults = createDefaultToolConfigs();
    setSettings((prev) => {
      const next: ModelerSettings = {
        ...prev,
        snapEnabled: DEFAULT_MODELER_SETTINGS.snapEnabled,
        snapTranslateStep: DEFAULT_MODELER_SETTINGS.snapTranslateStep,
        snapRotateDeg: DEFAULT_MODELER_SETTINGS.snapRotateDeg,
        snapScaleStep: DEFAULT_MODELER_SETTINGS.snapScaleStep,
        gizmoSize: DEFAULT_MODELER_SETTINGS.gizmoSize,
        proportionalEditing: { ...DEFAULT_PROP_SETTINGS },
        toolConfigs: defaults,
      };
      saveSettingsLocally(next);
      return next;
    });
    showToast('Todas las herramientas restauradas a valores predeterminados');
  }, [showToast]);

  const updateSelectedVerticesPosition = useCallback(
    (axis: 0 | 1 | 2, targetValue: number) => {
      if (
        operatorSession ||
        !selectedObject ||
        workMode !== 'edit' ||
        selectedComponentIds.size === 0
      ) {
        return;
      }
      const mesh = EditableMesh.fromJSON(selectedObject.mesh);
      const vertIds = mesh.getVertexIdsFromSelection(
        editSelectionMode,
        selectedComponentIds,
      );
      const centroid = mesh.computeCentroid(vertIds);
      if (!centroid) return;
      const delta = targetValue - centroid[axis];
      if (Math.abs(delta) < 1e-6) return;

      pushHistory(makeSnapshot());
      const startPositions = new Map<string, Vec3>();
      for (const v of mesh.vertices) {
        startPositions.set(v.id, [...v.position]);
      }

      let affectedIds: Iterable<string> = vertIds;
      if (settings.proportionalEditing.enabled) {
        const field = buildProportionalDistanceField(
          mesh,
          editSelectionMode,
          selectedComponentIds,
          {
            connectedOnly: settings.proportionalEditing.connectedOnly,
            objectScale: selectedObject.transform.scale,
          },
        );
        const weights = computeProportionalWeights(
          field,
          settings.proportionalEditing.radius,
          settings.proportionalEditing.falloff,
        );
        const deltaVec: Vec3 = [0, 0, 0];
        deltaVec[axis] = delta;
        applyProportionalMove(mesh, weights, deltaVec);
        affectedIds = weights.keys();
      } else {
        for (const vid of vertIds) {
          const v = mesh.getVertex(vid);
          if (v) {
            v.position[axis] += delta;
          }
        }
      }

      if (selectedObject.modifiers && selectedObject.modifiers.length > 0) {
        const ownerRef: ModifierTransformRef = {
          id: selectedObject.id,
          position: selectedObject.transform.position,
          rotation: selectedObject.transform.rotation,
          scale: selectedObject.transform.scale,
        };
        clampVerticesForMirrorClipping(
          mesh,
          affectedIds,
          startPositions,
          selectedObject.modifiers,
          ownerRef,
          sceneTransformRefs,
        );
      }
      mesh.clearCustomNormals();
      const updated = mesh.toJSON();
      markTimelapseOp('edit_vertices', 'Mover selección en edición', 200);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === selectedObject.id ? { ...o, mesh: updated } : o,
          ),
        })),
      );
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
    },
    [
      editSelectionMode,
      makeSnapshot,
      operatorSession,
      pushHistory,
      sceneTransformRefs,
      selectedComponentIds,
      selectedObject,
      settings.proportionalEditing.connectedOnly,
      settings.proportionalEditing.enabled,
      settings.proportionalEditing.falloff,
      settings.proportionalEditing.radius,
      workMode,
    ],
  );

  /* ==========================================================================
   * Non-Destructive Modifiers (Mirror & Subdivision Surface)
   * ======================================================================== */
  const addModifier = useCallback(
    (objectId: string, type: ModifierType) => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target) return;
      if (!isEditableMeshObject(target)) {
        showToast('Solo los objetos de malla admiten modificadores');
        return;
      }
      if (target.locked) {
        showToast('Desbloquea el objeto antes de añadir modificadores');
        return;
      }

      pushHistory(makeSnapshot());
      const defaultParams =
        type === 'mirror'
          ? createDefaultMirrorParams()
          : type === 'subdivision'
            ? createDefaultSubdivisionParams()
            : type === 'solidify'
              ? createDefaultSolidifyParams()
              : createDefaultBevelParams();

      const newSlot: ModifierSlot = {
        id: generateId('mod'),
        type,
        enabled: true,
        showInViewport: true,
        expanded: true,
        params: defaultParams,
      };

      markTimelapseOp('add_modifier', `Añadir modificador ${MODIFIER_LABELS[type]}`);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId
              ? { ...o, modifiers: [...(o.modifiers ?? []), newSlot] }
              : o,
          ),
        })),
      );
      setHasUnsavedChanges(true);
      showToast(`Modificador ${MODIFIER_LABELS[type]} añadido`);
    },
    [activeObjects, makeSnapshot, markTimelapseOp, pushHistory, showToast],
  );

  const updateModifier = useCallback(
    (
      objectId: string,
      modifierId: string,
      patch: Partial<ModifierSlot>,
      recordHistory = true,
    ) => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target) return;
      if (target.locked) {
        showToast('El objeto está bloqueado');
        return;
      }
      if (recordHistory) {
        pushHistory(makeSnapshot());
      }
      markTimelapseOp('update_modifier', 'Ajustar modificador', recordHistory ? 0 : 220);
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) => {
            if (o.id !== objectId) return o;
            const nextMods = (o.modifiers ?? []).map((m) => {
              if (m.id !== modifierId) return m;
              const mergedRaw = patch.params
                ? {
                    ...(m.params as Record<string, unknown>),
                    ...(patch.params as Record<string, unknown>),
                  }
                : null;
              const nextParams = mergedRaw
                ? m.type === 'mirror'
                  ? normalizeMirrorParams(mergedRaw)
                  : m.type === 'subdivision'
                    ? normalizeSubdivisionParams(mergedRaw)
                    : m.type === 'solidify'
                      ? normalizeSolidifyParams(mergedRaw)
                      : m.type === 'bevel'
                        ? normalizeBevelParams(mergedRaw)
                        : mergedRaw
                : m.params;
              return {
                ...m,
                ...patch,
                params: nextParams,
              };
            });
            return { ...o, modifiers: nextMods };
          }),
        })),
      );
      setHasUnsavedChanges(true);
    },
    [activeObjects, makeSnapshot, pushHistory, showToast],
  );

  const reorderModifier = useCallback(
    (objectId: string, modifierId: string, direction: 'up' | 'down') => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target || target.locked) return;
      const list = [...(target.modifiers ?? [])];
      const idx = list.findIndex((m) => m.id === modifierId);
      if (idx < 0) return;
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= list.length) return;

      pushHistory(makeSnapshot());
      const [item] = list.splice(idx, 1);
      list.splice(nextIdx, 0, item);

      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, modifiers: list } : o,
          ),
        })),
      );
      setHasUnsavedChanges(true);
    },
    [activeObjects, makeSnapshot, pushHistory],
  );

  const removeModifier = useCallback(
    (objectId: string, modifierId: string) => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target) return;
      if (target.locked) {
        showToast('El objeto está bloqueado');
        return;
      }
      pushHistory(makeSnapshot());
      markTimelapseOp('remove_modifier', 'Eliminar modificador');
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId
              ? {
                  ...o,
                  modifiers: (o.modifiers ?? []).filter((m) => m.id !== modifierId),
                }
              : o,
          ),
        })),
      );
      setHasUnsavedChanges(true);
      showToast('Modificador eliminado sin alterar la malla base');
    },
    [activeObjects, makeSnapshot, markTimelapseOp, pushHistory, showToast],
  );

  const applyModifier = useCallback(
    (objectId: string, modifierId: string) => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target) return;
      if (target.locked) {
        showToast('Desbloquea el objeto antes de aplicar modificadores');
        return;
      }
      setOperatorSession(null);

      const ownerRef: ModifierTransformRef = {
        id: target.id,
        position: target.transform.position,
        rotation: target.transform.rotation,
        scale: target.transform.scale,
      };
      const res = applySingleModifierToMesh(
        target.mesh,
        target.modifiers ?? [],
        modifierId,
        ownerRef,
        sceneTransformRefs,
      );
      if (!res.success || !res.mesh) {
        showToast(res.error ?? 'No se pudo aplicar el modificador');
        return;
      }

      pushHistory(makeSnapshot());
      markTimelapseOp('apply_modifier', 'Aplicar modificador a geometría');
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId
              ? {
                  ...o,
                  mesh: res.mesh!,
                  modifiers: res.remainingModifiers ?? [],
                }
              : o,
          ),
        })),
      );
      savedEditSelectionsRef.current.delete(objectId);
      if (workMode === 'edit' && selectedObjectId === objectId) {
        setSelectedComponentIds(new Set());
      }
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast('Modificador aplicado a la geometría');
    },
    [
      activeObjects,
      makeSnapshot,
      markTimelapseOp,
      pushHistory,
      sceneTransformRefs,
      selectedObjectId,
      showToast,
      workMode,
    ],
  );

  /* ==========================================================================
   * Advanced Edit Mode Operators (v0.2)
   * ======================================================================== */
  const startEditOperator = useCallback(
    (type: EditOperatorType) => {
      if (!selectedObject || workMode !== 'edit') return;
      if (selectedObject.locked) {
        showToast('El objeto está bloqueado');
        return;
      }
      setModalTransform(null);
      setModalCancelNonce((n) => n + 1);
      releaseScreenModifiers();

      const mesh = EditableMesh.fromJSON(selectedObject.mesh);
      const baseIds = Array.from(selectedComponentIds);

      if (type === 'loop_cut') {
        setLoopCutPickError(null);
        const anyValidEdge = findFirstValidLoopEdge(mesh);
        if (!anyValidEdge) {
          showToast(
            'Esta malla no contiene caras cuadrangulares compatibles para Loop Cut',
          );
          return;
        }

        let initialEdgeId: string | null = null;
        let initialError: string | null = null;

        if (editSelectionMode === 'edge' && selectedComponentIds.size > 0) {
          for (const eid of selectedComponentIds) {
            const analysis = analyzeEdgeLoopRing(mesh, eid);
            if (analysis.valid && analysis.ring && analysis.ring.quadSteps.length > 0) {
              initialEdgeId = eid;
              initialError = null;
              break;
            }
            if (!initialError && analysis.reason) {
              initialError = analysis.reason;
            }
          }
          if (!initialEdgeId && initialError) {
            setLoopCutPickError(initialError);
            showToast(initialError);
          }
        }

        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'loop_cut',
            params: {
              edgeId: initialEdgeId,
              cuts: settings.toolConfigs.loopCut.defaultCuts,
              slide: settings.toolConfigs.loopCut.defaultSlide,
            },
          },
        });
        return;
      }

      if (type === 'merge_by_distance') {
        if (mesh.vertices.length < 2) {
          showToast('La malla necesita al menos 2 vértices para fusionar por distancia');
          return;
        }
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'merge_by_distance',
            params: {
              distance: settings.toolConfigs.mergeByDistance.defaultDistance,
              scope: baseIds.length > 0 ? 'selection' : 'all',
            },
          },
        });
        return;
      }

      if (type === 'dissolve_limited') {
        if (mesh.faces.length === 0) {
          showToast('La malla necesita caras para aplicar Limited Dissolve');
          return;
        }
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'dissolve_limited',
            params: {
              maxAngleDeg: settings.toolConfigs.dissolveLimited.defaultMaxAngleDeg,
              dissolveVertices:
                settings.toolConfigs.dissolveLimited.defaultDissolveVertices,
              scope: baseIds.length > 0 ? 'selection' : 'all',
            },
          },
        });
        return;
      }

      if (type === 'bridge_loops') {
        const analysis = analyzeBridgeEdgeLoops(
          mesh,
          editSelectionMode,
          selectedComponentIds,
        );
        if (!analysis.valid) {
          showToast(
            analysis.error ??
              'Selecciona dos contornos abiertos compatibles para Bridge Edge Loops',
          );
          return;
        }
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'bridge_loops',
            params: {
              segments: 1,
              smoothness: 0,
              twistOffset: 0,
              reverseOrder: false,
            },
          },
        });
        return;
      }

      if (selectedComponentIds.size === 0) {
        showToast('Selecciona al menos un componente antes de aplicar la herramienta');
        return;
      }

      if (type === 'extrude') {
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'extrude',
            params: {
              distance: settings.toolConfigs.extrude.defaultDistance,
              axis: settings.toolConfigs.extrude.defaultAxis,
              individual: settings.toolConfigs.extrude.defaultIndividual,
            },
          },
        });
      } else if (type === 'inset') {
        const hasFullFace =
          editSelectionMode === 'face' ||
          (() => {
            const verts = mesh.getVertexIdsFromSelection(
              editSelectionMode,
              selectedComponentIds,
            );
            return mesh.faces.some((f) => f.vertexIds.every((v) => verts.has(v)));
          })();
        if (!hasFullFace) {
          showToast('Selecciona al menos una cara completa para insertar');
          return;
        }
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'inset',
            params: {
              thickness: settings.toolConfigs.inset.defaultThickness,
              depth: settings.toolConfigs.inset.defaultDepth,
              individual: settings.toolConfigs.inset.defaultIndividual,
            },
          },
        });
      } else if (type === 'subdivide') {
        if (editSelectionMode === 'vertex' && selectedComponentIds.size < 2) {
          showToast('Selecciona al menos 2 vértices conectados para subdividir');
          return;
        }
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'subdivide',
            params: {
              cuts: settings.toolConfigs.subdivide.defaultCuts,
              smoothness: settings.toolConfigs.subdivide.defaultSmoothness,
              fractal: settings.toolConfigs.subdivide.defaultFractal,
            },
          },
        });
      } else if (type === 'bevel') {
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'bevel',
            params: {
              width: settings.toolConfigs.bevel.defaultWidth,
              segments: settings.toolConfigs.bevel.defaultSegments,
              profile: settings.toolConfigs.bevel.defaultProfile,
              clampOverlap: settings.toolConfigs.bevel.defaultClampOverlap,
            },
          },
        });
      } else if (type === 'merge') {
        const vertIds = mesh.getVertexIdsFromSelection(
          editSelectionMode,
          selectedComponentIds,
        );
        if (vertIds.size < 2) {
          showToast('Selecciona al menos 2 vértices para fusionar');
          return;
        }
        setOperatorSession({
          objectId: selectedObject.id,
          baseMesh: selectedObject.mesh,
          baseSelectionMode: editSelectionMode,
          baseSelectedIds: baseIds,
          config: {
            type: 'merge',
            params: {
              mode: 'center',
              cursorPosition: [...cursor3D] as Vec3,
            },
          },
        });
      }
    },
    [
      cursor3D,
      editSelectionMode,
      releaseScreenModifiers,
      selectedComponentIds,
      selectedObject,
      settings.toolConfigs,
      showToast,
      workMode,
    ],
  );

  const updateOperatorConfig = useCallback((config: EditOperatorParams) => {
    if (config.type === 'merge' && config.params.cursorPosition) {
      setCursor3D([...config.params.cursorPosition] as Vec3);
    }
    setOperatorSession((prev) => (prev ? { ...prev, config } : null));
  }, []);

  const switchMergeOperator = useCallback(
    (target: 'merge' | 'merge_by_distance') => {
      setOperatorSession((prev) => {
        if (!prev) return prev;
        if (target === 'merge') {
          const baseMesh = EditableMesh.fromJSON(prev.baseMesh);
          const vertIds = baseMesh.getVertexIdsFromSelection(
            prev.baseSelectionMode,
            new Set(prev.baseSelectedIds),
          );
          if (vertIds.size < 2) {
            showToast('Selecciona al menos 2 vértices para fusionar por vértice');
            return prev;
          }
          return {
            ...prev,
            config: {
              type: 'merge',
              params: {
                mode: 'center',
                cursorPosition: [...cursor3D] as Vec3,
              },
            },
          };
        }
        return {
          ...prev,
          config: {
            type: 'merge_by_distance',
            params: {
              distance: settings.toolConfigs.mergeByDistance.defaultDistance,
              scope: prev.baseSelectedIds.length > 0 ? 'selection' : 'all',
            },
          },
        };
      });
    },
    [cursor3D, settings.toolConfigs.mergeByDistance.defaultDistance, showToast],
  );

  const pickLoopCutEdge = useCallback(
    (edgeId: string | null) => {
      if (!operatorSession || operatorSession.config.type !== 'loop_cut') return;
      if (!edgeId) return;
      const mesh = EditableMesh.fromJSON(operatorSession.baseMesh);
      const analysis = analyzeEdgeLoopRing(mesh, edgeId);
      if (!analysis.valid || !analysis.ring || analysis.ring.quadSteps.length === 0) {
        const msg =
          analysis.reason ??
          'Esta arista no pertenece a un bucle de caras cuadrangulares compatible.';
        setLoopCutPickError(msg);
        showToast(msg);
        return;
      }
      setLoopCutPickError(null);
      setOperatorSession((prev) =>
        prev && prev.config.type === 'loop_cut'
          ? {
              ...prev,
              config: {
                type: 'loop_cut',
                params: { ...prev.config.params, edgeId },
              },
            }
          : prev,
      );
      showToast(
        `${analysis.ring.isClosed ? 'Bucle cerrado' : 'Bucle abierto'} · ${analysis.ring.faceIds.length} cara${analysis.ring.faceIds.length === 1 ? '' : 's'}`,
      );
    },
    [operatorSession, showToast],
  );

  const operatorPreview = useMemo(() => {
    if (!operatorSession) {
      return {
        previewMesh: null as SerializedEditableMesh | null,
        previewSelectedIds: null as Set<string> | null,
        previewNextMode: null as EditSelectionMode | null,
        effectiveOperatorMode: null as EditSelectionMode | null,
        loopCutSegments: [] as [Vec3, Vec3][],
        loopCutRingEdgeIds: [] as string[],
        loopCutFaceIds: [] as string[],
        loopCutIsClosed: false,
        loopCutError: null as string | null,
        operatorError: null as string | null,
        operatorStatusMessage: null as string | null,
        mergedCount: 0,
      };
    }

    const baseMesh = EditableMesh.fromJSON(operatorSession.baseMesh);
    const baseSel = new Set(operatorSession.baseSelectedIds);
    const mode = operatorSession.baseSelectionMode;
    const cfg = operatorSession.config;

    if (cfg.type === 'loop_cut') {
      if (!cfg.params.edgeId) {
        return {
          previewMesh: null,
          previewSelectedIds: null,
          previewNextMode: null,
          effectiveOperatorMode: 'edge' as EditSelectionMode,
          loopCutSegments: [] as [Vec3, Vec3][],
          loopCutRingEdgeIds: [] as string[],
          loopCutFaceIds: [] as string[],
          loopCutIsClosed: false,
          loopCutError: loopCutPickError,
          operatorError: null,
          operatorStatusMessage: null,
          mergedCount: 0,
        };
      }
      const analysis = analyzeEdgeLoopRing(baseMesh, cfg.params.edgeId);
      if (!analysis.valid || !analysis.ring || analysis.ring.quadSteps.length === 0) {
        return {
          previewMesh: null,
          previewSelectedIds: null,
          previewNextMode: null,
          effectiveOperatorMode: 'edge' as EditSelectionMode,
          loopCutSegments: [] as [Vec3, Vec3][],
          loopCutRingEdgeIds: [] as string[],
          loopCutFaceIds: [] as string[],
          loopCutIsClosed: false,
          loopCutError:
            analysis.reason ??
            loopCutPickError ??
            'La topología actual no forma un bucle cuadrangular.',
          operatorError: null,
          operatorStatusMessage: null,
          mergedCount: 0,
        };
      }
      const segments = computeLoopCutPreviewSegments(
        baseMesh,
        analysis.ring,
        cfg.params.cuts,
        cfg.params.slide,
      );
      return {
        previewMesh: null,
        previewSelectedIds: null,
        previewNextMode: null,
        effectiveOperatorMode: 'edge' as EditSelectionMode,
        loopCutSegments: segments,
        loopCutRingEdgeIds: analysis.ring.edgeIds,
        loopCutFaceIds: analysis.ring.faceIds,
        loopCutIsClosed: analysis.ring.isClosed,
        loopCutError: loopCutPickError,
        operatorError: null,
        operatorStatusMessage: null,
        mergedCount: 0,
      };
    }

    if (cfg.type === 'merge_by_distance') {
      const mergeRes = mergeByDistanceMesh(baseMesh, mode, baseSel, cfg.params);
      return {
        previewMesh: mergeRes.mesh.toJSON(),
        previewSelectedIds: mergeRes.nextSelectedIds,
        previewNextMode: null,
        effectiveOperatorMode: null,
        loopCutSegments: [] as [Vec3, Vec3][],
        loopCutRingEdgeIds: [] as string[],
        loopCutFaceIds: [] as string[],
        loopCutIsClosed: false,
        loopCutError: null,
        operatorError: null,
        operatorStatusMessage: null,
        mergedCount: mergeRes.mergedCount,
      };
    }

    if (cfg.type === 'dissolve_limited') {
      const ldRes = limitedDissolveMesh(baseMesh, mode, baseSel, cfg.params);
      return {
        previewMesh: ldRes.error ? null : ldRes.result.mesh.toJSON(),
        previewSelectedIds: ldRes.error ? null : ldRes.result.nextSelectedIds,
        previewNextMode: null,
        effectiveOperatorMode: null,
        loopCutSegments: [] as [Vec3, Vec3][],
        loopCutRingEdgeIds: [] as string[],
        loopCutFaceIds: [] as string[],
        loopCutIsClosed: false,
        loopCutError: null,
        operatorError: ldRes.error ?? null,
        operatorStatusMessage: ldRes.message ?? null,
        mergedCount: ldRes.dissolvedEdges + ldRes.dissolvedVertices,
      };
    }

    if (cfg.type === 'bridge_loops') {
      const brRes = bridgeEdgeLoopsMesh(baseMesh, mode, baseSel, cfg.params);
      return {
        previewMesh: brRes.error ? null : brRes.result.mesh.toJSON(),
        previewSelectedIds: brRes.error ? null : brRes.result.nextSelectedIds,
        previewNextMode: brRes.nextMode ?? null,
        effectiveOperatorMode: brRes.nextMode ?? null,
        loopCutSegments: [] as [Vec3, Vec3][],
        loopCutRingEdgeIds: [] as string[],
        loopCutFaceIds: [] as string[],
        loopCutIsClosed: false,
        loopCutError: null,
        operatorError: brRes.error ?? null,
        operatorStatusMessage: brRes.message ?? null,
        mergedCount: brRes.createdFaces,
      };
    }

    if (cfg.type === 'merge') {
      const mRes = mergeVerticesMesh(baseMesh, mode, baseSel, cfg.params);
      return {
        previewMesh: mRes.mesh.toJSON(),
        previewSelectedIds: mRes.nextSelectedIds,
        previewNextMode: mRes.nextMode ?? null,
        effectiveOperatorMode: mRes.nextMode ?? null,
        loopCutSegments: [] as [Vec3, Vec3][],
        loopCutRingEdgeIds: [] as string[],
        loopCutFaceIds: [] as string[],
        loopCutIsClosed: false,
        loopCutError: null,
        operatorError: mRes.error ?? null,
        operatorStatusMessage: mRes.message ?? null,
        mergedCount: mRes.mergedCount ?? 0,
      };
    }

    let res;
    let effectiveOperatorMode: EditSelectionMode | null = null;
    if (cfg.type === 'extrude') {
      const resolvedExtrude = resolveExtrudeTarget(baseMesh, mode, baseSel);
      effectiveOperatorMode = resolvedExtrude.mode;
      if (Math.abs(cfg.params.distance) < 1e-8) {
        return {
          previewMesh: null,
          previewSelectedIds: null,
          previewNextMode: null,
          effectiveOperatorMode,
          loopCutSegments: [] as [Vec3, Vec3][],
          loopCutRingEdgeIds: [] as string[],
          loopCutFaceIds: [] as string[],
          loopCutIsClosed: false,
          loopCutError: null,
          operatorError: null,
          operatorStatusMessage: null,
          mergedCount: 0,
        };
      }
      res = extrudeMesh(
        baseMesh,
        resolvedExtrude.mode,
        resolvedExtrude.targetIds,
        cfg.params,
      );
      if (resolvedExtrude.mode !== mode) {
        const mapped = computeDerivedEditSelection(
          res.mesh,
          resolvedExtrude.mode,
          res.nextSelectedIds,
        );
        res = {
          mesh: res.mesh,
          nextSelectedIds:
            mode === 'vertex'
              ? new Set(mapped.vertexIds)
              : mode === 'edge'
                ? new Set(mapped.edgeIds)
                : new Set(mapped.faceIds),
        };
      }
    } else if (cfg.type === 'inset') {
      res = insetFacesMesh(baseMesh, mode, baseSel, cfg.params);
    } else if (cfg.type === 'subdivide') {
      res = subdivideMesh(baseMesh, mode, baseSel, cfg.params);
    } else {
      res = bevelMesh(baseMesh, mode, baseSel, cfg.params);
    }

    return {
      previewMesh: res.mesh.toJSON(),
      previewSelectedIds: res.nextSelectedIds,
      previewNextMode: null,
      effectiveOperatorMode,
      loopCutSegments: [] as [Vec3, Vec3][],
      loopCutRingEdgeIds: [] as string[],
      loopCutFaceIds: [] as string[],
      loopCutIsClosed: false,
      loopCutError: null,
      operatorError: null,
      operatorStatusMessage: null,
      mergedCount: 0,
    };
  }, [loopCutPickError, operatorSession]);

  const confirmEditOperator = useCallback(() => {
    if (!operatorSession) return;
    const baseMesh = EditableMesh.fromJSON(operatorSession.baseMesh);
    const cfg = operatorSession.config;

    let finalMesh: EditableMesh;
    let nextSelected: Set<string>;
    let nextMode: EditSelectionMode =
      operatorPreview.previewNextMode ?? operatorSession.baseSelectionMode;
    let loopCutFeedback: string | null = null;

    if (cfg.type === 'loop_cut') {
      if (!cfg.params.edgeId) {
        showToast('Toca una arista cuadrangular válida antes de confirmar');
        return;
      }
      const { result, error, stats } = loopCutMesh(baseMesh, cfg.params);
      if (error) {
        setLoopCutPickError(error);
        showToast(error);
        return;
      }
      finalMesh = result.mesh;
      nextSelected = result.nextSelectedIds;
      nextMode = 'edge';
      if (stats) {
        loopCutFeedback = `Loop Cut aplicado · ${stats.splitFaces} cara${stats.splitFaces === 1 ? '' : 's'} dividida${stats.splitFaces === 1 ? '' : 's'} (${cfg.params.cuts} corte${cfg.params.cuts === 1 ? '' : 's'})`;
      }
    } else if (operatorPreview.operatorError) {
      showToast(operatorPreview.operatorError);
      return;
    } else if (operatorPreview.previewMesh) {
      finalMesh = EditableMesh.fromJSON(operatorPreview.previewMesh);
      nextSelected = operatorPreview.previewSelectedIds ?? new Set();
    } else {
      setOperatorSession(null);
      setLoopCutPickError(null);
      return;
    }

    const snapshot = makeSnapshot();
    snapshot.scenes = snapshot.scenes.map((s) =>
      s.id === snapshot.activeSceneId
        ? {
            ...s,
            objects: s.objects.map((o) =>
              o.id === operatorSession.objectId
                ? { ...o, mesh: operatorSession.baseMesh }
                : o,
            ),
          }
        : s,
    );
    snapshot.editSelectionMode = operatorSession.baseSelectionMode;
    snapshot.selectedComponentIds = [...operatorSession.baseSelectedIds];
    pushHistory(snapshot);

    finalMesh.clearCustomNormals();
    const serialized = finalMesh.toJSON();
    const opLabelMap: Record<EditOperatorType, string> = {
      extrude: 'Extruir',
      inset: 'Insertar cara',
      bevel: 'Biselar',
      subdivide: 'Subdividir',
      loop_cut: 'Corte en bucle',
      merge: 'Fusionar vértices',
      merge_by_distance: 'Fusionar por distancia',
      dissolve_limited: 'Disolver geometría',
      bridge_loops: 'Puente entre bucles',
    };
    markTimelapseOp(
      `operator_${cfg.type}`,
      opLabelMap[cfg.type] ?? 'Operación de modelado',
    );
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === operatorSession.objectId ? { ...o, mesh: serialized } : o,
        ),
      })),
    );
    setEditSelectionMode(nextMode);
    setSelectedComponentIds(nextSelected);
    const mergedCountFeedback =
      cfg.type === 'merge_by_distance' ? operatorPreview.mergedCount : null;
    const statusFeedback = operatorPreview.operatorStatusMessage;
    setOperatorSession(null);
    setLoopCutPickError(null);
    releaseScreenModifiers();
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    if (loopCutFeedback) {
      showToast(loopCutFeedback);
    } else if (mergedCountFeedback !== null) {
      showToast(
        mergedCountFeedback === 0
          ? 'No hubo vértices dentro del umbral de distancia'
          : `${mergedCountFeedback} vértice${mergedCountFeedback === 1 ? '' : 's'} fusionado${mergedCountFeedback === 1 ? '' : 's'} por distancia`,
      );
    } else if (statusFeedback) {
      showToast(statusFeedback);
    }
  }, [
    makeSnapshot,
    operatorPreview,
    operatorSession,
    pushHistory,
    releaseScreenModifiers,
    showToast,
  ]);

  const cancelEditOperator = useCallback(() => {
    setOperatorSession(null);
    setLoopCutPickError(null);
    releaseScreenModifiers();
    setMeshRevision((r) => r + 1);
  }, [releaseScreenModifiers]);

  const executeContextualDelete = useCallback(
    (action: DeleteActionType) => {
      if (!selectedObject || workMode !== 'edit') return;
      if (selectedComponentIds.size === 0) {
        showToast('No hay componentes seleccionados');
        return;
      }
      setOperatorSession(null);
      const mesh = EditableMesh.fromJSON(selectedObject.mesh);
      const res = applyDeleteAction(
        mesh,
        editSelectionMode,
        selectedComponentIds,
        action,
      );
      if (res.error) {
        showToast(res.error);
        return;
      }
      pushHistory(makeSnapshot());
      res.mesh.clearCustomNormals();
      const updated = res.mesh.toJSON();
      markTimelapseOp(`delete_${action}`, 'Eliminar o disolver geometría');
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === selectedObject.id ? { ...o, mesh: updated } : o,
          ),
        })),
      );
      setSelectedComponentIds(res.nextSelectedIds);
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      if (res.message) {
        showToast(res.message);
      }
    },
    [
      editSelectionMode,
      makeSnapshot,
      pushHistory,
      selectedComponentIds,
      selectedObject,
      showToast,
      workMode,
    ],
  );

  const executeFillSelection = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') return;
    if (selectedObject.locked) {
      showToast('El objeto está bloqueado');
      return;
    }
    if (selectedComponentIds.size === 0) {
      showToast('Selecciona al menos 2 vértices o aristas para crear geometría');
      return;
    }
    setOperatorSession(null);
    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    const {
      result,
      nextMode,
      selectExisting,
      message,
      error,
    } = fillMesh(mesh, editSelectionMode, selectedComponentIds);
    if (error) {
      showToast(error);
      return;
    }
    if (selectExisting) {
      if (nextMode && nextMode !== editSelectionMode) {
        setEditSelectionMode(nextMode);
      }
      setSelectedComponentIds(result.nextSelectedIds);
      if (message) showToast(message);
      return;
    }
    pushHistory(makeSnapshot());
    result.mesh.clearCustomNormals();
    const updated = result.mesh.toJSON();
    markTimelapseOp('fill_selection', 'Rellenar geometría (F)');
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === selectedObject.id ? { ...o, mesh: updated } : o,
        ),
      })),
    );
    if (nextMode && nextMode !== editSelectionMode) {
      setEditSelectionMode(nextMode);
    }
    setSelectedComponentIds(result.nextSelectedIds);
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    showToast(message ?? 'Geometría creada');
  }, [
    editSelectionMode,
    makeSnapshot,
    pushHistory,
    selectedComponentIds,
    selectedObject,
    showToast,
    workMode,
  ]);

  const executeConnectVertexPath = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') return;
    if (selectedObject.locked) {
      showToast('El objeto está bloqueado');
      return;
    }
    if (editSelectionMode !== 'vertex') {
      showToast('Cambia al submodo Vértices para usar Connect Vertex Path (J)');
      return;
    }
    if (selectedComponentIds.size < 2) {
      showToast('Selecciona al menos 2 vértices para conectar');
      return;
    }
    setOperatorSession(null);
    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    const res = connectVertexPathMesh(
      mesh,
      editSelectionMode,
      selectedComponentIds,
    );
    if (!res.success) {
      showToast(
        res.error ??
          res.message ??
          'No existe un recorrido topológicamente válido entre los vértices seleccionados',
      );
      return;
    }
    pushHistory(makeSnapshot());
    res.result.mesh.clearCustomNormals();
    res.result.mesh.rebuildIndices();
    const updated = res.result.mesh.toJSON();
    markTimelapseOp('connect_vertex_path', 'Conectar vértices (J)');
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === selectedObject.id ? { ...o, mesh: updated } : o,
        ),
      })),
    );
    setSelectedComponentIds(res.result.nextSelectedIds);
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    showToast(res.message ?? 'Connect Vertex Path aplicado');
  }, [
    editSelectionMode,
    makeSnapshot,
    pushHistory,
    selectedComponentIds,
    selectedObject,
    showToast,
    workMode,
  ]);

  const executeQuickDissolve = useCallback(() => {
    const action: DeleteActionType =
      editSelectionMode === 'vertex'
        ? 'dissolve_vertices'
        : editSelectionMode === 'edge'
          ? 'dissolve_edges'
          : 'dissolve_faces';
    executeContextualDelete(action);
  }, [editSelectionMode, executeContextualDelete]);

  const executeRecalculateOutside = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') return;
    if (selectedObject.locked) {
      showToast('El objeto está bloqueado');
      return;
    }
    setOperatorSession(null);
    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    const res = recalculateOutsideMesh(
      mesh,
      editSelectionMode,
      selectedComponentIds,
    );
    if (!res.success) {
      showToast(res.error ?? res.message);
      return;
    }
    if (res.flippedCount > 0) {
      pushHistory(makeSnapshot());
      const updated = res.mesh.toJSON();
      markTimelapseOp('recalculate_normals', 'Recalcular normales');
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === selectedObject.id ? { ...o, mesh: updated } : o,
          ),
        })),
      );
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
    }
    showToast(res.message);
  }, [
    editSelectionMode,
    makeSnapshot,
    markTimelapseOp,
    pushHistory,
    selectedComponentIds,
    selectedObject,
    showToast,
    workMode,
  ]);

  const executeFlipNormals = useCallback(() => {
    if (!selectedObject || workMode !== 'edit') return;
    if (selectedObject.locked) {
      showToast('El objeto está bloqueado');
      return;
    }
    setOperatorSession(null);
    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    const res = flipNormalsMesh(
      mesh,
      editSelectionMode,
      selectedComponentIds,
    );
    if (!res.success) {
      showToast(res.error ?? res.message);
      return;
    }
    pushHistory(makeSnapshot());
    const updated = res.mesh.toJSON();
    markTimelapseOp('flip_normals', 'Invertir normales');
    setProject((p) =>
      updateActiveScene(p, (scene) => ({
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === selectedObject.id ? { ...o, mesh: updated } : o,
        ),
      })),
    );
    setHasUnsavedChanges(true);
    setMeshRevision((r) => r + 1);
    showToast(res.message);
  }, [
    editSelectionMode,
    makeSnapshot,
    pushHistory,
    selectedComponentIds,
    selectedObject,
    showToast,
    workMode,
  ]);

  const recalculateObjectNormalsOutside = useCallback(
    (objectId: string) => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target || !isEditableMeshObject(target)) return;
      if (target.locked) {
        showToast('El objeto está bloqueado');
        return;
      }
      setOperatorSession(null);
      const mesh = EditableMesh.fromJSON(target.mesh);
      const res = recalculateOutsideMesh(mesh, 'face', new Set());
      if (!res.success) {
        showToast(res.error ?? res.message);
        return;
      }
      if (res.flippedCount > 0) {
        pushHistory(makeSnapshot());
        const updated = res.mesh.toJSON();
        setProject((p) =>
          updateActiveScene(p, (scene) => ({
            ...scene,
            objects: scene.objects.map((o) =>
              o.id === objectId ? { ...o, mesh: updated } : o,
            ),
          })),
        );
        setHasUnsavedChanges(true);
        setMeshRevision((r) => r + 1);
      }
      showToast(res.message);
    },
    [activeObjects, makeSnapshot, pushHistory, showToast],
  );

  const flipObjectNormals = useCallback(
    (objectId: string) => {
      const target = activeObjects.find((o) => o.id === objectId);
      if (!target || !isEditableMeshObject(target)) return;
      if (target.locked) {
        showToast('El objeto está bloqueado');
        return;
      }
      setOperatorSession(null);
      const mesh = EditableMesh.fromJSON(target.mesh);
      const res = flipNormalsMesh(mesh, 'face', new Set());
      if (!res.success) {
        showToast(res.error ?? res.message);
        return;
      }
      pushHistory(makeSnapshot());
      const updated = res.mesh.toJSON();
      setProject((p) =>
        updateActiveScene(p, (scene) => ({
          ...scene,
          objects: scene.objects.map((o) =>
            o.id === objectId ? { ...o, mesh: updated } : o,
          ),
        })),
      );
      setHasUnsavedChanges(true);
      setMeshRevision((r) => r + 1);
      showToast(res.message);
    },
    [activeObjects, makeSnapshot, pushHistory, showToast],
  );

  // Rendered objects & selection include live operator preview when active
  const renderedObjects = useMemo(() => {
    if (!operatorSession || !operatorPreview.previewMesh) {
      return activeObjects;
    }
    return activeObjects.map((o) =>
      o.id === operatorSession.objectId
        ? { ...o, mesh: operatorPreview.previewMesh! }
        : o,
    );
  }, [activeObjects, operatorPreview.previewMesh, operatorSession]);

  const renderedScenes = useMemo(() => {
    if (!operatorSession || !operatorPreview.previewMesh) {
      return project.scenes;
    }
    return project.scenes.map((scene) =>
      scene.id === project.activeSceneId
        ? { ...scene, objects: renderedObjects }
        : scene,
    );
  }, [
    operatorPreview.previewMesh,
    operatorSession,
    project.activeSceneId,
    project.scenes,
    renderedObjects,
  ]);

  const renderedSelectedObject = useMemo(
    () => renderedObjects.find((o) => o.id === selectedObjectId) ?? null,
    [renderedObjects, selectedObjectId],
  );

  const renderedSelectedComponentIds = useMemo(
    () => operatorPreview.previewSelectedIds ?? selectedComponentIds,
    [operatorPreview.previewSelectedIds, selectedComponentIds],
  );

  const selectedModifierDiagnostics = useMemo(() => {
    const empty: {
      diagnostics: Record<string, ModifierDiagnostic>;
      evaluatedVertexCount: number;
      evaluatedEdgeCount: number;
      evaluatedFaceCount: number;
      hasActiveModifiers: boolean;
    } = {
      diagnostics: {},
      evaluatedVertexCount: renderedSelectedObject?.mesh.vertices.length ?? 0,
      evaluatedEdgeCount: renderedSelectedObject?.mesh.edges.length ?? 0,
      evaluatedFaceCount: renderedSelectedObject?.mesh.faces.length ?? 0,
      hasActiveModifiers: false,
    };
    if (
      !renderedSelectedObject ||
      !isEditableMeshObject(renderedSelectedObject) ||
      !renderedSelectedObject.modifiers ||
      renderedSelectedObject.modifiers.length === 0
    ) {
      return empty;
    }
    const ownerRef: ModifierTransformRef = {
      id: renderedSelectedObject.id,
      position: renderedSelectedObject.transform.position,
      rotation: renderedSelectedObject.transform.rotation,
      scale: renderedSelectedObject.transform.scale,
    };
    const evalRes = evaluateObjectModifiers(
      renderedSelectedObject.mesh,
      renderedSelectedObject.modifiers,
      {
        ownerTransform: ownerRef,
        sceneTransformRefs,
      },
    );
    return {
      diagnostics: evalRes.diagnostics,
      evaluatedVertexCount: evalRes.mesh.vertices.length,
      evaluatedEdgeCount: evalRes.mesh.edges.length,
      evaluatedFaceCount: evalRes.mesh.faces.length,
      hasActiveModifiers: evalRes.hasActiveModifiers,
    };
  }, [renderedSelectedObject, sceneTransformRefs]);

  const proportionalModifierWarning = useMemo(() => {
    if (
      workMode !== 'edit' ||
      !settings.proportionalEditing.enabled ||
      !renderedSelectedObject
    ) {
      return null;
    }
    return inspectProportionalModifierCompatibility(
      renderedSelectedObject.modifiers,
      renderedSelectedObject.mesh.vertices.length,
    );
  }, [
    renderedSelectedObject,
    settings.proportionalEditing.enabled,
    workMode,
  ]);

  const triggerGQuickTapMove = useCallback(() => {
    setOperatorSession(null);
    releaseScreenModifiers();
    setActiveToolState('move');
    saveLastGizmoMode('move');
    setMoveSubModeState(axisConstraint === 'free' ? 'free' : 'axis');

    if (!selectedObject) {
      setModalTransform(null);
      showToast('Selecciona un objeto para mover');
      return;
    }
    if (selectedObject.locked) {
      setModalTransform(null);
      showToast('El objeto está bloqueado');
      return;
    }
    if (workMode === 'edit' && selectedComponentIds.size === 0) {
      setModalTransform(null);
      showToast('Herramienta Mover activa (selecciona geometría para mover)');
      return;
    }

    setModalTransform({
      mode: 'move',
      clamp: true,
      commitOnRelease: true,
      source: 'g_button',
    });
  }, [
    axisConstraint,
    releaseScreenModifiers,
    selectedComponentIds.size,
    selectedObject,
    showToast,
    workMode,
  ]);

  const triggerGHoldSlide = useCallback(() => {
    setOperatorSession(null);
    releaseScreenModifiers();

    if (!selectedObject) {
      setActiveToolState('move');
      saveLastGizmoMode('move');
      setModalTransform(null);
      showToast('Selecciona un objeto o componente primero');
      return;
    }
    if (selectedObject.locked) {
      setModalTransform(null);
      showToast('El objeto está bloqueado');
      return;
    }

    // Object Mode or Face Mode falls back cleanly to Move (per design spec)
    if (workMode === 'object' || editSelectionMode === 'face') {
      setActiveToolState('move');
      saveLastGizmoMode('move');
      if (workMode === 'object' || selectedComponentIds.size > 0) {
        setModalTransform({
          mode: 'move',
          clamp: true,
          commitOnRelease: true,
          source: 'g_button',
        });
      } else {
        setModalTransform(null);
      }
      showToast(
        workMode === 'edit'
          ? 'Slide no aplica en caras: usando Mover'
          : 'Modo Objeto: usando Mover',
      );
      return;
    }

    const mesh = EditableMesh.fromJSON(selectedObject.mesh);
    if (editSelectionMode === 'vertex') {
      if (selectedComponentIds.size === 0) {
        setModalTransform(null);
        showToast('Selecciona al menos un vértice para Vertex Slide');
        return;
      }
      const plan = buildVertexSlidePlan(mesh, selectedComponentIds);
      if (!plan.valid) {
        setModalTransform(null);
        showToast(plan.reason ?? 'No hay aristas conectadas para Vertex Slide');
        return;
      }
      setModalTransform({
        mode: 'vertex_slide',
        clamp: true,
        commitOnRelease: true,
        source: 'g_button',
      });
      return;
    }

    // Edge selection mode -> Edge Slide
    if (selectedComponentIds.size === 0) {
      setModalTransform(null);
      showToast('Selecciona al menos una arista para Edge Slide');
      return;
    }
    const plan = buildEdgeSlidePlan(mesh, selectedComponentIds);
    if (!plan.valid) {
      setModalTransform(null);
      showToast(plan.reason ?? 'No hay caras vecinas válidas para Edge Slide');
      return;
    }
    setModalTransform({
      mode: 'edge_slide',
      clamp: true,
      commitOnRelease: true,
      source: 'g_button',
    });
  }, [
    editSelectionMode,
    releaseScreenModifiers,
    selectedComponentIds,
    selectedObject,
    showToast,
    workMode,
  ]);

  const setMoveSubMode = useCallback(
    (mode: MoveSubMode) => {
      if (mode === 'free') {
        setModalTransform((prev) => {
          if (prev?.source === 'move_tool') {
            setModalCancelNonce((n) => n + 1);
            return null;
          }
          return prev;
        });
        setAxisConstraintState('free');
        setMoveSubModeState('free');
        return;
      }

      if (mode === 'axis') {
        setModalTransform((prev) => {
          if (prev?.source === 'move_tool') {
            setModalCancelNonce((n) => n + 1);
            return null;
          }
          return prev;
        });
        setMoveSubModeState('axis');
        setAxisConstraintState((prev) => (prev === 'free' ? 'x' : prev));
        return;
      }

      // Slide mode inside Move tool
      setOperatorSession(null);
      releaseScreenModifiers();
      setActiveToolState('move');
      saveLastGizmoMode('move');

      if (!selectedObject) {
        showToast('Selecciona un objeto y vértices o aristas en Modo Edición');
        return;
      }
      if (selectedObject.locked) {
        showToast('El objeto está bloqueado');
        return;
      }
      if (workMode !== 'edit') {
        showToast('Slide solo está disponible en Modo Edición (vértices o aristas)');
        return;
      }
      if (editSelectionMode === 'face') {
        showToast('Slide aplica a vértices o aristas; cambia a Vértice o Arista');
        return;
      }
      if (selectedComponentIds.size === 0) {
        showToast(
          editSelectionMode === 'vertex'
            ? 'Selecciona al menos un vértice para Vertex Slide'
            : 'Selecciona al menos una arista para Edge Slide',
        );
        return;
      }

      const mesh = EditableMesh.fromJSON(selectedObject.mesh);
      if (editSelectionMode === 'vertex') {
        const plan = buildVertexSlidePlan(mesh, selectedComponentIds);
        if (!plan.valid) {
          showToast(plan.reason ?? 'No hay aristas conectadas para Vertex Slide');
          return;
        }
        setMoveSubModeState('slide');
        setModalTransform({
          mode: 'vertex_slide',
          clamp: true,
          commitOnRelease: false,
          source: 'move_tool',
        });
        return;
      }

      const plan = buildEdgeSlidePlan(mesh, selectedComponentIds);
      if (!plan.valid) {
        showToast(plan.reason ?? 'No hay caras vecinas válidas para Edge Slide');
        return;
      }
      setMoveSubModeState('slide');
      setModalTransform({
        mode: 'edge_slide',
        clamp: true,
        commitOnRelease: false,
        source: 'move_tool',
      });
    },
    [
      editSelectionMode,
      releaseScreenModifiers,
      selectedComponentIds,
      selectedObject,
      showToast,
      workMode,
    ],
  );

  // Reset uncommitted Move->Slide session if workMode / selection submode / object changes
  useEffect(() => {
    setModalTransform((prev) => {
      if (prev?.source === 'move_tool') {
        setModalCancelNonce((n) => n + 1);
        return null;
      }
      return prev;
    });
    setMoveSubModeState((curr) =>
      curr === 'slide' ? (axisConstraint === 'free' ? 'free' : 'axis') : curr,
    );
  }, [workMode, editSelectionMode, selectedObjectId, selectedComponentIds, axisConstraint]);

  const setModalTransformClamp = useCallback((clamp: boolean) => {
    setModalTransform((prev) => (prev ? { ...prev, clamp } : prev));
  }, []);

  const cancelModalTransform = useCallback(() => {
    setModalCancelNonce((n) => n + 1);
    setModalTransform(null);
    setMoveSubModeState(axisConstraint === 'free' ? 'free' : 'axis');
  }, [axisConstraint]);

  const completeModalTransform = useCallback(
    (committed: boolean) => {
      if (committed) {
        setModalTransform(null);
        setMoveSubModeState(axisConstraint === 'free' ? 'free' : 'axis');
      }
    },
    [axisConstraint],
  );

  return {
    project,
    scenes: renderedScenes,
    activeScene,
    activeSceneId: activeScene.id,
    activeCollectionId: activeScene.activeCollectionId,
    renderedObjects,
    savedProjects,
    folders,
    hasUnsavedChanges,
    saveStatus,
    lastSavedAt,
    lastSaveError,
    pendingRecovery,
    startupRecoveryList,
    isGalleryReady,
    selectedObject: renderedSelectedObject,
    selectedObjectId,
    selectedObjectIds,
    workMode,
    editSelectionMode,
    vertexSelectionTool,
    edgeSelectionTool,
    faceSelectionTool,
    sculptSettings,
    setSculptBrush,
    updateSculptSettings,
    commitSculptStroke,
    cursor3D,
    selectedComponentIds: renderedSelectedComponentIds,
    selectedModifierDiagnostics,
    proportionalModifierWarning,
    activeTool,
    axisConstraint,
    moveSubMode,
    projection,
    cameraRotationLocked,
    settings,
    meshRevision,
    toastMessage,
    screenShiftActive,
    screenModifiers,
    canUndo,
    canRedo,
    operatorSession,
    modalTransform,
    modalCancelNonce,
    operatorMergedCount: operatorPreview.mergedCount,
    operatorError: operatorPreview.operatorError,
    operatorStatusMessage: operatorPreview.operatorStatusMessage,
    operatorEffectiveMode: operatorPreview.effectiveOperatorMode,
    loopCutPreviewSegments: operatorPreview.loopCutSegments,
    loopCutRingEdgeIds: operatorPreview.loopCutRingEdgeIds,
    loopCutFaceIds: operatorPreview.loopCutFaceIds,
    loopCutIsClosed: operatorPreview.loopCutIsClosed,
    loopCutError: operatorPreview.loopCutError,
    setActiveTool,
    setMoveSubMode,
    triggerGQuickTapMove,
    triggerGHoldSlide,
    setModalTransformClamp,
    cancelModalTransform,
    completeModalTransform,
    setAxisConstraint,
    setProjection,
    setCameraRotationLocked,
    toggleCameraRotationLock,
    registerThumbnailProvider,
    registerCameraStateProvider,
    setModelerActive,
    timelapseMeta,
    timelapseTotalBytes,
    refreshTimelapseMeta,
    recordCameraMovement,
    toggleTimelapseRecordingPaused,
    clearActiveProjectTimelapse,
    clearProjectTimelapseById,
    refreshGalleryData,
    setProjectName,
    saveProject,
    saveProjectSilent,
    saveProjectAs,
    setEcosystemMeta,
    saveProjectWithEcosystem,
    enterAppWorkMode,
    createProject,
    openProject,
    applyRecoveryDraft,
    discardRecoveryDraft,
    dismissPendingRecovery,
    renameProjectById,
    duplicateProjectById,
    removeSavedProject,
    deleteProjectsByIds,
    moveProjectsToFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    exportNativeProject,
    importNativeProject,
    addPrimitive,
    addLightObject,
    updateLightProps,
    selectObject,
    selectObjectsFromBox,
    selectObjectInScene,
    toggleWorkMode,
    changeEditSelectionMode,
    setVertexSelectionTool,
    setEdgeSelectionTool,
    setFaceSelectionTool,
    setCursor3D,
    updateObjectTransform,
    commitObjectTransformFromGizmo,
    commitObjectTransformsFromGizmo,
    commitMeshEditFromGizmo,
    renameObject,
    toggleObjectVisibility,
    toggleObjectLock,
    duplicateSelectedObject,
    duplicateObjectById,
    applyObjectTransform,
    centerObjectOrigin,
    separateSelectedGeometry,
    deleteObject,
    deleteSelectedObjects,
    createScene,
    switchScene,
    renameScene,
    deleteScene,
    createCollection,
    selectCollection,
    renameCollection,
    toggleCollectionExpanded,
    deleteCollection,
    moveObjectToCollection,
    importObjParts,
    importStlResult,
    importModelAsNewProject,
    materials: projectMaterials,
    createMaterial,
    renameMaterial,
    pushMaterialHistorySnapshot,
    updateMaterial,
    duplicateMaterial,
    deleteMaterial,
    getMaterialUsageSummary,
    assignMaterialToObjects,
    assignMaterialToFaces,
    unassignMaterialFromFaces,
    selectFacesByMaterial,
    setObjectShading,
    addReferenceImage,
    updateReferenceImageProps,
    showToast,
    selectAllEditComponents,
    deselectAllEditComponents,
    selectConnectedEditComponents,
    selectAllSceneObjects,
    deselectAllSceneObjects,
    deleteSelectedEditComponents,
    executeContextualDelete,
    executeFillSelection,
    executeConnectVertexPath,
    executeQuickDissolve,
    executeRecalculateOutside,
    executeFlipNormals,
    recalculateObjectNormalsOutside,
    flipObjectNormals,
    selectComponentFromViewport,
    selectComponentsFromBox,
    selectEdgeTopology,
    toggleScreenShift,
    setScreenShiftActive,
    setScreenModifier,
    toggleScreenModifier,
    releaseScreenModifiers,
    updateSettings,
    setDisplayMode,
    setXrayTransparency,
    toggleXrayDisplayMode,
    toggleFaceOrientation,
    updateProportionalSettings,
    toggleProportionalEditing,
    toggleProportionalConnected,
    setProportionalFalloff,
    cycleProportionalFalloff,
    setProportionalRadius,
    updateTouchSettings,
    updateTouchModifier,
    updateRadialSlot,
    resetRadialSlot,
    resetRadialLayout,
    updateRadialScopeSlot,
    resetRadialScopeSlot,
    resetRadialScopeLayout,
    resetTouchSettings,
    updateToolConfig,
    resetToolConfig,
    resetAllToolConfigs,
    updateSelectedVerticesPosition,
    addModifier,
    updateModifier,
    reorderModifier,
    removeModifier,
    applyModifier,
    startEditOperator,
    updateOperatorConfig,
    switchMergeOperator,
    pickLoopCutEdge,
    confirmEditOperator,
    cancelEditOperator,
    undo,
    redo,
    markSelectedSeams,
    selectSeams,
    deselectSeams,
    setEditSelectionFromUV,
  };
}
