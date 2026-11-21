/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditableMesh, MeshFace, Vec2 } from '../mesh/EditableMesh';
import { computeDerivedEditSelection, EditSelectionMode } from '../mesh/operations';
import { UVIsland, UVPivotMode, UVSelectionState, UVSelectMode } from './types';
import { extractUVIslands } from './uvUnwrap';

export interface UVViewportTransform {
  pan: Vec2;
  zoom: number;
  canvasHeight: number;
}

export interface UVBoxRect {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

/**
 * Converts canvas-local CSS pixel coordinates (x from left, y from top) to UV coordinates.
 * Screen mapping:
 *   sx = pan[0] + u * zoom
 *   sy = canvasHeight - pan[1] - v * zoom
 */
export function canvasLocalToUV(
  localX: number,
  localY: number,
  vp: UVViewportTransform,
): Vec2 {
  const safeZoom = Math.max(1e-6, vp.zoom);
  return [
    (localX - vp.pan[0]) / safeZoom,
    (vp.canvasHeight - vp.pan[1] - localY) / safeZoom,
  ];
}

/**
 * Converts UV coordinates to canvas-local CSS pixel coordinates.
 */
export function uvToCanvasLocal(
  u: number,
  v: number,
  vp: UVViewportTransform,
): Vec2 {
  return [
    vp.pan[0] + u * vp.zoom,
    vp.canvasHeight - vp.pan[1] - v * vp.zoom,
  ];
}

export function makeUVVertexKey(faceId: string, vertexId: string): string {
  return `${faceId}::${vertexId}`;
}

export function makeUVEdgeKey(faceId: string, cornerIndex: number): string {
  return `${faceId}::${cornerIndex}`;
}

export function parseUVEdgeKey(
  key: string,
): { faceId: string; cornerIndex: number } | null {
  const sep = key.lastIndexOf('::');
  if (sep <= 0) return null;
  const faceId = key.slice(0, sep);
  const idx = parseInt(key.slice(sep + 2), 10);
  if (!Number.isFinite(idx) || idx < 0) return null;
  return { faceId, cornerIndex: idx };
}

export function createEmptyUVSelection(
  mode: UVSelectMode = 'vertex',
): UVSelectionState {
  return {
    mode,
    selectedVertexKeys: new Set<string>(),
    selectedEdgeKeys: new Set<string>(),
    selectedFaceIds: new Set<string>(),
    selectedIslandIds: new Set<string>(),
    pinnedVertexKeys: new Set<string>(),
  };
}

export function hasAnyUVSelection(selection: UVSelectionState): boolean {
  switch (selection.mode) {
    case 'vertex':
      return selection.selectedVertexKeys.size > 0;
    case 'edge':
      return selection.selectedEdgeKeys.size > 0;
    case 'face':
      return selection.selectedFaceIds.size > 0;
    case 'island':
      return selection.selectedIslandIds.size > 0;
  }
}

export function getUVSelectionCount(selection: UVSelectionState): number {
  switch (selection.mode) {
    case 'vertex':
      return selection.selectedVertexKeys.size;
    case 'edge':
      return selection.selectedEdgeKeys.size;
    case 'face':
      return selection.selectedFaceIds.size;
    case 'island':
      return selection.selectedIslandIds.size;
  }
}

/* ============================================================================
 * 2D Geometry & Hit-Testing Helpers
 * ========================================================================== */

export function distPointToSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-12) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

