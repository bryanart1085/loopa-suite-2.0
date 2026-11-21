import { EditableMesh, MeshFace } from './EditableMesh';

export type EdgeSelectionTool = 'single' | 'loop' | 'ring';
export type EditSelectionSubMode = 'single' | 'loop';

export interface EdgeLoopSelectionResult {
  valid: boolean;
  edgeIds: string[];
  isClosed: boolean;
  kind: 'loop' | 'ring';
  reason?: string;
}

export interface ComponentLoopCandidate {
  ids: string[];
  isClosed: boolean;
}

export interface ComponentLoopDirectionResult {
  valid: boolean;
  loops: ComponentLoopCandidate[];
  reason?: string;
}

/**
 * Checks whether a vertex lies along a manifold edge-loop continuation from `currEdgeId`.
 * Supports:
 * 1. Interior 4-valence manifold vertices (opposite edge sharing 0 faces with `currEdgeId`).
 * 2. Open mesh boundary edges (`faces.length === 1`) when the vertex has a unique other boundary edge.
 * 3. Wireframe chains (`faces.length === 0` everywhere around the vertex, degree 2).
 * 4. N-gon cap rims (valence-3 vertex where `currEdgeId` borders an N-gon > 4 verts and quads).
 */
function findNextLoopEdgeAtVertex(
  mesh: EditableMesh,
  currEdgeId: string,
  vertexId: string,
): string | null {
  const currEdge = mesh.getEdge(currEdgeId);
  if (!currEdge) return null;

  const currFaces = mesh.getFacesForEdge(currEdgeId);
  if (currFaces.length > 2) return null; // non-manifold edge

  const incEdges = mesh.getEdgesForVertex(vertexId);
  const incFaces = mesh.getFacesForVertex(vertexId);

  // Case 1: Pure wireframe chain (degree 2, no faces)
  if (currFaces.length === 0 && incFaces.length === 0) {
    if (incEdges.length !== 2) return null;
    const other = incEdges.find((eid) => eid !== currEdgeId) ?? null;
    if (!other || mesh.getFacesForEdge(other).length !== 0) return null;
    return other;
  }

  // Case 2: Open boundary edge (1 adjacent face)
  if (currFaces.length === 1) {
    const boundaryCandidates = incEdges.filter(
      (eid) => eid !== currEdgeId && mesh.getFacesForEdge(eid).length === 1,
    );
    if (boundaryCandidates.length === 1) {
      return boundaryCandidates[0];
    }
    return null;
  }

  // Case 3: Interior manifold edge (2 adjacent faces)
  const currFaceSet = new Set(currFaces);

  // 3a. Standard 4-valence manifold grid vertex: pick the opposite edge sharing 0 faces with currEdge
  if (incEdges.length === 4 && incFaces.length === 4) {
    // Ensure all incident edges at this vertex are manifold (<= 2 faces)
    for (const eid of incEdges) {
      if (mesh.getFacesForEdge(eid).length !== 2) return null;
    }
    const nonAdjacent: string[] = [];
    for (const eid of incEdges) {
      if (eid === currEdgeId) continue;
      const eFaces = mesh.getFacesForEdge(eid);
      const sharesFace = eFaces.some((fid) => currFaceSet.has(fid));
      if (!sharesFace) {
        nonAdjacent.push(eid);
      }
    }
    if (nonAdjacent.length === 1) {
      return nonAdjacent[0];
    }
    return null;
  }

  // 3b. Valence-3 N-gon cap rim (e.g. closed cylinder top/bottom cap where an N-gon > 4 meets quads)
  if (incEdges.length === 3 && incFaces.length === 3) {
    const ngonFaces: MeshFace[] = [];
    let quadCount = 0;
    for (const fid of currFaces) {
      const f = mesh.getFace(fid);
      if (!f) continue;
      if (f.vertexIds.length > 4) ngonFaces.push(f);
      else if (f.vertexIds.length === 4) quadCount++;
    }
    if (ngonFaces.length === 1 && quadCount === 1) {
      const ngonId = ngonFaces[0].id;
      const ngonOtherEdge = incEdges.find(
        (eid) => eid !== currEdgeId && mesh.getFacesForEdge(eid).includes(ngonId),
      );
      if (ngonOtherEdge && mesh.getFacesForEdge(ngonOtherEdge).length === 2) {
        return ngonOtherEdge;
      }
    }
  }

  // Pole (valence != 4, e.g. UV sphere pole, cube corner, T-junction) -> stop cleanly
  return null;
}

