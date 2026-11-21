/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditableMesh, MeshEdge, MeshFace, Vec2, Vec3 } from '../mesh/EditableMesh';
import { UVIsland, UVPackOptions } from './types';

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-9) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function signedArea2D(poly: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    area += p0[0] * p1[1] - p1[0] * p0[1];
  }
  return area * 0.5;
}

function computeFaceNormal3D(mesh: EditableMesh, face: MeshFace): Vec3 {
  const pts: Vec3[] = [];
  for (const vid of face.vertexIds) {
    const v = mesh.getVertex(vid);
    if (v) pts.push(v.position);
  }
  if (pts.length < 3) return [0, 0, 1];
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    nx += (curr[1] - next[1]) * (curr[2] + next[2]);
    ny += (curr[2] - next[2]) * (curr[0] + next[0]);
    nz += (curr[0] - next[0]) * (curr[1] + next[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return [0, 0, 1];
  return [nx / len, ny / len, nz / len];
}

function computeFaceArea3D(mesh: EditableMesh, face: MeshFace): number {
  if (face.vertexIds.length < 3) return 0;
  const p0 = mesh.getVertex(face.vertexIds[0])?.position;
  if (!p0) return 0;
  let total = 0;
  for (let i = 1; i + 1 < face.vertexIds.length; i++) {
    const p1 = mesh.getVertex(face.vertexIds[i])?.position;
    const p2 = mesh.getVertex(face.vertexIds[i + 1])?.position;
    if (!p1 || !p2) continue;
    const c = cross3(sub3(p1, p0), sub3(p2, p0));
    total += 0.5 * Math.hypot(c[0], c[1], c[2]);
  }
  return total;
}

/**
 * Projects a single 3D face onto its own tangent plane with positive 2D winding.
 */
function projectFaceToLocalTangent2D(mesh: EditableMesh, face: MeshFace): Vec2[] {
  const pts: Vec3[] = face.vertexIds.map(
    (vid) => mesh.getVertex(vid)?.position ?? ([0, 0, 0] as Vec3),
  );
  if (pts.length < 3) {
    return pts.map(() => [0, 0] as Vec2);
  }
  const origin = pts[0];
  const normal = computeFaceNormal3D(mesh, face);

  let tangentRaw: Vec3 = [1, 0, 0];
  for (let i = 1; i < pts.length; i++) {
    const d = sub3(pts[i], origin);
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len > 1e-6) {
      tangentRaw = [d[0] / len, d[1] / len, d[2] / len];
      break;
    }
  }
  // Orthonormalize against normal
  const dtn = dot3(tangentRaw, normal);
  let tangent = norm3([
    tangentRaw[0] - normal[0] * dtn,
    tangentRaw[1] - normal[1] * dtn,
    tangentRaw[2] - normal[2] * dtn,
  ]);
  if (Math.hypot(tangent[0], tangent[1], tangent[2]) < 1e-6) {
    const fallback: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    tangent = norm3(cross3(fallback, normal));
  }
  const bitangent = norm3(cross3(normal, tangent));

  const coords: Vec2[] = pts.map((p) => {
    const rel = sub3(p, origin);
    return [dot3(rel, tangent), dot3(rel, bitangent)] as Vec2;
  });

  if (signedArea2D(coords) < 0) {
    for (const uv of coords) {
      uv[1] = -uv[1];
    }
  }
  return coords;
}

/**
 * Finds a seam/non-seam edge lookup by vertex ID pair.
 */
function buildEdgePairMap(mesh: EditableMesh): Map<string, MeshEdge> {
  const map = new Map<string, MeshEdge>();
  for (const e of mesh.edges) {
    map.set(edgeKey(e.v0, e.v1), e);
  }
  return map;
}

/**
 * Ensures all faces in the mesh have valid uvs array matching vertexIds.
 * If missing, generates per-face box/planar UVs so no face starts degenerate.
 */
export function ensureMeshUvs(mesh: EditableMesh): void {
  for (const f of mesh.faces) {
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) {
      const normal = computeFaceNormal3D(mesh, f);
      const ax = Math.abs(normal[0]);
      const ay = Math.abs(normal[1]);
      const az = Math.abs(normal[2]);
      f.uvs = f.vertexIds.map((vid) => {
        const v = mesh.getVertex(vid);
        if (!v) return [0, 0] as Vec2;
        if (ax >= ay && ax >= az) {
          return [(v.position[1] + 1) * 0.5, (v.position[2] + 1) * 0.5] as Vec2;
        }
        if (ay >= ax && ay >= az) {
          return [(v.position[0] + 1) * 0.5, (v.position[2] + 1) * 0.5] as Vec2;
        }
        return [(v.position[0] + 1) * 0.5, (v.position[1] + 1) * 0.5] as Vec2;
      });
    }
  }
}

