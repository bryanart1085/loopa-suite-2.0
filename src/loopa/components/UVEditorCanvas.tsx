/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditableMesh, Vec2 } from '../core/mesh/EditableMesh';
import {
  UVIsland,
  UVPivotMode,
  UVSelectMode,
  UVSelectionState,
  UVTransformTool,
} from '../core/uv/types';
import {
  applyUVHitSelection,
  boxSelectUVElements,
  canvasLocalToUV,
  computeUVPivotPoint,
  findUVEdgeLoop,
  findUVFaceLoopDirections,
  findUVShortestPath,
  findUVVertexLoopDirections,
  getUVSelectionBounds,
  hitTestUVElement,
  isUVHitSelected,
  makeUVEdgeKey,
  makeUVVertexKey,
  rotateUVSelection,
  scaleUVSelection,
  translateUVSelection,
  UVBoxRect,
  UVHitResult,
  UVViewportTransform,
  uvToCanvasLocal,
} from '../core/uv/uvOperations';
import { extractUVIslands } from '../core/uv/uvUnwrap';
import {
  TouchModifierKey,
  TouchModifierState,
} from '../core/project/types';
import { EditSelectionSubMode } from '../core/mesh/loopSelect';
import {
  Crosshair,
  Grid,
  Maximize,
  Maximize2,
  Move,
  RefreshCw,
  RotateCw,
  SquareDashedMousePointer,
} from 'lucide-react';

export type UVGizmoHandle =
  | 'move_free'
  | 'move_x'
  | 'move_y'
  | 'rotate'
  | 'scale_x'
  | 'scale_y'
  | 'scale_uniform';

interface UVEditorCanvasProps {
  mesh: EditableMesh | null;
  selection: UVSelectionState;
  transformTool: UVTransformTool;
  pivotMode: UVPivotMode;
  cursorUV: Vec2;
  keepConnected: boolean;
  multiSelectMode: boolean;
  boxSelectActive: boolean;
  placeCursorMode: boolean;
  showChecker: boolean;
  textureDataUrl?: string | null;
  uvSubMode: EditSelectionSubMode;
  screenModifiers: TouchModifierState;
  onUvSubModeChange: (mode: EditSelectionSubMode) => void;
  onToggleScreenModifier: (key: TouchModifierKey) => void;
  onPreviewMesh: (nextMesh: EditableMesh) => void;
  onCommitMesh?: (beforeMesh: EditableMesh, afterMesh: EditableMesh) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectModeChange: (mode: UVSelectMode) => void;
  onTransformToolChange: (tool: UVTransformTool) => void;
  onBoxSelectActiveChange: (active: boolean) => void;
  onZoomChange?: (zoomPercent: number) => void;
  onCursorUVChange: (uv: Vec2) => void;
  onPlaceCursorDone?: () => void;
  onSelectionChange: (nextSelection: UVSelectionState) => void;
}

export interface UVEditorCanvasHandle {
  fit01: () => void;
  frameAll: () => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

function clampZoom(z: number): number {
  return Math.max(40, Math.min(5000, z));
}

function wrapAngleDelta(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const ISLAND_COLORS = [
  '#5ecd6e',
  '#38bdf8',
  '#a78bfa',
  '#f59e0b',
  '#f472b6',
  '#34d399',
];

export const UVEditorCanvas = forwardRef<
  UVEditorCanvasHandle,
  UVEditorCanvasProps
>(({
  mesh,
  selection,
  transformTool,
  pivotMode,
  cursorUV,
  keepConnected,
  multiSelectMode,
  boxSelectActive,
  placeCursorMode,
  showChecker,
  textureDataUrl,
  uvSubMode,
  screenModifiers,
  onUvSubModeChange,
  onToggleScreenModifier,
  onPreviewMesh,
  onCommitMesh,
  onUndo,
  onRedo,
  onSelectModeChange,
  onTransformToolChange,
  onBoxSelectActiveChange,
  onZoomChange,
  onCursorUVChange,
  onPlaceCursorDone,
  onSelectionChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: 720,
    h: 540,
  });
  const [zoom, setZoom] = useState(340);
  const [pan, setPan] = useState<Vec2>([140, 100]);
  const [spacePressed, setSpacePressed] = useState(false);
  const [boxMarqueeScreen, setBoxMarqueeScreen] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const boxMarqueeRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const updateBoxMarquee = useCallback(
    (
      next:
        | { x0: number; y0: number; x1: number; y1: number }
        | null
        | ((
            prev: { x0: number; y0: number; x1: number; y1: number } | null,
          ) => { x0: number; y0: number; x1: number; y1: number } | null),
    ) => {
      const resolved =
        typeof next === 'function' ? next(boxMarqueeRef.current) : next;
      boxMarqueeRef.current = resolved;
      setBoxMarqueeScreen(resolved);
    },
    [],
  );
  const [liveTransformInfo, setLiveTransformInfo] = useState<string | null>(null);
  const [textureImage, setTextureImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!textureDataUrl) {
      setTextureImage(null);
      return;
    }

    const image = new Image();
    image.onload = () => setTextureImage(image);
    image.onerror = (error) => {
      console.error('No se pudo cargar la imagen de textura en el editor UV.', error);
      setTextureImage(null);
    };
    image.src = textureDataUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [textureDataUrl]);

  const islands: UVIsland[] = useMemo(
    () => (mesh ? extractUVIslands(mesh) : []),
    [mesh],
  );

  // Refs for gesture/drag stability across async React renders
  const panRef = useRef<Vec2>(pan);
  panRef.current = pan;
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;

  const pointerModeRef = useRef<
    'none' | 'pan' | 'gizmo_drag' | 'element_pending' | 'element_drag' | 'box_select'
  >('none');
  const dragStartLocalRef = useRef<Vec2>([0, 0]);
  const panLastLocalRef = useRef<Vec2>([0, 0]);
  const beforeMeshRef = useRef<EditableMesh | null>(null);
  const latestPreviewMeshRef = useRef<EditableMesh | null>(null);
  const activeGizmoHandleRef = useRef<UVGizmoHandle | null>(null);
  const dragPivotUVRef = useRef<Vec2>([0.5, 0.5]);
  const dragStartAngleUVRef = useRef<number>(0);
  const dragStartDistPxRef = useRef<number>(40);
  const dragAdditiveRef = useRef<boolean>(false);
  const dragModsRef = useRef<TouchModifierState>({
    shift: false,
    ctrl: false,
    alt: false,
  });
  const pendingHitRef = useRef<UVHitResult | null>(null);
  const maxMovePxRef = useRef<number>(0);

  // UV selection anchor (for Ctrl shortest-path) and directional loop cycle (for Vertex/Face loop re-tap)
  const uvAnchorRef = useRef<string | null>(null);
  const uvLoopCycleRef = useRef<{
    mode: UVSelectMode;
    seedKey: string;
    dirIdx: number;
    activeKeys: string[];
    baseKeys: string[];
  } | null>(null);

  // 1-finger touch long-press temporary Shift state
  const [longPressShiftActive, setLongPressShiftActive] = useState(false);
  const longPressShiftRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);