/**
 * True topological Edge Loop walk starting from `startEdgeId`.
 * Walks across both endpoints until hitting poles, open boundaries, or closing the loop.
 */
export function findEdgeLoop(
  mesh: EditableMesh,
  startEdgeId: string,
): EdgeLoopSelectionResult {
  const startEdge = mesh.getEdge(startEdgeId);
  if (!startEdge) {
    return {
      valid: false,
      edgeIds: [],
      isClosed: false,
      kind: 'loop',
      reason: 'Arista no encontrada en la malla.',
    };
  }

  const startFaces = mesh.getFacesForEdge(startEdgeId);
  if (startFaces.length > 2) {
    return {
      valid: false,
      edgeIds: [],
      isClosed: false,
      kind: 'loop',
      reason: 'La arista seleccionada es no múltiple (más de 2 caras).',
    };
  }

  const visited = new Set<string>([startEdgeId]);

  const walkDirection = (initialVertId: string): { edges: string[]; closed: boolean } => {
    const collected: string[] = [];
    let currEdgeId = startEdgeId;
    let currVertId = initialVertId;
    const maxSteps = mesh.edges.length + 2;

    for (let step = 0; step < maxSteps; step++) {
      const nextEdgeId = findNextLoopEdgeAtVertex(mesh, currEdgeId, currVertId);
      if (!nextEdgeId) {
        return { edges: collected, closed: false };
      }
      if (nextEdgeId === startEdgeId) {
        return { edges: collected, closed: true };
      }
      if (visited.has(nextEdgeId)) {
        return { edges: collected, closed: false };
      }
      const nextEdge = mesh.getEdge(nextEdgeId);
      if (!nextEdge) break;

      visited.add(nextEdgeId);
      collected.push(nextEdgeId);
      currVertId = nextEdge.v0 === currVertId ? nextEdge.v1 : nextEdge.v0;
      currEdgeId = nextEdgeId;
    }

    return { edges: collected, closed: false };
  };

  const forward = walkDirection(startEdge.v1);
  let ordered: string[];
  let isClosed = forward.closed;

  if (isClosed) {
    ordered = [startEdgeId, ...forward.edges];
  } else {
    const backward = walkDirection(startEdge.v0);
    ordered = [...backward.edges.reverse(), startEdgeId, ...forward.edges];
    isClosed = backward.closed;
  }

  if (ordered.length < 2) {
    return {
      valid: false,
      edgeIds: ordered,
      isClosed: false,
      kind: 'loop',
      reason: 'Esta arista no continúa en un Edge Loop válido (termina en polos o esquinas).',
    };
  }

  return {
    valid: true,
    edgeIds: ordered,
    isClosed,
    kind: 'loop',
  };
}

function getOppositeQuadEdge(
  mesh: EditableMesh,
  face: MeshFace,
  edgeId: string,
): string | null {
  if (face.vertexIds.length !== 4) return null;
  const edge = mesh.getEdge(edgeId);
  if (!edge) return null;
  const verts = face.vertexIds;
  for (let i = 0; i < 4; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % 4];
    if ((a === edge.v0 && b === edge.v1) || (a === edge.v1 && b === edge.v0)) {
      const oppA = verts[(i + 2) % 4];
      const oppB = verts[(i + 3) % 4];
      return mesh.findEdgeId(oppA, oppB) ?? null;
    }
  }
  return null;
}

/**
 * True topological Edge Ring walk starting from `startEdgeId`.
 * Walks parallel opposite edges across quad faces; stops cleanly at boundaries, triangles, N-gons, or cycles.
 */
