/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Sparkles, Grid3X3, Palette, CheckCircle2, Layers, Cpu, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { LoopaSymbol } from './BrandLogo';

interface LoopaEcosystemHubProps {
  isOpen: boolean;
  onClose: () => void;
  activeProjectId: string;
  projectName: string;
  objectCount: number;
  vertexCount: number;
  faceCount: number;
  onOpenModeler: () => void;
  onOpenMaterials: () => void;
  onOpenUVs: () => void;
  onToast: (msg: string) => void;
}

export function LoopaEcosystemHub({
  isOpen,
  onClose,
  activeProjectId,
  projectName,
  objectCount,
  vertexCount,
  faceCount,
  onOpenModeler,
  onOpenMaterials,
  onOpenUVs,
  onToast,
}: LoopaEcosystemHubProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-[#12141c] border border-white/10 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#181b25]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5ecd6e] to-[#22c55e] flex items-center justify-center shadow-lg shadow-[#5ecd6e]/20">
              <LoopaSymbol className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">LOOPA ECOSYSTEM</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#5ecd6e]/20 text-[#5ecd6e] border border-[#5ecd6e]/30">
                  CORE ACTIVE v1.9
                </span>
              </div>
              <p className="text-xs text-white/50">Arquitectura unificada para aplicaciones 3D especializadas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Active Session Status Card */}
          <div className="bg-gradient-to-r from-[#1a1f2c] to-[#141822] border border-white/10 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#5ecd6e]/10 border border-[#5ecd6e]/30 flex items-center justify-center text-[#5ecd6e]">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[#5ecd6e] font-semibold">Sesión Activa en LOOPA CORE</span>
                <h3 className="text-base font-bold text-white mt-0.5">{projectName || 'Proyecto sin título'}</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  ID: {activeProjectId} · {objectCount} objetos · {vertexCount.toLocaleString()} vértices · {faceCount.toLocaleString()} caras
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" /> Estado Sincronizado
              </span>
            </div>
          </div>

          {/* Ecosystem Apps Grid */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Aplicaciones del Ecosistema</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* LOOPA Modeler */}
              <div className="bg-[#181b25] border border-emerald-500/30 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/60 transition-all">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Box className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Operativo
                    </span>
                  </div>
                  <h5 className="text-base font-bold text-white mb-1">LOOPA Modeler</h5>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Modelado poligonal completo, extrusiones, biseles, cortes de bucle, modificadores y primitivas 3D con motor Three.js.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Conectado a Core
                  </span>
                  <button
                    onClick={() => {
                      onOpenModeler();
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    Abrir Modeler <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* LOOPA Sculpt */}
              <div className="bg-[#181b25] border border-white/10 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-white/20 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Próxima Versión (CORE Ready)
                    </span>
                  </div>
                  <h5 className="text-base font-bold text-white mb-1">LOOPA Sculpt</h5>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Escultura digital de alta densidad, pinceles dinámicos de arcilla, inflado, suavizado y simetría X/Y/Z sobre el mismo proyecto.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-white/40 font-medium">Comparte meshData en CORE</span>
                  <button
                    onClick={() => onToast('LOOPA Sculpt está preparado en CORE y se lanzará en la siguiente fase.')}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                  >
                    Previsualizar
                  </button>
                </div>
              </div>

              {/* LOOPA UVs */}
              <div className="bg-[#181b25] border border-white/10 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-white/20 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
                      <Grid3X3 className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      Integrado
                    </span>
                  </div>
                  <h5 className="text-base font-bold text-white mb-1">LOOPA UVs</h5>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Desarrollo de mapas UV, marcado de costuras (seams), unwrapping y visor 2D interactivo con sincronización 3D en tiempo real.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-sky-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Disponible
                  </span>
                  <button
                    onClick={() => {
                      onOpenUVs();
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-sky-500/20"
                  >
                    Abrir UVs <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* LOOPA Materiales */}
              <div className="bg-[#181b25] border border-white/10 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-white/20 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Palette className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Integrado
                    </span>
                  </div>
                  <h5 className="text-base font-bold text-white mb-1">LOOPA Materiales</h5>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Creación y administración de materiales PBR, rugosidad, metalicidad, color base y asignación por caras o objetos.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Disponible
                  </span>
                  <button
                    onClick={() => {
                      onOpenMaterials();
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    Abrir Materiales <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Architecture info footer */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-4 flex items-center gap-3 text-xs text-white/50">
            <Layers className="w-5 h-5 text-[#5ecd6e] shrink-0" />
            <div>
              <span className="text-white/80 font-medium">Ventajas de LOOPA CORE:</span> Todas las aplicaciones del ecosistema operan sobre el mismo modelo de datos en memoria y persistencia IndexedDB, eliminando la necesidad de reexportar o sincronizar archivos manualmente.
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#181b25] flex items-center justify-between text-xs text-white/40">
          <span>LOOPA Ecosystem Architecture v1.9</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Cerrar Hub
          </button>
        </div>

      </div>
    </div>
  );
}
