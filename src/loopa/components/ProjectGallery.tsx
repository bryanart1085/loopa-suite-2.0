import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Edit3,
  FileBox,
  Film,
  Folder,
  FolderInput,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  Info,
  LayoutGrid,
  List,
  Menu,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  APP_DESCRIPTION,
  APP_GALLERY_SUBTITLE,
  APP_NAME,
  APP_TAGLINE,
  APP_VERSION,
} from '../config/brand';
import { triggerFileDownload } from '../core/io/meshUtils';
import { generateTemplateThumbnailDataUrl } from '../core/project/thumbnail';
import {
  DeleteFolderResolution,
  GalleryViewMode,
  ProjectData,
  ProjectFolder,
  ProjectRecoveryRecord,
  ProjectSortBy,
  ProjectSummary,
  ProjectTemplateId,
} from '../core/project/types';
import { LoopaFullLogo, LoopaSymbol, LoopaWordmark } from './BrandLogo';
import {
  DeleteFolderModal,
  DeleteProjectsModal,
  MoveToFolderModal,
  RenameModal,
} from './GalleryModals';
import { NewProjectModal } from './NewProjectModal';

type FolderFilter = 'all' | 'recent' | 'unfiled' | string;

interface ProjectGalleryProps {
  projects: ProjectSummary[];
  folders: ProjectFolder[];
  activeProjectId: string | null;
  hasActiveUnsavedChanges: boolean;
  startupRecoveryList: ProjectRecoveryRecord[];
  isReady: boolean;
  toastMessage: string | null;
  onOpenProject: (projectId: string) => Promise<boolean>;
  onCreateProject: (
    name: string,
    templateId: ProjectTemplateId,
    folderId: string | null,
  ) => Promise<ProjectData | null>;
  onRenameProject: (projectId: string, newName: string) => Promise<boolean>;
  onDuplicateProject: (projectId: string) => Promise<ProjectData | null>;
  onDeleteProjects: (projectIds: string[]) => Promise<boolean>;
  onMoveProjectsToFolder: (
    projectIds: string[],
    folderId: string | null,
  ) => Promise<boolean>;
  onCreateFolder: (name: string) => Promise<ProjectFolder | null>;
  onRenameFolder: (folderId: string, newName: string) => Promise<boolean>;
  onDeleteFolder: (
    folderId: string,
    resolution: DeleteFolderResolution,
  ) => Promise<boolean>;
  onExportNativeProject: (
    projectId: string,
  ) => Promise<{ filename: string; content: string; project: ProjectData } | null>;
  onImportNativeProject: (
    rawText: string,
    targetFolderId: string | null,
  ) => Promise<{ ok: boolean; project?: ProjectData; error?: string }>;
  onImportModelFiles: (
    fileList: FileList,
    targetFolderId: string | null,
  ) => void;
  onApplyRecoveryDraft: (record: ProjectRecoveryRecord) => Promise<void>;
  onDiscardRecoveryDraft: (projectId: string) => Promise<void>;
  onOpenTimelapse?: (project: ProjectSummary) => void;
  onNotify: (msg: string) => void;
}

