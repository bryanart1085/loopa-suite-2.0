import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import {
  computeStableHeroCamera,
  interpolateCameraState,
  TimelapseRenderer,
} from './timelapseRenderer';
import {
  createBlobCache,
  hydrateTimelapseFrameAtIndex,
} from './timelapseStorage';
import {
  HydratedTimelapseFrame,
  Mp4SupportInfo,
  TIMELAPSE_RESOLUTION_PRESETS,
  TimelapseCameraState,
  TimelapseExportOptions,
  TimelapseExportResult,
  TimelapseStep,
} from './types';

const H264_CODEC_CANDIDATES: { codec: string; label: string }[] = [
  { codec: 'avc1.4d002a', label: 'H.264 Main L4.2' },
  { codec: 'avc1.42001f', label: 'H.264 Baseline L3.1' },
  { codec: 'avc1.640028', label: 'H.264 High L4.0' },
  { codec: 'avc1.42E01E', label: 'H.264 Constrained Baseline' },
];

const MEDIARECORDER_MP4_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

export async function detectMp4ExportSupport(
  width = 1080,
  height = 1080,
): Promise<Mp4SupportInfo> {
  const evenW = width % 2 === 0 ? width : width - 1;
  const evenH = height % 2 === 0 ? height : height - 1;

  if (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoEncoder.isConfigSupported === 'function' &&
    typeof VideoFrame !== 'undefined'
  ) {
    for (const candidate of H264_CODEC_CANDIDATES) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: candidate.codec,
          width: evenW,
          height: evenH,
          bitrate: 4_500_000,
          framerate: 30,
          avc: { format: 'avc' },
        });
        if (support.supported) {
          return {
            supported: true,
            backend: 'webcodecs',
            codecString: candidate.codec,
            codecLabel: candidate.label,
          };
        }
      } catch {
        // Try next codec profile
      }
    }
  }

  if (
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function'
  ) {
    for (const mime of MEDIARECORDER_MP4_MIME_CANDIDATES) {
      try {
        if (MediaRecorder.isTypeSupported(mime)) {
          return {
            supported: true,
            backend: 'mediarecorder',
            codecString: mime,
            codecLabel: 'MP4 nativo del navegador',
          };
        }
      } catch {
        // Continue checking
      }
    }
  }

  return {
    supported: false,
    backend: 'none',
    reason:
      'Este navegador o contexto no admite codificación H.264 / MP4 nativa (WebCodecs H.264 ni MediaRecorder video/mp4). Prueba en Safari moderno (iOS/iPadOS 16.4+), Chrome o Edge con aceleración de video.',
  };
}

export function buildExportTimelineIndices(
  steps: TimelapseStep[],
  includeCamera: boolean,
  mode: 'full' | 'summary',
  speed: number,
): number[] {
  const activeIndices: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (includeCamera || steps[i].kind !== 'camera') {
      activeIndices.push(i);
    }
  }

  if (activeIndices.length === 0 && steps.length > 0) {
    activeIndices.push(steps.length - 1);
  }
  if (activeIndices.length <= 1) return activeIndices;

  if (mode === 'summary') {
    // Target ~12-16s compact social summary regardless of raw step count
    const maxSummarySteps = Math.max(18, Math.round(90 / Math.max(0.5, Math.min(4, speed))));
    if (activeIndices.length <= maxSummarySteps) {
      return activeIndices;
    }
    const sampled: number[] = [activeIndices[0]];
    const innerCount = maxSummarySteps - 2;
    for (let k = 1; k <= innerCount; k++) {
      const idxPos = Math.round(
        (k / (innerCount + 1)) * (activeIndices.length - 1),
      );
      const stepIdx = activeIndices[idxPos];
      if (sampled[sampled.length - 1] !== stepIdx) {
        sampled.push(stepIdx);
      }
    }
    const last = activeIndices[activeIndices.length - 1];
    if (sampled[sampled.length - 1] !== last) {
      sampled.push(last);
    }
    return sampled;
  }

  return activeIndices;
}