/**
 * Computes seam-bounded connected face islands for the given face IDs (or all faces).
 */
export function partitionFacesBySeams(
  mesh: EditableMesh,
  faceFilter?: Set<string>,
): string[][] {
  const edgeByPair = buildEdgePairMap(mesh);
  const faceMap = new Map<string, MeshFace>();
  for (const f of mesh.faces) {
    if (!faceFilter || faceFilter.has(f.id)) {
      faceMap.set(f.id, f);
    }
  }

  // Build adjacency via shared non-seam vertex pairs
  const pairToFaces = new Map<string, string[]>();
  for (const f of faceMap.values()) {
    const n = f.vertexIds.length;
    for (let i = 0; i < n; i++) {
      const key = edgeKey(f.vertexIds[i], f.vertexIds[(i + 1) % n]);
      let list = pairToFaces.get(key);
      if (!list) {
        list = [];
        pairToFaces.set(key, list);
      }
      list.push(f.id);
    }
  }

  const visited = new Set<string>();
  const groups: string[][] = [];

  for (const startFace of faceMap.values()) {
    if (visited.has(startFace.id)) continue;
    const island: string[] = [];
    const queue: string[] = [startFace.id];
    visited.add(startFace.id);

    while (queue.length > 0) {
      const fid = queue.shift()!;
      const face = faceMap.get(fid);
      if (!face) continue;
      island.push(fid);

      const n = face.vertexIds.length;
      for (let i = 0; i < n; i++) {
        const key = edgeKey(face.vertexIds[i], face.vertexIds[(i + 1) % n]);
        const edge = edgeByPair.get(key);
        if (edge?.isSeam) continue;
        const neighbors = pairToFaces.get(key) ?? [];
        for (const nbrId of neighbors) {
          if (nbrId !== fid && !visited.has(nbrId)) {
            visited.add(nbrId);
            queue.push(nbrId);
          }
        }
      }
    }

    groups.push(island);
  }

  return groups;
}

/**
 * Extracts UV islands from the mesh by tracing connected face paths
 * that are not separated by edge seams.
 */
export function extractUVIslands(mesh: EditableMesh): UVIsland[] {
  ensureMeshUvs(mesh);
  const faceMap = new Map<string, MeshFace>();
  for (const f of mesh.faces) faceMap.set(f.id, f);

  const groups = partitionFacesBySeams(mesh);
  return groups.map((islandFaceIds, index) => {
    const islandVertexKeys = new Set<string>();
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    let sumU = 0;
    let sumV = 0;
    let count = 0;

    for (const fid of islandFaceIds) {
      const f = faceMap.get(fid);
      if (!f || !f.uvs) continue;
      for (let i = 0; i < f.vertexIds.length; i++) {
        islandVertexKeys.add(`${fid}::${f.vertexIds[i]}`);
        const uv = f.uvs[i];
        if (!uv) continue;
        minU = Math.min(minU, uv[0]);
        minV = Math.min(minV, uv[1]);
        maxU = Math.max(maxU, uv[0]);
        maxV = Math.max(maxV, uv[1]);
        sumU += uv[0];
        sumV += uv[1];
        count++;
      }
    }

    if (count === 0) {
      minU = 0;
      minV = 0;
      maxU = 1;
      maxV = 1;
      sumU = 0.5;
      sumV = 0.5;
    }

    return {
      id: `island_${index + 1}`,
      faceIds: islandFaceIds,
      vertexIds: Array.from(islandVertexKeys),
      min: [minU, minV],
      max: [maxU, maxV],
      center: [sumU / Math.max(1, count), sumV / Math.max(1, count)],
    };
  });
}

