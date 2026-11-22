import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '../core/project/types';
import { sortProjects } from './LoopaEcosystemLanding';

const p = (name: string, createdAt: number, updatedAt: number): ProjectSummary => ({
  id: name,
  name,
  createdAt,
  updatedAt,
  objectCount: 1,
  folderId: null,
});

const list = [p('beta', 2, 30), p('Alfa', 3, 10), p('gamma', 1, 20)];

describe('Galería: ordenar proyectos', () => {
  it('por última modificación, la más reciente primero', () => {
    expect(sortProjects(list, 'updated').map((x) => x.name)).toEqual(['beta', 'gamma', 'Alfa']);
  });
  it('por fecha de creación, el más nuevo primero', () => {
    expect(sortProjects(list, 'created').map((x) => x.name)).toEqual(['Alfa', 'beta', 'gamma']);
  });
  it('por nombre A–Z sin distinguir mayúsculas', () => {
    expect(sortProjects(list, 'name').map((x) => x.name)).toEqual(['Alfa', 'beta', 'gamma']);
  });
});
