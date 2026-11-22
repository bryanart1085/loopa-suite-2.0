import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Pyramid,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Unlock,
  Box,
  Circle,
  Cone,
  Cylinder,
  Torus,
  X,
  ArrowRightLeft,
} from 'lucide-react';
import * as THREE from 'three';
import { EditableMesh } from '../core/mesh/EditableMesh';
import { EditSelectionMode } from '../core/mesh/operations';
import {
  DeleteCollectionResolution,
  getCollectionObjectCount,
} from '../core/project/hierarchy';
import {
  CollectionData,
  LightData,
  ObjectShadingMode,
  ObjectTransform,
  ReferenceImageData,
  ReferenceImageOrientation,
  SceneData,
  SceneObjectData,
  WorkMode,
} from '../core/project/types';
import {
  ModifierDiagnostic,
  ModifierSlot,
  ModifierType,
} from '../core/modifiers/types';
import { ModifierStackPanel } from './ModifierStackPanel';
import { NumericFieldInput } from './NumericFieldInput';

interface LinerPanelProps {
  isOpen?: boolean;
  scenes: SceneData[];
  activeSceneId: string;
  activeCollectionId: string;
  objects: SceneObjectData[];
  selectedObjectId: string | null;
  selectedObjectIds?: Set<string>;
  workMode: WorkMode;
  editSelectionMode: EditSelectionMode;
  selectedComponentIds: Set<string>;
  liveTransformOverride: { id: string; transform: ObjectTransform } | null;
  onSelectObjectInScene: (
    sceneId: string,
    objectId: string,
    additive?: boolean,
  ) => void;
  onRenameObject: (id: string, name: string) => void;
  onDuplicateObject: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDeleteObject: (id: string) => void;
  onUpdateObjectTransform: (id: string, transform: ObjectTransform) => void;
  onUpdateEditCentroidAxis: (axis: 0 | 1 | 2, value: number) => void;
  onCreateScene: () => void;
  onSwitchScene: (sceneId: string) => void;
  onRenameScene: (sceneId: string, name: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onCreateCollection: (
    sceneId: string,
    name?: string,
    parentId?: string | null,
  ) => void;
  onSelectCollection: (sceneId: string, collectionId: string) => void;
  onRenameCollection: (
    sceneId: string,
    collectionId: string,
    name: string,
  ) => void;
  onToggleCollectionExpanded: (sceneId: string, collectionId: string) => void;
  onDeleteCollection: (
    sceneId: string,
    collectionId: string,
    resolution: DeleteCollectionResolution,
  ) => void;
  onMoveObjectToCollection: (
    sceneId: string,
    objectId: string,
    targetCollectionId: string,
  ) => void;
  onUpdateReferenceImageProps: (
    objectId: string,
    patch: Partial<
      Pick<ReferenceImageData, 'opacity' | 'orientation' | 'depthMode'>
    >,
    recordHistory?: boolean,
  ) => void;
  onUpdateLightProps?: (
    objectId: string,
    patch: Partial<LightData>,
    recordHistory?: boolean,
  ) => void;
  modifierDiagnostics: Record<string, ModifierDiagnostic>;
  evaluatedVertexCount: number;
  evaluatedFaceCount: number;
  hasActiveModifiers: boolean;
  onAddModifier: (objectId: string, type: ModifierType) => void;
  onUpdateModifier: (
    objectId: string,
    modifierId: string,
    patch: Partial<ModifierSlot>,
    recordHistory?: boolean,
  ) => void;
  onReorderModifier: (
    objectId: string,
    modifierId: string,
    direction: 'up' | 'down',
  ) => void;
  onRemoveModifier: (objectId: string, modifierId: string) => void;
  onApplyModifier: (objectId: string, modifierId: string) => void;
  onRecalculateNormalsOutside?: (objectId: string) => void;
  onFlipNormals?: (objectId: string) => void;
  onSetObjectShading: (objectId: string, shading: ObjectShadingMode) => void;
  onTabChange?: (tab: 'hierarchy' | 'modifiers') => void;
  ngonHighlightActive?: boolean;
  ngonHighlightDismissed?: boolean;
  onDismissNgonHighlight?: (modifierId: string) => void;
  onRestoreNgonHighlight?: () => void;
  onClose?: () => void;
}

type HierarchyItemMenu =
  | { kind: 'scene'; sceneId: string; x: number; y: number }
  | { kind: 'collection'; sceneId: string; collectionId: string; x: number; y: number }
  | { kind: 'object'; sceneId: string; objectId: string; x: number; y: number };

type RenamingTarget =
  | { kind: 'scene'; id: string }
  | { kind: 'collection'; sceneId: string; id: string }
  | { kind: 'object'; id: string };

interface DeleteCollectionPrompt {
  sceneId: string;
  collection: CollectionData;
  objectCount: number;
  otherCollections: CollectionData[];
}

function getObjectIcon(obj: SceneObjectData) {
  switch (obj.objectType) {
    case 'reference_image':
      return <ImageIcon className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />;
    case 'camera':
      return <Camera className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />;
    case 'light':
      return <Sun className="w-3.5 h-3.5 text-[#facc15] shrink-0" />;
    case 'empty':
      return <Crosshair className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />;
    case 'mesh':
    default:
      switch (obj.primitiveType) {
        case 'plane':
          return <Square className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />;
        case 'cube':
          return <Box className="w-3.5 h-3.5 text-[#5ecd6e] shrink-0" />;
        case 'circle':
          return <Circle className="w-3.5 h-3.5 text-[#60a5fa] shrink-0" />;
        case 'uv_sphere':
          return <Globe className="w-3.5 h-3.5 text-[#34d399] shrink-0" />;
        case 'cylinder':
          return <Cylinder className="w-3.5 h-3.5 text-[#a78bfa] shrink-0" />;
        case 'cone':
          return <Cone className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />;
        case 'torus':
          return <Torus className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />;
        case 'pyramid':
          return <Pyramid className="w-3.5 h-3.5 text-[#f472b6] shrink-0" />;
        case 'suzanne':
          return (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 text-[#5ecd6e] shrink-0"
            >
              <circle cx="4.5" cy="11" r="2.5" />
              <circle cx="19.5" cy="11" r="2.5" />
              <path d="M7 10.5C7 7 9.2 4.5 12 4.5s5 2.5 5 6c0 2-.7 3.5-1.5 4.8-.6 1-1.3 3.7-3.5 3.7s-2.9-2.7-3.5-3.7C7.7 14 7 12.5 7 10.5Z" />
            </svg>
          );
        default:
          return <Box className="w-3.5 h-3.5 text-[#9ca3af] shrink-0" />;
      }
  }
}

export const LinerPanel: React.FC<LinerPanelProps> = ({
  isOpen = true,
  scenes,
  activeSceneId,
  activeCollectionId,
  objects,
  selectedObjectId,
  selectedObjectIds,
  workMode,
  editSelectionMode,
  selectedComponentIds,
  liveTransformOverride,
  onSelectObjectInScene,
  onRenameObject,
  onDuplicateObject,
  onToggleVisibility,
  onToggleLock,
  onDeleteObject,
  onUpdateObjectTransform,
  onUpdateEditCentroidAxis,
  onCreateScene,
  onSwitchScene,
  onRenameScene,
  onDeleteScene,
  onCreateCollection,
  onSelectCollection,
  onRenameCollection,
  onToggleCollectionExpanded,
  onDeleteCollection,
  onMoveObjectToCollection,
  onUpdateReferenceImageProps,
  onUpdateLightProps,
  modifierDiagnostics,
  evaluatedVertexCount,
  evaluatedFaceCount,
  hasActiveModifiers,
  onAddModifier,
  onUpdateModifier,
  onReorderModifier,
  onRemoveModifier,
  onApplyModifier,
  onRecalculateNormalsOutside,
  onFlipNormals,
  onSetObjectShading,
  onTabChange,
  ngonHighlightActive = false,
  ngonHighlightDismissed = false,
  onDismissNgonHighlight,
  onRestoreNgonHighlight,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'modifiers'>(
    'hierarchy',
  );

  const selectTab = (tab: 'hierarchy' | 'modifiers') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };
  const [expandedScenes, setExpandedScenes] = useState<Record<string, boolean>>(
    () => ({ [activeSceneId]: true }),
  );
  const [renaming, setRenaming] = useState<RenamingTarget | null>(null);
  const [draftName, setDraftName] = useState('');
  const [contextMenu, setContextMenu] = useState<HierarchyItemMenu | null>(null);
  const [movePickerFor, setMovePickerFor] = useState<{
    sceneId: string;
    objectId: string;
  } | null>(null);
  const [deletePrompt, setDeletePrompt] =
    useState<DeleteCollectionPrompt | null>(null);
  const [deleteTargetColId, setDeleteTargetColId] = useState<string>('');

  // Pointer & HTML5 Drag State for moving objects between collections cleanly
  const [dragState, setDragState] = useState<{
    sceneId: string;
    objectId: string;
    objectName: string;
    hoverCollectionId: string | null;
    clientX: number;
    clientY: number;
  } | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  // Auto-expand active scene when switching/creating scenes
  useEffect(() => {
    setExpandedScenes((prev) =>
      prev[activeSceneId] ? prev : { ...prev, [activeSceneId]: true },
    );
  }, [activeSceneId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const selectedObj = useMemo(
    () => objects.find((o) => o.id === selectedObjectId) ?? null,
    [objects, selectedObjectId],
  );

  const activeTransform: ObjectTransform | null = useMemo(() => {
    if (!selectedObj) return null;
    if (liveTransformOverride && liveTransformOverride.id === selectedObj.id) {
      return liveTransformOverride.transform;
    }
    return selectedObj.transform;
  }, [liveTransformOverride, selectedObj]);

  const editCentroid = useMemo(() => {
    if (workMode !== 'edit' || !selectedObj || selectedComponentIds.size === 0) {
      return null;
    }
    const mesh = EditableMesh.fromJSON(selectedObj.mesh);
    const vertIds = mesh.getVertexIdsFromSelection(
      editSelectionMode,
      selectedComponentIds,
    );
    return {
      centroid: mesh.computeCentroid(vertIds),
      vertexCount: vertIds.size,
    };
  }, [editSelectionMode, selectedComponentIds, selectedObj, workMode]);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const scheduleLongPress = (
    e: React.PointerEvent,
    buildMenu: (x: number, y: number) => HierarchyItemMenu,
  ) => {
    clearLongPress();
    const x = e.clientX;
    const y = e.clientY;
    longPressStartRef.current = { x, y };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      setContextMenu(buildMenu(x, y));
    }, 460);
  };

  const handleRowPointerMoveForLongPress = (e: React.PointerEvent) => {
    if (!longPressStartRef.current || longPressTimerRef.current === null) return;
    if (
      Math.hypot(
        e.clientX - longPressStartRef.current.x,
        e.clientY - longPressStartRef.current.y,
      ) > 10
    ) {
      clearLongPress();
    }
  };

  const commitRename = () => {
    if (!renaming) return;
    const trimmed = draftName.trim();
    if (trimmed) {
      if (renaming.kind === 'scene') {
        onRenameScene(renaming.id, trimmed);
      } else if (renaming.kind === 'collection') {
        onRenameCollection(renaming.sceneId, renaming.id, trimmed);
      } else {
        onRenameObject(renaming.id, trimmed);
      }
    }
    setRenaming(null);
  };

  const requestDeleteCollection = (
    scene: SceneData,
    collection: CollectionData,
  ) => {
    if (scene.collections.length <= 1) return;
    const count = getCollectionObjectCount(scene, collection.id);
    if (count === 0) {
      onDeleteCollection(scene.id, collection.id, { mode: 'delete_objects' });
      return;
    }
    const others = scene.collections.filter((c) => c.id !== collection.id);
    setDeleteTargetColId(others[0]?.id ?? '');
    setDeletePrompt({
      sceneId: scene.id,
      collection,
      objectCount: count,
      otherCollections: others,
    });
  };

  const handleNumericTransform = (
    field: 'position' | 'rotation' | 'scale',
    axis: 0 | 1 | 2,
    val: number,
  ) => {
    if (!selectedObj || !activeTransform || selectedObj.locked) return;
    if (!Number.isFinite(val)) return;
    const next: ObjectTransform = {
      position: [...activeTransform.position],
      rotation: [...activeTransform.rotation],
      scale: [...activeTransform.scale],
    };
    if (field === 'rotation') {
      next.rotation[axis] = THREE.MathUtils.degToRad(val);
    } else if (field === 'scale') {
      next.scale[axis] = Math.abs(val) < 0.001 ? 0.001 : val;
    } else {
      next.position[axis] = val;
    }
    onUpdateObjectTransform(selectedObj.id, next);
  };

  // Pointer-based touch-safe drag from dedicated grip handle
  const handleGripPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    sceneId: string,
    obj: SceneObjectData,
  ) => {
    e.stopPropagation();
    clearLongPress();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      sceneId,
      objectId: obj.id,
      objectName: obj.name,
      hoverCollectionId: obj.collectionId,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  const handleGripPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const colEl = el?.closest('[data-drop-collection-id]') as HTMLElement | null;
    const targetSceneId = colEl?.dataset.dropSceneId ?? null;
    const targetColId =
      colEl && targetSceneId === dragState.sceneId
        ? (colEl.dataset.dropCollectionId ?? null)
        : null;
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            hoverCollectionId: targetColId,
            clientX: e.clientX,
            clientY: e.clientY,
          }
        : null,
    );
  };

  const handleGripPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (dragState.hoverCollectionId) {
      onMoveObjectToCollection(
        dragState.sceneId,
        dragState.objectId,
        dragState.hoverCollectionId,
      );
    }
    setDragState(null);
  };

  const renderCollectionBranch = (
    scene: SceneData,
    collection: CollectionData,
    depth: number,
  ): React.ReactNode => {
    const childCollections = scene.collections.filter(
      (c) => c.parentId === collection.id,
    );
    const colObjects = scene.objects.filter(
      (o) => o.collectionId === collection.id,
    );
    const count = getCollectionObjectCount(scene, collection.id, true);
    const isActiveCollection =
      scene.id === activeSceneId && collection.id === activeCollectionId;
    const isDropTarget =
      dragState?.sceneId === scene.id &&
      dragState.hoverCollectionId === collection.id;
    const isRenamingCol =
      renaming?.kind === 'collection' && renaming.id === collection.id;

    return (
      <div key={collection.id} className="space-y-0.5">
        {/* Collection Row */}
        <div
          data-drop-scene-id={scene.id}
          data-drop-collection-id={collection.id}
          onDragOver={(e) => {
            if (dragState?.sceneId === scene.id) e.preventDefault();
          }}
          onPointerDown={(e) =>
            scheduleLongPress(e, (x, y) => ({
              kind: 'collection',
              sceneId: scene.id,
              collectionId: collection.id,
              x,
              y,
            }))
          }
          onPointerMove={handleRowPointerMoveForLongPress}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onClick={() => onSelectCollection(scene.id, collection.id)}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          className={`min-h-[38px] pr-1 rounded-md flex items-center justify-between gap-1 cursor-pointer transition-colors ${
            isDropTarget
              ? 'bg-[#3b2e19] border border-[#5ecd6e]'
              : isActiveCollection
                ? 'bg-[#232730] border border-[#3a404f]'
                : 'hover:bg-[#20232b] border border-transparent'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollectionExpanded(scene.id, collection.id);
              }}
              className="w-6 h-6 rounded hover:bg-[#2f3440] text-[#9ca3af] hover:text-white flex items-center justify-center shrink-0"
              aria-label={
                collection.expanded ? 'Contraer colección' : 'Expandir colección'
              }
            >
              {collection.expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {collection.expanded ? (
              <FolderOpen
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActiveCollection ? 'text-[#5ecd6e]' : 'text-[#cbd5e1]'
                }`}
              />
            ) : (
              <Folder
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActiveCollection ? 'text-[#5ecd6e]' : 'text-[#94a3b8]'
                }`}
              />
            )}

            {isRenamingCol ? (
              <div
                className="flex items-center gap-1 flex-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  autoFocus
                  className="w-full h-7 px-1.5 rounded bg-[#111317] border border-[#5ecd6e] text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={commitRename}
                  className="w-7 h-7 rounded bg-[#5ecd6e] text-[#111215] flex items-center justify-center shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className={`text-xs font-medium truncate ${
                    isActiveCollection ? 'text-[#f3f4f6]' : 'text-[#cbd5e1]'
                  }`}
                >
                  {collection.name}
                </span>
                <span className="text-[11px] font-mono-tabular text-[#7c8494] shrink-0">
                  ({count})
                </span>
              </div>
            )}
          </div>

          {!isRenamingCol && (
            <div
              className="flex items-center gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setContextMenu({
                    kind: 'collection',
                    sceneId: scene.id,
                    collectionId: collection.id,
                    x: rect.right,
                    y: rect.bottom,
                  });
                }}
                className="w-7 h-7 rounded hover:bg-[#323640] text-[#8e95a2] hover:text-white flex items-center justify-center"
                title="Opciones de colección"
                aria-label={`Opciones de ${collection.name}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Children inside Collection */}
        {collection.expanded && (
          <div className="space-y-0.5">
            {childCollections.map((sub) =>
              renderCollectionBranch(scene, sub, depth + 1),
            )}

            {colObjects.map((obj) => {
              const isSelected =
                scene.id === activeSceneId &&
                (selectedObjectIds
                  ? selectedObjectIds.has(obj.id)
                  : obj.id === selectedObjectId);
              const isRenamingObj =
                renaming?.kind === 'object' && renaming.id === obj.id;
              const isBeingDragged = dragState?.objectId === obj.id;

              return (
                <div
                  key={obj.id}
                  onPointerDown={(e) =>
                    scheduleLongPress(e, (x, y) => ({
                      kind: 'object',
                      sceneId: scene.id,
                      objectId: obj.id,
                      x,
                      y,
                    }))
                  }
                  onPointerMove={handleRowPointerMoveForLongPress}
                  onPointerUp={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onClick={(e) =>
                    onSelectObjectInScene(scene.id, obj.id, e.shiftKey)
                  }
                  style={{ paddingLeft: `${26 + depth * 12}px` }}
                  className={`min-h-[40px] pr-1 rounded-md flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                    isBeingDragged
                      ? 'opacity-50 bg-[#272b35] border border-dashed border-[#5ecd6e]'
                      : isSelected
                        ? 'bg-[#2a2f3a] border border-[#5ecd6e]/55'
                        : 'hover:bg-[#22252c] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {scene.collections.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          handleGripPointerDown(e, scene.id, obj)
                        }
                        onPointerMove={handleGripPointerMove}
                        onPointerUp={handleGripPointerUp}
                        onPointerCancel={() => setDragState(null)}
                        style={{ touchAction: 'none' }}
                        className="w-5 h-7 -ml-1 rounded hover:bg-[#323744] text-[#6b7280] hover:text-[#cbd5e1] flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing"
                        title="Arrastrar a otra colección"
                        aria-label={`Mover ${obj.name} entre colecciones`}
                      >
                        <GripVertical className="w-3 h-3" />
                      </button>
                    )}

                    {getObjectIcon(obj)}

                    {isRenamingObj ? (
                      <div
                        className="flex items-center gap-1 flex-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          autoFocus
                          className="w-full h-7 px-1.5 rounded bg-[#111317] border border-[#5ecd6e] text-xs text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={commitRename}
                          className="w-7 h-7 rounded bg-[#5ecd6e] text-[#111215] flex items-center justify-center shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-xs font-medium truncate ${
                          isSelected ? 'text-[#f3f4f6]' : 'text-[#c4c9d4]'
                        } ${!obj.visible ? 'opacity-45 line-through' : ''}`}
                      >
                        {obj.name}
                      </span>
                    )}
                  </div>

                  {!isRenamingObj && (
                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleVisibility(obj.id)}
                        className="w-7 h-7 rounded hover:bg-[#323640] text-[#9ca3af] hover:text-white flex items-center justify-center"
                        title={obj.visible ? 'Ocultar' : 'Mostrar'}
                        aria-label={obj.visible ? 'Ocultar' : 'Mostrar'}
                      >
                        {obj.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-[#6b7280]" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleLock(obj.id)}
                        className="w-7 h-7 rounded hover:bg-[#323640] text-[#9ca3af] hover:text-white flex items-center justify-center"
                        title={
                          obj.locked
                            ? 'Desbloquear selección'
                            : 'Bloquear selección'
                        }
                        aria-label={
                          obj.locked
                            ? 'Desbloquear selección'
                            : 'Bloquear selección'
                        }
                      >
                        {obj.locked ? (
                          <Lock className="w-3.5 h-3.5 text-[#5ecd6e]" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setContextMenu({
                            kind: 'object',
                            sceneId: scene.id,
                            objectId: obj.id,
                            x: rect.right,
                            y: rect.bottom,
                          });
                        }}
                        className="w-7 h-7 rounded hover:bg-[#323640] text-[#8e95a2] hover:text-white flex items-center justify-center"
                        title="Más acciones"
                        aria-label={`Opciones de ${obj.name}`}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const activeContextScene = contextMenu
    ? scenes.find((s) => s.id === contextMenu.sceneId) ?? null
    : null;
  const activeContextCollection =
    contextMenu && contextMenu.kind === 'collection' && activeContextScene
      ? activeContextScene.collections.find(
          (c) => c.id === contextMenu.collectionId,
        ) ?? null
      : null;
  const activeContextObject =
    contextMenu && contextMenu.kind === 'object' && activeContextScene
      ? activeContextScene.objects.find((o) => o.id === contextMenu.objectId) ??
        null
      : null;

  return (
    <aside
      id="loopa-liner-panel"
      data-testid="liner-panel"
      data-open={isOpen ? 'true' : 'false'}
      aria-label="LINER"
      aria-hidden={!isOpen}
      onPointerDown={(e) => e.stopPropagation()}
      className={`shrink-0 h-full bg-[#181a1f] flex flex-col overflow-hidden z-20 relative transition-[width,opacity] duration-200 ease-out ${
        isOpen
          ? 'w-[min(272px,78vw)] sm:w-72 border-l border-[#2b2e36] opacity-100 pointer-events-auto'
          : 'w-0 border-l-0 opacity-0 pointer-events-none'
      }`}
    >
      <div className="w-[min(272px,78vw)] sm:w-72 h-full flex flex-col min-h-0">
        {/* Encabezado LINER + Pestañas (Jerarquía | Modificadores) */}
        <div
          data-testid="liner-header"
          className="px-2.5 pt-2 pb-1.5 border-b border-[#2b2e36] bg-[#15171b] shrink-0 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#e4e6eb]">
              LINER
            </span>
            {onClose && (
              <button
                type="button"
                data-testid="liner-close-btn"
                onClick={onClose}
                aria-label="Cerrar LINER"
                title="Cerrar panel LINER"
                className="w-7 h-7 rounded-md bg-[#1c1f27] hover:bg-[#2a2e38] border border-[#2c303a] text-[#9ca3af] hover:text-white flex items-center justify-center shrink-0 transition-colors touch-manipulation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Secciones de LINER"
            className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md bg-[#101216] border border-[#262932]"
          >
            <button
              id="liner-tab-hierarchy"
              data-testid="liner-tab-hierarchy"
              type="button"
              role="tab"
              aria-selected={activeTab === 'hierarchy'}
              aria-controls="liner-tabpanel-hierarchy"
              onClick={() => selectTab('hierarchy')}
              className={`h-8 px-1 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors touch-manipulation ${
                activeTab === 'hierarchy'
                  ? 'bg-[#2a2f3a] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Jerarquía</span>
            </button>
            <button
              id="liner-tab-modifiers"
              data-testid="liner-tab-modifiers"
              type="button"
              role="tab"
              aria-selected={activeTab === 'modifiers'}
              aria-controls="liner-tabpanel-modifiers"
              onClick={() => selectTab('modifiers')}
              title="Modificadores"
              className={`h-8 px-1 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors touch-manipulation ${
                activeTab === 'modifiers'
                  ? 'bg-[#2a2f3a] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Modif.</span>
            </button>
          </div>
        </div>

      {activeTab === 'modifiers' ? (
        /* PESTAÑA MODIFICADORES */
        <div
          id="liner-tabpanel-modifiers"
          role="tabpanel"
          aria-labelledby="liner-tab-modifiers"
          className="flex-1 min-h-0 flex flex-col"
        >
          <ModifierStackPanel
            selectedObject={selectedObj}
            sceneObjects={objects}
            diagnostics={modifierDiagnostics}
            evaluatedVertexCount={evaluatedVertexCount}
            evaluatedFaceCount={evaluatedFaceCount}
            hasActiveModifiers={hasActiveModifiers}
            onAddModifier={onAddModifier}
            onUpdateModifier={onUpdateModifier}
            onReorderModifier={onReorderModifier}
            onRemoveModifier={onRemoveModifier}
            onApplyModifier={onApplyModifier}
            onRecalculateNormalsOutside={onRecalculateNormalsOutside}
            onFlipNormals={onFlipNormals}
            ngonHighlightActive={ngonHighlightActive}
            ngonHighlightDismissed={ngonHighlightDismissed}
            onDismissNgonHighlight={onDismissNgonHighlight}
            onRestoreNgonHighlight={onRestoreNgonHighlight}
          />
        </div>
      ) : (
        /* PESTAÑA JERARQUÍA */
        <div
          id="liner-tabpanel-hierarchy"
          role="tabpanel"
          aria-labelledby="liner-tab-hierarchy"
          className="flex-1 min-h-0 flex flex-col"
        >
          {/* Quick Creation Header: + Escena / + Colección */}
          <div className="px-2.5 py-2 border-b border-[#262931] flex items-center justify-between gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onCreateScene}
              className="flex-1 h-8 px-2 rounded bg-[#20232b] hover:bg-[#2a2e38] border border-[#2f3440] text-[11px] font-medium text-[#e4e6eb] flex items-center justify-center gap-1 transition-colors"
              title="Crear nueva escena"
            >
              <Plus className="w-3.5 h-3.5 text-[#5ecd6e]" />
              <span>Escena</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateCollection(activeSceneId)}
              className="flex-1 h-8 px-2 rounded bg-[#20232b] hover:bg-[#2a2e38] border border-[#2f3440] text-[11px] font-medium text-[#e4e6eb] flex items-center justify-center gap-1 transition-colors"
              title="Crear nueva colección en la escena activa"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#5ecd6e]" />
              <span>Colección</span>
            </button>
          </div>

          {/* Hierarchical Tree: Scene -> Collection -> Object */}
          <div className="flex-1 min-h-0 overflow-y-auto cad-scroll p-1.5 space-y-1">
            {scenes.map((scene) => {
              const isActiveScene = scene.id === activeSceneId;
              const isExpanded = expandedScenes[scene.id] ?? isActiveScene;
              const isRenamingScene =
                renaming?.kind === 'scene' && renaming.id === scene.id;
              const rootCollections = scene.collections.filter(
                (c) => c.parentId === null,
              );

              return (
                <div key={scene.id} className="space-y-0.5">
                  {/* Scene Row */}
                  <div
                    onPointerDown={(e) =>
                      scheduleLongPress(e, (x, y) => ({
                        kind: 'scene',
                        sceneId: scene.id,
                        x,
                        y,
                      }))
                    }
                    onPointerMove={handleRowPointerMoveForLongPress}
                    onPointerUp={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onClick={() => onSwitchScene(scene.id)}
                    className={`min-h-[38px] px-1.5 rounded-md flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                      isActiveScene
                        ? 'bg-[#21252f] border border-[#5ecd6e]/40'
                        : 'hover:bg-[#20232b] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedScenes((prev) => ({
                            ...prev,
                            [scene.id]: !isExpanded,
                          }));
                        }}
                        className="w-6 h-6 rounded hover:bg-[#2f3440] text-[#9ca3af] hover:text-white flex items-center justify-center shrink-0"
                        aria-label={
                          isExpanded ? 'Contraer escena' : 'Expandir escena'
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <Clapperboard
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActiveScene ? 'text-[#5ecd6e]' : 'text-[#8e95a2]'
                        }`}
                      />

                      {isRenamingScene ? (
                        <div
                          className="flex items-center gap-1 flex-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenaming(null);
                            }}
                            autoFocus
                            className="w-full h-7 px-1.5 rounded bg-[#111317] border border-[#5ecd6e] text-xs text-white outline-none"
                          />
                          <button
                            type="button"
                            onClick={commitRename}
                            className="w-7 h-7 rounded bg-[#5ecd6e] text-[#111215] flex items-center justify-center shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`text-xs font-semibold truncate ${
                              isActiveScene ? 'text-[#f3f4f6]' : 'text-[#9ca3af]'
                            }`}
                          >
                            {scene.name}
                          </span>
                          {isActiveScene && (
                            <span className="text-[10px] font-medium text-[#5ecd6e] shrink-0">
                              · Activa
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {!isRenamingScene && (
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setContextMenu({
                              kind: 'scene',
                              sceneId: scene.id,
                              x: rect.right,
                              y: rect.bottom,
                            });
                          }}
                          className="w-7 h-7 rounded hover:bg-[#323640] text-[#8e95a2] hover:text-white flex items-center justify-center"
                          title="Opciones de escena"
                          aria-label={`Opciones de ${scene.name}`}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Scene Collections & Objects */}
                  {isExpanded && (
                    <div className="space-y-0.5">
                      {rootCollections.map((col) =>
                        renderCollectionBranch(scene, col, 1),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Lower: Transformación / Selección en Edición */}
          <div className="shrink-0 bg-[#16181c] border-t border-[#2b2e36] p-3 space-y-3 max-h-[44%] overflow-y-auto cad-scroll">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#e4e6eb]">
                {workMode === 'edit' ? 'Selección en Edición' : 'Transformación'}
              </span>
              {selectedObj && (
                <span className="text-[11px] text-[#8e95a2] truncate max-w-[120px]">
                  {selectedObj.name}
                </span>
              )}
            </div>

            {!selectedObj || !activeTransform ? (
              <div className="text-xs text-[#7c8391] py-1">
                Selecciona un objeto para ver sus coordenadas.
              </div>
            ) : workMode === 'edit' ? (
              editCentroid && editCentroid.centroid ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-[#9ca3af]">
                    Centroide local ({editCentroid.vertexCount} vértices afectados)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['X', 'Y', 'Z'] as const).map((axisLabel, idx) => {
                      const axisColors = [
                        'text-[#e05252]',
                        'text-[#52b852]',
                        'text-[#48bce8]',
                      ];
                      return (
                        <label
                          key={axisLabel}
                          className="flex items-center bg-[#111317] border border-[#2b2e36] focus-within:border-[#5ecd6e]/60 rounded px-1.5 h-9"
                        >
                          <span
                            className={`text-[11px] font-bold mr-1 ${axisColors[idx]}`}
                          >
                            {axisLabel}
                          </span>
                          <NumericFieldInput
                            ariaLabel={`Centroide ${axisLabel}`}
                            value={editCentroid.centroid![idx]}
                            decimals={3}
                            onCommit={(v) =>
                              onUpdateEditCentroidAxis(idx as 0 | 1 | 2, v)
                            }
                            className="w-full bg-transparent text-xs font-mono-tabular text-[#e4e6eb] outline-none text-right"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#7c8391] py-1">
                  Toca vértices, aristas o caras en el visor para editar la geometría.
                </div>
              )
            ) : (
              <div className="space-y-3">
                {selectedObj.objectType === 'reference_image' &&
                  selectedObj.referenceImage && (
                    <div className="space-y-2.5 pb-2.5 border-b border-[#262931]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#38bdf8]">
                          Referencia de imagen
                        </span>
                        <span className="text-[10px] text-[#8e95a2] font-mono-tabular">
                          {selectedObj.referenceImage.naturalWidth}×
                          {selectedObj.referenceImage.naturalHeight}
                        </span>
                      </div>

                      {/* Opacidad */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-[#9ca3af]">
                          <span>Opacidad</span>
                          <span className="font-mono-tabular text-[#e4e6eb]">
                            {Math.round(
                              selectedObj.referenceImage.opacity * 100,
                            )}
                            %
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={selectedObj.referenceImage.opacity}
                          onChange={(e) =>
                            onUpdateReferenceImageProps(
                              selectedObj.id,
                              { opacity: parseFloat(e.target.value) },
                              false,
                            )
                          }
                          className="w-full accent-[#5ecd6e] h-2 cursor-pointer"
                        />
                      </div>

                      {/* Orientación */}
                      <div className="space-y-1">
                        <div className="text-[11px] text-[#9ca3af]">
                          Orientación
                        </div>
                        <select
                          disabled={selectedObj.locked}
                          value={selectedObj.referenceImage.orientation}
                          onChange={(e) =>
                            onUpdateReferenceImageProps(selectedObj.id, {
                              orientation: e.target
                                .value as ReferenceImageOrientation,
                            })
                          }
                          className="w-full h-9 px-2 rounded bg-[#111317] border border-[#2b2e36] text-xs text-[#e4e6eb] outline-none focus:border-[#5ecd6e] disabled:opacity-45"
                        >
                          <option value="front">Frontal (-Y)</option>
                          <option value="back">Posterior (+Y)</option>
                          <option value="left">Lateral izquierda (-X)</option>
                          <option value="right">Lateral derecha (+X)</option>
                          <option value="top">Superior (+Z)</option>
                          <option value="bottom">Inferior (-Z)</option>
                          <option value="free">Orientación libre</option>
                        </select>
                      </div>

                      {/* Orden respecto a la geometría */}
                      <div className="space-y-1">
                        <div className="text-[11px] text-[#9ca3af]">
                          Posición visual
                        </div>
                        <div className="grid grid-cols-2 gap-1 p-0.5 rounded bg-[#111317] border border-[#2b2e36]">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateReferenceImageProps(selectedObj.id, {
                                depthMode: 'back',
                              })
                            }
                            className={`h-8 rounded text-[11px] font-medium transition-colors ${
                              selectedObj.referenceImage.depthMode === 'back'
                                ? 'bg-[#2a2f3a] text-[#5ecd6e]'
                                : 'text-[#9ca3af] hover:text-white'
                            }`}
                          >
                            Detrás
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateReferenceImageProps(selectedObj.id, {
                                depthMode: 'front',
                              })
                            }
                            className={`h-8 rounded text-[11px] font-medium transition-colors ${
                              selectedObj.referenceImage.depthMode === 'front'
                                ? 'bg-[#2a2f3a] text-[#5ecd6e]'
                                : 'text-[#9ca3af] hover:text-white'
                            }`}
                          >
                            Delante
                          </button>
                        </div>
                      </div>

                      {/* Restaurar proporción original */}
                      <button
                        type="button"
                        disabled={selectedObj.locked}
                        onClick={() => {
                          const uniform =
                            (Math.abs(activeTransform.scale[0]) +
                              Math.abs(activeTransform.scale[1])) /
                              2 || 1;
                          onUpdateObjectTransform(selectedObj.id, {
                            ...activeTransform,
                            scale: [uniform, uniform, uniform],
                          });
                        }}
                        className="w-full h-8 rounded bg-[#20232b] hover:bg-[#2a2e38] disabled:opacity-45 border border-[#2f3440] text-[11px] font-medium text-[#d1d5db] transition-colors"
                      >
                        Restaurar proporción original
                      </button>
                    </div>
                  )}

                {selectedObj.objectType === 'light' &&
                  selectedObj.light &&
                  onUpdateLightProps && (
                    <div
                      data-testid="light-inspector-panel"
                      className="space-y-2.5 pb-2.5 border-b border-[#262931]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#facc15] flex items-center gap-1.5">
                          <Sun className="w-3.5 h-3.5" />
                          Luz de punto
                        </span>
                        <span className="text-[10px] font-mono-tabular text-[#8e95a2]">
                          {selectedObj.light.enabled ? 'Activa' : 'Apagada'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          data-testid="light-enabled-toggle"
                          disabled={selectedObj.locked}
                          onClick={() =>
                            onUpdateLightProps(
                              selectedObj.id,
                              { enabled: !selectedObj.light!.enabled },
                              true,
                            )
                          }
                          className={`h-8 rounded border text-[11px] font-semibold transition-colors disabled:opacity-45 ${
                            selectedObj.light.enabled
                              ? 'bg-[#2a2512] border-[#facc15]/60 text-[#fde047]'
                              : 'bg-[#1a1c22] border-[#2b2e36] text-[#9ca3af]'
                          }`}
                        >
                          {selectedObj.light.enabled ? 'Encendida' : 'Apagada'}
                        </button>
                        <button
                          type="button"
                          data-testid="light-icon-toggle"
                          disabled={selectedObj.locked}
                          onClick={() =>
                            onUpdateLightProps(
                              selectedObj.id,
                              { showIcon: !selectedObj.light!.showIcon },
                              true,
                            )
                          }
                          className={`h-8 rounded border text-[11px] font-medium transition-colors disabled:opacity-45 ${
                            selectedObj.light.showIcon
                              ? 'bg-[#20232b] border-[#5ecd6e]/50 text-[#e4e6eb]'
                              : 'bg-[#1a1c22] border-[#2b2e36] text-[#8e95a2]'
                          }`}
                        >
                          {selectedObj.light.showIcon
                            ? 'Ícono visible'
                            : 'Ícono oculto'}
                        </button>
                      </div>

                      {/* Color de la luz */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#9ca3af]">Color</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <span className="text-[10px] font-mono-tabular uppercase text-[#cbd5e1]">
                            {selectedObj.light.color}
                          </span>
                          <input
                            type="color"
                            data-testid="light-color-input"
                            aria-label="Color de luz"
                            disabled={selectedObj.locked}
                            value={selectedObj.light.color}
                            onChange={(e) =>
                              onUpdateLightProps(
                                selectedObj.id,
                                { color: e.target.value },
                                true,
                              )
                            }
                            className="w-8 h-7 rounded bg-transparent border border-[#343a47] cursor-pointer disabled:opacity-45"
                          />
                        </label>
                      </div>

                      {/* Intensidad */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[#9ca3af]">
                          <span>Intensidad</span>
                          <NumericFieldInput
                            ariaLabel="Intensidad de luz"
                            disabled={selectedObj.locked}
                            value={selectedObj.light.intensity}
                            decimals={1}
                            onCommit={(val) =>
                              onUpdateLightProps(
                                selectedObj.id,
                                { intensity: Math.max(0, Math.min(200, val)) },
                                true,
                              )
                            }
                            className="w-16 h-6 px-1.5 rounded bg-[#111317] border border-[#2b2e36] text-[11px] font-mono-tabular text-[#e4e6eb] text-right outline-none focus:border-[#5ecd6e]"
                          />
                        </div>
                        <input
                          type="range"
                          data-testid="light-intensity-slider"
                          aria-label="Control de intensidad de luz"
                          disabled={selectedObj.locked}
                          min={0}
                          max={100}
                          step={0.5}
                          value={Math.min(100, selectedObj.light.intensity)}
                          onChange={(e) =>
                            onUpdateLightProps(
                              selectedObj.id,
                              { intensity: parseFloat(e.target.value) },
                              false,
                            )
                          }
                          className="w-full accent-[#facc15] h-2 cursor-pointer disabled:opacity-45"
                        />
                      </div>

                      {/* Distancia / Alcance */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[#9ca3af]">
                          <span>Alcance (0 = ilimitado)</span>
                          <NumericFieldInput
                            ariaLabel="Alcance de luz"
                            disabled={selectedObj.locked}
                            value={selectedObj.light.distance}
                            decimals={1}
                            onCommit={(val) =>
                              onUpdateLightProps(
                                selectedObj.id,
                                { distance: Math.max(0, Math.min(500, val)) },
                                true,
                              )
                            }
                            className="w-16 h-6 px-1.5 rounded bg-[#111317] border border-[#2b2e36] text-[11px] font-mono-tabular text-[#e4e6eb] text-right outline-none focus:border-[#5ecd6e]"
                          />
                        </div>
                        <input
                          type="range"
                          data-testid="light-distance-slider"
                          aria-label="Control de alcance de luz"
                          disabled={selectedObj.locked}
                          min={0}
                          max={80}
                          step={0.5}
                          value={Math.min(80, selectedObj.light.distance)}
                          onChange={(e) =>
                            onUpdateLightProps(
                              selectedObj.id,
                              { distance: parseFloat(e.target.value) },
                              false,
                            )
                          }
                          className="w-full accent-[#38bdf8] h-2 cursor-pointer disabled:opacity-45"
                        />
                      </div>
                    </div>
                  )}

                {(
                  (selectedObj.objectType === 'light'
                    ? [
                        {
                          key: 'position',
                          label: 'Posición',
                          values: activeTransform.position,
                          step: '0.1',
                        },
                      ]
                    : [
                        {
                          key: 'position',
                          label: 'Posición',
                          values: activeTransform.position,
                          step: '0.1',
                        },
                        {
                          key: 'rotation',
                          label: 'Rotación (°)',
                          values: activeTransform.rotation.map((r) =>
                            THREE.MathUtils.radToDeg(r),
                          ),
                          step: '5',
                        },
                        {
                          key: 'scale',
                          label: 'Escala',
                          values: activeTransform.scale,
                          step: '0.1',
                        },
                      ]) as readonly {
                    key: 'position' | 'rotation' | 'scale';
                    label: string;
                    values: readonly number[];
                    step: string;
                  }[]
                ).map((row) => (
                  <div key={row.key} className="space-y-1">
                    <div className="text-[11px] text-[#9ca3af]">{row.label}</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['X', 'Y', 'Z'] as const).map((axisLabel, idx) => {
                        const axisColors = [
                          'text-[#e05252]',
                          'text-[#52b852]',
                          'text-[#48bce8]',
                        ];
                        return (
                          <label
                            key={axisLabel}
                            className="flex items-center bg-[#111317] border border-[#2b2e36] focus-within:border-[#5ecd6e]/60 rounded px-1.5 h-9"
                          >
                            <span
                              className={`text-[11px] font-bold mr-1 ${axisColors[idx]}`}
                            >
                              {axisLabel}
                            </span>
                            <NumericFieldInput
                              ariaLabel={`${row.label} ${axisLabel}`}
                              disabled={selectedObj.locked}
                              value={row.values[idx]}
                              decimals={2}
                              onCommit={(val) =>
                                handleNumericTransform(
                                  row.key,
                                  idx as 0 | 1 | 2,
                                  val,
                                )
                              }
                              className="w-full bg-transparent text-xs font-mono-tabular text-[#e4e6eb] outline-none text-right disabled:opacity-45"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Drag Ghost Badge */}
      {dragState && (
        <div
          style={{
            left: Math.min(window.innerWidth - 180, dragState.clientX - 60),
            top: Math.max(12, dragState.clientY - 38),
          }}
          className="fixed z-50 px-2.5 py-1.5 rounded-md bg-[#222630] border border-[#5ecd6e] text-xs font-semibold text-[#f3f4f6] shadow-xl pointer-events-none flex items-center gap-1.5"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-[#5ecd6e]" />
          <span className="truncate max-w-[140px]">{dragState.objectName}</span>
        </div>
      )}

      {/* 3-Dots / Long-Press Action Menu Popover */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              left: Math.max(
                12,
                Math.min(window.innerWidth - 216, contextMenu.x - 196),
              ),
              top: Math.max(
                12,
                Math.min(window.innerHeight - 330, contextMenu.y + 4),
              ),
            }}
            className="fixed z-50 w-52 rounded-lg bg-[#1d2027] border border-[#353a46] shadow-2xl py-1 text-xs text-[#e5e7eb]"
          >
            {contextMenu.kind === 'scene' && activeContextScene && (
              <>
                <div className="px-3 py-1.5 text-[11px] font-semibold text-[#9ca3af] border-b border-[#2b2f3a] truncate">
                  Escena: {activeContextScene.name}
                </div>
                {activeContextScene.id !== activeSceneId && (
                  <button
                    type="button"
                    onClick={() => {
                      onSwitchScene(activeContextScene.id);
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    <Clapperboard className="w-3.5 h-3.5 text-[#5ecd6e]" />
                    <span>Activar escena</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onCreateCollection(activeContextScene.id);
                    setContextMenu(null);
                  }}
                  className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Nueva colección</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(activeContextScene.name);
                    setRenaming({ kind: 'scene', id: activeContextScene.id });
                    setContextMenu(null);
                  }}
                  className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Renombrar escena</span>
                </button>
                <button
                  type="button"
                  disabled={scenes.length <= 1}
                  onClick={() => {
                    onDeleteScene(activeContextScene.id);
                    setContextMenu(null);
                  }}
                  className="w-full h-9 px-3 hover:bg-[#352024] text-[#f87171] disabled:opacity-35 disabled:pointer-events-none flex items-center gap-2 text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar escena</span>
                </button>
              </>
            )}

            {contextMenu.kind === 'collection' &&
              activeContextScene &&
              activeContextCollection && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[#9ca3af] border-b border-[#2b2f3a] truncate">
                    Colección: {activeContextCollection.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCollection(
                        activeContextScene.id,
                        activeContextCollection.id,
                      );
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#5ecd6e]" />
                    <span>Usar como activa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCreateCollection(activeContextScene.id);
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Nueva colección</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(activeContextCollection.name);
                      setRenaming({
                        kind: 'collection',
                        sceneId: activeContextScene.id,
                        id: activeContextCollection.id,
                      });
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Renombrar colección</span>
                  </button>
                  <button
                    type="button"
                    disabled={activeContextScene.collections.length <= 1}
                    onClick={() => {
                      setContextMenu(null);
                      requestDeleteCollection(
                        activeContextScene,
                        activeContextCollection,
                      );
                    }}
                    className="w-full h-9 px-3 hover:bg-[#352024] text-[#f87171] disabled:opacity-35 disabled:pointer-events-none flex items-center gap-2 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar colección</span>
                  </button>
                </>
              )}

            {contextMenu.kind === 'object' &&
              activeContextScene &&
              activeContextObject && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[#9ca3af] border-b border-[#2b2f3a] truncate">
                    Objeto: {activeContextObject.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(activeContextObject.name);
                      setRenaming({
                        kind: 'object',
                        id: activeContextObject.id,
                      });
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Renombrar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicateObject(activeContextObject.id);
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicar</span>
                  </button>
                  {activeContextObject.objectType === 'mesh' && (
                    <>
                      <div className="my-1 border-t border-[#2b2f3a]" />
                      <button
                        type="button"
                        onClick={() => {
                          onSetObjectShading(activeContextObject.id, 'smooth');
                          setContextMenu(null);
                        }}
                        className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center justify-between gap-2 text-left"
                      >
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-[#5ecd6e]" />
                          <span>Shade Smooth</span>
                        </span>
                        {(activeContextObject.shading ?? 'flat') === 'smooth' && (
                          <Check className="w-3.5 h-3.5 text-[#5ecd6e]" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetObjectShading(activeContextObject.id, 'flat');
                          setContextMenu(null);
                        }}
                        className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center justify-between gap-2 text-left"
                      >
                        <span className="flex items-center gap-2">
                          <Box className="w-3.5 h-3.5 text-[#9ca3af]" />
                          <span>Shade Flat</span>
                        </span>
                        {(activeContextObject.shading ?? 'flat') === 'flat' && (
                          <Check className="w-3.5 h-3.5 text-[#5ecd6e]" />
                        )}
                      </button>
                      <div className="my-1 border-t border-[#2b2f3a]" />
                    </>
                  )}
                  {activeContextScene.collections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMovePickerFor({
                          sceneId: activeContextScene.id,
                          objectId: activeContextObject.id,
                        });
                        setContextMenu(null);
                      }}
                      className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5 text-[#5ecd6e]" />
                      <span>Mover a colección...</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onToggleVisibility(activeContextObject.id);
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    {activeContextObject.visible ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {activeContextObject.visible ? 'Ocultar' : 'Mostrar'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleLock(activeContextObject.id);
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#2a2f3a] flex items-center gap-2 text-left"
                  >
                    {activeContextObject.locked ? (
                      <Unlock className="w-3.5 h-3.5 text-[#5ecd6e]" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {activeContextObject.locked
                        ? 'Desbloquear selección'
                        : 'Bloquear selección'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={activeContextObject.locked}
                    onClick={() => {
                      onDeleteObject(activeContextObject.id);
                      setContextMenu(null);
                    }}
                    className="w-full h-9 px-3 hover:bg-[#352024] text-[#f87171] disabled:opacity-35 disabled:pointer-events-none flex items-center gap-2 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                </>
              )}
          </div>
        </div>
      )}

      {/* Move Object to Collection Modal (accessible touch fallback alongside drag) */}
      {movePickerFor &&
        (() => {
          const targetScene = scenes.find((s) => s.id === movePickerFor.sceneId);
          const targetObj = targetScene?.objects.find(
            (o) => o.id === movePickerFor.objectId,
          );
          if (!targetScene || !targetObj) return null;
          return (
            <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
              <div className="w-full max-w-sm bg-[#1c1e24] border border-[#323640] rounded-xl shadow-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#2b2e36] flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#f3f4f6] truncate">
                    Mover «{targetObj.name}» a colección
                  </h3>
                  <button
                    type="button"
                    onClick={() => setMovePickerFor(null)}
                    className="w-8 h-8 rounded hover:bg-[#2a2e38] text-[#9ca3af] hover:text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto cad-scroll">
                  {targetScene.collections.map((col) => {
                    const isCurrent = col.id === targetObj.collectionId;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => {
                          onMoveObjectToCollection(
                            targetScene.id,
                            targetObj.id,
                            col.id,
                          );
                          setMovePickerFor(null);
                        }}
                        className={`w-full h-10 px-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors ${
                          isCurrent
                            ? 'bg-[#252933] border-[#5ecd6e]/45 text-[#9ca3af]'
                            : 'bg-[#15171c] hover:bg-[#232732] border-[#2e3340] text-[#e5e7eb]'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Folder className="w-3.5 h-3.5 text-[#5ecd6e]" />
                          <span className="truncate">{col.name}</span>
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] text-[#5ecd6e]">
                            Actual
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

      {/* Delete Non-Empty Collection Resolution Modal */}
      {deletePrompt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1c1e24] border border-[#343844] rounded-xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2b2e36] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#f3f4f6]">
                Eliminar colección «{deletePrompt.collection.name}»
              </h3>
              <button
                type="button"
                onClick={() => setDeletePrompt(null)}
                className="w-8 h-8 rounded hover:bg-[#2a2e38] text-[#9ca3af] hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-xs text-[#cbd5e1] leading-relaxed">
                Esta colección contiene{' '}
                <strong className="text-[#5ecd6e]">
                  {deletePrompt.objectCount}{' '}
                  {deletePrompt.objectCount === 1 ? 'objeto' : 'objetos'}
                </strong>
                . ¿Qué deseas hacer con ellos?
              </p>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-[#9ca3af]">
                  Mover objetos a otra colección:
                </label>
                <select
                  value={deleteTargetColId}
                  onChange={(e) => setDeleteTargetColId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#121419] border border-[#2f333d] text-xs text-[#f3f4f6] outline-none focus:border-[#5ecd6e]"
                >
                  {deletePrompt.otherCollections.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  disabled={!deleteTargetColId}
                  onClick={() => {
                    onDeleteCollection(
                      deletePrompt.sceneId,
                      deletePrompt.collection.id,
                      {
                        mode: 'move_objects',
                        targetCollectionId: deleteTargetColId,
                      },
                    );
                    setDeletePrompt(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg bg-[#49b459] hover:bg-[#5ecd6e] text-[#111215] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Mover objetos y eliminar colección</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDeleteCollection(
                      deletePrompt.sceneId,
                      deletePrompt.collection.id,
                      { mode: 'delete_objects' },
                    );
                    setDeletePrompt(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg bg-[#2a1a1d] hover:bg-[#3a2226] border border-[#593036] text-[#f87171] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar colección y sus objetos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeletePrompt(null)}
                  className="w-full h-9 px-3 rounded-lg bg-[#23262e] hover:bg-[#2c303a] text-xs font-medium text-[#cbd5e1]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </aside>
  );
};
