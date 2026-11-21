import { EditableMesh, Vec3 } from './EditableMesh';
import type { EditSelectionMode } from './operations';

export interface ShortestPathResult {
  connected: boolean;
  ids: string[];
}

function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function edgeMidpoint(mesh: EditableMesh, edgeId: string): Vec3 | null {
  const e = mesh.getEdge(edgeId);
  if (!e) return null;
  const v0 = mesh.getVertex(e.v0);
  const v1 = mesh.getVertex(e.v1);
  if (!v0 || !v1) return null;
  return [
    (v0.position[0] + v1.position[0]) * 0.5,
    (v0.position[1] + v1.position[1]) * 0.5,
    (v0.position[2] + v1.position[2]) * 0.5,
  ];
}

interface PathCost {
  hops: number;
  dist: number;
}

function isBetterCost(a: PathCost, b: PathCost): boolean {
  if (a.hops !== b.hops) return a.hops < b.hops;
  return a.dist < b.dist - 1e-9;
}

/**
 * Checks if a component ID currently exists in the mesh for the specified mode.
 */
export function meshHasComponent(
  mesh: EditableMesh,
  mode: EditSelectionMode,
  id: string,
): boolean {
  if (mode === 'vertex') return Boolean(mesh.getVertex(id));
  if (mode === 'edge') return Boolean(mesh.getEdge(id));
  return Boolean(mesh.getFace(id));
}

/**
 * Shortest topological path between two vertices over real mesh edges.
 * Minimizes hop count first, then breaks equal-hop ties by Euclidean edge length.
 */
export function findShortestVertexPath(
  mesh: EditableMesh,
  startId: string,
  endId: string,
): ShortestPathResult {
  const startV = mesh.getVertex(startId);
  const endV = mesh.getVertex(endId);
  if (!startV || !endV) {
    return { connected: false, ids: [] };
  }
  if (startId === endId) {
    return { connected: true, ids: [startId] };
  }

  const bestCost = new Map<string, PathCost>();
  const parent = new Map<string, string>();
  const settled = new Set<string>();
  const open: { id: string; cost: PathCost }[] = [
    { id: startId, cost: { hops: 0, dist: 0 } },
  ];
  bestCost.set(startId, { hops: 0, dist: 0 });

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (isBetterCost(open[i].cost, open[bestIdx].cost)) {
        bestIdx = i;
      }
    }
    const current = open.splice(bestIdx, 1)[0];
    if (settled.has(current.id)) continue;
    settled.add(current.id);

    if (current.id === endId) {
      break;
    }

    const currVertex = mesh.getVertex(current.id);
    if (!currVertex) continue;

    for (const neighborId of mesh.getConnectedVertices(current.id)) {
      if (settled.has(neighborId)) continue;
      const neighbor = mesh.getVertex(neighborId);
      if (!neighbor) continue;

      const candidateCost: PathCost = {
        hops: current.cost.hops + 1,
        dist: current.cost.dist + dist3D(currVertex.position, neighbor.position),
      };
      const prevBest = bestCost.get(neighborId);
      if (!prevBest || isBetterCost(candidateCost, prevBest)) {
        bestCost.set(neighborId, candidateCost);
        parent.set(neighborId, current.id);
        open.push({ id: neighborId, cost: candidateCost });
      }
    }
  }

  if (!parent.has(endId)) {
    return { connected: false, ids: [] };
  }

  const path: string[] = [];
  let cursor: string | undefined = endId;
  while (cursor !== undefined) {
    path.push(cursor);
    if (cursor === startId) break;
    cursor = parent.get(cursor);
  }
  path.reverse();

  if (path[0] !== startId) {
    return { connected: false, ids: [] };
  }
  return { connected: true, ids: path };
}

/**
 * Shortest topological path between two edges sharing vertices across real mesh connectivity.
 * Minimizes edge hops first, breaking equal-hop ties by midpoint travel distance.
 */