/**
 * Planar projection mapping for selected or all faces.
 */
export function applyPlanarProjection(
  mesh: EditableMesh,
  faceIds?: Set<string>,
  axis: 'x' | 'y' | 'z' = 'z',
): void {
  ensureMeshUvs(mesh);
  for (const f of mesh.faces) {
    if (faceIds && faceIds.size > 0 && !faceIds.has(f.id)) continue;
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;

    f.uvs = f.vertexIds.map((vid) => {
      const v = mesh.getVertex(vid);
      if (!v) return [0, 0] as Vec2;
      let u = 0;
      let w = 0;
      if (axis === 'x') {
        u = v.position[1];
        w = v.position[2];
      } else if (axis === 'y') {
        u = v.position[0];
        w = v.position[2];
      } else {
        u = v.position[0];
        w = v.position[1];
      }
      return [u * 0.5 + 0.5, w * 0.5 + 0.5] as Vec2;
    });
  }
}

/**
 * Cylindrical projection mapping.
 */
export function applyCylindricalProjection(
  mesh: EditableMesh,
  faceIds?: Set<string>,
): void {
  ensureMeshUvs(mesh);
  for (const f of mesh.faces) {
    if (faceIds && faceIds.size > 0 && !faceIds.has(f.id)) continue;
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;

    f.uvs = f.vertexIds.map((vid) => {
      const v = mesh.getVertex(vid);
      if (!v) return [0, 0] as Vec2;
      const theta = Math.atan2(v.position[1], v.position[0]);
      const u = (theta + Math.PI) / (2 * Math.PI);
      const h = (v.position[2] + 1) * 0.5;
      return [u, h] as Vec2;
    });
  }
}

/**
 * Spherical projection mapping.
 */
export function applySphericalProjection(
  mesh: EditableMesh,
  faceIds?: Set<string>,
): void {
  ensureMeshUvs(mesh);
  for (const f of mesh.faces) {
    if (faceIds && faceIds.size > 0 && !faceIds.has(f.id)) continue;
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;

    f.uvs = f.vertexIds.map((vid) => {
      const v = mesh.getVertex(vid);
      if (!v) return [0, 0] as Vec2;
      const len = Math.hypot(v.position[0], v.position[1], v.position[2]) || 1;
      const nx = v.position[0] / len;
      const ny = v.position[1] / len;
      const nz = v.position[2] / len;

      const u = (Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI);
      const lat = Math.asin(Math.max(-1, Math.min(1, nz)));
      const vCoord = lat / Math.PI + 0.5;
      return [u, vCoord] as Vec2;
    });
  }
}

/**
 * Seam-respecting per-island 3D-to-2D chart unfolding:
 * 1. Splits faces into connected islands bounded by `edge.isSeam === true`.
 * 2. Unfolds each island from a root face across non-seam edges using rigid tangent-plane alignment.
 * 3. Welds shared non-seam vertex corners cleanly when doing so keeps face areas valid, leaving seams crisp.
 * 4. Packs all UV islands cleanly inside [0, 1]^2 without overlaps.
 */
