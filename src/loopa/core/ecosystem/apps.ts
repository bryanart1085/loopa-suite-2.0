/**
 * LOOPA Core — registry of the apps in LOOPA Ecosystem and the data areas each owns.
 */
import type { LoopaAppId, ProjectDomain } from './types';

export interface LoopaAppDefinition {
  id: LoopaAppId;
  name: string;
  tagline: string;
  description: string;
  /** Data areas this app is allowed to modify. */
  domains: readonly ProjectDomain[];
}

export const LOOPA_APP_ORDER: readonly LoopaAppId[] = ['modeler', 'sculpt', 'uvs', 'materials'];

export const LOOPA_APPS: Record<LoopaAppId, LoopaAppDefinition> = {
  modeler: {
    id: 'modeler',
    name: 'LOOPA Modeler',
    tagline: 'Modelado 3D',
    description: 'Modelado poligonal: objetos, vértices, aristas, caras, extrusión y subdivisión.',
    domains: ['structure', 'topology', 'shape', 'transforms', 'modifiers'],
  },
  sculpt: {
    id: 'sculpt',
    name: 'LOOPA Sculpt',
    tagline: 'Escultura',
    description: 'Escultura digital: añadir, quitar, suavizar, inflar y pellizcar la superficie.',
    domains: ['shape'],
  },
  uvs: {
    id: 'uvs',
    name: 'LOOPA UVs',
    tagline: 'Mapeado UV',
    description: 'Costuras, desenvolver mallas, editar islas UV y textura de comprobación.',
    domains: ['uvs'],
  },
  materials: {
    id: 'materials',
    name: 'LOOPA Materials',
    tagline: 'Materiales PBR',
    description: 'Materiales PBR: color, metallic, roughness, texturas y asignación a objetos.',
    domains: ['materials'],
  },
};

export const PROJECT_DOMAIN_LABELS: Record<ProjectDomain, string> = {
  structure: 'objetos y jerarquía',
  topology: 'topología',
  shape: 'forma de la superficie',
  transforms: 'transformaciones',
  modifiers: 'modificadores',
  uvs: 'UVs',
  materials: 'materiales',
};

export function isLoopaAppId(value: unknown): value is LoopaAppId {
  return value === 'modeler' || value === 'sculpt' || value === 'uvs' || value === 'materials';
}

export function appCanModify(appId: LoopaAppId, domain: ProjectDomain): boolean {
  return LOOPA_APPS[appId].domains.includes(domain);
}