export function pointInPolygon2D(u: number, v: number, poly: Vec2[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > v !== yj > v &&
      u < ((xj - xi) * (v - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect2D(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (o1 === 0 && cx >= Math.min(ax, bx) && cx <= Math.max(ax, bx) && cy >= Math.min(ay, by) && cy <= Math.max(ay, by)) return true;
  if (o2 === 0 && dx >= Math.min(ax, bx) && dx <= Math.max(ax, bx) && dy >= Math.min(ay, by) && dy <= Math.max(ay, by)) return true;
  if (o3 === 0 && ax >= Math.min(cx, dx) && ax <= Math.max(cx, dx) && ay >= Math.min(cy, dy) && ay <= Math.max(cy, dy)) return true;
  if (o4 === 0 && bx >= Math.min(cx, dx) && bx <= Math.max(cx, dx) && by >= Math.min(cy, dy) && by <= Math.max(cy, dy)) return true;
  return false;
}

export function segmentIntersectsRect2D(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rect: UVBoxRect,
): boolean {
  if (
    Math.max(ax, bx) < rect.minU ||
    Math.min(ax, bx) > rect.maxU ||
    Math.max(ay, by) < rect.minV ||
    Math.min(ay, by) > rect.maxV
  ) {
    return false;
  }
  if (
    (ax >= rect.minU && ax <= rect.maxU && ay >= rect.minV && ay <= rect.maxV) ||
    (bx >= rect.minU && bx <= rect.maxU && by >= rect.minV && by <= rect.maxV)
  ) {
    return true;
  }
  return (
    segmentsIntersect2D(ax, ay, bx, by, rect.minU, rect.minV, rect.maxU, rect.minV) ||
    segmentsIntersect2D(ax, ay, bx, by, rect.maxU, rect.minV, rect.maxU, rect.maxV) ||
    segmentsIntersect2D(ax, ay, bx, by, rect.maxU, rect.maxV, rect.minU, rect.maxV) ||
    segmentsIntersect2D(ax, ay, bx, by, rect.minU, rect.maxV, rect.minU, rect.minV)
  );
}

export function polygonIntersectsRect2D(poly: Vec2[], rect: UVBoxRect): boolean {
  if (poly.length === 0) return false;
  let pMinU = Infinity;
  let pMinV = Infinity;
  let pMaxU = -Infinity;
  let pMaxV = -Infinity;
  for (const p of poly) {
    pMinU = Math.min(pMinU, p[0]);
    pMinV = Math.min(pMinV, p[1]);
    pMaxU = Math.max(pMaxU, p[0]);
    pMaxV = Math.max(pMaxV, p[1]);
    if (
      p[0] >= rect.minU &&
      p[0] <= rect.maxU &&
      p[1] >= rect.minV &&
      p[1] <= rect.maxV
    ) {
      return true;
    }
  }
  if (pMaxU < rect.minU || pMinU > rect.maxU || pMaxV < rect.minV || pMinV > rect.maxV) {
    return false;
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (segmentIntersectsRect2D(a[0], a[1], b[0], b[1], rect)) {
      return true;
    }
  }
  // Check if rect is completely inside polygon
  const centerU = (rect.minU + rect.maxU) * 0.5;
  const centerV = (rect.minV + rect.maxV) * 0.5;
  return pointInPolygon2D(centerU, centerV, poly);
}

/**
 * Finds all vertex keys coincident with `(targetVid, targetUV)` so editing shared interior UV vertices doesn't split faces unless seams differ.
 */
function findCoincidentVertexKeys(
  mesh: EditableMesh,
  face: MeshFace,
  cornerIdx: number,
  tolerance = 1e-4,
): string[] {
  const vid = face.vertexIds[cornerIdx];
  const uv = face.uvs?.[cornerIdx];
  if (!vid || !uv) return [];
  const keys: string[] = [];
  for (const f of mesh.faces) {
    if (!f.uvs) continue;
    for (let i = 0; i < f.vertexIds.length; i++) {
      if (f.vertexIds[i] !== vid) continue;
      const other = f.uvs[i];
      if (other && Math.hypot(other[0] - uv[0], other[1] - uv[1]) <= tolerance) {
        keys.push(makeUVVertexKey(f.id, f.vertexIds[i]));
      }
    }
  }
  return keys;
}

/**
 * Finds all edge keys sharing the same 3D vertex pair and overlapping UV endpoints.
 */
function findCoincidentEdgeKeys(
  mesh: EditableMesh,
  face: MeshFace,
  cornerIdx: number,
  tolerance = 1e-4,
): string[] {
  const n = face.vertexIds.length;
  if (!face.uvs || n < 2) return [];
  const va = face.vertexIds[cornerIdx];
  const vb = face.vertexIds[(cornerIdx + 1) % n];
  const uva = face.uvs[cornerIdx];
  const uvb = face.uvs[(cornerIdx + 1) % n];
  if (!uva || !uvb) return [];

  const keys: string[] = [];
  for (const f of mesh.faces) {
    if (!f.uvs) continue;
    const m = f.vertexIds.length;
    for (let i = 0; i < m; i++) {
      const ca = f.vertexIds[i];
      const cb = f.vertexIds[(i + 1) % m];
      const ua = f.uvs[i];
      const ub = f.uvs[(i + 1) % m];
      if (!ua || !ub) continue;
      const forward =
        ca === va &&
        cb === vb &&
        Math.hypot(ua[0] - uva[0], ua[1] - uva[1]) <= tolerance &&
        Math.hypot(ub[0] - uvb[0], ub[1] - uvb[1]) <= tolerance;
      const reverse =
        ca === vb &&
        cb === va &&
        Math.hypot(ua[0] - uvb[0], ua[1] - uvb[1]) <= tolerance &&
        Math.hypot(ub[0] - uva[0], ub[1] - uva[1]) <= tolerance;
      if (forward || reverse) {
        keys.push(makeUVEdgeKey(f.id, i));
      }
    }
  }
  return keys;
}

export interface UVHitResult {
  keys: string[];
  primaryKey: string;
}

/**
 * Accurate zoom-adaptive UV hit-testing across all 4 selection modes.
 */
export function hitTestUVElement(
  mesh: EditableMesh,
  mode: UVSelectMode,
  u: number,
  v: number,
  zoom: number,
  options?: {
    islands?: UVIsland[];
    keepConnected?: boolean;
    vertexRadiusPx?: number;
    edgeRadiusPx?: number;
  },
): UVHitResult | null {
  const safeZoom = Math.max(1e-6, zoom);
  const keepConnected = options?.keepConnected ?? true;
  const vertexThresholdUV = (options?.vertexRadiusPx ?? 16) / safeZoom;
  const edgeThresholdUV = (options?.edgeRadiusPx ?? 12) / safeZoom;

  if (mode === 'vertex') {
    let bestFace: MeshFace | null = null;
    let bestCorner = -1;
    let minDist = vertexThresholdUV;

    for (const f of mesh.faces) {
      if (!f.uvs) continue;
      for (let i = 0; i < f.uvs.length; i++) {
        const uv = f.uvs[i];
        const d = Math.hypot(uv[0] - u, uv[1] - v);
        if (d < minDist) {
          minDist = d;
          bestFace = f;
          bestCorner = i;
        }
      }
    }

    if (!bestFace || bestCorner < 0) return null;
    const primaryKey = makeUVVertexKey(bestFace.id, bestFace.vertexIds[bestCorner]);
    const keys = keepConnected
      ? findCoincidentVertexKeys(mesh, bestFace, bestCorner)
      : [primaryKey];
    return {
      primaryKey,
      keys: keys.length > 0 ? keys : [primaryKey],
    };
  }

  if (mode === 'edge') {
    let bestFace: MeshFace | null = null;
    let bestCorner = -1;
    let minDist = edgeThresholdUV;

    for (const f of mesh.faces) {
      if (!f.uvs || f.uvs.length < 2) continue;
      const n = f.uvs.length;
      for (let i = 0; i < n; i++) {
        const a = f.uvs[i];
        const b = f.uvs[(i + 1) % n];
        const d = distPointToSegment2D(u, v, a[0], a[1], b[0], b[1]);
        if (d < minDist) {
          minDist = d;
          bestFace = f;
          bestCorner = i;
        }
      }
    }

    if (!bestFace || bestCorner < 0) return null;
    const primaryKey = makeUVEdgeKey(bestFace.id, bestCorner);
    const keys = keepConnected
      ? findCoincidentEdgeKeys(mesh, bestFace, bestCorner)
      : [primaryKey];
    return {
      primaryKey,
      keys: keys.length > 0 ? keys : [primaryKey],
    };
  }

  if (mode === 'face') {
    for (const f of mesh.faces) {
      if (!f.uvs || f.uvs.length < 3) continue;
      if (pointInPolygon2D(u, v, f.uvs)) {
        return { primaryKey: f.id, keys: [f.id] };
      }
    }
    return null;
  }

  // island mode: test point-in-polygon against each face and map to its island
  const islands = options?.islands ?? extractUVIslands(mesh);
  const faceToIsland = new Map<string, string>();
  for (const isl of islands) {
    for (const fid of isl.faceIds) {
      faceToIsland.set(fid, isl.id);
    }
  }
  for (const f of mesh.faces) {
    if (!f.uvs || f.uvs.length < 3) continue;
    if (pointInPolygon2D(u, v, f.uvs)) {
      const islId = faceToIsland.get(f.id);
      if (islId) {
        return { primaryKey: islId, keys: [islId] };
      }
    }
  }
  return null;
}

/**
 * Applies a single click/tap hit result to the UV selection state.
 */
export function applyUVHitSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  hit: UVHitResult | null,
  additive: boolean,
): UVSelectionState {
  if (selection.mode === 'vertex') {
    const next = new Set(additive ? selection.selectedVertexKeys : []);
    if (hit) {
      if (additive) {
        const allPresent = hit.keys.every((k) => next.has(k));
        if (allPresent) hit.keys.forEach((k) => next.delete(k));
        else hit.keys.forEach((k) => next.add(k));
      } else {
        hit.keys.forEach((k) => next.add(k));
      }
    }
    return { ...selection, selectedVertexKeys: next };
  }

  if (selection.mode === 'edge') {
    const next = new Set(additive ? selection.selectedEdgeKeys : []);
    if (hit) {
      if (additive) {
        const allPresent = hit.keys.every((k) => next.has(k));
        if (allPresent) hit.keys.forEach((k) => next.delete(k));
        else hit.keys.forEach((k) => next.add(k));
      } else {
        hit.keys.forEach((k) => next.add(k));
      }
    }
    return { ...selection, selectedEdgeKeys: next };
  }

  if (selection.mode === 'face') {
    const next = new Set(additive ? selection.selectedFaceIds : []);
    if (hit) {
      if (additive && next.has(hit.primaryKey)) next.delete(hit.primaryKey);
      else next.add(hit.primaryKey);
    }
    return { ...selection, selectedFaceIds: next };
  }

  const next = new Set(additive ? selection.selectedIslandIds : []);
  if (hit) {
    if (additive && next.has(hit.primaryKey)) next.delete(hit.primaryKey);
    else next.add(hit.primaryKey);
  }
  return { ...selection, selectedIslandIds: next };
}

/**
 * Checks whether a given UV hit result is already currently selected.
 */
export function isUVHitSelected(
  selection: UVSelectionState,
  hit: UVHitResult | null,
): boolean {
  if (!hit) return false;
  switch (selection.mode) {
    case 'vertex':
      return selection.selectedVertexKeys.has(hit.primaryKey);
    case 'edge':
      return selection.selectedEdgeKeys.has(hit.primaryKey);
    case 'face':
      return selection.selectedFaceIds.has(hit.primaryKey);
    case 'island':
      return selection.selectedIslandIds.has(hit.primaryKey);
  }
}

/**
 * Performs 2D rectangular area / box selection in UV space.
 */
export function boxSelectUVElements(
  mesh: EditableMesh,
  selection: UVSelectionState,
  rect: UVBoxRect,
  additive: boolean,
  islands?: UVIsland[],
): UVSelectionState {
  if (selection.mode === 'vertex') {
    const next = new Set(additive ? selection.selectedVertexKeys : []);
    for (const f of mesh.faces) {
      if (!f.uvs) continue;
      for (let i = 0; i < f.uvs.length; i++) {
        const [u, v] = f.uvs[i];
        if (u >= rect.minU && u <= rect.maxU && v >= rect.minV && v <= rect.maxV) {
          next.add(makeUVVertexKey(f.id, f.vertexIds[i]));
        }
      }
    }
    return { ...selection, selectedVertexKeys: next };
  }

  if (selection.mode === 'edge') {
    const next = new Set(additive ? selection.selectedEdgeKeys : []);
    for (const f of mesh.faces) {
      if (!f.uvs || f.uvs.length < 2) continue;
      const n = f.uvs.length;
      for (let i = 0; i < n; i++) {
        const a = f.uvs[i];
        const b = f.uvs[(i + 1) % n];
        if (segmentIntersectsRect2D(a[0], a[1], b[0], b[1], rect)) {
          next.add(makeUVEdgeKey(f.id, i));
        }
      }
    }
    return { ...selection, selectedEdgeKeys: next };
  }

  if (selection.mode === 'face') {
    const next = new Set(additive ? selection.selectedFaceIds : []);
    for (const f of mesh.faces) {
      if (!f.uvs || f.uvs.length < 3) continue;
      if (polygonIntersectsRect2D(f.uvs, rect)) {
        next.add(f.id);
      }
    }
    return { ...selection, selectedFaceIds: next };
  }

  const allIslands = islands ?? extractUVIslands(mesh);
  const faceToIsland = new Map<string, string>();
  for (const isl of allIslands) {
    for (const fid of isl.faceIds) faceToIsland.set(fid, isl.id);
  }
  const next = new Set(additive ? selection.selectedIslandIds : []);
  for (const f of mesh.faces) {
    if (!f.uvs || f.uvs.length < 3) continue;
    if (polygonIntersectsRect2D(f.uvs, rect)) {
      const islId = faceToIsland.get(f.id);
      if (islId) next.add(islId);
    }
  }
  return { ...selection, selectedIslandIds: next };
}

export function selectAllUV(
  mesh: EditableMesh,
  selection: UVSelectionState,
  islands?: UVIsland[],
): UVSelectionState {
  if (selection.mode === 'vertex') {
    const next = new Set<string>();
    for (const f of mesh.faces) {
      for (const vid of f.vertexIds) next.add(makeUVVertexKey(f.id, vid));
    }
    return { ...selection, selectedVertexKeys: next };
  }
  if (selection.mode === 'edge') {
    const next = new Set<string>();
    for (const f of mesh.faces) {
      for (let i = 0; i < f.vertexIds.length; i++) next.add(makeUVEdgeKey(f.id, i));
    }
    return { ...selection, selectedEdgeKeys: next };
  }
  if (selection.mode === 'face') {
    return {
      ...selection,
      selectedFaceIds: new Set(mesh.faces.map((f) => f.id)),
    };
  }
  const allIslands = islands ?? extractUVIslands(mesh);
  return {
    ...selection,
    selectedIslandIds: new Set(allIslands.map((isl) => isl.id)),
  };
}

export function deselectAllUV(selection: UVSelectionState): UVSelectionState {
  switch (selection.mode) {
    case 'vertex':
      return { ...selection, selectedVertexKeys: new Set() };
    case 'edge':
      return { ...selection, selectedEdgeKeys: new Set() };
    case 'face':
      return { ...selection, selectedFaceIds: new Set() };
    case 'island':
      return { ...selection, selectedIslandIds: new Set() };
  }
}

export function invertUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  islands?: UVIsland[],
): UVSelectionState {
  if (selection.mode === 'vertex') {
    const next = new Set<string>();
    for (const f of mesh.faces) {
      for (const vid of f.vertexIds) {
        const key = makeUVVertexKey(f.id, vid);
        if (!selection.selectedVertexKeys.has(key)) next.add(key);
      }
    }
    return { ...selection, selectedVertexKeys: next };
  }
  if (selection.mode === 'edge') {
    const next = new Set<string>();
    for (const f of mesh.faces) {
      for (let i = 0; i < f.vertexIds.length; i++) {
        const key = makeUVEdgeKey(f.id, i);
        if (!selection.selectedEdgeKeys.has(key)) next.add(key);
      }
    }
    return { ...selection, selectedEdgeKeys: next };
  }
  if (selection.mode === 'face') {
    const next = new Set<string>();
    for (const f of mesh.faces) {
      if (!selection.selectedFaceIds.has(f.id)) next.add(f.id);
    }
    return { ...selection, selectedFaceIds: next };
  }
  const allIslands = islands ?? extractUVIslands(mesh);
  const next = new Set<string>();
  for (const isl of allIslands) {
    if (!selection.selectedIslandIds.has(isl.id)) next.add(isl.id);
  }
  return { ...selection, selectedIslandIds: next };
}

/* ============================================================================
 * 3D <-> UV Selection Synchronization
 * ========================================================================== */

export function syncUVSelectionFrom3D(
  mesh: EditableMesh,
  editSelectionMode: EditSelectionMode,
  selected3DIds: Set<string>,
  targetMode?: UVSelectMode,
  islands?: UVIsland[],
): UVSelectionState {
  const mode: UVSelectMode = targetMode ?? editSelectionMode;
  const derived = computeDerivedEditSelection(mesh, editSelectionMode, selected3DIds);
  const next = createEmptyUVSelection(mode);

  if (mode === 'vertex') {
    for (const f of mesh.faces) {
      for (const vid of f.vertexIds) {
        if (derived.vertexIds.has(vid)) {
          next.selectedVertexKeys.add(makeUVVertexKey(f.id, vid));
        }
      }
    }
    return next;
  }

  if (mode === 'edge') {
    const selectedEdgePairs = new Set<string>();
    for (const eid of derived.edgeIds) {
      const e = mesh.getEdge(eid);
      if (e) {
        selectedEdgePairs.add(
          e.v0 < e.v1 ? `${e.v0}::${e.v1}` : `${e.v1}::${e.v0}`,
        );
      }
    }
    for (const f of mesh.faces) {
      const n = f.vertexIds.length;
      for (let i = 0; i < n; i++) {
        const a = f.vertexIds[i];
        const b = f.vertexIds[(i + 1) % n];
        const pk = a < b ? `${a}::${b}` : `${b}::${a}`;
        if (selectedEdgePairs.has(pk)) {
          next.selectedEdgeKeys.add(makeUVEdgeKey(f.id, i));
        }
      }
    }
    return next;
  }

  if (mode === 'face') {
    next.selectedFaceIds = new Set(derived.faceIds);
    return next;
  }

  const allIslands = islands ?? extractUVIslands(mesh);
  for (const isl of allIslands) {
    if (isl.faceIds.some((fid) => derived.faceIds.has(fid))) {
      next.selectedIslandIds.add(isl.id);
    }
  }
  return next;
}

export function sync3DSelectionFromUV(
  mesh: EditableMesh,
  selection: UVSelectionState,
  islands?: UVIsland[],
): { mode: EditSelectionMode; ids: Set<string> } {
  if (selection.mode === 'vertex') {
    const vertexIds = new Set<string>();
    for (const key of selection.selectedVertexKeys) {
      const sep = key.lastIndexOf('::');
      if (sep > 0) vertexIds.add(key.slice(sep + 2));
    }
    return { mode: 'vertex', ids: vertexIds };
  }

  if (selection.mode === 'edge') {
    const faceMap = new Map<string, MeshFace>();
    for (const f of mesh.faces) faceMap.set(f.id, f);
    const pairToEdgeId = new Map<string, string>();
    for (const e of mesh.edges) {
      pairToEdgeId.set(e.v0 < e.v1 ? `${e.v0}::${e.v1}` : `${e.v1}::${e.v0}`, e.id);
    }
    const edgeIds = new Set<string>();
    for (const key of selection.selectedEdgeKeys) {
      const parsed = parseUVEdgeKey(key);
      if (!parsed) continue;
      const face = faceMap.get(parsed.faceId);
      if (!face) continue;
      const va = face.vertexIds[parsed.cornerIndex];
      const vb = face.vertexIds[(parsed.cornerIndex + 1) % face.vertexIds.length];
      const eid = pairToEdgeId.get(va < vb ? `${va}::${vb}` : `${vb}::${va}`);
      if (eid) edgeIds.add(eid);
    }
    return { mode: 'edge', ids: edgeIds };
  }

  if (selection.mode === 'face') {
    return { mode: 'face', ids: new Set(selection.selectedFaceIds) };
  }

  const allIslands = islands ?? extractUVIslands(mesh);
  const faceIds = new Set<string>();
  for (const isl of allIslands) {
    if (selection.selectedIslandIds.has(isl.id)) {
      for (const fid of isl.faceIds) faceIds.add(fid);
    }
  }
  return { mode: 'face', ids: faceIds };
}

/* ============================================================================
 * Selection Corner Resolution & 2D Transformations
 * ========================================================================== */

export interface SelectedCornerRef {
  face: MeshFace;
  cornerIdx: number;
  groupId: string;
}

/**
 * Resolves the exact list of `(face, cornerIdx)` UV entries targeted by `selection`
 * across all 4 modes (`vertex`, `edge`, `face`, `island`).
 */
export function collectSelectedUVCornerRefs(
  mesh: EditableMesh,
  selection: UVSelectionState,
  islands?: UVIsland[],
): SelectedCornerRef[] {
  const refs: SelectedCornerRef[] = [];
  const seen = new Set<string>();

  if (selection.mode === 'vertex') {
    for (const f of mesh.faces) {
      if (!f.uvs) continue;
      for (let i = 0; i < f.vertexIds.length; i++) {
        const key = makeUVVertexKey(f.id, f.vertexIds[i]);
        if (selection.selectedVertexKeys.has(key)) {
          const cid = `${f.id}#${i}`;
          if (!seen.has(cid)) {
            seen.add(cid);
            refs.push({ face: f, cornerIdx: i, groupId: key });
          }
        }
      }
    }
    return refs;
  }

  if (selection.mode === 'edge') {
    const faceMap = new Map<string, MeshFace>();
    for (const f of mesh.faces) faceMap.set(f.id, f);
    for (const key of selection.selectedEdgeKeys) {
      const parsed = parseUVEdgeKey(key);
      if (!parsed) continue;
      const f = faceMap.get(parsed.faceId);
      if (!f || !f.uvs) continue;
      const n = f.vertexIds.length;
      if (parsed.cornerIndex >= n) continue;
      const c0 = parsed.cornerIndex;
      const c1 = (c0 + 1) % n;
      for (const c of [c0, c1]) {
        const cid = `${f.id}#${c}`;
        if (!seen.has(cid)) {
          seen.add(cid);
          refs.push({ face: f, cornerIdx: c, groupId: f.id });
        }
      }
    }
    return refs;
  }

  if (selection.mode === 'face') {
    for (const f of mesh.faces) {
      if (!f.uvs || !selection.selectedFaceIds.has(f.id)) continue;
      for (let i = 0; i < f.vertexIds.length; i++) {
        refs.push({ face: f, cornerIdx: i, groupId: f.id });
      }
    }
    return refs;
  }

  // island mode
  const allIslands = islands ?? extractUVIslands(mesh);
  const faceToSelectedIsland = new Map<string, string>();
  for (const isl of allIslands) {
    if (selection.selectedIslandIds.has(isl.id)) {
      for (const fid of isl.faceIds) faceToSelectedIsland.set(fid, isl.id);
    }
  }
  for (const f of mesh.faces) {
    const islId = faceToSelectedIsland.get(f.id);
    if (!f.uvs || !islId) continue;
    for (let i = 0; i < f.vertexIds.length; i++) {
      refs.push({ face: f, cornerIdx: i, groupId: islId });
    }
  }
  return refs;
}

export function getUVSelectionBounds(
  mesh: EditableMesh,
  selection: UVSelectionState,
  islands?: UVIsland[],
): {
  count: number;
  center: Vec2;
  min: Vec2;
  max: Vec2;
} {
  const refs = collectSelectedUVCornerRefs(mesh, selection, islands);
  if (refs.length === 0) {
    return { count: 0, center: [0.5, 0.5], min: [0.5, 0.5], max: [0.5, 0.5] };
  }
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const r of refs) {
    const uv = r.face.uvs?.[r.cornerIdx];
    if (!uv) continue;
    minU = Math.min(minU, uv[0]);
    minV = Math.min(minV, uv[1]);
    maxU = Math.max(maxU, uv[0]);
    maxV = Math.max(maxV, uv[1]);
  }
  return {
    count: refs.length,
    center: [(minU + maxU) * 0.5, (minV + maxV) * 0.5],
    min: [minU, minV],
    max: [maxU, maxV],
  };
}

export function computeUVPivotPoint(
  mesh: EditableMesh,
  selection: UVSelectionState,
  pivotMode: UVPivotMode,
  cursorUV: Vec2,
  islands?: UVIsland[],
): Vec2 {
  if (pivotMode === 'cursor') {
    return [cursorUV[0], cursorUV[1]];
  }
  return getUVSelectionBounds(mesh, selection, islands).center;
}

export function translateUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  dx: number,
  dy: number,
  islands?: UVIsland[],
): void {
  const refs = collectSelectedUVCornerRefs(mesh, selection, islands);
  for (const r of refs) {
    if (!r.face.uvs) continue;
    r.face.uvs[r.cornerIdx][0] += dx;
    r.face.uvs[r.cornerIdx][1] += dy;
  }
}

