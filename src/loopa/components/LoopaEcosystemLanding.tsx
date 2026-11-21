/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Box, Sparkles, Grid3X3, Palette, FolderOpen, Plus, Upload, Cpu, Layers, ShieldCheck, ArrowRight, Film, Trash2, Copy, Edit2, Search } from 'lucide-react';
import { LoopaSymbol } from './BrandLogo';
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
  onOpenMaterials: () => void;
  onOpenUVs: () => void;
  onOpenTimelapse: (proj: ProjectSummary) => void;
  onNotify: (msg: string) => void;
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
  onOpenMaterials,
  onOpenUVs,
  onOpenTimelapse,
  onNotify,
}: LoopaEcosystemLandingProps) {
  // Default tab is 'gallery' so the user enters directly to the project gallery suite
  const [selectedTab, setSelectedTab] = useState<'gallery' | 'ecosystem'>('gallery');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = selectedFolderId === null ? true : p.folderId === selectedFolderId;
    return matchesSearch && matchesFolder;
  });

  return (
    <div className="absolute inset-0 z-50 bg-[#0d0f14] text-white flex flex-col overflow-y-auto select-none">
      
      {/* Top Suite Navbar */}
      <header className="sticky top-0 z-25 bg-[#12141c]/95 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5ecd6e] to-[#22c55e] flex items-center justify-center shadow-lg shadow-[#5ecd6e]/20">
            <LoopaSymbol className="w-6 h-6 text-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-wider text-white">LOOPA SUITE</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#5ecd6e]/20 text-[#5ecd6e] border border-[#5ecd6e]/30">
                CORE v1.9
              </span>
            </div>
            <p className="text-xs text-white/50">Ecosistema 3D profesional y gestor de proyectos</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-[#181b25] p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setSelectedTab('gallery')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedTab === 'gallery'
                  ? 'bg-[#5ecd6e] text-black shadow-md shadow-[#5ecd6e]/20'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" /> Galería de Proyectos ({projects.length})
            </button>
            <button
              onClick={() => setSelectedTab('ecosystem')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedTab === 'ecosystem'
                  ? 'bg-[#5ecd6e] text-black shadow-md shadow-[#5ecd6e]/20'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> Ecosistema & Módulos
            </button>
          </div>

          <button
            onClick={onCreateProjectModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5ecd6e] hover:bg-[#5ecd6e]/90 text-black text-xs font-bold shadow-lg shadow-[#5ecd6e]/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Nuevo Proyecto
          </button>
        </div>
      </header>

      {/* Main Suite Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col gap-6">

        {selectedTab === 'gallery' ? (
          <>
            {/* Gallery Control Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[#151821] border border-white/10 rounded-2xl p-4 shadow-lg">
              
              {/* Search & Folders */}
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar proyectos en la galería..."
                    className="w-full bg-[#12141c] border border-white/10 focus:border-[#5ecd6e] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-white/30 outline-none transition-colors"
                  />
                </div>

                <div className="flex items-center gap-1 bg-[#12141c] border border-white/10 rounded-xl p-1">
                  <button
                    onClick={() => setSelectedFolderId(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedFolderId === null ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Todos
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFolderId(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedFolderId === f.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Import 3D button */}
              <div className="flex items-center gap-2">
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
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all border border-white/10"
                >
                  <Upload className="w-4 h-4" /> Importar Modelo 3D
                </button>
              </div>
            </div>

            {/* Recovery Drafts alert if any */}
            {startupRecoveryList.length > 0 && onApplyRecoveryDraft && onDiscardRecoveryDraft && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-amber-300">Borrador de recuperación disponible</h4>
                  <p className="text-xs text-white/60">Se detectó una sesión previa interrumpida que puedes recuperar.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onApplyRecoveryDraft(startupRecoveryList[0])}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors"
                  >
                    Recuperar
                  </button>
                  <button
                    onClick={() => onDiscardRecoveryDraft(startupRecoveryList[0].projectId)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {/* Projects Grid */}
            {filteredProjects.length === 0 ? (
              <div className="bg-[#151821] border border-white/10 rounded-3xl p-16 text-center flex flex-col items-center justify-center gap-4 shadow-xl my-auto">
                <FolderOpen className="w-12 h-12 text-white/30" />
                <h3 className="text-lg font-bold text-white">No se encontraron proyectos</h3>
                <p className="text-xs text-white/50 max-w-sm">
                  Crea un nuevo proyecto en blanco o importa un archivo 3D (.obj, .stl, .glb) para comenzar.
                </p>
                <button
                  onClick={onCreateProjectModal}
                  className="px-5 py-2.5 rounded-xl bg-[#5ecd6e] text-black text-xs font-bold mt-2 shadow-lg shadow-[#5ecd6e]/20"
                >
                  Crear Proyecto Nuevo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredProjects.map((proj) => {
                  const isSelected = selectedProjectIds.has(proj.id);
                  const isEditing = editingProjectId === proj.id;

                  return (
                    <div
                      key={proj.id}
                      onClick={() => void onOpenProject(proj.id)}
                      className={`bg-[#151821] hover:bg-[#1a1f2b] border rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between gap-5 group shadow-xl relative ${
                        isSelected ? 'border-[#5ecd6e] ring-1 ring-[#5ecd6e]' : 'border-white/10 hover:border-[#5ecd6e]/40'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/40 font-mono">
                            {new Date(proj.updatedAt).toLocaleDateString()}
                          </span>
                          <span className="text-[10px] bg-white/5 px-2.5 py-0.5 rounded text-white/70 font-medium">
                            {proj.objectCount} obj
                          </span>
                        </div>

                        {isEditing ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              className="w-full bg-[#12141c] border border-[#5ecd6e] rounded px-2 py-1 text-xs text-white outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editNameValue.trim()) {
                                    onRenameProject(proj.id, editNameValue.trim());
                                  }
                                  setEditingProjectId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingProjectId(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (editNameValue.trim()) {
                                  onRenameProject(proj.id, editNameValue.trim());
                                }
                                setEditingProjectId(null);
                              }}
                              className="px-2 py-1 bg-[#5ecd6e] text-black text-xs font-bold rounded"
                            >
                              OK
                            </button>
                          </div>
                        ) : (
                          <h4 className="text-base font-bold text-white group-hover:text-[#5ecd6e] transition-colors truncate">
                            {proj.name}
                          </h4>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-white/10">
                        <span className="text-xs text-[#5ecd6e] font-semibold flex items-center gap-1">
                          Abrir Proyecto <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                        
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setEditingProjectId(proj.id);
                              setEditNameValue(proj.name);
                            }}
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Renombrar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDuplicateProject(proj.id)}
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Duplicar"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenTimelapse(proj)}
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Timelapse"
                          >
                            <Film className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteProjects([proj.id])}
                            className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Ecosystem & Modules Suite Overview Tab */
          <div className="space-y-8 animate-fadeIn">
            <div className="bg-gradient-to-r from-[#18231c] via-[#151c24] to-[#12141c] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="space-y-4 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5ecd6e]/10 border border-[#5ecd6e]/30 text-[#5ecd6e] text-xs font-semibold">
                  <Cpu className="w-3.5 h-3.5" /> LOOPA CORE Arquitectura Central
                </div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight">
                  Ecosistema de Aplicaciones 3D Especializadas
                </h2>
                <p className="text-sm text-white/60 leading-relaxed">
                  LOOPA CORE gestiona un único proyecto centralizado. Selecciona cualquier módulo especializado para trabajar con las mallas, materiales y escenas sin pérdida de datos.
                </p>
              </div>
              <div className="bg-[#12141c] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-3 min-w-[240px]">
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Módulos Activos</span>
                  <span className="text-[#5ecd6e] font-bold">4 / 4</span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Estado del Core</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Sincronizado</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* LOOPA Modeler */}
              <div 
                onClick={onOpenModeler}
                className="bg-[#151821] hover:bg-[#1a1f2b] border border-emerald-500/30 hover:border-emerald-500/70 rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-xl group"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                    <Box className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">LOOPA Modeler</h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Modelado poligonal 3D, extrusiones, biseles, cortes de bucle y modificadores.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                  <span>Abrir Modeler</span> <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* LOOPA Sculpt */}
              <div 
                onClick={() => onNotify('LOOPA Sculpt está integrado en CORE y listo para escultura digital.')}
                className="bg-[#151821] hover:bg-[#1a1f2b] border border-white/10 hover:border-purple-500/40 rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-xl group"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">LOOPA Sculpt</h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Escultura digital de alta densidad, arcilla, inflado, suavizado y simetría.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-purple-400 font-semibold">
                  <span>Explorar Módulo</span> <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* LOOPA UVs */}
              <div 
                onClick={onOpenUVs}
                className="bg-[#151821] hover:bg-[#1a1f2b] border border-white/10 hover:border-sky-500/40 rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-xl group"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4 group-hover:scale-110 transition-transform">
                    <Grid3X3 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">LOOPA UVs</h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Desarrollo de mapas UV, marcado de costuras y visor 2D interactivo.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-sky-400 font-semibold">
                  <span>Abrir UVs</span> <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* LOOPA Materiales */}
              <div 
                onClick={onOpenMaterials}
                className="bg-[#151821] hover:bg-[#1a1f2b] border border-white/10 hover:border-amber-500/40 rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-xl group"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
                    <Palette className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">LOOPA Materiales</h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Administración de materiales PBR, color base, rugosidad y texturas.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-amber-400 font-semibold">
                  <span>Abrir Materiales</span> <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#12141c] px-6 py-4 text-center text-xs text-white/40">
        LOOPA Suite &copy; 2026 — Arquitectura Central LOOPA CORE
      </footer>

    </div>
  );
}
