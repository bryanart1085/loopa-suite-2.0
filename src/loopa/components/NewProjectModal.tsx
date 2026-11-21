import React, { useEffect, useRef, useState } from 'react';
import { Folder, Plus, X } from 'lucide-react';
import {
  generateTemplateThumbnailDataUrl,
  PROJECT_TEMPLATE_META,
} from '../core/project/thumbnail';
import { ProjectFolder, ProjectTemplateId } from '../core/project/types';

interface NewProjectModalProps {
  folders: ProjectFolder[];
  defaultFolderId?: string | null;
  onClose: () => void;
  onCreate: (params: {
    name: string;
    templateId: ProjectTemplateId;
    folderId: string | null;
  }) => Promise<void> | void;
}

const TEMPLATE_ORDER: ProjectTemplateId[] = [
  'cube',
  'uv_sphere',
  'plane',
  'empty',
];

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  folders,
  defaultFolderId = null,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<ProjectTemplateId>('cube');
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const suggestedName =
    templateId === 'empty'
      ? 'Escena Vacía'
      : PROJECT_TEMPLATE_META[templateId].label;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim() || suggestedName,
        templateId,
        folderId,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-[#181a1f] border border-[#323640] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#272b34] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#f3f4f6] tracking-tight">
              Nuevo proyecto
            </h2>
            <p className="text-xs text-[#9ca3af]">
              Elige una plantilla inicial con escena y geometría editable real
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-10 h-10 rounded-lg hover:bg-[#252932] text-[#9ca3af] hover:text-white flex items-center justify-center transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="p-4 sm:p-5 space-y-5 overflow-y-auto cad-scroll"
        >
          {/* Project Name & Folder */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 space-y-1.5">
              <span className="block text-xs font-semibold text-[#cbd5e1]">
                Nombre del proyecto
              </span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={suggestedName}
                maxLength={80}
                className="w-full h-11 px-3.5 rounded-lg bg-[#111317] border border-[#2f333d] focus:border-[#5ecd6e] text-sm text-[#f3f4f6] placeholder:text-[#6b7280] outline-none transition-colors"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#cbd5e1]">
                Carpeta
              </span>
              <div className="relative">
                <Folder className="w-4 h-4 text-[#9ca3af] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={folderId ?? ''}
                  onChange={(e) =>
                    setFolderId(e.target.value ? e.target.value : null)
                  }
                  className="w-full h-11 pl-9 pr-3 rounded-lg bg-[#111317] border border-[#2f333d] focus:border-[#5ecd6e] text-xs font-medium text-[#e4e6eb] outline-none appearance-none"
                >
                  <option value="">Sin carpeta</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          {/* 4 Initial Real 3D Templates */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#cbd5e1]">
              Plantilla inicial
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {TEMPLATE_ORDER.map((id) => {
                const meta = PROJECT_TEMPLATE_META[id];
                const active = templateId === id;
                const previewSrc = generateTemplateThumbnailDataUrl(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTemplateId(id)}
                    aria-pressed={active}
                    className={`group text-left rounded-xl border overflow-hidden transition-all touch-manipulation ${
                      active
                        ? 'bg-[#252932] border-[#5ecd6e] ring-1 ring-[#5ecd6e]/40'
                        : 'bg-[#14161b] border-[#292d36] hover:border-[#3e4554] hover:bg-[#1a1d24]'
                    }`}
                  >
                    <div className="aspect-[3/2] w-full bg-[#111317] overflow-hidden border-b border-[#252932]">
                      <img
                        src={previewSrc}
                        alt={meta.label}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                    <div className="p-2.5 space-y-0.5">
                      <div
                        className={`text-xs font-bold ${
                          active ? 'text-[#5ecd6e]' : 'text-[#f3f4f6]'
                        }`}
                      >
                        {meta.label}
                      </div>
                      <div className="text-[11px] leading-snug text-[#8e95a2] line-clamp-2">
                        {meta.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-[#272b34] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[42px] px-4 rounded-lg bg-[#22252d] hover:bg-[#2c303a] border border-[#333844] text-xs font-semibold text-[#e4e6eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] px-5 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] active:bg-[#45ae55] disabled:opacity-60 text-xs font-bold text-[#111215] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{submitting ? 'Creando...' : 'Crear proyecto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