export function rotateUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  angleRad: number,
  pivot: Vec2,
  options?: { pivotMode?: UVPivotMode; islands?: UVIsland[] },
): void {
  const refs = collectSelectedUVCornerRefs(mesh, selection, options?.islands);
  if (refs.length === 0) return;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  if (options?.pivotMode === 'individual') {
    const groupCentroids = computeGroupCentroids(refs);
    for (const r of refs) {
      if (!r.face.uvs) continue;
      const gp = groupCentroids.get(r.groupId) ?? pivot;
      const u = r.face.uvs[r.cornerIdx][0] - gp[0];
      const v = r.face.uvs[r.cornerIdx][1] - gp[1];
      r.face.uvs[r.cornerIdx][0] = gp[0] + (u * cos - v * sin);
      r.face.uvs[r.cornerIdx][1] = gp[1] + (u * sin + v * cos);
    }
    return;
  }

  for (const r of refs) {
    if (!r.face.uvs) continue;
    const u = r.face.uvs[r.cornerIdx][0] - pivot[0];
    const v = r.face.uvs[r.cornerIdx][1] - pivot[1];
    r.face.uvs[r.cornerIdx][0] = pivot[0] + (u * cos - v * sin);
    r.face.uvs[r.cornerIdx][1] = pivot[1] + (u * sin + v * cos);
  }
}

