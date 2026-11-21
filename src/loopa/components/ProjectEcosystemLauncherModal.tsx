/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Sparkles, Grid3X3, Palette, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { LoopaSymbol } from './BrandLogo';
import { ProjectSummary } from '../core/project/types';

interface ProjectEcosystemLauncherModalProps {
  project: ProjectSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onLaunchApp: (appId: 'modeler' | 'sculpt' | 'uvs' | 'materials') => void;
}

export function ProjectEcosystemLauncherModal({
  project,
  isOpen,
  onClose,
  onLaunchApp,
}: ProjectEcosystemLauncherModalProps) {
  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-[#12141c] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#181b25]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5ecd6e] to-[#22c55e] flex items-center justify-center shadow-lg shadow-[#5ecd6e]/20">
              <LoopaSymbol className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Elegir Aplicación del Ecosistema</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#5ecd6e]/20 text-[#5ecd6e] border border-[#5ecd6e]/30">
                  LOOPA CORE
                </span>
              </div>
              <p className="text-xs text-white/50 truncate max-w-xs">Proyecto: <span className="text-white font-medium">{project.name}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Choose App */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-white/60">
            Selecciona con qué aplicación especializada de LOOPA deseas abrir este proyecto. Todas comparten la misma escena en memoria a través de LOOPA CORE.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            
            {/* LOOPA Modeler */}
            <button
              onClick={() => {
                onLaunchApp('modeler');
                onClose();
              }}
              className="group bg-[#181b25] hover:bg-[#1f2430] border border-emerald-500/30 hover:border-emerald-500/70 rounded-xl p-4 text-left flex flex-col justify-between transition-all shadow-lg relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl"></div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Box className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Modelado 3D
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1 group-hover:text-emerald-300 transition-colors">LOOPA Modeler</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Modelado poligonal, extrusiones, biseles, cortes de bucle y jerarquía de escena.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>Abrir Modeler</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* LOOPA Sculpt */}
            <button
              onClick={() => {
                onLaunchApp('sculpt');
                onClose();
              }}
              className="group bg-[#181b25] hover:bg-[#1f2430] border border-purple-500/30 hover:border-purple-500/70 rounded-xl p-4 text-left flex flex-col justify-between transition-all shadow-lg relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl"></div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Escultura
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1 group-hover:text-purple-300 transition-colors">LOOPA Sculpt</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Escultura digital orgánica, pinceles de arcilla, inflado y simetría reflejada.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-purple-400 font-semibold">
                <span>Abrir Sculpt</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* LOOPA UVs */}
            <button
              onClick={() => {
                onLaunchApp('uvs');
                onClose();
              }}
              className="group bg-[#181b25] hover:bg-[#1f2430] border border-sky-500/30 hover:border-sky-500/70 rounded-xl p-4 text-left flex flex-col justify-between transition-all shadow-lg relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-xl"></div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                    <Grid3X3 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Despliegue UV
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1 group-hover:text-sky-300 transition-colors">LOOPA UVs</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Marcado de costuras, unwrap automático e interactivo y edición 2D.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-sky-400 font-semibold">
                <span>Abrir UVs</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* LOOPA Materials */}
            <button
              onClick={() => {
                onLaunchApp('materials');
                onClose();
              }}
              className="group bg-[#181b25] hover:bg-[#1f2430] border border-amber-500/30 hover:border-amber-500/70 rounded-xl p-4 text-left flex flex-col justify-between transition-all shadow-lg relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl"></div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                    <Palette className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Materiales PBR
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1 group-hover:text-amber-300 transition-colors">LOOPA Materiales</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Creación y edición de materiales PBR, color base, rugosidad y texturas.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-amber-400 font-semibold">
                <span>Abrir Materiales</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#181b25] flex items-center justify-between text-xs text-white/40">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" /> CORE Sincronizado
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Volver a la Galería
          </button>
        </div>

      </div>
    </div>
  );
}