export function findShortestEdgePath(
  mesh: EditableMesh,
  startId: string,
  endId: string,
): ShortestPathResult {
  const startE = mesh.getEdge(startId);
  const endE = mesh.getEdge(endId);
  if (!startE || !endE) {
    return { connected: false, ids: [] };
  }
  if (startId === endId) {
    return { connected: true, ids: [startId] };
  }

  const bestCost = new Map<string, PathCost>();
  const parent = new Map<string, string>();
  const settled = new Set<string>();
  const open: { id: string; cost: PathCost }[] = [
    { id: startId, cost: { hops: 0, dist: 0 } },
  ];
  bestCost.set(startId, { hops: 0, dist: 0 });

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (isBetterCost(open[i].cost, open[bestIdx].cost)) {
        bestIdx = i;
      }
    }
    const current = open.splice(bestIdx, 1)[0];
    if (settled.has(current.id)) continue;
    settled.add(current.id);

    if (current.id === endId) {
      break;
    }

    const currEdge = mesh.getEdge(current.id);
    const currMid = edgeMidpoint(mesh, current.id);
    if (!currEdge || !currMid) continue;

    const neighborEdges = new Set<string>();
    for (const eid of mesh.getEdgesForVertex(currEdge.v0)) {
      if (eid !== current.id) neighborEdges.add(eid);
    }
    for (const eid of mesh.getEdgesForVertex(currEdge.v1)) {
      if (eid !== current.id) neighborEdges.add(eid);
    }

    for (const nextEid of neighborEdges) {
      if (settled.has(nextEid)) continue;
      const nextMid = edgeMidpoint(mesh, nextEid);
      if (!nextMid) continue;

      const candidateCost: PathCost = {
        hops: current.cost.hops + 1,
        dist: current.cost.dist + dist3D(currMid, nextMid),
      };
      const prevBest = bestCost.get(nextEid);
      if (!prevBest || isBetterCost(candidateCost, prevBest)) {
        bestCost.set(nextEid, candidateCost);
        parent.set(nextEid, current.id);
        open.push({ id: nextEid, cost: candidateCost });
      }
    }
  }

  if (!parent.has(endId)) {
    return { connected: false, ids: [] };
  }

  const path: string[] = [];
  let cursor: string | undefined = endId;
  while (cursor !== undefined) {
    path.push(cursor);
    if (cursor === startId) break;
    cursor = parent.get(cursor);
  }
  path.reverse();

  if (path[0] !== startId) {
    return { connected: false, ids: [] };
  }
  return { connected: true, ids: path };
}

/**
 * Shortest topological path between two faces stepping across shared edges.
 * Minimizes face hops first, breaking equal-hop ties by centroid distance.
 */
export function findShortestFacePath(
  mesh: EditableMesh,
  startId: string,
  endId: string,
): ShortestPathResult {
  const startF = mesh.getFace(startId);
  const endF = mesh.getFace(endId);
  if (!startF || !endF) {
    return { connected: false, ids: [] };
  }
  if (startId === endId) {
    return { connected: true, ids: [startId] };
  }

  const bestCost = new Map<string, PathCost>();
  const parent = new Map<string, string>();
  const settled = new Set<string>();
  const open: { id: string; cost: PathCost }[] = [
    { id: startId, cost: { hops: 0, dist: 0 } },
  ];
  bestCost.set(startId, { hops: 0, dist: 0 });

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (isBetterCost(open[i].cost, open[bestIdx].cost)) {
        bestIdx = i;
      }
    }
    const current = open.splice(bestIdx, 1)[0];
    if (settled.has(current.id)) continue;
    settled.add(current.id);

    if (current.id === endId) {
      break;
    }

    const currFace = mesh.getFace(current.id);
    if (!currFace) continue;
    const currCenter = mesh.computeFaceCenter(currFace);

    const neighborFaces = new Set<string>();
    for (const eid of mesh.getEdgesForFace(current.id)) {
      for (const nfid of mesh.getFacesForEdge(eid)) {
        if (nfid !== current.id) neighborFaces.add(nfid);
      }
    }

    for (const nextFid of neighborFaces) {
      if (settled.has(nextFid)) continue;
      const nextFace = mesh.getFace(nextFid);
      if (!nextFace) continue;
      const nextCenter = mesh.computeFaceCenter(nextFace);

      const candidateCost: PathCost = {
        hops: current.cost.hops + 1,
        dist: current.cost.dist + dist3D(currCenter, nextCenter),
      };
      const prevBest = bestCost.get(nextFid);
      if (!prevBest || isBetterCost(candidateCost, prevBest)) {
        bestCost.set(nextFid, candidateCost);
        parent.set(nextFid, current.id);
        open.push({ id: nextFid, cost: candidateCost });
      }
    }
  }

  if (!parent.has(endId)) {
    return { connected: false, ids: [] };
  }

  const path: string[] = [];
  let cursor: string | undefined = endId;
  while (cursor !== undefined) {
    path.push(cursor);
    if (cursor === startId) break;
    cursor = parent.get(cursor);
  }
  path.reverse();

  if (path[0] !== startId) {
    return { connected: false, ids: [] };
  }
  return { connected: true, ids: path };
}

/**
 * Dispatches shortest topological path selection according to the active edit selection mode.
 */
export function findShortestComponentPath(
  mesh: EditableMesh,
  mode: EditSelectionMode,
  startId: string,
  endId: string,
): ShortestPathResult {
  if (mode === 'vertex') {
    return findShortestVertexPath(mesh, startId, endId);
  }
  if (mode === 'edge') {
    return findShortestEdgePath(mesh, startId, endId);
  }
  return findShortestFacePath(mesh, startId, endId);
}
