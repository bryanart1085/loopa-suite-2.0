import * as THREE from 'three';
import { EditableMesh, Vec3 } from './EditableMesh';

export type EditSelectionMode = 'vertex' | 'edge' | 'face';

/**
 * Extension point interface for future modeling tools:
 * Extrude, Subdivide, Loop Cut, Bevel, Inset, Merge, Bridge, Proportional Editing, etc.
 */
export interface MeshOperatorContext {
  mesh: EditableMesh;
  selectionMode: EditSelectionMode;
  selectedIds: Set<string>;
}

export interface MeshOperatorResult {
  mesh: EditableMesh;
  nextSelectedIds: Set<string>;
}

export interface MeshOperator {
  readonly id: string;
  readonly label: string;
  canExecute(ctx: MeshOperatorContext): boolean;
  execute(ctx: MeshOperatorContext, params?: Record<string, unknown>): MeshOperatorResult;
}

/**
 * Registry allowing future operators (extrude, subdivide, bevel, inset, etc.)
 * to be plugged in without rewriting the core engine.
 */
export class MeshOperatorRegistry {
  private operators = new Map<string, MeshOperator>();

  public register(op: MeshOperator): void {
    this.operators.set(op.id, op);
  }

  public get(id: string): MeshOperator | undefined {
    return this.operators.get(id);
  }

  public list(): MeshOperator[] {
    return Array.from(this.operators.values());
  }
}

export const meshOperatorRegistry = new MeshOperatorRegistry();

const _v = new THREE.Vector3();
const _pivot = new THREE.Vector3();

/**
 * Applies a local-space transformation matrix around a local pivot to a set of vertices.
 */
export function applyTransformToVertices(
  mesh: EditableMesh,
  vertexIds: Set<string>,
  deltaMatrix: THREE.Matrix4,
  pivotLocal: Vec3,
): void {
  _pivot.set(pivotLocal[0], pivotLocal[1], pivotLocal[2]);
  for (const vid of vertexIds) {
    const vert = mesh.getVertex(vid);
    if (!vert) continue;
    _v.set(vert.position[0], vert.position[1], vert.position[2]);
    _v.sub(_pivot);
    _v.applyMatrix4(deltaMatrix);
    _v.add(_pivot);
    vert.position[0] = _v.x;
    vert.position[1] = _v.y;
    vert.position[2] = _v.z;
  }
}

/**
 * Deletes currently selected vertices, edges, or faces while maintaining
 * topological consistency across the entire mesh.
 */
export function deleteSelectedComponents(
  mesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: Set<string>,
): void {
  if (selectedIds.size === 0) return;
  if (mode === 'vertex') {
    mesh.deleteVertices(selectedIds);
  } else if (mode === 'edge') {
    mesh.deleteEdges(selectedIds);
  } else if (mode === 'face') {
    mesh.deleteFaces(selectedIds);
  }
}

export function selectAllComponents(
  mesh: EditableMesh,
  mode: EditSelectionMode,
): Set<string> {
  if (mode === 'vertex') return new Set(mesh.vertices.map((v) => v.id));
  if (mode === 'edge') return new Set(mesh.edges.map((e) => e.id));
  return new Set(mesh.faces.map((f) => f.id));
}

/**
 * Expands the current component selection across all topologically connected
 * vertices, edges, and faces (mesh island selection).
 */