export function executeUnwrap(mesh: EditableMesh, faceIds?: Set<string>): void {
  ensureMeshUvs(mesh);
  if (mesh.faces.length === 0) return;

  const targetFilter = faceIds && faceIds.size > 0 ? faceIds : undefined;
  const edgeByPair = buildEdgePairMap(mesh);
  const faceMap = new Map<string, MeshFace>();
  for (const f of mesh.faces) {
    faceMap.set(f.id, f);
  }

  const islands = partitionFacesBySeams(mesh, targetFilter);

  // Local map of non-seam edges inside each island
  for (const islandFaceIds of islands) {
    if (islandFaceIds.length === 0) continue;

    // Pick root face with largest 3D area
    let rootFid = islandFaceIds[0];
    let bestArea = -1;
    for (const fid of islandFaceIds) {
      const face = faceMap.get(fid);
      if (!face) continue;
      const area = computeFaceArea3D(mesh, face);
      if (area > bestArea) {
        bestArea = area;
        rootFid = fid;
      }
    }

    const islandFaceSet = new Set(islandFaceIds);
    const pairToIslandFaces = new Map<string, string[]>();
    for (const fid of islandFaceIds) {
      const f = faceMap.get(fid);
      if (!f) continue;
      const n = f.vertexIds.length;
      for (let i = 0; i < n; i++) {
        const key = edgeKey(f.vertexIds[i], f.vertexIds[(i + 1) % n]);
        let list = pairToIslandFaces.get(key);
        if (!list) {
          list = [];
          pairToIslandFaces.set(key, list);
        }
        list.push(fid);
      }
    }

    const placedFaces = new Map<string, Vec2[]>();
    const rootFace = faceMap.get(rootFid);
    if (!rootFace) continue;

    placedFaces.set(rootFid, projectFaceToLocalTangent2D(mesh, rootFace));
    const queue: string[] = [rootFid];

    while (queue.length > 0) {
      const currFid = queue.shift()!;
      const currFace = faceMap.get(currFid);
      const currUVs = placedFaces.get(currFid);
      if (!currFace || !currUVs) continue;

      const cn = currFace.vertexIds.length;
      for (let ci = 0; ci < cn; ci++) {
        const va = currFace.vertexIds[ci];
        const vb = currFace.vertexIds[(ci + 1) % cn];
        const pairKey = edgeKey(va, vb);
        const edge = edgeByPair.get(pairKey);
        if (edge?.isSeam) continue;

        const neighbors = pairToIslandFaces.get(pairKey) ?? [];
        for (const nbrFid of neighbors) {
          if (nbrFid === currFid || placedFaces.has(nbrFid) || !islandFaceSet.has(nbrFid)) {
            continue;
          }
          const nbrFace = faceMap.get(nbrFid);
          if (!nbrFace) continue;

          const idxA = nbrFace.vertexIds.indexOf(va);
          const idxB = nbrFace.vertexIds.indexOf(vb);
          if (idxA === -1 || idxB === -1) {
            placedFaces.set(nbrFid, projectFaceToLocalTangent2D(mesh, nbrFace));
            queue.push(nbrFid);
            continue;
          }

          const localUVs = projectFaceToLocalTangent2D(mesh, nbrFace);
          const targetA = currUVs[ci];
          const targetB = currUVs[(ci + 1) % cn];
          const localA = localUVs[idxA];
          const localB = localUVs[idxB];

          const targetDx = targetB[0] - targetA[0];
          const targetDy = targetB[1] - targetA[1];
          const localDx = localB[0] - localA[0];
          const localDy = localB[1] - localA[1];

          const targetLen = Math.hypot(targetDx, targetDy);
          const localLen = Math.hypot(localDx, localDy);

          if (targetLen < 1e-9 || localLen < 1e-9) {
            placedFaces.set(nbrFid, localUVs);
            queue.push(nbrFid);
            continue;
          }

          // Align local(va->vb) onto target(va->vb) with rigid rotation + scale match if tiny numerical drift
          const targetAngle = Math.atan2(targetDy, targetDx);
          const localAngle = Math.atan2(localDy, localDx);
          const rot = targetAngle - localAngle;
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const ratio = targetLen / localLen;

          const alignedUVs: Vec2[] = localUVs.map((p) => {
            const rx = (p[0] - localA[0]) * ratio;
            const ry = (p[1] - localA[1]) * ratio;
            return [
              targetA[0] + (rx * cosR - ry * sinR),
              targetA[1] + (rx * sinR + ry * cosR),
            ] as Vec2;
          });

          // Ensure neighbor is on the opposite side of the shared edge when unfolded nicely
          const sharedMidU = (targetA[0] + targetB[0]) * 0.5;
          const sharedMidV = (targetA[1] + targetB[1]) * 0.5;
          const currCentroid = currUVs.reduce(
            (acc, p) => [acc[0] + p[0], acc[1] + p[1]] as Vec2,
            [0, 0] as Vec2,
          );
          currCentroid[0] /= currUVs.length;
          currCentroid[1] /= currUVs.length;
          const nbrCentroid = alignedUVs.reduce(
            (acc, p) => [acc[0] + p[0], acc[1] + p[1]] as Vec2,
            [0, 0] as Vec2,
          );
          nbrCentroid[0] /= alignedUVs.length;
          nbrCentroid[1] /= alignedUVs.length;

          // Edge normal in 2D
          const ex = targetB[0] - targetA[0];
          const ey = targetB[1] - targetA[1];
          const nx = -ey;
          const ny = ex;
          const currSide = (currCentroid[0] - sharedMidU) * nx + (currCentroid[1] - sharedMidV) * ny;
          const nbrSide = (nbrCentroid[0] - sharedMidU) * nx + (nbrCentroid[1] - sharedMidV) * ny;

          if (currSide * nbrSide > 0 && Math.abs(currSide) > 1e-8 && Math.abs(nbrSide) > 1e-8) {
            // Reflect across shared edge A->B if unfolded onto the same side (happens if face orientation differs)
            const ux = ex / targetLen;
            const uy = ey / targetLen;
            for (const p of alignedUVs) {
              const px = p[0] - targetA[0];
              const py = p[1] - targetA[1];
              const proj = px * ux + py * uy;
              const rx = 2 * proj * ux - px;
              const ry = 2 * proj * uy - py;
              p[0] = targetA[0] + rx;
              p[1] = targetA[1] + ry;
            }
          }

          placedFaces.set(nbrFid, alignedUVs);
          queue.push(nbrFid);
        }
      }
    }

    // Write unfolded coordinates back to mesh faces
    for (const [fid, uvs] of placedFaces.entries()) {
      const f = faceMap.get(fid);
      if (f) {
        f.uvs = uvs.map((uv) => [uv[0], uv[1]] as Vec2);
      }
    }

    // Gently weld non-seam shared corners within the same island if closely coincident (< 0.15 * avgEdge)
    const vertexGroups = new Map<string, Array<{ face: MeshFace; cornerIdx: number }>>();
    let totalEdgeLen = 0;
    let totalEdges = 0;
    for (const fid of islandFaceIds) {
      const f = faceMap.get(fid);
      if (!f || !f.uvs) continue;
      for (let i = 0; i < f.vertexIds.length; i++) {
        const vid = f.vertexIds[i];
        let list = vertexGroups.get(vid);
        if (!list) {
          list = [];
          vertexGroups.set(vid, list);
        }
        list.push({ face: f, cornerIdx: i });
        const nextUv = f.uvs[(i + 1) % f.uvs.length];
        totalEdgeLen += Math.hypot(nextUv[0] - f.uvs[i][0], nextUv[1] - f.uvs[i][1]);
        totalEdges++;
      }
    }
    const weldThreshold = (totalEdgeLen / Math.max(1, totalEdges)) * 0.25;
    for (const corners of vertexGroups.values()) {
      if (corners.length <= 1) continue;
      // Cluster corners that are close together (so legitimate chart cuts remain un-welded)
      const clusters: Array<Array<{ face: MeshFace; cornerIdx: number }>> = [];
      for (const c of corners) {
        const uv = c.face.uvs![c.cornerIdx];
        let placed = false;
        for (const cluster of clusters) {
          const ref = cluster[0].face.uvs![cluster[0].cornerIdx];
          if (Math.hypot(uv[0] - ref[0], uv[1] - ref[1]) <= weldThreshold) {
            cluster.push(c);
            placed = true;
            break;
          }
        }
        if (!placed) clusters.push([c]);
      }
      for (const cluster of clusters) {
        if (cluster.length <= 1) continue;
        let su = 0;
        let sv = 0;
        for (const c of cluster) {
          su += c.face.uvs![c.cornerIdx][0];
          sv += c.face.uvs![c.cornerIdx][1];
        }
        const au = su / cluster.length;
        const av = sv / cluster.length;
        for (const c of cluster) {
          c.face.uvs![c.cornerIdx][0] = au;
          c.face.uvs![c.cornerIdx][1] = av;
        }
      }
    }
  }

  packUVIslands(mesh, { margin: 0.025, rotate: true, scale: true });
}

