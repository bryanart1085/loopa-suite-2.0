import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Folder,
  FolderPlus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  DeleteFolderResolution,
  ProjectFolder,
  ProjectRecoveryRecord,
} from '../core/project/types';

/* ============================================================================
 * Return To Gallery Confirmation (Unsaved Changes Guard)
 * ========================================================================== */

interface ReturnToGalleryModalProps {
  projectName: string;
  saving?: boolean;
  onSaveAndExit: () => void;
  onDiscardAndExit: () => void;
  onCancel: () => void;
}

export const ReturnToGalleryModal: React.FC<ReturnToGalleryModalProps> = ({
  projectName,
  saving = false,
  onSaveAndExit,
  onDiscardAndExit,
  onCancel,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-[#181a1f] border border-[#323640] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#272b34] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#5ecd6e]" />
            <h2 className="text-sm font-bold text-[#f3f4f6]">
              Cambios sin guardar
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="w-9 h-9 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center"
            aria-label="Cancelar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs leading-relaxed text-[#cbd5e1]">
            El proyecto <strong className="text-white">{projectName}</strong> tiene
            modificaciones pendientes. ¿Deseas guardarlas y actualizar la
            miniatura antes de volver a la galería?
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onDiscardAndExit}
              disabled={saving}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#281b1e] hover:bg-[#382328] border border-[#4f2e34] text-xs font-semibold text-[#fca5a5]"
            >
              Salir sin guardar
            </button>
            <button
              type="button"
              onClick={onSaveAndExit}
              disabled={saving}
              className="min-h-[42px] px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] text-xs font-bold text-[#111215] flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar y salir'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * Recovery Prompt Modal
 * ========================================================================== */

interface RecoveryPromptModalProps {
  record: ProjectRecoveryRecord;
  onRecover: () => void;
  onDiscardDraft: () => void;
  onCancel: () => void;
}

export const RecoveryPromptModal: React.FC<RecoveryPromptModalProps> = ({
  record,
  onRecover,
  onDiscardDraft,
  onCancel,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-[#181a1f] border border-[#323640] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#272b34] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[#5ecd6e]" />
            <h2 className="text-sm font-bold text-[#f3f4f6]">
              Recuperación de proyecto
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs leading-relaxed text-[#cbd5e1]">
            Se encontró una copia de recuperación reciente para{' '}
            <strong className="text-white">{record.project.name}</strong>{' '}
            guardada el{' '}
            <span className="font-mono-tabular text-[#5ecd6e]">
              {new Date(record.savedAt).toLocaleString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            .
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={onDiscardDraft}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb]"
            >
              Abrir versión guardada
            </button>
            <button
              type="button"
              onClick={onRecover}
              className="min-h-[42px] px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] text-xs font-bold text-[#111215] flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Recuperar borrador</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * Rename Modal (Project or Folder)
 * ========================================================================== */

interface RenameModalProps {
  title: string;
  label: string;
  initialValue: string;
  confirmLabel?: string;
  onConfirm: (nextName: string) => Promise<void> | void;
  onCancel: () => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  title,
  label,
  initialValue,
  confirmLabel = 'Guardar nombre',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-[#181a1f] border border-[#323640] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#272b34] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#f3f4f6]">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-[#cbd5e1]">
              {label}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={80}
              className="w-full h-11 px-3 rounded-lg bg-[#111317] border border-[#2f333d] focus:border-[#5ecd6e] text-sm text-[#f3f4f6] outline-none"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="min-h-[40px] px-3.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="min-h-[40px] px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] disabled:opacity-50 text-xs font-bold text-[#111215]"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ============================================================================
 * Delete Projects Confirmation Modal
 * ========================================================================== */

interface DeleteProjectsModalProps {
  projectNames: string[];
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export const DeleteProjectsModal: React.FC<DeleteProjectsModalProps> = ({
  projectNames,
  onConfirm,
  onCancel,
}) => {
  const [busy, setBusy] = useState(false);
  const count = projectNames.length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-[#181a1f] border border-[#323640] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#272b34] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-[#f87171]" />
            <h2 className="text-sm font-bold text-[#f3f4f6]">
              {count === 1 ? 'Eliminar proyecto' : `Eliminar ${count} proyectos`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-9 h-9 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs leading-relaxed text-[#cbd5e1]">
            {count === 1 ? (
              <>
                ¿Seguro que quieres eliminar{' '}
                <strong className="text-white">{projectNames[0]}</strong>? Esta
                acción borrará el proyecto y su miniatura de este dispositivo.
              </>
            ) : (
              <>
                ¿Seguro que quieres eliminar los{' '}
                <strong className="text-white">{count}</strong> proyectos
                seleccionados? Esta acción no se puede deshacer.
              </>
            )}
          </p>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                }
              }}
              className="min-h-[42px] px-4 rounded-lg bg-[#dc2626] hover:bg-[#ef4444] disabled:opacity-60 text-xs font-bold text-white flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{busy ? 'Eliminando...' : 'Eliminar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * Delete Folder Confirmation Modal (Safe Project Preservation)
 * ========================================================================== */

interface DeleteFolderModalProps {
  folder: ProjectFolder;
  otherFolders: ProjectFolder[];
  containedProjectCount: number;
  onConfirm: (resolution: DeleteFolderResolution) => Promise<void> | void;
  onCancel: () => void;
}

export const DeleteFolderModal: React.FC<DeleteFolderModalProps> = ({
  folder,
  otherFolders,
  containedProjectCount,
  onConfirm,
  onCancel,
}) => {
  const [mode, setMode] = useState<'unfile' | 'move'>('unfile');
  const [targetFolderId, setTargetFolderId] = useState<string>(
    otherFolders[0]?.id ?? '',
  );
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-[#181a1f] border border-[#323640] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#272b34] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-[#f87171]" />
            <h2 className="text-sm font-bold text-[#f3f4f6]">
              Eliminar carpeta
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-9 h-9 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs leading-relaxed text-[#cbd5e1]">
            ¿Eliminar la carpeta <strong className="text-white">{folder.name}</strong>?
            {containedProjectCount > 0 ? (
              <>
                {' '}
                Contiene{' '}
                <strong className="text-[#5ecd6e]">
                  {containedProjectCount} proyecto
                  {containedProjectCount === 1 ? '' : 's'}
                </strong>
                . Ningún proyecto será eliminado.
              </>
            ) : (
              ' La carpeta está vacía.'
            )}
          </p>

          {containedProjectCount > 0 && (
            <div className="space-y-2 rounded-lg bg-[#121418] border border-[#272b34] p-3">
              <label className="flex items-center gap-2.5 text-xs text-[#e4e6eb] cursor-pointer">
                <input
                  type="radio"
                  name="folderDelMode"
                  checked={mode === 'unfile'}
                  onChange={() => setMode('unfile')}
                  className="accent-[#5ecd6e]"
                />
                <span>Mover proyectos a &ldquo;Sin carpeta&rdquo;</span>
              </label>

              {otherFolders.length > 0 && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2.5 text-xs text-[#e4e6eb] cursor-pointer">
                    <input
                      type="radio"
                      name="folderDelMode"
                      checked={mode === 'move'}
                      onChange={() => setMode('move')}
                      className="accent-[#5ecd6e]"
                    />
                    <span>Mover a otra carpeta:</span>
                  </label>
                  {mode === 'move' && (
                    <select
                      value={targetFolderId}
                      onChange={(e) => setTargetFolderId(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-md bg-[#1a1d24] border border-[#323640] text-xs text-[#f3f4f6] outline-none"
                    >
                      {otherFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="min-h-[42px] px-3.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || (mode === 'move' && !targetFolderId)}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm(
                    mode === 'move' && targetFolderId
                      ? { mode: 'move', targetFolderId }
                      : { mode: 'unfile' },
                  );
                } finally {
                  setBusy(false);
                }
              }}
              className="min-h-[42px] px-4 rounded-lg bg-[#dc2626] hover:bg-[#ef4444] disabled:opacity-60 text-xs font-bold text-white"
            >
              {busy ? 'Eliminando...' : 'Eliminar carpeta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * Move Projects To Folder Modal
 * ========================================================================== */

interface MoveToFolderModalProps {
  folders: ProjectFolder[];
  projectCount: number;
  currentFolderId?: string | null;
  onCreateFolder: (name: string) => Promise<ProjectFolder | null>;
  onConfirm: (folderId: string | null) => Promise<void> | void;
  onCancel: () => void;
}

export const MoveToFolderModal: React.FC<MoveToFolderModalProps> = ({
  folders,
  projectCount,
  currentFolderId = null,
  onCreateFolder,
  onConfirm,
  onCancel,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    currentFolderId,
  );
  const [newFolderName, setNewFolderName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreateAndSelect = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await onCreateFolder(trimmed);
      if (created) {
        setSelectedFolderId(created.id);
        setNewFolderName('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-[#181a1f] border border-[#323640] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-4 py-3.5 border-b border-[#272b34] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-[#5ecd6e]" />
            <h2 className="text-sm font-bold text-[#f3f4f6]">
              Mover {projectCount === 1 ? 'proyecto' : `${projectCount} proyectos`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto cad-scroll">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nueva carpeta..."
              className="flex-1 h-10 px-3 rounded-lg bg-[#111317] border border-[#2f333d] focus:border-[#5ecd6e] text-xs text-[#f3f4f6] outline-none"
            />
            <button
              type="button"
              disabled={!newFolderName.trim() || busy}
              onClick={() => void handleCreateAndSelect()}
              className="h-10 px-3 rounded-lg bg-[#252932] hover:bg-[#303541] border border-[#373d4a] disabled:opacity-50 text-xs font-semibold text-[#f3f4f6] flex items-center gap-1.5 shrink-0"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#5ecd6e]" />
              <span>Crear</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setSelectedFolderId(null)}
              className={`w-full min-h-[42px] px-3 rounded-lg border text-xs font-medium flex items-center gap-2.5 text-left transition-colors ${
                selectedFolderId === null
                  ? 'bg-[#2c313b] border-[#5ecd6e] text-[#5ecd6e]'
                  : 'bg-[#13151a] border-[#262a33] text-[#e4e6eb] hover:bg-[#1e2128]'
              }`}
            >
              <Folder className="w-4 h-4 opacity-70" />
              <span>Sin carpeta</span>
            </button>

            {folders.map((folder) => {
              const selected = selectedFolderId === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`w-full min-h-[42px] px-3 rounded-lg border text-xs font-medium flex items-center gap-2.5 text-left transition-colors ${
                    selected
                      ? 'bg-[#2c313b] border-[#5ecd6e] text-[#5ecd6e]'
                      : 'bg-[#13151a] border-[#262a33] text-[#e4e6eb] hover:bg-[#1e2128]'
                  }`}
                >
                  <Folder className="w-4 h-4" />
                  <span className="truncate">{folder.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#272b34] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[40px] px-3.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343946] text-xs font-semibold text-[#e4e6eb]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(selectedFolderId);
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-[40px] px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] disabled:opacity-60 text-xs font-bold text-[#111215]"
          >
            {busy ? 'Moviendo...' : 'Mover aquí'}
          </button>
        </div>
      </div>
    </div>
  );
};
