/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Box,
  Copy,
  Cpu,
  Edit2,
  Film,
  FolderOpen,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { LoopaSymbol } from './BrandLogo';
import { LoopaAppBadge, LoopaAppIcon, APP_ACCENT } from './ecosystem/LoopaAppIcon';
import { LOOPA_APP_ORDER, LOOPA_APPS } from '../core/ecosystem/apps';
import type { LoopaAppId } from '../core/ecosystem/types';
import { PROJECT_TEMPLATE_META } from '../core/project/thumbnail';
import { ProjectSummary, ProjectFolder, ProjectRecoveryRecord } from '../core/project/types';

interface LoopaEcosystemLandingProps {
  projects: ProjectSummary[];
  folders: ProjectFolder[];
  activeProjectId: string;
  startupRecoveryList?: ProjectRecoveryRecord[];
  onOpenProject: (projectId: string) => Promise<boolean>;
  onCreateProjectModal: () => void;
  onRenameProject: (id: string, name: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProjects: (ids: string[]) => void;
  onImportModelFiles: (files: FileList, folderId: string | null) => void;
  onApplyRecoveryDraft?: (record: ProjectRecoveryRecord) => void;
  onDiscardRecoveryDraft?: (projectId: string) => void;
  onOpenModeler: () => void;
  onOpenSculpt: () => void;
  onOpenMaterials: () => void;
  onOpenUVs: () => void;
  onOpenTimelapse: (proj: ProjectSummary) => void;
  onNotify: (msg: string) => void;
}

export type GallerySortKey = 'updated' | 'created' | 'name';

const SORT_LABELS: Record<GallerySortKey, string> = {
  updated: 'Última modificación',
  created: 'Fecha de creación',
  name: 'Nombre (A–Z)',
};

export function sortProjects(projects: ProjectSummary[], key: GallerySortKey): ProjectSummary[] {
  const list = [...projects];
  if (key === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }));
  } else if (key === 'created') {
    list.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return list;
}

const dateFormatter = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

function projectTypeLabel(p: ProjectSummary): string {
  const template = p.templateId ? PROJECT_TEMPLATE_META[p.templateId]?.label : null;
  return template ? `LOOPA · ${template}` : 'LOOPA · Personalizado';
}