export function selectConnectedComponents(
  mesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: ReadonlySet<string>,
): Set<string> {
  if (selectedIds.size === 0) return new Set();

  const visitedVertices = new Set<string>();
  const queue: string[] = [];

  const enqueueVertex = (vid: string) => {
    if (!visitedVertices.has(vid) && mesh.getVertex(vid)) {
      visitedVertices.add(vid);
      queue.push(vid);
    }
  };

  if (mode === 'vertex') {
    for (const id of selectedIds) {
      enqueueVertex(id);
    }
  } else if (mode === 'edge') {
    for (const id of selectedIds) {
      const edge = mesh.getEdge(id);
      if (edge) {
        enqueueVertex(edge.v0);
        enqueueVertex(edge.v1);
      }
    }
  } else {
    for (const id of selectedIds) {
      const face = mesh.getFace(id);
      if (face) {
        for (const vid of face.vertexIds) {
          enqueueVertex(vid);
        }
      }
    }
  }

  while (queue.length > 0) {
    const vid = queue.pop()!;
    for (const neighbor of mesh.getConnectedVertices(vid)) {
      enqueueVertex(neighbor);
    }
    for (const fid of mesh.getFacesForVertex(vid)) {
      const face = mesh.getFace(fid);
      if (face) {
        for (const fvid of face.vertexIds) {
          enqueueVertex(fvid);
        }
      }
    }
  }

  if (mode === 'vertex') {
    return visitedVertices;
  }

  if (mode === 'edge') {
    const resultEdges = new Set<string>();
    for (const edge of mesh.edges) {
      if (visitedVertices.has(edge.v0) && visitedVertices.has(edge.v1)) {
        resultEdges.add(edge.id);
      }
    }
    return resultEdges;
  }

  const resultFaces = new Set<string>();
  for (const face of mesh.faces) {
    if (
      face.vertexIds.length > 0 &&
      face.vertexIds.every((vid) => visitedVertices.has(vid))
    ) {
      resultFaces.add(face.id);
    }
  }
  return resultFaces;
}

export interface DerivedEditSelection {
  vertexIds: Set<string>;
  edgeIds: Set<string>;
  faceIds: Set<string>;
}

/**
 * Derives coherent topological selection highlights (without mutating geometry or
 * inferring non-existent edges) from the user's primary selection in the active sub-mode.
 */
export function computeDerivedEditSelection(
  mesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: ReadonlySet<string>,
): DerivedEditSelection {
  const vertexIds = new Set<string>();
  const edgeIds = new Set<string>();
  const faceIds = new Set<string>();

  if (selectedIds.size === 0) {
    return { vertexIds, edgeIds, faceIds };
  }

  if (mode === 'vertex') {
    for (const id of selectedIds) {
      if (mesh.getVertex(id)) {
        vertexIds.add(id);
      }
    }
    if (vertexIds.size >= 2) {
      for (const edge of mesh.edges) {
        if (vertexIds.has(edge.v0) && vertexIds.has(edge.v1)) {
          edgeIds.add(edge.id);
        }
      }
    }
    if (vertexIds.size >= 3) {
      for (const face of mesh.faces) {
        if (
          face.vertexIds.length >= 3 &&
          face.vertexIds.every((vid) => vertexIds.has(vid))
        ) {
          faceIds.add(face.id);
        }
      }
    }
    return { vertexIds, edgeIds, faceIds };
  }

  if (mode === 'edge') {
    for (const id of selectedIds) {
      const edge = mesh.getEdge(id);
      if (edge) {
        edgeIds.add(edge.id);
        vertexIds.add(edge.v0);
        vertexIds.add(edge.v1);
      }
    }
    if (edgeIds.size >= 3) {
      for (const face of mesh.faces) {
        const n = face.vertexIds.length;
        if (n < 3) continue;
        let allEdgesSelected = true;
        for (let i = 0; i < n; i++) {
          const eid = mesh.findEdgeId(
            face.vertexIds[i],
            face.vertexIds[(i + 1) % n],
          );
          if (!eid || !edgeIds.has(eid)) {
            allEdgesSelected = false;
            break;
          }
        }
        if (allEdgesSelected) {
          faceIds.add(face.id);
        }
      }
    }
    return { vertexIds, edgeIds, faceIds };
  }

  // mode === 'face'
  for (const id of selectedIds) {
    const face = mesh.getFace(id);
    if (!face) continue;
    faceIds.add(face.id);
    for (const vid of face.vertexIds) {
      if (mesh.getVertex(vid)) {
        vertexIds.add(vid);
      }
    }
    for (const eid of mesh.getEdgesForFace(face.id)) {
      edgeIds.add(eid);
    }
  }

  return { vertexIds, edgeIds, faceIds };
}

/**
 * Resolves which mesh edge IDs correspond to the current Edit Mode selection
 * for UV seam operations (Mark Seam / Clear Seam):
 * - edge mode: the selected edges directly.
 * - vertex mode: edges whose both endpoints (v0 and v1) are selected.
 * - face mode: boundary edges of the selected face region when marking seams
 *   (which equals all edges when 1 face is selected), or all edges touching the
 *   selected faces when clearing seams so interior/shared seams are cleared too.
 */