export function scaleUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  sx: number,
  sy: number,
  pivot: Vec2,
  options?: { pivotMode?: UVPivotMode; islands?: UVIsland[] },
): void {
  const refs = collectSelectedUVCornerRefs(mesh, selection, options?.islands);
  if (refs.length === 0) return;

  if (options?.pivotMode === 'individual') {
    const groupCentroids = computeGroupCentroids(refs);
    for (const r of refs) {
      if (!r.face.uvs) continue;
      const gp = groupCentroids.get(r.groupId) ?? pivot;
      r.face.uvs[r.cornerIdx][0] = gp[0] + (r.face.uvs[r.cornerIdx][0] - gp[0]) * sx;
      r.face.uvs[r.cornerIdx][1] = gp[1] + (r.face.uvs[r.cornerIdx][1] - gp[1]) * sy;
    }
    return;
  }

  for (const r of refs) {
    if (!r.face.uvs) continue;
    r.face.uvs[r.cornerIdx][0] = pivot[0] + (r.face.uvs[r.cornerIdx][0] - pivot[0]) * sx;
    r.face.uvs[r.cornerIdx][1] = pivot[1] + (r.face.uvs[r.cornerIdx][1] - pivot[1]) * sy;
  }
}

export function mirrorUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  horizontal: boolean,
  vertical: boolean,
  pivot: Vec2,
  options?: { pivotMode?: UVPivotMode; islands?: UVIsland[] },
): void {
  scaleUVSelection(mesh, selection, horizontal ? -1 : 1, vertical ? -1 : 1, pivot, options);
}

