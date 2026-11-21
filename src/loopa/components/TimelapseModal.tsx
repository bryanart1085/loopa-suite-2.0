import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { ViewportDisplayMode } from '../core/project/types';
import {
  buildExportTimelineIndices,
  detectMp4ExportSupport,
  exportTimelapseToMp4,
  triggerVideoDownload,
} from '../core/timelapse/timelapseMp4Exporter';
import {
  computeStableHeroCamera,
  interpolateCameraState,
  TimelapseRenderer,
} from '../core/timelapse/timelapseRenderer';
import {
  createBlobCache,
  formatTimelapseBytes,
  getTimelapseMeta,
  hydrateTimelapseFrameAtIndex,
  listTimelapseSteps,
} from '../core/timelapse/timelapseStorage';
import {
  Mp4SupportInfo,
  TIMELAPSE_RESOLUTION_PRESETS,
  TimelapseCameraState,
  TimelapseExportMode,
  TimelapseExportProgress,
  TimelapseExportResult,
  TimelapseProjectMeta,
  TimelapseResolutionPresetId,
  TimelapseStep,
} from '../core/timelapse/types';

interface TimelapseModalProps {
  demoMode?: boolean;
  projectId: string;
  projectName: string;
  isActiveProject: boolean;
  autoRecordEnabled: boolean;
  initialIncludeCamera: boolean;
  initialDisplayMode: ViewportDisplayMode;
  xrayTransparency: number;
  onChangeIncludeCamera: (include: boolean) => void;
  onToggleRecordingPaused?: () => Promise<void> | void;
  onDeleteTimelapseHistory: (projectId: string) => Promise<void>;
  onNotify?: (msg: string) => void;
  onClose: () => void;
  variant?: 'modal' | 'workspace';
  reserveTopLeftCorner?: boolean;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8] as const;

function formatElapsedSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const TimelapseModal: React.FC<TimelapseModalProps> = ({
  demoMode = false,
  projectId,
  projectName,
  isActiveProject,
  autoRecordEnabled,
  initialIncludeCamera,
  initialDisplayMode,
  xrayTransparency,
  onChangeIncludeCamera,
  onToggleRecordingPaused,
  onDeleteTimelapseHistory,
  onNotify,
  onClose,
  variant = 'modal',
  reserveTopLeftCorner = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<TimelapseStep[]>([]);
  const [meta, setMeta] = useState<TimelapseProjectMeta | null>(null);
  const [includeCamera, setIncludeCamera] = useState(initialIncludeCamera);
  const [displayMode, setDisplayMode] = useState<ViewportDisplayMode>(
    initialDisplayMode === 'wireframe' ||
      initialDisplayMode === 'xray' ||
      initialDisplayMode === 'material'
      ? initialDisplayMode
      : 'solid',
  );

  // Player state
  const [cursorPosition, setCursorPosition] = useState(0); // Index inside filtered timeline
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(2);
  const [fullReplayActive, setFullReplayActive] = useState(false);

  // Export state
  const [mp4Support, setMp4Support] = useState<Mp4SupportInfo | null>(null);
  const [exportMode, setExportMode] = useState<TimelapseExportMode>('full');
  const [exportResolution, setExportResolution] =
    useState<TimelapseResolutionPresetId>('square_1080');
  const [exportSpeed, setExportSpeed] = useState<number>(2);
  const [exportProgress, setExportProgress] =
    useState<TimelapseExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] =
    useState<TimelapseExportResult | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  // Delete confirmation state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 3D Stage refs
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<TimelapseRenderer | null>(null);
  const blobCacheRef = useRef<Map<string, string>>(createBlobCache());
  const stableHeroCamRef = useRef<TimelapseCameraState | null>(null);
  const [currentStepInfo, setCurrentStepInfo] = useState<{
    label: string;
    kind: TimelapseStep['kind'];
  } | null>(null);

  const canWebShareFiles = useMemo(() => {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    );
  }, []);

  // Load persisted timelapse steps & meta
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    blobCacheRef.current.clear();
    stableHeroCamRef.current = null;

    void (async () => {
      const [loadedSteps, loadedMeta, supportInfo] = await Promise.all([
        listTimelapseSteps(projectId),
        getTimelapseMeta(projectId),
        detectMp4ExportSupport(1080, 1080),
      ]);
      if (cancelled) return;
      setSteps(loadedSteps);
      setMeta(loadedMeta);
      setMp4Support(supportInfo);
      if (loadedSteps.length > 0) {
        const finalHydrated = await hydrateTimelapseFrameAtIndex(
          projectId,
          loadedSteps,
          loadedSteps.length - 1,
          blobCacheRef.current,
        );
        if (!cancelled && finalHydrated) {
          stableHeroCamRef.current = computeStableHeroCamera(
            finalHydrated.objects,
          );
        }
      }
      setCursorPosition(0);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Filtered indices respecting "Include camera movements" preference
  const timelineIndices = useMemo(() => {
    if (steps.length === 0) return [];
    const list: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (includeCamera || steps[i].kind !== 'camera') {
        list.push(i);
      }
    }
    if (list.length === 0) {
      list.push(steps.length - 1);
    }
    return list;
  }, [includeCamera, steps]);

  const totalSteps = timelineIndices.length;
  const clampedCursor = Math.max(
    0,
    Math.min(Math.max(0, totalSteps - 1), cursorPosition),
  );

  // Duration calculation: 0.45s base per step at 1x
  const baseStepDurationSec = 0.45;
  const totalDurationSec = useMemo(() => {
    if (totalSteps <= 1) return 0;
    return ((totalSteps - 1) * baseStepDurationSec) / Math.max(0.25, speed);
  }, [speed, totalSteps]);

  const elapsedSec = useMemo(() => {
    if (totalSteps <= 1) return 0;
    return (clampedCursor * baseStepDurationSec) / Math.max(0.25, speed);
  }, [clampedCursor, speed, totalSteps]);

  // Initialize & resize WebGL preview renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = stageContainerRef.current;
    if (!canvas || !container || loading) return;

    const initW = Math.max(240, container.clientWidth || 640);
    const initH = Math.max(200, container.clientHeight || 420);
    const renderer = new TimelapseRenderer({
      canvas,
      width: initW,
      height: initH,
      showGrid: true,
      showAxes: true,
    });
    rendererRef.current = renderer;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(200, Math.round(entry.contentRect.width));
      const h = Math.max(180, Math.round(entry.contentRect.height));
      renderer.resize(w, h);
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [loading]);

  // Render exact step or interpolated sub-frame onto the 3D stage
  const renderTimelinePosition = useCallback(
    async (timelinePos: number) => {
      const renderer = rendererRef.current;
      if (!renderer || timelineIndices.length === 0 || steps.length === 0) {
        return;
      }
      const maxIdx = timelineIndices.length - 1;
      const clampedPos = Math.max(0, Math.min(maxIdx, timelinePos));
      const lowIdx = Math.floor(clampedPos);
      const highIdx = Math.min(maxIdx, lowIdx + 1);
      const frac = clampedPos - lowIdx;

      const stepIdxA = timelineIndices[lowIdx];
      const stepIdxB = timelineIndices[highIdx];
      const frame = await hydrateTimelapseFrameAtIndex(
        projectId,
        steps,
        stepIdxA,
        blobCacheRef.current,
      );
      if (!frame || rendererRef.current !== renderer) return;

      await renderer.preloadFrameTextures(frame);
      if (rendererRef.current !== renderer) return;

      const camA = steps[stepIdxA].camera;
      const camB = steps[stepIdxB].camera;
      const targetCam = includeCamera
        ? interpolateCameraState(camA, camB, frac)
        : (stableHeroCamRef.current ?? camA);

      renderer.renderFrame(frame, targetCam, {
        displayMode,
        xrayTransparency,
      });

      setCurrentStepInfo({
        label: frame.step.label,
        kind: frame.step.kind,
      });
    },
    [
      displayMode,
      includeCamera,
      projectId,
      steps,
      timelineIndices,
      xrayTransparency,
    ],
  );

  // Re-render when cursor/mode/camera preference changes while paused
  useEffect(() => {
    if (!loading && !isPlaying) {
      void renderTimelinePosition(clampedCursor);
    }
  }, [clampedCursor, isPlaying, loading, renderTimelinePosition]);

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying || totalSteps <= 1) return;

    let rafId = 0;
    let lastTs = performance.now();
    let floatPos = clampedCursor >= totalSteps - 1 ? 0 : clampedCursor;
    let busy = false;

    const tick = (now: number) => {
      const dt = Math.min(0.08, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const stepsPerSec = speed / baseStepDurationSec;
      floatPos += dt * stepsPerSec;

      if (floatPos >= totalSteps - 1) {
        floatPos = totalSteps - 1;
        setCursorPosition(totalSteps - 1);
        setIsPlaying(false);
        setFullReplayActive(false);
        void renderTimelinePosition(totalSteps - 1);
        return;
      }

      const discrete = Math.floor(floatPos);
      setCursorPosition((prev) => (prev === discrete ? prev : discrete));

      if (!busy) {
        busy = true;
        void renderTimelinePosition(floatPos).finally(() => {
          busy = false;
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
    // Intentionally omit clampedCursor so playback advances continuously from floatPos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, renderTimelinePosition, speed, totalSteps]);

  // Escape closes modal (unless exporting)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exportProgress) {
        onClose();
      } else if (e.key === ' ' && totalSteps > 1 && !exportProgress) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'BUTTON') {
          e.preventDefault();
          setIsPlaying((p) => !p);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportProgress, onClose, totalSteps]);

  // Cleanup active export on unmount
  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  const handleToggleIncludeCamera = (next: boolean) => {
    setIncludeCamera(next);
    onChangeIncludeCamera(next);
    setCursorPosition(0);
    setIsPlaying(false);
  };

  const handleStartFullPlayback = () => {
    if (totalSteps <= 1) return;
    setFullReplayActive(true);
    setCursorPosition(0);
    setIsPlaying(true);
  };

  const handleTogglePlayPause = () => {
    if (totalSteps <= 1) return;
    if (!isPlaying && clampedCursor >= totalSteps - 1) {
      setCursorPosition(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleRestart = () => {
    setIsPlaying(false);
    setFullReplayActive(false);
    setCursorPosition(0);
  };

  const handleStepBackward = () => {
    setIsPlaying(false);
    setFullReplayActive(false);
    setCursorPosition((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setFullReplayActive(false);
    setCursorPosition((prev) => Math.min(Math.max(0, totalSteps - 1), prev + 1));
  };

  const handleStartMp4Export = async () => {
    if (steps.length === 0 || exportProgress) return;
    setExportError(null);
    setExportResult(null);

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const result = await exportTimelapseToMp4({
        projectId,
        projectName,
        steps,
        mode: exportMode,
        speed: exportSpeed,
        includeCamera,
        resolutionId: exportResolution,
        displayMode,
        xrayTransparency,
        fps: 30,
        signal: controller.signal,
        onProgress: (prog) => {
          setExportProgress(prog);
        },
      });
      setExportProgress(null);
      setExportResult(result);
      onNotify?.(`Video MP4 listo (${formatTimelapseBytes(result.sizeBytes)})`);
    } catch (err) {
      setExportProgress(null);
      if (err instanceof DOMException && err.name === 'AbortError') {
        onNotify?.('Exportación MP4 cancelada');
      } else {
        setExportError(
          err instanceof Error
            ? err.message
            : 'No se pudo generar el archivo MP4.',
        );
      }
    } finally {
      exportAbortRef.current = null;
    }
  };

  const handleShareMp4 = async () => {
    if (!exportResult) return;
    try {
      const file = new File([exportResult.blob], exportResult.filename, {
        type: 'video/mp4',
      });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        triggerVideoDownload(exportResult.blob, exportResult.filename);
        return;
      }
      await navigator.share({
        title: `${projectName} · Timelapse 3D`,
        files: [file],
      });
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        triggerVideoDownload(exportResult.blob, exportResult.filename);
      }
    }
  };

  const handleConfirmDeleteHistory = async () => {
    setDeleting(true);
    try {
      await onDeleteTimelapseHistory(projectId);
      setSteps([]);
      setMeta(null);
      setExportResult(null);
      setCursorPosition(0);
      setIsPlaying(false);
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const estimatedExportSteps = useMemo(
    () =>
      buildExportTimelineIndices(
        steps,
        includeCamera,
        exportMode,
        exportSpeed,
      ).length,
    [exportMode, exportSpeed, includeCamera, steps],
  );

  const isRecordingPaused = Boolean(meta?.paused);
  const storageBytes = meta?.totalEstimatedBytes ?? 0;

  const isWorkspace = variant === 'workspace';
  const cardContent = (
    <div
      role={isWorkspace ? undefined : 'dialog'}
      aria-modal={isWorkspace ? undefined : 'true'}
      aria-label={`Timelapse de ${projectName}`}
      onPointerDown={(e) => {
        if (!isWorkspace) e.stopPropagation();
      }}
      className={
        isWorkspace
          ? 'flex-1 min-h-0 w-full bg-[#181a1f] flex flex-col overflow-hidden'
          : 'w-full max-w-5xl max-h-[94vh] bg-[#181a1f] border border-[#323640] rounded-2xl shadow-2xl flex flex-col overflow-hidden'
      }
    >
        {/* Header */}
        <div
          className={`${
            isWorkspace && reserveTopLeftCorner ? 'pl-[108px] pr-4' : 'px-4'
          } py-3 border-b border-[#2a2d36] flex items-center justify-between gap-3 shrink-0 transition-[padding] duration-200`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#16261a] border border-[#5ecd6e]/40 flex items-center justify-center shrink-0">
              <Film className="w-4 h-4 text-[#5ecd6e]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#f3f4f6] truncate">
                  Timelapse
                </h2>
                <span className="text-xs text-[#9ca3af] truncate hidden sm:inline">
                  · {projectName}
                </span>
              </div>
              <div className="text-[11px] text-[#8e95a2] font-mono-tabular">
                {meta
                  ? `${meta.modelStepCount} cambios de modelo · ${meta.cameraStepCount} vistas de cámara`
                  : 'Sin registros guardados'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isActiveProject && (
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold ${
                    !autoRecordEnabled
                      ? 'bg-[#22252d] border-[#343a47] text-[#9ca3af]'
                      : isRecordingPaused
                        ? 'bg-[#2a2417] border-[#f59e0b]/45 text-[#fbbf24]'
                        : 'bg-[#16261a] border-[#5ecd6e]/45 text-[#7def8e]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      !autoRecordEnabled
                        ? 'bg-[#6b7280]'
                        : isRecordingPaused
                          ? 'bg-[#f59e0b]'
                          : 'bg-[#ef4444] animate-pulse'
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {!autoRecordEnabled
                      ? 'Grabación desactivada'
                      : isRecordingPaused
                        ? 'Grabación pausada'
                        : 'Grabación automática'}
                  </span>
                </span>

                {autoRecordEnabled && onToggleRecordingPaused && (
                  <button
                    type="button"
                    onClick={() => void onToggleRecordingPaused()}
                    title={
                      isRecordingPaused
                        ? 'Reanudar grabación del timelapse'
                        : 'Pausar grabación temporalmente'
                    }
                    className="min-h-[34px] px-2.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343a47] text-[11px] font-semibold text-[#e4e6eb] transition-colors touch-manipulation"
                  >
                    {isRecordingPaused ? 'Reanudar' : 'Pausar grab.'}
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={Boolean(exportProgress)}
              onClick={onClose}
              aria-label={
                isWorkspace ? 'Volver al espacio Layout' : 'Cerrar ventana de Timelapse'
              }
              className={
                isWorkspace
                  ? 'h-8 px-2.5 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343a47] disabled:opacity-40 text-xs font-semibold text-[#e4e6eb] flex items-center gap-1.5 transition-colors'
                  : 'w-9 h-9 rounded-lg hover:bg-[#252932] disabled:opacity-40 text-[#9ca3af] hover:text-white flex items-center justify-center transition-colors'
              }
            >
              {isWorkspace ? (
                <span>Ir a Layout</span>
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* Left Stage + Playback Controls */}
          <div className="flex-1 min-w-0 flex flex-col bg-[#131519] border-b lg:border-b-0 lg:border-r border-[#2a2d36]">
            {/* 3D Canvas Stage */}
            <div
              ref={stageContainerRef}
              className="relative w-full h-[260px] sm:h-[340px] lg:flex-1 lg:min-h-[340px] bg-[#1d1f24] overflow-hidden"
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full block"
              />

              {loading && (
                <div className="absolute inset-0 bg-[#1d1f24] flex flex-col items-center justify-center gap-2 text-xs text-[#9ca3af]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#5ecd6e]" />
                  <span>Cargando historial de modelado...</span>
                </div>
              )}

              {!loading && steps.length === 0 && (
                <div className="absolute inset-0 bg-[#1d1f24]/95 flex flex-col items-center justify-center p-6 text-center space-y-2">
                  <Film className="w-8 h-8 text-[#4b5563]" />
                  <p className="text-sm font-semibold text-[#e4e6eb]">
                    Aún no hay pasos de Timelapse registrados
                  </p>
                  <p className="text-xs text-[#8e95a2] max-w-sm">
                    {autoRecordEnabled
                      ? 'Empieza a agregar primitivas o editar geometría en el visor para construir la línea de tiempo automáticamente.'
                      : 'La grabación automática está desactivada en la configuración. Actívala para registrar futuras operaciones.'}
                  </p>
                </div>
              )}

              {/* Step Label Badge */}
              {!loading && steps.length > 0 && currentStepInfo && (
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                  <div className="px-2.5 py-1.5 rounded-lg bg-[#181a1f]/95 border border-[#343a47] text-[11px] font-medium text-[#e4e6eb] flex items-center gap-2 shadow-lg max-w-[75%]">
                    <span className="font-mono-tabular font-bold text-[#5ecd6e] shrink-0">
                      {clampedCursor + 1}/{totalSteps}
                    </span>
                    <span className="truncate">{currentStepInfo.label}</span>
                  </div>

                  {/* Quick Preview Display Mode Switch */}
                  <div className="flex items-center gap-1 bg-[#181a1f]/95 border border-[#343a47] rounded-lg p-0.5 pointer-events-auto">
                    {(
                      [
                        { id: 'solid', label: 'Sólido' },
                        { id: 'material', label: 'Mat.' },
                        { id: 'wireframe', label: 'Alamb.' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDisplayMode(m.id)}
                        className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                          displayMode === m.id
                            ? 'bg-[#2c313b] text-[#5ecd6e]'
                            : 'text-[#9ca3af] hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Playback Transport Controls */}
            <div className="p-3 sm:p-4 bg-[#181a1f] border-t border-[#262a33] space-y-3 shrink-0">
              {/* Scrub Bar + Elapsed Time */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#9ca3af]">
                  <span>{formatElapsedSeconds(elapsedSec)}</span>
                  <span className="text-[#cbd5e1]">
                    {totalSteps > 0
                      ? `Paso ${clampedCursor + 1} de ${totalSteps}`
                      : '0 pasos'}
                  </span>
                  <span>{formatElapsedSeconds(totalDurationSec)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, totalSteps - 1)}
                  step={1}
                  disabled={totalSteps <= 1}
                  value={clampedCursor}
                  aria-label="Barra de progreso del Timelapse"
                  onChange={(e) => {
                    setIsPlaying(false);
                    setFullReplayActive(false);
                    setCursorPosition(parseInt(e.target.value, 10));
                  }}
                  className="w-full h-2 accent-[#5ecd6e] cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Transport Buttons + Speed Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={totalSteps <= 1}
                    onClick={handleRestart}
                    title="Reiniciar al inicio"
                    aria-label="Reiniciar"
                    className="w-10 h-10 rounded-lg bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] text-[#e4e6eb] flex items-center justify-center transition-colors touch-manipulation"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={totalSteps <= 1 || clampedCursor <= 0}
                    onClick={handleStepBackward}
                    title="Retroceder un paso"
                    aria-label="Retroceder"
                    className="w-10 h-10 rounded-lg bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] text-[#e4e6eb] flex items-center justify-center transition-colors touch-manipulation"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={totalSteps <= 1}
                    onClick={handleTogglePlayPause}
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                    className="min-w-[116px] h-10 px-4 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] disabled:opacity-40 text-xs font-bold text-[#111215] flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4 fill-current" />
                        <span>Pausar</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Reproducir</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={totalSteps <= 1 || clampedCursor >= totalSteps - 1}
                    onClick={handleStepForward}
                    title="Avanzar un paso"
                    aria-label="Avanzar"
                    className="w-10 h-10 rounded-lg bg-[#22252d] hover:bg-[#2c313b] disabled:opacity-40 border border-[#323640] text-[#e4e6eb] flex items-center justify-center transition-colors touch-manipulation"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={totalSteps <= 1}
                    onClick={handleStartFullPlayback}
                    title="Reproducir el proceso completo desde el paso 1 hasta el final"
                    className={`min-h-[40px] px-2.5 rounded-lg border text-[11px] font-semibold transition-colors touch-manipulation ${
                      fullReplayActive && isPlaying
                        ? 'bg-[#16261a] border-[#5ecd6e] text-[#7def8e]'
                        : 'bg-[#22252d] hover:bg-[#2c313b] border-[#323640] text-[#d1d5db]'
                    } disabled:opacity-40`}
                  >
                    Completa
                  </button>
                </div>

                {/* Speed Controls */}
                <div className="flex items-center gap-1 bg-[#121418] border border-[#2a2e38] rounded-lg p-1">
                  <span className="text-[10px] font-semibold text-[#8e95a2] px-1.5">
                    Vel.
                  </span>
                  {SPEED_OPTIONS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setSpeed(sp)}
                      className={`px-2 py-1 rounded text-[11px] font-mono-tabular font-semibold transition-colors ${
                        speed === sp
                          ? 'bg-[#2c313b] text-[#5ecd6e]'
                          : 'text-[#9ca3af] hover:text-white'
                      }`}
                    >
                      {sp}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Camera Preference, MP4 Export & Storage Control */}
          <div className="w-full lg:w-[356px] shrink-0 bg-[#16181d] p-4 space-y-4 lg:overflow-y-auto cad-scroll">
            {/* Camera Preference */}
            <div className="rounded-xl bg-[#1c1f26] border border-[#2d313c] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Camera className="w-4 h-4 text-[#5ecd6e] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#f3f4f6]">
                      Movimientos de cámara
                    </div>
                    <div className="text-[11px] text-[#8e95a2] leading-tight">
                      {includeCamera
                        ? 'Sigue tus órbitas, zoom y vistas'
                        : 'Cámara fija estable centrada en el modelo'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeCamera}
                  aria-label="Incluir movimientos de cámara"
                  onClick={() => handleToggleIncludeCamera(!includeCamera)}
                  className={`w-12 h-7 rounded-full p-0.5 transition-colors shrink-0 ${
                    includeCamera ? 'bg-[#49b459]' : 'bg-[#2c3038]'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full bg-white transition-transform ${
                      includeCamera ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {!demoMode && (
            <div className="rounded-xl bg-[#1c1f26] border border-[#2d313c] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#5ecd6e]" />
                  <span className="text-xs font-bold text-[#f3f4f6]">
                    Exportar Video MP4
                  </span>
                </div>
                {mp4Support?.supported && (
                  <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#16261a] border border-[#5ecd6e]/40 text-[#7def8e]">
                    {mp4Support.codecLabel ?? 'MP4'}
                  </span>
                )}
              </div>

              {mp4Support && !mp4Support.supported ? (
                <div className="rounded-lg bg-[#2a1d20] border border-[#5c2c33] p-2.5 flex items-start gap-2 text-[11px] text-[#fca5a5]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {mp4Support.reason ??
                      'La exportación MP4 no está disponible en este navegador.'}
                  </span>
                </div>
              ) : (
                <>
                  {/* Mode: Full vs Summary */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-[#9ca3af]">
                      Duración y estilo
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={Boolean(exportProgress)}
                        onClick={() => setExportMode('full')}
                        className={`min-h-[36px] px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          exportMode === 'full'
                            ? 'bg-[#2c313b] border-[#5ecd6e]/70 text-[#5ecd6e]'
                            : 'bg-[#15171c] border-[#2c303a] text-[#b4bac4] hover:text-white'
                        }`}
                      >
                        <Film className="w-3.5 h-3.5 shrink-0" />
                        <span>Completo</span>
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(exportProgress)}
                        onClick={() => setExportMode('summary')}
                        className={`min-h-[36px] px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          exportMode === 'summary'
                            ? 'bg-[#2c313b] border-[#5ecd6e]/70 text-[#5ecd6e]'
                            : 'bg-[#15171c] border-[#2c303a] text-[#b4bac4] hover:text-white'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Resumen rápido</span>
                      </button>
                    </div>
                  </div>

                  {/* Social Resolution */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-[#9ca3af]">
                      Resolución (Redes Sociales)
                    </span>
                    <select
                      disabled={Boolean(exportProgress)}
                      value={exportResolution}
                      onChange={(e) =>
                        setExportResolution(
                          e.target.value as TimelapseResolutionPresetId,
                        )
                      }
                      className="w-full h-9 px-2.5 rounded-lg bg-[#121418] border border-[#2f333d] text-xs text-[#f3f4f6] outline-none"
                    >
                      {TIMELAPSE_RESOLUTION_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} · {preset.subtitle}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Export Speed */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[#9ca3af]">
                      Velocidad de video
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 4, 8].map((sp) => (
                        <button
                          key={sp}
                          type="button"
                          disabled={Boolean(exportProgress)}
                          onClick={() => setExportSpeed(sp)}
                          className={`px-2 py-1 rounded text-[11px] font-mono-tabular font-semibold border transition-colors ${
                            exportSpeed === sp
                              ? 'bg-[#2c313b] border-[#5ecd6e]/70 text-[#5ecd6e]'
                              : 'bg-[#15171c] border-[#2c303a] text-[#9ca3af] hover:text-white'
                          }`}
                        >
                          {sp}×
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-[11px] text-[#8e95a2] flex items-center justify-between">
                    <span>Pasos a renderizar:</span>
                    <span className="font-mono-tabular text-[#cbd5e1]">
                      {estimatedExportSteps} ·{' '}
                      {includeCamera ? 'Con cámara' : 'Cámara fija'}
                    </span>
                  </div>

                  {/* Progress / Result / Action */}
                  {exportProgress ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#e4e6eb] truncate">
                          {exportProgress.message}
                        </span>
                        <span className="font-mono-tabular text-[#5ecd6e] shrink-0">
                          {Math.round(exportProgress.ratio * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#121418] overflow-hidden">
                        <div
                          className="h-full bg-[#5ecd6e] transition-all duration-150"
                          style={{
                            width: `${Math.max(4, Math.round(exportProgress.ratio * 100))}%`,
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => exportAbortRef.current?.abort()}
                        className="w-full min-h-[38px] rounded-lg bg-[#2c191c] hover:bg-[#3f2024] border border-[#e05252]/50 text-xs font-semibold text-[#fca5a5]"
                      >
                        Cancelar exportación
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={steps.length === 0 || !mp4Support?.supported}
                      onClick={() => void handleStartMp4Export()}
                      className="w-full min-h-[42px] px-3 rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] disabled:opacity-40 text-xs font-bold text-[#111215] flex items-center justify-center gap-2 transition-colors touch-manipulation"
                    >
                      <Download className="w-4 h-4" />
                      <span>Generar Video MP4</span>
                    </button>
                  )}

                  {exportError && (
                    <div className="rounded-lg bg-[#2a1d20] border border-[#5c2c33] p-2.5 text-[11px] text-[#fca5a5]">
                      {exportError}
                    </div>
                  )}

                  {exportResult && (
                    <div className="rounded-lg bg-[#142318] border border-[#3a6c45] p-2.5 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#7def8e]">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>MP4 generado correctamente</span>
                      </div>
                      <div className="text-[11px] text-[#b4e2be] font-mono-tabular">
                        {exportResult.width}×{exportResult.height} ·{' '}
                        {exportResult.durationSec.toFixed(1)} s ·{' '}
                        {formatTimelapseBytes(exportResult.sizeBytes)}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            triggerVideoDownload(
                              exportResult.blob,
                              exportResult.filename,
                            )
                          }
                          className="flex-1 min-h-[38px] rounded-lg bg-[#5ecd6e] hover:bg-[#6fe681] text-xs font-bold text-[#111215] flex items-center justify-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar MP4</span>
                        </button>
                        {canWebShareFiles && (
                          <button
                            type="button"
                            onClick={() => void handleShareMp4()}
                            className="min-h-[38px] px-3 rounded-lg bg-[#22252d] hover:bg-[#2c313b] border border-[#343a47] text-xs font-semibold text-[#e4e6eb] flex items-center justify-center gap-1.5"
                          >
                            <Share2 className="w-3.5 h-3.5 text-[#38bdf8]" />
                            <span>Compartir</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            )}

            {/* Storage & History Management */}
            <div className="rounded-xl bg-[#1c1f26] border border-[#2d313c] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#d1d5db]">
                  Espacio ocupado
                </span>
                <span className="font-mono-tabular font-semibold text-[#5ecd6e]">
                  {formatTimelapseBytes(storageBytes)}
                </span>
              </div>

              {!confirmDeleteOpen ? (
                <button
                  type="button"
                  disabled={steps.length === 0 || Boolean(exportProgress)}
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="w-full min-h-[38px] px-3 rounded-lg bg-[#251b1e] hover:bg-[#332024] disabled:opacity-40 border border-[#4a2b30] text-xs font-semibold text-[#fca5a5] flex items-center justify-center gap-2 transition-colors touch-manipulation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar historial de Timelapse</span>
                </button>
              ) : (
                <div className="rounded-lg bg-[#241619] border border-[#6e2d35] p-2.5 space-y-2">
                  <p className="text-[11px] text-[#fca5a5] leading-relaxed">
                    ¿Eliminar el historial de Timelapse de este proyecto? Tu modelo
                    3D se conservará intacto.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => setConfirmDeleteOpen(false)}
                      className="flex-1 min-h-[36px] rounded-lg bg-[#22252d] hover:bg-[#2c313b] text-xs font-semibold text-[#e4e6eb]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => void handleConfirmDeleteHistory()}
                      className="flex-1 min-h-[36px] rounded-lg bg-[#dc2626] hover:bg-[#ef4444] text-xs font-bold text-white flex items-center justify-center gap-1"
                    >
                      {deleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Sí, eliminar'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );

  if (isWorkspace) {
    return (
      <div
        data-testid="timelapse-workspace"
        className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#181a1f]"
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !exportProgress) {
          onClose();
        }
      }}
    >
      {cardContent}
    </div>
  );
};
