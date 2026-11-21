import {
  canonicalEdgeKey,
  EditableMesh,
  MeshFace,
  Vec2,
  Vec3,
} from './EditableMesh';
import { EditSelectionMode, MeshOperatorResult } from './operations';

function subVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVec(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function crossVec(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dotVec(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function lenVec(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normVec(a: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = lenVec(a);
  if (l < 1e-8) return fallback;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function computePolygonNewell(mesh: EditableMesh, vertIds: string[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const n = vertIds.length;
  for (let i = 0; i < n; i++) {
    const a = mesh.getVertex(vertIds[i])?.position;
    const b = mesh.getVertex(vertIds[(i + 1) % n])?.position;
    if (!a || !b) continue;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

function isValidPolygonLoop(mesh: EditableMesh, vertIds: string[]): boolean {
  if (vertIds.length < 3) return false;
  if (new Set(vertIds).size !== vertIds.length) return false;
  for (const vid of vertIds) {
    if (!mesh.getVertex(vid)) return false;
  }
  const n = computePolygonNewell(mesh, vertIds);
  return lenVec(n) > 1e-9;
}

function buildVertexUvMapForFaces(
  mesh: EditableMesh,
  faces: MeshFace[],
): Map<string, Vec2> {
  const uvMap = new Map<string, Vec2>();
  for (const f of faces) {
    if (Array.isArray(f.uvs) && f.uvs.length === f.vertexIds.length) {
      for (let i = 0; i < f.vertexIds.length; i++) {
        if (!uvMap.has(f.vertexIds[i])) {
          uvMap.set(f.vertexIds[i], [f.uvs[i][0], f.uvs[i][1]]);
        }
      }
    }
  }
  for (const v of mesh.vertices) {
    if (v.uv && !uvMap.has(v.id)) {
      uvMap.set(v.id, [v.uv[0], v.uv[1]]);
    }
  }
  return uvMap;
}

function applyFaceUvsFromMap(
  face: MeshFace | null,
  uvMap: Map<string, Vec2>,
): void {
  if (!face || uvMap.size === 0) return;
  if (face.vertexIds.every((vid) => uvMap.has(vid))) {
    face.uvs = face.vertexIds.map((vid) => {
      const uv = uvMap.get(vid)!;
      return [uv[0], uv[1]];
    });
  }
}

function addSingleEdgeFaceMerge(
  mesh: EditableMesh,
  edgeId: string,
): { mergedFace: MeshFace | null; deletedFaces: string[] } {
  const edge = mesh.getEdge(edgeId);
  if (!edge) return { mergedFace: null, deletedFaces: [] };
  const adjFaces = mesh.getFacesForEdge(edgeId);
  if (adjFaces.length !== 2 || adjFaces[0] === adjFaces[1]) {
    return { mergedFace: null, deletedFaces: [] };
  }

  const f1 = mesh.getFace(adjFaces[0]);
  const f2 = mesh.getFace(adjFaces[1]);
  if (!f1 || !f2) return { mergedFace: null, deletedFaces: [] };

  const edgeKey = canonicalEdgeKey(edge.v0, edge.v1);
  const n1 = f1.vertexIds.length;
  let idx1 = -1;
  let u = '';
  let v = '';
  for (let i = 0; i < n1; i++) {
    const a = f1.vertexIds[i];
    const b = f1.vertexIds[(i + 1) % n1];
    if (canonicalEdgeKey(a, b) === edgeKey) {
      idx1 = i;
      u = a;
      v = b;
      break;
    }
  }
  if (idx1 === -1) return { mergedFace: null, deletedFaces: [] };

  const n2 = f2.vertexIds.length;
  let idx2 = -1;
  let f2Reversed = false;
  for (let i = 0; i < n2; i++) {
    const a = f2.vertexIds[i];
    const b = f2.vertexIds[(i + 1) % n2];
    if (a === v && b === u) {
      idx2 = i;
      f2Reversed = false;
      break;
    }
    if (a === u && b === v) {
      idx2 = i;
      f2Reversed = true;
      break;
    }
  }
  if (idx2 === -1) return { mergedFace: null, deletedFaces: [] };

  const f2Ordered = f2Reversed ? [...f2.vertexIds].reverse() : f2.vertexIds;
  const startInF2 = f2Ordered.indexOf(v);

  const merged: string[] = [];
  for (let step = 0; step < n1; step++) {
    merged.push(f1.vertexIds[(idx1 + 1 + step) % n1]);
  }
  for (let step = 2; step < n2; step++) {
    merged.push(f2Ordered[(startInF2 + step) % n2]);
  }

  if (!isValidPolygonLoop(mesh, merged)) {
    return { mergedFace: null, deletedFaces: [] };
  }

  const uvMap = buildVertexUvMapForFaces(mesh, [f1, f2]);
  mesh.deleteFaces(new Set([f1.id, f2.id]));
  mesh.deleteEdges(new Set([edgeId]));
  const newFace = mesh.addFace(merged);
  applyFaceUvsFromMap(newFace, uvMap);
  return { mergedFace: newFace, deletedFaces: [f1.id, f2.id] };
}

function traceFaceRegionBoundary(
  mesh: EditableMesh,
  regionFaceIds: string[],
  dissolvableInternalEdgeKeys?: Set<string>,
): { loop: string[] | null; uvMap: Map<string, Vec2>; reason?: string } {
  const faces = regionFaceIds
    .map((fid) => mesh.getFace(fid))
    .filter((f): f is MeshFace => Boolean(f));
  if (faces.length === 0) {
    return { loop: null, uvMap: new Map(), reason: 'No hay caras en la región.' };
  }

  const uvMap = buildVertexUvMapForFaces(mesh, faces);
  const faceSet = new Set(faces.map((f) => f.id));

  // Consistently orient faces inside region via BFS across shared edges
  const orientedVerts = new Map<string, string[]>();
  const edgeToFacesInRegion = new Map<string, string[]>();
  for (const f of faces) {
    const n = f.vertexIds.length;
    for (let i = 0; i < n; i++) {
      const k = canonicalEdgeKey(f.vertexIds[i], f.vertexIds[(i + 1) % n]);
      let list = edgeToFacesInRegion.get(k);
      if (!list) {
        list = [];
        edgeToFacesInRegion.set(k, list);
      }
      list.push(f.id);
    }
  }

  const faceMap = new Map(faces.map((f) => [f.id, f]));
  const queue: string[] = [faces[0].id];
  orientedVerts.set(faces[0].id, [...faces[0].vertexIds]);

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currVerts = orientedVerts.get(currId)!;
    const cn = currVerts.length;

    for (let i = 0; i < cn; i++) {
      const a = currVerts[i];
      const b = currVerts[(i + 1) % cn];
      const key = canonicalEdgeKey(a, b);
      for (const neighId of edgeToFacesInRegion.get(key) ?? []) {
        if (neighId === currId || orientedVerts.has(neighId)) continue;
        const nf = faceMap.get(neighId);
        if (!nf) continue;

        const nv = nf.vertexIds;
        const m = nv.length;
        let sameDir = false;
        let oppDir = false;
        for (let j = 0; j < m; j++) {
          const u = nv[j];
          const v = nv[(j + 1) % m];
          if (u === b && v === a) {
            oppDir = true;
            break;
          }
          if (u === a && v === b) {
            sameDir = true;
            break;
          }
        }
        if (oppDir) {
          orientedVerts.set(neighId, [...nv]);
        } else if (sameDir) {
          orientedVerts.set(neighId, [...nv].reverse());
        } else {
          orientedVerts.set(neighId, [...nv]);
        }
        queue.push(neighId);
      }
    }
  }

  // Fallback for any disconnected face inside same component check
  if (orientedVerts.size !== faces.length) {
    return {
      loop: null,
      uvMap,
      reason: 'Las caras seleccionadas no forman una región conexa.',
    };
  }

  // Collect directed half-edges; cancel opposite pairs across internal shared edges
  const halfEdgeCounts = new Map<string, { from: string; to: string; count: number }>();
  const undirectedCounts = new Map<string, number>();

  for (const fid of faceSet) {
    const verts = orientedVerts.get(fid)!;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const from = verts[i];
      const to = verts[(i + 1) % n];
      const uKey = canonicalEdgeKey(from, to);
      undirectedCounts.set(uKey, (undirectedCounts.get(uKey) ?? 0) + 1);

      const revKey = `${to}->${from}`;
      const revEntry = halfEdgeCounts.get(revKey);
      const canCancel =
        !dissolvableInternalEdgeKeys || dissolvableInternalEdgeKeys.has(uKey);
      if (revEntry && revEntry.count > 0 && canCancel) {
        revEntry.count -= 1;
        if (revEntry.count === 0) halfEdgeCounts.delete(revKey);
      } else {
        const fwdKey = `${from}->${to}`;
        const existing = halfEdgeCounts.get(fwdKey);
        if (existing) existing.count += 1;
        else halfEdgeCounts.set(fwdKey, { from, to, count: 1 });
      }
    }
  }

  // Remaining directed boundary edges must form a single simple closed polygon cycle
  const remaining = Array.from(halfEdgeCounts.values()).filter((e) => e.count > 0);
  if (remaining.length < 3) {
    return {
      loop: null,
      uvMap,
      reason: 'La región forma una superficie cerrada sin contorno exterior para disolver.',
    };
  }

  const nextByVert = new Map<string, string>();
  for (const he of remaining) {
    if (he.count !== 1 || nextByVert.has(he.from)) {
      return {
        loop: null,
        uvMap,
        reason: 'El contorno resultante se autointersecta o es no múltiple.',
      };
    }
    nextByVert.set(he.from, he.to);
  }

  const start = remaining[0].from;
  const loop: string[] = [];
  const seen = new Set<string>();
  let curr: string | undefined = start;
  while (curr && !seen.has(curr)) {
    seen.add(curr);
    loop.push(curr);
    curr = nextByVert.get(curr);
  }

  if (curr !== start || loop.length !== remaining.length) {
    return {
      loop: null,
      uvMap,
      reason: 'No se puede disolver porque dejaría huecos internos o varios contornos separados.',
    };
  }

  if (!isValidPolygonLoop(mesh, loop)) {
    return {
      loop: null,
      uvMap,
      reason: 'La cara resultante sería degenerada o tendría área cero.',
    };
  }

  return { loop, uvMap };
}

function tryDissolveSingleVertexInPlace(
  mesh: EditableMesh,
  vid: string,
): { ok: boolean; reason?: string } {
  const vert = mesh.getVertex(vid);
  if (!vert) return { ok: false };

  const incEdges = mesh.getEdgesForVertex(vid);
  const incFaces = mesh.getFacesForVertex(vid);

  // Wire vertex with 2 edges and no faces
  if (incFaces.length === 0) {
    if (incEdges.length === 2) {
      const eA = mesh.getEdge(incEdges[0]);
      const eB = mesh.getEdge(incEdges[1]);
      if (!eA || !eB) return { ok: false };
      const nA = eA.v0 === vid ? eA.v1 : eA.v0;
      const nB = eB.v0 === vid ? eB.v1 : eB.v0;
      if (nA === nB) {
        return { ok: false, reason: 'No se puede colapsar un bucle de 2 aristas.' };
      }
      mesh.deleteVertices(new Set([vid]));
      mesh.addEdge(nA, nB);
      return { ok: true };
    }
    mesh.deleteVertices(new Set([vid]));
    return { ok: true };
  }

  // Single face vertex -> strip vertex if >= 3 unique remaining vertices with non-zero area
  if (incFaces.length === 1) {
    const f = mesh.getFace(incFaces[0]);
    if (!f) return { ok: false };
    const filtered = f.vertexIds.filter((id) => id !== vid);
    if (!isValidPolygonLoop(mesh, filtered)) {
      return {
        ok: false,
        reason: 'Disolver este vértice dejaría una cara con menos de 3 vértices.',
      };
    }
    const uvMap = buildVertexUvMapForFaces(mesh, [f]);
    const deadEdges = incEdges.filter((eid) => mesh.getFacesForEdge(eid).length <= 1);
    mesh.deleteFaces(new Set([f.id]));
    mesh.deleteEdges(new Set(deadEdges));
    mesh.deleteVertices(new Set([vid]));
    const nf = mesh.addFace(filtered);
    applyFaceUvsFromMap(nf, uvMap);
    return { ok: true };
  }

  // 2+ incident faces: trace outer boundary chains around vid
  const faces = incFaces
    .map((fid) => mesh.getFace(fid))
    .filter((f): f is MeshFace => Boolean(f));
  const uvMap = buildVertexUvMapForFaces(mesh, faces);

  // Build chains (next -> ... -> prev) excluding vid
  const chains: {
    faceId: string;
    start: string;
    end: string;
    verts: string[];
  }[] = [];

  for (const f of faces) {
    const idx = f.vertexIds.indexOf(vid);
    if (idx === -1) continue;
    const k = f.vertexIds.length;
    const verts: string[] = [];
    for (let s = 1; s < k; s++) {
      verts.push(f.vertexIds[(idx + s) % k]);
    }
    if (verts.length >= 2) {
      chains.push({
        faceId: f.id,
        start: verts[0],
        end: verts[verts.length - 1],
        verts,
      });
    }
  }

  if (chains.length !== faces.length || chains.length === 0) {
    return {
      ok: false,
      reason: 'Topología de caras incompatible alrededor del vértice.',
    };
  }

  // Try stitching chains into one single closed cycle OR one single open fan
  const used = new Set<string>([chains[0].faceId]);
  let merged: string[] = [...chains[0].verts];
  let closed = false;

  // Extend forward from merged[merged.length - 1]
  for (let iter = 0; iter < chains.length; iter++) {
    const currEnd = merged[merged.length - 1];
    let matched = chains.find(
      (c) => !used.has(c.faceId) && c.start === currEnd,
    );
    if (matched) {
      used.add(matched.faceId);
      merged.push(...matched.verts.slice(1));
    } else {
      matched = chains.find((c) => !used.has(c.faceId) && c.end === currEnd);
      if (matched) {
        used.add(matched.faceId);
        merged.push(...[...matched.verts].reverse().slice(1));
      } else {
        break;
      }
    }
    if (merged[merged.length - 1] === merged[0] && used.size === chains.length) {
      merged.pop();
      closed = true;
      break;
    }
  }

  // If open fan (boundary vertex), also extend backward from merged[0]
  if (!closed && used.size < chains.length) {
    for (let iter = 0; iter < chains.length; iter++) {
      const currStart = merged[0];
      let matched = chains.find(
        (c) => !used.has(c.faceId) && c.end === currStart,
      );
      if (matched) {
        used.add(matched.faceId);
        merged = [...matched.verts.slice(0, -1), ...merged];
      } else {
        matched = chains.find(
          (c) => !used.has(c.faceId) && c.start === currStart,
        );
        if (matched) {
          used.add(matched.faceId);
          merged = [...[...matched.verts].reverse().slice(0, -1), ...merged];
        } else {
          break;
        }
      }
      if (merged[merged.length - 1] === merged[0] && used.size === chains.length) {
        merged.pop();
        closed = true;
        break;
      }
    }
  }

  if (used.size !== chains.length) {
    return {
      ok: false,
      reason: 'El vértice tiene una unión no múltiple que no puede disolverse limpiamente.',
    };
  }

  if (!isValidPolygonLoop(mesh, merged)) {
    return {
      ok: false,
      reason: 'Disolver el vértice produciría un polígono inválido o degenerado.',
    };
  }

  mesh.deleteFaces(new Set(incFaces));
  mesh.deleteVertices(new Set([vid]));
  const nf = mesh.addFace(merged);
  applyFaceUvsFromMap(nf, uvMap);
  return { ok: true };
}

export interface DissolveOperationResult {
  result: MeshOperatorResult;
  dissolvedCount: number;
  message?: string;
  error?: string;
}

/**
 * Dissolve Vertices: eliminates selected vertices and merges incident faces into valid polygons.
 */
export function dissolveVerticesMesh(
  sourceMesh: EditableMesh,
  _mode: EditSelectionMode,
  selectedIds: Set<string>,
): DissolveOperationResult {
  const mesh = sourceMesh.clone();
  const nextSelected = new Set<string>();

  if (selectedIds.size === 0) {
    return {
      result: { mesh, nextSelectedIds: nextSelected },
      dissolvedCount: 0,
      error: 'Selecciona al menos un vértice para disolver.',
    };
  }

  let dissolvedCount = 0;
  let lastReason: string | undefined;

  for (const vid of Array.from(selectedIds)) {
    if (!mesh.getVertex(vid)) continue;
    const res = tryDissolveSingleVertexInPlace(mesh, vid);
    if (res.ok) {
      dissolvedCount++;
    } else if (res.reason) {
      lastReason = res.reason;
    }
  }

  if (dissolvedCount === 0) {
    return {
      result: { mesh: sourceMesh.clone(), nextSelectedIds: new Set(selectedIds) },
      dissolvedCount: 0,
      error:
        lastReason ??
        'No se pudieron disolver los vértices seleccionados sin corromper la malla.',
    };
  }

  mesh.clearCustomNormals();
  mesh.rebuildIndices();
  return {
    result: { mesh, nextSelectedIds: nextSelected },
    dissolvedCount,
    message: `${dissolvedCount} vértice${dissolvedCount === 1 ? '' : 's'} disuelto${dissolvedCount === 1 ? '' : 's'}`,
  };
}

/**
 * Dissolve Edges: merges face regions across selected edges and cleans resulting valence-2 endpoints.
 */
export function dissolveEdgesMesh(
  sourceMesh: EditableMesh,
  _mode: EditSelectionMode,
  selectedIds: Set<string>,
): DissolveOperationResult {
  const mesh = sourceMesh.clone();
  const nextSelected = new Set<string>();

  if (selectedIds.size === 0) {
    return {
      result: { mesh, nextSelectedIds: nextSelected },
      dissolvedCount: 0,
      error: 'Selecciona al menos una arista para disolver.',
    };
  }

  const targetEdgeIds = Array.from(selectedIds).filter((eid) =>
    Boolean(mesh.getEdge(eid)),
  );
  if (targetEdgeIds.length === 0) {
    return {
      result: { mesh, nextSelectedIds: nextSelected },
      dissolvedCount: 0,
      error: 'Las aristas seleccionadas no son válidas.',
    };
  }

  let dissolvedEdges = 0;
  const endpointCandidates = new Set<string>();
  const targetEdgeSet = new Set(targetEdgeIds);
  const wireEdges = new Set<string>();
  const manifoldEdges: string[] = [];

  for (const eid of targetEdgeIds) {
    const e = mesh.getEdge(eid);
    if (!e) continue;
    const adj = mesh.getFacesForEdge(eid);
    if (adj.length === 0) {
      wireEdges.add(eid);
    } else if (adj.length === 2 && adj[0] !== adj[1]) {
      manifoldEdges.push(eid);
      endpointCandidates.add(e.v0);
      endpointCandidates.add(e.v1);
    }
  }

  if (wireEdges.size > 0) {
    for (const eid of wireEdges) {
      const e = mesh.getEdge(eid);
      if (e) {
        endpointCandidates.add(e.v0);
        endpointCandidates.add(e.v1);
      }
    }
    mesh.deleteEdges(wireEdges);
    dissolvedEdges += wireEdges.size;
  }

  // Group faces connected across target manifold edges into regions
  const manifoldSet = new Set(manifoldEdges);
  const dissolvableKeys = new Set<string>();
  for (const eid of manifoldEdges) {
    const e = mesh.getEdge(eid);
    if (e) dissolvableKeys.add(canonicalEdgeKey(e.v0, e.v1));
  }

  const affectedFaceIds = new Set<string>();
  for (const eid of manifoldEdges) {
    for (const fid of mesh.getFacesForEdge(eid)) {
      affectedFaceIds.add(fid);
    }
  }

  const visitedFaces = new Set<string>();
  let lastError: string | undefined;

  for (const seedFid of affectedFaceIds) {
    if (visitedFaces.has(seedFid) || !mesh.getFace(seedFid)) continue;

    // BFS across faces connected by an edge in manifoldSet
    const regionFaces: string[] = [];
    const regionDissolvedEdgeIds = new Set<string>();
    const queue = [seedFid];
    visitedFaces.add(seedFid);

    while (queue.length > 0) {
      const fid = queue.shift()!;
      regionFaces.push(fid);
      for (const eid of mesh.getEdgesForFace(fid)) {
        if (!manifoldSet.has(eid)) continue;
        regionDissolvedEdgeIds.add(eid);
        for (const nfId of mesh.getFacesForEdge(eid)) {
          if (!visitedFaces.has(nfId)) {
            visitedFaces.add(nfId);
            queue.push(nfId);
          }
        }
      }
    }

    if (regionFaces.length < 2) continue;

    const traced = traceFaceRegionBoundary(mesh, regionFaces, dissolvableKeys);
    if (traced.loop) {
      const regionEdgeCandidates = new Set<string>();
      for (const fid of regionFaces) {
        for (const eid of mesh.getEdgesForFace(fid)) regionEdgeCandidates.add(eid);
      }
      mesh.deleteFaces(new Set(regionFaces));
      const deadEdges = new Set<string>();
      for (const eid of regionEdgeCandidates) {
        if (regionDissolvedEdgeIds.has(eid) || mesh.getFacesForEdge(eid).length === 0) {
          deadEdges.add(eid);
        }
      }
      mesh.deleteEdges(deadEdges);
      const nf = mesh.addFace(traced.loop);
      applyFaceUvsFromMap(nf, traced.uvMap);
      dissolvedEdges += regionDissolvedEdgeIds.size;
    } else {
      // Fallback: try dissolving valid individual edges inside this region
      let regionIndividual = 0;
      for (const eid of regionDissolvedEdgeIds) {
        if (!mesh.getEdge(eid)) continue;
        const single = addSingleEdgeFaceMerge(mesh, eid);
        if (single.mergedFace) {
          regionIndividual++;
          dissolvedEdges++;
        }
      }
      if (regionIndividual === 0 && traced.reason) {
        lastError = traced.reason;
      }
    }
  }

  // Clean up orphan vertices from dissolved internal structures (e.g. '+' cross center)
  mesh.pruneOrphanVertices(endpointCandidates);

  // Also dissolve valence-2 endpoints created strictly by dissolving target edges when safe
  let changed = true;
  while (changed) {
    changed = false;
    for (const vid of Array.from(endpointCandidates)) {
      if (!mesh.getVertex(vid)) continue;
      const incEdges = mesh.getEdgesForVertex(vid);
      const incFaces = mesh.getFacesForVertex(vid);
      if (incEdges.length === 2 && incFaces.length >= 1 && incFaces.length <= 2) {
        // Ensure all incident faces still have >= 4 vertices before removing vid
        const allSafe = incFaces.every((fid) => {
          const f = mesh.getFace(fid);
          return f && f.vertexIds.length >= 4;
        });
        if (!allSafe) continue;
        const eA = mesh.getEdge(incEdges[0]);
        const eB = mesh.getEdge(incEdges[1]);
        if (!eA || !eB) continue;
        const nA = eA.v0 === vid ? eA.v1 : eA.v0;
        const nB = eB.v0 === vid ? eB.v1 : eB.v0;
        if (nA === nB) continue;
        if (mesh.findEdgeId(nA, nB)) continue; // would collapse a triangle/2-edge bridge

        const uvMap = buildVertexUvMapForFaces(
          mesh,
          incFaces
            .map((fid) => mesh.getFace(fid))
            .filter((f): f is MeshFace => Boolean(f)),
        );
        const updatedPolys: string[][] = [];
        let valid = true;
        for (const fid of incFaces) {
          const f = mesh.getFace(fid)!;
          const stripped = f.vertexIds.filter((id) => id !== vid);
          if (!isValidPolygonLoop(mesh, stripped)) {
            valid = false;
            break;
          }
          updatedPolys.push(stripped);
        }
        if (!valid) continue;

        mesh.deleteFaces(new Set(incFaces));
        mesh.deleteEdges(new Set(incEdges));
        mesh.deleteVertices(new Set([vid]));
        for (const poly of updatedPolys) {
          const nf = mesh.addFace(poly);
          applyFaceUvsFromMap(nf, uvMap);
        }
        changed = true;
      }
    }
  }

  mesh.pruneOrphanVertices(endpointCandidates);

  if (dissolvedEdges === 0) {
    const hasOnlyBoundary = targetEdgeIds.every(
      (eid) => (sourceMesh.getFacesForEdge(eid)?.length ?? 0) === 1,
    );
    return {
      result: { mesh: sourceMesh.clone(), nextSelectedIds: new Set(selectedIds) },
      dissolvedCount: 0,
      error:
        lastError ??
        (hasOnlyBoundary
          ? 'No se pueden disolver aristas de borde abierto sin caras a ambos lados.'
          : 'No se pudieron disolver las aristas seleccionadas sin generar geometría inválida.'),
    };
  }

  mesh.clearCustomNormals();
  mesh.rebuildIndices();
  void targetEdgeSet;
  return {
    result: { mesh, nextSelectedIds: nextSelected },
    dissolvedCount: dissolvedEdges,
    message: `${dissolvedEdges} arista${dissolvedEdges === 1 ? '' : 's'} disuelta${dissolvedEdges === 1 ? '' : 's'}`,
  };
}

/**
 * Dissolve Faces: merges edge-connected face islands into single valid polygons.
 */
export function dissolveFacesMesh(
  sourceMesh: EditableMesh,
  _mode: EditSelectionMode,
  selectedIds: Set<string>,
): DissolveOperationResult {
  const mesh = sourceMesh.clone();
  const nextSelected = new Set<string>();

  const validFaceIds = Array.from(selectedIds).filter((fid) =>
    Boolean(mesh.getFace(fid)),
  );
  if (validFaceIds.length < 2) {
    return {
      result: { mesh: sourceMesh.clone(), nextSelectedIds: new Set(selectedIds) },
      dissolvedCount: 0,
      error: 'Selecciona al menos 2 caras adyacentes para disolver.',
    };
  }

  const selSet = new Set(validFaceIds);
  const visited = new Set<string>();
  let dissolvedFacesCount = 0;
  let lastError: string | undefined;

  for (const seedFid of validFaceIds) {
    if (visited.has(seedFid)) continue;

    const region: string[] = [];
    const queue = [seedFid];
    visited.add(seedFid);

    while (queue.length > 0) {
      const fid = queue.shift()!;
      region.push(fid);
      for (const eid of mesh.getEdgesForFace(fid)) {
        for (const nfId of mesh.getFacesForEdge(eid)) {
          if (selSet.has(nfId) && !visited.has(nfId)) {
            visited.add(nfId);
            queue.push(nfId);
          }
        }
      }
    }

    if (region.length < 2) continue;

    const traced = traceFaceRegionBoundary(mesh, region);
    if (!traced.loop) {
      lastError = traced.reason;
      continue;
    }

    const candidateEdges = new Set<string>();
    const candidateVerts = new Set<string>();
    for (const fid of region) {
      const f = mesh.getFace(fid);
      if (f) {
        for (const vid of f.vertexIds) candidateVerts.add(vid);
      }
      for (const eid of mesh.getEdgesForFace(fid)) candidateEdges.add(eid);
    }

    mesh.deleteFaces(new Set(region));
    const deadEdges = new Set<string>();
    for (const eid of candidateEdges) {
      if (mesh.getFacesForEdge(eid).length === 0) deadEdges.add(eid);
    }
    mesh.deleteEdges(deadEdges);

    const newFace = mesh.addFace(traced.loop);
    applyFaceUvsFromMap(newFace, traced.uvMap);
    mesh.pruneOrphanVertices(candidateVerts);
    if (newFace) nextSelected.add(newFace.id);
    dissolvedFacesCount += region.length;
  }

  if (dissolvedFacesCount === 0) {
    return {
      result: { mesh: sourceMesh.clone(), nextSelectedIds: new Set(selectedIds) },
      dissolvedCount: 0,
      error:
        lastError ??
        'Las caras seleccionadas no son adyacentes o formarían una topología inválida.',
    };
  }

  mesh.clearCustomNormals();
  mesh.rebuildIndices();
  return {
    result: { mesh, nextSelectedIds: nextSelected },
    dissolvedCount: dissolvedFacesCount,
    message: `${dissolvedFacesCount} caras disueltas`,
  };
}

/* ============================================================================
 * LIMITED DISSOLVE — Dissolve flat edges & collinear vertices by dihedral angle
 * ========================================================================== */
export interface LimitedDissolveParams {
  maxAngleDeg: number; // 0.1 .. 180
  dissolveVertices: boolean;
  scope: 'selection' | 'all';
}

export interface LimitedDissolveResult {
  result: MeshOperatorResult;
  dissolvedEdges: number;
  dissolvedVertices: number;
  message?: string;
  error?: string;
}

export function limitedDissolveMesh(
  sourceMesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: Set<string>,
  params: LimitedDissolveParams,
): LimitedDissolveResult {
  const mesh = sourceMesh.clone();
  const maxAngle = Math.max(0.1, Math.min(180, Number(params.maxAngleDeg) || 5));
  const useSelection = params.scope === 'selection' && selectedIds.size > 0;

  let candidateEdgeSet: Set<string> | null = null;
  let candidateVertSet: Set<string> | null = null;

  if (useSelection) {
    candidateVertSet = mesh.getVertexIdsFromSelection(mode, selectedIds);
    candidateEdgeSet = new Set<string>();
    if (mode === 'edge') {
      for (const eid of selectedIds) {
        if (mesh.getEdge(eid)) candidateEdgeSet.add(eid);
      }
    } else if (mode === 'face') {
      const selFaces = new Set(selectedIds);
      for (const edge of mesh.edges) {
        const adj = mesh.getFacesForEdge(edge.id);
        if (adj.length === 2 && selFaces.has(adj[0]) && selFaces.has(adj[1])) {
          candidateEdgeSet.add(edge.id);
        }
      }
    } else {
      for (const edge of mesh.edges) {
        if (candidateVertSet.has(edge.v0) && candidateVertSet.has(edge.v1)) {
          candidateEdgeSet.add(edge.id);
        }
      }
    }
  }

  let dissolvedEdges = 0;
  let dissolvedVertices = 0;

  const isConsistentDihedralEdge = (
    edgeId: string,
  ): { ok: boolean; f1Id: string; f2Id: string; angleDeg: number } => {
    const edge = mesh.getEdge(edgeId);
    if (!edge) return { ok: false, f1Id: '', f2Id: '', angleDeg: 180 };
    const adj = mesh.getFacesForEdge(edgeId);
    if (adj.length !== 2 || adj[0] === adj[1]) {
      return { ok: false, f1Id: '', f2Id: '', angleDeg: 180 };
    }
    const f1 = mesh.getFace(adj[0]);
    const f2 = mesh.getFace(adj[1]);
    if (!f1 || !f2) return { ok: false, f1Id: '', f2Id: '', angleDeg: 180 };

    let f1Forward = false;
    let f1Backward = false;
    const n1Len = f1.vertexIds.length;
    for (let i = 0; i < n1Len; i++) {
      const a = f1.vertexIds[i];
      const b = f1.vertexIds[(i + 1) % n1Len];
      if (a === edge.v0 && b === edge.v1) f1Forward = true;
      else if (a === edge.v1 && b === edge.v0) f1Backward = true;
    }

    let f2Forward = false;
    let f2Backward = false;
    const n2Len = f2.vertexIds.length;
    for (let i = 0; i < n2Len; i++) {
      const a = f2.vertexIds[i];
      const b = f2.vertexIds[(i + 1) % n2Len];
      if (a === edge.v0 && b === edge.v1) f2Forward = true;
      else if (a === edge.v1 && b === edge.v0) f2Backward = true;
    }

    const oppositeWinding =
      (f1Forward && f2Backward) || (f1Backward && f2Forward);
    if (!oppositeWinding) {
      return { ok: false, f1Id: f1.id, f2Id: f2.id, angleDeg: 180 };
    }

    const norm1 = normVec(computePolygonNewell(mesh, f1.vertexIds));
    const norm2 = normVec(computePolygonNewell(mesh, f2.vertexIds));
    const d = Math.max(-1, Math.min(1, dotVec(norm1, norm2)));
    const angleDeg = (Math.acos(d) * 180) / Math.PI;
    return {
      ok: angleDeg <= maxAngle + 1e-4,
      f1Id: f1.id,
      f2Id: f2.id,
      angleDeg,
    };
  };

  // Phase 1A: Region-based merge for flat/low-curvature face islands (handles 4-quad grids around center verts cleanly)
  const regionVisited = new Set<string>();
  for (const seedFace of [...mesh.faces]) {
    if (regionVisited.has(seedFace.id) || !mesh.getFace(seedFace.id)) continue;
    const seedNorm = normVec(computePolygonNewell(mesh, seedFace.vertexIds));
    const regionFaces: string[] = [];
    const regionEdgeIds = new Set<string>();
    const regionEdgeKeys = new Set<string>();
    const queue = [seedFace.id];
    regionVisited.add(seedFace.id);

    while (queue.length > 0) {
      const fid = queue.shift()!;
      regionFaces.push(fid);
      for (const eid of mesh.getEdgesForFace(fid)) {
        if (candidateEdgeSet && !candidateEdgeSet.has(eid)) continue;
        const chk = isConsistentDihedralEdge(eid);
        if (!chk.ok) continue;
        const otherFid = chk.f1Id === fid ? chk.f2Id : chk.f1Id;
        if (regionVisited.has(otherFid)) {
          // Edge between two faces already in this region
          const e = mesh.getEdge(eid);
          if (e) {
            regionEdgeIds.add(eid);
            regionEdgeKeys.add(canonicalEdgeKey(e.v0, e.v1));
          }
          continue;
        }
        const otherFace = mesh.getFace(otherFid);
        if (!otherFace) continue;
        const otherNorm = normVec(computePolygonNewell(mesh, otherFace.vertexIds));
        const spreadDeg =
          (Math.acos(Math.max(-1, Math.min(1, dotVec(seedNorm, otherNorm)))) *
            180) /
          Math.PI;
        if (spreadDeg > maxAngle + 1e-4) continue;

        const e = mesh.getEdge(eid);
        if (e) {
          regionEdgeIds.add(eid);
          regionEdgeKeys.add(canonicalEdgeKey(e.v0, e.v1));
        }
        regionVisited.add(otherFid);
        queue.push(otherFid);
      }
    }

    if (regionFaces.length < 2) continue;

    const traced = traceFaceRegionBoundary(mesh, regionFaces, regionEdgeKeys);
    if (!traced.loop) continue;

    const candidateVerts = new Set<string>();
    const candidateRegionEdges = new Set<string>();
    for (const fid of regionFaces) {
      const f = mesh.getFace(fid);
      if (f) {
        for (const vid of f.vertexIds) candidateVerts.add(vid);
      }
      for (const eid of mesh.getEdgesForFace(fid)) candidateRegionEdges.add(eid);
    }

    mesh.deleteFaces(new Set(regionFaces));
    const deadEdges = new Set<string>();
    for (const eid of candidateRegionEdges) {
      if (regionEdgeIds.has(eid) || mesh.getFacesForEdge(eid).length === 0) {
        deadEdges.add(eid);
      }
    }
    mesh.deleteEdges(deadEdges);

    const nf = mesh.addFace(traced.loop);
    applyFaceUvsFromMap(nf, traced.uvMap);
    mesh.pruneOrphanVertices(candidateVerts);
    dissolvedEdges += regionEdgeIds.size;
    if (candidateVertSet) {
      for (const vid of traced.loop) candidateVertSet.add(vid);
    }
  }

  // Phase 1B: Iteratively dissolve remaining manifold interior edges with smallest dihedral angle <= maxAngle
  while (true) {
    const candidates: { edgeId: string; angleDeg: number }[] = [];

    for (const edge of mesh.edges) {
      if (candidateEdgeSet && !candidateEdgeSet.has(edge.id)) continue;
      const chk = isConsistentDihedralEdge(edge.id);
      if (chk.ok) {
        candidates.push({ edgeId: edge.id, angleDeg: chk.angleDeg });
      }
    }

    if (candidates.length === 0) break;
    candidates.sort((a, b) => a.angleDeg - b.angleDeg);

    let mergedInPass = false;
    for (const cand of candidates) {
      if (!mesh.getEdge(cand.edgeId)) continue;
      const edge = mesh.getEdge(cand.edgeId)!;
      const v0 = edge.v0;
      const v1 = edge.v1;
      const res = addSingleEdgeFaceMerge(mesh, cand.edgeId);
      if (res.mergedFace) {
        dissolvedEdges++;
        mergedInPass = true;
        if (candidateVertSet) {
          candidateVertSet.add(v0);
          candidateVertSet.add(v1);
        }
        break; // Re-evaluate dihedral angles after face merge
      }
    }

    if (!mergedInPass) break;
  }

  // Phase 2: Dissolve collinear valence-2 vertices within maxAngle threshold
  if (params.dissolveVertices !== false) {
    let vertChanged = true;
    while (vertChanged) {
      vertChanged = false;
      for (const vert of [...mesh.vertices]) {
        if (candidateVertSet && !candidateVertSet.has(vert.id)) continue;
        const incEdges = mesh.getEdgesForVertex(vert.id);
        if (incEdges.length !== 2) continue;

        const eA = mesh.getEdge(incEdges[0]);
        const eB = mesh.getEdge(incEdges[1]);
        if (!eA || !eB) continue;
        const nAId = eA.v0 === vert.id ? eA.v1 : eA.v0;
        const nBId = eB.v0 === vert.id ? eB.v1 : eB.v0;
        if (nAId === nBId) continue;
        if (mesh.findEdgeId(nAId, nBId)) continue;

        const vA = mesh.getVertex(nAId);
        const vB = mesh.getVertex(nBId);
        if (!vA || !vB) continue;

        const d1 = normVec(subVec(vert.position, vA.position));
        const d2 = normVec(subVec(vB.position, vert.position));
        const cornerAngleDeg =
          (Math.acos(Math.max(-1, Math.min(1, dotVec(d1, d2)))) * 180) / Math.PI;
        if (cornerAngleDeg > maxAngle + 1e-4) continue;

        const incFaces = mesh.getFacesForVertex(vert.id);
        if (incFaces.length === 0) continue;

        const faces = incFaces
          .map((fid) => mesh.getFace(fid))
          .filter((f): f is MeshFace => Boolean(f));
        if (faces.length !== incFaces.length) continue;

        const strippedPolys: string[][] = [];
        let canStrip = true;
        for (const f of faces) {
          const stripped = f.vertexIds.filter((id) => id !== vert.id);
          if (!isValidPolygonLoop(mesh, stripped)) {
            canStrip = false;
            break;
          }
          strippedPolys.push(stripped);
        }
        if (!canStrip) continue;

        const uvMap = buildVertexUvMapForFaces(mesh, faces);
        mesh.deleteFaces(new Set(incFaces));
        mesh.deleteEdges(new Set(incEdges));
        mesh.deleteVertices(new Set([vert.id]));
        for (const poly of strippedPolys) {
          const nf = mesh.addFace(poly);
          applyFaceUvsFromMap(nf, uvMap);
        }
        dissolvedVertices++;
        vertChanged = true;
      }
    }
  }

  mesh.pruneOrphanVertices();
  mesh.clearCustomNormals();
  mesh.rebuildIndices();

  const nextSelected = new Set<string>();
  if (mode === 'vertex') {
    for (const id of selectedIds) if (mesh.getVertex(id)) nextSelected.add(id);
  } else if (mode === 'edge') {
    for (const id of selectedIds) if (mesh.getEdge(id)) nextSelected.add(id);
  } else {
    for (const id of selectedIds) if (mesh.getFace(id)) nextSelected.add(id);
  }

  if (dissolvedEdges === 0 && dissolvedVertices === 0) {
    return {
      result: { mesh: sourceMesh.clone(), nextSelectedIds: new Set(selectedIds) },
      dissolvedEdges: 0,
      dissolvedVertices: 0,
      error: `Sin aristas o vértices por debajo de ${maxAngle.toFixed(1)}° para disolver.`,
    };
  }

  return {
    result: { mesh, nextSelectedIds: nextSelected },
    dissolvedEdges,
    dissolvedVertices,
    message: `Limited Dissolve: ${dissolvedEdges} arista${dissolvedEdges === 1 ? '' : 's'} y ${dissolvedVertices} vértice${dissolvedVertices === 1 ? '' : 's'}`,
  };
}

/* ============================================================================
 * BRIDGE EDGE LOOPS — Conectar dos contornos abiertos
 * ========================================================================== */
export interface BridgeEdgeLoopsParams {
  segments: number; // 1 .. 16
  smoothness: number; // 0 .. 1
  twistOffset: number;
  reverseOrder: boolean;
}

export interface BridgeEdgeLoopsAnalysis {
  valid: boolean;
  loopA: string[];
  loopB: string[];
  isClosed: boolean;
  error?: string;
}

export interface BridgeEdgeLoopsResult {
  result: MeshOperatorResult;
  createdFaces: number;
  nextMode?: EditSelectionMode;
  message?: string;
  error?: string;
}

function extractOrderedContour(
  edgeList: { v0: string; v1: string }[],
): { verts: string[]; isClosed: boolean } | { error: string } {
  const adj = new Map<string, Set<string>>();
  for (const e of edgeList) {
    if (e.v0 === e.v1) continue;
    if (!adj.has(e.v0)) adj.set(e.v0, new Set());
    if (!adj.has(e.v1)) adj.set(e.v1, new Set());
    adj.get(e.v0)!.add(e.v1);
    adj.get(e.v1)!.add(e.v0);
  }

  const allVerts = Array.from(adj.keys());
  if (allVerts.length < 2) {
    return { error: 'Cada contorno debe tener al menos 2 vértices.' };
  }

  const endpoints: string[] = [];
  for (const vid of allVerts) {
    const deg = adj.get(vid)!.size;
    if (deg > 2) {
      return {
        error: 'Uno de los contornos tiene ramificaciones (valencia > 2) y no es un bucle simple.',
      };
    }
    if (deg === 1) endpoints.push(vid);
  }

  if (endpoints.length !== 0 && endpoints.length !== 2) {
    return {
      error: 'Uno de los contornos no forma una cadena ni un bucle cerrado continuo.',
    };
  }

  const isClosed = endpoints.length === 0;
  const start = isClosed ? allVerts[0] : endpoints[0];
  const verts: string[] = [];
  const seen = new Set<string>();
  let curr: string | undefined = start;
  let prev: string | null = null;

  while (curr && !seen.has(curr)) {
    seen.add(curr);
    verts.push(curr);
    const neighbors: string[] = Array.from(adj.get(curr) ?? []);
    const next: string | undefined = neighbors.find((n: string) => n !== prev);
    prev = curr;
    curr = next;
  }

  if (verts.length !== allVerts.length) {
    return { error: 'No se pudo recorrer el contorno de forma continua.' };
  }

  return { verts, isClosed };
}

export function analyzeBridgeEdgeLoops(
  mesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: Set<string>,
): BridgeEdgeLoopsAnalysis {
  if (selectedIds.size < 2) {
    return {
      valid: false,
      loopA: [],
      loopB: [],
      isClosed: false,
      error: 'Selecciona dos contornos de aristas abiertos para conectar.',
    };
  }

  const candidateEdges: { id: string; v0: string; v1: string }[] = [];
  if (mode === 'edge') {
    for (const eid of selectedIds) {
      const e = mesh.getEdge(eid);
      if (e) candidateEdges.push(e);
    }
  } else if (mode === 'vertex') {
    const vSet = new Set(
      Array.from(selectedIds).filter((vid) => Boolean(mesh.getVertex(vid))),
    );
    for (const e of mesh.edges) {
      if (vSet.has(e.v0) && vSet.has(e.v1)) candidateEdges.push(e);
    }
  } else {
    // Face mode: collect boundary edges of selected face selection
    const faceSet = new Set(
      Array.from(selectedIds).filter((fid) => Boolean(mesh.getFace(fid))),
    );
    for (const e of mesh.edges) {
      const adj = mesh.getFacesForEdge(e.id);
      const selCount = adj.filter((fid) => faceSet.has(fid)).length;
      if (selCount === 1) candidateEdges.push(e);
    }
  }

  if (candidateEdges.length < 2) {
    return {
      valid: false,
      loopA: [],
      loopB: [],
      isClosed: false,
      error: 'Selecciona al menos dos contornos de aristas separados.',
    };
  }

  // Ensure selected edges are open boundary / wire edges (max 1 adjacent face) so we stay manifold
  for (const e of candidateEdges) {
    if (mesh.getFacesForEdge(e.id).length > 1) {
      return {
        valid: false,
        loopA: [],
        loopB: [],
        isClosed: false,
        error:
          'Solo se pueden conectar contornos de borde abierto (aristas con 0 o 1 cara adyacente).',
      };
    }
  }

  // Connected components of edges by shared vertices
  const vertToEdges = new Map<string, typeof candidateEdges>();
  for (const e of candidateEdges) {
    if (!vertToEdges.has(e.v0)) vertToEdges.set(e.v0, []);
    if (!vertToEdges.has(e.v1)) vertToEdges.set(e.v1, []);
    vertToEdges.get(e.v0)!.push(e);
    vertToEdges.get(e.v1)!.push(e);
  }

  const visitedEdges = new Set<string>();
  const components: { id: string; v0: string; v1: string }[][] = [];

  for (const seed of candidateEdges) {
    if (visitedEdges.has(seed.id)) continue;
    const comp: typeof candidateEdges = [];
    const queue = [seed];
    visitedEdges.add(seed.id);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const vid of [cur.v0, cur.v1]) {
        for (const nxt of vertToEdges.get(vid) ?? []) {
          if (!visitedEdges.has(nxt.id)) {
            visitedEdges.add(nxt.id);
            queue.push(nxt);
          }
        }
      }
    }
    components.push(comp);
  }

  if (components.length !== 2) {
    return {
      valid: false,
      loopA: [],
      loopB: [],
      isClosed: false,
      error:
        components.length < 2
          ? 'Los bordes seleccionados pertenecen a un único contorno; selecciona dos contornos separados.'
          : `Se detectaron ${components.length} contornos; selecciona exactamente 2 contornos para Bridge Edge Loops.`,
    };
  }

  const contourA = extractOrderedContour(components[0]);
  if ('error' in contourA) {
    return { valid: false, loopA: [], loopB: [], isClosed: false, error: contourA.error };
  }
  const contourB = extractOrderedContour(components[1]);
  if ('error' in contourB) {
    return { valid: false, loopA: [], loopB: [], isClosed: false, error: contourB.error };
  }

  if (contourA.isClosed !== contourB.isClosed) {
    return {
      valid: false,
      loopA: [],
      loopB: [],
      isClosed: false,
      error: 'Ambos contornos deben ser cerrados o ambos deben ser cadenas abiertas.',
    };
  }

  if (contourA.verts.length !== contourB.verts.length) {
    return {
      valid: false,
      loopA: contourA.verts,
      loopB: contourB.verts,
      isClosed: contourA.isClosed,
      error: `Los contornos tienen distinto número de vértices (${contourA.verts.length} y ${contourB.verts.length}). Deben tener la misma cantidad.`,
    };
  }

  return {
    valid: true,
    loopA: contourA.verts,
    loopB: contourB.verts,
    isClosed: contourA.isClosed,
  };
}

function estimateContourTangent(
  mesh: EditableMesh,
  loop: string[],
  idx: number,
  isClosed: boolean,
  fallbackTarget: Vec3,
): Vec3 {
  const n = loop.length;
  const currPos = mesh.getVertex(loop[idx])?.position;
  if (!currPos) return [0, 0, 1];

  const prevIdx = isClosed ? (idx - 1 + n) % n : Math.max(0, idx - 1);
  const nextIdx = isClosed ? (idx + 1) % n : Math.min(n - 1, idx + 1);

  const prevId = loop[prevIdx];
  const nextId = loop[nextIdx];
  const currId = loop[idx];

  const edgePairs: [string, string][] = [];
  if (prevId !== currId) edgePairs.push([prevId, currId]);
  if (nextId !== currId) edgePairs.push([currId, nextId]);

  let accum: Vec3 = [0, 0, 0];
  let hits = 0;

  for (const [u, v] of edgePairs) {
    const eid = mesh.findEdgeId(u, v);
    if (!eid) continue;
    const adj = mesh.getFacesForEdge(eid);
    if (adj.length !== 1) continue;
    const face = mesh.getFace(adj[0]);
    if (!face) continue;

    const pU = mesh.getVertex(u)?.position;
    const pV = mesh.getVertex(v)?.position;
    if (!pU || !pV) continue;

    const fNorm = normVec(computePolygonNewell(mesh, face.vertexIds));
    const edgeDir = normVec(subVec(pV, pU));
    let outDir = normVec(crossVec(fNorm, edgeDir));
    const faceCenter = mesh.computeFaceCenter(face);
    const edgeMid = lerpVec(pU, pV, 0.5);
    // Point outward from the existing face into the bridge gap
    if (dotVec(outDir, subVec(edgeMid, faceCenter)) < 0) {
      outDir = scaleVec(outDir, -1);
    }
    accum = addVec(accum, outDir);
    hits++;
  }

  const chord = subVec(fallbackTarget, currPos);
  const chordDir = normVec(chord);
  if (hits === 0 || lenVec(accum) < 1e-6) {
    return chordDir;
  }
  const tangent = normVec(accum, chordDir);
  return dotVec(tangent, chordDir) < -0.5 ? chordDir : tangent;
}

export function bridgeEdgeLoopsMesh(
  sourceMesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: Set<string>,
  params: BridgeEdgeLoopsParams,
): BridgeEdgeLoopsResult {
  const analysis = analyzeBridgeEdgeLoops(sourceMesh, mode, selectedIds);
  if (!analysis.valid) {
    return {
      result: { mesh: sourceMesh.clone(), nextSelectedIds: new Set(selectedIds) },
      createdFaces: 0,
      error: analysis.error,
    };
  }

  const mesh = sourceMesh.clone();
  const loopA = [...analysis.loopA];
  const baseB = [...analysis.loopB];
  const isClosed = analysis.isClosed;
  const n = loopA.length;

  const posA = loopA.map((vid) => mesh.getVertex(vid)!.position);
  const posBOf = (arr: string[]) => arr.map((vid) => mesh.getVertex(vid)!.position);

  // Align loopB to minimize total bridge distance (avoid twist/crossing)
  let alignedB: string[] = [...baseB];
  if (isClosed) {
    let bestScore = Infinity;
    for (const rev of [false, true]) {
      const candBase = rev ? [...baseB].reverse() : baseB;
      for (let shift = 0; shift < n; shift++) {
        let sumDistSq = 0;
        for (let i = 0; i < n; i++) {
          const pA = posA[i];
          const pB = mesh.getVertex(candBase[(i + shift) % n])!.position;
          const d = subVec(pB, pA);
          sumDistSq += dotVec(d, d);
        }
        if (sumDistSq < bestScore) {
          bestScore = sumDistSq;
          alignedB = Array.from({ length: n }, (_, i) => candBase[(i + shift) % n]);
        }
      }
    }
    if (params.reverseOrder) {
      // Reverse loopB around index 0 while preserving starting anchor alignment
      const anchor = alignedB[0];
      const rest = alignedB.slice(1).reverse();
      alignedB = [anchor, ...rest];
    }
    const twist = ((Math.round(params.twistOffset) % n) + n) % n;
    if (twist !== 0) {
      alignedB = Array.from({ length: n }, (_, i) => alignedB[(i + twist) % n]);
    }
  } else {
    const fwdPos = posBOf(baseB);
    const revBase = [...baseB].reverse();
    const revPos = posBOf(revBase);
    let fwdDistSq = 0;
    let revDistSq = 0;
    for (let i = 0; i < n; i++) {
      const df = subVec(fwdPos[i], posA[i]);
      const dr = subVec(revPos[i], posA[i]);
      fwdDistSq += dotVec(df, df);
      revDistSq += dotVec(dr, dr);
    }
    alignedB = fwdDistSq <= revDistSq ? baseB : revBase;
    if (params.reverseOrder) {
      alignedB = [...alignedB].reverse();
    }
  }

  const segCount = Math.max(1, Math.min(16, Math.round(params.segments || 1)));
  const smoothness = Math.max(0, Math.min(1, Number(params.smoothness) || 0));

  // Build vertex rings from ring[0] = loopA .. ring[segCount] = alignedB
  const rings: string[][] = [loopA];
  if (segCount > 1) {
    const tanA = loopA.map((_, i) =>
      estimateContourTangent(
        mesh,
        loopA,
        i,
        isClosed,
        mesh.getVertex(alignedB[i])!.position,
      ),
    );
    const tanB = alignedB.map((_, i) =>
      estimateContourTangent(
        mesh,
        alignedB,
        i,
        isClosed,
        mesh.getVertex(loopA[i])!.position,
      ),
    );

    for (let s = 1; s < segCount; s++) {
      const t = s / segCount;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      const midRing: string[] = [];
      for (let i = 0; i < n; i++) {
        const vA = mesh.getVertex(loopA[i])!;
        const vB = mesh.getVertex(alignedB[i])!;
        const p0 = vA.position;
        const p1 = vB.position;
        const linearP = lerpVec(p0, p1, t);

        let finalP = linearP;
        if (smoothness > 1e-4) {
          const chordLen = lenVec(subVec(p1, p0));
          const m0 = scaleVec(tanA[i], chordLen);
          const m1 = scaleVec(scaleVec(tanB[i], -1), chordLen);
          const hermiteP: Vec3 = [
            h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
            h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
            h00 * p0[2] + h10 * m0[2] + h01 * p1[2] + h11 * m1[2],
          ];
          finalP = lerpVec(linearP, hermiteP, smoothness);
        }

        const nv = mesh.addVertex(finalP[0], finalP[1], finalP[2]);
        if (vA.uv && vB.uv) {
          nv.uv = [
            vA.uv[0] + (vB.uv[0] - vA.uv[0]) * t,
            vA.uv[1] + (vB.uv[1] - vA.uv[1]) * t,
          ];
        }
        midRing.push(nv.id);
      }
      rings.push(midRing);
    }
  }
  rings.push(alignedB);

  // Determine consistent face winding from existing adjacent face on loopA or loopB
  let flipWinding: boolean | null = null;
  const edgeStepCount = isClosed ? n : n - 1;

  for (let i = 0; i < edgeStepCount && flipWinding === null; i++) {
    const a0 = loopA[i];
    const a1 = loopA[(i + 1) % n];
    const eid = mesh.findEdgeId(a0, a1);
    if (!eid) continue;
    const adj = mesh.getFacesForEdge(eid);
    if (adj.length === 1) {
      const f = mesh.getFace(adj[0]);
      if (f) {
        const fv = f.vertexIds;
        for (let k = 0; k < fv.length; k++) {
          if (fv[k] === a0 && fv[(k + 1) % fv.length] === a1) {
            // Existing face traverses a0 -> a1, so bridge quad must traverse a1 -> a0 -> b0 -> b1
            flipWinding = true;
            break;
          }
          if (fv[k] === a1 && fv[(k + 1) % fv.length] === a0) {
            flipWinding = false;
            break;
          }
        }
      }
    }
  }

  if (flipWinding === null) {
    for (let i = 0; i < edgeStepCount && flipWinding === null; i++) {
      const b0 = alignedB[i];
      const b1 = alignedB[(i + 1) % n];
      const eid = mesh.findEdgeId(b0, b1);
      if (!eid) continue;
      const adj = mesh.getFacesForEdge(eid);
      if (adj.length === 1) {
        const f = mesh.getFace(adj[0]);
        if (f) {
          const fv = f.vertexIds;
          for (let k = 0; k < fv.length; k++) {
            if (fv[k] === b0 && fv[(k + 1) % fv.length] === b1) {
              // Existing face traverses b0 -> b1; bridge quad touches b edge as b0 -> b1 in flipWinding=false?
              // In [a0, a1, b1, b0], b edge is traversed b1 -> b0 (opposite!). So flipWinding = false.
              flipWinding = false;
              break;
            }
            if (fv[k] === b1 && fv[(k + 1) % fv.length] === b0) {
              flipWinding = true;
              break;
            }
          }
        }
      }
    }
  }

  if (flipWinding === null) {
    const allVerts = [...loopA, ...alignedB];
    const bridgeCenter = mesh.computeCentroid(allVerts) ?? [0, 0, 0];
    const q0 = rings[0][0];
    const q1 = rings[0][1];
    const q2 = rings[1][1];
    const q3 = rings[1][0];
    const qNorm = computePolygonNewell(mesh, [q0, q1, q2, q3]);
    const qCenter = mesh.computeCentroid([q0, q1, q2, q3]) ?? bridgeCenter;
    flipWinding = dotVec(qNorm, subVec(qCenter, bridgeCenter)) < 0;
  }

  const createdFaceIds = new Set<string>();
  for (let s = 0; s < segCount; s++) {
    const r0 = rings[s];
    const r1 = rings[s + 1];
    for (let i = 0; i < edgeStepCount; i++) {
      const nextI = (i + 1) % n;
      const quadVerts = flipWinding
        ? [r0[nextI], r0[i], r1[i], r1[nextI]]
        : [r0[i], r0[nextI], r1[nextI], r1[i]];
      const f = mesh.addFace(quadVerts);
      if (f) {
        if (quadVerts.every((vid) => Boolean(mesh.getVertex(vid)?.uv))) {
          f.uvs = quadVerts.map((vid) => {
            const uv = mesh.getVertex(vid)!.uv!;
            return [uv[0], uv[1]];
          });
        }
        createdFaceIds.add(f.id);
      }
    }
  }

  mesh.clearCustomNormals();
  mesh.rebuildIndices();

  return {
    result: { mesh, nextSelectedIds: createdFaceIds },
    createdFaces: createdFaceIds.size,
    nextMode: 'face',
    message: `Bridge Edge Loops: ${createdFaceIds.size} cara${createdFaceIds.size === 1 ? '' : 's'} creada${createdFaceIds.size === 1 ? '' : 's'}`,
  };
}