function computeGroupCentroids(refs: SelectedCornerRef[]): Map<string, Vec2> {
  const acc = new Map<string, { su: number; sv: number; count: number }>();
  for (const r of refs) {
    const uv = r.face.uvs?.[r.cornerIdx];
    if (!uv) continue;
    let entry = acc.get(r.groupId);
    if (!entry) {
      entry = { su: 0, sv: 0, count: 0 };
      acc.set(r.groupId, entry);
    }
    entry.su += uv[0];
    entry.sv += uv[1];
    entry.count += 1;
  }
  const out = new Map<string, Vec2>();
  for (const [k, v] of acc.entries()) {
    out.set(k, [v.su / Math.max(1, v.count), v.sv / Math.max(1, v.count)]);
  }
  return out;
}

/**
 * Generates a procedural checkerboard data URL for UV checker verification.
 */
export function generateCheckerTextureUrl(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const size = 64;
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const isDark = (x / size + y / size) % 2 === 0;
      ctx.fillStyle = isDark ? '#2c313b' : '#5ecd6e';
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = '#181a1f';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, size, size);
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('0,0', 8, 20);
  ctx.fillText('1,0', 470, 20);
  ctx.fillText('0,1', 8, 500);
  ctx.fillText('1,1', 470, 500);

  return canvas.toDataURL('image/png');
}

/* ============================================================================
 * Module 2: UV Topological Loops, Shortest Path & UV-Only Vertex Weld
 * ========================================================================== */

export function parseUVVertexKey(
  key: string,
): { faceId: string; vertexId: string } | null {
  const sep = key.lastIndexOf('::');
  if (sep <= 0) return null;
  const faceId = key.slice(0, sep);
  const vertexId = key.slice(sep + 2);
  if (!faceId || !vertexId) return null;
  return { faceId, vertexId };
}

interface UVTopoNode {
  id: number;
  vertexId: string;
  vertexKeys: string[];
  edgeIds: number[];
  faceIds: Set<string>;
}

interface UVTopoEdge {
  id: number;
  n0: number;
  n1: number;
  edgeKeys: string[];
  faceRefs: { face: MeshFace; cornerIndex: number }[];
}

interface UVTopologyGraph {
  nodes: UVTopoNode[];
  edges: UVTopoEdge[];
  vertexKeyToNode: Map<string, number>;
  edgeKeyToEdge: Map<string, number>;
  faceById: Map<string, MeshFace>;
}