interface PlannedVideoFrame {
  stepIndex: number;
  camera: TimelapseCameraState;
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
  return cleaned || 'loopa_modelo';
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function exportTimelapseToMp4(
  options: TimelapseExportOptions,
): Promise<TimelapseExportResult> {
  const preset =
    TIMELAPSE_RESOLUTION_PRESETS.find((p) => p.id === options.resolutionId) ??
    TIMELAPSE_RESOLUTION_PRESETS[0];
  const width = preset.width % 2 === 0 ? preset.width : preset.width - 1;
  const height = preset.height % 2 === 0 ? preset.height : preset.height - 1;
  const fps = options.fps ?? 30;
  const speed = Math.max(0.25, options.speed || 1);

  if (options.steps.length === 0) {
    throw new Error('No hay pasos registrados en el timelapse para exportar.');
  }

  const support = await detectMp4ExportSupport(width, height);
  if (!support.supported) {
    throw new Error(
      support.reason ??
        'La exportación MP4 no está disponible en este navegador.',
    );
  }

  options.onProgress?.({
    phase: 'preparing',
    ratio: 0.02,
    currentFrame: 0,
    totalFrames: 1,
    message: 'Preparando línea de tiempo y geometría...',
  });

  const timelineStepIndices = buildExportTimelineIndices(
    options.steps,
    options.includeCamera,
    options.mode,
    speed,
  );

  const blobCache = createBlobCache();
  const hydratedCache = new Map<number, HydratedTimelapseFrame>();

  const getHydrated = async (stepIndex: number) => {
    const cached = hydratedCache.get(stepIndex);
    if (cached) return cached;
    const hydrated = await hydrateTimelapseFrameAtIndex(
      options.projectId,
      options.steps,
      stepIndex,
      blobCache,
    );
    if (hydrated) {
      hydratedCache.set(stepIndex, hydrated);
    }
    return hydrated;
  };

  // Compute stable hero framing from final state if camera movements are excluded
  let fixedCamera: TimelapseCameraState | null = null;
  if (!options.includeCamera) {
    const finalIdx = timelineStepIndices[timelineStepIndices.length - 1];
    const finalFrame = await getHydrated(finalIdx);
    fixedCamera = computeStableHeroCamera(finalFrame?.objects ?? []);
  }

  // Build interpolated video frame plan matching selected speed & mode
  const frameDurationUs = Math.round(1_000_000 / fps);
  const subFramesPerStep =
    options.mode === 'summary'
      ? Math.max(1, Math.round(6 / Math.sqrt(speed)))
      : Math.max(1, Math.round(10 / speed));
  const holdFinalFrames = Math.round(fps * 1.6);

  const plannedFrames: PlannedVideoFrame[] = [];
  for (let i = 0; i < timelineStepIndices.length; i++) {
    const currIdx = timelineStepIndices[i];
    const currStep = options.steps[currIdx];
    const nextIdx =
      i + 1 < timelineStepIndices.length ? timelineStepIndices[i + 1] : currIdx;
    const nextStep = options.steps[nextIdx];

    if (fixedCamera) {
      for (let f = 0; f < subFramesPerStep; f++) {
        plannedFrames.push({ stepIndex: currIdx, camera: fixedCamera });
      }
    } else {
      const interpCount = i + 1 < timelineStepIndices.length ? subFramesPerStep : 1;
      for (let f = 0; f < interpCount; f++) {
        const t = interpCount === 1 ? 0 : f / interpCount;
        plannedFrames.push({
          stepIndex: currIdx,
          camera: interpolateCameraState(currStep.camera, nextStep.camera, t),
        });
      }
    }
  }

  if (plannedFrames.length > 0) {
    const last = plannedFrames[plannedFrames.length - 1];
    for (let h = 0; h < holdFinalFrames; h++) {
      plannedFrames.push(last);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new TimelapseRenderer({
    canvas,
    width,
    height,
    pixelRatio: 1,
    showGrid: true,
    showAxes: true,
  });

  try {
    if (support.backend === 'webcodecs' && support.codecString) {
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height,
        },
        fastStart: 'in-memory',
      });

      let encoderError: Error | null = null;
      const bitrate = Math.min(
        8_500_000,
        Math.max(2_500_000, Math.round((width * height * fps) / 8)),
      );

      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (err) => {
          encoderError =
            err instanceof Error ? err : new Error(String(err));
        },
      });