interface PackItem {
  island: UVIsland;
  width: number;
  height: number;
  rotate90: boolean;
}

/**
 * Packs UV islands into the 0-1 UV space cleanly without overlapping or clipping outside [margin, 1-margin].
 */
export function packUVIslands(mesh: EditableMesh, options: UVPackOptions): void {
  const islands = extractUVIslands(mesh);
  if (islands.length === 0) return;

  const faceMap = new Map<string, MeshFace>();
  for (const f of mesh.faces) faceMap.set(f.id, f);

  const margin = Math.max(0.005, Math.min(0.15, options.margin));

  const items: PackItem[] = islands.map((island) => {
    const rawW = Math.max(1e-4, island.max[0] - island.min[0]);
    const rawH = Math.max(1e-4, island.max[1] - island.min[1]);
    // Optionally orient taller than wide -> wide or normalize row friendliness
    const rotate90 = Boolean(options.rotate) && rawW < rawH * 0.85;
    return {
      island,
      width: rotate90 ? rawH : rawW,
      height: rotate90 ? rawW : rawH,
      rotate90,
    };
  });

  // Sort tallest first for tight shelf packing
  items.sort((a, b) => b.height - a.height || b.width - a.width);

  // Estimate initial shelf width aiming for roughly square occupancy
  const totalArea = items.reduce((acc, it) => acc + it.width * it.height, 0);
  const maxItemW = Math.max(...items.map((it) => it.width));
  const usable = Math.max(0.2, 1.0 - margin * 2);

  if (!options.scale) {
    // Non-scaling shelf pack inside [margin, 1 - margin]
    let currentX = margin;
    let currentY = margin;
    let rowHeight = 0;
    const maxPerRow = 1.0 - margin;

    for (const item of items) {
      if (currentX > margin && currentX + item.width > maxPerRow) {
        currentX = margin;
        currentY += rowHeight + margin;
        rowHeight = 0;
      }
      placePackedItem(faceMap, item, currentX, currentY, 1.0);
      currentX += item.width + margin;
      rowHeight = Math.max(rowHeight, item.height);
    }
    return;
  }

  // With scale optimization: shelf-pack in unscaled chart units, then uniformly fit into [margin, 1-margin]^2
  // Gap in chart units balances final margin ratio
  const roughSide = Math.max(maxItemW, Math.sqrt(totalArea * 1.35));
  const chartGap = roughSide * (margin / usable);

  let cx = 0;
  let cy = 0;
  let rowH = 0;
  let usedW = 0;
  const placements: Array<{ item: PackItem; x: number; y: number }> = [];

  for (const item of items) {
    if (cx > 0 && cx + item.width > roughSide) {
      cx = 0;
      cy += rowH + chartGap;
      rowH = 0;
    }
    placements.push({ item, x: cx, y: cy });
    usedW = Math.max(usedW, cx + item.width);
    cx += item.width + chartGap;
    rowH = Math.max(rowH, item.height);
  }
  const usedH = cy + rowH;
  const maxDim = Math.max(1e-4, usedW, usedH);
  const scaleFactor = usable / maxDim;

  // Center packed layout inside [margin, 1 - margin]^2
  const finalW = usedW * scaleFactor;
  const finalH = usedH * scaleFactor;
  const offsetX = margin + (usable - finalW) * 0.5;
  const offsetY = margin + (usable - finalH) * 0.5;

  for (const p of placements) {
    placePackedItem(
      faceMap,
      p.item,
      offsetX + p.x * scaleFactor,
      offsetY + p.y * scaleFactor,
      scaleFactor,
    );
  }
}

function placePackedItem(
  faceMap: Map<string, MeshFace>,
  item: PackItem,
  targetMinU: number,
  targetMinV: number,
  scale: number,
): void {
  const { island, rotate90 } = item;
  const srcMinU = island.min[0];
  const srcMinV = island.min[1];
  const srcMaxV = island.max[1];

  for (const fid of island.faceIds) {
    const f = faceMap.get(fid);
    if (!f || !f.uvs) continue;
    for (let i = 0; i < f.uvs.length; i++) {
      const u = f.uvs[i][0];
      const v = f.uvs[i][1];
      if (rotate90) {
        // 90 deg CCW around source bbox: (u', v') = (srcMaxV - v, u - srcMinU)
        const ru = srcMaxV - v;
        const rv = u - srcMinU;
        f.uvs[i][0] = targetMinU + ru * scale;
        f.uvs[i][1] = targetMinV + rv * scale;
      } else {
        f.uvs[i][0] = targetMinU + (u - srcMinU) * scale;
        f.uvs[i][1] = targetMinV + (v - srcMinV) * scale;
      }
    }
  }
}
