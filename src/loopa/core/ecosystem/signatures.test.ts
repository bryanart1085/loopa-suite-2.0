import { describe, expect, it } from 'vitest';
import type { ProjectData, SceneObjectData } from '../project/types';
import { appCanModify } from './apps';
import {
  computeProjectSignature,
  diffProjectSignatures,
  finalizeAppSession,
  findDomainViolations,
  sanitizeEcosystemMeta,
} from './signatures';

function quadObject(id = 'obj1'): SceneObjectData {
  return {
    id,
    name: 'Plano',
    objectType: 'mesh',
    primitiveType: 'plane',
    collectionId: 'col1',
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    mesh: {
      vertices: [
        { id: 'v1', position: [0, 0, 0] },
        { id: 'v2', position: [1, 0, 0] },
        { id: 'v3', position: [1, 1, 0] },
        { id: 'v4', position: [0, 1, 0] },
      ],
      edges: [],
      faces: [
        { id: 'f1', vertexIds: ['v1', 'v2', 'v3', 'v4'], uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], materialId: 'm1' },
      ],
      nextVertexNum: 5,
      nextEdgeNum: 1,
      nextFaceNum: 2,
    },
    material: { color: '#ffffff', roughness: 0.5, metalness: 0 } as SceneObjectData['material'],
    materialId: 'm1',
    modifiers: [],
  };
}

function project(obj: SceneObjectData = quadObject()): ProjectData {
  return {
    version: 2,
    id: 'p1',
    name: 'Test',
    createdAt: 1,
    updatedAt: 1,
    activeSceneId: 's1',
    materials: [],
    scenes: [
      {
        id: 's1',
        name: 'Scene',
        activeCollectionId: 'col1',
        collections: [{ id: 'col1', name: 'Collection', sceneId: 's1', parentId: null, expanded: true }],
        objects: [obj],
      },
    ],
  };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('LOOPA Core app permissions', () => {
  it('Modeler may change geometry but not UVs or materials', () => {
    expect(appCanModify('modeler', 'topology')).toBe(true);
    expect(appCanModify('modeler', 'uvs')).toBe(false);
    expect(appCanModify('modeler', 'materials')).toBe(false);
  });
  it('Sculpt may only change the surface shape', () => {
    expect(appCanModify('sculpt', 'shape')).toBe(true);
    expect(appCanModify('sculpt', 'topology')).toBe(false);
    expect(appCanModify('sculpt', 'uvs')).toBe(false);
  });
  it('UVs may not change geometry or materials', () => {
    expect(findDomainViolations('uvs', ['shape', 'uvs', 'materials'])).toEqual(['shape', 'materials']);
  });
  it('Materials may not change geometry, sculpt or UVs', () => {
    expect(findDomainViolations('materials', ['topology', 'shape', 'uvs', 'materials'])).toEqual([
      'topology',
      'shape',
      'uvs',
    ]);
  });
});

describe('LOOPA Core change detection', () => {
  it('detects a sculpt-style vertex move as a shape change only', () => {
    const a = project();
    const b = clone(a);
    b.scenes[0]!.objects[0]!.mesh.vertices[2]!.position = [1, 1, 0.3];
    expect(diffProjectSignatures(computeProjectSignature(a), computeProjectSignature(b))).toEqual(['shape']);
  });
  it('detects a UV edit as a UV change only', () => {
    const a = project();
    const b = clone(a);
    b.scenes[0]!.objects[0]!.mesh.faces[0]!.uvs![2] = [0.8, 0.9];
    expect(diffProjectSignatures(computeProjectSignature(a), computeProjectSignature(b))).toEqual(['uvs']);
  });
  it('detects a material assignment as a materials change', () => {
    const a = project();
    const b = clone(a);
    b.scenes[0]!.objects[0]!.materialId = 'm2';
    expect(diffProjectSignatures(computeProjectSignature(a), computeProjectSignature(b))).toEqual(['materials']);
  });
  it('reports no changes for an identical project', () => {
    const a = project();
    expect(diffProjectSignatures(computeProjectSignature(a), computeProjectSignature(clone(a)))).toEqual([]);
  });
});

describe('LOOPA Core UV staleness warning', () => {
  it('warns that UVs may need updating when Modeler changes topology after UV work', () => {
    const p = project();
    const afterUvs = finalizeAppSession(p, 'uvs', computeProjectSignature(p), 10);
    const withMeta: ProjectData = { ...p, ecosystem: afterUvs.meta };
    expect(afterUvs.staleUvObjects).toEqual([]);

    const modeled = clone(withMeta);
    const mesh = modeled.scenes[0]!.objects[0]!.mesh;
    mesh.vertices.push({ id: 'v5', position: [2, 0, 0] });
    mesh.faces.push({ id: 'f2', vertexIds: ['v2', 'v5', 'v3'] });
    const res = finalizeAppSession(modeled, 'modeler', computeProjectSignature(withMeta), 20);
    expect(res.changed).toContain('topology');
    expect(res.violations).toEqual([]);
    expect(res.staleUvObjects).toEqual([{ id: 'obj1', name: 'Plano' }]);
  });
  it('flags Materials changing geometry as a violation', () => {
    const p = project();
    const b = clone(p);
    b.scenes[0]!.objects[0]!.mesh.vertices[0]!.position = [0, 0, 1];
    const res = finalizeAppSession(b, 'materials', computeProjectSignature(p), 5);
    expect(res.violations).toEqual(['shape']);
  });
  it('records the session in the project history and bumps the revision', () => {
    const p = project();
    const b = clone(p);
    b.scenes[0]!.objects[0]!.materialId = 'm2';
    const res = finalizeAppSession(b, 'materials', computeProjectSignature(p), 7);
    expect(res.meta.revision).toBe(1);
    expect(res.meta.lastAppId).toBe('materials');
    expect(res.meta.history).toEqual([{ appId: 'materials', at: 7, domains: ['materials'] }]);
  });
});

describe('LOOPA Core metadata persistence', () => {
  it('keeps valid metadata and drops invalid entries', () => {
    const meta = sanitizeEcosystemMeta({
      formatVersion: 1,
      revision: 3,
      lastAppId: 'uvs',
      history: [{ appId: 'uvs', at: 1, domains: ['uvs', 'bogus'] }, { appId: 'nope', at: 2, domains: [] }],
      uvBasis: { obj1: 'abc', obj2: 5 },
    });
    expect(meta).toEqual({
      formatVersion: 1,
      revision: 3,
      lastAppId: 'uvs',
      history: [{ appId: 'uvs', at: 1, domains: ['uvs'] }],
      uvBasis: { obj1: 'abc' },
    });
  });
});