export function resolveEdgeIdsForSeamSelection(
  mesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: ReadonlySet<string>,
  action: 'mark' | 'clear' = 'mark',
): Set<string> {
  const result = new Set<string>();
  if (selectedIds.size === 0) return result;

  if (mode === 'edge') {
    for (const eid of selectedIds) {
      if (mesh.getEdge(eid)) {
        result.add(eid);
      }
    }
    return result;
  }

  if (mode === 'vertex') {
    for (const edge of mesh.edges) {
      if (selectedIds.has(edge.v0) && selectedIds.has(edge.v1)) {
        result.add(edge.id);
      }
    }
    return result;
  }

  // mode === 'face'
  const edgeTouchCount = new Map<string, number>();
  const allFaceEdges = new Set<string>();
  for (const fid of selectedIds) {
    const face = mesh.getFace(fid);
    if (!face) continue;
    for (const eid of mesh.getEdgesForFace(fid)) {
      allFaceEdges.add(eid);
      edgeTouchCount.set(eid, (edgeTouchCount.get(eid) ?? 0) + 1);
    }
  }

  if (action === 'clear') {
    return allFaceEdges;
  }

  for (const [eid, count] of edgeTouchCount.entries()) {
    if (count === 1) {
      result.add(eid);
    }
  }

  if (result.size === 0) {
    return allFaceEdges;
  }

  return result;
}

/**
 * Bakes an object transform (position, rotation Euler XYZ, scale) into local mesh vertex coordinates.
 * Reverses face winding if scale has an odd number of negative axes so normals remain outward.
 */
export function applyObjectTransformToMesh(
  mesh: EditableMesh,
  transform: { position: Vec3; rotation: Vec3; scale: Vec3 },
): EditableMesh {
  const next = mesh.clone();
  const pos = new THREE.Vector3(...transform.position);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(transform.rotation[0], transform.rotation[1], transform.rotation[2], 'XYZ'),
  );
  const scl = new THREE.Vector3(...transform.scale);
  const mat = new THREE.Matrix4().compose(pos, quat, scl);

  for (const v of next.vertices) {
    _v.set(v.position[0], v.position[1], v.position[2]).applyMatrix4(mat);
    v.position = [_v.x, _v.y, _v.z];
  }

  const detScale = transform.scale[0] * transform.scale[1] * transform.scale[2];
  if (detScale < 0) {
    for (const f of next.faces) {
      f.vertexIds.reverse();
      if (f.uvs) f.uvs.reverse();
    }
  }

  next.clearCustomNormals();
  next.rebuildIndices();
  return next;
}

/**
 * Centers local mesh vertices around their bounding-box center and returns the local center offset
 * so the caller can compensate object position in world space without moving the visible geometry.
 */