export function findEdgeRing(
  mesh: EditableMesh,
  startEdgeId: string,
): EdgeLoopSelectionResult {
  const startEdge = mesh.getEdge(startEdgeId);
  if (!startEdge) {
    return {
      valid: false,
      edgeIds: [],
      isClosed: false,
      kind: 'ring',
      reason: 'Arista no encontrada en la malla.',
    };
  }

  const startFaces = mesh.getFacesForEdge(startEdgeId);
  if (startFaces.length === 0) {
    return {
      valid: false,
      edgeIds: [],
      isClosed: false,
      kind: 'ring',
      reason: 'La arista seleccionada no tiene caras cuadrangulares adyacentes.',
    };
  }
  if (startFaces.length > 2) {
    return {
      valid: false,
      edgeIds: [],
      isClosed: false,
      kind: 'ring',
      reason: 'La arista seleccionada es no múltiple (más de 2 caras).',
    };
  }

  const visited = new Set<string>([startEdgeId]);

  const walkThroughFace = (initialFaceId: string): { edges: string[]; closed: boolean } => {
    const collected: string[] = [];
    let currEdgeId = startEdgeId;
    let currFaceId: string | null = initialFaceId;
    const maxSteps = mesh.faces.length + 2;

    for (let step = 0; step < maxSteps && currFaceId; step++) {
      const face = mesh.getFace(currFaceId);
      if (!face || face.vertexIds.length !== 4) {
        return { edges: collected, closed: false };
      }

      const oppEdgeId = getOppositeQuadEdge(mesh, face, currEdgeId);
      if (!oppEdgeId) {
        return { edges: collected, closed: false };
      }
      if (oppEdgeId === startEdgeId) {
        return { edges: collected, closed: true };
      }
      if (visited.has(oppEdgeId)) {
        return { edges: collected, closed: false };
      }

      const oppFaces = mesh.getFacesForEdge(oppEdgeId);
      if (oppFaces.length > 2) {
        return { edges: collected, closed: false };
      }

      visited.add(oppEdgeId);
      collected.push(oppEdgeId);

      if (oppFaces.length < 2) {
        // Reached an open mesh boundary cleanly after adding boundary opposite edge
        return { edges: collected, closed: false };
      }

      const nextFaceId: string | undefined =
        oppFaces[0] === currFaceId ? oppFaces[1] : oppFaces[0];
      currEdgeId = oppEdgeId;
      currFaceId = nextFaceId ?? null;
    }

    return { edges: collected, closed: false };
  };

  const dirA = walkThroughFace(startFaces[0]);
  let ordered: string[];
  let isClosed = dirA.closed;

  if (isClosed) {
    ordered = [startEdgeId, ...dirA.edges];
  } else if (startFaces.length === 2) {
    const dirB = walkThroughFace(startFaces[1]);
    ordered = [...dirB.edges.reverse(), startEdgeId, ...dirA.edges];
    isClosed = dirB.closed;
  } else {
    ordered = [startEdgeId, ...dirA.edges];
  }

  if (ordered.length < 2) {
    return {
      valid: false,
      edgeIds: ordered,
      isClosed: false,
      kind: 'ring',
      reason: 'Esta arista no pertenece a un Edge Ring cuadrangular válido.',
    };
  }

  return {
    valid: true,
    edgeIds: ordered,
    isClosed,
    kind: 'ring',
  };
}

export function resolveEdgeLoopSelection(
  mesh: EditableMesh,
  startEdgeId: string,
  kind: 'loop' | 'ring',
): EdgeLoopSelectionResult {
  return kind === 'ring'
    ? findEdgeRing(mesh, startEdgeId)
    : findEdgeLoop(mesh, startEdgeId);
}

/**
 * Computes distinct topological vertex loop directions passing through `seedVertexId`
 * (e.g. U-axis vs V-axis on a quad grid, or radial vs longitudinal on a cylinder).
 */