export function LoopaEcosystemLanding({
  projects,
  folders,
  activeProjectId,
  startupRecoveryList = [],
  onOpenProject,
  onCreateProjectModal,
  onRenameProject,
  onDuplicateProject,
  onDeleteProjects,
  onImportModelFiles,
  onApplyRecoveryDraft,
  onDiscardRecoveryDraft,
  onOpenModeler,
  onOpenSculpt,
  onOpenMaterials,
  onOpenUVs,
  onOpenTimelapse,
}: LoopaEcosystemLandingProps) {
  const [selectedTab, setSelectedTab] = useState<'gallery' | 'ecosystem'>('gallery');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<GallerySortKey>('updated');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q);
      const matchesFolder = selectedFolderId === null ? true : p.folderId === selectedFolderId;
      return matchesSearch && matchesFolder;
    });
    return sortProjects(filtered, sortKey);
  }, [projects, searchQuery, selectedFolderId, sortKey]);

  const openHandlers: Record<LoopaAppId, () => void> = {
    modeler: onOpenModeler,
    sculpt: onOpenSculpt,
    uvs: onOpenUVs,
    materials: onOpenMaterials,
  };

  const commitRename = (id: string) => {
    const name = editNameValue.trim();
    if (name) onRenameProject(id, name);
    setEditingProjectId(null);
  };

  return (
    <div className="absolute inset-0 z-50 bg-background text-foreground flex flex-col overflow-y-auto select-none">
      {/* Suite header */}
      <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur-md border-b border-border px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <LoopaSymbol className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold tracking-wider">LOOPA SUITE</h1>
            <p className="text-xs text-muted-foreground truncate">Galería de proyectos del ecosistema 3D</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex bg-surface-raised p-1 rounded-xl border border-border" role="tablist">
            <button
              role="tab"
              aria-selected={selectedTab === 'gallery'}
              onClick={() => setSelectedTab('gallery')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                selectedTab === 'gallery' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" /> Proyectos ({projects.length})
            </button>
            <button
              role="tab"
              aria-selected={selectedTab === 'ecosystem'}
              onClick={() => setSelectedTab('ecosystem')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                selectedTab === 'ecosystem' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> Aplicaciones
            </button>
          </div>

          <button
            onClick={onCreateProjectModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo proyecto
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 flex flex-col gap-5">
        {selectedTab === 'gallery' ? (
          <>
            {/* Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 bg-surface border border-border rounded-2xl p-3 sm:p-4">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar proyectos…"
                  aria-label="Buscar proyectos"
                  className="w-full bg-background border border-border focus:border-primary rounded-xl pl-10 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="whitespace-nowrap">Ordenar por</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as GallerySortKey)}
                    aria-label="Ordenar proyectos"
                    className="bg-background border border-border focus:border-primary rounded-xl px-3 py-2 text-xs text-foreground outline-none"
                  >
                    {(Object.keys(SORT_LABELS) as GallerySortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>

                {folders.length > 0 && (
                  <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-1 overflow-x-auto max-w-full">
                    <button
                      onClick={() => setSelectedFolderId(null)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                        selectedFolderId === null ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Todos
                    </button>
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                          selectedFolderId === f.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".obj,.stl,.glb,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      onImportModelFiles(e.target.files, selectedFolderId);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-raised hover:bg-accent border border-border text-foreground text-xs font-semibold transition-colors"
                >
                  <Upload className="w-4 h-4" /> Importar modelo 3D
                </button>
              </div>
            </div>

            {startupRecoveryList.length > 0 && onApplyRecoveryDraft && onDiscardRecoveryDraft && (
              <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-warning">Borrador de recuperación disponible</h4>
                  <p className="text-xs text-muted-foreground">Se detectó una sesión previa interrumpida que puedes recuperar.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onApplyRecoveryDraft(startupRecoveryList[0])}
                    className="px-3 py-1.5 rounded-lg bg-warning text-warning-foreground text-xs font-bold"
                  >
                    Recuperar
                  </button>
                  <button
                    onClick={() => onDiscardRecoveryDraft(startupRecoveryList[0].projectId)}
                    className="px-3 py-1.5 rounded-lg bg-accent text-foreground text-xs font-medium"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {visibleProjects.length === 0 ? (
              <div className="bg-surface border border-border rounded-3xl p-10 sm:p-16 text-center flex flex-col items-center justify-center gap-4 my-auto">
                <FolderOpen className="w-12 h-12 text-muted-foreground" />
                {projects.length === 0 ? (
                  <>
                    <h3 className="text-lg font-bold">Todavía no hay proyectos</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Crea un proyecto nuevo o importa un archivo 3D (.obj, .stl, .glb) para empezar.
                    </p>
                    <button
                      onClick={onCreateProjectModal}
                      className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold mt-2"
                    >
                      Crear proyecto nuevo
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-bold">Sin resultados</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Ningún proyecto coincide con la búsqueda o la carpeta seleccionada.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4" aria-label="Proyectos">
                {visibleProjects.map((proj) => {
                  const isEditing = editingProjectId === proj.id;
                  const isActive = proj.id === activeProjectId;
                  return (
                    <li
                      key={proj.id}
                      data-testid="gallery-project-card"
                      className="group bg-surface hover:bg-surface-raised border border-border hover:border-primary/40 rounded-2xl overflow-hidden flex flex-col transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => void onOpenProject(proj.id)}
                        className="relative block aspect-[4/3] bg-background overflow-hidden"
                        aria-label={`Abrir ${proj.name}`}
                      >
                        {proj.thumbnailDataUrl ? (
                          <img
                            src={proj.thumbnailDataUrl}
                            alt={`Vista previa de ${proj.name}`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            draggable={false}
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center">
                            <Box className="w-10 h-10 text-muted-foreground" />
                          </span>
                        )}
                        {proj.lastAppId && (
                          <span
                            className="absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-scrim px-2 py-1 text-[10px] font-semibold text-foreground"
                            title={`Última aplicación: ${LOOPA_APPS[proj.lastAppId].name}`}
                          >
                            <LoopaAppIcon appId={proj.lastAppId} className="w-3 h-3" />
                            {LOOPA_APPS[proj.lastAppId].tagline}
                          </span>
                        )}
                        {isActive && (
                          <span className="absolute right-2 top-2 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                            Activo
                          </span>
                        )}
                      </button>

                      <div className="p-3.5 flex flex-col gap-2 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              aria-label="Nuevo nombre del proyecto"
                              className="w-full bg-background border border-primary rounded px-2 py-1 text-xs text-foreground outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(proj.id);
                                else if (e.key === 'Escape') setEditingProjectId(null);
                              }}
                            />
                            <button
                              onClick={() => commitRename(proj.id)}
                              className="px-2 py-1 bg-primary text-primary-foreground text-xs font-bold rounded"
                            >
                              OK
                            </button>
                          </div>
                        ) : (
                          <h4 className="text-sm font-bold truncate" title={proj.name}>
                            {proj.name}
                          </h4>
                        )}

                        <p className="text-[11px] text-muted-foreground">
                          Modificado {dateFormatter.format(proj.updatedAt)}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] bg-accent px-2 py-0.5 rounded text-muted-foreground font-medium">
                            {projectTypeLabel(proj)}
                          </span>
                          <span className="text-[10px] bg-accent px-2 py-0.5 rounded text-muted-foreground font-medium">
                            {proj.objectCount} {proj.objectCount === 1 ? 'objeto' : 'objetos'}
                          </span>
                        </div>

                        <div className="mt-auto pt-2.5 border-t border-border flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => void onOpenProject(proj.id)}
                            className="text-xs text-primary font-semibold flex items-center gap-1"
                          >
                            Abrir <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                          </button>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => {
                                setEditingProjectId(proj.id);
                                setEditNameValue(proj.name);
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                              title="Renombrar"
                              aria-label={`Renombrar ${proj.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDuplicateProject(proj.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                              title="Duplicar"
                              aria-label={`Duplicar ${proj.name}`}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onOpenTimelapse(proj)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                              title="Timelapse"
                              aria-label={`Timelapse de ${proj.name}`}
                            >
                              <Film className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setPendingDelete(proj)}
                              className="p-1.5 rounded-lg text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                              title="Eliminar"
                              aria-label={`Eliminar ${proj.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold">
                <Cpu className="w-3.5 h-3.5" /> LOOPA Core
              </div>
              <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight">Cuatro aplicaciones, un mismo proyecto</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                Cada aplicación trabaja solo sobre sus datos. Usa «Compartir con LOOPA Ecosystem» para pasar el proyecto
                abierto de una a otra sin crear copias.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {LOOPA_APP_ORDER.map((id) => {
                const app = LOOPA_APPS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={openHandlers[id]}
                    className={`group text-left bg-surface hover:bg-surface-raised border border-border ${APP_ACCENT[id].hoverBorder} rounded-2xl p-5 flex flex-col justify-between gap-6 transition-colors`}
                  >
                    <div>
                      <LoopaAppBadge appId={id} />
                      <h3 className="mt-4 text-base font-bold">{app.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{app.description}</p>
                    </div>
                    <span className={`pt-3 border-t border-border flex items-center justify-between text-xs font-semibold ${APP_ACCENT[id].text}`}>
                      Abrir con el proyecto activo
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-surface px-6 py-3 text-center text-xs text-muted-foreground">
        LOOPA Suite © 2026 — LOOPA Core
      </footer>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-scrim p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="loopa-delete-title"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm bg-surface border border-border rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="loopa-delete-title" className="text-sm font-bold">
              ¿Eliminar «{pendingDelete.name}»?
            </h3>
            <p className="text-xs text-muted-foreground">
              El proyecto se eliminará de este dispositivo en todas las aplicaciones de LOOPA. No se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-3.5 py-2 rounded-lg bg-accent text-foreground text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDeleteProjects([pendingDelete.id]);
                  setPendingDelete(null);
                }}
                className="px-3.5 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