function buildUVTopologyGraph(
  mesh: EditableMesh,
  tolerance = 1e-4,
): UVTopologyGraph {
  const nodes: UVTopoNode[] = [];
  const edges: UVTopoEdge[] = [];
  const vertexKeyToNode = new Map<string, number>();
  const edgeKeyToEdge = new Map<string, number>();
  const faceById = new Map<string, MeshFace>();
  const nodesByVertId = new Map<string, { nodeId: number; uv: Vec2 }[]>();

  for (const f of mesh.faces) {
    faceById.set(f.id, f);
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;
    for (let i = 0; i < f.vertexIds.length; i++) {
      const vid = f.vertexIds[i];
      const uv = f.uvs[i];
      const vKey = makeUVVertexKey(f.id, vid);
      let candidates = nodesByVertId.get(vid);
      if (!candidates) {
        candidates = [];
        nodesByVertId.set(vid, candidates);
      }
      let foundId = -1;
      for (const c of candidates) {
        if (Math.hypot(c.uv[0] - uv[0], c.uv[1] - uv[1]) <= tolerance) {
          foundId = c.nodeId;
          break;
        }
      }
      if (foundId < 0) {
        foundId = nodes.length;
        nodes.push({
          id: foundId,
          vertexId: vid,
          vertexKeys: [vKey],
          edgeIds: [],
          faceIds: new Set([f.id]),
        });
        candidates.push({ nodeId: foundId, uv: [uv[0], uv[1]] });
      } else {
        nodes[foundId].vertexKeys.push(vKey);
        nodes[foundId].faceIds.add(f.id);
      }
      vertexKeyToNode.set(vKey, foundId);
    }
  }

  const edgePairMap = new Map<string, number>();
  for (const f of mesh.faces) {
    if (!f.uvs || f.uvs.length < 2) continue;
    const n = f.vertexIds.length;
    for (let i = 0; i < n; i++) {
      const va = f.vertexIds[i];
      const vb = f.vertexIds[(i + 1) % n];
      const na = vertexKeyToNode.get(makeUVVertexKey(f.id, va));
      const nb = vertexKeyToNode.get(makeUVVertexKey(f.id, vb));
      if (na === undefined || nb === undefined || na === nb) continue;
      const pairKey = na < nb ? `${na}|${nb}` : `${nb}|${na}`;
      let edgeIdx = edgePairMap.get(pairKey);
      const eKey = makeUVEdgeKey(f.id, i);
      if (edgeIdx === undefined) {
        edgeIdx = edges.length;
        edges.push({
          id: edgeIdx,
          n0: Math.min(na, nb),
          n1: Math.max(na, nb),
          edgeKeys: [eKey],
          faceRefs: [{ face: f, cornerIndex: i }],
        });
        edgePairMap.set(pairKey, edgeIdx);
        nodes[na].edgeIds.push(edgeIdx);
        nodes[nb].edgeIds.push(edgeIdx);
      } else {
        edges[edgeIdx].edgeKeys.push(eKey);
        edges[edgeIdx].faceRefs.push({ face: f, cornerIndex: i });
      }
      edgeKeyToEdge.set(eKey, edgeIdx);
    }
  }

  return { nodes, edges, vertexKeyToNode, edgeKeyToEdge, faceById };
}

function findNextUVLoopEdgeAtNode(
  topo: UVTopologyGraph,
  currEdgeIdx: number,
  nodeIdx: number,
): number | null {
  const currEdge = topo.edges[currEdgeIdx];
  const node = topo.nodes[nodeIdx];
  if (!currEdge || !node) return null;

  const currFaceIds = new Set(currEdge.faceRefs.map((r) => r.face.id));
  if (currEdge.faceRefs.length > 2) return null;

  // Boundary UV edge (1 adjacent face in UV island)
  if (currEdge.faceRefs.length === 1) {
    const boundaryCandidates = node.edgeIds.filter(
      (eid) => eid !== currEdgeIdx && topo.edges[eid].faceRefs.length === 1,
    );
    return boundaryCandidates.length === 1 ? boundaryCandidates[0] : null;
  }

  // Interior 4-valence UV manifold node
  if (node.edgeIds.length === 4 && node.faceIds.size === 4) {
    for (const eid of node.edgeIds) {
      if (topo.edges[eid].faceRefs.length !== 2) return null;
    }
    const opposite = node.edgeIds.filter((eid) => {
      if (eid === currEdgeIdx) return false;
      return !topo.edges[eid].faceRefs.some((r) => currFaceIds.has(r.face.id));
    });
    return opposite.length === 1 ? opposite[0] : null;
  }

  // Valence-3 N-gon rim
  if (node.edgeIds.length === 3 && node.faceIds.size === 3) {
    const ngons = currEdge.faceRefs.filter((r) => r.face.vertexIds.length > 4);
    const quads = currEdge.faceRefs.filter((r) => r.face.vertexIds.length === 4);
    if (ngons.length === 1 && quads.length === 1) {
      const ngonId = ngons[0].face.id;
      const other = node.edgeIds.find(
        (eid) =>
          eid !== currEdgeIdx &&
          topo.edges[eid].faceRefs.some((r) => r.face.id === ngonId),
      );
      if (other !== undefined && topo.edges[other].faceRefs.length === 2) {
        return other;
      }
    }
  }

  return null;
}

export interface UVLoopCandidate {
  keys: string[];
  isClosed: boolean;
}

export function findUVVertexLoopDirections(
  mesh: EditableMesh,
  primaryVertexKey: string,
  keepConnected = true,
): { valid: boolean; loops: UVLoopCandidate[]; reason?: string } {
  const topo = buildUVTopologyGraph(mesh);
  const seedNodeIdx = topo.vertexKeyToNode.get(primaryVertexKey);
  if (seedNodeIdx === undefined) {
    return { valid: false, loops: [{ keys: [primaryVertexKey], isClosed: false }] };
  }
  const seedNode = topo.nodes[seedNodeIdx];
  const nodeKeys = (nid: number): string[] => {
    const n = topo.nodes[nid];
    if (!n) return [];
    return keepConnected ? n.vertexKeys : [n.vertexKeys[0]];
  };

  if (seedNode.edgeIds.length === 0) {
    return {
      valid: false,
      loops: [{ keys: nodeKeys(seedNodeIdx), isClosed: false }],
    };
  }

  const walkRay = (
    startEdgeIdx: number,
  ): { nodeIds: number[]; closed: boolean; returnEdgeIdx: number | null } => {
    const startEdge = topo.edges[startEdgeIdx];
    if (!startEdge) return { nodeIds: [], closed: false, returnEdgeIdx: null };
    const collected: number[] = [];
    const visitedNodes = new Set<number>([seedNodeIdx]);
    const visitedEdges = new Set<number>([startEdgeIdx]);
    let currEdgeIdx = startEdgeIdx;
    let currNodeIdx = startEdge.n0 === seedNodeIdx ? startEdge.n1 : startEdge.n0;
    const maxSteps = topo.edges.length + 2;

    for (let step = 0; step < maxSteps; step++) {
      if (currNodeIdx === seedNodeIdx) {
        return { nodeIds: collected, closed: true, returnEdgeIdx: currEdgeIdx };
      }
      if (visitedNodes.has(currNodeIdx)) {
        return { nodeIds: collected, closed: false, returnEdgeIdx: null };
      }
      visitedNodes.add(currNodeIdx);
      collected.push(currNodeIdx);

      const nextEdgeIdx = findNextUVLoopEdgeAtNode(topo, currEdgeIdx, currNodeIdx);
      if (nextEdgeIdx === null || visitedEdges.has(nextEdgeIdx)) {
        return { nodeIds: collected, closed: false, returnEdgeIdx: null };
      }
      const nextEdge = topo.edges[nextEdgeIdx];
      visitedEdges.add(nextEdgeIdx);
      currNodeIdx = nextEdge.n0 === currNodeIdx ? nextEdge.n1 : nextEdge.n0;
      currEdgeIdx = nextEdgeIdx;
      if (currNodeIdx === seedNodeIdx) {
        return { nodeIds: collected, closed: true, returnEdgeIdx: currEdgeIdx };
      }
    }
    return { nodeIds: collected, closed: false, returnEdgeIdx: null };
  };

  const paired = new Set<number>();
  const rawLoops: { nodeIds: number[]; isClosed: boolean }[] = [];

  for (const eid of seedNode.edgeIds) {
    if (paired.has(eid)) continue;
    const oppAtSeed = findNextUVLoopEdgeAtNode(topo, eid, seedNodeIdx);
    const rayA = walkRay(eid);
    if (rayA.closed) {
      paired.add(eid);
      if (rayA.returnEdgeIdx !== null) paired.add(rayA.returnEdgeIdx);
      if (oppAtSeed !== null) paired.add(oppAtSeed);
      rawLoops.push({
        nodeIds: [seedNodeIdx, ...rayA.nodeIds],
        isClosed: true,
      });
      continue;
    }

    if (
      oppAtSeed !== null &&
      oppAtSeed !== eid &&
      seedNode.edgeIds.includes(oppAtSeed)
    ) {
      paired.add(eid);
      paired.add(oppAtSeed);
      const rayB = walkRay(oppAtSeed);
      rawLoops.push({
        nodeIds: Array.from(
          new Set([...rayB.nodeIds.reverse(), seedNodeIdx, ...rayA.nodeIds]),
        ),
        isClosed: false,
      });
    } else {
      paired.add(eid);
      rawLoops.push({
        nodeIds: [seedNodeIdx, ...rayA.nodeIds],
        isClosed: false,
      });
    }
  }

  const seen = new Set<string>();
  const loops: UVLoopCandidate[] = [];
  for (const cand of rawLoops) {
    if (cand.nodeIds.length < 2) continue;
    const sig = [...cand.nodeIds].sort((a, b) => a - b).join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const keys: string[] = [];
    for (const nid of cand.nodeIds) {
      keys.push(...nodeKeys(nid));
    }
    loops.push({ keys, isClosed: cand.isClosed });
  }

  if (loops.length === 0) {
    return {
      valid: false,
      loops: [{ keys: nodeKeys(seedNodeIdx), isClosed: false }],
      reason: 'Este vértice UV no forma un bucle topológico válido.',
    };
  }
  return { valid: true, loops };
}