function formatDateCompact(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return `Hoy, ${date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function canUseNativeShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  );
}


export const ProjectGallery: React.FC<ProjectGalleryProps> = ({
  projects,
  folders,
  activeProjectId,
  hasActiveUnsavedChanges,
  startupRecoveryList,
  isReady,
  toastMessage,
  onOpenProject,
  onCreateProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProjects,
  onMoveProjectsToFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onExportNativeProject,
  onImportNativeProject,
  onImportModelFiles,
  onApplyRecoveryDraft,
  onDiscardRecoveryDraft,
  onOpenTimelapse,
  onNotify,
}) => {
  const [selectedFolderFilter, setSelectedFolderFilter] =
    useState<FolderFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ProjectSortBy>('updated_desc');
  const [viewMode, setViewMode] = useState<GalleryViewMode>('grid');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Selection mode (multi-select for batch actions)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Modals & Popovers
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderDraft, setNewFolderDraft] = useState('');
  const [renamingProject, setRenamingProject] =
    useState<ProjectSummary | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<ProjectFolder | null>(
    null,
  );
  const [deletingFolder, setDeletingFolder] = useState<ProjectFolder | null>(
    null,
  );
  const [deletingProjects, setDeletingProjects] = useState<ProjectSummary[]>(
    [],
  );
  const [movingProjectIds, setMovingProjectIds] = useState<string[] | null>(
    null,
  );
  const [actionMenu, setActionMenu] = useState<{
    project: ProjectSummary;
    left: number;
    top: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const modelImportInputRef = useRef<HTMLInputElement | null>(null);
  const fallbackThumb = useMemo(
    () => generateTemplateThumbnailDataUrl('cube'),
    [],
  );
  const supportsShare = useMemo(() => canUseNativeShare(), []);

  const folderMap = useMemo(() => {
    const map = new Map<string, ProjectFolder>();
    for (const f of folders) map.set(f.id, f);
    return map;
  }, [folders]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unfiled = 0;
    for (const p of projects) {
      if (p.folderId && folderMap.has(p.folderId)) {
        counts.set(p.folderId, (counts.get(p.folderId) ?? 0) + 1);
      } else {
        unfiled++;
      }
    }
    return { counts, unfiled };
  }, [folderMap, projects]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort(
        (a, b) =>
          (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt),
      )
      .slice(0, 4);
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (selectedFolderFilter === 'all' || selectedFolderFilter === 'recent') {
        return true;
      }
      if (selectedFolderFilter === 'unfiled') {
        return !p.folderId || !folderMap.has(p.folderId);
      }
      return p.folderId === selectedFolderFilter;
    });

    list = [...list].sort((a, b) => {
      if (selectedFolderFilter === 'recent' && sortBy === 'updated_desc') {
        return (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt);
      }
      switch (sortBy) {
        case 'updated_desc':
          return b.updatedAt - a.updatedAt;
        case 'updated_asc':
          return a.updatedAt - b.updatedAt;
        case 'created_desc':
          return b.createdAt - a.createdAt;
        case 'name_asc':
          return a.name.localeCompare(b.name, 'es');
      }
    });

    if (selectedFolderFilter === 'recent') {
      return list.slice(0, 12);
    }
    return list;
  }, [folderMap, projects, searchQuery, selectedFolderFilter, sortBy]);

  // Clear stale selection IDs if projects list changes
  useEffect(() => {
    const valid = new Set(projects.map((p) => p.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [projects]);

  // Close menus on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (actionMenu) {
          setActionMenu(null);
          return;
        }
        if (selectionMode) {
          setSelectionMode(false);
          setSelectedIds(new Set());
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actionMenu, selectionMode]);

  const toggleProjectSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openMenuAtAnchor = useCallback(
    (project: ProjectSummary, clientX: number, clientY: number) => {
      const menuW = 228;
      const menuH = supportsShare ? 360 : 320;
      const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, clientX));
      const top = Math.max(8, Math.min(window.innerHeight - menuH - 8, clientY));
      setActionMenu({ project, left, top });
    },
    [supportsShare],
  );

  const handleExportProject = useCallback(
    async (projectId: string) => {
      const result = await onExportNativeProject(projectId);
      if (!result) return;
      triggerFileDownload(
        result.content,
        result.filename,
        'application/json;charset=utf-8',
      );
      onNotify(`Proyecto exportado: ${result.filename}`);
    },
    [onExportNativeProject, onNotify],
  );

  const handleShareProject = useCallback(
    async (projectId: string) => {
      if (!canUseNativeShare()) return;
      const result = await onExportNativeProject(projectId);
      if (!result) return;

      const file = new File([result.content], result.filename, {
        type: 'application/json',
      });

      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${result.project.name} · ${APP_NAME}`,
            text: `Proyecto 3D de ${APP_NAME}`,
            files: [file],
          });
        } else {
          await navigator.share({
            title: `${result.project.name} · ${APP_NAME}`,
            text: `Proyecto 3D "${result.project.name}"`,
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Fallback cleanly to downloading the project file
        triggerFileDownload(
          result.content,
          result.filename,
          'application/json;charset=utf-8',
        );
        onNotify(`Archivo listo para compartir: ${result.filename}`);
      }
    },
    [onExportNativeProject, onNotify],
  );

  const handleImportFileChange = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    try {
      const text = await file.text();
      const targetFolder =
        selectedFolderFilter !== 'all' &&
        selectedFolderFilter !== 'recent' &&
        selectedFolderFilter !== 'unfiled'
          ? selectedFolderFilter
          : null;
      const res = await onImportNativeProject(text, targetFolder);
      if (!res.ok) {
        setImportError(res.error ?? 'No se pudo importar el proyecto.');
      }
    } catch {
      setImportError('No se pudo leer el archivo seleccionado.');
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderDraft.trim();
    if (!trimmed) return;
    const created = await onCreateFolder(trimmed);
    if (created) {
      setNewFolderDraft('');
      setShowNewFolderInput(false);
      setSelectedFolderFilter(created.id);
      setMobileDrawerOpen(false);
    }
  };

  const currentSectionTitle =
    selectedFolderFilter === 'all'
      ? 'Todos los proyectos'
      : selectedFolderFilter === 'recent'
        ? 'Recientes'
        : selectedFolderFilter === 'unfiled'
          ? 'Sin carpeta'
          : folderMap.get(selectedFolderFilter)?.name ?? 'Carpeta';

  const defaultNewProjectFolder =
    selectedFolderFilter !== 'all' &&
    selectedFolderFilter !== 'recent' &&
    selectedFolderFilter !== 'unfiled' &&
    folderMap.has(selectedFolderFilter)
      ? selectedFolderFilter
      : null;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#15171c] border-r border-[#262932] select-none">
      <div className="p-3.5 border-b border-[#242730] flex items-center justify-between gap-2 lg:hidden">
        <span className="text-xs font-bold text-[#f3f4f6]">Carpetas</span>
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(false)}
          className="w-9 h-9 rounded-lg hover:bg-[#22252d] text-[#9ca3af] hover:text-white flex items-center justify-center"
          aria-label="Cerrar carpetas"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-1">
        <button
          type="button"
          onClick={() => {
            setSelectedFolderFilter('all');
            setMobileDrawerOpen(false);
          }}
          className={`w-full min-h-[42px] px-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
            selectedFolderFilter === 'all'
              ? 'bg-[#262a34] text-[#5ecd6e]'
              : 'text-[#d1d5db] hover:bg-[#1e2128]'
          }`}
        >
          <span className="flex items-center gap-2.5 truncate">
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span className="truncate">Todos los proyectos</span>
          </span>
          <span className="font-mono-tabular text-[11px] opacity-70">
            {projects.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedFolderFilter('recent');
            setMobileDrawerOpen(false);
          }}
          className={`w-full min-h-[42px] px-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
            selectedFolderFilter === 'recent'
              ? 'bg-[#262a34] text-[#5ecd6e]'
              : 'text-[#d1d5db] hover:bg-[#1e2128]'
          }`}
        >
          <span className="flex items-center gap-2.5 truncate">
            <Clock className="w-4 h-4 shrink-0" />
            <span className="truncate">Recientes</span>
          </span>
          <span className="font-mono-tabular text-[11px] opacity-70">
            {Math.min(projects.length, 12)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedFolderFilter('unfiled');
            setMobileDrawerOpen(false);
          }}
          className={`w-full min-h-[42px] px-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
            selectedFolderFilter === 'unfiled'
              ? 'bg-[#262a34] text-[#5ecd6e]'
              : 'text-[#d1d5db] hover:bg-[#1e2128]'
          }`}
        >
          <span className="flex items-center gap-2.5 truncate">
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="truncate">Sin carpeta</span>
          </span>
          <span className="font-mono-tabular text-[11px] opacity-70">
            {folderCounts.unfiled}
          </span>
        </button>
      </div>

      <div className="px-3 pt-2 pb-1.5 flex items-center justify-between border-t border-[#23262f]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e95a2]">
          Carpetas
        </span>
        <button
          type="button"
          onClick={() => setShowNewFolderInput((v) => !v)}
          className="h-8 px-2 rounded-md hover:bg-[#232732] text-[#5ecd6e] text-[11px] font-semibold flex items-center gap-1"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span>Nueva</span>
        </button>
      </div>

      {showNewFolderInput && (
        <form
          onSubmit={(e) => void handleCreateFolderSubmit(e)}
          className="px-3 pb-2.5 flex items-center gap-1.5"
        >
          <input
            type="text"
            value={newFolderDraft}
            onChange={(e) => setNewFolderDraft(e.target.value)}
            placeholder="Nombre..."
            autoFocus
            className="flex-1 min-w-0 h-9 px-2.5 rounded-md bg-[#111317] border border-[#343a47] focus:border-[#5ecd6e] text-xs text-[#f3f4f6] outline-none"
          />
          <button
            type="submit"
            disabled={!newFolderDraft.trim()}
            className="h-9 px-2.5 rounded-md bg-[#5ecd6e] disabled:opacity-40 text-[#111215] text-xs font-bold"
          >
            OK
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto cad-scroll px-3 pb-4 space-y-1">
        {folders.length === 0 ? (
          <div className="py-4 px-2 text-[11px] text-[#7e8592] leading-relaxed">
            Crea carpetas para organizar modelos por cliente, clase o proyecto.
          </div>
        ) : (
          folders.map((folder) => {
            const active = selectedFolderFilter === folder.id;
            const count = folderCounts.counts.get(folder.id) ?? 0;
            return (
              <div
                key={folder.id}
                className={`group rounded-lg flex items-center gap-1 pr-1 transition-colors ${
                  active
                    ? 'bg-[#262a34] text-[#5ecd6e]'
                    : 'text-[#d1d5db] hover:bg-[#1e2128]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolderFilter(folder.id);
                    setMobileDrawerOpen(false);
                  }}
                  className="flex-1 min-w-0 min-h-[40px] px-2.5 text-xs font-medium flex items-center justify-between gap-2 text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Folder className="w-4 h-4 shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </span>
                  <span className="font-mono-tabular text-[11px] opacity-70 shrink-0">
                    {count}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingFolder(folder)}
                  title="Renombrar carpeta"
                  aria-label={`Renombrar carpeta ${folder.name}`}
                  className="w-7 h-7 rounded hover:bg-[#313643] text-[#9ca3af] hover:text-white flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingFolder(folder)}
                  title="Eliminar carpeta"
                  aria-label={`Eliminar carpeta ${folder.name}`}
                  className="w-7 h-7 rounded hover:bg-[#3a2226] text-[#e06c75] flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderProjectCard = (proj: ProjectSummary) => {
    const isSelected = selectedIds.has(proj.id);
    const isCurrentActive = proj.id === activeProjectId;
    const folderName =
      proj.folderId && folderMap.get(proj.folderId)
        ? folderMap.get(proj.folderId)!.name
        : null;
    const thumb = proj.thumbnailDataUrl || fallbackThumb;

    return (
      <article
        key={proj.id}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenuAtAnchor(proj, e.clientX, e.clientY);
        }}
        className={`group relative rounded-xl border overflow-hidden transition-all flex flex-col ${
          isSelected
            ? 'bg-[#242834] border-[#5ecd6e] ring-1 ring-[#5ecd6e]/45'
            : isCurrentActive
              ? 'bg-[#1b1e25] border-[#434a59] hover:border-[#5ecd6e]/65'
              : 'bg-[#17191f] border-[#272b34] hover:border-[#3d4454] hover:bg-[#1c1f26]'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (selectionMode) {
              toggleProjectSelected(proj.id);
            } else {
              void onOpenProject(proj.id);
            }
          }}
          className="relative aspect-[3/2] w-full bg-[#121418] overflow-hidden text-left block focus:outline-none"
        >
          <img
            src={thumb}
            alt={`Vista previa de ${proj.name}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/55 to-transparent" />

          {selectionMode && (
            <div
              className={`absolute top-2.5 left-2.5 w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-[#5ecd6e] border-[#5ecd6e] text-[#111215]'
                  : 'bg-[#111317]/80 border-[#4b5563] text-transparent'
              }`}
            >
              <Check className="w-4 h-4 stroke-[2.8]" />
            </div>
          )}
        </button>

        <div className="px-3 py-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (selectionMode) {
                toggleProjectSelected(proj.id);
              } else {
                void onOpenProject(proj.id);
              }
            }}
            className="min-w-0 flex-1 text-left focus:outline-none"
          >
            <div className="text-xs sm:text-sm font-semibold text-[#f3f4f6] truncate">
              {proj.name}
            </div>
            <div className="text-[11px] text-[#8e95a2] font-mono-tabular truncate mt-0.5">
              {proj.objectCount} obj. · {formatDateCompact(proj.updatedAt)}
              {folderName ? ` · ${folderName}` : ''}
            </div>
            {(proj.hasRecoveryDraft ||
              (isCurrentActive && hasActiveUnsavedChanges)) && (
              <div className="text-[11px] font-medium text-[#5ecd6e] truncate mt-0.5">
                Borrador de recuperación disponible
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openMenuAtAnchor(proj, rect.right - 224, rect.bottom + 6);
            }}
            aria-label={`Opciones de ${proj.name}`}
            className="w-10 h-10 rounded-lg hover:bg-[#262a34] active:bg-[#2f3440] text-[#9ca3af] hover:text-white flex items-center justify-center shrink-0 transition-colors touch-manipulation"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </article>
    );
  };

  const renderProjectRow = (proj: ProjectSummary) => {
    const isSelected = selectedIds.has(proj.id);
    const folderName =
      proj.folderId && folderMap.get(proj.folderId)
        ? folderMap.get(proj.folderId)!.name
        : 'Sin carpeta';
    const thumb = proj.thumbnailDataUrl || fallbackThumb;

    return (
      <div
        key={proj.id}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenuAtAnchor(proj, e.clientX, e.clientY);
        }}
        className={`rounded-xl border p-2 sm:p-2.5 flex items-center gap-3 transition-colors ${
          isSelected
            ? 'bg-[#242834] border-[#5ecd6e]'
            : 'bg-[#17191f] border-[#272b34] hover:border-[#3d4454] hover:bg-[#1c1f26]'
        }`}
      >
        {selectionMode && (
          <button
            type="button"
            onClick={() => toggleProjectSelected(proj.id)}
            aria-label={`Seleccionar ${proj.name}`}
            className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 ${
              isSelected
                ? 'bg-[#5ecd6e] border-[#5ecd6e] text-[#111215]'
                : 'bg-[#111317] border-[#3d4350] text-transparent'
            }`}
          >
            <Check className="w-4 h-4 stroke-[2.8]" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (selectionMode) toggleProjectSelected(proj.id);
            else void onOpenProject(proj.id);
          }}
          className="flex-1 min-w-0 flex items-center gap-3 text-left"
        >
          <img
            src={thumb}
            alt={proj.name}
            className="w-20 h-14 rounded-lg object-cover bg-[#111317] border border-[#2a2e38] shrink-0"
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs sm:text-sm font-semibold text-[#f3f4f6] truncate">
              {proj.name}
            </div>
            <div className="text-[11px] text-[#8e95a2] font-mono-tabular truncate mt-0.5">
              {proj.objectCount} obj. · {formatDateCompact(proj.updatedAt)} ·{' '}
              {folderName}
            </div>
            {proj.hasRecoveryDraft && (
              <div className="text-[11px] font-medium text-[#5ecd6e] truncate">
                Borrador de recuperación disponible
              </div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            openMenuAtAnchor(proj, rect.right - 224, rect.bottom + 6);
          }}
          aria-label={`Opciones de ${proj.name}`}
          className="w-10 h-10 rounded-lg hover:bg-[#262a34] text-[#9ca3af] hover:text-white flex items-center justify-center shrink-0"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div
      data-testid="project-gallery-screen"
      className="fixed inset-0 z-40 bg-[#121418] text-[#e4e6eb] flex flex-col overflow-hidden"
    >
      {/* Hidden native project importer */}
      <input
        ref={importInputRef}
        type="file"
        accept=".forma3d,.json,.forma3d.json,application/json"
        className="hidden"
        onChange={(e) => {
          void handleImportFileChange(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Hidden 3D model importer (OBJ + optional MTL, STL, GLB) */}
      <input
        ref={modelImportInputRef}
        type="file"
        accept=".obj,.mtl,.stl,.glb"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportModelFiles(e.target.files, defaultNewProjectFolder);
          }
          e.target.value = '';
        }}
      />

      {/* Top Studio Header */}
      <header className="shrink-0 bg-[#181a1f] border-b border-[#272b34] px-3 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="lg:hidden w-10 h-10 rounded-lg bg-[#22252d] hover:bg-[#2b2f39] border border-[#323640] text-[#e4e6eb] flex items-center justify-center shrink-0"
            aria-label="Abrir carpetas"
          >
            <Menu className="w-4 h-4 text-[#5ecd6e]" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#121418] border border-[#2b303a] flex items-center justify-center shrink-0">
              <LoopaSymbol size={26} />
            </div>
            <div className="min-w-0 space-y-0.5">
              <h1 className="sr-only">{APP_NAME}</h1>
              <LoopaWordmark className="h-[17px] sm:h-[19px] w-auto" />
              <p className="text-[11px] text-[#8e95a2] hidden sm:block truncate">
                {APP_GALLERY_SUBTITLE}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAboutModal(true)}
            title={`Información sobre ${APP_NAME}`}
            aria-label={`Información sobre ${APP_NAME}`}
            className="w-10 h-10 rounded-lg bg-[#22252d] hover:bg-[#2a2e38] border border-[#323640] text-[#cbd5e1] hover:text-[#6fe681] flex items-center justify-center shrink-0 transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectionMode((prev) => {
                if (prev) setSelectedIds(new Set());
                return !prev;
              });
            }}
            aria-pressed={selectionMode}
            className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              selectionMode
                ? 'bg-[#2c313b] border-[#5ecd6e] text-[#6fe681]'
                : 'bg-[#22252d] hover:bg-[#2a2e38] border-[#323640] text-[#e4e6eb]'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span className="hidden sm:inline">
              {selectionMode ? 'Listo' : 'Seleccionar'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            title="Importar proyecto nativo (.forma3d.json)"
            className="min-h-[40px] px-3 rounded-lg bg-[#22252d] hover:bg-[#2a2e38] border border-[#323640] text-xs font-semibold text-[#e4e6eb] flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Upload className="w-4 h-4 text-[#5ecd6e]" />
            <span className="hidden md:inline">Proyecto</span>
          </button>

          <button
            type="button"
            data-testid="gallery-import-model-btn"
            onClick={() => modelImportInputRef.current?.click()}
            title="Importar modelo 3D (.obj + .mtl o .stl) como nuevo proyecto"
            className="min-h-[40px] px-3 rounded-lg bg-[#22252d] hover:bg-[#2a2e38] border border-[#323640] text-xs font-semibold text-[#e4e6eb] flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <FileBox className="w-4 h-4 text-[#5ecd6e]" />
            <span className="hidden sm:inline">Importar modelo</span>
          </button>

          <button
            type="button"
            data-testid="gallery-new-project-btn"
            onClick={() => setShowNewProjectModal(true)}
            className="min-h-[40px] px-3.5 sm:px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] active:bg-[#49b459] text-xs font-bold text-[#111215] flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-md transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuevo proyecto</span>
          </button>
        </div>
      </header>

      {/* Main Layout: Sidebar Folders + Gallery Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Desktop Persistent Sidebar */}
        <aside className="hidden lg:block w-60 shrink-0 h-full">
          {sidebarContent}
        </aside>

        {/* Mobile / Tablet Drawer */}
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 lg:hidden flex"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setMobileDrawerOpen(false);
            }}
          >
            <div className="w-72 max-w-[85vw] h-full shadow-2xl">
              {sidebarContent}
            </div>
          </div>
        )}

        {/* Content Column */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#121418]">
          {/* Startup Crash Recovery Banner */}
          {startupRecoveryList.length > 0 && (
            <div className="shrink-0 mx-3 sm:mx-6 mt-3 rounded-xl bg-[#16261a] border border-[#5ecd6e]/45 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <RotateCcw className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                <div className="min-w-0 text-xs">
                  <span className="font-semibold text-[#f3f4f6]">
                    Recuperación disponible:
                  </span>{' '}
                  <span className="text-[#cbd5e1]">
                    {startupRecoveryList[0].project.name} (
                    {formatDateCompact(startupRecoveryList[0].savedAt)})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    void onDiscardRecoveryDraft(
                      startupRecoveryList[0].projectId,
                    )
                  }
                  className="h-8 px-2.5 rounded-md bg-[#1a2b1e] hover:bg-[#223828] text-[11px] font-semibold text-[#d1d5db]"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void onApplyRecoveryDraft(startupRecoveryList[0])
                  }
                  className="h-8 px-3 rounded-md bg-[#5ecd6e] hover:bg-[#6fe681] text-[11px] font-bold text-[#111215]"
                >
                  Recuperar ahora
                </button>
              </div>
            </div>
          )}

          {/* Procreate-style Quick Folder Strip + Breadcrumb Bar */}
          <div className="shrink-0 px-3 sm:px-6 pt-3 pb-1 space-y-2 border-b border-[#1d2028]">
            <div className="flex items-center gap-1.5 overflow-x-auto cad-scroll pb-1">
              <button
                type="button"
                onClick={() => setSelectedFolderFilter('all')}
                className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  selectedFolderFilter === 'all'
                    ? 'bg-[#262a34] border-[#5ecd6e]/65 text-[#5ecd6e]'
                    : 'bg-[#17191f] border-[#262932] text-[#cbd5e1] hover:bg-[#1e2129]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Todos</span>
                <span className="text-[10px] font-mono-tabular opacity-75">
                  {projects.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFolderFilter('unfiled')}
                className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  selectedFolderFilter === 'unfiled'
                    ? 'bg-[#262a34] border-[#5ecd6e]/65 text-[#5ecd6e]'
                    : 'bg-[#17191f] border-[#262932] text-[#cbd5e1] hover:bg-[#1e2129]'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Sin carpeta</span>
                <span className="text-[10px] font-mono-tabular opacity-75">
                  {folderCounts.unfiled}
                </span>
              </button>

              {folders.map((folder) => {
                const active = selectedFolderFilter === folder.id;
                const count = folderCounts.counts.get(folder.id) ?? 0;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setSelectedFolderFilter(folder.id)}
                    className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#262a34] border-[#5ecd6e]/65 text-[#5ecd6e]'
                        : 'bg-[#17191f] border-[#262932] text-[#cbd5e1] hover:bg-[#1e2129]'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                    <span className="max-w-[140px] truncate">{folder.name}</span>
                    <span className="text-[10px] font-mono-tabular opacity-75">
                      {count}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(true);
                  setShowNewFolderInput(true);
                }}
                className="h-8 px-2.5 rounded-lg border border-dashed border-[#343a47] hover:border-[#5ecd6e]/65 text-xs font-semibold text-[#5ecd6e] flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Carpeta</span>
              </button>
            </div>
          </div>

          {/* Filter / Search / Sort Toolbar */}
          <div className="shrink-0 px-3 sm:px-6 pt-3 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {selectedFolderFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedFolderFilter('all')}
                  className="h-8 px-2.5 rounded-lg bg-[#1d2027] hover:bg-[#262a34] border border-[#2f3440] text-xs font-semibold text-[#5ecd6e] flex items-center gap-1 shrink-0 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Todos</span>
                </button>
              )}
              <h2 className="text-base sm:text-lg font-bold text-[#f3f4f6] tracking-tight truncate">
                {currentSectionTitle}
              </h2>
              <span className="text-xs font-mono-tabular text-[#8e95a2] shrink-0">
                {filteredProjects.length} proyecto
                {filteredProjects.length === 1 ? '' : 's'}
              </span>
              {defaultNewProjectFolder && folderMap.get(defaultNewProjectFolder) && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setRenamingFolder(folderMap.get(defaultNewProjectFolder)!)
                    }
                    title="Renombrar carpeta actual"
                    className="w-7 h-7 rounded-md bg-[#1a1d24] hover:bg-[#262a34] border border-[#2c303a] text-[#cbd5e1] hover:text-white flex items-center justify-center"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeletingFolder(folderMap.get(defaultNewProjectFolder)!)
                    }
                    title="Eliminar carpeta actual"
                    className="w-7 h-7 rounded-md bg-[#1a1d24] hover:bg-[#3a2226] border border-[#2c303a] text-[#e06c75] flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 sm:flex-initial sm:w-56 min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-[#8e95a2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar proyectos..."
                  className="w-full h-9 pl-8 pr-8 rounded-lg bg-[#181a1f] border border-[#2c303a] focus:border-[#5ecd6e] text-xs text-[#f3f4f6] placeholder:text-[#6b7280] outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="w-7 h-7 absolute right-1 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-white flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="relative flex items-center">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#5ecd6e] absolute left-2.5 pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ProjectSortBy)}
                  aria-label="Ordenar proyectos"
                  className="h-9 pl-8 pr-3 rounded-lg bg-[#181a1f] border border-[#2c303a] focus:border-[#5ecd6e] text-xs font-medium text-[#e4e6eb] outline-none"
                >
                  <option value="updated_desc">Más recientes</option>
                  <option value="updated_asc">Más antiguos</option>
                  <option value="created_desc">Fecha de creación</option>
                  <option value="name_asc">Nombre (A–Z)</option>
                </select>
              </div>

              <div className="flex items-center rounded-lg bg-[#181a1f] border border-[#2c303a] p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-pressed={viewMode === 'grid'}
                  title="Vista en cuadrícula"
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-[#2a2f3a] text-[#5ecd6e]'
                      : 'text-[#8e95a2] hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  title="Vista en lista"
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#2a2f3a] text-[#5ecd6e]'
                      : 'text-[#8e95a2] hover:text-white'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable Gallery Canvas */}
          <div className="flex-1 min-h-0 overflow-y-auto cad-scroll px-3 sm:px-6 pb-24 space-y-6">
            {/* Recent Strip (only shown on "Todos los proyectos" when no search query) */}
            {selectedFolderFilter === 'all' &&
              !searchQuery.trim() &&
              recentProjects.length > 0 &&
              projects.length > 2 && (
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8e95a2]">
                      Recientes
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {recentProjects.map((proj) => renderProjectCard(proj))}
                  </div>
                </section>
              )}

            {/* Main Grid or List */}
            {!isReady && projects.length === 0 ? (
              <div className="py-16 text-center text-xs text-[#8e95a2]">
                Cargando biblioteca de proyectos...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="my-6 rounded-2xl border border-dashed border-[#2b303a] bg-[#16181e] py-14 px-6 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-xl bg-[#20242d] border border-[#2f3542] flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-[#5ecd6e]" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <div className="text-sm font-bold text-[#f3f4f6]">
                    {searchQuery.trim()
                      ? 'No hay proyectos que coincidan'
                      : 'Aún no hay proyectos aquí'}
                  </div>
                  <p className="text-xs text-[#8e95a2] leading-relaxed">
                    {searchQuery.trim()
                      ? 'Prueba con otro término de búsqueda o cambia de carpeta.'
                      : `Crea un nuevo proyecto 3D o importa un archivo de proyecto de ${APP_NAME} para empezar.`}
                  </p>
                </div>
                {!searchQuery.trim() && (
                  <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewProjectModal(true)}
                      className="min-h-[42px] px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] text-xs font-bold text-[#111215] inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>Nuevo proyecto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => modelImportInputRef.current?.click()}
                      className="min-h-[42px] px-4 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb] inline-flex items-center gap-1.5"
                    >
                      <FileBox className="w-4 h-4 text-[#5ecd6e]" />
                      <span>Importar modelo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      className="min-h-[42px] px-4 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb] inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-4 h-4 text-[#5ecd6e]" />
                      <span>Importar archivo</span>
                    </button>
                  </div>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <section className="space-y-2.5">
                {selectedFolderFilter === 'all' &&
                  !searchQuery.trim() &&
                  projects.length > 2 && (
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8e95a2]">
                      Todos
                    </h3>
                  )}
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {filteredProjects.map((proj) => renderProjectCard(proj))}
                </div>
              </section>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map((proj) => renderProjectRow(proj))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Multi-Select Batch Action Toolbar */}
      {selectionMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-45 max-w-[95vw] rounded-xl bg-[#1b1e25]/95 backdrop-blur-md border border-[#3a404f] shadow-2xl px-3.5 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[#f3f4f6] px-1 font-mono-tabular whitespace-nowrap">
            {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
          </span>
          <div className="w-px h-5 bg-[#2d323e]" />
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => setMovingProjectIds(Array.from(selectedIds))}
            className="min-h-[36px] px-2.5 rounded-lg bg-[#252932] hover:bg-[#303542] disabled:opacity-40 text-xs font-medium text-[#e4e6eb] flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderInput className="w-3.5 h-3.5 text-[#5ecd6e]" />
            <span>Mover</span>
          </button>
          <button
            type="button"
            disabled={selectedIds.size !== 1}
            onClick={() => {
              const first = Array.from(selectedIds)[0];
              if (first) void handleExportProject(first);
            }}
            className="min-h-[36px] px-2.5 rounded-lg bg-[#252932] hover:bg-[#303542] disabled:opacity-40 text-xs font-medium text-[#e4e6eb] flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#cbd5e1]" />
            <span>Exportar</span>
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => {
              const targets = projects.filter((p) => selectedIds.has(p.id));
              if (targets.length > 0) setDeletingProjects(targets);
            }}
            className="min-h-[36px] px-2.5 rounded-lg bg-[#301e22] hover:bg-[#43262b] disabled:opacity-40 text-xs font-semibold text-[#fca5a5] flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eliminar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectionMode(false);
              setSelectedIds(new Set());
            }}
            className="min-h-[36px] px-2.5 rounded-lg hover:bg-[#2a2e38] text-xs font-medium text-[#9ca3af] hover:text-white"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 pointer-events-none px-3.5 py-2 rounded-lg bg-[#1c2028]/95 border border-[#5ecd6e]/45 text-xs font-semibold text-[#f3f4f6] shadow-xl">
          {toastMessage}
        </div>
      )}

      {/* Single Project Context / Action Menu */}
      {actionMenu && (
        <div
          className="fixed inset-0 z-50"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setActionMenu(null);
          }}
        >
          <div
            role="menu"
            style={{ left: actionMenu.left, top: actionMenu.top }}
            className="fixed w-[224px] rounded-xl bg-[#1a1d24] border border-[#343a47] shadow-2xl p-1.5 space-y-0.5"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const id = actionMenu.project.id;
                setActionMenu(null);
                void onOpenProject(id);
              }}
              className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#f3f4f6] flex items-center gap-2.5 text-left"
            >
              <FolderOpen className="w-4 h-4 text-[#5ecd6e]" />
              <span>Abrir en modelador</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = actionMenu.project;
                setActionMenu(null);
                setRenamingProject(target);
              }}
              className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left"
            >
              <Edit3 className="w-4 h-4 text-[#cbd5e1]" />
              <span>Renombrar</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const id = actionMenu.project.id;
                setActionMenu(null);
                void onDuplicateProject(id);
              }}
              className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left"
            >
              <Copy className="w-4 h-4 text-[#cbd5e1]" />
              <span>Duplicar</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const id = actionMenu.project.id;
                setActionMenu(null);
                setMovingProjectIds([id]);
              }}
              className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left"
            >
              <FolderInput className="w-4 h-4 text-[#cbd5e1]" />
              <span>Mover a carpeta</span>
            </button>

            {actionMenu.project.folderId &&
              folderMap.has(actionMenu.project.folderId) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = actionMenu.project.id;
                    setActionMenu(null);
                    void onMoveProjectsToFolder([id], null);
                  }}
                  className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left"
                >
                  <FolderMinus className="w-4 h-4 text-[#f59e0b]" />
                  <span>Sacar de carpeta</span>
                </button>
              )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const id = actionMenu.project.id;
                setActionMenu(null);
                void handleExportProject(id);
              }}
              className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left"
            >
              <Download className="w-4 h-4 text-[#34d399]" />
              <span>Exportar proyecto</span>
            </button>

            {onOpenTimelapse && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = actionMenu.project;
                  setActionMenu(null);
                  onOpenTimelapse(target);
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left"
              >
                <Film className="w-4 h-4 text-[#5ecd6e]" />
                <span>Ver Timelapse</span>
              </button>
            )}

            {supportsShare && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = actionMenu.project.id;
                  setActionMenu(null);
                  void handleShareProject(id);
                }}
                className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#252932] text-xs font-medium text-[#e4e6eb] flex items-center gap-2.5 text-left"
              >
                <Share2 className="w-4 h-4 text-[#38bdf8]" />
                <span>Compartir</span>
              </button>
            )}

            <div className="my-1 border-t border-[#272b34]" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = actionMenu.project;
                setActionMenu(null);
                setDeletingProjects([target]);
              }}
              className="w-full min-h-[40px] px-2.5 rounded-lg hover:bg-[#332024] text-xs font-semibold text-[#fca5a5] flex items-center gap-2.5 text-left"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      )}

      {/* Gallery Modals */}
      {showNewProjectModal && (
        <NewProjectModal
          folders={folders}
          defaultFolderId={defaultNewProjectFolder}
          onClose={() => setShowNewProjectModal(false)}
          onCreate={async ({ name, templateId, folderId }) => {
            const created = await onCreateProject(name, templateId, folderId);
            if (created) {
              setShowNewProjectModal(false);
            }
          }}
        />
      )}

      {renamingProject && (
        <RenameModal
          title="Renombrar proyecto"
          label="Nombre del proyecto"
          initialValue={renamingProject.name}
          onConfirm={async (nextName) => {
            const ok = await onRenameProject(renamingProject.id, nextName);
            if (ok) setRenamingProject(null);
          }}
          onCancel={() => setRenamingProject(null)}
        />
      )}

      {renamingFolder && (
        <RenameModal
          title="Renombrar carpeta"
          label="Nombre de la carpeta"
          initialValue={renamingFolder.name}
          onConfirm={async (nextName) => {
            const ok = await onRenameFolder(renamingFolder.id, nextName);
            if (ok) setRenamingFolder(null);
          }}
          onCancel={() => setRenamingFolder(null)}
        />
      )}

      {deletingProjects.length > 0 && (
        <DeleteProjectsModal
          projectNames={deletingProjects.map((p) => p.name)}
          onConfirm={async () => {
            const ids = deletingProjects.map((p) => p.id);
            const ok = await onDeleteProjects(ids);
            if (ok) {
              setDeletingProjects([]);
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const id of ids) next.delete(id);
                return next;
              });
            }
          }}
          onCancel={() => setDeletingProjects([])}
        />
      )}

      {deletingFolder && (
        <DeleteFolderModal
          folder={deletingFolder}
          otherFolders={folders.filter((f) => f.id !== deletingFolder.id)}
          containedProjectCount={folderCounts.counts.get(deletingFolder.id) ?? 0}
          onConfirm={async (resolution) => {
            const ok = await onDeleteFolder(deletingFolder.id, resolution);
            if (ok) {
              if (selectedFolderFilter === deletingFolder.id) {
                setSelectedFolderFilter('all');
              }
              setDeletingFolder(null);
            }
          }}
          onCancel={() => setDeletingFolder(null)}
        />
      )}

      {movingProjectIds && (
        <MoveToFolderModal
          folders={folders}
          projectCount={movingProjectIds.length}
          currentFolderId={
            movingProjectIds.length === 1
              ? projects.find((p) => p.id === movingProjectIds[0])?.folderId ?? null
              : null
          }
          onCreateFolder={onCreateFolder}
          onConfirm={async (targetFolderId) => {
            const ok = await onMoveProjectsToFolder(
              movingProjectIds,
              targetFolderId,
            );
            if (ok) setMovingProjectIds(null);
          }}
          onCancel={() => setMovingProjectIds(null)}
        />
      )}

      {showAboutModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setShowAboutModal(false);
          }}
        >
          <div className="w-full max-w-sm bg-[#181a1f] border border-[#323640] rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6fe681]">
                Información de la aplicación
              </span>
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#121418] border border-[#272b34] py-6 px-4 flex flex-col items-center text-center space-y-3">
              <LoopaFullLogo variant="vertical" className="w-44 h-auto" />
              <div className="text-xs font-semibold text-[#e4e6eb]">
                {APP_NAME} · {APP_TAGLINE}
              </div>
              <span className="text-[11px] font-mono-tabular px-2.5 py-0.5 rounded-md bg-[#16261a] border border-[#5ecd6e]/40 text-[#7def8e]">
                Versión {APP_VERSION}
              </span>
            </div>

            <p className="text-xs text-[#a1a7b3] leading-relaxed text-center">
              {APP_DESCRIPTION}
            </p>

            <button
              type="button"
              onClick={() => setShowAboutModal(false)}
              className="w-full min-h-[40px] rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] text-xs font-bold text-[#111215] transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {importError && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setImportError(null);
          }}
        >
          <div className="w-full max-w-sm bg-[#181a1f] border border-[#4a2b30] rounded-xl p-4 space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-[#fca5a5]">
              Error al importar proyecto
            </h3>
            <p className="text-xs text-[#cbd5e1] leading-relaxed">
              {importError}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setImportError(null)}
                className="min-h-[38px] px-4 rounded-lg bg-[#252932] hover:bg-[#2f3440] text-xs font-semibold text-white"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
