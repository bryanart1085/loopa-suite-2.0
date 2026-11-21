import { EditableMesh, MeshFace, Vec3 } from './EditableMesh';

export type SlideMode = 'vertex' | 'edge';

export interface VertexRailOption {
  edgeId: string;
  neighborId: string;
  startPos: Vec3;
  targetPos: Vec3;
  dir3D: Vec3;
  length: number;
}

export interface VertexSlidePlan {
  valid: boolean;
  reason?: string;
  vertexIds: string[];
  railsByVertex: Map<string, VertexRailOption[]>;
  guideSegments: [Vec3, Vec3][];
}

export interface VertexSlideSelection {
  vertexId: string;
  edgeId: string;
  neighborId: string;
  startPos: Vec3;
  targetPos: Vec3;
  factor: number; // clamped >= 0 when clamp=true, signed when clamp=false
}

export interface EdgeSlideRail {
  vertexId: string;
  startPos: Vec3;
  railA: Vec3 | null;
  railB: Vec3 | null;
}

export interface EdgeSlidePlan {
  valid: boolean;
  reason?: string;
  edgeIds: string[];
  railsByVertex: Map<string, EdgeSlideRail>;
  avgDirA: Vec3;
  avgDirB: Vec3;
  avgLenA: number;
  avgLenB: number;
  guideSegments: [Vec3, Vec3][];
}

export interface VertexSlideRailPair {
  vertexId: string;
  startPos: Vec3;
  railA: Vec3 | null;
  railB: Vec3 | null;
}

export interface ParametricVertexSlidePlan {
  valid: boolean;
  reason?: string;
  usedChainEdgePlan: boolean;
  railsByVertex: Map<string, VertexSlideRailPair>;
  avgDirA: Vec3;
  avgDirB: Vec3;
  guideSegments: [Vec3, Vec3][];
}

export interface SlideApplyResult {
  mesh: EditableMesh;
  movedVertexIds: Set<string>;
  appliedFactor: number;
  clamped: boolean;
}

function subVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function lenVec(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normVec(a: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = lenVec(a);
  if (l < 1e-8) return fallback;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function dotVec(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/* ============================================================================
 * 1. VERTEX SLIDE — Deslizamiento topológico a lo largo de aristas conectadas
 * ========================================================================== */

/**
 * Inspects selected vertices and collects valid connected edges along which each vertex can slide.
 */
export function buildVertexSlidePlan(
  mesh: EditableMesh,
  selectedIds: ReadonlySet<string>,
): VertexSlidePlan {
  const vertexIds: string[] = [];
  const railsByVertex = new Map<string, VertexRailOption[]>();
  const guideSegments: [Vec3, Vec3][] = [];
  const seenEdges = new Set<string>();

  for (const vid of selectedIds) {
    const v = mesh.getVertex(vid);
    if (!v) continue;

    const incEdgeIds = mesh.getEdgesForVertex(vid);
    const options: VertexRailOption[] = [];
    for (const eid of incEdgeIds) {
      const edge = mesh.getEdge(eid);
      if (!edge) continue;
      const neighborId = edge.v0 === vid ? edge.v1 : edge.v0;
      const neighbor = mesh.getVertex(neighborId);
      if (!neighbor) continue;

      const delta = subVec(neighbor.position, v.position);
      const length = lenVec(delta);
      if (length < 1e-7) continue;

      options.push({
        edgeId: eid,
        neighborId,
        startPos: [...v.position],
        targetPos: [...neighbor.position],
        dir3D: normVec(delta),
        length,
      });

      if (!seenEdges.has(eid)) {
        seenEdges.add(eid);
        guideSegments.push([[...v.position], [...neighbor.position]]);
      }
    }

    if (options.length > 0) {
      vertexIds.push(vid);
      railsByVertex.set(vid, options);
    }
  }

  if (vertexIds.length === 0) {
    return {
      valid: false,
      reason:
        'Selecciona al menos un vértice conectado a una arista para usar Vertex Slide.',
      vertexIds: [],
      railsByVertex,
      guideSegments: [],
    };
  }

  return {
    valid: true,
    vertexIds,
    railsByVertex,
    guideSegments,
  };
}

/**
 * Pure 3D Vertex Slide along a target direction vector (picks the best aligned incident edge per vertex).
 * Supports bidirectional sliding when connected edges exist on opposite sides or when clamp=false.
 */
export function applyVertexSlideAlongDirection(
  sourceMesh: EditableMesh,
  plan: VertexSlidePlan,
  worldDirLocal: Vec3,
  factor: number,
  clamp = true,
): SlideApplyResult {
  const mesh = sourceMesh.clone();
  const movedVertexIds = new Set<string>();
  if (!plan.valid || Math.abs(factor) < 1e-6) {
    return { mesh, movedVertexIds, appliedFactor: 0, clamped: false };
  }

  const dir = normVec(worldDirLocal, [1, 0, 0]);
  const signedDir: Vec3 =
    factor >= 0 ? dir : [-dir[0], -dir[1], -dir[2]];
  const mag = Math.abs(factor);
  const clampedFactor = clamp ? Math.min(0.98, mag) : Math.min(1.5, mag);
  const wasClamped = clampedFactor !== mag;

  for (const vid of plan.vertexIds) {
    const options = plan.railsByVertex.get(vid);
    const v = mesh.getVertex(vid);
    if (!options || options.length === 0 || !v) continue;

    let bestPosOpt: VertexRailOption | null = null;
    let bestPosDot = 0.08;
    let bestAbsOpt = options[0];
    let bestAbsDot = -1;

    for (const opt of options) {
      const d = dotVec(signedDir, opt.dir3D);
      if (d > bestPosDot) {
        bestPosDot = d;
        bestPosOpt = opt;
      }
      if (Math.abs(d) > bestAbsDot) {
        bestAbsDot = Math.abs(d);
        bestAbsOpt = opt;
      }
    }

    if (bestPosOpt) {
      v.position = lerpVec(bestPosOpt.startPos, bestPosOpt.targetPos, clampedFactor);
      movedVertexIds.add(vid);
    } else if (!clamp) {
      const sign = dotVec(signedDir, bestAbsOpt.dir3D) >= 0 ? 1 : -1;
      v.position = lerpVec(
        bestAbsOpt.startPos,
        bestAbsOpt.targetPos,
        sign * clampedFactor,
      );
      movedVertexIds.add(vid);
    }
  }

  mesh.clearCustomNormals();
  return {
    mesh,
    movedVertexIds,
    appliedFactor: (factor >= 0 ? 1 : -1) * clampedFactor,
    clamped: wasClamped,
  };
}

/**
 * Applies screen-space gesture Vertex Slide using projected 2D edge vectors from each vertex.
 */
export function applyVertexSlideFromScreenSelections(
  sourceMesh: EditableMesh,
  selections: VertexSlideSelection[],
  clamp = true,
): SlideApplyResult {
  const mesh = sourceMesh.clone();
  const movedVertexIds = new Set<string>();
  let maxApplied = 0;
  let anyClamped = false;

  for (const sel of selections) {
    const v = mesh.getVertex(sel.vertexId);
    if (!v) continue;
    let t = sel.factor;
    if (clamp) {
      if (t < 0) {
        t = 0;
        anyClamped = true;
      } else if (t > 0.98) {
        t = 0.98;
        anyClamped = true;
      }
    } else {
      if (t < -1.5) {
        t = -1.5;
        anyClamped = true;
      } else if (t > 1.5) {
        t = 1.5;
        anyClamped = true;
      }
    }
    if (Math.abs(t) < 1e-5) continue;
    v.position = lerpVec(sel.startPos, sel.targetPos, t);
    movedVertexIds.add(sel.vertexId);
    if (Math.abs(t) > Math.abs(maxApplied)) maxApplied = t;
  }

  mesh.clearCustomNormals();
  return {
    mesh,
    movedVertexIds,
    appliedFactor: maxApplied,
    clamped: anyClamped,
  };
}

/**
 * Builds a unified parametric Vertex Slide plan with a pair of opposing rails (railA / railB)
 * per selected vertex so all vertices advance by the same normalized percentage (`factor`).
 *
 * - When selected vertices form a connected edge chain across faces and `preferredDirLocal`
 *   has a transverse component across the chain, delegates chain vertices to `buildEdgeSlidePlan`
 *   to preserve Side A / Side B continuity and corner mitering without collapsing into neighbors.
 * - For independent vertices or longitudinal chain slides, resolves coherent (railA, railB) pairs
 *   propagating chain tangents smoothly across connected curves/polylines.
 */
export function buildParametricVertexSlidePlan(
  mesh: EditableMesh,
  selectedIds: ReadonlySet<string>,
  preferredDirLocal?: Vec3,
): ParametricVertexSlidePlan {
  const rawPlan = buildVertexSlidePlan(mesh, selectedIds);
  const railsByVertex = new Map<string, VertexSlideRailPair>();

  if (!rawPlan.valid) {
    return {
      valid: false,
      reason: rawPlan.reason,
      usedChainEdgePlan: false,
      railsByVertex,
      avgDirA: [1, 0, 0],
      avgDirB: [-1, 0, 0],
      guideSegments: [],
    };
  }

  const selectedVertSet = new Set(rawPlan.vertexIds);
  const internalEdgeIds = new Set<string>();
  for (const edge of mesh.edges) {
    if (selectedVertSet.has(edge.v0) && selectedVertSet.has(edge.v1)) {
      internalEdgeIds.add(edge.id);
    }
  }

  const hasPref = Boolean(preferredDirLocal && lenVec(preferredDirLocal) > 1e-6);
  const prefDir = hasPref
    ? normVec(preferredDirLocal!, [1, 0, 0])
    : ([1, 0, 0] as Vec3);

  // Check if selected vertices form connected edges with a valid cross-face Edge Slide plan
  let useChainEdgePlan = false;
  let chainEdgePlan: EdgeSlidePlan | null = null;
  let invertChainSides = false;

  if (internalEdgeIds.size > 0) {
    const candidatePlan = buildEdgeSlidePlan(mesh, internalEdgeIds);
    if (candidatePlan.valid && candidatePlan.railsByVertex.size > 0) {
      if (!hasPref) {
        useChainEdgePlan = true;
        chainEdgePlan = candidatePlan;
      } else {
        let bestCrossCos = 0;
        let signedCrossSum = 0;
        let crossCount = 0;
        for (const rail of candidatePlan.railsByVertex.values()) {
          if (rail.railA) {
            const d = subVec(rail.railA, rail.startPos);
            if (lenVec(d) > 1e-7) {
              const dot = dotVec(prefDir, normVec(d));
              bestCrossCos = Math.max(bestCrossCos, Math.abs(dot));
              signedCrossSum += dot;
              crossCount++;
            }
          }
          if (rail.railB) {
            const d = subVec(rail.railB, rail.startPos);
            if (lenVec(d) > 1e-7) {
              const dot = dotVec(prefDir, normVec(d));
              bestCrossCos = Math.max(bestCrossCos, Math.abs(dot));
              signedCrossSum -= dot;
              crossCount++;
            }
          }
        }

        let bestLongCos = 0;
        for (const eid of internalEdgeIds) {
          const e = mesh.getEdge(eid);
          if (!e) continue;
          const va = mesh.getVertex(e.v0);
          const vb = mesh.getVertex(e.v1);
          if (!va || !vb) continue;
          const d = subVec(vb.position, va.position);
          if (lenVec(d) > 1e-7) {
            bestLongCos = Math.max(bestLongCos, Math.abs(dotVec(prefDir, normVec(d))));
          }
        }

        // Prefer transverse Edge Slide across adjacent faces unless user clearly drags purely along the chain
        if (bestCrossCos >= 0.32 || bestCrossCos >= bestLongCos * 0.65) {
          useChainEdgePlan = true;
          chainEdgePlan = candidatePlan;
          invertChainSides = crossCount > 0 && signedCrossSum < 0;
        }
      }
    }
  }

  const pickPairAlongAxis = (
    options: VertexRailOption[],
    axisDir: Vec3,
  ): { railA: Vec3 | null; railB: Vec3 | null } => {
    let bestPos: VertexRailOption | null = null;
    let bestPosDot = 0.08;
    for (const opt of options) {
      const d = dotVec(axisDir, opt.dir3D);
      if (d > bestPosDot) {
        bestPosDot = d;
        bestPos = opt;
      }
    }

    const oppRef: Vec3 = bestPos
      ? [-bestPos.dir3D[0], -bestPos.dir3D[1], -bestPos.dir3D[2]]
      : [-axisDir[0], -axisDir[1], -axisDir[2]];

    let bestNeg: VertexRailOption | null = null;
    let bestNegDot = 0.2;
    for (const opt of options) {
      if (bestPos && opt.edgeId === bestPos.edgeId) continue;
      const dAxis = dotVec(axisDir, opt.dir3D);
      const dOpp = dotVec(oppRef, opt.dir3D);
      if (dAxis < -0.08 && dOpp > bestNegDot) {
        bestNegDot = dOpp;
        bestNeg = opt;
      }
    }

    // Fallback when no rail aligned strictly forward (+), pick strongest negative rail if axis wasn't matched
    if (!bestPos && !bestNeg && options.length > 0) {
      let fallback = options[0];
      let bestAbs = -1;
      for (const opt of options) {
        const a = Math.abs(dotVec(axisDir, opt.dir3D));
        if (a > bestAbs) {
          bestAbs = a;
          fallback = opt;
        }
      }
      if (dotVec(axisDir, fallback.dir3D) >= 0) {
        bestPos = fallback;
      } else {
        bestNeg = fallback;
      }
    }

    return {
      railA: bestPos ? [...bestPos.targetPos] : null,
      railB: bestNeg ? [...bestNeg.targetPos] : null,
    };
  };

  if (useChainEdgePlan && chainEdgePlan) {
    for (const vid of rawPlan.vertexIds) {
      const eRail = chainEdgePlan.railsByVertex.get(vid);
      if (eRail) {
        railsByVertex.set(vid, {
          vertexId: vid,
          startPos: [...eRail.startPos],
          railA: invertChainSides
            ? eRail.railB
              ? [...eRail.railB]
              : null
            : eRail.railA
              ? [...eRail.railA]
              : null,
          railB: invertChainSides
            ? eRail.railA
              ? [...eRail.railA]
              : null
            : eRail.railB
              ? [...eRail.railB]
              : null,
        });
      } else {
        const options = rawPlan.railsByVertex.get(vid) ?? [];
        const v = mesh.getVertex(vid);
        if (!v || options.length === 0) continue;
        const axis = hasPref
          ? prefDir
          : invertChainSides
            ? chainEdgePlan.avgDirB
            : chainEdgePlan.avgDirA;
        const pair = pickPairAlongAxis(options, axis);
        if (pair.railA || pair.railB) {
          railsByVertex.set(vid, {
            vertexId: vid,
            startPos: [...v.position],
            railA: pair.railA,
            railB: pair.railB,
          });
        }
      }
    }
  } else {
    // Establish base axis direction
    let baseAxis = prefDir;
    if (!hasPref) {
      let bestOpt: VertexRailOption | null = null;
      for (const opts of rawPlan.railsByVertex.values()) {
        for (const o of opts) {
          if (!bestOpt || o.length > bestOpt.length) bestOpt = o;
        }
      }
      if (bestOpt) baseAxis = bestOpt.dir3D;
    }

    // Build selected-chain adjacency so longitudinal curve/polyline chains propagate
    // tangent continuity seamlessly instead of losing alignment around bends.
    const chainNeighbors = new Map<string, string[]>();
    for (const eid of internalEdgeIds) {
      const e = mesh.getEdge(eid);
      if (!e) continue;
      if (!chainNeighbors.has(e.v0)) chainNeighbors.set(e.v0, []);
      if (!chainNeighbors.has(e.v1)) chainNeighbors.set(e.v1, []);
      chainNeighbors.get(e.v0)!.push(e.v1);
      chainNeighbors.get(e.v1)!.push(e.v0);
    }

    const vertexAxes = new Map<string, Vec3>();
    if (internalEdgeIds.size > 0) {
      // Seed each connected component with the vertex whose incident rail aligns best with baseAxis
      const visited = new Set<string>();
      for (const vid of rawPlan.vertexIds) {
        if (visited.has(vid)) continue;
        const compVerts: string[] = [];
        const stack = [vid];
        visited.add(vid);
        while (stack.length > 0) {
          const curr = stack.pop()!;
          compVerts.push(curr);
          for (const nb of chainNeighbors.get(curr) ?? []) {
            if (!visited.has(nb)) {
              visited.add(nb);
              stack.push(nb);
            }
          }
        }

        if (compVerts.length <= 1) {
          vertexAxes.set(vid, baseAxis);
          continue;
        }

        let seedVid = compVerts[0];
        let bestSeedScore = -1;
        for (const cv of compVerts) {
          for (const opt of rawPlan.railsByVertex.get(cv) ?? []) {
            const score = Math.abs(dotVec(baseAxis, opt.dir3D));
            if (score > bestSeedScore) {
              bestSeedScore = score;
              seedVid = cv;
            }
          }
        }

        const seedPair = pickPairAlongAxis(
          rawPlan.railsByVertex.get(seedVid) ?? [],
          baseAxis,
        );
        const seedPos = mesh.getVertex(seedVid)?.position;
        const seedAxis =
          seedPos && seedPair.railA
            ? normVec(subVec(seedPair.railA, seedPos), baseAxis)
            : seedPos && seedPair.railB
              ? normVec(subVec(seedPos, seedPair.railB), baseAxis)
              : baseAxis;

        vertexAxes.set(seedVid, seedAxis);
        const bfsQueue: string[] = [seedVid];
        const oriented = new Set<string>([seedVid]);

        while (bfsQueue.length > 0) {
          const curr = bfsQueue.shift()!;
          const currAxis = vertexAxes.get(curr) ?? baseAxis;
          const currPos = mesh.getVertex(curr)?.position;
          if (!currPos) continue;

          for (const nb of chainNeighbors.get(curr) ?? []) {
            if (oriented.has(nb)) continue;
            const nbPos = mesh.getVertex(nb)?.position;
            if (!nbPos) continue;
            const edgeDir = normVec(subVec(nbPos, currPos), currAxis);
            const sign = dotVec(edgeDir, currAxis) >= 0 ? 1 : -1;
            const incomingForward: Vec3 = [
              edgeDir[0] * sign,
              edgeDir[1] * sign,
              edgeDir[2] * sign,
            ];

            // At neighbor `nb`, continue along the edge most collinear with incomingForward
            const nbOpts = rawPlan.railsByVertex.get(nb) ?? [];
            let nextAxis = incomingForward;
            let bestCont = 0.25;
            for (const opt of nbOpts) {
              if (opt.neighborId === curr) continue;
              const d = dotVec(incomingForward, opt.dir3D);
              if (d > bestCont) {
                bestCont = d;
                nextAxis = opt.dir3D;
              }
            }
            // Average incoming and outgoing tangents for smooth corner alignment
            const blended = addVec(incomingForward, nextAxis);
            vertexAxes.set(
              nb,
              lenVec(blended) > 1e-6 ? normVec(blended, incomingForward) : incomingForward,
            );
            oriented.add(nb);
            bfsQueue.push(nb);
          }
        }
      }
    }

    for (const vid of rawPlan.vertexIds) {
      const options = rawPlan.railsByVertex.get(vid);
      const v = mesh.getVertex(vid);
      if (!options || options.length === 0 || !v) continue;
      const axis = vertexAxes.get(vid) ?? baseAxis;
      const pair = pickPairAlongAxis(options, axis);
      if (pair.railA || pair.railB) {
        railsByVertex.set(vid, {
          vertexId: vid,
          startPos: [...v.position],
          railA: pair.railA,
          railB: pair.railB,
        });
      }
    }
  }

  if (railsByVertex.size === 0) {
    return {
      valid: false,
      reason:
        'No se encontraron aristas válidas para deslizar los vértices seleccionados.',
      usedChainEdgePlan: false,
      railsByVertex,
      avgDirA: [1, 0, 0],
      avgDirB: [-1, 0, 0],
      guideSegments: [],
    };
  }

  const guideSegments: [Vec3, Vec3][] = [];
  let sumA: Vec3 = [0, 0, 0];
  let sumB: Vec3 = [0, 0, 0];

  for (const rail of railsByVertex.values()) {
    if (rail.railA) {
      const dA = subVec(rail.railA, rail.startPos);
      if (lenVec(dA) > 1e-7) {
        sumA = addVec(sumA, normVec(dA));
        guideSegments.push([[...rail.startPos], [...rail.railA]]);
      }
    }
    if (rail.railB) {
      const dB = subVec(rail.railB, rail.startPos);
      if (lenVec(dB) > 1e-7) {
        sumB = addVec(sumB, normVec(dB));
        guideSegments.push([[...rail.startPos], [...rail.railB]]);
      }
    }
  }

  const avgDirA = normVec(sumA, prefDir);
  const avgDirB =
    lenVec(sumB) > 1e-6
      ? normVec(sumB)
      : ([-avgDirA[0], -avgDirA[1], -avgDirA[2]] as Vec3);

  return {
    valid: true,
    usedChainEdgePlan: useChainEdgePlan,
    railsByVertex,
    avgDirA,
    avgDirB,
    guideSegments,
  };
}

/**
 * Slides all vertices in `plan` by a single shared normalized `factor` in [-1, 1]
 * (or [-1.5, 1.5] when `clamp = false`), ensuring proportional displacement across
 * segments of differing lengths and preserving topological chain continuity.
 */
export function applyParametricVertexSlide(
  sourceMesh: EditableMesh,
  plan: ParametricVertexSlidePlan,
  factor: number,
  clamp = true,
): SlideApplyResult {
  const mesh = sourceMesh.clone();
  const movedVertexIds = new Set<string>();
  if (!plan.valid || Math.abs(factor) < 1e-6) {
    return { mesh, movedVertexIds, appliedFactor: 0, clamped: false };
  }

  const maxBound = clamp ? 0.98 : 1.5;
  const fClamped = Math.max(-maxBound, Math.min(maxBound, factor));
  const wasClamped = Math.abs(fClamped - factor) > 1e-6;

  for (const [vid, rail] of plan.railsByVertex) {
    const v = mesh.getVertex(vid);
    if (!v) continue;

    if (fClamped > 0) {
      if (rail.railA) {
        v.position = lerpVec(rail.startPos, rail.railA, fClamped);
        movedVertexIds.add(vid);
      } else if (!clamp && rail.railB) {
        v.position = lerpVec(rail.startPos, rail.railB, -fClamped);
        movedVertexIds.add(vid);
      }
    } else if (fClamped < 0) {
      const mag = Math.abs(fClamped);
      if (rail.railB) {
        v.position = lerpVec(rail.startPos, rail.railB, mag);
        movedVertexIds.add(vid);
      } else if (!clamp && rail.railA) {
        v.position = lerpVec(rail.startPos, rail.railA, -mag);
        movedVertexIds.add(vid);
      }
    }
  }

  mesh.clearCustomNormals();
  return {
    mesh,
    movedVertexIds,
    appliedFactor: fClamped,
    clamped: wasClamped,
  };
}

/* ============================================================================
 * 2. EDGE SLIDE — Deslizamiento topológico a través de caras adyacentes
 * ========================================================================== */

function findRailNeighborInFace(
  face: MeshFace,
  edgeV0: string,
  edgeV1: string,
  vertexId: string,
): string | null {
  const verts = face.vertexIds;
  const n = verts.length;
  if (n < 3) return null;
  const idx = verts.indexOf(vertexId);
  if (idx === -1) return null;
  const prevV = verts[(idx - 1 + n) % n];
  const nextV = verts[(idx + 1) % n];
  const otherEdgeVert = vertexId === edgeV0 ? edgeV1 : edgeV0;
  if (prevV === otherEdgeVert && nextV !== vertexId && nextV !== otherEdgeVert) {
    return nextV;
  }
  if (nextV === otherEdgeVert && prevV !== vertexId && prevV !== otherEdgeVert) {
    return prevV;
  }
  return null;
}

/**
 * Checks if two faces incident to `pivotV` lie on the same side of a selected edge chain
 * (i.e., connected in the vertex face-fan without crossing any selected edge).
 */
function facesConnectedWithoutCrossingSelected(
  mesh: EditableMesh,
  pivotV: string,
  faceSeedId: string,
  targetFaceId: string,
  selectedEdgeSet: ReadonlySet<string>,
): boolean {
  if (faceSeedId === targetFaceId) return true;
  const incFaces = new Set(mesh.getFacesForVertex(pivotV));
  if (!incFaces.has(faceSeedId) || !incFaces.has(targetFaceId)) return false;

  const visited = new Set<string>([faceSeedId]);
  const queue = [faceSeedId];

  while (queue.length > 0) {
    const fid = queue.shift()!;
    const edges = mesh.getEdgesForFace(fid);
    for (const eid of edges) {
      if (selectedEdgeSet.has(eid)) continue;
      const e = mesh.getEdge(eid);
      if (!e || (e.v0 !== pivotV && e.v1 !== pivotV)) continue;
      for (const nfId of mesh.getFacesForEdge(eid)) {
        if (!incFaces.has(nfId) || visited.has(nfId)) continue;
        if (nfId === targetFaceId) return true;
        visited.add(nfId);
        queue.push(nfId);
      }
    }
  }
  return false;
}

/**
 * Builds a consistent bidirectional Edge Slide plan across selected edges and adjacent faces.
 * Supports single edges, open edge chains, closed edge loops, quads, triangles, and n-gons.
 */
export function buildEdgeSlidePlan(
  mesh: EditableMesh,
  selectedIds: ReadonlySet<string>,
): EdgeSlidePlan {
  const validEdgeIds: string[] = [];
  for (const eid of selectedIds) {
    const edge = mesh.getEdge(eid);
    if (!edge) continue;
    const adj = mesh.getFacesForEdge(eid);
    if (adj.length >= 1 && adj.length <= 2) {
      validEdgeIds.push(eid);
    }
  }

  if (validEdgeIds.length === 0) {
    return {
      valid: false,
      reason:
        'Selecciona una o más aristas pertenecientes a caras para usar Edge Slide.',
      edgeIds: [],
      railsByVertex: new Map(),
      avgDirA: [1, 0, 0],
      avgDirB: [-1, 0, 0],
      avgLenA: 1,
      avgLenB: 1,
      guideSegments: [],
    };
  }

  const selectedEdgeSet = new Set(validEdgeIds);
  // Per selected edge, track which adjacent face is Side A and which is Side B
  const edgeSides = new Map<string, { sideA: string | null; sideB: string | null }>();

  for (const seedEid of validEdgeIds) {
    if (edgeSides.has(seedEid)) continue;
    const seedAdj = mesh.getFacesForEdge(seedEid);
    if (seedAdj.length === 0) continue;

    edgeSides.set(seedEid, {
      sideA: seedAdj[0] ?? null,
      sideB: seedAdj[1] ?? null,
    });

    const queue = [seedEid];
    while (queue.length > 0) {
      const currEid = queue.shift()!;
      const currEdge = mesh.getEdge(currEid);
      const currInfo = edgeSides.get(currEid);
      if (!currEdge || !currInfo) continue;

      for (const pivotV of [currEdge.v0, currEdge.v1]) {
        for (const incEid of mesh.getEdgesForVertex(pivotV)) {
          if (incEid === currEid || !selectedEdgeSet.has(incEid) || edgeSides.has(incEid)) {
            continue;
          }
          const nextAdj = mesh.getFacesForEdge(incEid);
          if (nextAdj.length === 0) continue;

          let sideA: string | null = null;
          let sideB: string | null = null;

          const f0 = nextAdj[0];
          const f1 = nextAdj[1] ?? null;

          if (
            (currInfo.sideA &&
              facesConnectedWithoutCrossingSelected(
                mesh,
                pivotV,
                currInfo.sideA,
                f0,
                selectedEdgeSet,
              )) ||
            (currInfo.sideB &&
              f1 &&
              facesConnectedWithoutCrossingSelected(
                mesh,
                pivotV,
                currInfo.sideB,
                f1,
                selectedEdgeSet,
              ))
          ) {
            sideA = f0;
            sideB = f1;
          } else if (
            (currInfo.sideB &&
              facesConnectedWithoutCrossingSelected(
                mesh,
                pivotV,
                currInfo.sideB,
                f0,
                selectedEdgeSet,
              )) ||
            (currInfo.sideA &&
              f1 &&
              facesConnectedWithoutCrossingSelected(
                mesh,
                pivotV,
                currInfo.sideA,
                f1,
                selectedEdgeSet,
              ))
          ) {
            sideA = f1;
            sideB = f0;
          } else {
            sideA = f0;
            sideB = f1;
          }

          edgeSides.set(incEid, { sideA, sideB });
          queue.push(incEid);
        }
      }
    }
  }

  const scaleVec = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

  const findQuadCornerOpposite = (
    face: MeshFace,
    vid: string,
    selectedNeighborIds: Set<string>,
  ): string | null => {
    const verts = face.vertexIds;
    if (verts.length !== 4) return null;
    const idx = verts.indexOf(vid);
    if (idx === -1) return null;
    const prevV = verts[(idx + 3) % 4];
    const nextV = verts[(idx + 1) % 4];
    if (selectedNeighborIds.has(prevV) && selectedNeighborIds.has(nextV)) {
      return verts[(idx + 2) % 4];
    }
    return null;
  };

  // Gather per-vertex slide targets on Side A and Side B, filtering out selected edges as rails
  const accumA = new Map<string, Map<string, Vec3>>();
  const accumB = new Map<string, Map<string, Vec3>>();
  const fallbackCornerA = new Map<string, Vec3>();
  const fallbackCornerB = new Map<string, Vec3>();
  const selectedNeighborsByVert = new Map<string, Set<string>>();
  const allVertIds = new Set<string>();

  for (const eid of validEdgeIds) {
    const edge = mesh.getEdge(eid);
    if (!edge) continue;
    allVertIds.add(edge.v0);
    allVertIds.add(edge.v1);
    if (!selectedNeighborsByVert.has(edge.v0)) {
      selectedNeighborsByVert.set(edge.v0, new Set());
    }
    if (!selectedNeighborsByVert.has(edge.v1)) {
      selectedNeighborsByVert.set(edge.v1, new Set());
    }
    selectedNeighborsByVert.get(edge.v0)!.add(edge.v1);
    selectedNeighborsByVert.get(edge.v1)!.add(edge.v0);
  }

  for (const eid of validEdgeIds) {
    const edge = mesh.getEdge(eid);
    const sides = edgeSides.get(eid);
    if (!edge || !sides) continue;

    for (const vid of [edge.v0, edge.v1]) {
      const selNeighbors = selectedNeighborsByVert.get(vid) ?? new Set<string>();

      if (sides.sideA) {
        const faceA = mesh.getFace(sides.sideA);
        if (faceA) {
          const targetVid = findRailNeighborInFace(faceA, edge.v0, edge.v1, vid);
          const railEdgeId = targetVid ? mesh.findEdgeId(vid, targetVid) : null;
          const isSelectedRail = Boolean(railEdgeId && selectedEdgeSet.has(railEdgeId));
          if (targetVid && !isSelectedRail) {
            const targetV = mesh.getVertex(targetVid);
            if (targetV) {
              if (!accumA.has(vid)) accumA.set(vid, new Map());
              accumA.get(vid)!.set(targetVid, [...targetV.position]);
            }
          } else if (!fallbackCornerA.has(vid)) {
            const oppVid = findQuadCornerOpposite(faceA, vid, selNeighbors);
            const oppV = oppVid ? mesh.getVertex(oppVid) : undefined;
            if (oppV) {
              fallbackCornerA.set(vid, [...oppV.position]);
            }
          }
        }
      }

      if (sides.sideB) {
        const faceB = mesh.getFace(sides.sideB);
        if (faceB) {
          const targetVid = findRailNeighborInFace(faceB, edge.v0, edge.v1, vid);
          const railEdgeId = targetVid ? mesh.findEdgeId(vid, targetVid) : null;
          const isSelectedRail = Boolean(railEdgeId && selectedEdgeSet.has(railEdgeId));
          if (targetVid && !isSelectedRail) {
            const targetV = mesh.getVertex(targetVid);
            if (targetV) {
              if (!accumB.has(vid)) accumB.set(vid, new Map());
              accumB.get(vid)!.set(targetVid, [...targetV.position]);
            }
          } else if (!fallbackCornerB.has(vid)) {
            const oppVid = findQuadCornerOpposite(faceB, vid, selNeighbors);
            const oppV = oppVid ? mesh.getVertex(oppVid) : undefined;
            if (oppV) {
              fallbackCornerB.set(vid, [...oppV.position]);
            }
          }
        }
      }
    }
  }

  const resolveSideRailTarget = (
    vid: string,
    startPos: Vec3,
    targetsMap: Map<string, Vec3> | undefined,
    cornerFallback: Vec3 | undefined,
  ): Vec3 | null => {
    const entries = targetsMap ? Array.from(targetsMap.entries()) : [];
    const pts = entries.map(([, p]) => p);
    if (pts.length === 0) {
      return cornerFallback ? [...cornerFallback] : null;
    }
    if (pts.length === 1) {
      return [...pts[0]];
    }
    if (pts.length === 2) {
      const u1 = subVec(pts[0], startPos);
      const u2 = subVec(pts[1], startPos);
      const l1 = lenVec(u1);
      const l2 = lenVec(u2);
      if (l1 < 1e-7) return [...pts[1]];
      if (l2 < 1e-7) return [...pts[0]];
      // If the two target vertices directly share an edge across a triangle incident to `vid`,
      // keep the slide limit on that opposite triangle edge midpoint rather than overshooting.
      const spanEdgeId = mesh.findEdgeId(entries[0][0], entries[1][0]);
      if (spanEdgeId) {
        const spanFaces = mesh.getFacesForEdge(spanEdgeId);
        const sharesTriangle = spanFaces.some((fid) => {
          const f = mesh.getFace(fid);
          return f && f.vertexIds.length === 3 && f.vertexIds.includes(vid);
        });
        if (sharesTriangle) {
          return lerpVec(pts[0], pts[1], 0.5);
        }
      }
      const c = dotVec(normVec(u1), normVec(u2));
      // Mitered corner blend: exact average when rails align (c->1 -> denom=2),
      // exact corner sum when perpendicular (c=0 -> denom=1), clamped for obtuse angles.
      const denom = Math.max(0.5, 1 + c);
      return addVec(startPos, scaleVec(addVec(u1, u2), 1 / denom));
    }
    let dirSum: Vec3 = [0, 0, 0];
    let lenSum = 0;
    let validCount = 0;
    for (const p of pts) {
      const u = subVec(p, startPos);
      const l = lenVec(u);
      if (l > 1e-7) {
        dirSum = addVec(dirSum, normVec(u));
        lenSum += l;
        validCount++;
      }
    }
    if (validCount === 0) return null;
    const avgLen = lenSum / validCount;
    const dirLen = lenVec(dirSum);
    if (dirLen < 1e-6) {
      return [...pts[0]];
    }
    return addVec(startPos, scaleVec(normVec(dirSum), avgLen));
  };

  const railsByVertex = new Map<string, EdgeSlideRail>();
  const guideSegments: [Vec3, Vec3][] = [];
  let sumDirA: Vec3 = [0, 0, 0];
  let sumDirB: Vec3 = [0, 0, 0];
  let sumLenA = 0;
  let countA = 0;
  let sumLenB = 0;
  let countB = 0;

  for (const vid of allVertIds) {
    const v = mesh.getVertex(vid);
    if (!v) continue;
    const pA = resolveSideRailTarget(
      vid,
      v.position,
      accumA.get(vid),
      fallbackCornerA.get(vid),
    );
    const pB = resolveSideRailTarget(
      vid,
      v.position,
      accumB.get(vid),
      fallbackCornerB.get(vid),
    );
    if (!pA && !pB) continue;

    railsByVertex.set(vid, {
      vertexId: vid,
      startPos: [...v.position],
      railA: pA,
      railB: pB,
    });

    if (pA) {
      const dA = subVec(pA, v.position);
      const lA = lenVec(dA);
      if (lA > 1e-7) {
        sumDirA = addVec(sumDirA, normVec(dA));
        sumLenA += lA;
        countA++;
        guideSegments.push([[...v.position], [...pA]]);
      }
    }
    if (pB) {
      const dB = subVec(pB, v.position);
      const lB = lenVec(dB);
      if (lB > 1e-7) {
        sumDirB = addVec(sumDirB, normVec(dB));
        sumLenB += lB;
        countB++;
        guideSegments.push([[...v.position], [...pB]]);
      }
    }
  }

  if (railsByVertex.size === 0) {
    return {
      valid: false,
      reason:
        'Las aristas seleccionadas no tienen caras vecinas válidas para deslizar.',
      edgeIds: validEdgeIds,
      railsByVertex,
      avgDirA: [1, 0, 0],
      avgDirB: [-1, 0, 0],
      avgLenA: 1,
      avgLenB: 1,
      guideSegments: [],
    };
  }

  const avgDirA = normVec(sumDirA, [1, 0, 0]);
  const avgDirB: Vec3 =
    countB > 0
      ? normVec(sumDirB, [-avgDirA[0], -avgDirA[1], -avgDirA[2]])
      : [-avgDirA[0], -avgDirA[1], -avgDirA[2]];

  return {
    valid: true,
    edgeIds: validEdgeIds,
    railsByVertex,
    avgDirA,
    avgDirB,
    avgLenA: countA > 0 ? sumLenA / countA : countB > 0 ? sumLenB / countB : 1,
    avgLenB: countB > 0 ? sumLenB / countB : countA > 0 ? sumLenA / countA : 1,
    guideSegments,
  };
}

/**
 * Slides the selected edge(s) smoothly across adjacent faces by `factor` in [-1, 1].
 * Positive factor slides toward Side A; negative factor slides toward Side B.
 * Clamps inside [-0.97, 0.97] to avoid collapsing faces or creating degenerate geometry.
 */
export function applyEdgeSlide(
  sourceMesh: EditableMesh,
  plan: EdgeSlidePlan,
  factor: number,
  clamp = true,
): SlideApplyResult {
  const mesh = sourceMesh.clone();
  const movedVertexIds = new Set<string>();
  if (!plan.valid || Math.abs(factor) < 1e-6) {
    return { mesh, movedVertexIds, appliedFactor: 0, clamped: false };
  }

  const maxBound = clamp ? 0.97 : 1.5;
  const fClamped = Math.max(-maxBound, Math.min(maxBound, factor));
  const wasClamped = Math.abs(fClamped - factor) > 1e-6;

  for (const [vid, rail] of plan.railsByVertex) {
    const v = mesh.getVertex(vid);
    if (!v) continue;

    if (fClamped > 0) {
      if (rail.railA) {
        v.position = lerpVec(rail.startPos, rail.railA, fClamped);
        movedVertexIds.add(vid);
      } else if (!clamp && rail.railB) {
        // Boundary edge: extend opposite to Side B when clamp is disabled
        v.position = lerpVec(rail.startPos, rail.railB, -fClamped);
        movedVertexIds.add(vid);
      }
    } else if (fClamped < 0) {
      const mag = Math.abs(fClamped);
      if (rail.railB) {
        v.position = lerpVec(rail.startPos, rail.railB, mag);
        movedVertexIds.add(vid);
      } else if (!clamp && rail.railA) {
        // Boundary edge: extend opposite to Side A when clamp is disabled
        v.position = lerpVec(rail.startPos, rail.railA, -mag);
        movedVertexIds.add(vid);
      }
    }
  }

  mesh.clearCustomNormals();
  return {
    mesh,
    movedVertexIds,
    appliedFactor: fClamped,
    clamped: wasClamped,
  };
}