export function findUVEdgeLoop(
  mesh: EditableMesh,
  primaryEdgeKey: string,
  keepConnected = true,
): { valid: boolean; keys: string[]; isClosed: boolean; reason?: string } {
  const topo = buildUVTopologyGraph(mesh);
  const startEdgeIdx = topo.edgeKeyToEdge.get(primaryEdgeKey);
  if (startEdgeIdx === undefined) {
    return { valid: false, keys: [primaryEdgeKey], isClosed: false };
  }
  const startEdge = topo.edges[startEdgeIdx];
  const visited = new Set<number>([startEdgeIdx]);

  const walkDir = (initialNodeIdx: number): { edgeIds: number[]; closed: boolean } => {
    const collected: number[] = [];
    let currEdgeIdx = startEdgeIdx;
    let currNodeIdx = initialNodeIdx;
    const maxSteps = topo.edges.length + 2;

    for (let step = 0; step < maxSteps; step++) {
      const nextEdgeIdx = findNextUVLoopEdgeAtNode(topo, currEdgeIdx, currNodeIdx);
      if (nextEdgeIdx === null) return { edgeIds: collected, closed: false };
      if (nextEdgeIdx === startEdgeIdx) return { edgeIds: collected, closed: true };
      if (visited.has(nextEdgeIdx)) return { edgeIds: collected, closed: false };
      const nextEdge = topo.edges[nextEdgeIdx];
      visited.add(nextEdgeIdx);
      collected.push(nextEdgeIdx);
      currNodeIdx = nextEdge.n0 === currNodeIdx ? nextEdge.n1 : nextEdge.n0;
      currEdgeIdx = nextEdgeIdx;
    }
    return { edgeIds: collected, closed: false };
  };

  const fwd = walkDir(startEdge.n1);
  let orderedIds: number[];
  let isClosed = fwd.closed;
  if (isClosed) {
    orderedIds = [startEdgeIdx, ...fwd.edgeIds];
  } else {
    const bwd = walkDir(startEdge.n0);
    orderedIds = [...bwd.edgeIds.reverse(), startEdgeIdx, ...fwd.edgeIds];
    isClosed = bwd.closed;
  }

  const keys: string[] = [];
  for (const eid of orderedIds) {
    const e = topo.edges[eid];
    if (keepConnected) {
      keys.push(...e.edgeKeys);
    } else {
      keys.push(e.edgeKeys.includes(primaryEdgeKey) ? primaryEdgeKey : e.edgeKeys[0]);
    }
  }

  if (orderedIds.length < 2) {
    return {
      valid: false,
      keys,
      isClosed: false,
      reason: 'Esta arista UV no continúa en un bucle válido.',
    };
  }
  return { valid: true, keys, isClosed };
}

export function findUVFaceLoopDirections(
  mesh: EditableMesh,
  seedFaceId: string,
): { valid: boolean; loops: UVLoopCandidate[]; reason?: string } {
  const topo = buildUVTopologyGraph(mesh);
  const seedFace = topo.faceById.get(seedFaceId);
  if (!seedFace) {
    return { valid: false, loops: [] };
  }
  if (seedFace.vertexIds.length !== 4 || !seedFace.uvs) {
    return {
      valid: false,
      loops: [{ keys: [seedFaceId], isClosed: false }],
      reason: 'El bucle de caras UV requiere una cara cuadrangular (4 vértices).',
    };
  }

  const getOppositeUVEdgeInQuad = (
    face: MeshFace,
    inEdgeIdx: number,
  ): number | null => {
    if (face.vertexIds.length !== 4) return null;
    for (let i = 0; i < 4; i++) {
      const ei = topo.edgeKeyToEdge.get(makeUVEdgeKey(face.id, i));
      if (ei === inEdgeIdx) {
        return topo.edgeKeyToEdge.get(makeUVEdgeKey(face.id, (i + 2) % 4)) ?? null;
      }
    }
    return null;
  };

  const walkStrip = (
    startEdgeIdx: number | undefined,
  ): { faceIds: string[]; closed: boolean } => {
    if (startEdgeIdx === undefined) return { faceIds: [], closed: false };
    const collected: string[] = [];
    const visited = new Set<string>([seedFaceId]);
    let currFaceId = seedFaceId;
    let currEdgeIdx: number | null = startEdgeIdx;
    const maxSteps = mesh.faces.length + 2;

    for (let step = 0; step < maxSteps && currEdgeIdx !== null; step++) {
      const edge = topo.edges[currEdgeIdx];
      if (!edge || edge.faceRefs.length !== 2) {
        return { faceIds: collected, closed: false };
      }
      const nextFace =
        edge.faceRefs[0].face.id === currFaceId
          ? edge.faceRefs[1].face
          : edge.faceRefs[0].face;
      if (nextFace.id === seedFaceId) {
        return { faceIds: collected, closed: true };
      }
      if (visited.has(nextFace.id) || nextFace.vertexIds.length !== 4) {
        return { faceIds: collected, closed: false };
      }
      visited.add(nextFace.id);
      collected.push(nextFace.id);
      currEdgeIdx = getOppositeUVEdgeInQuad(nextFace, currEdgeIdx);
      currFaceId = nextFace.id;
    }
    return { faceIds: collected, closed: false };
  };

  const edgeIdxs = [0, 1, 2, 3].map((c) =>
    topo.edgeKeyToEdge.get(makeUVEdgeKey(seedFaceId, c)),
  );
  const raw: UVLoopCandidate[] = [];
  for (const [a, b] of [
    [0, 2],
    [1, 3],
  ] as const) {
    const rA = walkStrip(edgeIdxs[a]);
    if (rA.closed) {
      raw.push({ keys: [seedFaceId, ...rA.faceIds], isClosed: true });
      continue;
    }
    const rB = walkStrip(edgeIdxs[b]);
    raw.push({
      keys: Array.from(new Set([...rB.faceIds.reverse(), seedFaceId, ...rA.faceIds])),
      isClosed: false,
    });
  }

  const seen = new Set<string>();
  const loops: UVLoopCandidate[] = [];
  for (const cand of raw) {
    if (cand.keys.length < 2) continue;
    const sig = [...cand.keys].sort().join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    loops.push(cand);
  }

  if (loops.length === 0) {
    return {
      valid: false,
      loops: [{ keys: [seedFaceId], isClosed: false }],
      reason: 'Esta cara UV no pertenece a un bucle de caras válido.',
    };
  }
  return { valid: true, loops };
}