export function findVertexLoopDirections(
  mesh: EditableMesh,
  seedVertexId: string,
): ComponentLoopDirectionResult {
  const seedVert = mesh.getVertex(seedVertexId);
  if (!seedVert) {
    return {
      valid: false,
      loops: [],
      reason: 'Vértice no encontrado en la malla.',
    };
  }

  const incEdges = mesh.getEdgesForVertex(seedVertexId);
  if (incEdges.length === 0) {
    return {
      valid: false,
      loops: [{ ids: [seedVertexId], isClosed: false }],
      reason: 'El vértice seleccionado no tiene aristas conectadas.',
    };
  }

  const walkRayFromSeed = (
    startEdgeId: string,
  ): {
    vertexIds: string[];
    closed: boolean;
    returnEdgeId: string | null;
  } => {
    const startEdge = mesh.getEdge(startEdgeId);
    if (!startEdge) {
      return { vertexIds: [], closed: false, returnEdgeId: null };
    }
    const collected: string[] = [];
    const visitedVerts = new Set<string>([seedVertexId]);
    const visitedEdges = new Set<string>([startEdgeId]);
    let currEdgeId = startEdgeId;
    let currVertId =
      startEdge.v0 === seedVertexId ? startEdge.v1 : startEdge.v0;
    const maxSteps = mesh.edges.length + 2;

    for (let step = 0; step < maxSteps; step++) {
      if (currVertId === seedVertexId) {
        return {
          vertexIds: collected,
          closed: true,
          returnEdgeId: currEdgeId,
        };
      }
      if (visitedVerts.has(currVertId)) {
        return {
          vertexIds: collected,
          closed: false,
          returnEdgeId: null,
        };
      }
      visitedVerts.add(currVertId);
      collected.push(currVertId);

      const nextEdgeId = findNextLoopEdgeAtVertex(mesh, currEdgeId, currVertId);
      if (!nextEdgeId || visitedEdges.has(nextEdgeId)) {
        return {
          vertexIds: collected,
          closed: false,
          returnEdgeId: null,
        };
      }
      const nextEdge = mesh.getEdge(nextEdgeId);
      if (!nextEdge) break;
      visitedEdges.add(nextEdgeId);
      currVertId =
        nextEdge.v0 === currVertId ? nextEdge.v1 : nextEdge.v0;
      currEdgeId = nextEdgeId;
      if (currVertId === seedVertexId) {
        return {
          vertexIds: collected,
          closed: true,
          returnEdgeId: currEdgeId,
        };
      }
    }

    return {
      vertexIds: collected,
      closed: false,
      returnEdgeId: null,
    };
  };

  // Pair opposite edges around seedVertexId
  const pairedEdge = new Set<string>();
  const rawCandidates: ComponentLoopCandidate[] = [];

  for (const eid of incEdges) {
    if (pairedEdge.has(eid)) continue;

    // Only treat two edges at seed as true opposite continuation when manifold 4-valence or wire/boundary
    const oppAtSeed = findNextLoopEdgeAtVertex(mesh, eid, seedVertexId);
    const rayA = walkRayFromSeed(eid);

    if (rayA.closed) {
      pairedEdge.add(eid);
      if (rayA.returnEdgeId) pairedEdge.add(rayA.returnEdgeId);
      if (oppAtSeed) pairedEdge.add(oppAtSeed);
      rawCandidates.push({
        ids: [seedVertexId, ...rayA.vertexIds],
        isClosed: true,
      });
      continue;
    }

    if (oppAtSeed && oppAtSeed !== eid && incEdges.includes(oppAtSeed)) {
      pairedEdge.add(eid);
      pairedEdge.add(oppAtSeed);
      const rayB = walkRayFromSeed(oppAtSeed);
      const combined = Array.from(
        new Set([...rayB.vertexIds.reverse(), seedVertexId, ...rayA.vertexIds]),
      );
      rawCandidates.push({
        ids: combined,
        isClosed: false,
      });
    } else {
      pairedEdge.add(eid);
      rawCandidates.push({
        ids: [seedVertexId, ...rayA.vertexIds],
        isClosed: false,
      });
    }
  }

  // Deduplicate by unordered vertex set
  const seenSignatures = new Set<string>();
  const validLoops: ComponentLoopCandidate[] = [];
  for (const cand of rawCandidates) {
    if (cand.ids.length < 2) continue;
    const sig = [...cand.ids].sort().join('|');
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);
    validLoops.push(cand);
  }

  if (validLoops.length === 0) {
    return {
      valid: false,
      loops: [{ ids: [seedVertexId], isClosed: false }],
      reason: 'Este vértice no forma un bucle topológico válido.',
    };
  }

  return {
    valid: true,
    loops: validLoops,
  };
}

