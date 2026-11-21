import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExportFormat,
  ExportModelModal,
  ExportRequestConfig,
  ExportScope,
  IoErrorModal,
  IoProgressModal,
  PendingStlImport,
  ReferenceImageImportModal,
  StlImportModal,
} from './components/FileIoModals';
import {
  RecoveryPromptModal,
  ReturnToGalleryModal,
} from './components/GalleryModals';
import { FloatingRadialPair } from './components/FloatingRadialPair';
import { LeftToolSidebar } from './components/LeftToolSidebar';
import { LinerPanel } from './components/LinerPanel';
import { MaterialWorkspace } from './components/MaterialWorkspace';
import { NewProjectModal } from './components/NewProjectModal';
import { ProjectGallery } from './components/ProjectGallery';
import { ProjectModal, ProjectModalMode } from './components/ProjectModal';
import { SettingsModal, SettingsTabId } from './components/SettingsModal';
import { TimelapseModal } from './components/TimelapseModal';
import { SceneStatsInfo, TopBar, WorkspaceId } from './components/TopBar';
import { LoopaEcosystemLanding } from './components/LoopaEcosystemLanding';
import { ProjectEcosystemLauncherModal } from './components/ProjectEcosystemLauncherModal';
import {
  UVQuickAccessState,
  UVWorkspace,
  UVWorkspaceHandle,
} from './components/UVWorkspace';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { EditableMesh } from './core/mesh/EditableMesh';
import { subdivideMesh } from './core/mesh/advancedOperations';
import {
  LoadedImageReferencePayload,
  loadReferenceImageFile,
} from './core/io/imageReference';
import {
  MAX_IMPORT_FILE_BYTES,
  stripFileExtension,
  triggerFileDownload,
} from './core/io/meshUtils';
import { buildImportedModelProjectData } from './core/io/modelThumbnail';
import { exportObjectsToObj } from './core/io/objExport';
import { parseObjContent } from './core/io/objImport';
import { exportObjectsToStl } from './core/io/stlExport';
import { inspectStlBuffer, parseStlBuffer } from './core/io/stlImport';
import { exportObjectsToGlb } from './core/io/glbExport';
import { parseGlbBuffer } from './core/io/glbImport';
import { evaluateObjectsForExport } from './core/modifiers/evaluateModifiers';
import {
  SidebarModuleId,
  ToolbarLayoutPreferences,
  getNextLeftToolbarDisplayMode,
  loadToolbarLayoutPreferences,
  resetModuleOrganizationInPrefs,
  saveToolbarLayoutPreferences,
} from './core/project/storage';
import {
  ObjectTransform,
  ObjectTransformChange,
  ProjectSummary,
  ProjectTemplateId,
  ReferenceImageOrientation,
  SceneObjectData,
  TouchModifierState,
} from './core/project/types';
import { getAppDocumentTitle } from './config/brand';
import { DEMO_MODE } from './config/demo';
import { EMPTY_MODIFIER_STATE } from './engine/TouchGestureManager';
import { useModelerStore } from './state/useModelerStore';
import { LOOPA_APPS, PROJECT_DOMAIN_LABELS } from './core/ecosystem/apps';
import {
  computeProjectSignature,
  createEmptyEcosystemMeta,
  finalizeAppSession,
  findStaleUvObjects,
  type ProjectSignature,
  type SessionResult,
} from './core/ecosystem/signatures';
import type { LoopaAppId } from './core/ecosystem/types';
import { ShareWithEcosystemModal } from './components/ecosystem/ShareWithEcosystemModal';