      try {
        encoder.configure({
          codec: support.codecString,
          width,
          height,
          bitrate,
          framerate: fps,
          avc: { format: 'avc' },
        });

        const total = plannedFrames.length;
        let encodedCount = 0;
        for (let i = 0; i < total; i++) {
          if (options.signal?.aborted) {
            throw new DOMException('Exportación cancelada', 'AbortError');
          }
          if (encoderError) throw encoderError;

          const plan = plannedFrames[i];
          const hydrated = await getHydrated(plan.stepIndex);
          if (!hydrated) continue;

          await renderer.preloadFrameTextures(hydrated);
          renderer.renderFrame(hydrated, plan.camera, {
            displayMode: options.displayMode,
            xrayTransparency: options.xrayTransparency,
          });

          const videoFrame = new VideoFrame(canvas, {
            timestamp: i * frameDurationUs,
            duration: frameDurationUs,
          });
          try {
            encoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
            encodedCount++;
          } finally {
            videoFrame.close();
          }

          if (i % 4 === 0 || i === total - 1) {
            options.onProgress?.({
              phase: 'rendering',
              ratio: 0.05 + (i / Math.max(1, total)) * 0.85,
              currentFrame: i + 1,
              totalFrames: total,
              message: `Renderizando fotograma ${i + 1} de ${total}...`,
            });
            // Backpressure guard so encoder queue does not accumulate
            while (encoder.encodeQueueSize > 8) {
              await yieldToMainThread();
            }
            await yieldToMainThread();
          }
        }

        if (encodedCount === 0) {
          throw new Error('No se encontraron fotogramas válidos para generar el MP4.');
        }

        options.onProgress?.({
          phase: 'muxing',
          ratio: 0.94,
          currentFrame: total,
          totalFrames: total,
          message: 'Empaquetando archivo MP4...',
        });

        await encoder.flush();
        if (encoderError) throw encoderError;
        encoder.close();
        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const durationSec = total / fps;
        return {
          blob,
          mimeType: 'video/mp4',
          filename: `${sanitizeFilename(options.projectName)}_timelapse.mp4`,
          width,
          height,
          durationSec,
          frameCount: total,
          sizeBytes: blob.size,
          backend: 'webcodecs',
        };
      } finally {
        if (encoder.state !== 'closed') {
          try {
            encoder.close();
          } catch {
            // Ignore close errors during cleanup
          }
        }
      }
    }

    // MediaRecorder MP4 native fallback (strictly video/mp4, never webm)
    if (
      support.backend === 'mediarecorder' &&
      support.codecString &&
      typeof canvas.captureStream === 'function'
    ) {
      const stream = canvas.captureStream(fps);
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: support.codecString,
        videoBitsPerSecond: 4_500_000,
      });
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const stopPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/mp4' }));
        };
        recorder.onerror = () => {
          reject(new Error('Error durante la grabación MP4 con MediaRecorder.'));
        };
      });

      try {
        recorder.start();
        const total = plannedFrames.length;
        const intervalMs = Math.round(1000 / fps);

        for (let i = 0; i < total; i++) {
          if (options.signal?.aborted) {
            if (recorder.state !== 'inactive') recorder.stop();
            throw new DOMException('Exportación cancelada', 'AbortError');
          }
          const plan = plannedFrames[i];
          const hydrated = await getHydrated(plan.stepIndex);
          if (hydrated) {
            await renderer.preloadFrameTextures(hydrated);
            renderer.renderFrame(hydrated, plan.camera, {
              displayMode: options.displayMode,
              xrayTransparency: options.xrayTransparency,
            });
          }
          options.onProgress?.({
            phase: 'rendering',
            ratio: 0.05 + (i / Math.max(1, total)) * 0.85,
            currentFrame: i + 1,
            totalFrames: total,
            message: `Codificando fotograma ${i + 1} de ${total}...`,
          });
          await new Promise((r) => window.setTimeout(r, intervalMs));
        }

        options.onProgress?.({
          phase: 'muxing',
          ratio: 0.94,
          currentFrame: total,
          totalFrames: total,
          message: 'Finalizando MP4...',
        });
        recorder.stop();
        const blob = await stopPromise;

        return {
          blob,
          mimeType: 'video/mp4',
          filename: `${sanitizeFilename(options.projectName)}_timelapse.mp4`,
          width,
          height,
          durationSec: total / fps,
          frameCount: total,
          sizeBytes: blob.size,
          backend: 'mediarecorder',
        };
      } finally {
        stream.getTracks().forEach((track) => track.stop());
      }
    }

    throw new Error('No hay codificador MP4 disponible en este dispositivo.');
  } finally {
    renderer.dispose();
  }
}

export function triggerVideoDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