  // Touch multi-finger state
  const touchSessionRef = useRef<{
    active: boolean;
    startTime: number;
    maxTouchCount: number;
    totalMidMovement: number;
    totalPinchChange: number;
    prevMidLocal: Vec2;
    prevDist: number;
    gestureDecided: 'none' | 'two_finger_nav' | 'three_finger';
  }>({
    active: false,
    startTime: 0,
    maxTouchCount: 0,
    totalMidMovement: 0,
    totalPinchChange: 0,
    prevMidLocal: [0, 0],
    prevDist: 0,
    gestureDecided: 'none',
  });

  const cancelLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearLongPressShift = useCallback(() => {
    cancelLongPressTimer();
    if (longPressShiftRef.current) {
      longPressShiftRef.current = false;
      setLongPressShiftActive(false);
    }
  }, [cancelLongPressTimer]);

  useEffect(() => {
    return () => cancelLongPressTimer();
  }, [cancelLongPressTimer]);

  useEffect(() => {
    uvLoopCycleRef.current = null;
  }, [selection.mode, uvSubMode]);

  // ResizeObserver for crisp responsive DPR sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = Math.max(200, el.clientWidth);
      const h = Math.max(200, el.clientHeight);
      setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toLocalCoords = useCallback((clientX: number, clientY: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }, []);

  const getViewportTransform = useCallback(
    (): UVViewportTransform => ({
      pan: panRef.current,
      zoom: zoomRef.current,
      canvasHeight: canvasRef.current?.clientHeight || canvasSizeRef.current.h,
    }),
    [],
  );

  // Framing helpers
  const handleFit01 = useCallback(() => {
    const w = canvasRef.current?.clientWidth || canvasSizeRef.current.w;
    const h = canvasRef.current?.clientHeight || canvasSizeRef.current.h;
    const targetZoom = clampZoom(Math.min(w, h) * 0.72);
    const px = (w - targetZoom) / 2;
    const py = (h - targetZoom) / 2;
    setZoom(targetZoom);
    setPan([px, py]);
  }, []);

  const handleFrameAll = useCallback(() => {
    if (!mesh || mesh.faces.length === 0) {
      handleFit01();
      return;
    }
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (const f of mesh.faces) {
      if (!f.uvs) continue;
      for (const uv of f.uvs) {
        minU = Math.min(minU, uv[0]);
        minV = Math.min(minV, uv[1]);
        maxU = Math.max(maxU, uv[0]);
        maxV = Math.max(maxV, uv[1]);
      }
    }
    if (!Number.isFinite(minU)) {
      handleFit01();
      return;
    }
    const w = canvasRef.current?.clientWidth || canvasSizeRef.current.w;
    const h = canvasRef.current?.clientHeight || canvasSizeRef.current.h;
    const spanU = Math.max(0.15, maxU - minU);
    const spanV = Math.max(0.15, maxV - minV);
    const targetZoom = clampZoom(Math.min(w / spanU, h / spanV) * 0.76);
    const centerU = (minU + maxU) * 0.5;
    const centerV = (minV + maxV) * 0.5;
    const px = w * 0.5 - centerU * targetZoom;
    const py = h * 0.5 - centerV * targetZoom;
    setZoom(targetZoom);
    setPan([px, py]);
  }, [mesh, handleFit01]);

  const handleResetView = useCallback(() => {
    handleFit01();
  }, [handleFit01]);

  useImperativeHandle(
    ref,
    () => ({
      fit01: handleFit01,
      frameAll: handleFrameAll,
      resetView: handleResetView,
      zoomIn: () => setZoom((z) => clampZoom(z * 1.25)),
      zoomOut: () => setZoom((z) => clampZoom(z * 0.8)),
    }),
    [handleFit01, handleFrameAll, handleResetView],
  );

  useEffect(() => {
    onZoomChange?.(Math.round((zoom / 340) * 100));
  }, [onZoomChange, zoom]);

  // Initial fit on mount
  const hasFittedRef = useRef(false);
  useEffect(() => {
    if (!hasFittedRef.current && canvasSize.w > 220 && canvasSize.h > 220) {
      hasFittedRef.current = true;
      handleFit01();
    }
  }, [canvasSize, handleFit01]);