/**
 * Computes distinct topological face loop directions passing through `seedFaceId`
 * along quad strips (0-2 axis vs 1-3 axis).
 */
export function findFaceLoopDirections(
  mesh: EditableMesh,
  seedFaceId: string,
): ComponentLoopDirectionResult {
  const seedFace = mesh.getFace(seedFaceId);
  if (!seedFace) {
    return {
      valid: false,
      loops: [],
      reason: 'Cara no encontrada en la malla.',
    };
  }

  if (seedFace.vertexIds.length !== 4) {
    return {
      valid: false,
      loops: [{ ids: [seedFaceId], isClosed: false }],
      reason:
        'El bucle de caras requiere una cara cuadrangular (4 vértices) como punto de partida.',
    };
  }

  const edgeIds: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const a = seedFace.vertexIds[i];
    const b = seedFace.vertexIds[(i + 1) % 4];
    edgeIds.push(mesh.findEdgeId(a, b) ?? null);
  }

  const walkFaceStrip = (
    startEdgeId: string | null,
  ): { faceIds: string[]; closed: boolean } => {
    if (!startEdgeId) return { faceIds: [], closed: false };
    const collected: string[] = [];
    const visitedFaces = new Set<string>([seedFaceId]);
    let currFaceId = seedFaceId;
    let currEdgeId: string | null = startEdgeId;
    const maxSteps = mesh.faces.length + 2;

    for (let step = 0; step < maxSteps && currEdgeId; step++) {
      const adj = mesh.getFacesForEdge(currEdgeId);
      if (adj.length !== 2) {
        return { faceIds: collected, closed: false };
      }
      const nextFaceId = adj[0] === currFaceId ? adj[1] : adj[0];
      if (nextFaceId === seedFaceId) {
        return { faceIds: collected, closed: true };
      }
      if (visitedFaces.has(nextFaceId)) {
        return { faceIds: collected, closed: false };
      }
      const nextFace = mesh.getFace(nextFaceId);
      if (!nextFace || nextFace.vertexIds.length !== 4) {
        return { faceIds: collected, closed: false };
      }
      visitedFaces.add(nextFaceId);
      collected.push(nextFaceId);

      const oppEdge = getOppositeQuadEdge(mesh, nextFace, currEdgeId);
      currFaceId = nextFaceId;
      currEdgeId = oppEdge;
    }

    return { faceIds: collected, closed: false };
  };

  const axisPairs: [number, number][] = [
    [0, 2],
    [1, 3],
  ];
  const rawCandidates: ComponentLoopCandidate[] = [];

  for (const [aIdx, bIdx] of axisPairs) {
    const rayA = walkFaceStrip(edgeIds[aIdx]);
    if (rayA.closed) {
      rawCandidates.push({
        ids: [seedFaceId, ...rayA.faceIds],
        isClosed: true,
      });
      continue;
    }
    const rayB = walkFaceStrip(edgeIds[bIdx]);
    const combined = Array.from(
      new Set([...rayB.faceIds.reverse(), seedFaceId, ...rayA.faceIds]),
    );
    rawCandidates.push({
      ids: combined,
      isClosed: false,
    });
  }

  const seenSignatures = new Set<string>();
  const validLoops: ComponentLoopCandidate[] = [];
  for (const cand of rawCandidates) {
    if (cand.ids.length < 2) continue;
    const sig = [...cand.ids].sort().join('|');
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);
    validLoops.push(cand);
  }

  if (validLoops.length === 0) {
    return {
      valid: false,
      loops: [{ ids: [seedFaceId], isClosed: false }],
      reason: 'Esta cara no pertenece a un bucle de caras cuadrangulares válido.',
    };
  }

  return {
    valid: true,
    loops: validLoops,
  };
}