export function findUVShortestPath(
  mesh: EditableMesh,
  mode: UVSelectMode,
  startKey: string,
  endKey: string,
  keepConnected = true,
): { connected: boolean; keys: string[] } {
  if (mode === 'island') return { connected: false, keys: [] };
  const topo = buildUVTopologyGraph(mesh);

  if (mode === 'vertex') {
    const startNode = topo.vertexKeyToNode.get(startKey);
    const endNode = topo.vertexKeyToNode.get(endKey);
    if (startNode === undefined || endNode === undefined) {
      return { connected: false, keys: [] };
    }
    if (startNode === endNode) {
      return {
        connected: true,
        keys: keepConnected ? topo.nodes[startNode].vertexKeys : [startKey],
      };
    }
    const parent = new Map<number, number>();
    const visited = new Set<number>([startNode]);
    const queue: number[] = [startNode];
    let found = false;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === endNode) {
        found = true;
        break;
      }
      for (const eid of topo.nodes[curr].edgeIds) {
        const edge = topo.edges[eid];
        const nxt = edge.n0 === curr ? edge.n1 : edge.n0;
        if (!visited.has(nxt)) {
          visited.add(nxt);
          parent.set(nxt, curr);
          queue.push(nxt);
        }
      }
    }
    if (!found) return { connected: false, keys: [] };
    const pathNodes: number[] = [];
    let c: number | undefined = endNode;
    while (c !== undefined) {
      pathNodes.push(c);
      c = parent.get(c);
    }
    const keys: string[] = [];
    for (const nid of pathNodes) {
      if (keepConnected) keys.push(...topo.nodes[nid].vertexKeys);
      else keys.push(topo.nodes[nid].vertexKeys[0]);
    }
    return { connected: true, keys };
  }

  if (mode === 'edge') {
    const startEdge = topo.edgeKeyToEdge.get(startKey);
    const endEdge = topo.edgeKeyToEdge.get(endKey);
    if (startEdge === undefined || endEdge === undefined) {
      return { connected: false, keys: [] };
    }
    if (startEdge === endEdge) {
      return {
        connected: true,
        keys: keepConnected ? topo.edges[startEdge].edgeKeys : [startKey],
      };
    }
    const parent = new Map<number, number>();
    const visited = new Set<number>([startEdge]);
    const queue: number[] = [startEdge];
    let found = false;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === endEdge) {
        found = true;
        break;
      }
      const ce = topo.edges[curr];
      for (const nid of [ce.n0, ce.n1]) {
        for (const nxt of topo.nodes[nid].edgeIds) {
          if (!visited.has(nxt)) {
            visited.add(nxt);
            parent.set(nxt, curr);
            queue.push(nxt);
          }
        }
      }
    }
    if (!found) return { connected: false, keys: [] };
    const pathEdges: number[] = [];
    let c: number | undefined = endEdge;
    while (c !== undefined) {
      pathEdges.push(c);
      c = parent.get(c);
    }
    const keys: string[] = [];
    for (const eid of pathEdges) {
      if (keepConnected) keys.push(...topo.edges[eid].edgeKeys);
      else keys.push(topo.edges[eid].edgeKeys[0]);
    }
    return { connected: true, keys };
  }

  // face mode
  if (!topo.faceById.has(startKey) || !topo.faceById.has(endKey)) {
    return { connected: false, keys: [] };
  }
  if (startKey === endKey) return { connected: true, keys: [startKey] };
  const faceAdj = new Map<string, Set<string>>();
  for (const edge of topo.edges) {
    if (edge.faceRefs.length < 2) continue;
    for (let i = 0; i < edge.faceRefs.length; i++) {
      for (let j = i + 1; j < edge.faceRefs.length; j++) {
        const fa = edge.faceRefs[i].face.id;
        const fb = edge.faceRefs[j].face.id;
        if (!faceAdj.has(fa)) faceAdj.set(fa, new Set());
        if (!faceAdj.has(fb)) faceAdj.set(fb, new Set());
        faceAdj.get(fa)!.add(fb);
        faceAdj.get(fb)!.add(fa);
      }
    }
  }
  const parent = new Map<string, string>();
  const visited = new Set<string>([startKey]);
  const queue: string[] = [startKey];
  let found = false;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === endKey) {
      found = true;
      break;
    }
    for (const nxt of faceAdj.get(curr) ?? []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        parent.set(nxt, curr);
        queue.push(nxt);
      }
    }
  }
  if (!found) return { connected: false, keys: [] };
  const keys: string[] = [];
  let cf: string | undefined = endKey;
  while (cf !== undefined) {
    keys.push(cf);
    cf = parent.get(cf);
  }
  return { connected: true, keys };
}

/**
 * Welds (merges) UV coordinates of the selected UV vertex corners to their average [u, v]
 * ONLY inside `face.uvs` — never modifying 3D vertex positions or mesh topology.
 */
export function weldSelectedUVVertices(
  mesh: EditableMesh,
  selection: UVSelectionState,
  islands?: UVIsland[],
): { weldedCount: number; center: Vec2 | null } {
  const targetedRefs = collectSelectedUVCornerRefs(mesh, selection, islands);
  if (targetedRefs.length < 2) {
    return { weldedCount: 0, center: null };
  }

  let su = 0;
  let sv = 0;
  let validCount = 0;
  for (const r of targetedRefs) {
    const uv = r.face.uvs?.[r.cornerIdx];
    if (!uv) continue;
    su += uv[0];
    sv += uv[1];
    validCount++;
  }
  if (validCount < 2) {
    return { weldedCount: 0, center: null };
  }

  const avgU = su / validCount;
  const avgV = sv / validCount;
  for (const r of targetedRefs) {
    if (!r.face.uvs) continue;
    r.face.uvs[r.cornerIdx] = [avgU, avgV];
  }

  return { weldedCount: validCount, center: [avgU, avgV] };
}
