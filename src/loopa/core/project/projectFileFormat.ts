import { APP_NAME } from '../../config/brand';
import { normalizeProjectHierarchy } from './hierarchy';
import {
  NativeProjectFileEnvelope,
  ProjectData,
} from './types';

export const NATIVE_PROJECT_FORMAT = 'forma3d-project' as const;
export const NATIVE_PROJECT_FORMAT_VERSION = 1 as const;
export const NATIVE_PROJECT_EXTENSION = '.forma3d.json';

export function buildSafeProjectFilename(projectName: string): string {
  const cleaned = projectName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_');
  const base = cleaned || 'proyecto_loopa';
  return `${base}${NATIVE_PROJECT_EXTENSION}`;
}

export function serializeNativeProjectFile(
  project: ProjectData,
  options?: {
    folderName?: string | null;
    thumbnailDataUrl?: string | null;
  },
): string {
  const thumbnail =
    options?.thumbnailDataUrl !== undefined
      ? options.thumbnailDataUrl
      : project.thumbnailDataUrl ?? null;

  const envelope: NativeProjectFileEnvelope = {
    format: NATIVE_PROJECT_FORMAT,
    formatVersion: NATIVE_PROJECT_FORMAT_VERSION,
    exportedAt: Date.now(),
    folderName: options?.folderName ?? null,
    thumbnailDataUrl: thumbnail,
    project: {
      ...project,
      thumbnailDataUrl: thumbnail,
    },
  };

  return JSON.stringify(envelope, null, 2);
}

export type ParseNativeProjectResult =
  | {
      ok: true;
      envelope: NativeProjectFileEnvelope;
    }
  | {
      ok: false;
      error: string;
    };

export function parseNativeProjectFile(rawText: string): ParseNativeProjectResult {
  if (!rawText || !rawText.trim()) {
    return { ok: false, error: 'El archivo de proyecto está vacío.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: `El archivo no tiene formato JSON válido de ${APP_NAME}.`,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Estructura de proyecto no compatible.' };
  }

  const record = parsed as Record<string, unknown>;

  if (record.format === NATIVE_PROJECT_FORMAT) {
    if (
      typeof record.formatVersion === 'number' &&
      record.formatVersion > NATIVE_PROJECT_FORMAT_VERSION
    ) {
      return {
        ok: false,
        error: `Versión de proyecto no compatible (v${record.formatVersion}). Actualiza ${APP_NAME}.`,
      };
    }

    const normalized = normalizeProjectHierarchy(record.project);
    if (!normalized) {
      return {
        ok: false,
        error: 'El contenido del proyecto nativo está incompleto o dañado.',
      };
    }

    const thumb =
      typeof record.thumbnailDataUrl === 'string' &&
      record.thumbnailDataUrl.startsWith('data:image/')
        ? record.thumbnailDataUrl
        : normalized.thumbnailDataUrl ?? null;

    return {
      ok: true,
      envelope: {
        format: NATIVE_PROJECT_FORMAT,
        formatVersion: NATIVE_PROJECT_FORMAT_VERSION,
        exportedAt:
          typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
        folderName:
          typeof record.folderName === 'string' ? record.folderName : null,
        thumbnailDataUrl: thumb,
        project: {
          ...normalized,
          thumbnailDataUrl: thumb,
        },
      },
    };
  }

  // Fallback compatibility: direct ProjectData JSON
  const normalizedDirect = normalizeProjectHierarchy(parsed);
  if (!normalizedDirect || !Array.isArray((record as Partial<ProjectData>).scenes)) {
    return {
      ok: false,
      error: `Este archivo no corresponde a un proyecto válido de ${APP_NAME}.`,
    };
  }

  return {
    ok: true,
    envelope: {
      format: NATIVE_PROJECT_FORMAT,
      formatVersion: NATIVE_PROJECT_FORMAT_VERSION,
      exportedAt: Date.now(),
      folderName: null,
      thumbnailDataUrl: normalizedDirect.thumbnailDataUrl ?? null,
      project: normalizedDirect,
    },
  };
}