  // Space pan & shortcut keys inside UV canvas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.code === 'Space') {
        setSpacePressed(true);
      } else if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        onTransformToolChange('move');
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        onTransformToolChange('rotate');
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        onTransformToolChange('scale');
      } else if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        onBoxSelectActiveChange(!boxSelectActive);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [boxSelectActive, onBoxSelectActiveChange, onTransformToolChange]);

  // Gizmo hit testing in canvas-local coordinates
  const hitTestGizmoLocal = useCallback(
    (localX: number, localY: number): UVGizmoHandle | null => {
      if (!mesh) return null;
      const bounds = getUVSelectionBounds(mesh, selection, islands);
      if (bounds.count === 0) return null;
      const pivot = computeUVPivotPoint(mesh, selection, pivotMode, cursorUV, islands);
      const vp = getViewportTransform();
      const [cx, cy] = uvToCanvasLocal(pivot[0], pivot[1], vp);
      const dx = localX - cx;
      const dy = localY - cy;
      const dist = Math.hypot(dx, dy);

      if (transformTool === 'move') {
        if (dist <= 15) return 'move_free';
        if (dx >= 15 && dx <= 76 && Math.abs(dy) <= 14) return 'move_x';
        if (dy <= -15 && dy >= -76 && Math.abs(dx) <= 14) return 'move_y';
        return null;
      }

      if (transformTool === 'rotate') {
        if (dist >= 38 && dist <= 70) return 'rotate';
        if (dist <= 13) return 'move_free';
        return null;
      }

      // scale tool
      if (Math.hypot(localX - (cx + 48), localY - (cy - 48)) <= 16) {
        return 'scale_uniform';
      }
      if (Math.hypot(localX - (cx + 60), localY - cy) <= 16) {
        return 'scale_x';
      }
      if (Math.hypot(localX - cx, localY - (cy - 60)) <= 16) {
        return 'scale_y';
      }
      if (dist <= 14) return 'scale_uniform';
      return null;
    },
    [mesh, selection, islands, pivotMode, cursorUV, getViewportTransform, transformTool],
  );

  const beginGizmoTransform = useCallback(
    (handle: UVGizmoHandle, localX: number, localY: number) => {
      if (!mesh) return;
      const clonedBefore = mesh.clone();
      beforeMeshRef.current = clonedBefore;
      latestPreviewMeshRef.current = clonedBefore;
      activeGizmoHandleRef.current = handle;
      pointerModeRef.current = 'gizmo_drag';
      dragStartLocalRef.current = [localX, localY];
      maxMovePxRef.current = 0;

      const pivot = computeUVPivotPoint(
        clonedBefore,
        selection,
        pivotMode,
        cursorUV,
        islands,
      );
      dragPivotUVRef.current = pivot;

      const vp = getViewportTransform();
      const [px, py] = uvToCanvasLocal(pivot[0], pivot[1], vp);
      dragStartAngleUVRef.current = Math.atan2(-(localY - py), localX - px);
      dragStartDistPxRef.current = Math.max(14, Math.hypot(localX - px, localY - py));
    },
    [mesh, selection, pivotMode, cursorUV, islands, getViewportTransform],
  );

  const applyDragAtLocal = useCallback(
    (localX: number, localY: number) => {
      const before = beforeMeshRef.current;
      if (!before) return;

      const dxScreen = localX - dragStartLocalRef.current[0];
      const dyScreen = localY - dragStartLocalRef.current[1];
      maxMovePxRef.current = Math.max(
        maxMovePxRef.current,
        Math.hypot(dxScreen, dyScreen),
      );

      const vp = getViewportTransform();
      const du = dxScreen / vp.zoom;
      const dv = -dyScreen / vp.zoom;
      const handle = activeGizmoHandleRef.current ?? 'move_free';
      const pivot = dragPivotUVRef.current;
      const next = before.clone();

      if (handle === 'move_x') {
        translateUVSelection(next, selection, du, 0, islands);
        setLiveTransformInfo(`Mover U: ${du >= 0 ? '+' : ''}${du.toFixed(3)}`);
      } else if (handle === 'move_y') {
        translateUVSelection(next, selection, 0, dv, islands);
        setLiveTransformInfo(`Mover V: ${dv >= 0 ? '+' : ''}${dv.toFixed(3)}`);
      } else if (handle === 'move_free') {
        translateUVSelection(next, selection, du, dv, islands);
        setLiveTransformInfo(
          `Mover UV: (${du >= 0 ? '+' : ''}${du.toFixed(3)}, ${dv >= 0 ? '+' : ''}${dv.toFixed(3)})`,
        );
      } else if (handle === 'rotate') {
        const [px, py] = uvToCanvasLocal(pivot[0], pivot[1], vp);
        const currAngle = Math.atan2(-(localY - py), localX - px);
        const deltaRad = wrapAngleDelta(currAngle - dragStartAngleUVRef.current);
        rotateUVSelection(next, selection, deltaRad, pivot, { pivotMode, islands });
        const deg = (deltaRad * 180) / Math.PI;
        setLiveTransformInfo(`Rotar: ${deg >= 0 ? '+' : ''}${deg.toFixed(1)}°`);
      } else if (handle === 'scale_x') {
        const sx = Math.max(0.05, 1 + dxScreen / 90);
        scaleUVSelection(next, selection, sx, 1, pivot, { pivotMode, islands });
        setLiveTransformInfo(`Escalar U: ${sx.toFixed(2)}×`);
      } else if (handle === 'scale_y') {
        const sy = Math.max(0.05, 1 - dyScreen / 90);
        scaleUVSelection(next, selection, 1, sy, pivot, { pivotMode, islands });
        setLiveTransformInfo(`Escalar V: ${sy.toFixed(2)}×`);
      } else if (handle === 'scale_uniform') {
        const [px, py] = uvToCanvasLocal(pivot[0], pivot[1], vp);
        const currDist = Math.max(2, Math.hypot(localX - px, localY - py));
        const s = Math.max(0.05, currDist / Math.max(14, dragStartDistPxRef.current));
        scaleUVSelection(next, selection, s, s, pivot, { pivotMode, islands });
        setLiveTransformInfo(`Escalar: ${s.toFixed(2)}×`);
      }

      latestPreviewMeshRef.current = next;
      onPreviewMesh(next);
    },
    [getViewportTransform, selection, islands, pivotMode, onPreviewMesh],
  );

  const finalizeBoxSelect = useCallback(
    (x0: number, y0: number, x1: number, y1: number, additive: boolean) => {
      if (!mesh) return;
      const vp = getViewportTransform();
      const uv0 = canvasLocalToUV(x0, y0, vp);
      const uv1 = canvasLocalToUV(x1, y1, vp);
      const rect: UVBoxRect = {
        minU: Math.min(uv0[0], uv1[0]),
        maxU: Math.max(uv0[0], uv1[0]),
        minV: Math.min(uv0[1], uv1[1]),
        maxV: Math.max(uv0[1], uv1[1]),
      };
      const nextSelection = boxSelectUVElements(
        mesh,
        selection,
        rect,
        additive,
        islands,
      );
      onSelectionChange(nextSelection);
    },
    [mesh, getViewportTransform, selection, islands, onSelectionChange],
  );

  const resolveUVTapSelection = useCallback(
    (
      hit: UVHitResult | null,
      mods: { shift: boolean; ctrl: boolean; alt: boolean },
    ): UVSelectionState => {
      if (!mesh) return selection;
      const additive = mods.shift || multiSelectMode;

      // Ctrl + Tap -> Shortest UV topological path
      if (mods.ctrl && selection.mode !== 'island' && hit) {
        const currSet =
          selection.mode === 'vertex'
            ? selection.selectedVertexKeys
            : selection.mode === 'edge'
              ? selection.selectedEdgeKeys
              : selection.selectedFaceIds;
        let startKey =
          uvAnchorRef.current && currSet.has(uvAnchorRef.current)
            ? uvAnchorRef.current
            : null;
        if (!startKey) {
          for (const k of currSet) {
            startKey = k;
          }
        }
        if (startKey) {
          const pathRes = findUVShortestPath(
            mesh,
            selection.mode,
            startKey,
            hit.primaryKey,
            keepConnected,
          );
          if (pathRes.connected && pathRes.keys.length > 0) {
            const nextSet = new Set(additive ? currSet : []);
            for (const k of pathRes.keys) nextSet.add(k);
            uvAnchorRef.current = hit.primaryKey;
            uvLoopCycleRef.current = null;
            if (selection.mode === 'vertex') {
              return { ...selection, selectedVertexKeys: nextSet };
            }
            if (selection.mode === 'edge') {
              return { ...selection, selectedEdgeKeys: nextSet };
            }
            return { ...selection, selectedFaceIds: nextSet };
          }
        }
      }

      // Loop mode (subMode === 'loop' or Alt + Tap)
      if (
        (uvSubMode === 'loop' || mods.alt) &&
        selection.mode !== 'island' &&
        hit
      ) {
        if (selection.mode === 'edge') {
          const edgeLoop = findUVEdgeLoop(mesh, hit.primaryKey, keepConnected);
          uvLoopCycleRef.current = null;
          const next = new Set(additive ? selection.selectedEdgeKeys : []);
          const allSelected = edgeLoop.keys.every((k) =>
            selection.selectedEdgeKeys.has(k),
          );
          if (additive) {
            if (allSelected) edgeLoop.keys.forEach((k) => next.delete(k));
            else edgeLoop.keys.forEach((k) => next.add(k));
          } else if (
            allSelected &&
            selection.selectedEdgeKeys.size === edgeLoop.keys.length
          ) {
            uvAnchorRef.current = null;
            return { ...selection, selectedEdgeKeys: new Set() };
          } else {
            edgeLoop.keys.forEach((k) => next.add(k));
          }
          uvAnchorRef.current = hit.primaryKey;
          return { ...selection, selectedEdgeKeys: next };
        }

        const dirRes =
          selection.mode === 'vertex'
            ? findUVVertexLoopDirections(mesh, hit.primaryKey, keepConnected)
            : findUVFaceLoopDirections(mesh, hit.primaryKey);

        if (dirRes.loops.length > 0) {
          const currSet =
            selection.mode === 'vertex'
              ? selection.selectedVertexKeys
              : selection.selectedFaceIds;
          const prevCycle = uvLoopCycleRef.current;
          const isSameSeed =
            prevCycle !== null &&
            prevCycle.mode === selection.mode &&
            prevCycle.seedKey === hit.primaryKey &&
            prevCycle.activeKeys.length > 0 &&
            prevCycle.activeKeys.every((k) => currSet.has(k));
          const isInsideActive =
            !isSameSeed &&
            prevCycle !== null &&
            prevCycle.mode === selection.mode &&
            prevCycle.activeKeys.includes(hit.primaryKey) &&
            prevCycle.activeKeys.every((k) => currSet.has(k)) &&
            currSet.has(hit.primaryKey);

          let chosen = dirRes.loops[0];
          let nextDirIdx = 0;
          let baseKeys = additive ? Array.from(currSet) : [];

          if (isSameSeed && prevCycle) {
            nextDirIdx =
              dirRes.loops.length > 1
                ? (prevCycle.dirIdx + 1) % dirRes.loops.length
                : 0;
            chosen = dirRes.loops[nextDirIdx];
            baseKeys = prevCycle.baseKeys;
          } else if (isInsideActive && prevCycle) {
            const activeSet = new Set(prevCycle.activeKeys);
            const matchingIdx = dirRes.loops.findIndex(
              (l) =>
                l.keys.length === activeSet.size &&
                l.keys.every((k) => activeSet.has(k)),
            );
            nextDirIdx =
              dirRes.loops.length > 1
                ? matchingIdx >= 0
                  ? (matchingIdx + 1) % dirRes.loops.length
                  : 1 % dirRes.loops.length
                : 0;
            chosen = dirRes.loops[nextDirIdx];
            baseKeys = prevCycle.baseKeys;
          }

          const nextSet = new Set(baseKeys);
          for (const k of chosen.keys) nextSet.add(k);
          uvLoopCycleRef.current = {
            mode: selection.mode,
            seedKey: hit.primaryKey,
            dirIdx: nextDirIdx,
            activeKeys: chosen.keys,
            baseKeys,
          };
          uvAnchorRef.current = hit.primaryKey;
          if (selection.mode === 'vertex') {
            return { ...selection, selectedVertexKeys: nextSet };
          }
          return { ...selection, selectedFaceIds: nextSet };
        }
      }

      uvLoopCycleRef.current = null;
      const nextSel = applyUVHitSelection(mesh, selection, hit, additive);
      if (hit) uvAnchorRef.current = hit.primaryKey;
      else if (!additive) uvAnchorRef.current = null;
      return nextSel;
    },
    [keepConnected, mesh, multiSelectMode, selection, uvSubMode],
  );

  const commitOrCancelDrag = useCallback(() => {
    const mode = pointerModeRef.current;
    if (mode === 'gizmo_drag' || mode === 'element_drag') {
      if (
        beforeMeshRef.current &&
        latestPreviewMeshRef.current &&
        maxMovePxRef.current > 2
      ) {
        onCommitMesh?.(beforeMeshRef.current, latestPreviewMeshRef.current);
      } else if (beforeMeshRef.current) {
        onPreviewMesh(beforeMeshRef.current);
      }
    } else if (mode === 'element_pending' && pendingHitRef.current && mesh) {
      onSelectionChange(
        resolveUVTapSelection(pendingHitRef.current, dragModsRef.current),
      );
    } else if (mode === 'box_select' && boxMarqueeRef.current) {
      const rectScreen = boxMarqueeRef.current;
      const w = Math.abs(rectScreen.x1 - rectScreen.x0);
      const h = Math.abs(rectScreen.y1 - rectScreen.y0);
      if (w > 6 || h > 6) {
        finalizeBoxSelect(
          rectScreen.x0,
          rectScreen.y0,
          rectScreen.x1,
          rectScreen.y1,
          dragAdditiveRef.current || dragModsRef.current.shift,
        );
      } else if (
        mesh &&
        !dragAdditiveRef.current &&
        !dragModsRef.current.shift &&
        !longPressShiftRef.current
      ) {
        onSelectionChange(applyUVHitSelection(mesh, selection, null, false));
        uvAnchorRef.current = null;
        uvLoopCycleRef.current = null;
      }
    }

    pointerModeRef.current = 'none';
    activeGizmoHandleRef.current = null;
    beforeMeshRef.current = null;
    latestPreviewMeshRef.current = null;
    pendingHitRef.current = null;
    maxMovePxRef.current = 0;
    updateBoxMarquee(null);
    setLiveTransformInfo(null);
  }, [
    finalizeBoxSelect,
    mesh,
    onCommitMesh,
    onPreviewMesh,
    onSelectionChange,
    resolveUVTapSelection,
    selection,
    updateBoxMarquee,
  ]);

  /* ========================================================================
   * Canvas Render Loop
   * ====================================================================== */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || canvasSize.w;
    const height = canvas.clientHeight || canvasSize.h;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Outer background
    ctx.fillStyle = '#121419';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Exact inverse of canvasLocalToUV / match for uvToCanvasLocal:
    // px = pan[0] + zoom * u
    // py = (height - pan[1]) - zoom * v
    ctx.translate(pan[0], height - pan[1]);
    ctx.scale(zoom, -zoom);

    // Infinite subtle grid backdrop lines around 0..1
    const vp: UVViewportTransform = { pan, zoom, canvasHeight: height };
    const [uvMinX, uvMaxY] = canvasLocalToUV(0, 0, vp);
    const [uvMaxX, uvMinY] = canvasLocalToUV(width, height, vp);

    ctx.strokeStyle = '#1d2028';
    ctx.lineWidth = 1 / zoom;
    const startX = Math.floor(uvMinX * 2) / 2;
    const endX = Math.ceil(uvMaxX * 2) / 2;
    const startY = Math.floor(uvMinY * 2) / 2;
    const endY = Math.ceil(uvMaxY * 2) / 2;
    for (let x = startX; x <= endX; x += 0.5) {
      ctx.beginPath();
      ctx.moveTo(x, uvMinY);
      ctx.lineTo(x, uvMaxY);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += 0.5) {
      ctx.beginPath();
      ctx.moveTo(uvMinX, y);
      ctx.lineTo(uvMaxX, y);
      ctx.stroke();
    }

    // 0-1 UV space surface
    ctx.fillStyle = '#181b22';
    ctx.fillRect(0, 0, 1, 1);

    // Optional 8x8 Checkerboard inside [0, 1]
    if (showChecker) {
      const cells = 8;
      const cell = 1 / cells;
      for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#222834' : '#2f3a4a';
          ctx.fillRect(c * cell, r * cell, cell, cell);
        }
      }
    }

    if (textureImage) {
      ctx.save();
      ctx.scale(1, -1);
      ctx.drawImage(textureImage, 0, -1, 1, 1);
      ctx.restore();
    }

    // 0.1 sub-grid inside [0, 1]
    ctx.strokeStyle = showChecker ? 'rgba(255,255,255,0.08)' : '#252a34';
    ctx.lineWidth = 1 / zoom;
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      ctx.beginPath();
      ctx.moveTo(t, 0);
      ctx.lineTo(t, 1);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, t);
      ctx.lineTo(1, t);
      ctx.stroke();
    }

    // Primary axes U (red) & V (green) at 0,1 border
    ctx.strokeStyle = '#5ecd6e';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, 1, 1);

    if (mesh) {
      const faceToIslandIdx = new Map<string, number>();
      const selectedIslandFaceSet = new Set<string>();
      islands.forEach((isl, idx) => {
        const islSelected = selection.selectedIslandIds.has(isl.id);
        for (const fid of isl.faceIds) {
          faceToIslandIdx.set(fid, idx);
          if (islSelected) selectedIslandFaceSet.add(fid);
        }
      });

      // Build seam pair lookup so seam UV edges render noticeably
      const seamPairs = new Set<string>();
      for (const e of mesh.edges) {
        if (e.isSeam) {
          seamPairs.add(e.v0 < e.v1 ? `${e.v0}::${e.v1}` : `${e.v1}::${e.v0}`);
        }
      }

      // 1. Draw faces
      for (const f of mesh.faces) {
        if (!f.uvs || f.uvs.length < 3 || f.uvs.length !== f.vertexIds.length) {
          continue;
        }
        const isFaceSelected =
          (selection.mode === 'face' && selection.selectedFaceIds.has(f.id)) ||
          (selection.mode === 'island' && selectedIslandFaceSet.has(f.id));
        const islIdx = faceToIslandIdx.get(f.id) ?? 0;
        const islColor = ISLAND_COLORS[islIdx % ISLAND_COLORS.length];

        ctx.beginPath();
        for (let i = 0; i < f.uvs.length; i++) {
          const uv = f.uvs[i];
          if (i === 0) ctx.moveTo(uv[0], uv[1]);
          else ctx.lineTo(uv[0], uv[1]);
        }
        ctx.closePath();

        ctx.fillStyle = isFaceSelected
          ? 'rgba(94, 205, 110, 0.36)'
          : selection.mode === 'island'
            ? `${islColor}24`
            : 'rgba(56, 189, 248, 0.14)';
        ctx.fill();

        // Draw edges individually so seams & selected edges are distinct
        const n = f.uvs.length;
        for (let i = 0; i < n; i++) {
          const a = f.uvs[i];
          const b = f.uvs[(i + 1) % n];
          const va = f.vertexIds[i];
          const vb = f.vertexIds[(i + 1) % n];
          const isSeamEdge = seamPairs.has(va < vb ? `${va}::${vb}` : `${vb}::${va}`);
          const eKey = makeUVEdgeKey(f.id, i);
          const isEdgeSelected =
            selection.mode === 'edge' && selection.selectedEdgeKeys.has(eKey);

          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          if (isEdgeSelected) {
            ctx.strokeStyle = '#ff9900';
            ctx.lineWidth = 3 / zoom;
          } else if (isFaceSelected) {
            ctx.strokeStyle = '#5ecd6e';
            ctx.lineWidth = 2 / zoom;
          } else if (isSeamEdge) {
            ctx.strokeStyle = '#ff2e63';
            ctx.lineWidth = 2.2 / zoom;
          } else {
            ctx.strokeStyle =
              selection.mode === 'island' ? `${islColor}aa` : '#64748b';
            ctx.lineWidth = 1.2 / zoom;
          }
          ctx.stroke();
        }
      }

      // 2. Draw vertices
      const showAllVertices = selection.mode === 'vertex';
      for (const f of mesh.faces) {
        if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;
        for (let i = 0; i < f.uvs.length; i++) {
          const uv = f.uvs[i];
          const key = makeUVVertexKey(f.id, f.vertexIds[i]);
          const isSelected =
            selection.mode === 'vertex' && selection.selectedVertexKeys.has(key);
          if (!showAllVertices && !isSelected) continue;

          ctx.beginPath();
          ctx.arc(
            uv[0],
            uv[1],
            (isSelected ? 6 : 3.5) / zoom,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = isSelected ? '#ff9900' : '#cbd5e1';
          ctx.fill();
          ctx.strokeStyle = '#111215';
          ctx.lineWidth = 1.2 / zoom;
          ctx.stroke();
        }
      }
    }

    ctx.restore();

    // 3. Screen-space overlays (2D Cursor, 2D Gizmo, Box Marquee)
    if (pivotMode === 'cursor') {
      const [curX, curY] = uvToCanvasLocal(cursorUV[0], cursorUV[1], vp);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(curX, curY, 9, 0, Math.PI * 2);
      ctx.moveTo(curX - 14, curY);
      ctx.lineTo(curX + 14, curY);
      ctx.moveTo(curX, curY - 14);
      ctx.lineTo(curX, curY + 14);
      ctx.stroke();
      ctx.restore();
    }

    if (mesh) {
      const bounds = getUVSelectionBounds(mesh, selection, islands);
      if (bounds.count > 0) {
        const pivot = computeUVPivotPoint(
          mesh,
          selection,
          pivotMode,
          cursorUV,
          islands,
        );
        const [cx, cy] = uvToCanvasLocal(pivot[0], pivot[1], vp);

        ctx.save();
        if (transformTool === 'move') {
          // X Axis Arrow (Red, U+)
          ctx.strokeStyle = '#ef4444';
          ctx.fillStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx + 12, cy);
          ctx.lineTo(cx + 64, cy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx + 74, cy);
          ctx.lineTo(cx + 60, cy - 6);
          ctx.lineTo(cx + 60, cy + 6);
          ctx.closePath();
          ctx.fill();

          // Y Axis Arrow (Green/Blue, V+ UP)
          ctx.strokeStyle = '#3b82f6';
          ctx.fillStyle = '#3b82f6';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 12);
          ctx.lineTo(cx, cy - 64);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy - 74);
          ctx.lineTo(cx - 6, cy - 60);
          ctx.lineTo(cx + 6, cy - 60);
          ctx.closePath();
          ctx.fill();

          // Center Free Move Circle
          ctx.beginPath();
          ctx.arc(cx, cy, 11, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (transformTool === 'rotate') {
          // Outer 360 degree rotation ring
          ctx.strokeStyle = '#5ecd6e';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(cx, cy, 54, 0, Math.PI * 2);
          ctx.stroke();

          // Quarter ticks
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.5;
          for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48);
            ctx.lineTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
            ctx.stroke();
          }

          // Center Free Move dot
          ctx.beginPath();
          ctx.arc(cx, cy, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (transformTool === 'scale') {
          // X scale handle
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx + 10, cy);
          ctx.lineTo(cx + 60, cy);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(cx + 54, cy - 6, 12, 12);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx + 54, cy - 6, 12, 12);

          // Y scale handle
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 10);
          ctx.lineTo(cx, cy - 60);
          ctx.stroke();
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(cx - 6, cy - 66, 12, 12);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx - 6, cy - 66, 12, 12);

          // Uniform scale handle (diagonal)
          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + 48, cy - 48);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#a78bfa';
          ctx.fillRect(cx + 41, cy - 55, 14, 14);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx + 41, cy - 55, 14, 14);

          // Center dot
          ctx.beginPath();
          ctx.arc(cx, cy, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 4. Box / Area Selection Marquee
    if (boxMarqueeScreen) {
      const left = Math.min(boxMarqueeScreen.x0, boxMarqueeScreen.x1);
      const top = Math.min(boxMarqueeScreen.y0, boxMarqueeScreen.y1);
      const bw = Math.abs(boxMarqueeScreen.x1 - boxMarqueeScreen.x0);
      const bh = Math.abs(boxMarqueeScreen.y1 - boxMarqueeScreen.y0);
      ctx.save();
      ctx.fillStyle = 'rgba(94, 205, 110, 0.14)';
      ctx.fillRect(left, top, bw, bh);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#5ecd6e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(left, top, bw, bh);
      ctx.restore();
    }
  }, [
    mesh,
    islands,
    selection,
    zoom,
    pan,
    canvasSize,
    showChecker,
    textureImage,
    transformTool,
    pivotMode,
    cursorUV,
    boxMarqueeScreen,
  ]);

  /* ========================================================================
   * Mouse Handlers
   * ====================================================================== */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const [lx, ly] = toLocalCoords(e.clientX, e.clientY);

    if (e.button === 1 || e.button === 2 || spacePressed) {
      pointerModeRef.current = 'pan';
      panLastLocalRef.current = [lx, ly];
      return;
    }

    if (e.button !== 0 || !mesh) return;

    if (placeCursorMode) {
      const [u, v] = canvasLocalToUV(lx, ly, getViewportTransform());
      onCursorUVChange([Number(u.toFixed(4)), Number(v.toFixed(4))]);
      onPlaceCursorDone?.();
      return;
    }

    const effShift = e.shiftKey || screenModifiers.shift || multiSelectMode;
    const effCtrl = e.ctrlKey || e.metaKey || screenModifiers.ctrl;
    const effAlt = e.altKey || screenModifiers.alt;
    const additive = effShift || effCtrl;

    // 1. Check Gizmo first (unless Box Select tool is explicitly active)
    if (!boxSelectActive) {
      const gizmoHit = hitTestGizmoLocal(lx, ly);
      if (gizmoHit) {
        beginGizmoTransform(gizmoHit, lx, ly);
        return;
      }
    }

    // 2. Box select mode or empty space drag
    const [u, v] = canvasLocalToUV(lx, ly, getViewportTransform());
    const elemHit = hitTestUVElement(mesh, selection.mode, u, v, zoomRef.current, {
      islands,
      keepConnected,
    });

    dragStartLocalRef.current = [lx, ly];
    dragAdditiveRef.current = additive;
    dragModsRef.current = { shift: effShift, ctrl: effCtrl, alt: effAlt };
    maxMovePxRef.current = 0;

    if (boxSelectActive || !elemHit) {
      pointerModeRef.current = 'box_select';
      updateBoxMarquee({ x0: lx, y0: ly, x1: lx, y1: ly });
      return;
    }

    // Hit an element: hold pending until user either releases (tap select) or drags (move)
    pendingHitRef.current = elemHit;
    pointerModeRef.current = 'element_pending';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const [lx, ly] = toLocalCoords(e.clientX, e.clientY);
    const mode = pointerModeRef.current;

    if (mode === 'pan') {
      const dx = lx - panLastLocalRef.current[0];
      const dy = ly - panLastLocalRef.current[1];
      panLastLocalRef.current = [lx, ly];
      setPan((p) => [p[0] + dx, p[1] - dy]);
      return;
    }

    if (mode === 'box_select') {
      updateBoxMarquee((prev) => (prev ? { ...prev, x1: lx, y1: ly } : null));
      return;
    }

    if (mode === 'element_pending' && mesh && pendingHitRef.current) {
      const dist = Math.hypot(
        lx - dragStartLocalRef.current[0],
        ly - dragStartLocalRef.current[1],
      );
      if (dist > 6) {
        // If clicked element wasn't selected yet, select it cleanly before dragging
        if (!isUVHitSelected(selection, pendingHitRef.current)) {
          const nextSel = applyUVHitSelection(
            mesh,
            selection,
            pendingHitRef.current,
            dragAdditiveRef.current,
          );
          onSelectionChange(nextSel);
        }
        const before = mesh.clone();
        beforeMeshRef.current = before;
        latestPreviewMeshRef.current = before;
        activeGizmoHandleRef.current = 'move_free';
        pointerModeRef.current = 'element_drag';
        applyDragAtLocal(lx, ly);
      }
      return;
    }

    if (mode === 'gizmo_drag' || mode === 'element_drag') {
      applyDragAtLocal(lx, ly);
    }
  };

  const handleMouseUp = () => {
    if (pointerModeRef.current === 'pan') {
      pointerModeRef.current = 'none';
      return;
    }
    commitOrCancelDrag();
  };

  /* ========================================================================
   * Touch Handlers (No Gesture/Selection/Gizmo Conflict)
   * ====================================================================== */
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const now = Date.now();
    const touchCount = e.touches.length;

    if (touchCount === 1) {
      const t = e.touches[0];
      const [lx, ly] = toLocalCoords(t.clientX, t.clientY);

      touchSessionRef.current = {
        active: true,
        startTime: now,
        maxTouchCount: 1,
        totalMidMovement: 0,
        totalPinchChange: 0,
        prevMidLocal: [lx, ly],
        prevDist: 0,
        gestureDecided: 'none',
      };

      if (!mesh) return;

      if (placeCursorMode) {
        const [u, v] = canvasLocalToUV(lx, ly, getViewportTransform());
        onCursorUVChange([Number(u.toFixed(4)), Number(v.toFixed(4))]);
        onPlaceCursorDone?.();
        return;
      }

      if (!boxSelectActive) {
        const gizmoHit = hitTestGizmoLocal(lx, ly);
        if (gizmoHit) {
          clearLongPressShift();
          beginGizmoTransform(gizmoHit, lx, ly);
          return;
        }
      }

      const [u, v] = canvasLocalToUV(lx, ly, getViewportTransform());
      const elemHit = hitTestUVElement(mesh, selection.mode, u, v, zoomRef.current, {
        islands,
        keepConnected,
      });

      const effShift = screenModifiers.shift || multiSelectMode;
      dragStartLocalRef.current = [lx, ly];
      dragAdditiveRef.current = effShift || screenModifiers.ctrl;
      dragModsRef.current = {
        shift: effShift,
        ctrl: screenModifiers.ctrl,
        alt: screenModifiers.alt,
      };
      maxMovePxRef.current = 0;

      // Schedule 1-finger long-press -> temporary Shift during selection (auto-released on lift)
      cancelLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        if (
          touchSessionRef.current.active &&
          touchSessionRef.current.maxTouchCount === 1 &&
          pointerModeRef.current !== 'gizmo_drag' &&
          pointerModeRef.current !== 'element_drag'
        ) {
          longPressShiftRef.current = true;
          setLongPressShiftActive(true);
          dragAdditiveRef.current = true;
          dragModsRef.current = {
            ...dragModsRef.current,
            shift: true,
          };
        }
      }, 280);

      if (boxSelectActive || !elemHit) {
        pointerModeRef.current = 'box_select';
        updateBoxMarquee({ x0: lx, y0: ly, x1: lx, y1: ly });
      } else {
        pendingHitRef.current = elemHit;
        pointerModeRef.current = 'element_pending';
      }
      return;
    }

    // 2 or 3 fingers landed: abort any 1-finger preview/selection/long-press cleanly!
    clearLongPressShift();
    if (pointerModeRef.current !== 'none') {
      if (
        (pointerModeRef.current === 'gizmo_drag' ||
          pointerModeRef.current === 'element_drag') &&
        beforeMeshRef.current
      ) {
        onPreviewMesh(beforeMeshRef.current);
      }
      pointerModeRef.current = 'none';
      activeGizmoHandleRef.current = null;
      beforeMeshRef.current = null;
      latestPreviewMeshRef.current = null;
      pendingHitRef.current = null;
      updateBoxMarquee(null);
      setLiveTransformInfo(null);
    }

    if (touchCount === 2) {
      const [x0, y0] = toLocalCoords(e.touches[0].clientX, e.touches[0].clientY);
      const [x1, y1] = toLocalCoords(e.touches[1].clientX, e.touches[1].clientY);
      const mid: Vec2 = [(x0 + x1) * 0.5, (y0 + y1) * 0.5];
      const dist = Math.hypot(x1 - x0, y1 - y0);
      touchSessionRef.current = {
        active: true,
        startTime: now,
        maxTouchCount: Math.max(touchSessionRef.current.maxTouchCount, 2),
        totalMidMovement: 0,
        totalPinchChange: 0,
        prevMidLocal: mid,
        prevDist: dist,
        gestureDecided: 'two_finger_nav',
      };
    } else if (touchCount >= 3) {
      touchSessionRef.current = {
        ...touchSessionRef.current,
        active: true,
        startTime: now,
        maxTouchCount: Math.max(touchSessionRef.current.maxTouchCount, touchCount),
        gestureDecided: 'three_finger',
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touchCount = e.touches.length;
    const sess = touchSessionRef.current;
    sess.maxTouchCount = Math.max(sess.maxTouchCount, touchCount);

    if (touchCount === 2) {
      clearLongPressShift();
      const [x0, y0] = toLocalCoords(e.touches[0].clientX, e.touches[0].clientY);
      const [x1, y1] = toLocalCoords(e.touches[1].clientX, e.touches[1].clientY);
      const mid: Vec2 = [(x0 + x1) * 0.5, (y0 + y1) * 0.5];
      const dist = Math.hypot(x1 - x0, y1 - y0);

      const dMid = Math.hypot(mid[0] - sess.prevMidLocal[0], mid[1] - sess.prevMidLocal[1]);
      const dDist = Math.abs(dist - sess.prevDist);
      sess.totalMidMovement += dMid;
      sess.totalPinchChange += dDist;

      if (sess.totalMidMovement > 8 || sess.totalPinchChange > 8) {
        const vp = getViewportTransform();
        const prevZoom = vp.zoom;
        const factor = sess.prevDist > 10 ? dist / sess.prevDist : 1;
        const nextZoom = clampZoom(prevZoom * factor);

        // Anchor UV point under previous midpoint onto new midpoint (handles pan + pinch-zoom simultaneously!)
        const [uMid, vMid] = canvasLocalToUV(
          sess.prevMidLocal[0],
          sess.prevMidLocal[1],
          vp,
        );
        const nextPanX = mid[0] - uMid * nextZoom;
        const nextPanY = vp.canvasHeight - mid[1] - vMid * nextZoom;

        setZoom(nextZoom);
        setPan([nextPanX, nextPanY]);
      }

      sess.prevMidLocal = mid;
      sess.prevDist = dist;
      return;
    }

    if (touchCount === 1 && sess.maxTouchCount === 1) {
      const t = e.touches[0];
      const [lx, ly] = toLocalCoords(t.clientX, t.clientY);
      const mode = pointerModeRef.current;
      const distFromStart = Math.hypot(
        lx - dragStartLocalRef.current[0],
        ly - dragStartLocalRef.current[1],
      );

      if (distFromStart > 8 && !longPressShiftRef.current) {
        cancelLongPressTimer();
      }

      if (mode === 'box_select') {
        updateBoxMarquee((prev) => (prev ? { ...prev, x1: lx, y1: ly } : null));
      } else if (mode === 'element_pending' && mesh && pendingHitRef.current) {
        const moveThreshold = longPressShiftRef.current ? 16 : 8;
        if (distFromStart > moveThreshold) {
          if (!isUVHitSelected(selection, pendingHitRef.current)) {
            onSelectionChange(
              applyUVHitSelection(
                mesh,
                selection,
                pendingHitRef.current,
                dragAdditiveRef.current || dragModsRef.current.shift,
              ),
            );
          }
          const before = mesh.clone();
          beforeMeshRef.current = before;
          latestPreviewMeshRef.current = before;
          activeGizmoHandleRef.current = 'move_free';
          pointerModeRef.current = 'element_drag';
          applyDragAtLocal(lx, ly);
        }
      } else if (mode === 'gizmo_drag' || mode === 'element_drag') {
        applyDragAtLocal(lx, ly);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length > 0) return;

    const sess = touchSessionRef.current;
    const duration = Date.now() - sess.startTime;
    const totalMotion = sess.totalMidMovement + sess.totalPinchChange;

    if (sess.maxTouchCount === 2 && totalMotion < 14 && duration < 450) {
      onUndo?.();
    } else if (sess.maxTouchCount >= 3 && totalMotion < 18 && duration < 500) {
      onRedo?.();
    } else if (sess.maxTouchCount === 1) {
      commitOrCancelDrag();
    }

    clearLongPressShift();
    touchSessionRef.current.active = false;
    touchSessionRef.current.maxTouchCount = 0;
    touchSessionRef.current.gestureDecided = 'none';
  };

  return (
    <div className="relative flex-1 min-w-0 min-h-0 bg-[#14161b] flex flex-col overflow-hidden">
      {/* Header controls now live in UVToolToolbar. */}
      <div className="hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8e95a2] pr-1 hidden xl:inline">
            Visor 1 · Editor UV
          </span>

          {/* UV Selection Modes */}
          <div
            data-testid="uv-selection-modes"
            className="flex items-center gap-0.5 bg-[#121418] rounded-md p-0.5 border border-[#2b2e36]"
          >
            {(
              [
                { id: 'vertex', label: 'Vértice' },
                { id: 'edge', label: 'Arista' },
                { id: 'face', label: 'Cara' },
                { id: 'island', label: 'Isla' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                data-testid={`uv-mode-${mode.id}`}
                onClick={() => onSelectModeChange(mode.id)}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors touch-manipulation ${
                  selection.mode === mode.id
                    ? 'bg-[#5ecd6e] text-[#121418]'
                    : 'text-[#9ca3af] hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* UV Sub-Modes: Individual vs Bucle */}
          {selection.mode !== 'island' && (
            <div
              data-testid="uv-submodes"
              className="flex items-center gap-0.5 bg-[#121418] rounded-md p-0.5 border border-[#2b2e36]"
            >
              <button
                type="button"
                data-testid="uv-submode-single"
                aria-pressed={uvSubMode === 'single'}
                onClick={() => onUvSubModeChange('single')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors touch-manipulation ${
                  uvSubMode === 'single'
                    ? 'bg-[#1a2c3d] text-[#38bdf8]'
                    : 'text-[#9ca3af] hover:text-white'
                }`}
                title="Selección individual"
              >
                {selection.mode === 'vertex'
                  ? 'Vértice'
                  : selection.mode === 'edge'
                    ? 'Arista'
                    : 'Cara'}
              </button>
              <button
                type="button"
                data-testid="uv-submode-loop"
                aria-pressed={uvSubMode === 'loop'}
                onClick={() => onUvSubModeChange('loop')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors touch-manipulation ${
                  uvSubMode === 'loop'
                    ? 'bg-[#1a2c3d] text-[#38bdf8]'
                    : 'text-[#9ca3af] hover:text-white'
                }`}
                title="Selección de bucle topológico UV (tocar de nuevo para alternar eje)"
              >
                Bucle
              </button>
            </div>
          )}

          {/* UV Screen / Touch Modifiers: CTRL / SHIFT / ALT */}
          <div
            data-testid="uv-touch-modifiers"
            className="flex items-center gap-0.5 bg-[#121418] rounded-md p-0.5 border border-[#2b2e36]"
          >
            {(
              [
                {
                  id: 'ctrl',
                  label: 'CTRL',
                  title: 'CTRL: Camino más corto entre elementos UV',
                  activeClass: 'bg-[#112738] text-[#7dd3fc] border-[#38bdf8]/70',
                },
                {
                  id: 'shift',
                  label: 'SHIFT',
                  title: 'SHIFT: Añadir / quitar de la selección (o mantén 1 dedo presionado)',
                  activeClass: 'bg-[#16261a] text-[#7def8e] border-[#5ecd6e]/70',
                },
                {
                  id: 'alt',
                  label: 'ALT',
                  title: 'ALT: Seleccionar bucle topológico al tocar',
                  activeClass: 'bg-[#221a35] text-[#ddd6fe] border-[#a78bfa]/70',
                },
              ] as const
            ).map((mod) => {
              const isActive =
                mod.id === 'shift'
                  ? screenModifiers.shift || longPressShiftActive
                  : screenModifiers[mod.id];
              return (
                <button
                  key={mod.id}
                  type="button"
                  data-testid={`uv-modifier-${mod.id}`}
                  aria-pressed={isActive}
                  title={mod.title}
                  onClick={() => onToggleScreenModifier(mod.id)}
                  className={`px-2 py-1 rounded border text-[10px] font-bold tracking-wide transition-colors touch-manipulation ${
                    isActive
                      ? mod.activeClass
                      : 'border-transparent text-[#9ca3af] hover:text-white'
                  }`}
                >
                  {mod.label}
                </button>
              );
            })}
          </div>

          {/* 2D Transform Tools */}
          <div
            data-testid="uv-transform-tools"
            className="flex items-center gap-0.5 bg-[#121418] rounded-md p-0.5 border border-[#2b2e36]"
          >
            <button
              type="button"
              data-testid="uv-tool-move"
              onClick={() => {
                onBoxSelectActiveChange(false);
                onTransformToolChange('move');
              }}
              className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition-colors ${
                !boxSelectActive && transformTool === 'move'
                  ? 'bg-[#2c313b] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
              title="Mover 2D (G)"
            >
              <Move className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Mover</span>
            </button>
            <button
              type="button"
              data-testid="uv-tool-rotate"
              onClick={() => {
                onBoxSelectActiveChange(false);
                onTransformToolChange('rotate');
              }}
              className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition-colors ${
                !boxSelectActive && transformTool === 'rotate'
                  ? 'bg-[#2c313b] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
              title="Rotar 2D (R)"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Rotar</span>
            </button>
            <button
              type="button"
              data-testid="uv-tool-scale"
              onClick={() => {
                onBoxSelectActiveChange(false);
                onTransformToolChange('scale');
              }}
              className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition-colors ${
                !boxSelectActive && transformTool === 'scale'
                  ? 'bg-[#2c313b] text-[#5ecd6e]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
              title="Escalar 2D (S)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Escalar</span>
            </button>
            <button
              type="button"
              data-testid="uv-tool-box"
              onClick={() => onBoxSelectActiveChange(!boxSelectActive)}
              className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-medium transition-colors ${
                boxSelectActive
                  ? 'bg-[#1a2c3d] text-[#38bdf8]'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
              title="Selección por área / caja (B)"
            >
              <SquareDashedMousePointer className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Área</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 bg-[#121418] rounded-md p-0.5 border border-[#2b2e36]">
            <button
              type="button"
              onClick={handleFit01}
              className="h-7 px-2 rounded hover:bg-[#252932] text-[11px] text-[#cbd5e1] flex items-center gap-1 transition-colors"
              title="Ajustar al espacio 0–1"
            >
              <Grid className="w-3.5 h-3.5 text-[#5ecd6e]" />
              <span className="hidden sm:inline">0–1</span>
            </button>
            <button
              type="button"
              onClick={handleFrameAll}
              className="h-7 px-2 rounded hover:bg-[#252932] text-[11px] text-[#cbd5e1] flex items-center gap-1 transition-colors"
              title="Encuadrar islas UV"
            >
              <Maximize className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="hidden sm:inline">Encuadrar</span>
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="h-7 px-2 rounded hover:bg-[#252932] text-[11px] text-[#cbd5e1] flex items-center gap-1 transition-colors"
              title="Restablecer vista UV"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#9ca3af]" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z * 1.25))}
              className="w-7 h-7 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-bold text-[#e4e6eb] flex items-center justify-center"
              title="Acercar Zoom UV"
            >
              +
            </button>
            <span className="font-mono-tabular text-[11px] text-[#5ecd6e] w-11 text-center">
              {Math.round((zoom / 340) * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z * 0.8))}
              className="w-7 h-7 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-bold text-[#e4e6eb] flex items-center justify-center"
              title="Alejar Zoom UV"
            >
              -
            </button>
          </div>
        </div>
      </div>

      {/* Interactive 2D Canvas Area */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <div className="pointer-events-none absolute top-2 left-2 z-10 px-2 py-1 rounded bg-[#111317]/80 border border-[#2a2e38] text-[10px] font-semibold text-[#cbd5e1]">
          Mapa UV
        </div>
        <canvas
          ref={canvasRef}
          data-testid="uv-editor-canvas"
          className={`w-full h-full touch-none block ${
            spacePressed
              ? 'cursor-grab active:cursor-grabbing'
              : placeCursorMode
                ? 'cursor-cell'
                : 'cursor-crosshair'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => {
            e.preventDefault();
            const [mx, my] = toLocalCoords(e.clientX, e.clientY);
            const vp = getViewportTransform();
            const factor = e.deltaY < 0 ? 1.15 : 0.87;
            const nextZoom = clampZoom(vp.zoom * factor);
            const [u, v] = canvasLocalToUV(mx, my, vp);
            const nextPanX = mx - u * nextZoom;
            const nextPanY = vp.canvasHeight - my - v * nextZoom;
            setZoom(nextZoom);
            setPan([nextPanX, nextPanY]);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />

        {longPressShiftActive && (
          <div
            data-testid="uv-longpress-shift-indicator"
            className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#16261a]/95 border border-[#5ecd6e] text-[10px] font-bold tracking-wide text-[#7def8e] pointer-events-none shadow-lg"
          >
            SHIFT (Mantener)
          </div>
        )}

        {placeCursorMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#112738]/95 border border-[#38bdf8]/70 text-[11px] font-semibold text-[#bae6fd] flex items-center gap-1.5 pointer-events-none shadow-lg">
            <Crosshair className="w-3.5 h-3.5" />
            <span>Toca dentro del plano UV para situar el pivote 2D</span>
          </div>
        )}

        {liveTransformInfo && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-[#181a1f]/95 border border-[#5ecd6e]/70 text-[11px] font-mono-tabular font-semibold text-[#7def8e] pointer-events-none shadow-lg">
            {liveTransformInfo}
          </div>
        )}
      </div>
    </div>
  );
});

UVEditorCanvas.displayName = 'UVEditorCanvas';
