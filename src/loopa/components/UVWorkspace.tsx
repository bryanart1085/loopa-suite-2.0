/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Crosshair,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Maximize2,
  Move,
  RotateCw,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { loadReferenceImageFile } from '../core/io/imageReference';
import { EditableMesh, Vec2 } from '../core/mesh/EditableMesh';
import { EditSelectionSubMode } from '../core/mesh/loopSelect';
import { EditSelectionMode } from '../core/mesh/operations';
import {
  MaterialAsset,
  ObjectShadingMode,
  ObjectTransform,
  TouchModifierKey,
  TouchModifierState,
  WorkMode,
} from '../core/project/types';
import { EMPTY_MODIFIER_STATE } from '../engine/TouchGestureManager';
import {
  UVPivotMode,
  UVProjectionType,
  UVSelectMode,
  UVSelectionState,
  UVTransformTool,
} from '../core/uv/types';
import {
  computeUVPivotPoint,
  createEmptyUVSelection,
  deselectAllUV,
  getUVSelectionBounds,
  getUVSelectionCount,
  invertUVSelection,
  mirrorUVSelection,
  rotateUVSelection,
  scaleUVSelection,
  selectAllUV,
  sync3DSelectionFromUV,
  syncUVSelectionFrom3D,
  translateUVSelection,
  weldSelectedUVVertices,
} from '../core/uv/uvOperations';
import {
  applyCylindricalProjection,
  applyPlanarProjection,
  applySphericalProjection,
  executeUnwrap,
  extractUVIslands,
  packUVIslands,
} from '../core/uv/uvUnwrap';
import { UVEditorCanvas, UVEditorCanvasHandle } from './UVEditorCanvas';
import { UVSync3DViewport, UVSync3DViewportHandle } from './UVSync3DViewport';
import { UVToolToolbar } from './UVToolToolbar';

const DEFAULT_UV_SPLIT_RATIO = 0.62;
const UV_SPLIT_STORAGE_KEY = 'loopa.uv.viewportSplitRatio';

function readUVSplitRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_UV_SPLIT_RATIO;
  try {
    const stored = Number(window.localStorage.getItem(UV_SPLIT_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0.1 && stored < 0.9
      ? stored
      : DEFAULT_UV_SPLIT_RATIO;
  } catch (error) {
    console.warn('No se pudo leer la proporción de los visores UV.', error);
    return DEFAULT_UV_SPLIT_RATIO;
  }
}

export interface UVQuickAccessState {
  hasMesh: boolean;
  selectionMode: UVSelectMode;
  transformTool: UVTransformTool;
  boxSelectActive: boolean;
  showChecker: boolean;
  selectedCount: number;
  canSyncTo3D: boolean;
}

export interface UVWorkspaceHandle {
  unwrap: (type: UVProjectionType) => void;
  pack: () => void;
  setSelectionMode: (mode: UVSelectMode) => void;
  setTransformTool: (tool: UVTransformTool) => void;
  toggleBoxSelect: () => void;
  selectAll: () => void;
  deselectAll: () => void;
  invertSelection: () => void;
  toggleChecker: () => void;
  syncFrom3D: () => void;
  syncTo3D: () => void;
}

interface UVWorkspaceProps {
  toolbarVisible: boolean;
  workMode: WorkMode;
  objectId?: string | null;
  objectName?: string | null;
  objectTransform?: ObjectTransform;
  materialAsset?: MaterialAsset | null;
  onUpdateMaterial?: (materialId: string, patch: Partial<Omit<MaterialAsset, 'id'>>) => void;
  shading?: ObjectShadingMode;
  mesh: EditableMesh | null;
  meshRevision?: number;
  selection3DMode?: EditSelectionMode;
  selected3DComponentIds?: Set<string>;
  onSync3DSelection?: (mode: EditSelectionMode, ids: Set<string>, silent?: boolean) => void;
  onCommitMesh?: (beforeMesh: EditableMesh, afterMesh: EditableMesh) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onReturnToModeler?: () => void;
  onQuickStateChange?: (state: UVQuickAccessState) => void;
}

export const UVWorkspace = forwardRef<UVWorkspaceHandle, UVWorkspaceProps>(
  (
    {
      toolbarVisible,
      workMode,
      objectId,
      objectName,
      objectTransform,
      materialAsset,
      onUpdateMaterial,
      shading = 'flat',
      mesh,
      meshRevision = 0,
      selection3DMode = 'face',
      selected3DComponentIds,
      onSync3DSelection,
      onCommitMesh,
      onUndo,
      onRedo,
      onReturnToModeler,
      onQuickStateChange,
    },
    ref,
  ) => {
    const [previewMesh, setPreviewMesh] = useState<EditableMesh | null>(mesh);
    const [selection, setSelection] = useState<UVSelectionState>(() =>
      createEmptyUVSelection('vertex'),
    );
    const [uvSubMode, setUvSubMode] = useState<EditSelectionSubMode>('single');
    const [uvScreenModifiers, setUvScreenModifiers] =
      useState<TouchModifierState>(EMPTY_MODIFIER_STATE);
    const [uvToast, setUvToast] = useState<string | null>(null);
    const uvToastTimerRef = useRef<number | null>(null);
    const textureInputRef = useRef<HTMLInputElement | null>(null);
    const uvCanvasRef = useRef<UVEditorCanvasHandle | null>(null);
    const sync3DViewportRef = useRef<UVSync3DViewportHandle | null>(null);
    const [zoomPercent, setZoomPercent] = useState(100);
    const [transformTool, setTransformTool] = useState<UVTransformTool>('move');
    const [pivotMode, setPivotMode] = useState<UVPivotMode>('center');
    const [cursorUV, setCursorUV] = useState<Vec2>([0.5, 0.5]);
    const [placeCursorMode, setPlaceCursorMode] = useState(false);
    const [showChecker, setShowChecker] = useState(false);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [keepConnected, setKeepConnected] = useState(true);
    const [boxSelectActive, setBoxSelectActive] = useState(false);
    const [uvSplitRatio, setUvSplitRatio] = useState(readUVSplitRatio);
    const [splitOrientation, setSplitOrientation] = useState<'horizontal' | 'vertical'>(() =>
      typeof window !== 'undefined' && window.innerWidth >= 768 ? 'horizontal' : 'vertical',
    );
    const viewportSplitRef = useRef<HTMLDivElement | null>(null);
    const splitDragRef = useRef<{
      pointerId: number;
      orientation: 'horizontal' | 'vertical';
    } | null>(null);

    // Numeric transform inputs
    const [moveUInput, setMoveUInput] = useState('0.00');
    const [moveVInput, setMoveVInput] = useState('0.00');
    const [rotateDegInput, setRotateDegInput] = useState('45');
    const [scaleXInput, setScaleXInput] = useState('1.00');
    const [scaleYInput, setScaleYInput] = useState('1.00');
    const [scaleUniform, setScaleUniform] = useState(true);

    const showUvToast = (msg: string) => {
      setUvToast(msg);
      if (uvToastTimerRef.current !== null) {
        window.clearTimeout(uvToastTimerRef.current);
      }
      uvToastTimerRef.current = window.setTimeout(() => {
        setUvToast(null);
        uvToastTimerRef.current = null;
      }, 2200);
    };

    const handleImportTexture = () => {
      if (!materialAsset || !onUpdateMaterial) {
        showUvToast('Selecciona una malla con material para importar una textura');
        return;
      }
      textureInputRef.current?.click();
    };

    const handleTextureFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      if (!materialAsset || !onUpdateMaterial) {
        showUvToast('No hay un material activo para esta imagen');
        return;
      }

      try {
        const image = await loadReferenceImageFile(file);
        onUpdateMaterial(materialAsset.id, {
          textureName: image.fileName,
          textureDataUrl: image.imageDataUrl,
        });
        showUvToast(`Textura "${image.fileName}" aplicada al material`);
      } catch (error) {
        showUvToast(error instanceof Error ? error.message : 'No se pudo importar la imagen');
      }
    };

    useEffect(() => {
      return () => {
        if (uvToastTimerRef.current !== null) {
          window.clearTimeout(uvToastTimerRef.current);
        }
      };
    }, []);

    // Sync local preview mesh whenever committed store mesh updates
    useEffect(() => {
      setPreviewMesh(mesh);
    }, [mesh, meshRevision, objectId]);

    // Initial / on-object-change 3D -> UV selection synchronization
    useEffect(() => {
      if (!mesh) {
        setSelection(createEmptyUVSelection('vertex'));
        return;
      }
      if (selected3DComponentIds && selected3DComponentIds.size > 0) {
        setSelection(syncUVSelectionFrom3D(mesh, selection3DMode, selected3DComponentIds));
      } else {
        setSelection(createEmptyUVSelection('vertex'));
      }
      // Intentionally sync automatically when changing target object
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectId]);

    const activeMesh = previewMesh ?? mesh;
    const isEditingMode = workMode === 'edit';
    const islands = useMemo(() => (activeMesh ? extractUVIslands(activeMesh) : []), [activeMesh]);
    const selectionBounds = useMemo(
      () =>
        activeMesh
          ? getUVSelectionBounds(activeMesh, selection, islands)
          : {
              count: 0,
              center: [0.5, 0.5] as Vec2,
              min: [0.5, 0.5] as Vec2,
              max: [0.5, 0.5] as Vec2,
            },
      [activeMesh, selection, islands],
    );
    const selectedCount = getUVSelectionCount(selection);
    const canWeldUV = selectionBounds.count >= 2;

    const commitWithMutation = (mutator: (draft: EditableMesh) => void) => {
      if (!isEditingMode || !activeMesh) return;
      const before = activeMesh.clone();
      const after = activeMesh.clone();
      mutator(after);
      setPreviewMesh(after);
      onCommitMesh?.(before, after);
    };

    const handleUnwrap = (type: UVProjectionType) => {
      commitWithMutation((cloned) => {
        if (type === 'unwrap' || type === 'view') {
          executeUnwrap(cloned);
        } else if (type === 'planar') {
          applyPlanarProjection(cloned, undefined, 'z');
        } else if (type === 'cylindrical') {
          applyCylindricalProjection(cloned);
        } else if (type === 'spherical') {
          applySphericalProjection(cloned);
        }
      });
    };

    const handlePack = () => {
      commitWithMutation((cloned) => {
        packUVIslands(cloned, { margin: 0.025, rotate: true, scale: true });
      });
    };

    const handleSelectionChange = (next: UVSelectionState) => {
      if (!isEditingMode) return;
      setSelection(next);
      if (activeMesh && onSync3DSelection) {
        const synced = sync3DSelectionFromUV(activeMesh, next, islands);
        onSync3DSelection(synced.mode, synced.ids, true);
      }
    };

    const handleToggleScreenModifier = (key: TouchModifierKey) => {
      setUvScreenModifiers((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    };

    const handleWeldUVVertices = () => {
      if (!activeMesh || !canWeldUV) return;
      let weldedCount = 0;
      commitWithMutation((draft) => {
        const res = weldSelectedUVVertices(draft, selection, islands);
        weldedCount = res.weldedCount;
      });
      if (weldedCount >= 2) {
        showUvToast(`Unidos ${weldedCount} vértices UV (solo UVs)`);
      } else {
        showUvToast('Selecciona al menos 2 vértices UV para unir');
      }
    };

    const handlePick3DFromSyncViewport = (
      pickedMode: EditSelectionMode,
      componentId: string,
      additive: boolean,
    ) => {
      if (!isEditingMode || !activeMesh) return;
      const isAdditive = additive || multiSelectMode || uvScreenModifiers.shift;
      const mapped = syncUVSelectionFrom3D(
        activeMesh,
        pickedMode,
        new Set([componentId]),
        selection.mode,
        islands,
      );

      let next: UVSelectionState;
      if (!isAdditive) {
        next = mapped;
      } else if (selection.mode === 'vertex') {
        const s = new Set(selection.selectedVertexKeys);
        const arr = Array.from(mapped.selectedVertexKeys);
        const allPresent = arr.length > 0 && arr.every((k) => s.has(k));
        for (const k of arr) {
          if (allPresent) s.delete(k);
          else s.add(k);
        }
        next = { ...selection, selectedVertexKeys: s };
      } else if (selection.mode === 'edge') {
        const s = new Set(selection.selectedEdgeKeys);
        const arr = Array.from(mapped.selectedEdgeKeys);
        const allPresent = arr.length > 0 && arr.every((k) => s.has(k));
        for (const k of arr) {
          if (allPresent) s.delete(k);
          else s.add(k);
        }
        next = { ...selection, selectedEdgeKeys: s };
      } else if (selection.mode === 'face') {
        const s = new Set(selection.selectedFaceIds);
        const arr = Array.from(mapped.selectedFaceIds);
        const allPresent = arr.length > 0 && arr.every((k) => s.has(k));
        for (const k of arr) {
          if (allPresent) s.delete(k);
          else s.add(k);
        }
        next = { ...selection, selectedFaceIds: s };
      } else {
        const s = new Set(selection.selectedIslandIds);
        const arr = Array.from(mapped.selectedIslandIds);
        const allPresent = arr.length > 0 && arr.every((k) => s.has(k));
        for (const k of arr) {
          if (allPresent) s.delete(k);
          else s.add(k);
        }
        next = { ...selection, selectedIslandIds: s };
      }
      handleSelectionChange(next);
    };

    const handleSyncFrom3D = () => {
      if (!isEditingMode || !activeMesh) return;
      if (!selected3DComponentIds || selected3DComponentIds.size === 0) {
        setSelection((prev) => deselectAllUV(prev));
        return;
      }
      setSelection(
        syncUVSelectionFrom3D(
          activeMesh,
          selection3DMode,
          selected3DComponentIds,
          selection.mode,
          islands,
        ),
      );
    };

    const handleSelectUVMode = (mode: UVSelectMode) => {
      if (!isEditingMode) return;
      setSelection((prev) => {
        const next = { ...prev, mode };
        if (activeMesh && onSync3DSelection) {
          const synced = sync3DSelectionFromUV(activeMesh, next, islands);
          onSync3DSelection(synced.mode, synced.ids, true);
        }
        return next;
      });
    };

    const handleSelectTransformTool = (tool: UVTransformTool) => {
      setBoxSelectActive(false);
      setTransformTool(tool);
    };

    const actionsRef = useRef<UVWorkspaceHandle | null>(null);
    actionsRef.current = {
      unwrap: handleUnwrap,
      pack: handlePack,
      setSelectionMode: (mode) =>
        setSelection((prev) => (isEditingMode ? { ...prev, mode } : prev)),
      setTransformTool: (tool) => {
        setBoxSelectActive(false);
        setTransformTool(tool);
      },
      toggleBoxSelect: () => setBoxSelectActive((prev) => !prev),
      selectAll: () => {
        if (activeMesh) {
          handleSelectionChange(selectAllUV(activeMesh, selection, islands));
        }
      },
      deselectAll: () => handleSelectionChange(deselectAllUV(selection)),
      invertSelection: () => {
        if (activeMesh) {
          handleSelectionChange(invertUVSelection(activeMesh, selection, islands));
        }
      },
      toggleChecker: () => setShowChecker((prev) => !prev),
      syncFrom3D: () => handleSyncFrom3D(),
      syncTo3D: () => {
        if (!isEditingMode || !activeMesh || !onSync3DSelection) return;
        const synced = sync3DSelectionFromUV(activeMesh, selection, islands);
        onSync3DSelection(synced.mode, synced.ids);
      },
    };

    useImperativeHandle(
      ref,
      () => ({
        unwrap: (type) => actionsRef.current?.unwrap(type),
        pack: () => actionsRef.current?.pack(),
        setSelectionMode: (mode) => actionsRef.current?.setSelectionMode(mode),
        setTransformTool: (tool) => actionsRef.current?.setTransformTool(tool),
        toggleBoxSelect: () => actionsRef.current?.toggleBoxSelect(),
        selectAll: () => actionsRef.current?.selectAll(),
        deselectAll: () => actionsRef.current?.deselectAll(),
        invertSelection: () => actionsRef.current?.invertSelection(),
        toggleChecker: () => actionsRef.current?.toggleChecker(),
        syncFrom3D: () => actionsRef.current?.syncFrom3D(),
        syncTo3D: () => actionsRef.current?.syncTo3D(),
      }),
      [],
    );

    useEffect(() => {
      onQuickStateChange?.({
        hasMesh: Boolean(activeMesh),
        selectionMode: selection.mode,
        transformTool,
        boxSelectActive,
        showChecker,
        selectedCount,
        canSyncTo3D: Boolean(activeMesh && onSync3DSelection),
      });
    }, [
      activeMesh,
      boxSelectActive,
      onQuickStateChange,
      onSync3DSelection,
      selectedCount,
      selection.mode,
      showChecker,
      transformTool,
    ]);

    const handleSyncTo3D = () => {
      if (!isEditingMode || !activeMesh || !onSync3DSelection) return;
      const synced = sync3DSelectionFromUV(activeMesh, selection, islands);
      onSync3DSelection(synced.mode, synced.ids);
    };

    const handleApplyNumericMove = () => {
      if (selectionBounds.count === 0) return;
      const du = parseFloat(moveUInput);
      const dv = parseFloat(moveVInput);
      if (!Number.isFinite(du) && !Number.isFinite(dv)) return;
      commitWithMutation((draft) => {
        translateUVSelection(
          draft,
          selection,
          Number.isFinite(du) ? du : 0,
          Number.isFinite(dv) ? dv : 0,
          islands,
        );
      });
    };

    const handleApplyRotate = (degOverride?: number) => {
      if (selectionBounds.count === 0 || !activeMesh) return;
      const deg = degOverride ?? parseFloat(rotateDegInput);
      if (!Number.isFinite(deg) || deg === 0) return;
      const rad = (deg * Math.PI) / 180;
      const pivot = computeUVPivotPoint(activeMesh, selection, pivotMode, cursorUV, islands);
      commitWithMutation((draft) => {
        rotateUVSelection(draft, selection, rad, pivot, { pivotMode, islands });
      });
    };

    const handleApplyScale = () => {
      if (selectionBounds.count === 0 || !activeMesh) return;
      const rawX = parseFloat(scaleXInput);
      const rawY = scaleUniform ? rawX : parseFloat(scaleYInput);
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;
      const pivot = computeUVPivotPoint(activeMesh, selection, pivotMode, cursorUV, islands);
      commitWithMutation((draft) => {
        scaleUVSelection(draft, selection, rawX, rawY, pivot, { pivotMode, islands });
      });
    };

    const handleMirror = (horizontal: boolean, vertical: boolean) => {
      if (selectionBounds.count === 0 || !activeMesh) return;
      const pivot = computeUVPivotPoint(activeMesh, selection, pivotMode, cursorUV, islands);
      commitWithMutation((draft) => {
        mirrorUVSelection(draft, selection, horizontal, vertical, pivot, {
          pivotMode,
          islands,
        });
      });
    };

    useEffect(() => {
      try {
        window.localStorage.setItem(UV_SPLIT_STORAGE_KEY, String(uvSplitRatio));
      } catch (error) {
        console.warn('No se pudo guardar la proporción de los visores UV.', error);
      }
    }, [uvSplitRatio]);

    useEffect(() => {
      const updateOrientation = () =>
        setSplitOrientation(window.innerWidth >= 768 ? 'horizontal' : 'vertical');
      window.addEventListener('resize', updateOrientation);
      return () => window.removeEventListener('resize', updateOrientation);
    }, []);

    const handleSplitPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      const container = viewportSplitRef.current;
      if (!container || !event.isPrimary) return;
      splitDragRef.current = {
        pointerId: event.pointerId,
        orientation: splitOrientation,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const handleSplitPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = splitDragRef.current;
      const container = viewportSplitRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !container) return;
      const bounds = container.getBoundingClientRect();
      const size = drag.orientation === 'horizontal' ? bounds.width : bounds.height;
      if (size <= 0) return;
      const position =
        drag.orientation === 'horizontal'
          ? event.clientX - bounds.left
          : event.clientY - bounds.top;
      const minRatio = getSplitMinRatio(size);
      setUvSplitRatio(Math.max(minRatio, Math.min(1 - minRatio, position / size)));
    };

    const getSplitMinRatio = (size?: number) => {
      const bounds = viewportSplitRef.current?.getBoundingClientRect();
      const axisSize =
        size ?? (splitOrientation === 'horizontal' ? bounds?.width : bounds?.height) ?? 0;
      return axisSize > 0 ? Math.min(0.45, Math.max(0.2, 190 / axisSize)) : 0.2;
    };

    const handleSplitPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      if (splitDragRef.current?.pointerId !== event.pointerId) return;
      splitDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    };

    const handleSplitKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const decrementKey = splitOrientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const incrementKey = splitOrientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
      if (event.key !== decrementKey && event.key !== incrementKey) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.05 : 0.02;
      const delta = event.key === decrementKey ? -step : step;
      const minRatio = getSplitMinRatio();
      setUvSplitRatio((ratio) => Math.max(minRatio, Math.min(1 - minRatio, ratio + delta)));
    };

    const splitMinPercent = Math.round(getSplitMinRatio() * 100);

    if (!activeMesh) {
      return (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-[#14161b] text-[#e4e6eb] p-6 text-center gap-3">
          <Scissors className="w-9 h-9 text-[#5ecd6e]" />
          <h2 className="text-sm font-bold text-[#f3f4f6]">Ningún objeto de malla seleccionado</h2>
          <p className="text-xs text-[#9ca3af] max-w-sm">
            Selecciona un objeto de malla en Layout para editar sus coordenadas e islas UV.
          </p>
          {onReturnToModeler && (
            <button
              type="button"
              onClick={onReturnToModeler}
              className="h-9 px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#4dbb5e] text-xs font-semibold text-[#121418]"
            >
              Volver a Layout
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        id="uv-workspace-toolbar"
        data-testid="uv-workspace"
        className="flex-1 min-h-0 flex flex-col bg-[#18191c] text-[#e4e6eb] overflow-hidden"
      >
        <input
          ref={textureInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          className="hidden"
          aria-label="Importar imagen de textura"
          onChange={handleTextureFileChange}
        />

        {/* Workspace: vertical tools and two synchronized viewports */}
        <div className="relative flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {toolbarVisible && (
            <aside
              inert={!isEditingMode}
              aria-disabled={!isEditingMode}
              aria-label="Herramientas UV y ajustes"
              className={`w-full md:w-60 lg:w-64 min-h-0 shrink-0 bg-[#16181d] border-b md:border-b-0 md:border-r border-[#2b2e36] p-3 flex flex-col gap-3 overflow-y-auto cad-scroll max-h-[30vh] md:max-h-none ${
                !isEditingMode ? 'opacity-55' : ''
              }`}
            >
              <div
                inert={!isEditingMode}
                aria-disabled={!isEditingMode}
                className={!isEditingMode ? 'opacity-55' : ''}
              >
                <UVToolToolbar
                  objectName={objectName}
                  multiSelectMode={multiSelectMode}
                  keepConnected={keepConnected}
                  showChecker={showChecker}
                  textureName={materialAsset?.textureName}
                  selectionMode={selection.mode}
                  uvSubMode={uvSubMode}
                  screenModifiers={uvScreenModifiers}
                  transformTool={transformTool}
                  boxSelectActive={boxSelectActive}
                  zoomPercent={zoomPercent}
                  onImportTexture={
                    materialAsset && onUpdateMaterial ? handleImportTexture : undefined
                  }
                  canWeldUV={canWeldUV}
                  onUnwrap={handleUnwrap}
                  onPackIslands={handlePack}
                  onToggleChecker={() => setShowChecker((prev) => !prev)}
                  onToggleMultiSelect={() => setMultiSelectMode((prev) => !prev)}
                  onToggleKeepConnected={() => setKeepConnected((prev) => !prev)}
                  onSelectAll={() =>
                    handleSelectionChange(selectAllUV(activeMesh, selection, islands))
                  }
                  onDeselectAll={() => handleSelectionChange(deselectAllUV(selection))}
                  onInvertSelection={() =>
                    handleSelectionChange(invertUVSelection(activeMesh, selection, islands))
                  }
                  onSelectModeChange={handleSelectUVMode}
                  onUvSubModeChange={setUvSubMode}
                  onToggleScreenModifier={handleToggleScreenModifier}
                  onTransformToolChange={handleSelectTransformTool}
                  onToggleBoxSelect={() => setBoxSelectActive((prev) => !prev)}
                  onFit01={() => uvCanvasRef.current?.fit01()}
                  onFrameAll={() => uvCanvasRef.current?.frameAll()}
                  onResetUVView={() => uvCanvasRef.current?.resetView()}
                  onZoomIn={() => uvCanvasRef.current?.zoomIn()}
                  onZoomOut={() => uvCanvasRef.current?.zoomOut()}
                  onReset3DView={() => sync3DViewportRef.current?.resetCamera()}
                  onWeldUVVertices={handleWeldUVVertices}
                  onSyncFrom3D={handleSyncFrom3D}
                  onSyncTo3D={onSync3DSelection ? handleSyncTo3D : undefined}
                />
              </div>

              {/* Pivot Configuration */}
              <div className="rounded-lg bg-[#1c1f26] border border-[#2b2e36] p-2.5 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                  Pivote de transformación 2D
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'center', label: 'Centro' },
                      { id: 'cursor', label: 'Cursor 2D' },
                      { id: 'individual', label: 'Indiv.' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-testid={`uv-pivot-${p.id}`}
                      onClick={() => {
                        setPivotMode(p.id);
                        if (p.id !== 'cursor') setPlaceCursorMode(false);
                      }}
                      className={`h-7 rounded text-[11px] font-semibold transition-colors ${
                        pivotMode === p.id
                          ? 'bg-[#5ecd6e] text-[#111215]'
                          : 'bg-[#22252d] hover:bg-[#2c313b] text-[#cbd5e1]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {pivotMode === 'cursor' && (
                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setPlaceCursorMode((prev) => !prev)}
                      className={`w-full h-7 rounded border text-[11px] font-semibold flex items-center justify-center gap-1.5 ${
                        placeCursorMode
                          ? 'bg-[#112738] border-[#38bdf8] text-[#7dd3fc]'
                          : 'bg-[#22252d] border-[#323640] text-[#cbd5e1]'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>
                        {placeCursorMode ? 'Toca en el visor UV...' : 'Situar cursor con toque'}
                      </span>
                    </button>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <label className="flex items-center gap-1 bg-[#121418] border border-[#2b2e36] rounded px-1.5 h-7">
                        <span className="text-[#8e95a2]">U</span>
                        <input
                          type="number"
                          step={0.05}
                          value={cursorUV[0]}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) setCursorUV([v, cursorUV[1]]);
                          }}
                          className="w-full bg-transparent text-right font-mono-tabular text-[#e4e6eb] outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-1 bg-[#121418] border border-[#2b2e36] rounded px-1.5 h-7">
                        <span className="text-[#8e95a2]">V</span>
                        <input
                          type="number"
                          step={0.05}
                          value={cursorUV[1]}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) setCursorUV([cursorUV[0], v]);
                          }}
                          className="w-full bg-transparent text-right font-mono-tabular text-[#e4e6eb] outline-none"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Numeric 2D Move */}
              <div className="rounded-lg bg-[#1c1f26] border border-[#2b2e36] p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                  <Move className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Mover UV (ΔU, ΔV)</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <label className="flex items-center gap-1 bg-[#121418] border border-[#2b2e36] rounded px-1.5 h-7">
                    <span className="text-[#ef4444] font-bold">X</span>
                    <input
                      type="number"
                      step={0.05}
                      data-testid="uv-move-u-input"
                      value={moveUInput}
                      onChange={(e) => setMoveUInput(e.target.value)}
                      className="w-full bg-transparent text-right font-mono-tabular text-[#e4e6eb] outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1 bg-[#121418] border border-[#2b2e36] rounded px-1.5 h-7">
                    <span className="text-[#3b82f6] font-bold">Y</span>
                    <input
                      type="number"
                      step={0.05}
                      data-testid="uv-move-v-input"
                      value={moveVInput}
                      onChange={(e) => setMoveVInput(e.target.value)}
                      className="w-full bg-transparent text-right font-mono-tabular text-[#e4e6eb] outline-none"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  data-testid="uv-apply-move"
                  disabled={selectionBounds.count === 0}
                  onClick={handleApplyNumericMove}
                  className="w-full h-7 rounded bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] text-[11px] font-semibold text-[#e4e6eb]"
                >
                  Aplicar desplazamiento
                </button>
              </div>

              {/* Numeric 2D Rotate (Degrees) */}
              <div className="rounded-lg bg-[#1c1f26] border border-[#2b2e36] p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                  <RotateCw className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Rotar 2D (Grados °)</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <input
                    type="number"
                    step={15}
                    data-testid="uv-rotate-deg-input"
                    value={rotateDegInput}
                    onChange={(e) => setRotateDegInput(e.target.value)}
                    className="flex-1 min-w-0 h-7 px-2 rounded bg-[#121418] border border-[#2b2e36] font-mono-tabular text-[#e4e6eb] outline-none text-right"
                  />
                  <button
                    type="button"
                    data-testid="uv-apply-rotate"
                    disabled={selectionBounds.count === 0}
                    onClick={() => handleApplyRotate()}
                    className="h-7 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] font-semibold text-[#e4e6eb]"
                  >
                    Rotar
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[-90, -45, 45, 90].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      disabled={selectionBounds.count === 0}
                      onClick={() => handleApplyRotate(deg)}
                      className="h-7 rounded bg-[#20232b] hover:bg-[#2a2f3a] disabled:opacity-40 border border-[#2e3340] text-[10px] font-mono-tabular font-semibold text-[#cbd5e1]"
                    >
                      {deg > 0 ? `+${deg}°` : `${deg}°`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Numeric 2D Scale + Mirror */}
              <div className="rounded-lg bg-[#1c1f26] border border-[#2b2e36] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
                    <Maximize2 className="w-3.5 h-3.5 text-[#a78bfa]" />
                    <span>Escalar 2D</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setScaleUniform((u) => !u)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      scaleUniform ? 'bg-[#2a2140] text-[#c4b5fd]' : 'bg-[#22252d] text-[#9ca3af]'
                    }`}
                  >
                    {scaleUniform ? 'Uniforme' : 'Libre X/Y'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <label className="flex items-center gap-1 bg-[#121418] border border-[#2b2e36] rounded px-1.5 h-7">
                    <span className="text-[#ef4444] font-bold">X</span>
                    <input
                      type="number"
                      step={0.1}
                      data-testid="uv-scale-x-input"
                      value={scaleXInput}
                      onChange={(e) => {
                        setScaleXInput(e.target.value);
                        if (scaleUniform) setScaleYInput(e.target.value);
                      }}
                      className="w-full bg-transparent text-right font-mono-tabular text-[#e4e6eb] outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1 bg-[#121418] border border-[#2b2e36] rounded px-1.5 h-7">
                    <span className="text-[#3b82f6] font-bold">Y</span>
                    <input
                      type="number"
                      step={0.1}
                      data-testid="uv-scale-y-input"
                      disabled={scaleUniform}
                      value={scaleUniform ? scaleXInput : scaleYInput}
                      onChange={(e) => setScaleYInput(e.target.value)}
                      className="w-full bg-transparent text-right font-mono-tabular text-[#e4e6eb] outline-none disabled:opacity-50"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="uv-apply-scale"
                    disabled={selectionBounds.count === 0}
                    onClick={handleApplyScale}
                    className="flex-1 h-7 rounded bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] text-[11px] font-semibold text-[#e4e6eb]"
                  >
                    Escalar
                  </button>
                  <button
                    type="button"
                    disabled={selectionBounds.count === 0}
                    onClick={() => handleMirror(true, false)}
                    title="Voltear horizontal (U)"
                    className="w-8 h-7 rounded bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] flex items-center justify-center text-[#cbd5e1]"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={selectionBounds.count === 0}
                    onClick={() => handleMirror(false, true)}
                    title="Voltear vertical (V)"
                    className="w-8 h-7 rounded bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] flex items-center justify-center text-[#cbd5e1]"
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Additional actions and suite handoff */}
              <div className="mt-auto pt-2 border-t border-[#272b34] space-y-1.5">
                <button type="button" onClick={() => handleUnwrap('unwrap')} className="hidden">
                  <Sparkles className="w-3.5 h-3.5 text-[#5ecd6e]" />
                  <span>Desenvolver (Unwrap)</span>
                </button>
                <button type="button" onClick={handlePack} className="hidden">
                  <Layers className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span>Empaquetar Islas</span>
                </button>
                {onReturnToModeler && (
                  <button
                    type="button"
                    onClick={onReturnToModeler}
                    className="w-full h-9 rounded-lg bg-[#5ecd6e] hover:bg-[#4dbb5e] text-xs font-semibold text-[#121418] flex items-center justify-center gap-2 transition-colors"
                  >
                    Volver a Layout 3D
                  </button>
                )}
              </div>
            </aside>
          )}

          {/* Dual Synchronized Viewports: Visor 1 (UV 2D) + Visor 2 (Modelo 3D) */}
          <div
            ref={viewportSplitRef}
            className="flex-1 min-w-0 min-h-0 flex flex-col md:flex-row overflow-hidden"
          >
            {/* Visor 1: Editor UV 2D */}
            <div
              className="relative min-w-0 min-h-0 flex"
              style={{ flex: `0 0 ${uvSplitRatio * 100}%` }}
            >
              <div
                inert={!isEditingMode}
                aria-disabled={!isEditingMode}
                className="absolute inset-0 flex min-h-0"
              >
                <UVEditorCanvas
                  ref={uvCanvasRef}
                  mesh={activeMesh}
                  selection={selection}
                  transformTool={transformTool}
                  pivotMode={pivotMode}
                  cursorUV={cursorUV}
                  keepConnected={keepConnected}
                  multiSelectMode={multiSelectMode}
                  boxSelectActive={boxSelectActive}
                  placeCursorMode={placeCursorMode}
                  showChecker={showChecker}
                  textureDataUrl={materialAsset?.textureDataUrl}
                  uvSubMode={uvSubMode}
                  screenModifiers={uvScreenModifiers}
                  onZoomChange={setZoomPercent}
                  onUvSubModeChange={setUvSubMode}
                  onToggleScreenModifier={handleToggleScreenModifier}
                  onPreviewMesh={setPreviewMesh}
                  onCommitMesh={onCommitMesh}
                  onUndo={onUndo}
                  onRedo={onRedo}
                  onSelectModeChange={handleSelectUVMode}
                  onTransformToolChange={setTransformTool}
                  onBoxSelectActiveChange={setBoxSelectActive}
                  onCursorUVChange={setCursorUV}
                  onPlaceCursorDone={() => setPlaceCursorMode(false)}
                  onSelectionChange={handleSelectionChange}
                />
              </div>
              {!isEditingMode && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#14161b]/70 pointer-events-none">
                  <span className="px-3 py-2 rounded-lg bg-[#181a1f]/95 border border-[#343a47] text-xs font-semibold text-[#cbd5e1]">
                    Cambia a Modo Edición para modificar UVs
                  </span>
                </div>
              )}
            </div>

            <div
              role="separator"
              aria-label="Cambiar proporción entre el editor UV y el visor 3D"
              aria-orientation={splitOrientation === 'horizontal' ? 'vertical' : 'horizontal'}
              aria-valuemin={splitMinPercent}
              aria-valuemax={100 - splitMinPercent}
              aria-valuenow={Math.round(uvSplitRatio * 100)}
              tabIndex={0}
              onPointerDown={handleSplitPointerDown}
              onPointerMove={handleSplitPointerMove}
              onPointerUp={handleSplitPointerUp}
              onPointerCancel={handleSplitPointerUp}
              onKeyDown={handleSplitKeyDown}
              className="z-20 shrink-0 touch-none bg-[#2b2e36] hover:bg-[#5ecd6e] focus-visible:bg-[#5ecd6e] transition-colors cursor-row-resize md:cursor-col-resize h-2 md:h-auto md:w-2"
              data-testid="uv-viewport-splitter"
            />

            {/* Visor 2: Modelo 3D Sincronizado */}
            <div className="flex-1 min-h-0 min-w-0 md:min-w-[190px] flex">
              <UVSync3DViewport
                ref={sync3DViewportRef}
                objectId={objectId}
                objectName={objectName}
                mesh={activeMesh}
                objectTransform={objectTransform}
                materialAsset={materialAsset}
                shading={shading}
                showChecker={showChecker}
                uvSelection={selection}
                islands={islands}
                multiSelectActive={multiSelectMode || uvScreenModifiers.shift}
                onPick3DComponent={handlePick3DFromSyncViewport}
              />
            </div>
          </div>

          {uvToast && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-md bg-[#181a1f]/95 border border-[#5ecd6e]/60 text-xs font-semibold text-[#f3f4f6] shadow-lg">
              {uvToast}
            </div>
          )}
        </div>
      </div>
    );
  },
);

UVWorkspace.displayName = 'UVWorkspace';