export function centerMeshOrigin(
  mesh: EditableMesh,
): { mesh: EditableMesh; localOffset: Vec3 } | null {
  if (mesh.vertices.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const v of mesh.vertices) {
    if (v.position[0] < minX) minX = v.position[0];
    if (v.position[0] > maxX) maxX = v.position[0];
    if (v.position[1] < minY) minY = v.position[1];
    if (v.position[1] > maxY) maxY = v.position[1];
    if (v.position[2] < minZ) minZ = v.position[2];
    if (v.position[2] > maxZ) maxZ = v.position[2];
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const next = mesh.clone();
  for (const v of next.vertices) {
    v.position = [v.position[0] - cx, v.position[1] - cy, v.position[2] - cz];
  }
  next.clearCustomNormals();
  next.rebuildIndices();
  return { mesh: next, localOffset: [cx, cy, cz] };
}

export interface SeparateGeometryResult {
  remainingMesh?: EditableMesh;
  separatedMesh?: EditableMesh;
  error?: string;
}

/**
 * Separates currently selected geometry (faces, or edges/vertices on wire meshes)
 * into a standalone EditableMesh while preserving manifold topology on the source mesh.
 */
export function separateGeometryFromMesh(
  sourceMesh: EditableMesh,
  mode: EditSelectionMode,
  selectedIds: ReadonlySet<string>,
): SeparateGeometryResult {
  if (selectedIds.size === 0) {
    return { error: 'Selecciona la geometría que deseas separar' };
  }

  const derived = computeDerivedEditSelection(sourceMesh, mode, selectedIds);

  if (sourceMesh.faces.length > 0) {
    if (derived.faceIds.size === 0) {
      return {
        error: 'Selecciona al menos una cara (o todos los vértices de una cara) para separar',
      };
    }
    if (derived.faceIds.size >= sourceMesh.faces.length) {
      return {
        error: 'No se puede separar toda la geometría del objeto activo',
      };
    }

    const separated = new EditableMesh();
    const vertMap = new Map<string, string>();
    const touchedFaceVerts = new Set<string>();
    const candidateEdgeIds = new Set<string>();

    for (const fid of derived.faceIds) {
      const face = sourceMesh.getFace(fid);
      if (!face) continue;
      for (const eid of sourceMesh.getEdgesForFace(fid)) {
        candidateEdgeIds.add(eid);
      }
      const newFaceVerts: string[] = [];
      for (const vid of face.vertexIds) {
        touchedFaceVerts.add(vid);
        let mappedId = vertMap.get(vid);
        if (!mappedId) {
          const origV = sourceMesh.getVertex(vid);
          if (!origV) continue;
          const addedV = separated.addVertex(
            origV.position[0],
            origV.position[1],
            origV.position[2],
          );
          if (origV.uv) addedV.uv = [origV.uv[0], origV.uv[1]];
          mappedId = addedV.id;
          vertMap.set(vid, mappedId);
        }
        newFaceVerts.push(mappedId);
      }
      const createdFace = separated.addFace(newFaceVerts, face.materialId);
      if (createdFace && face.uvs) {
        createdFace.uvs = face.uvs.map((uv) => [uv[0], uv[1]]);
      }
    }
    separated.clearCustomNormals();
    separated.rebuildIndices();

    const remaining = sourceMesh.clone();
    remaining.deleteFaces(derived.faceIds);

    const edgesToDelete = new Set<string>();
    for (const eid of candidateEdgeIds) {
      if (remaining.getFacesForEdge(eid).length === 0) {
        edgesToDelete.add(eid);
      }
    }
    if (edgesToDelete.size > 0) {
      remaining.deleteEdges(edgesToDelete);
    }
    remaining.pruneOrphanVertices(touchedFaceVerts);
    remaining.clearCustomNormals();
    remaining.rebuildIndices();

    return { remainingMesh: remaining, separatedMesh: separated };
  }

  // Wireframe / edge-only mesh fallback (e.g. Circle primitive)
  if (derived.vertexIds.size === 0) {
    return { error: 'Selecciona vértices o aristas para separar' };
  }
  if (derived.vertexIds.size >= sourceMesh.vertices.length) {
    return { error: 'No se puede separar toda la geometría del objeto activo' };
  }

  const separated = new EditableMesh();
  const vertMap = new Map<string, string>();
  for (const vid of derived.vertexIds) {
    const v = sourceMesh.getVertex(vid);
    if (!v) continue;
    const added = separated.addVertex(v.position[0], v.position[1], v.position[2]);
    vertMap.set(vid, added.id);
  }
  const edgesToRemove = new Set<string>();
  for (const edge of sourceMesh.edges) {
    if (derived.vertexIds.has(edge.v0) && derived.vertexIds.has(edge.v1)) {
      const nv0 = vertMap.get(edge.v0);
      const nv1 = vertMap.get(edge.v1);
      if (nv0 && nv1) {
        separated.addEdge(nv0, nv1);
        edgesToRemove.add(edge.id);
      }
    }
  }
  separated.rebuildIndices();

  const remaining = sourceMesh.clone();
  if (edgesToRemove.size > 0) {
    remaining.deleteEdges(edgesToRemove);
    remaining.pruneOrphanVertices(derived.vertexIds);
  } else {
    remaining.deleteVertices(derived.vertexIds);
  }
  remaining.rebuildIndices();

  return { remainingMesh: remaining, separatedMesh: separated };
}