export default function App() {
  const store = useModelerStore();

  const [activeView, setActiveView] = useState<'gallery' | WorkspaceId>(
    DEMO_MODE ? 'layout' : 'gallery',
  );
  const [showReturnGuardModal, setShowReturnGuardModal] = useState(false);
  const [exitingToGallery, setExitingToGallery] = useState(false);

  const [toolbarPrefs, setToolbarPrefs] = useState<ToolbarLayoutPreferences>(
    () => loadToolbarLayoutPreferences(),
  );

  const updateToolbarPrefs = useCallback(
    (
      updater: (prev: ToolbarLayoutPreferences) => ToolbarLayoutPreferences,
    ) => {
      setToolbarPrefs((prev) => {
        const next = updater(prev);
        saveToolbarLayoutPreferences(next);
        return next;
      });
    },
    [],
  );

  const handleToggleBarhome = useCallback(() => {
    updateToolbarPrefs((prev) => ({
      ...prev,
      barhomeVisible: !prev.barhomeVisible,
    }));
  }, [updateToolbarPrefs]);

  const handleCycleLeftToolbarMode = useCallback(() => {
    updateToolbarPrefs((prev) => ({
      ...prev,
      leftToolbarMode: getNextLeftToolbarDisplayMode(prev.leftToolbarMode),
    }));
  }, [updateToolbarPrefs]);

  const handleToggleLiner = useCallback(() => {
    if (activeView !== 'layout' && activeView !== 'gallery') {
      updateToolbarPrefs((prev) => ({ ...prev, linerVisible: true }));
      setActiveView('layout');
      return;
    }
    updateToolbarPrefs((prev) => ({
      ...prev,
      linerVisible: !prev.linerVisible,
    }));
  }, [activeView, updateToolbarPrefs]);

  const handleToggleModuleExpanded = useCallback(
    (moduleId: SidebarModuleId) => {
      updateToolbarPrefs((prev) => ({
        ...prev,
        expandedModules: {
          ...prev.expandedModules,
          [moduleId]: !prev.expandedModules[moduleId],
        },
      }));
    },
    [updateToolbarPrefs],
  );

  const handleReorderModules = useCallback(
    (nextOrder: SidebarModuleId[]) => {
      updateToolbarPrefs((prev) => ({
        ...prev,
        moduleOrder: nextOrder,
      }));
    },
    [updateToolbarPrefs],
  );

  const handleResetModuleLayout = useCallback(() => {
    updateToolbarPrefs((prev) => resetModuleOrganizationInPrefs(prev));
    store.showToast('Organización de módulos restablecida');
  }, [store, updateToolbarPrefs]);
  const [projectModalMode, setProjectModalMode] =
    useState<ProjectModalMode | null>(null);
  const [settingsModalTab, setSettingsModalTab] =
    useState<SettingsTabId | null>(null);
  const [timelapseTarget, setTimelapseTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [effectiveModifiers, setEffectiveModifiers] =
    useState<TouchModifierState>(EMPTY_MODIFIER_STATE);
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const uvWorkspaceRef = useRef<UVWorkspaceHandle | null>(null);
  const [uvQuickState, setUvQuickState] = useState<UVQuickAccessState | null>(
    null,
  );
  const [liveTransformOverride, setLiveTransformOverride] = useState<{
    id: string;
    transform: ObjectTransform;
  } | null>(null);
  const [linerTab, setLinerTab] = useState<
    'hierarchy' | 'modifiers' | 'materials'
  >('hierarchy');
  const [dismissedNgonKey, setDismissedNgonKey] = useState<string | null>(null);
  const [launcherProject, setLauncherProject] = useState<ProjectSummary | null>(null);

  // Import/Export workflow states & modals
  const [pendingStl, setPendingStl] = useState<PendingStlImport | null>(null);
  const [pendingRefImage, setPendingRefImage] =
    useState<LoadedImageReferencePayload | null>(null);
  const [exportModalConfig, setExportModalConfig] = useState<{
    format: ExportFormat;
    scope: ExportScope;
  } | null>(null);
  const [ioProgress, setIoProgress] = useState<{
    title: string;
    label: string;
    progress: number;
  } | null>(null);
  const [ioError, setIoError] = useState<{
    title: string;
    message: string;
  } | null>(null);

  // Hidden file inputs mounted synchronously for iPad Safari compatibility
  const objInputRef = useRef<HTMLInputElement | null>(null);
  const stlInputRef = useRef<HTMLInputElement | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const externalImportInputRef = useRef<HTMLInputElement | null>(null);
  const jpgInputRef = useRef<HTMLInputElement | null>(null);
  const pngInputRef = useRef<HTMLInputElement | null>(null);
  const nativeProjectInputRef = useRef<HTMLInputElement | null>(null);
  const lastGKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    store.registerThumbnailProvider(
      () => viewportRef.current?.captureThumbnail() ?? null,
    );
    return () => store.registerThumbnailProvider(null);
  }, [store.registerThumbnailProvider]);

  useEffect(() => {
    store.registerCameraStateProvider(
      () => viewportRef.current?.getCameraState() ?? null,
    );
    return () => store.registerCameraStateProvider(null);
  }, [store.registerCameraStateProvider]);

  useEffect(() => {
    store.setModelerActive(activeView !== 'gallery');
  }, [activeView, store.setModelerActive]);

  useEffect(() => {
    document.title = getAppDocumentTitle();
  }, []);

  // Prompt confirmation before closing browser tab if there are unsaved changes in active modeler session
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeView !== 'gallery' && store.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeView, store.hasUnsavedChanges]);

  const handleLiveObjectTransform = useCallback(
    (id: string, transform: ObjectTransform) => {
      setLiveTransformOverride({ id, transform });
    },
    [],
  );

  const handleCommitObjectTransform = useCallback(
    (id: string, before: ObjectTransform, after: ObjectTransform) => {
      setLiveTransformOverride(null);
      store.commitObjectTransformFromGizmo(id, before, after);
    },
    [store],
  );

  const handleCommitObjectTransforms = useCallback(
    (changes: ObjectTransformChange[]) => {
      setLiveTransformOverride(null);
      store.commitObjectTransformsFromGizmo(changes);
    },
    [store],
  );

  /* ==========================================================================
   * File Import Handlers (OBJ, STL, JPG, PNG)
   * ======================================================================== */
  const handleObjFilesSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const objFile = files.find((f) => f.name.toLowerCase().endsWith('.obj'));
      const mtlFile = files.find((f) => f.name.toLowerCase().endsWith('.mtl'));

      if (!objFile) {
        setIoError({
          title: 'Archivo no compatible',
          message:
            'Selecciona un archivo con extensión .obj (opcionalmente acompañado de su archivo .mtl).',
        });
        return;
      }

      if (objFile.size === 0) {
        setIoError({
          title: 'Archivo OBJ vacío',
          message: `El archivo "${objFile.name}" no contiene datos.`,
        });
        return;
      }

      if (objFile.size > MAX_IMPORT_FILE_BYTES) {
        setIoError({
          title: 'Archivo demasiado grande',
          message: `El archivo "${objFile.name}" supera el límite seguro de ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
        });
        return;
      }

      try {
        setIoProgress({
          title: 'Importando modelo OBJ',
          label: `Leyendo "${objFile.name}"...`,
          progress: 0.05,
        });
        const objText = await objFile.text();
        const mtlText = mtlFile ? await mtlFile.text() : undefined;

        const result = await parseObjContent(objText, objFile.name, {
          mtlText,
          onProgress: (progress, label) => {
            setIoProgress({
              title: 'Importando modelo OBJ',
              label,
              progress,
            });
          },
        });

        store.importObjParts(result);
        setIoProgress(null);

        if (result.warnings.length > 0) {
          store.showToast(result.warnings[0]);
        }
      } catch (err) {
        setIoProgress(null);
        setIoError({
          title: 'Error al importar OBJ',
          message:
            err instanceof Error
              ? err.message
              : 'El archivo OBJ está dañado o no pudo procesarse.',
        });
      }
    },
    [store],
  );

  const handleStlFileSelected = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!file.name.toLowerCase().endsWith('.stl')) {
      setIoError({
        title: 'Archivo no compatible',
        message: 'Selecciona un archivo 3D con extensión .stl.',
      });
      return;
    }

    if (file.size === 0) {
      setIoError({
        title: 'Archivo STL vacío',
        message: `El archivo "${file.name}" está vacío.`,
      });
      return;
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setIoError({
        title: 'Archivo demasiado grande',
        message: `El archivo "${file.name}" supera el límite seguro de ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
      });
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const inspection = inspectStlBuffer(buffer);
      setPendingStl({
        fileName: file.name,
        fileSizeBytes: file.size,
        buffer,
        inspection,
      });
    } catch (err) {
      setIoError({
        title: 'Error al leer STL',
        message:
          err instanceof Error
            ? err.message
            : 'El archivo STL está dañado o no es compatible.',
      });
    }
  }, []);

  const handleGlbFileSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const file = fileList[0];
      if (!file.name.toLowerCase().endsWith('.glb')) {
        setIoError({
          title: 'Archivo no compatible',
          message: 'Selecciona un archivo 3D con extensión .glb.',
        });
        return;
      }
      if (file.size === 0) {
        setIoError({ title: 'Archivo GLB vacío', message: `El archivo "${file.name}" está vacío.` });
        return;
      }
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setIoError({
          title: 'Archivo demasiado grande',
          message: `El archivo "${file.name}" supera el límite seguro de ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
        });
        return;
      }
      try {
        setIoProgress({
          title: 'Importando modelo GLB',
          label: `Leyendo "${file.name}"...`,
          progress: 0.05,
        });
        const result = await parseGlbBuffer(await file.arrayBuffer(), file.name, {
          onProgress: (progress, label) => {
            setIoProgress({
              title: 'Importando modelo GLB',
              label,
              progress,
            });
          },
        });
        store.importObjParts(result);
        setIoProgress(null);
      } catch (err) {
        setIoProgress(null);
        setIoError({
          title: 'Error al importar GLB',
          message:
            err instanceof Error
              ? err.message
              : 'El archivo GLB está dañado o no pudo procesarse.',
        });
      }
    },
    [store],
  );

  const handleConfirmStlImport = useCallback(
    async (scale: number) => {
      if (!pendingStl) return;
      const target = pendingStl;
      setPendingStl(null);
      try {
        setIoProgress({
          title: 'Importando modelo STL',
          label: `Procesando "${target.fileName}"...`,
          progress: 0.08,
        });
        const result = await parseStlBuffer(target.buffer, target.fileName, {
          scale,
          onProgress: (progress, label) => {
            setIoProgress({
              title: 'Importando modelo STL',
              label,
              progress,
            });
          },
        });
        if (target.isGalleryImport) {
          const modelProject = buildImportedModelProjectData({
            projectName: result.name,
            folderId: target.targetGalleryFolderId ?? null,
            stlResult: result,
          });
          const res = await store.importModelAsNewProject(modelProject);
          setIoProgress(null);
          if (!res.ok) {
            setIoError({
              title: 'Error al guardar proyecto STL',
              message:
                res.error ??
                'No se pudo crear el proyecto en la galería.',
            });
            return;
          }
          if (result.warnings.length > 0) {
            store.showToast(result.warnings[0]);
          }
        } else {
          store.importStlResult(result);
          setIoProgress(null);
          if (result.warnings.length > 0) {
            store.showToast(result.warnings[0]);
          }
        }
      } catch (err) {
        setIoProgress(null);
        setIoError({
          title: 'Error al importar STL',
          message:
            err instanceof Error
              ? err.message
              : 'No se pudo procesar la geometría STL.',
        });
      }
    },
    [pendingStl, store],
  );

  const handleGalleryModelFilesSelected = useCallback(
    async (fileList: FileList, targetFolderId: string | null) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const objFile = files.find((f) => f.name.toLowerCase().endsWith('.obj'));
      const mtlFile = files.find((f) => f.name.toLowerCase().endsWith('.mtl'));
      const stlFile = files.find((f) => f.name.toLowerCase().endsWith('.stl'));
      const glbFile = files.find((f) => f.name.toLowerCase().endsWith('.glb'));

      if (glbFile) {
        if (glbFile.size === 0) {
          setIoError({
            title: 'Archivo GLB vacío',
            message: `El archivo "${glbFile.name}" está vacío.`,
          });
          return;
        }
        if (glbFile.size > MAX_IMPORT_FILE_BYTES) {
          setIoError({
            title: 'Archivo demasiado grande',
            message: `El archivo "${glbFile.name}" supera el límite seguro de ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
          });
          return;
        }
        try {
          setIoProgress({
            title: 'Importando modelo GLB a galería',
            label: `Leyendo "${glbFile.name}"...`,
            progress: 0.05,
          });
          const result = await parseGlbBuffer(await glbFile.arrayBuffer(), glbFile.name);
          const modelProject = buildImportedModelProjectData({
            projectName: stripFileExtension(glbFile.name),
            folderId: targetFolderId,
            objParts: result.parts,
          });
          const res = await store.importModelAsNewProject(modelProject);
          setIoProgress(null);
          if (!res.ok) {
            setIoError({
              title: 'Error al guardar modelo GLB',
              message: res.error ?? 'No se pudo crear el proyecto en la galería.',
            });
            return;
          }
        } catch (err) {
          setIoProgress(null);
          setIoError({
            title: 'Error al importar GLB',
            message: err instanceof Error ? err.message : 'No se pudo procesar el archivo GLB.',
          });
        }
        return;
      }

      if (objFile) {
        if (objFile.size === 0) {
          setIoError({
            title: 'Archivo OBJ vacío',
            message: `El archivo "${objFile.name}" no contiene datos.`,
          });
          return;
        }
        if (objFile.size > MAX_IMPORT_FILE_BYTES) {
          setIoError({
            title: 'Archivo demasiado grande',
            message: `El archivo "${objFile.name}" supera el límite seguro de ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
          });
          return;
        }
        try {
          setIoProgress({
            title: 'Importando modelo OBJ a galería',
            label: `Leyendo "${objFile.name}"...`,
            progress: 0.05,
          });
          const objText = await objFile.text();
          const mtlText = mtlFile ? await mtlFile.text() : undefined;
          const result = await parseObjContent(objText, objFile.name, {
            mtlText,
            onProgress: (progress, label) => {
              setIoProgress({
                title: 'Importando modelo OBJ a galería',
                label,
                progress,
              });
            },
          });
          const modelProject = buildImportedModelProjectData({
            projectName: stripFileExtension(objFile.name),
            folderId: targetFolderId,
            objParts: result.parts,
          });
          const res = await store.importModelAsNewProject(modelProject);
          setIoProgress(null);
          if (!res.ok) {
            setIoError({
              title: 'Error al guardar modelo OBJ',
              message:
                res.error ??
                'No se pudo crear el proyecto en la galería.',
            });
            return;
          }
          if (result.warnings.length > 0) {
            store.showToast(result.warnings[0]);
          }
        } catch (err) {
          setIoProgress(null);
          setIoError({
            title: 'Error al importar OBJ',
            message:
              err instanceof Error
                ? err.message
                : 'El archivo OBJ está dañado o no pudo procesarse.',
          });
        }
        return;
      }

      if (stlFile) {
        if (stlFile.size === 0) {
          setIoError({
            title: 'Archivo STL vacío',
            message: `El archivo "${stlFile.name}" está vacío.`,
          });
          return;
        }
        if (stlFile.size > MAX_IMPORT_FILE_BYTES) {
          setIoError({
            title: 'Archivo demasiado grande',
            message: `El archivo "${stlFile.name}" supera el límite seguro de ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
          });
          return;
        }
        try {
          const buffer = await stlFile.arrayBuffer();
          const inspection = inspectStlBuffer(buffer);
          setPendingStl({
            fileName: stlFile.name,
            fileSizeBytes: stlFile.size,
            buffer,
            inspection,
            targetGalleryFolderId: targetFolderId,
            isGalleryImport: true,
          });
        } catch (err) {
          setIoError({
            title: 'Error al leer STL',
            message:
              err instanceof Error
                ? err.message
                : 'El archivo STL está dañado o no es compatible.',
          });
        }
        return;
      }

      setIoError({
        title: 'Formato no compatible',
        message:
          'Selecciona un modelo .obj (opcionalmente con .mtl), .stl o .glb.',
      });
    },
    [store],
  );

  const handleImageFileSelected = useCallback(
    async (fileList: FileList | null, expectedFormat: 'jpg' | 'png') => {
      if (!fileList || fileList.length === 0) return;
      const file = fileList[0];
      try {
        const payload = await loadReferenceImageFile(file, expectedFormat);
        setPendingRefImage(payload);
      } catch (err) {
        setIoError({
          title: 'Imagen de referencia no compatible',
          message:
            err instanceof Error
              ? err.message
              : 'No se pudo cargar la imagen seleccionada.',
        });
      }
    },
    [],
  );

  const handleExternalImportSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const file = fileList[0];
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.obj')) {
        await handleObjFilesSelected(fileList);
      } else if (lowerName.endsWith('.stl')) {
        await handleStlFileSelected(fileList);
      } else if (lowerName.endsWith('.glb')) {
        await handleGlbFileSelected(fileList);
      } else if (lowerName.endsWith('.png')) {
        await handleImageFileSelected(fileList, 'png');
      } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
        await handleImageFileSelected(fileList, 'jpg');
      } else {
        setIoError({
          title: 'Formato no compatible',
          message: 'Selecciona OBJ, STL, GLB, PNG, JPG o JPEG.',
        });
      }
    },
    [
      handleGlbFileSelected,
      handleImageFileSelected,
      handleObjFilesSelected,
      handleStlFileSelected,
    ],
  );

  const handleConfirmReferenceImage = useCallback(
    (orientation: ReferenceImageOrientation) => {
      if (!pendingRefImage) return;
      store.addReferenceImage(pendingRefImage, orientation);
      setPendingRefImage(null);
    },
    [pendingRefImage, store],
  );

  /* ==========================================================================
   * Export Handlers (OBJ / STL)
   * ======================================================================== */
  const openExportModal = useCallback(
    (format: ExportFormat, scope: ExportScope) => {
      if (DEMO_MODE) {
        store.showToast('La exportación no está disponible en la demo');
        return;
      }
      if (scope === 'selected' && !store.selectedObjectId) {
        store.showToast('Selecciona un objeto o exporta la escena completa');
        return;
      }
      setExportModalConfig({ format, scope });
    },
    [store],
  );

  const handleExecuteExport = useCallback(
    async (config: ExportRequestConfig) => {
      const sceneObjects = store.activeScene.objects;
      let targets: SceneObjectData[] = [];
      if (config.scope === 'selected') {
        const sel = sceneObjects.find((o) => o.id === store.selectedObjectId);
        if (sel) targets = [sel];
      } else if (config.scope === 'multiple') {
        const idSet = new Set(config.selectedIds);
        targets = sceneObjects.filter((o) => idSet.has(o.id));
      } else {
        targets = sceneObjects;
      }

      const evaluatedTargets = evaluateObjectsForExport(targets, sceneObjects);
      const baseFilename =
        config.scope === 'selected' && targets.length === 1
          ? stripFileExtension(targets[0].name)
          : stripFileExtension(store.project.name || 'escena');

      setExportModalConfig(null);

      try {
        if (config.format === 'obj') {
          setIoProgress({
            title: 'Exportando modelo OBJ',
            label: 'Preparando geometría...',
            progress: 0.1,
          });
          const result = await exportObjectsToObj(evaluatedTargets, {
            applyTransform: config.applyTransform,
            exportScale: config.exportScale,
            materials: store.materials,
            onProgress: (progress, label) => {
              setIoProgress({
                title: 'Exportando modelo OBJ',
                label,
                progress,
              });
            },
          });
          triggerFileDownload(
            result.objText,
            `${baseFilename}.obj`,
            'text/plain;charset=utf-8',
          );
          setIoProgress(null);
          const skippedMsg =
            result.skippedObjects.length > 0
              ? ` (${result.skippedObjects.length} omitido(s))`
              : '';
          store.showToast(
            `OBJ exportado: ${result.exportedCount} objeto(s)${skippedMsg}`,
          );
        } else if (config.format === 'stl') {
          setIoProgress({
            title: 'Exportando modelo STL',
            label: 'Verificando y triangulando mallas...',
            progress: 0.1,
          });
          const result = await exportObjectsToStl(evaluatedTargets, {
            binary: config.stlBinary,
            applyTransform: config.applyTransform,
            exportScale: config.exportScale,
            onProgress: (progress, label) => {
              setIoProgress({
                title: 'Exportando modelo STL',
                label,
                progress,
              });
            },
          });
          triggerFileDownload(
            result.data,
            `${baseFilename}.stl`,
            config.stlBinary
              ? 'application/octet-stream'
              : 'model/stl;charset=utf-8',
          );
          setIoProgress(null);
          const skippedMsg =
            result.validation.skippedObjects.length > 0
              ? ` · ${result.validation.skippedObjects.length} omitido(s)`
              : '';
          store.showToast(
            `STL exportado (${result.totalTriangles.toLocaleString()} triángulos)${skippedMsg}`,
          );
        } else {
          setIoProgress({
            title: 'Exportando modelo GLB',
            label: 'Preparando geometría...',
            progress: 0.1,
          });
          const result = await exportObjectsToGlb(evaluatedTargets, {
            applyTransform: config.applyTransform,
            exportScale: config.exportScale,
            materials: store.materials,
            onProgress: (progress, label) => {
              setIoProgress({
                title: 'Exportando modelo GLB',
                label,
                progress,
              });
            },
          });
          triggerFileDownload(
            result.data,
            `${baseFilename}.glb`,
            'model/gltf-binary',
          );
          setIoProgress(null);
          const skippedMsg =
            result.skippedObjects.length > 0
              ? ` (${result.skippedObjects.length} omitido(s))`
              : '';
          store.showToast(
            `GLB exportado: ${result.exportedCount} objeto(s)${skippedMsg}`,
          );
        }
      } catch (err) {
        setIoProgress(null);
        setIoError({
          title: `Error al exportar ${config.format.toUpperCase()}`,
          message:
            err instanceof Error
              ? err.message
              : 'No se pudo completar la exportación.',
        });
      }
    },
    [store],
  );

  const enterModelerWithResetCamera = useCallback(() => {
    setActiveView('layout');
    window.requestAnimationFrame(() => {
      viewportRef.current?.resetCamera();
    });
  }, []);

  // ── LOOPA Core: which ecosystem app is active and what each session changed ──
  const lastAppIdRef = useRef<LoopaAppId>('modeler');
  const activeAppId: LoopaAppId | null = (() => {
    if (activeView === 'gallery') return null;
    if (activeView === 'uv_editing') return 'uvs';
    if (activeView === 'materials') return 'materials';
    if (activeView === 'layout') return store.workMode === 'sculpt' ? 'sculpt' : 'modeler';
    return lastAppIdRef.current;
  })();
  if (activeAppId) lastAppIdRef.current = activeAppId;

  const projectRef = useRef(store.project);
  projectRef.current = store.project;
  const sessionRef = useRef<{
    appId: LoopaAppId;
    projectId: string;
    baseline: ProjectSignature;
  } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  /** Record what the current app session changed and start a fresh baseline. */
  const commitEcosystemSession = useCallback((): SessionResult | null => {
    const session = sessionRef.current;
    const proj = projectRef.current;
    if (!session || session.projectId !== proj.id) return null;
    const result = finalizeAppSession(proj, session.appId, session.baseline);
    sessionRef.current = { ...session, baseline: computeProjectSignature(proj) };
    const appName = LOOPA_APPS[session.appId].name;
    if (result.violations.length > 0) {
      const labels = result.violations.map((d) => PROJECT_DOMAIN_LABELS[d]).join(', ');
      store.showToast(
        `Aviso de LOOPA Core: ${appName} modificó ${labels}, un área que pertenece a otra aplicación.`,
      );
    } else if (result.changed.includes('topology') && result.staleUvObjects.length > 0) {
      const names = result.staleUvObjects.map((o) => o.name).slice(0, 3).join(', ');
      store.showToast(
        `La geometría de ${names} cambió después de editar sus UVs. Las UVs podrían necesitar actualización.`,
      );
    }
    return result;
  }, [store.showToast]);

  useEffect(() => {
    const session = sessionRef.current;
    const projectId = store.project.id;
    if (session && session.appId === activeAppId && session.projectId === projectId) return;
    if (session && session.projectId === projectId) {
      const result = commitEcosystemSession();
      if (result) store.setEcosystemMeta(result.meta);
    }
    sessionRef.current = activeAppId
      ? {
          appId: activeAppId,
          projectId,
          baseline: computeProjectSignature(projectRef.current),
        }
      : null;
    if (activeAppId === 'uvs') {
      const stale = findStaleUvObjects(projectRef.current, projectRef.current.ecosystem);
      if (stale.length > 0) {
        store.showToast(
          `Revisa las UVs de ${stale.map((o) => o.name).slice(0, 3).join(', ')}: su geometría cambió desde la última edición UV.`,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAppId, store.project.id]);

  const handleChangeWorkspace = useCallback(
    (nextWorkspace: WorkspaceId) => {
      if (nextWorkspace === 'uv_editing') {
        if (!store.selectedObject || store.selectedObject.objectType !== 'mesh') {
          const firstMesh = store.activeScene.objects.find(
            (o) => o.objectType === 'mesh',
          );
          if (firstMesh) {
            store.selectObject(firstMesh.id);
          }
        }
      } else if (nextWorkspace === 'timelapse') {
        void store.refreshTimelapseMeta(store.project.id);
      }
      setActiveView(nextWorkspace);
    },
    [store],
  );

  /** Open the active project in one of the LOOPA apps. */
  const handleLaunchAppFromEcosystem = useCallback(
    (appId: LoopaAppId) => {
      setLauncherProject(null);
      if (appId === 'sculpt') {
        if (store.enterAppWorkMode('sculpt')) {
          enterModelerWithResetCamera();
        }
        return;
      }
      store.enterAppWorkMode('modeler');
      if (appId === 'modeler') {
        enterModelerWithResetCamera();
      } else if (appId === 'uvs') {
        handleChangeWorkspace('uv_editing');
      } else if (appId === 'materials') {
        handleChangeWorkspace('materials');
      }
    },
    [enterModelerWithResetCamera, handleChangeWorkspace, store],
  );

  /** "Compartir con LOOPA Ecosystem": save, then open the same project in another app. */
  const handleShareWithEcosystem = useCallback(
    async (target: LoopaAppId): Promise<boolean> => {
      const result = commitEcosystemSession();
      const meta =
        result?.meta ?? store.project.ecosystem ?? createEmptyEcosystemMeta();
      const thumb = viewportRef.current?.captureThumbnail() ?? undefined;
      const saved = await store.saveProjectWithEcosystem(meta, thumb);
      if (!saved) return false;
      setShowShareModal(false);
      handleLaunchAppFromEcosystem(target);
      store.showToast(`"${store.project.name}" abierto en ${LOOPA_APPS[target].name}`);
      return true;
    },
    [commitEcosystemSession, handleLaunchAppFromEcosystem, store],
  );

  const handleOpenProjectFromGallery = useCallback(
    async (projectId: string): Promise<boolean> => {
      const opened = await store.openProject(projectId);
      if (opened) {
        const projSummary = store.savedProjects.find((p) => p.id === projectId) ?? {
          id: store.project.id,
          name: store.project.name,
          createdAt: store.project.createdAt,
          updatedAt: store.project.updatedAt,
          objectCount: store.renderedObjects.length,
          folderId: store.project.folderId ?? null,
        };
        setLauncherProject(projSummary);
      }
      return opened;
    },
    [store],
  );

  const handleCreateProjectFromGallery = useCallback(
    async (
      name: string,
      templateId: ProjectTemplateId,
      folderId: string | null,
    ) => {
      const created = await store.createProject(name, templateId, folderId);
      if (created) {
        const projSummary = {
          id: store.project.id,
          name: store.project.name,
          createdAt: store.project.createdAt,
          updatedAt: store.project.updatedAt,
          objectCount: store.renderedObjects.length,
          folderId: store.project.folderId ?? null,
        };
        setLauncherProject(projSummary);
      }
      return created;
    },
    [store],
  );

  const handleReturnToGallery = useCallback(async () => {
    if (DEMO_MODE) {
      store.showToast('La galería no está disponible en la demo');
      return;
    }
    if (exitingToGallery) return;
    const session = commitEcosystemSession();
    const meta =
      session?.meta ?? store.project.ecosystem ?? createEmptyEcosystemMeta();
    if (store.hasUnsavedChanges) {
      if (store.settings.autosaveEnabled) {
        setExitingToGallery(true);
        const savedOk = await store.saveProjectWithEcosystem(meta);
        setExitingToGallery(false);
        if (savedOk) {
          setActiveView('gallery');
          return;
        }
      }
      store.setEcosystemMeta(meta);
      setShowReturnGuardModal(true);
      return;
    }

    const thumb = viewportRef.current?.captureThumbnail();
    await store.saveProjectWithEcosystem(meta, thumb ?? undefined);
    setActiveView('gallery');
  }, [commitEcosystemSession, exitingToGallery, store]);

  const handleExportNativeFromModeler = useCallback(async () => {
    if (DEMO_MODE) {
      store.showToast('La exportación no está disponible en la demo');
      return;
    }
    const res = await store.exportNativeProject();
    if (!res) return;
    triggerFileDownload(
      res.content,
      res.filename,
      'application/json;charset=utf-8',
    );
    store.showToast(`Proyecto exportado: ${res.filename}`);
  }, [store]);

  const handleImportNativeFromModeler = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      try {
        const text = await fileList[0].text();
        const res = await store.importNativeProject(text);
        if (!res.ok || !res.project) {
          setIoError({
            title: 'Error al importar proyecto',
            message: res.error ?? 'No se pudo leer el archivo de proyecto.',
          });
          return;
        }
        const opened = await store.openProject(res.project.id, {
          skipRecoveryCheck: true,
        });
        if (opened) {
          enterModelerWithResetCamera();
        }
      } catch {
        setIoError({
          title: 'Error al importar proyecto',
          message: 'No se pudo leer el archivo seleccionado.',
        });
      }
    },
    [enterModelerWithResetCamera, store],
  );

  // Keyboard shortcuts for iPad Magic Keyboard / Desktop testing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeView === 'gallery') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      const shiftHeld = e.shiftKey || store.screenModifiers.shift;
      const ctrlHeld = e.ctrlKey || e.metaKey || store.screenModifiers.ctrl;
      const altHeld = e.altKey || store.screenModifiers.alt;

      if (ctrlHeld && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void store.saveProject();
        return;
      }

      if (activeView !== 'layout' && activeView !== 'materials') {
        if (ctrlHeld && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (shiftHeld) store.redo();
          else store.undo();
        }
        return;
      }

      if (ctrlHeld && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (shiftHeld) store.redo();
        else store.undo();
        return;
      }

      if (e.key === 'Escape' && store.operatorSession) {
        e.preventDefault();
        store.cancelEditOperator();
        return;
      }
      if (e.key === 'Escape' && store.modalTransform) {
        e.preventDefault();
        store.cancelModalTransform();
        return;
      }
      if (e.key === 'Enter' && store.operatorSession) {
        e.preventDefault();
        store.confirmEditOperator();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'tab':
          if (!ctrlHeld && !altHeld) {
            e.preventDefault();
            store.toggleWorkMode(
              store.workMode === 'object' ? 'edit' : 'object',
            );
          }
          break;
        case 'g':
          if (store.workMode === 'sculpt') break;
          if (!ctrlHeld && !altHeld && !e.repeat) {
            const now = performance.now();
            const isSecondG =
              store.modalTransform?.mode === 'move' ||
              now - lastGKeyTimeRef.current <= 450;
            lastGKeyTimeRef.current = now;
            if (
              isSecondG &&
              store.workMode === 'edit' &&
              (store.editSelectionMode === 'vertex' ||
                store.editSelectionMode === 'edge')
            ) {
              store.triggerGHoldSlide();
            } else {
              store.triggerGQuickTapMove();
            }
          }
          break;
        case 'r':
          if (store.workMode === 'sculpt') break;
          if (!ctrlHeld && !altHeld) store.setActiveTool('rotate');
          break;
        case 's':
          if (store.workMode === 'sculpt') break;
          if (!ctrlHeld && !altHeld) store.setActiveTool('scale');
          break;
        case 'q':
          if (store.workMode === 'sculpt') break;
          if (!ctrlHeld && !altHeld) store.setActiveTool('select');
          break;
        case 'e':
          if (!ctrlHeld && !altHeld && store.workMode === 'edit' && !store.operatorSession) {
            store.startEditOperator('extrude');
          }
          break;
        case 'i':
          if (!ctrlHeld && !altHeld && store.workMode === 'edit' && !store.operatorSession) {
            store.startEditOperator('inset');
          }
          break;
        case 'b':
          if (!ctrlHeld && !altHeld && store.workMode === 'edit' && !store.operatorSession) {
            store.startEditOperator('bevel');
          }
          break;
        case 'k':
          if (!ctrlHeld && !altHeld && store.workMode === 'edit' && !store.operatorSession) {
            store.startEditOperator('loop_cut');
          }
          break;
        case 'm':
          if (!ctrlHeld && !altHeld && store.workMode === 'edit' && !store.operatorSession) {
            store.startEditOperator('merge');
          }
          break;
        case 'f':
          if (!ctrlHeld && !altHeld && store.workMode === 'edit' && !store.operatorSession) {
            store.executeFillSelection();
          }
          break;
        case 'j':
          if (
            store.workMode === 'edit' &&
            !store.operatorSession &&
            !ctrlHeld &&
            !altHeld
          ) {
            e.preventDefault();
            store.executeConnectVertexPath();
          }
          break;
        case 'o':
          if (
            store.workMode === 'edit' &&
            !store.operatorSession &&
            !ctrlHeld
          ) {
            e.preventDefault();
            if (altHeld) {
              store.toggleProportionalConnected();
            } else if (shiftHeld) {
              store.cycleProportionalFalloff();
            } else {
              store.toggleProportionalEditing();
            }
          }
          break;
        case '[':
          if (store.workMode === 'sculpt') {
            e.preventDefault();
            store.updateSculptSettings({
              radius: Math.max(0.05, store.sculptSettings.radius * 0.88),
            });
          } else if (
            store.workMode === 'edit' &&
            !store.operatorSession &&
            store.settings.proportionalEditing.enabled
          ) {
            e.preventDefault();
            store.setProportionalRadius(
              store.settings.proportionalEditing.radius * 0.9,
            );
          }
          break;
        case ']':
          if (store.workMode === 'sculpt') {
            e.preventDefault();
            store.updateSculptSettings({
              radius: Math.min(3, store.sculptSettings.radius * 1.12),
            });
          } else if (
            store.workMode === 'edit' &&
            !store.operatorSession &&
            store.settings.proportionalEditing.enabled
          ) {
            e.preventDefault();
            store.setProportionalRadius(
              store.settings.proportionalEditing.radius * 1.1,
            );
          }
          break;
        case 'x':
          if (store.workMode === 'sculpt') break;
          if (!ctrlHeld && !altHeld) {
            store.setAxisConstraint(store.axisConstraint === 'x' ? 'free' : 'x');
          }
          break;
        case 'y':
          if (store.workMode === 'sculpt') break;
          if (!ctrlHeld && !altHeld) {
            store.setAxisConstraint(store.axisConstraint === 'y' ? 'free' : 'y');
          }
          break;
        case 'z':
          if (store.workMode === 'sculpt') break;
          if (!ctrlHeld && !altHeld) {
            store.setAxisConstraint(store.axisConstraint === 'z' ? 'free' : 'z');
          }
          break;
        case 'a':
          if (!ctrlHeld && store.workMode === 'edit' && !store.operatorSession) {
            if (altHeld) store.deselectAllEditComponents();
            else store.selectAllEditComponents();
          }
          break;
        case 'delete':
        case 'backspace':
          if (store.workMode === 'edit' && !store.operatorSession) {
            store.deleteSelectedEditComponents();
          } else if (
            (store.selectedObjectIds.size > 0 || store.selectedObjectId) &&
            !store.operatorSession
          ) {
            store.deleteSelectedObjects();
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeView, store]);

  const canEditSelected = Boolean(
    store.selectedObject &&
      store.selectedObject.objectType === 'mesh' &&
      !store.selectedObject.locked,
  );

  const handleSubdivideSelectedMeshForSculpt = useCallback(() => {
    const obj = store.selectedObject;
    if (!obj || obj.objectType !== 'mesh' || obj.locked) return;
    if (obj.mesh.faces.length > 6000) {
      store.showToast(
        'La malla ya tiene alta densidad de subdivisión para esculpir',
      );
      return;
    }
    const before = EditableMesh.fromJSON(obj.mesh);
    const allFaces = new Set(before.faces.map((f) => f.id));
    const res = subdivideMesh(before, 'face', allFaces, {
      cuts: 1,
      smoothness: obj.primitiveType === 'uv_sphere' ? 1 : 0.35,
      fractal: 0,
    });
    store.commitMeshEditFromGizmo(obj.id, before, res.mesh);
    store.showToast(
      `Malla subdividida (${res.mesh.vertices.length} vértices)`,
    );
  }, [store]);

  const sceneStats: SceneStatsInfo = useMemo(() => {
    const topo = store.selectedObject
      ? {
          vertices: store.selectedObject.mesh.vertices.length,
          edges: store.selectedObject.mesh.edges.length,
          faces: store.selectedObject.mesh.faces.length,
        }
      : store.renderedObjects.reduce(
          (acc, obj) => {
            acc.vertices += obj.mesh.vertices.length;
            acc.edges += obj.mesh.edges.length;
            acc.faces += obj.mesh.faces.length;
            return acc;
          },
          { vertices: 0, edges: 0, faces: 0 },
        );
    return {
      objectCount: store.renderedObjects.length,
      selectedObjectCount: store.selectedObjectIds.size,
      selectedComponentCount: store.selectedComponentIds.size,
      activeObjectName: store.selectedObject?.name ?? null,
      vertices: topo.vertices,
      edges: topo.edges,
      faces: topo.faces,
      workMode: store.workMode,
      editSelectionMode: store.editSelectionMode,
    };
  }, [
    store.editSelectionMode,
    store.renderedObjects,
    store.selectedComponentIds.size,
    store.selectedObject,
    store.selectedObjectIds.size,
    store.workMode,
  ]);

  const uvTargetObject = useMemo(
    () =>
      store.selectedObject && store.selectedObject.objectType === 'mesh'
        ? store.selectedObject
        : null,
    [store.selectedObject],
  );

  const uvTargetMesh = useMemo(
    () => (uvTargetObject ? EditableMesh.fromJSON(uvTargetObject.mesh) : null),
    [uvTargetObject],
  );

  const selectedMeshSeamCount = useMemo(() => {
    if (!uvTargetObject) return 0;
    let count = 0;
    for (const edge of uvTargetObject.mesh.edges) {
      if (edge.isSeam) count++;
    }
    return count;
  }, [uvTargetObject, store.meshRevision]);

  const uvTargetMaterialAsset = useMemo(() => {
    if (!uvTargetObject?.materialId) return null;
    return (
      store.materials.find((m) => m.id === uvTargetObject.materialId) ?? null
    );
  }, [store.materials, uvTargetObject?.materialId]);

  const activeNgonSubdivAlert = useMemo(() => {
    if (
      activeView !== 'layout' ||
      !toolbarPrefs.linerVisible ||
      linerTab !== 'modifiers' ||
      !store.selectedObject
    ) {
      return null;
    }
    const mods = store.selectedObject.modifiers ?? [];
    for (const mod of mods) {
      if (
        mod.type === 'subdivision' &&
        mod.enabled &&
        mod.showInViewport !== false
      ) {
        const diag = store.selectedModifierDiagnostics.diagnostics[mod.id];
        if (
          diag?.code === 'ngons_detected' &&
          diag.ngonFaceIds &&
          diag.ngonFaceIds.length > 0
        ) {
          const key = `${store.selectedObject.id}::${mod.id}`;
          return {
            key,
            objectId: store.selectedObject.id,
            faceIds: diag.ngonFaceIds,
            dismissed: dismissedNgonKey === key,
          };
        }
      }
    }
    return null;
  }, [
    activeView,
    dismissedNgonKey,
    linerTab,
    store.selectedModifierDiagnostics.diagnostics,
    store.selectedObject,
    toolbarPrefs.linerVisible,
  ]);

  useEffect(() => {
    if (!activeNgonSubdivAlert && dismissedNgonKey !== null) {
      setDismissedNgonKey(null);
    }
  }, [activeNgonSubdivAlert, dismissedNgonKey]);

  const isViewportVisible =
    activeView === 'layout' || activeView === 'materials';

  const radialBoundsClass = useMemo(() => {
    if (activeView === 'layout') {
      const leftClass =
        toolbarPrefs.leftToolbarMode === 'expanded'
          ? 'left-[218px] sm:left-[234px]'
          : toolbarPrefs.leftToolbarMode === 'compact'
            ? 'left-[68px]'
            : 'left-0';
      const rightClass = toolbarPrefs.linerVisible
        ? 'right-[min(272px,78vw)] sm:right-72'
        : 'right-0';
      return `${leftClass} ${rightClass}`;
    }
    if (activeView === 'materials') {
      return 'left-80 right-0';
    }
    if (activeView === 'uv_editing') {
      return 'left-0 md:left-72 right-0';
    }
    return 'left-0 right-0';
  }, [activeView, toolbarPrefs.leftToolbarMode, toolbarPrefs.linerVisible]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#18191c] text-[#e4e6eb] overflow-hidden select-none">
      {/* Hidden Safari iPad-compatible file pickers (invoked synchronously inside menu clicks) */}
      <input
        ref={externalImportInputRef}
        type="file"
        accept=".obj,.mtl,.stl,.glb,.png,.jpg,.jpeg,image/png,image/jpeg"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleExternalImportSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={objInputRef}
        type="file"
        accept=".obj,.mtl"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleObjFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={stlInputRef}
        type="file"
        accept=".stl"
        className="hidden"
        onChange={(e) => {
          void handleStlFileSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={jpgInputRef}
        type="file"
        accept=".jpg,.jpeg,image/jpeg"
        className="hidden"
        onChange={(e) => {
          void handleImageFileSelected(e.target.files, 'jpg');
          e.target.value = '';
        }}
      />
      <input
        ref={pngInputRef}
        type="file"
        accept=".png,image/png"
        className="hidden"
        onChange={(e) => {
          void handleImageFileSelected(e.target.files, 'png');
          e.target.value = '';
        }}
      />
      <input
        ref={nativeProjectInputRef}
        type="file"
        accept=".forma3d,.json,.forma3d.json,application/json"
        className="hidden"
        onChange={(e) => {
          void handleImportNativeFromModeler(e.target.files);
          e.target.value = '';
        }}
      />

      {/* A. BARHOME — Barra superior independiente con logo permanente de LOOPA */}
      {activeView !== 'gallery' && (
        <TopBar
          demoMode={DEMO_MODE}
          barhomeVisible={toolbarPrefs.barhomeVisible}
          onToggleBarhome={handleToggleBarhome}
          projectName={store.project.name}
          onOpenEcosystemHub={() => setShowShareModal(true)}
          activeAppId={activeAppId ?? undefined}
          hasUnsavedChanges={store.hasUnsavedChanges}
          saveStatus={store.saveStatus}
          lastSaveError={store.lastSaveError}
          activeWorkspace={activeView}
          hasSelectedObject={Boolean(store.selectedObject)}
          displayMode={store.settings.displayMode}
          xrayTransparency={store.settings.xrayTransparency}
          showFaceOrientation={Boolean(store.settings.showFaceOrientation)}
          showGrid={store.settings.showGrid}
          showAxes={store.settings.showAxes}
          projection={store.projection}
          showLiner={toolbarPrefs.linerVisible}
          sceneStats={sceneStats}
          onReturnToGallery={() => {
            void handleReturnToGallery();
          }}
          onCreateProjectModal={() => setProjectModalMode('create')}
          onOpenProjectModal={() => setProjectModalMode('open')}
          onSaveProject={() => {
            void store.saveProject();
          }}
          onSaveAsProjectModal={() => setProjectModalMode('save_as')}
          onImportNativeProject={() => nativeProjectInputRef.current?.click()}
          onExportNativeProject={() => {
            void handleExportNativeFromModeler();
          }}
          onImportExternal={() => externalImportInputRef.current?.click()}
          onExportExternal={() =>
            openExportModal('obj', store.selectedObjectId ? 'selected' : 'scene')
          }
          onOpenSettingsModal={() => setSettingsModalTab('touch')}
          onImportObj={() => objInputRef.current?.click()}
          onImportStl={() => stlInputRef.current?.click()}
          onImportJpg={() => jpgInputRef.current?.click()}
          onImportPng={() => pngInputRef.current?.click()}
          onExportSelected={() => openExportModal('obj', 'selected')}
          onExportScene={() => openExportModal('obj', 'scene')}
          onExportObj={() =>
            openExportModal('obj', store.selectedObjectId ? 'selected' : 'scene')
          }
          onExportStl={() =>
            openExportModal('stl', store.selectedObjectId ? 'selected' : 'scene')
          }
          onSelectDisplayMode={store.setDisplayMode}
          onChangeXrayTransparency={store.setXrayTransparency}
          onToggleFaceOrientation={store.toggleFaceOrientation}
          onToggleGrid={() =>
            store.updateSettings({ showGrid: !store.settings.showGrid })
          }
          onToggleAxes={() =>
            store.updateSettings({ showAxes: !store.settings.showAxes })
          }
          onChangeProjection={store.setProjection}
          onSelectCameraPreset={(preset) =>
            viewportRef.current?.setCameraPreset(preset)
          }
          onFocusSelected={() => viewportRef.current?.focusSelected()}
          onToggleLiner={handleToggleLiner}
          onChangeWorkspace={handleChangeWorkspace}
          timelapseRecordingActive={
            store.settings.timelapseAutoRecord && !store.timelapseMeta?.paused
          }
          timelapseStepCount={store.timelapseMeta?.stepCount ?? 0}
        />
      )}

      {/* Contenedor principal de espacios de trabajo y par de menús radiales flotantes */}
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Espacios de Trabajo: Editor de UVs / Timelapse */}
        {activeView === 'uv_editing' && (
        <UVWorkspace
          ref={uvWorkspaceRef}
          objectId={uvTargetObject?.id ?? null}
          objectName={uvTargetObject?.name ?? null}
          objectTransform={uvTargetObject?.transform}
          materialAsset={uvTargetMaterialAsset}
          onUpdateMaterial={store.updateMaterial}
          shading={uvTargetObject?.shading}
          reserveTopLeftCorner={!toolbarPrefs.barhomeVisible}
          mesh={uvTargetMesh}
          meshRevision={store.meshRevision}
          selection3DMode={store.editSelectionMode}
          selected3DComponentIds={store.selectedComponentIds}
          onSync3DSelection={store.setEditSelectionFromUV}
          onCommitMesh={(beforeMesh, afterMesh) => {
            if (uvTargetObject) {
              store.commitMeshEditFromGizmo(
                uvTargetObject.id,
                beforeMesh,
                afterMesh,
              );
            }
          }}
          onUndo={() => store.undo()}
          onRedo={() => store.redo()}
          onReturnToModeler={() => handleChangeWorkspace('layout')}
          onQuickStateChange={setUvQuickState}
        />
      )}

      {activeView === 'timelapse' && (
        <TimelapseModal
          demoMode={DEMO_MODE}
          variant="workspace"
          reserveTopLeftCorner={!toolbarPrefs.barhomeVisible}
          projectId={store.project.id}
          projectName={store.project.name}
          isActiveProject={true}
          autoRecordEnabled={store.settings.timelapseAutoRecord}
          initialIncludeCamera={store.settings.timelapseIncludeCameraInPlayback}
          initialDisplayMode={store.settings.displayMode}
          xrayTransparency={store.settings.xrayTransparency}
          onChangeIncludeCamera={(include) =>
            store.updateSettings({ timelapseIncludeCameraInPlayback: include })
          }
          onToggleRecordingPaused={store.toggleTimelapseRecordingPaused}
          onDeleteTimelapseHistory={async (id) => {
            await store.clearProjectTimelapseById(id);
            store.showToast('Historial de Timelapse eliminado');
          }}
          onNotify={store.showToast}
          onClose={() => handleChangeWorkspace('layout')}
        />
      )}

      {/* Visor 3D Persistente compartido por Layout y Editor de materiales */}
      <div
        className={`flex-1 min-h-0 flex overflow-hidden ${
          isViewportVisible ? '' : 'hidden'
        }`}
      >
        {activeView === 'layout' && (
          <LeftToolSidebar
            displayMode={toolbarPrefs.leftToolbarMode}
            barhomeVisible={toolbarPrefs.barhomeVisible}
            moduleOrder={toolbarPrefs.moduleOrder}
            expandedModules={toolbarPrefs.expandedModules}
            onCycleDisplayMode={handleCycleLeftToolbarMode}
            onToggleModuleExpanded={handleToggleModuleExpanded}
            onReorderModules={handleReorderModules}
            onResetModuleLayout={handleResetModuleLayout}
            workMode={store.workMode}
            editSelectionMode={store.editSelectionMode}
            vertexSelectionTool={store.vertexSelectionTool}
            edgeSelectionTool={store.edgeSelectionTool}
            faceSelectionTool={store.faceSelectionTool}
            activeTool={store.activeTool}
            moveSubMode={store.moveSubMode}
            axisConstraint={store.axisConstraint}
            activeOperatorType={store.operatorSession?.config.type ?? null}
            modalTransformMode={store.modalTransform?.mode ?? null}
            canEditSelected={canEditSelected}
            hasSelectedObject={Boolean(store.selectedObject)}
            hasSelectedComponents={store.selectedComponentIds.size > 0}
            multiSelectTouch={store.settings.multiSelectTouch}
            xrayEditMode={store.settings.displayMode === 'xray'}
            showFaceOrientation={Boolean(store.settings.showFaceOrientation)}
            showGrid={store.settings.showGrid}
            proportionalConfig={store.settings.proportionalEditing}
            proportionalModifierWarning={store.proportionalModifierWarning}
            touchSettings={store.settings.touch}
            onSelectTool={(tool) => {
              if (store.operatorSession) store.cancelEditOperator();
              store.setActiveTool(tool);
            }}
            onSelectMoveSubMode={store.setMoveSubMode}
            onChangeAxisConstraint={store.setAxisConstraint}
            onGQuickTapMove={store.triggerGQuickTapMove}
            onGHoldSlide={store.triggerGHoldSlide}
            onToggleWorkMode={store.toggleWorkMode}
            onChangeEditSelectionMode={store.changeEditSelectionMode}
            onChangeVertexSelectionTool={store.setVertexSelectionTool}
            onChangeEdgeSelectionTool={store.setEdgeSelectionTool}
            onChangeFaceSelectionTool={store.setFaceSelectionTool}
            onToggleMultiSelectTouch={() =>
              store.updateSettings({
                multiSelectTouch: !store.settings.multiSelectTouch,
              })
            }
            onSelectAll={() => {
              if (store.workMode === 'edit') {
                store.selectAllEditComponents();
              } else {
                store.selectAllSceneObjects();
              }
            }}
            onDeselectAll={() => {
              if (store.workMode === 'edit') {
                store.deselectAllEditComponents();
              } else {
                store.deselectAllSceneObjects();
              }
            }}
            onSelectConnected={store.selectConnectedEditComponents}
            onStartOperator={(type) => {
              store.startEditOperator(type);
            }}
            onFillSelection={store.executeFillSelection}
            onConnectVertexPath={store.executeConnectVertexPath}
            onExecuteContextualDelete={store.executeContextualDelete}
            onToggleFaceOrientation={store.toggleFaceOrientation}
            onRecalculateOutside={store.executeRecalculateOutside}
            onFlipNormals={store.executeFlipNormals}
            onToggleXray={store.toggleXrayDisplayMode}
            onToggleGrid={() =>
              store.updateSettings({ showGrid: !store.settings.showGrid })
            }
            onMarkSeams={store.markSelectedSeams}
            onSelectSeams={store.selectSeams}
            onDeselectSeams={store.deselectSeams}
            seamCount={selectedMeshSeamCount}
            onToggleProportional={store.toggleProportionalEditing}
            onToggleProportionalConnected={store.toggleProportionalConnected}
            onChangeProportionalFalloff={store.setProportionalFalloff}
            onChangeProportionalRadius={store.setProportionalRadius}
            onAddPrimitive={(type, options) => store.addPrimitive(type, options)}
            onAddLight={(type) => store.addLightObject(type)}
            sculptSettings={store.sculptSettings}
            onSelectSculptBrush={store.setSculptBrush}
            onUpdateSculptSettings={store.updateSculptSettings}
            onSubdivideSelectedMeshForSculpt={handleSubdivideSelectedMeshForSculpt}
            onDuplicateObject={store.duplicateSelectedObject}
            onApplyObjectTransform={store.applyObjectTransform}
            onCenterObjectOrigin={store.centerObjectOrigin}
            onSeparateSelectedGeometry={store.separateSelectedGeometry}
            onFocusCamera={() => viewportRef.current?.focusSelected()}
            onOpenToolSettings={() => setSettingsModalTab('tools')}
          />
        )}

        {activeView === 'materials' && (
          <MaterialWorkspace
            objects={store.renderedObjects}
            selectedObject={store.selectedObject}
            selectedObjectId={store.selectedObjectId}
            selectedObjectIds={store.selectedObjectIds}
            materials={store.materials}
            displayMode={store.settings.displayMode}
            workMode={store.workMode}
            editSelectionMode={store.editSelectionMode}
            selectedComponentIds={store.selectedComponentIds}
            reserveTopLeftCorner={!toolbarPrefs.barhomeVisible}
            onSelectObject={store.selectObject}
            onSetObjectShading={store.setObjectShading}
            onSetDisplayMode={store.setDisplayMode}
            onCreateMaterial={store.createMaterial}
            onRenameMaterial={store.renameMaterial}
            onPushMaterialHistory={store.pushMaterialHistorySnapshot}
            onUpdateMaterial={store.updateMaterial}
            onDuplicateMaterial={store.duplicateMaterial}
            onDeleteMaterial={store.deleteMaterial}
            getMaterialUsageSummary={store.getMaterialUsageSummary}
            onAssignMaterialToObjects={store.assignMaterialToObjects}
            onAssignMaterialToFaces={store.assignMaterialToFaces}
            onUnassignMaterialFromFaces={store.unassignMaterialFromFaces}
            onSelectFacesByMaterial={store.selectFacesByMaterial}
            onReturnToLayout={() => handleChangeWorkspace('layout')}
          />
        )}

        {/* C. Visor 3D */}
        <Viewport3D
          ref={viewportRef}
          reserveTopLeftCorner={!toolbarPrefs.barhomeVisible}
          reserveTopLeftWrench={
            activeView === 'layout' && toolbarPrefs.leftToolbarMode === 'hidden'
          }
          objects={store.renderedObjects}
          materials={store.materials}
          selectedObject={store.selectedObject}
          selectedObjectId={store.selectedObjectId}
          selectedObjectIds={store.selectedObjectIds}
          workMode={store.workMode}
          editSelectionMode={store.editSelectionMode}
          edgeSelectionTool={store.edgeSelectionTool}
          selectedComponentIds={store.selectedComponentIds}
          activeTool={store.activeTool}
          axisConstraint={store.axisConstraint}
          projection={store.projection}
          cameraRotationLocked={store.cameraRotationLocked}
          settings={store.settings}
          meshRevision={store.meshRevision}
          toastMessage={store.toastMessage}
          screenShiftActive={store.screenShiftActive}
          screenModifiers={store.screenModifiers}
          operatorSession={store.operatorSession}
          operatorMergedCount={store.operatorMergedCount}
          operatorError={store.operatorError}
          operatorStatusMessage={store.operatorStatusMessage}
          operatorEffectiveMode={store.operatorEffectiveMode}
          loopCutPreviewSegments={store.loopCutPreviewSegments}
          loopCutRingEdgeIds={store.loopCutRingEdgeIds}
          loopCutFaceIds={store.loopCutFaceIds}
          loopCutIsClosed={store.loopCutIsClosed}
          loopCutError={store.loopCutError}
          canUndo={store.canUndo}
          canRedo={store.canRedo}
          onSelectObject={store.selectObject}
          onBoxSelectObjects={store.selectObjectsFromBox}
          onSelectComponent={store.selectComponentFromViewport}
          onBoxSelectComponents={store.selectComponentsFromBox}
          onPickLoopCutEdge={store.pickLoopCutEdge}
          onTwoFingerUndo={() => store.undo(true)}
          onThreeFingerRedo={() => store.redo(true)}
          onUndo={() => store.undo()}
          onRedo={() => store.redo()}
          onLiveObjectTransform={handleLiveObjectTransform}
          onCommitObjectTransform={handleCommitObjectTransform}
          onCommitObjectTransforms={handleCommitObjectTransforms}
          onCommitMeshEdit={store.commitMeshEditFromGizmo}
          sculptSettings={store.sculptSettings}
          onCommitSculptStroke={store.commitSculptStroke}
          onUpdateOperatorConfig={store.updateOperatorConfig}
          onConfirmOperator={store.confirmEditOperator}
          onCancelOperator={store.cancelEditOperator}
          onChangeAxisConstraint={store.setAxisConstraint}
          onToggleProjection={store.setProjection}
          onToggleXray={store.toggleXrayDisplayMode}
          onToggleFaceOrientation={store.toggleFaceOrientation}
          onToggleGrid={() =>
            store.updateSettings({ showGrid: !store.settings.showGrid })
          }
          onToggleMultiSelectTouch={() =>
            store.updateSettings({
              multiSelectTouch: !store.settings.multiSelectTouch,
            })
          }
          onToggleScreenShift={store.toggleScreenShift}
          onReleaseScreenModifiers={store.releaseScreenModifiers}
          onEffectiveModifiersChange={setEffectiveModifiers}
          onUpdateTouchSettings={store.updateTouchSettings}
          onUpdateRadialSlot={store.updateRadialSlot}
          onResetRadialSlot={store.resetRadialSlot}
          onResetRadialLayout={store.resetRadialLayout}
          onAddPrimitive={(type, options) => store.addPrimitive(type, options)}
          onSelectTool={(tool) => {
            if (store.operatorSession) store.cancelEditOperator();
            store.setActiveTool(tool);
          }}
          onDuplicateObject={store.duplicateSelectedObject}
          onApplyObjectTransform={store.applyObjectTransform}
          onCenterObjectOrigin={store.centerObjectOrigin}
          onSeparateSelectedGeometry={store.separateSelectedGeometry}
          onHideObject={store.toggleObjectVisibility}
          onDeleteObject={store.deleteSelectedObjects}
          onToggleWorkMode={store.toggleWorkMode}
          onChangeEditSelectionMode={store.changeEditSelectionMode}
          onChangeEdgeSelectionTool={store.setEdgeSelectionTool}
          onSelectEdgeTopology={store.selectEdgeTopology}
          onSelectAll={store.selectAllEditComponents}
          onDeselectAll={store.deselectAllEditComponents}
          onMarkSeams={store.markSelectedSeams}
          onSelectSeams={store.selectSeams}
          onDeselectSeams={store.deselectSeams}
          onStartOperator={store.startEditOperator}
          onSwitchMergeOperator={store.switchMergeOperator}
          onFillSelection={store.executeFillSelection}
          onConnectVertexPath={store.executeConnectVertexPath}
          onRecalculateOutside={store.executeRecalculateOutside}
          onFlipNormals={store.executeFlipNormals}
          onQuickDissolve={store.executeQuickDissolve}
          onExecuteContextualDelete={store.executeContextualDelete}
          onToggleProportional={store.toggleProportionalEditing}
          onToggleProportionalConnected={store.toggleProportionalConnected}
          onChangeProportionalRadius={store.setProportionalRadius}
          onSaveProject={() => {
            void store.saveProject();
          }}
          onOpenSettings={() => setSettingsModalTab('touch')}
          modalTransform={store.modalTransform}
          modalCancelNonce={store.modalCancelNonce}
          paused={!isViewportVisible || Boolean(timelapseTarget)}
          onToggleCameraRotationLock={store.toggleCameraRotationLock}
          onChangeModalClamp={store.setModalTransformClamp}
          onCancelModalTransform={store.cancelModalTransform}
          onCompleteModalTransform={store.completeModalTransform}
          onCameraMovementCommit={store.recordCameraMovement}
          highlightedNgonObjectId={
            activeNgonSubdivAlert && !activeNgonSubdivAlert.dismissed
              ? activeNgonSubdivAlert.objectId
              : null
          }
          highlightedNgonFaceIds={
            activeNgonSubdivAlert && !activeNgonSubdivAlert.dismissed
              ? activeNgonSubdivAlert.faceIds
              : []
          }
        />

        {/* D. LINER: Panel Lateral Derecho Desplegable (Jerarquía, Modificadores y Materiales) */}
        <LinerPanel
          isOpen={activeView === 'layout' && toolbarPrefs.linerVisible}
          scenes={store.scenes}
          activeSceneId={store.activeSceneId}
          activeCollectionId={store.activeCollectionId}
          objects={store.renderedObjects}
          selectedObjectId={store.selectedObjectId}
          selectedObjectIds={store.selectedObjectIds}
          workMode={store.workMode}
          editSelectionMode={store.editSelectionMode}
          selectedComponentIds={store.selectedComponentIds}
          liveTransformOverride={liveTransformOverride}
          onSelectObject={store.selectObject}
          onSelectObjectInScene={store.selectObjectInScene}
          onRenameObject={store.renameObject}
          onDuplicateObject={store.duplicateObjectById}
          onToggleVisibility={store.toggleObjectVisibility}
          onToggleLock={store.toggleObjectLock}
          onDeleteObject={store.deleteObject}
          onUpdateObjectTransform={store.updateObjectTransform}
          onUpdateEditCentroidAxis={store.updateSelectedVerticesPosition}
          onCreateScene={() => store.createScene()}
          onSwitchScene={store.switchScene}
          onRenameScene={store.renameScene}
          onDeleteScene={store.deleteScene}
          onCreateCollection={store.createCollection}
          onSelectCollection={store.selectCollection}
          onRenameCollection={store.renameCollection}
          onToggleCollectionExpanded={store.toggleCollectionExpanded}
          onDeleteCollection={store.deleteCollection}
          onMoveObjectToCollection={store.moveObjectToCollection}
          onUpdateReferenceImageProps={store.updateReferenceImageProps}
          onUpdateLightProps={store.updateLightProps}
          modifierDiagnostics={store.selectedModifierDiagnostics.diagnostics}
          evaluatedVertexCount={
            store.selectedModifierDiagnostics.evaluatedVertexCount
          }
          evaluatedFaceCount={
            store.selectedModifierDiagnostics.evaluatedFaceCount
          }
          hasActiveModifiers={
            store.selectedModifierDiagnostics.hasActiveModifiers
          }
          onAddModifier={store.addModifier}
          onUpdateModifier={store.updateModifier}
          onReorderModifier={store.reorderModifier}
          onRemoveModifier={store.removeModifier}
          onApplyModifier={store.applyModifier}
          onRecalculateNormalsOutside={store.recalculateObjectNormalsOutside}
          onFlipNormals={store.flipObjectNormals}
          materials={store.materials}
          displayMode={store.settings.displayMode}
          onCreateMaterial={store.createMaterial}
          onRenameMaterial={store.renameMaterial}
          onPushMaterialHistory={store.pushMaterialHistorySnapshot}
          onUpdateMaterial={store.updateMaterial}
          onDuplicateMaterial={store.duplicateMaterial}
          onDeleteMaterial={store.deleteMaterial}
          getMaterialUsageSummary={store.getMaterialUsageSummary}
          onAssignMaterialToObjects={store.assignMaterialToObjects}
          onAssignMaterialToFaces={store.assignMaterialToFaces}
          onUnassignMaterialFromFaces={store.unassignMaterialFromFaces}
          onSelectFacesByMaterial={store.selectFacesByMaterial}
          onSetObjectShading={store.setObjectShading}
          onTabChange={setLinerTab}
          ngonHighlightActive={Boolean(
            activeNgonSubdivAlert && !activeNgonSubdivAlert.dismissed,
          )}
          ngonHighlightDismissed={Boolean(activeNgonSubdivAlert?.dismissed)}
          onDismissNgonHighlight={(modId) => {
            if (store.selectedObject) {
              setDismissedNgonKey(`${store.selectedObject.id}::${modId}`);
            }
          }}
          onRestoreNgonHighlight={() => setDismissedNgonKey(null)}
          onClose={() =>
            updateToolbarPrefs((prev) => ({
              ...prev,
              linerVisible: false,
            }))
          }
        />
      </div>

        {/* Menús radiales y control flotante de modificadores */}
        {activeView !== 'gallery' &&
          (store.settings.touch.floatingMenuEnabled ||
            (activeView === 'layout' &&
              store.settings.touch.modifierPanelEnabled)) &&
          !store.operatorSession && (
            <FloatingRadialPair
              demoMode={DEMO_MODE}
              activeWorkspace={activeView}
              boundsClassName={radialBoundsClass}
              floatingMenusEnabled={store.settings.touch.floatingMenuEnabled}
              touchSettings={store.settings.touch}
              onUpdateTouchSettings={store.updateTouchSettings}
              onUpdateRadialSlot={store.updateRadialScopeSlot}
              onResetRadialSlot={store.resetRadialScopeSlot}
              onResetRadialLayout={store.resetRadialScopeLayout}
              workMode={store.workMode}
              editSelectionMode={store.editSelectionMode}
              edgeSelectionTool={store.edgeSelectionTool}
              activeTool={store.activeTool}
              activeOperatorType={null}
              axisConstraint={store.axisConstraint}
              projection={store.projection}
              displayMode={store.settings.displayMode}
              xrayTransparency={store.settings.xrayTransparency}
              showFaceOrientation={Boolean(store.settings.showFaceOrientation)}
              showGrid={store.settings.showGrid}
              showAxes={store.settings.showAxes}
              showLiner={toolbarPrefs.linerVisible}
              barhomeVisible={toolbarPrefs.barhomeVisible}
              multiSelectTouch={store.settings.multiSelectTouch}
              screenShiftActive={store.screenShiftActive}
              effectiveModifiers={effectiveModifiers}
              screenModifiers={store.screenModifiers}
              onSetModifier={store.setScreenModifier}
              onToggleModifier={store.toggleScreenModifier}
              onReleaseAllModifiers={store.releaseScreenModifiers}
              hasSelectedObject={Boolean(store.selectedObject)}
              canEditSelected={canEditSelected}
              hasSelectedComponents={store.selectedComponentIds.size > 0}
              canUndo={store.canUndo}
              canRedo={store.canRedo}
              hasUnsavedChanges={store.hasUnsavedChanges}
              saveStatus={store.saveStatus}
              timelapseRecordingActive={
                store.settings.timelapseAutoRecord && !store.timelapseMeta?.paused
              }
              timelapseStepCount={store.timelapseMeta?.stepCount ?? 0}
              proportionalEnabled={store.settings.proportionalEditing.enabled}
              proportionalConnectedOnly={
                store.settings.proportionalEditing.connectedOnly
              }
              selectedObjectShading={
                store.selectedObject && store.selectedObject.objectType === 'mesh'
                  ? store.selectedObject.shading
                  : null
              }
              onAddPrimitive={(type, options) => store.addPrimitive(type, options)}
              onAddLight={(type) => store.addLightObject(type)}
              onSelectTool={(tool) => {
                if (store.operatorSession) store.cancelEditOperator();
                store.setActiveTool(tool);
              }}
              onGQuickTapMove={store.triggerGQuickTapMove}
              onChangeAxisConstraint={store.setAxisConstraint}
              onDuplicateObject={store.duplicateSelectedObject}
              onApplyObjectTransform={store.applyObjectTransform}
              onCenterObjectOrigin={store.centerObjectOrigin}
              onSeparateSelectedGeometry={store.separateSelectedGeometry}
              onDeleteObject={store.deleteSelectedObjects}
              onSetCameraPreset={(preset) =>
                viewportRef.current?.setCameraPreset(preset)
              }
              onFocusSelected={() => viewportRef.current?.focusSelected()}
              onToggleProjection={() =>
                store.setProjection(
                  store.projection === 'perspective'
                    ? 'orthographic'
                    : 'perspective',
                )
              }
              onToggleWorkMode={store.toggleWorkMode}
              onChangeEditSelectionMode={store.changeEditSelectionMode}
              onChangeEdgeSelectionTool={store.setEdgeSelectionTool}
              onSelectEdgeTopology={store.selectEdgeTopology}
              onToggleXray={store.toggleXrayDisplayMode}
              onSelectDisplayMode={store.setDisplayMode}
              onChangeXrayTransparency={store.setXrayTransparency}
              onToggleFaceOrientation={store.toggleFaceOrientation}
              onToggleGrid={() =>
                store.updateSettings({ showGrid: !store.settings.showGrid })
              }
              onToggleAxes={() =>
                store.updateSettings({ showAxes: !store.settings.showAxes })
              }
              onToggleLiner={handleToggleLiner}
              onToggleBarhome={handleToggleBarhome}
              onToggleMultiSelectTouch={() =>
                store.updateSettings({
                  multiSelectTouch: !store.settings.multiSelectTouch,
                })
              }
              onToggleScreenShift={store.toggleScreenShift}
              onUndo={() => store.undo()}
              onRedo={() => store.redo()}
              onStartOperator={store.startEditOperator}
              onFillSelection={store.executeFillSelection}
              onConnectVertexPath={store.executeConnectVertexPath}
              onRecalculateOutside={store.executeRecalculateOutside}
              onFlipNormals={store.executeFlipNormals}
              onQuickDissolve={store.executeQuickDissolve}
              onExecuteContextualDelete={store.executeContextualDelete}
              onMarkSeams={store.markSelectedSeams}
              onSelectSeams={store.selectSeams}
              onDeselectSeams={store.deselectSeams}
              onToggleProportional={store.toggleProportionalEditing}
              onToggleProportionalConnected={store.toggleProportionalConnected}
              onCycleProportionalFalloff={store.cycleProportionalFalloff}
              onSelectAll={store.selectAllEditComponents}
              onDeselectAll={store.deselectAllEditComponents}
              onSelectAllObjects={store.selectAllSceneObjects}
              onDeselectAllObjects={store.deselectAllSceneObjects}
              onSelectConnected={store.selectConnectedEditComponents}
              onSetSelectedObjectShading={(shading) => {
                if (store.selectedObject) {
                  store.setObjectShading(store.selectedObject.id, shading);
                }
              }}
              uvQuickState={uvQuickState}
              uvActionsRef={uvWorkspaceRef}
              onCreateProjectModal={() => setProjectModalMode('create')}
              onOpenProjectModal={() => setProjectModalMode('open')}
              onSaveProject={() => {
                void store.saveProject();
              }}
              onSaveAsProjectModal={() => setProjectModalMode('save_as')}
              onImportNativeProject={() => nativeProjectInputRef.current?.click()}
              onExportNativeProject={() => {
                void handleExportNativeFromModeler();
              }}
              onImportExternal={() => externalImportInputRef.current?.click()}
              onExportExternal={() =>
                openExportModal('obj', store.selectedObjectId ? 'selected' : 'scene')
              }
              onImportObj={() => objInputRef.current?.click()}
              onImportStl={() => stlInputRef.current?.click()}
              onImportJpg={() => jpgInputRef.current?.click()}
              onImportPng={() => pngInputRef.current?.click()}
              onExportSelected={() => openExportModal('obj', 'selected')}
              onExportScene={() => openExportModal('obj', 'scene')}
              onExportObj={() =>
                openExportModal(
                  'obj',
                  store.selectedObjectId ? 'selected' : 'scene',
                )
              }
              onExportStl={() =>
                openExportModal(
                  'stl',
                  store.selectedObjectId ? 'selected' : 'scene',
                )
              }
              onReturnToGallery={() => {
                void handleReturnToGallery();
              }}
              onChangeWorkspace={handleChangeWorkspace}
              onOpenSettings={() => setSettingsModalTab('touch')}
            />
          )}
      </div>

      {/* LOOPA Ecosystem Landing Main Screen */}
      {!DEMO_MODE && activeView === 'gallery' && (
        <LoopaEcosystemLanding
          projects={store.savedProjects}
          folders={store.folders}
          activeProjectId={store.project.id}
          onOpenProject={handleOpenProjectFromGallery}
          onCreateProjectModal={() => setProjectModalMode('create')}
          onRenameProject={(id, name) => {
            void store.renameProjectById(id, name);
          }}
          onDuplicateProject={(id) => {
            void store.duplicateProjectById(id);
          }}
          onDeleteProjects={(ids) => {
            void store.deleteProjectsByIds(ids);
          }}
          onImportModelFiles={(files, targetFolderId) => {
            void handleGalleryModelFilesSelected(files, targetFolderId);
          }}
          onOpenModeler={() => handleLaunchAppFromEcosystem('modeler')}
          onOpenSculpt={() => handleLaunchAppFromEcosystem('sculpt')}
          onOpenMaterials={() => handleLaunchAppFromEcosystem('materials')}
          onOpenUVs={() => handleLaunchAppFromEcosystem('uvs')}
          onOpenTimelapse={(proj) => {
            setTimelapseTarget({ id: proj.id, name: proj.name });
          }}
          onNotify={store.showToast}
        />
      )}

      {/* Modals */}
      {projectModalMode === 'create' && (
        <NewProjectModal
          folders={store.folders}
          defaultFolderId={store.project.folderId ?? null}
          onClose={() => setProjectModalMode(null)}
          onCreate={async ({ name, templateId, folderId }) => {
            const created = await handleCreateProjectFromGallery(
              name,
              templateId,
              folderId,
            );
            if (created) setProjectModalMode(null);
          }}
        />
      )}

      {(projectModalMode === 'open' || projectModalMode === 'save_as') && (
        <ProjectModal
          initialMode={projectModalMode}
          currentProjectId={store.project.id}
          currentProjectName={store.project.name}
          savedProjects={store.savedProjects}
          onClose={() => setProjectModalMode(null)}
          onCreateProject={(name) => {
            void handleCreateProjectFromGallery(
              name,
              'cube',
              store.project.folderId ?? null,
            );
          }}
          onSaveAsProject={(name) => {
            void store.saveProjectAs(name);
          }}
          onOpenProject={(id) => {
            void handleOpenProjectFromGallery(id);
          }}
          onSaveCurrent={() => {
            void store.saveProject();
          }}
          onDeleteProject={(id) => {
            void store.removeSavedProject(id);
          }}
        />
      )}

      {showReturnGuardModal && (
        <ReturnToGalleryModal
          projectName={store.project.name}
          saving={exitingToGallery}
          onCancel={() => setShowReturnGuardModal(false)}
          onDiscardAndExit={() => {
            setShowReturnGuardModal(false);
            setActiveView(DEMO_MODE ? 'layout' : 'gallery');
          }}
          onSaveAndExit={async () => {
            setExitingToGallery(true);
            const ok = await store.saveProjectSilent();
            setExitingToGallery(false);
            if (ok) {
              setShowReturnGuardModal(false);
              setActiveView(DEMO_MODE ? 'layout' : 'gallery');
            }
          }}
        />
      )}

      {store.pendingRecovery && (
        <RecoveryPromptModal
          record={store.pendingRecovery}
          onCancel={store.dismissPendingRecovery}
          onRecover={async () => {
            if (!store.pendingRecovery) return;
            await store.applyRecoveryDraft(store.pendingRecovery);
            enterModelerWithResetCamera();
          }}
          onDiscardDraft={async () => {
            const targetId = store.pendingRecovery?.projectId;
            if (!targetId) return;
            await store.discardRecoveryDraft(targetId);
            const opened = await store.openProject(targetId, {
              skipRecoveryCheck: true,
            });
            if (opened) enterModelerWithResetCamera();
          }}
        />
      )}

      {settingsModalTab && (
        <SettingsModal
          settings={store.settings}
          sceneStats={sceneStats}
          initialTab={settingsModalTab}
          timelapseProjectBytes={store.timelapseMeta?.totalEstimatedBytes ?? 0}
          timelapseTotalBytes={store.timelapseTotalBytes}
          timelapseStepCount={store.timelapseMeta?.stepCount ?? 0}
          onClearActiveTimelapse={store.clearActiveProjectTimelapse}
          onOpenTimelapse={() => {
            void store.refreshTimelapseMeta(store.project.id);
            setTimelapseTarget({
              id: store.project.id,
              name: store.project.name,
            });
          }}
          onUpdateSettings={store.updateSettings}
          onUpdateTouchSettings={store.updateTouchSettings}
          onUpdateTouchModifier={store.updateTouchModifier}
          onUpdateRadialSlot={store.updateRadialScopeSlot}
          onResetRadialSlot={store.resetRadialScopeSlot}
          onResetRadialLayout={store.resetRadialScopeLayout}
          onResetTouchSettings={store.resetTouchSettings}
          onUpdateToolConfig={store.updateToolConfig}
          onUpdateProportionalSettings={store.updateProportionalSettings}
          onResetToolConfig={store.resetToolConfig}
          onResetAllToolConfigs={store.resetAllToolConfigs}
          onClose={() => setSettingsModalTab(null)}
        />
      )}

      {timelapseTarget && (
        <TimelapseModal
          demoMode={DEMO_MODE}
          projectId={timelapseTarget.id}
          projectName={timelapseTarget.name}
          isActiveProject={timelapseTarget.id === store.project.id}
          autoRecordEnabled={store.settings.timelapseAutoRecord}
          initialIncludeCamera={store.settings.timelapseIncludeCameraInPlayback}
          initialDisplayMode={store.settings.displayMode}
          xrayTransparency={store.settings.xrayTransparency}
          onChangeIncludeCamera={(include) =>
            store.updateSettings({ timelapseIncludeCameraInPlayback: include })
          }
          onToggleRecordingPaused={
            timelapseTarget.id === store.project.id
              ? store.toggleTimelapseRecordingPaused
              : undefined
          }
          onDeleteTimelapseHistory={async (id) => {
            await store.clearProjectTimelapseById(id);
            store.showToast('Historial de Timelapse eliminado');
          }}
          onNotify={store.showToast}
          onClose={() => {
            setTimelapseTarget(null);
            void store.refreshTimelapseMeta(store.project.id);
          }}
        />
      )}

      {pendingStl && (
        <StlImportModal
          pending={pendingStl}
          onCancel={() => setPendingStl(null)}
          onConfirm={(scale) => {
            void handleConfirmStlImport(scale);
          }}
        />
      )}

      {pendingRefImage && (
        <ReferenceImageImportModal
          payload={pendingRefImage}
          onCancel={() => setPendingRefImage(null)}
          onConfirm={handleConfirmReferenceImage}
        />
      )}

      {exportModalConfig && (
        <ExportModelModal
          initialFormat={exportModalConfig.format}
          initialScope={exportModalConfig.scope}
          sceneObjects={evaluateObjectsForExport(
            store.activeScene.objects,
            store.activeScene.objects,
          )}
          selectedObjectId={store.selectedObjectId}
          onCancel={() => setExportModalConfig(null)}
          onExport={(cfg) => {
            void handleExecuteExport(cfg);
          }}
        />
      )}

      {ioProgress && (
        <IoProgressModal
          title={ioProgress.title}
          label={ioProgress.label}
          progress={ioProgress.progress}
        />
      )}

      {ioError && (
        <IoErrorModal
          title={ioError.title}
          message={ioError.message}
          onClose={() => setIoError(null)}
        />
      )}

      {activeAppId && (
        <ShareWithEcosystemModal
          isOpen={showShareModal}
          currentAppId={activeAppId}
          projectName={store.project.name}
          staleUvObjectNames={
            showShareModal
              ? findStaleUvObjects(store.project, store.project.ecosystem).map((o) => o.name)
              : []
          }
          onClose={() => setShowShareModal(false)}
          onShare={handleShareWithEcosystem}
        />
      )}

      <ProjectEcosystemLauncherModal
        project={launcherProject}
        isOpen={Boolean(launcherProject)}
        onClose={() => setLauncherProject(null)}
        onLaunchApp={handleLaunchAppFromEcosystem}
      />
    </div>
  );
}
