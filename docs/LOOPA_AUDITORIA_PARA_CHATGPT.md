# CONTEXTO E INSTRUCCIÓN PARA CHATGPT

Adjunto o incluyo a continuación la **auditoría técnica completa (100 % basada en código real)** de **LOOPA Modeler**, nuestra aplicación web 3D actual (`React 19 + TypeScript + Three.js + Vite + IndexedDB`).

Estamos preparando la transición de **LOOPA Modeler** hacia **LOOPA CORE**, una arquitectura central compartida para un ecosistema de 4 aplicaciones 3D en tiempo real sobre un mismo proyecto vivo:
1. **LOOPA Modeler** (modelado poligonal 3D — primera app a migrar)
2. **LOOPA Sculpt** (escultura digital)
3. **LOOPA UVs** (desenvolvimiento y edición UV)
4. **LOOPA Materiales** (creación y administración PBR de materiales)

Con base únicamente en los hechos comprobados, las brechas, los riesgos y el plan preliminar incluidos en esta auditoría, **necesito que me indiques cuál debe ser exactamente el siguiente paso práctico**, incluyendo:
1. Qué decisión arquitectónica o técnica debemos cerrar primero antes de escribir código.
2. Qué entregable concreto conviene construir como primer paso (especificación, contrato de datos, refactor puntual o prueba piloto) y por qué.
3. Qué riesgos debemos vigilar desde este primer paso para no romper LOOPA Modeler actual ni perder proyectos guardados en IndexedDB (`forma3d_projects_db_v1`).

---

# AUDITORÍA TÉCNICA COMPLETA – LOOPA MODELER
## Preparación para el diseño y construcción de LOOPA CORE

- **Fecha de auditoría:** 2026-11-21
- **Modo de ejecución:** Lectura, análisis y documentación exclusivamente (0 archivos modificados del proyecto original)
- **Alcance analizado:** Repositorio completo en `/src` (**82 archivos TypeScript/TSX**, **73,358 líneas** de código), archivos de configuración raíz y activos PWA en `/public`.

> **Convención de rigor técnico aplicada en este documento:**
> - **Dato comprobado:** Hecho verificado directamente en el código fuente, tipos, firmas, rutas de archivo y líneas reales de LOOPA Modeler.
> - **Recomendación:** Decisión de ingeniería sugerida para construir LOOPA CORE sobre la base real observada.
> - **Hipótesis:** Proyección técnica o estimación de comportamiento futuro (por ejemplo, escalabilidad con mallas densas o requisitos de futuras apps como Sculpt/UVs/Materiales) aún no medida en runtime o pendiente de definición funcional.

---

## 1. Resumen ejecutivo

### 1.1 Datos comprobados
**LOOPA Modeler** es una aplicación web SPA de modelado poligonal 3D, desenvolvimiento UV, escultura sobre malla base, edición básica de materiales PBR y grabación/exportación de *timelapse* en MP4. Está construida sobre **React 19 (`^19.0.1`)**, **TypeScript (`^7.0.2`)**, **Three.js (`^0.187.0`)**, **Tailwind CSS 4 (`^4.3.3`)**, **Vite (`^8.3.0`)** y **`mp4-muxer` (`^5.2.2`)**, con persistencia local en **IndexedDB + `localStorage`**.

Desde el punto de vista estructural para la evolución hacia **LOOPA CORE**, el proyecto presenta dos realidades muy diferenciadas:

1. **Núcleo algorítmico geométrico desacoplado y altamente reutilizable (`src/core/`):**
   - `EditableMesh` (`src/core/mesh/EditableMesh.ts`, 854 l.) implementa una estructura topológica B-Rep ligera con soporte para triángulos, quads y n-gons, costuras UV (`isSeam`), `bevelWeight`, UVs por esquina de cara, normales explícitas y `materialId` por cara.
   - Los operadores de modelado (`operations.ts`, `advancedOperations.ts`, `topologyTools.ts`, `connectVertexPath.ts`, `slideTools.ts`, `loopCut.ts`, `loopSelect.ts`, `shortestPathSelect.ts`, `normals.ts`, `proportionalEditing.ts`), el stack de modificadores no destructivos (`src/core/modifiers/*`), el unwrapper y operaciones UV (`src/core/uv/*`), los 10 pinceles de escultura (`src/core/mesh/sculptBrushes.ts`), la capa IO (`src/core/io/*`), la persistencia (`src/core/project/*`) y el sistema de *timelapse* (`src/core/timelapse/*`) **son TypeScript puro sin dependencia de React**.
2. **Capa de aplicación, estado y visor WebGL monolítica y parcialmente duplicada:**
   - **`src/state/useModelerStore.ts` (6,546 líneas)** concentra en un único *custom hook* React todo el estado de proyecto, escenas, selecciones, Undo/Redo, configuraciones, sesiones paramétricas, *timelapse*, UV, materiales y escultura, conectado por *prop-drilling* desde **`src/App.tsx` (2,347 líneas)**.
   - **`src/engine/ViewportEngine.ts` (6,345 líneas)** acopla en una sola clase el renderizado Three.js, tres instancias simultáneas de `TransformControls`, raycasting, *box select*, cursor 3D, escultura en vivo, transformaciones modales (`G`/`R`/`S`/Slide), *overlays* topológicos y la integración con `TouchGestureManager`.
   - Existen **4 pipelines WebGL independientes** (`src/engine/ViewportEngine.ts`, `src/components/UVSync3DViewport.tsx`, `src/core/timelapse/timelapseRenderer.ts` y `src/core/io/modelThumbnail.ts`) que duplican la inicialización de `THREE.WebGLRenderer`, `RoomEnvironment` + `PMREMGenerator`, iluminación de 3 puntos, cámaras Z-up y `detectSoftwareWebGL()`.

### 1.2 Recomendaciones ejecutivas
- **Extraer LOOPA CORE sin reescribir la matemática 3D:** Reutilizar casi intacto el dominio geométrico (`src/core/mesh`, `src/core/modifiers`, `src/core/uv`, `src/core/io`, `src/core/timelapse`).
- **Dividir el monolito de estado y visor:** Reemplazar `useModelerStore.ts` por un store agnóstico a React con historial basado en deltas/comandos por objeto y unificar los 4 renderers en un servicio WebGL único (`CoreViewportService`) para habilitar la convivencia en tiempo real de **Modeler**, **Sculpt**, **UVs** y **Materiales**.

---

## 2. Inventario tecnológico

### 2.1 Tecnologías fundamentales (Core de ejecución — Datos comprobados)

| Categoría | Tecnología | Versión (`package.json`) | Rol verificado en el código |
| :--- | :--- | :--- | :--- |
| Lenguaje | TypeScript | `^7.0.2` | 100 % de la lógica en `src/`. Verificación de tipos mediante `tsc --noEmit` (`npm run lint`). |
| Framework UI | React + React DOM | `^19.0.1` | SPA cliente montada en `src/main.tsx` → `src/App.tsx`. Sin Redux, Zustand ni React Context global; estado centralizado en `useModelerStore`. |
| Motor 3D / WebGL | Three.js + `@types/three` | `^0.187.0` | Renderizado WebGL, `OrbitControls`, `TransformControls`, `RoomEnvironment`, `PMREMGenerator`, `OBJLoader`, `STLLoader`, `STLExporter`, `GLTFLoader`, `GLTFExporter`. |
| Empaquetador / Dev | Vite + `@vitejs/plugin-react` | `^8.3.0` / `^6.1.1` | Build de producción (`vite build`) y servidor de desarrollo en puerto `3000` (`vite --port=3000 --host=0.0.0.0`). Copia `src/assets` en `vite.config.ts`. |
| Estilos | Tailwind CSS + `@tailwindcss/vite` | `^4.3.3` | Utilidades CSS inline en JSX + `@import "tailwindcss";` y estilos de scrollbar `.cad-scroll` en `src/index.css`. |
| Exportación Video | `mp4-muxer` | `^5.2.2` | Multiplexado MP4 (H.264/AVC) combinado con la Web API nativa `VideoEncoder` (WebCodecs) en `src/core/timelapse/timelapseMp4Exporter.ts`. |
| Persistencia local | IndexedDB + `localStorage` | Web APIs nativas | `WebProjectStorageAdapter` (`src/core/project/storage.ts`, BD `forma3d_projects_db_v1` v3 con 8 *object stores*) y preferencias/metadatos en `localStorage`. |

### 2.2 Tecnologías complementarias (Datos comprobados)

| Categoría | Tecnología | Versión (`package.json`) | Uso verificado |
| :--- | :--- | :--- | :--- |
| Iconografía UI | `lucide-react` | `^0.546.0` | Iconos vectoriales en `TopBar`, `LeftToolSidebar`, `LinerPanel`, `RadialActionIcon`, menús y modales. |
| PostCSS | `autoprefixer` | `^10.4.21` | Herramienta de soporte CSS en `devDependencies`. |
| Tooling Node/TS | `tsx`, `esbuild`, `@types/node` | `^4.21.0`, `^0.25.0`, `^22.14.0` | Presentes en `devDependencies`; no existe `server.ts` ni ejecución backend en este proyecto. |

### 2.3 Dependencias declaradas sin uso en el código (Datos comprobados)

Verificado mediante búsqueda global en `src/`, `index.html` y `public/`:
- **`@google/genai` (`^2.4.0`)**: **0 importaciones**. No existen llamadas LLM ni características de IA en la aplicación.
- **`motion` (`^12.23.24`)**: **0 importaciones**. Todas las transiciones visuales usan clases Tailwind/CSS estándar.
- **`express` (`^4.21.2`) y `@types/express` (`^4.17.21`)**: **0 importaciones**. Aplicación 100 % cliente (*frontend-only*).
- **`dotenv` (`^17.2.3`)**: **0 importaciones**. La única variable de entorno usada es `import.meta.env.VITE_DEMO_MODE` en `src/config/demo.ts`.

### 2.4 Scripts, PWA y configuración de entorno (Datos comprobados)

- **Scripts en `package.json`**:
  - `dev`: `vite --port=3000 --host=0.0.0.0`
  - `build`: `vite build`
  - `preview`: `vite preview`
  - `clean`: `rm -rf dist server.js`
  - `lint`: `tsc --noEmit`
- **PWA incompleta**: Existen `/public/manifest.webmanifest` y los iconos referenciados desde `/index.html`, pero **no hay archivo Service Worker ni registro `navigator.serviceWorker`** en `src/main.tsx` ni en ningún otro módulo.
- **Modo Demo (`src/config/demo.ts`)**: `IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'` restringe Galería, creación/importación de proyectos, pestañas de ajustes y *timelapse* manteniendo la sesión en memoria.

---

## 3. Inventario de arquitectura y acoplamientos

### 3.1 Mapa completo de carpetas y archivos (73,358 líneas totales en `src/`)

| Ruta | Líneas | Rol arquitectónico principal |
| :--- | ---: | :--- |
| `/package.json`, `/tsconfig.json`, `/vite.config.ts`, `/index.html`, `/metadata.json` | — | Configuración de build, TypeScript, Vite y metadatos web/PWA. |
| `/public/manifest.webmanifest`, `/public/icons/*` | — | Manifiesto e iconos PWA (sin Service Worker activo). |
| `/src/main.tsx` | 5 | Punto de entrada React (`createRoot`). |
| `/src/index.css` | — | Importación Tailwind v4 y clases auxiliares `.cad-scroll`, `.font-mono-tabular`. |
| `/src/config/brand.ts` | 45 | Constantes `APP_NAME`, `APP_TAGLINE`, `APP_DESCRIPTION`, `APP_VERSION` y metadatos de marca LOOPA. |
| `/src/config/demo.ts` | 4 | Bandera `IS_DEMO_MODE`. |
| `/src/App.tsx` | 2,347 | Orquestador principal de UI, atajos de teclado, selector de workspaces (`gallery`, `layout`, `uv_editing`, `materials`, `timelapse`) y modales. |
| `/src/state/useModelerStore.ts` | 6,546 | Monolito central de estado React, Undo/Redo, operadores, autoguardado, selecciones y acciones. |
| `/src/engine/ViewportEngine.ts` | 6,345 | Motor Three.js principal, cámaras Z-up, 3 `TransformControls`, raycasting, *box select*, escultura en vivo y overlays. |
| `/src/engine/TouchGestureManager.ts` | 1,347 | Máquina de estados de gestos táctiles (1/2/3 dedos, doble toque, long-press) y `TOUCH_MODIFIER_REGISTRY`. |
| `/src/engine/boxSelectMath.ts` | 127 | Matemática de proyección NDC y selección rectangular en pantalla. |
| `/src/core/mesh/EditableMesh.ts` | 854 | Estructura B-Rep central (`vertices`, `edges`, `faces`), índices cacheados y triangulación. |
| `/src/core/mesh/primitives.ts` | 603 | Generadores paramétricos de 7 primitivas (`cube`, `uv_sphere`, `cylinder`, `cone`, `plane`, `circle`, `torus`). |
| `/src/core/mesh/operations.ts` | 554 | Operaciones base (`applyObjectTransformToMesh`, `centerMeshOrigin`, `separateGeometryFromMesh`, tipos `EditSelectionMode`). |
| `/src/core/mesh/advancedOperations.ts` | 3,435 | Extrusión, `insetFacesMesh`, `subdivideMesh`, `bevelMesh`, `mergeVerticesMesh`, `mergeByDistanceMesh`, `applyDeleteAction`, `fillMesh`. |
| `/src/core/mesh/topologyTools.ts` | 1,747 | `dissolveVerticesMesh`, `dissolveEdgesMesh`, `dissolveFacesMesh`, `limitedDissolveMesh`, `analyzeBridgeEdgeLoops`, `bridgeEdgeLoopsMesh`. |
| `/src/core/mesh/connectVertexPath.ts` | 1,226 | `connectVertexPathMesh` (atajo `J`, división topológica de caras por ruta). |
| `/src/core/mesh/slideTools.ts` | 1,219 | `buildVertexSlidePlan`, `applyVertexSlideAlongDirection`, `buildParametricVertexSlidePlan`, `applyParametricVertexSlide`, `buildEdgeSlidePlan`, `applyEdgeSlide`. |
| `/src/core/mesh/loopCut.ts` | 831 | `analyzeEdgeLoopRing`, `findEdgeLoopRing`, `computeLoopCutFractions`, `computeLoopCutPreviewSegments`, `loopCutMesh`. |
| `/src/core/mesh/loopSelect.ts` | 632 | `findEdgeLoop`, `findEdgeRing`, `resolveEdgeLoopSelection`, `findVertexLoopDirections`, `findFaceLoopDirections`. |
| `/src/core/mesh/shortestPathSelect.ts` | 326 | `findShortestVertexPath`, `findShortestEdgePath`, `findShortestFacePath`, `findShortestComponentPath`. |
| `/src/core/mesh/proportionalEditing.ts` | 583 | 8 curvas de caída (`PROPORTIONAL_FALLOFF_LIST`), campos de distancia euclídea/topológica y transformaciones proporcionales. |
| `/src/core/mesh/normals.ts` | 760 | `isFaceDegenerate`, `analyzeMeshNormals`, `recalculateOutsideMesh`, `flipNormalsMesh`. |
| `/src/core/mesh/sculptBrushes.ts` | 580 | 10 pinceles de escultura (`draw`, `smooth`, `grab`, `clay`, `inflate`, `crease`, `flatten`, `pinch`, `draw_sharp`, `clay_strips`) y simetría X/Y/Z. |
| `/src/core/modifiers/types.ts` | 356 | Definición de `ModifierSlot`, `ModifierType` y parámetros por defecto. |
| `/src/core/modifiers/evaluateModifiers.ts` | 369 | Evaluador secuencial de pila con caché LRU (`MAX_CACHE_ENTRIES = 64`). |
| `/src/core/modifiers/mirrorModifier.ts` | 483 | `evaluateMirrorModifier`, `clampVerticesForMirrorClipping`, `cleanupMirroredMesh`, `resolveMirrorPlaneInLocalSpace`. |
| `/src/core/modifiers/subdivisionModifier.ts` | 568 | Subdivisión Catmull-Clark (`evaluateSubdivisionModifier`, `validateTopologyForSubdivision`). |
| `/src/core/modifiers/solidifyModifier.ts` | 478 | `evaluateSolidifyModifier`. |
| `/src/core/modifiers/bevelModifier.ts` | 1,252 | `evaluateBevelModifier`. |
| `/src/core/uv/types.ts` | 45 | Tipos del espacio UV (`UVSelectionMode`, modos de proyección, etc.). |
| `/src/core/uv/uvUnwrap.ts` | 747 | Unwrapping UV (`smart`, `angle_based`, `cube`, `sphere`, `cylinder`, `planar_view`). |
| `/src/core/uv/uvOperations.ts` | 1,713 | Detección de islas UV, transformaciones 2D, alineación, distribución, flip y empaquetado (`Pack Islands`). |
| `/src/core/project/types.ts` | 397 | Esquema de datos completo (`ProjectData`, `SceneData`, `SceneObjectData`, `MaterialAsset`, `ModelerSettings`, etc.). |
| `/src/core/project/hierarchy.ts` | 1,353 | Factorías, saneamiento, migración v1 Y-up → v2 Z-up, resúmenes de slots de material. |
| `/src/core/project/storage.ts` | 1,781 | `WebProjectStorageAdapter` (IndexedDB `forma3d_projects_db_v1` + `localStorage`). |
| `/src/core/project/projectFileFormat.ts` | 142 | Serialización y validación del formato `.forma3d.json` (`NativeProjectFileEnvelope`). |
| `/src/core/project/thumbnail.ts` | 186 | Utilidades de compresión/redimensionado de miniaturas WebP/PNG. |
| `/src/core/io/*` | 1,491 | `meshUtils.ts` (278), `objImport.ts` (557), `objExport.ts` (129), `stlImport.ts` (166), `stlExport.ts` (311), `glbImport.ts` (116), `glbExport.ts` (88), `imageReference.ts` (136), `modelThumbnail.ts` (248). |
| `/src/core/timelapse/*` | 2,443 | `types.ts` (222), `timelapseRecorder.ts` (173), `timelapseStorage.ts` (789), `timelapseRenderer.ts` (763), `timelapseMp4Exporter.ts` (497). |
| `/src/core/radial/radialActions.ts` | 1,809 | Registro `RADIAL_ACTION_MAP` y layouts por defecto para los 6 ámbitos radiales. |
| `/src/components/*` | — | **33 componentes React** de interfaz, visores 2D/3D, paneles y modales (ver detalle abajo). |

**Listado completo de los 33 archivos en `src/components/`:**
`AxisGizmoWidget.tsx` (391 l.), `BrandLogo.tsx` (67 l.), `CtrlAltOperationsMenu.tsx` (257 l.), `CtrlShiftPrimitivesMenu.tsx` (154 l.), `DeleteMenuPopover.tsx` (137 l.), `EditOperatorBar.tsx` (1,010 l.), `FileIoModals.tsx` (767 l.), `FloatingRadialMenu.tsx` (2,278 l.), `FloatingRadialPair.tsx` (637 l.), `GalleryModals.tsx` (675 l.), `LeftToolSidebar.tsx` (2,675 l.), `LinerPanel.tsx` (2,109 l.), `MaterialPanel.tsx` (506 l.), `MaterialWorkspace.tsx` (145 l.), `ModifierStackPanel.tsx` (1,473 l.), `NewProjectModal.tsx` (217 l.), `NumericFieldInput.tsx` (109 l.), `PrimitiveMenu.tsx` (357 l.), `ProjectGallery.tsx` (1,626 l.), `ProjectModal.tsx` (245 l.), `ProportionalIcons.tsx` (62 l.), `RadialActionIcon.tsx` (326 l.), `RadialSlotEditorModal.tsx` (356 l.), `SettingsModal.tsx` (2,098 l.), `TimelapseModal.tsx` (1,148 l.), `TopBar.tsx` (983 l.), `UVEditorCanvas.tsx` (1,831 l.), `UVSync3DViewport.tsx` (922 l.), `UVToolToolbar.tsx` (269 l.), `UVWorkspace.tsx` (939 l.), `Viewport3D.tsx` (1,091 l.), `ViewportContextMenu.tsx` (853 l.), `ViewportDisplaySelector.tsx` (377 l.).

### 3.2 Flujo de conexión entre componentes (Datos comprobados)

1. **Orquestación central React (`App.tsx` ↔ `useModelerStore`):**
   `App.tsx` instancia `useModelerStore()`, recibe un objeto de retorno con más de **160 estados y callbacks** (`src/state/useModelerStore.ts:6347-6545`) y los distribuye manualmente por *props* hacia todos los paneles, visores y modales. No existen React Contexts ni selectores externos.
2. **Puente React ↔ Motor Three.js (`Viewport3D.tsx` ↔ `ViewportEngine.ts`):**
   - `Viewport3D` crea una única instancia de `ViewportEngine` al montarse, registra un objeto `ViewportEngineCallbacks` y empuja cambios de React al motor mediante múltiples `useEffect` (`syncScene`, `syncSelection`, `syncTransformControls`, `syncDisplaySettings`, `syncSculptSettings`, `syncOperatorSession`, etc.).
   - `ViewportEngine` devuelve eventos e instantáneas mutadas mediante callbacks (`onObjectTransformCommit`, `onSculptMeshCommit`, `onModalSlideUpdate`, `onSelectionChange`, `onCameraChange`).
3. **Persistencia del contexto WebGL según workspace (`App.tsx`):**
   - En `'layout'`, `'materials'` y `'gallery'`, el componente `Viewport3D` permanece montado para conservar el contexto WebGL activo sin reconstruir escena ni texturas.
   - Sin embargo, al entrar en `'uv_editing'` (`UVSync3DViewport.tsx`) o `'timelapse'` (`TimelapseRenderer` en `TimelapseModal.tsx`), se montan **contextos WebGL paralelos adicionales** leyendo del proyecto serializado.

### 3.3 Diagnóstico de acoplamiento (Datos comprobados)

- **Fuertemente acoplados (difíciles de reutilizar hoy sin refactor):**
  - `src/state/useModelerStore.ts`: mezcla estado efímero de UI (toasts, modales, tabs), reglas de negocio 3D, temporizadores de autoguardado, grabación de *timelapse* e historial completo en un único hook React.
  - `src/App.tsx`: contiene lógica de atajos de teclado globales, confirmación de cierre, coordinación de operadores y flujo entre workspaces.
  - `src/engine/ViewportEngine.ts`: acopla la escena Three.js con matemática de pinceles de escultura en vivo, transformaciones modales y estado de UI del viewport.
  - `src/components/LinerPanel.tsx`: fusiona Outliner jerárquico (CORE) con Inspector de Transformación/Luz/Imagen de referencia (CORE) + pestañas de Modificadores (Modeler) y Materiales (Materiales).
- **Altamente independientes (listos para migración directa):**
  - `src/core/mesh/*`, `src/core/modifiers/*`, `src/core/uv/*`, `src/core/project/hierarchy.ts`, `src/core/project/storage.ts`, `src/core/project/projectFileFormat.ts`, `src/core/io/*` (excepto `modelThumbnail.ts`) y `src/core/timelapse/timelapseRecorder.ts` + `timelapseStorage.ts`.

---

## 4. Inventario funcional completo de LOOPA Modeler (Categorías A–O)

> Estados verificados exclusivamente contra el código existente:
> - **Funcional**: implementado de extremo a extremo (estado + algoritmo + UI).
> - **Parcialmente funcional**: implementado con limitaciones verificadas o desconexión entre modelo y UI.
> - **Experimental**: funcional o semiconstruido pero marcado como futuro/borrador o con integración incompleta.
> - **Inexistente**: presente solo como declaración de tipo/icono/stub sin creadores ni UI.

### A. Interfaz y navegación

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Barra superior (`TopBar`) y selector de espacios | Cambio entre `gallery`, `layout`, `uv_editing`, `materials`, `timelapse`; indicador de guardado, Undo/Redo, estadísticas y Ajustes. | **Funcional** | `src/components/TopBar.tsx`, `src/App.tsx`, `src/config/brand.ts`, `src/config/demo.ts` | `useModelerStore`, `SceneStatsInfo`. |
| Barra lateral izquierda (`LeftToolSidebar`) | Selector de herramientas de transformación, selección de componentes, herramientas de modelado y panel completo de Escultura. | **Funcional** | `src/components/LeftToolSidebar.tsx`, `src/App.tsx` | `useModelerStore`, `Viewport3D`. |
| Panel derecho (`LinerPanel`) | 3 pestañas: Jerarquía/Inspector (Escenas, Colecciones, Objetos, Transformación, Luz, Imagen de ref.), Modificadores y Materiales. | **Funcional** | `src/components/LinerPanel.tsx`, `src/components/ModifierStackPanel.tsx`, `src/components/MaterialPanel.tsx` | `useModelerStore`. |
| Menús radiales flotantes dobles (`BARHOME` y Herramientas) | Dos botones flotantes arrastrables con 8 slots configurables por ámbito (`barhome`, `object`, `edit`, `uv_editing`, `materials`, `sculpt`) y edición por pulsación larga. | **Parcialmente funcional** | `src/components/FloatingRadialPair.tsx`, `src/components/FloatingRadialMenu.tsx`, `src/core/radial/radialActions.ts`, `src/components/RadialSlotEditorModal.tsx`, `src/components/SettingsModal.tsx` | Funciona en `barhome`/`object`/`edit`/`uv_editing`/`materials`; el ámbito `sculpt` sigue etiquetado `"Escultura (futuro)"` en `SettingsModal.tsx:318` y `RadialSlotEditorModal.tsx:37` y su layout default solo contiene cámara/undo. |
| Modificadores táctiles en pantalla (`SHIFT`/`CTRL`/`ALT`) | Panel flotante con modo interruptor o pulsación + gesto de 2 dedos para `SHIFT`. | **Funcional** | `src/engine/TouchGestureManager.ts`, `src/components/FloatingRadialPair.tsx`, `src/components/SettingsModal.tsx` | `ViewportEngine`, `useModelerStore`. |
| Menú contextual del visor (`ViewportContextMenu`) | Menú adaptativo por clic derecho o pulsación larga según Modo Objeto/Edición y elemento impactado. | **Funcional** | `src/components/ViewportContextMenu.tsx`, `src/engine/ViewportEngine.ts`, `src/App.tsx` | Raycasting de `ViewportEngine`, `useModelerStore`. |
| Menús rápidos `Ctrl+Shift`, `Ctrl+Alt` y botón táctil `G` | `Ctrl+Shift` abre primitivas; `Ctrl+Alt` abre operaciones especiales; botón `G` hace tap = Mover modal y hold = Slide. | **Funcional** | `src/components/CtrlShiftPrimitivesMenu.tsx`, `src/components/CtrlAltOperationsMenu.tsx`, `src/components/Viewport3D.tsx`, `src/state/useModelerStore.ts` (`triggerGQuickTapMove`, `triggerGHoldSlide`) | `ViewportEngine`, `slideTools.ts`. |
| Gestos táctiles y compatibilidad iPadOS/Safari | Orbit 1 dedo, selección 1 toque, box select por doble toque + arrastre, pinch zoom, pan 2 dedos, undo 2 toques, redo 3 toques y calibración de intervalo. | **Funcional** | `src/engine/TouchGestureManager.ts`, `src/components/SettingsModal.tsx`, `src/state/useModelerStore.ts` | `ViewportEngine`, `localStorage`. |

### B. Gestión de proyectos

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Galería de proyectos | Listado, búsqueda por nombre, ordenamiento (`updated_desc`, `created_desc`, `name_asc`, `updated_asc`), vista cuadrícula/lista y selección múltiple. | **Funcional** | `src/components/ProjectGallery.tsx`, `src/components/GalleryModals.tsx` | `WebProjectStorageAdapter`, `useModelerStore`. |
| Gestión de carpetas | Crear, renombrar, filtrar (`all`, `unfiled`, carpeta), mover proyectos y eliminar carpeta desagrupando o reasignando contenido. | **Funcional** | `src/components/ProjectGallery.tsx`, `src/components/GalleryModals.tsx`, `src/core/project/storage.ts` | IndexedDB store `folders`. |
| Plantillas de proyecto nuevo | Crear proyecto con nombre, carpeta y plantilla inicial (`empty`, `cube`, `uv_sphere`, `plane`). | **Funcional** | `src/components/NewProjectModal.tsx`, `src/core/project/hierarchy.ts`, `src/state/useModelerStore.ts` | `WebProjectStorageAdapter`. |
| Renombrar, duplicar y eliminar proyectos | Operaciones individuales y por lote incluyendo borrado asociado de historial *timelapse*. | **Funcional** | `src/components/ProjectGallery.tsx`, `src/components/GalleryModals.tsx`, `src/components/ProjectModal.tsx`, `src/core/timelapse/timelapseStorage.ts` | IndexedDB (`projects`, `thumbnails`, `recovery`, `backups`, `timelapse_*`). |
| Modo Demo (`IS_DEMO_MODE`) | Restringe galería/persistencia/ajustes dejando un proyecto demo volátil en memoria. | **Funcional** | `src/config/demo.ts`, `src/App.tsx`, `src/components/TopBar.tsx` | `useModelerStore`. |

### C. Gestión de escenas

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Múltiples escenas por proyecto | Crear, cambiar escena activa, renombrar, duplicar y eliminar escenas (siempre que exista >1). | **Funcional** | `src/state/useModelerStore.ts`, `src/components/LinerPanel.tsx`, `src/core/project/hierarchy.ts` | `ViewportEngine.syncScene`, `HistorySnapshot`. |
| Colecciones jerárquicas | Crear colecciones en escena, expandir/contraer, renombrar, mover objetos entre colecciones, seleccionar hijos y eliminar colección conservando o borrando objetos. | **Funcional** | `src/components/LinerPanel.tsx`, `src/state/useModelerStore.ts`, `src/core/project/hierarchy.ts` | `SceneData.collections`. |
| Visibilidad, bloqueo y selección en Outliner | Toggle de visibilidad (`visible`), bloqueo (`locked`), renombrado inline y selección múltiple por fila. | **Funcional** | `src/components/LinerPanel.tsx`, `src/state/useModelerStore.ts`, `src/engine/ViewportEngine.ts` | `ViewportEngine` omite objetos ocultos/bloqueados en edición y gizmos. |

### D. Objetos y primitivas

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Primitivas poligonales paramétricas (7 tipos) | `cube`, `uv_sphere`, `cylinder`, `cone`, `plane`, `circle`, `torus` creadas en `cursor3D` con parámetros ajustables al añadir. | **Funcional** | `src/core/mesh/primitives.ts`, `src/components/PrimitiveMenu.tsx`, `src/components/CtrlShiftPrimitivesMenu.tsx`, `src/state/useModelerStore.ts` | `EditableMesh`, `cursor3D`, `ViewportEngine`. |
| Mallas personalizadas (`custom`) | Creación al importar OBJ/STL/GLB o usar `separateSelectedGeometry`. | **Funcional** | `src/state/useModelerStore.ts`, `src/core/io/objImport.ts`, `src/core/io/stlImport.ts`, `src/core/io/glbImport.ts` | `EditableMesh`. |
| Luces de punto (`light`) | Objeto de escena con posición, color, intensidad, alcance, estado encendido/apagado e icono visible/oculto. | **Funcional** | `src/state/useModelerStore.ts`, `src/components/LinerPanel.tsx`, `src/engine/ViewportEngine.ts` | `THREE.PointLight` + marcador seleccionable. |
| Planos de imagen de referencia (`reference_image`) | Carga JPG/PNG (máx. 24 MB, auto-escalado ≤4096 px para WebGL), opacidad, 7 orientaciones, profundidad (`front`/`back`) y restaurar proporción. | **Funcional** | `src/core/io/imageReference.ts`, `src/components/LinerPanel.tsx`, `src/engine/ViewportEngine.ts`, `src/state/useModelerStore.ts` | `THREE.PlaneGeometry`, `THREE.TextureLoader`. |
| Objetos `camera` y `empty` | Declarados en `SceneObjectType` (`types.ts:77-82`) con icono en `LinerPanel.tsx` y omitidos en `ViewportEngine.ts:5217-5218`. | **Inexistente** | `src/core/project/types.ts`, `src/components/LinerPanel.tsx`, `src/engine/ViewportEngine.ts` | Sin creadores en `useModelerStore`, sin visuales 3D y sin botones UI. |

### E. Modo de edición

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Modo Objeto (`object`) | Selección de objetos, gizmos y utilidades de objeto (duplicar, aplicar transformaciones, centrar origen, ocultar, eliminar). | **Funcional** | `src/state/useModelerStore.ts`, `src/engine/ViewportEngine.ts`, `src/App.tsx` | `TransformControls`, `EditableMesh`. |
| Modo Edición (`edit`) | Edición topológica directa sobre malla base manteniendo caché de selección previa por objeto (`savedEditSelectionsRef`) mientras el visor renderiza modificadores evaluados + overlays base. | **Funcional** | `src/state/useModelerStore.ts`, `src/engine/ViewportEngine.ts`, `src/core/modifiers/evaluateModifiers.ts` | `EditableMesh`, `baseSolidCollider`. |
| Modo Escultura (`sculpt`) | 10 pinceles (`draw`, `smooth`, `grab`, `clay`, `inflate`, `crease`, `flatten`, `pinch`, `draw_sharp`, `clay_strips`), radio, fuerza, invertir, `strokeSmoothing` y simetría X/Y/Z con cursor anillo 3D. | **Parcialmente funcional** | `src/core/mesh/sculptBrushes.ts`, `src/engine/ViewportEngine.ts`, `src/components/LeftToolSidebar.tsx`, `src/state/useModelerStore.ts` | Opera solo sobre vértices base existentes (sin remesh/Dyntopo/multires, búsqueda lineal `O(V)`); etiquetado aún como `"Escultura (futuro)"` en ajustes radiales. |
| Espacio UV Editing (`uv_editing`) | Editor 2D + visor 3D sincronizado con selección e interacción bidireccional sobre `EditableMesh.faces[].uvs`. | **Funcional** | `src/components/UVWorkspace.tsx`, `src/components/UVEditorCanvas.tsx`, `src/components/UVSync3DViewport.tsx`, `src/core/uv/*` | `useModelerStore` (estado del proyecto), `THREE.WebGLRenderer` propio en `UVSync3DViewport`. |
| Espacio Materiales (`materials`) | Barra de materiales integrada junto al viewport 3D persistente. | **Funcional** | `src/components/MaterialWorkspace.tsx`, `src/components/MaterialPanel.tsx`, `src/App.tsx` | `useModelerStore`, `Viewport3D`. |

### F. Selección de vértices, aristas y caras

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Submodos Vértice / Arista / Cara | Conmutación por teclas `1`/`2`/`3` o botones; guarda selección previa por objeto en `savedEditSelectionsRef`. | **Funcional** | `src/state/useModelerStore.ts`, `src/engine/ViewportEngine.ts`, `src/components/TopBar.tsx`, `src/components/LeftToolSidebar.tsx` | `EditableMesh`. |
| Selección por toque/clic y multi-selección | Raycasting sobre `baseSolidCollider` y proyección en pantalla para vértices/aristas; soporta `Shift` o `multiSelectTouch`. | **Funcional** | `src/engine/ViewportEngine.ts`, `src/engine/TouchGestureManager.ts` | `THREE.Raycaster`, `EditableMesh`. |
| Selección rectangular (*Box Select*) | Arrastre en viewport o doble toque + arrastre táctil proyectando componentes a NDC, con modos sumar (`Shift`) o restar (`Ctrl`). | **Funcional** | `src/engine/ViewportEngine.ts`, `src/engine/boxSelectMath.ts`, `src/components/Viewport3D.tsx` | `TouchGestureManager`. |
| Selección Loop y Ring | `findEdgeLoop`, `findEdgeRing`, `findVertexLoopDirections`, `findFaceLoopDirections` (`Alt+Click` o menú contextual). | **Funcional** | `src/core/mesh/loopSelect.ts`, `src/engine/ViewportEngine.ts`, `src/state/useModelerStore.ts` | `EditableMesh` (topología de quads). |
| Camino más corto (*Shortest Path*) | `findShortestVertexPath`, `findShortestEdgePath`, `findShortestFacePath` (`Ctrl+Click`). | **Funcional** | `src/core/mesh/shortestPathSelect.ts`, `src/engine/ViewportEngine.ts`, `src/state/useModelerStore.ts` | Dijkstra ponderado por distancia 3D. |
| Seleccionar todo / Limpiar / Invertir / Por material / Costuras | `selectAll`, `deselectAll`, `invertSelection`, `selectFacesByMaterial`, `selectSeamEdges`, `deselectSeamEdges`. | **Funcional** | `src/state/useModelerStore.ts`, `src/components/MaterialPanel.tsx`, `src/components/ViewportContextMenu.tsx` | `EditableMesh`. |

### G. Herramientas de transformación

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Gizmos 3D (`select`, `move`, `rotate`, `scale`, `all`) | `THREE.TransformControls` (hasta 3 instancias simultáneas en `'all'`), espacio Local/Global, tamaño ajustable y snap configurable. | **Funcional** | `src/engine/ViewportEngine.ts`, `src/state/useModelerStore.ts`, `src/components/LeftToolSidebar.tsx`, `src/components/SettingsModal.tsx` | `AxisConstraint`, `ModelerSettings`. |
| Transformación modal (`G`, `R`, `S` + eje `X`/`Y`/`Z`) | Arrastre libre o restringido a eje sobre objeto o selección sin pulsar el gizmo; confirma o cancela con `Escape`/clic derecho. | **Funcional** | `src/engine/ViewportEngine.ts`, `src/App.tsx`, `src/state/useModelerStore.ts` | `modalTransform`. |
| *Vertex Slide* y *Edge Slide* (`G` mantenido / submodo `slide`) | Deslizamiento paramétrico con rieles por vértice/arista, `clamp` de rango y ajuste fino en `EditOperatorBar`. | **Funcional** | `src/core/mesh/slideTools.ts`, `src/engine/ViewportEngine.ts`, `src/components/EditOperatorBar.tsx`, `src/state/useModelerStore.ts` (`triggerGHoldSlide`) | `EditableMesh`. |
| Edición proporcional (`O`) | 8 curvas de caída (`smooth`, `sphere`, `root`, `inverse_square`, `sharp`, `linear`, `constant`, `random`), radio ajustable, `connectedOnly`, círculo indicador y coloreado de peso. | **Funcional** | `src/core/mesh/proportionalEditing.ts`, `src/engine/ViewportEngine.ts`, `src/components/LeftToolSidebar.tsx`, `src/components/SettingsModal.tsx` | Integrada en gizmos, modal transform y centroide numérico. |
| Inspector numérico de Transformación / Centroide | Coordenadas exactas `NumericFieldInput` de Posición, Rotación (grados) y Escala en Objeto, o Centroide local en Edición. | **Funcional** | `src/components/LinerPanel.tsx`, `src/components/NumericFieldInput.tsx`, `src/state/useModelerStore.ts` | `EditableMesh`. |

### H. Modelado y edición de geometría

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Extruir (`Extrude`) | Extrusión de vértices, aristas o caras (región o individual) por normal o eje X/Y/Z con barra paramétrica en vivo. | **Funcional** | `src/core/mesh/operations.ts`, `src/core/mesh/advancedOperations.ts`, `src/components/EditOperatorBar.tsx`, `src/state/useModelerStore.ts` | `operatorSession`, `EditableMesh`. |
| Biselar (`Bevel`) | Biselado de aristas y vértices con ancho, segmentos, perfil y `clampOverlap`. | **Funcional** | `src/core/mesh/advancedOperations.ts` (`bevelMesh`), `src/components/EditOperatorBar.tsx`, `src/state/useModelerStore.ts` | `EditableMesh`. |
| Subdividir (`Subdivide`) | Subdivisión local de aristas/caras con cortes, suavizado y fractal. | **Funcional** | `src/core/mesh/advancedOperations.ts` (`subdivideMesh`), `src/components/EditOperatorBar.tsx` | `EditableMesh`. |
| Insertar caras (`Inset`) | Inset de región o caras individuales con grosor y profundidad. | **Funcional** | `src/core/mesh/advancedOperations.ts` (`insetFacesMesh`), `src/components/EditOperatorBar.tsx` | `EditableMesh`. |
| Corte en bucle (`Loop Cut`) | Detección de anillos de quads, previsualización 3D de segmentos de corte, cantidad de cortes y `slide` (-1..1). | **Funcional** | `src/core/mesh/loopCut.ts`, `src/engine/ViewportEngine.ts`, `src/components/EditOperatorBar.tsx` | `EditableMesh`, overlay preview cyan. |
| Fusionar (`Merge`) y Fusionar por distancia | Fusión al centro/primero/último o colapso por distancia umbral configurable. | **Funcional** | `src/core/mesh/advancedOperations.ts` (`mergeVerticesMesh`, `mergeByDistanceMesh`), `src/components/EditOperatorBar.tsx` | `EditableMesh`. |
| Rellenar (`Fill` / `F`), Conectar ruta (`J`) y `Bridge Edge Loops` | Creación de arista/cara (`fillMesh`), corte de caras entre vértices (`connectVertexPathMesh`) y puenteo de loops con cortes/twist (`bridgeEdgeLoopsMesh`). | **Funcional** | `src/core/mesh/advancedOperations.ts`, `src/core/mesh/connectVertexPath.ts`, `src/core/mesh/topologyTools.ts`, `src/components/EditOperatorBar.tsx` | `EditableMesh`. |
| Eliminar y Disolver contextual (`X` / `DeleteMenuPopover`) | Eliminar vértices/aristas/caras/solo caras; disolver vértices, aristas, caras y `Limited Dissolve` (ángulo + vértices colineales). | **Funcional** | `src/components/DeleteMenuPopover.tsx`, `src/core/mesh/advancedOperations.ts` (`applyDeleteAction`), `src/core/mesh/topologyTools.ts` (`limitedDissolveMesh`) | `EditableMesh`. |
| Normales y `Face Orientation` | `recalculateOutsideMesh`, `flipNormalsMesh`, diagnóstico no-manifold/degeneradas y sombreado azul/rojo de orientación en visor. | **Funcional** | `src/core/mesh/normals.ts`, `src/engine/ViewportEngine.ts`, `src/components/ViewportDisplaySelector.tsx`, `src/components/ViewportContextMenu.tsx` | `EditableMesh`. |
| Separar geometría (`P`), Duplicar, Aplicar transformaciones y Centrar origen | `separateSelectedGeometry`, `duplicateObjectById`, `applyObjectTransform`, `centerObjectOrigin`. | **Funcional** | `src/state/useModelerStore.ts`, `src/core/mesh/operations.ts`, `src/components/CtrlAltOperationsMenu.tsx` | `EditableMesh`. |
| Stack de modificadores no destructivos (4 tipos) | `Mirror` (ejes X/Y/Z, clipping, merge, bisect), `Subdivision` (Catmull-Clark 1–3), `Solidify` (grosor, offset, rim), `Bevel` (ancho, segmentos, ángulo). Reordenar, duplicar, toggle y aplicar (`Apply`). | **Funcional** | `src/core/modifiers/evaluateModifiers.ts`, `mirrorModifier.ts`, `subdivisionModifier.ts`, `solidifyModifier.ts`, `bevelModifier.ts`, `src/components/ModifierStackPanel.tsx` | `EditableMesh`, caché LRU de 64 entradas. |
| Sombreado `Flat` / `Smooth` por objeto | Conmutación de sombreado plano/suavizado en visor y exportación. | **Funcional** | `src/state/useModelerStore.ts`, `src/components/LinerPanel.tsx`, `src/engine/ViewportEngine.ts` | `EditableMesh.buildTriangulatedData`. |

### I. Materiales

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Librería de `MaterialAsset` | Crear, renombrar, duplicar, eliminar y consultar uso en objetos/caras del proyecto. | **Funcional** | `src/state/useModelerStore.ts`, `src/components/MaterialPanel.tsx`, `src/components/LinerPanel.tsx`, `src/components/MaterialWorkspace.tsx` | `ProjectData.materials`. |
| Propiedades PBR básicas en UI | Edición de `name`, `baseColor`, `roughness`, `metallic` y `opacity` con historial agrupado. | **Funcional** | `src/components/MaterialPanel.tsx`, `src/engine/ViewportEngine.ts` (`syncSharedMaterials`) | `THREE.MeshStandardMaterial`. |
| Asignación multi-material por cara | Asignar o limpiar `face.materialId` en caras seleccionadas y seleccionar caras por material. | **Funcional** | `src/components/MaterialPanel.tsx`, `src/core/mesh/EditableMesh.ts`, `src/engine/ViewportEngine.ts` | `buildTriangulatedData` (`materialGroups`). |
| Textura difusa (`textureDataUrl`, `textureName`) | Se almacena en `MaterialAsset`, se importa en GLB y se puede cargar desde el botón "Importar textura" de `UVToolToolbar`; se renderiza en `ViewportEngine` y `UVSync3DViewport`. | **Parcialmente funcional** | `src/core/project/types.ts`, `src/components/UVToolToolbar.tsx`, `src/components/UVWorkspace.tsx`, `src/engine/ViewportEngine.ts`, `src/components/UVSync3DViewport.tsx`, `src/core/io/glbImport.ts` | **Sin UI de carga/gestión en `MaterialPanel.tsx`/`MaterialWorkspace.tsx`**; **no se exporta** en `meshUtils.ts` ni se renderiza en `timelapseRenderer.ts`/`modelThumbnail.ts`. |
| Emisión PBR (`emissiveColor`, `emissiveIntensity`) | Definida en `MaterialAsset`, saneada en `hierarchy.ts`, importada en `glbImport.ts` y renderizada en `ViewportEngine` y `timelapseRenderer`. | **Parcialmente funcional** | `src/core/project/types.ts`, `src/core/project/hierarchy.ts`, `src/engine/ViewportEngine.ts`, `src/core/timelapse/timelapseRenderer.ts` | **No tiene ningún control de edición en `MaterialPanel.tsx`**. |

### J. Iluminación

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Iluminación de estudio fija | `AmbientLight` + 3 `DirectionalLight` + entorno HDR sintético `RoomEnvironment` vía `PMREMGenerator`. | **Funcional** | `src/engine/ViewportEngine.ts`, `src/components/UVSync3DViewport.tsx`, `src/core/timelapse/timelapseRenderer.ts`, `src/core/io/modelThumbnail.ts` | Replicada en cada renderer de forma independiente. |
| Luces de punto de escena (`LightData`) | Agregar `PointLight`, encender/apagar, ajustar color, intensidad (`0..200`), alcance (`0..500`, `0` = ilimitado) y visibilidad de icono 3D. | **Funcional** | `src/components/LinerPanel.tsx` (`light-inspector-panel`), `src/engine/ViewportEngine.ts`, `src/state/useModelerStore.ts` | `THREE.PointLight` (sin sombras dinámicas). |
| Otros tipos de luz (`Directional`, `Spot`, `Area`), sombras y HDRI personalizado | `LightType` solo admite `'point'`; no existen sombras dinámicas ni selector de entorno HDRI. | **Inexistente** | `src/core/project/types.ts` (`LightType = 'point'`) | — |

### K. Cámara y visualización

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Navegación orbital, paneo y zoom | Cámara Z-up con `OrbitControls` y gestos táctiles. | **Funcional** | `src/engine/ViewportEngine.ts`, `src/engine/TouchGestureManager.ts` | `THREE.OrbitControls`. |
| Proyección Perspectiva/Ortográfica y vistas preestablecidas | Conmutación Persp/Orto (`5`), 6 vistas ortográficas (`front`, `back`, `right`, `left`, `top`, `bottom`), `AxisGizmoWidget` interactivo y `Focus` (`.`). | **Funcional** | `src/engine/ViewportEngine.ts` (`switchProjection`, `setCameraPreset`), `src/components/AxisGizmoWidget.tsx`, `src/components/TopBar.tsx` | `PerspectiveCamera`, `OrthographicCamera`. |
| Modos de sombreado y ayudas visuales (`ViewportDisplaySelector`) | `wireframe`, `solid`, `xray` (transparencia ajustable), `material`, grilla, ejes X/Y/Z, `Face Orientation` y overlay de resaltado de n-gons (`syncNgonHighlightOverlay`). | **Funcional** | `src/components/ViewportDisplaySelector.tsx`, `src/engine/ViewportEngine.ts`, `src/state/useModelerStore.ts` | Materiales auxiliares en `ViewportEngine`. |

### L. Guardado y recuperación

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Almacenamiento local IndexedDB | `WebProjectStorageAdapter` con almacenes `projects`, `folders`, `thumbnails`, `recovery`, `backups`. | **Funcional** | `src/core/project/storage.ts`, `src/core/project/thumbnail.ts`, `src/state/useModelerStore.ts` | Base de datos `forma3d_projects_db_v1` (v3). |
| Guardado manual, autoguardado y backups | Autoguardado configurable (`15s`–`300s`) a `recovery`, respaldo opcional antes de sobrescribir (`backups`) y captura de miniatura. | **Funcional** | `src/state/useModelerStore.ts`, `src/core/project/storage.ts`, `src/components/SettingsModal.tsx` | `ViewportEngine.captureThumbnailDataUrl`. |
| Recuperación ante cierre inesperado | Detección de borradores `recovery` más recientes y diálogo para restaurar o descartar. | **Funcional** | `src/core/project/storage.ts`, `src/state/useModelerStore.ts`, `src/components/GalleryModals.tsx` | IndexedDB `recovery`. |
| Persistencia de preferencias y último proyecto | Preferencias de visor, herramientas, gestos táctiles y layouts radiales en `localStorage`. | **Funcional** | `src/core/project/storage.ts`, `src/state/useModelerStore.ts` | Claves `forma3d_*` y `loopa_toolbar_layout_prefs_v1`. |

### M. Importación y exportación

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Importación/Exportación nativa `.forma3d.json` | Sobre `NativeProjectFileEnvelope` (`format: 'forma3d-project'`) con migración automática de proyectos v1 Y-up a v2 Z-up. | **Funcional** | `src/core/project/projectFileFormat.ts`, `src/core/project/hierarchy.ts`, `src/components/FileIoModals.tsx` | `ProjectData`, `EditableMesh.fromJSON`. |
| Importación de modelos `.obj`, `.stl`, `.glb`/`.gltf` | Conversión de ejes a Z-up, fusión opcional de vértices cercanos, multi-mesh separado o combinado, y lectura básica de color/textura/emisión en GLB. | **Funcional** | `src/core/io/objImport.ts`, `src/core/io/stlImport.ts`, `src/core/io/glbImport.ts`, `src/components/FileIoModals.tsx`, `src/components/ProjectGallery.tsx` | `OBJLoader`, `STLLoader`, `GLTFLoader`. |
| Exportación de modelos `.obj`, `.stl` (ASCII/binario), `.glb` | Exporta selección o escena activa aplicando modificadores evaluados y conversión Z-up → Y-up. | **Parcialmente funcional** | `src/core/io/objExport.ts`, `src/core/io/stlExport.ts`, `src/core/io/glbExport.ts`, `src/core/io/meshUtils.ts`, `src/components/FileIoModals.tsx` | **`buildThreeMeshForExport` (`meshUtils.ts`) ignora grupos multi-material por cara (`face.materialId`) y no transfiere `textureDataUrl`** (aunque sí conserva UVs). |
| Exportación de video Timelapse `.mp4` | Renderizado offline frame a frame y codificación H.264/AVC (720p/1080p, 24/30/60 fps). | **Funcional** *(con limitación multi-material/textura)* | `src/core/timelapse/timelapseMp4Exporter.ts`, `src/core/timelapse/timelapseRenderer.ts`, `src/components/TimelapseModal.tsx` | `mp4-muxer`, `VideoEncoder` (WebCodecs). *(El renderer timelapse omite texturas y grupos por cara).* |

### N. Herramientas adicionales

| Función | Descripción | Estado actual | Archivos donde está implementada | Dependencias y sistemas conectados |
| :--- | :--- | :--- | :--- | :--- |
| Cursor 3D | Punto de inserción espacial para nuevas primitivas con indicador visual en viewport. | **Funcional** | `src/state/useModelerStore.ts` (`cursor3D`), `src/engine/ViewportEngine.ts`, `src/components/Viewport3D.tsx` | Primitivas, gizmos/referencia espacial. |
| Grabación y reproductor Timelapse | Grabación automática por deltas/snapshots periódicos, reproductor con línea de tiempo, velocidad, opción de cámara y gestor de cuota/limpieza. | **Funcional** | `src/core/timelapse/timelapseRecorder.ts`, `timelapseStorage.ts`, `timelapseRenderer.ts`, `src/components/TimelapseModal.tsx` | IndexedDB (`timelapse_meta`, `timelapse_steps`, `timelapse_blobs`). |
| Editor UV 2D y Unwrapping | Proyecciones (`smart`, `angle_based`, `cube`, `sphere`, `cylinder`, `planar_view`), costuras, selección por vértice o isla (`uv_island`), `G`/`R`/`S` 2D, flip, alinear, distribuir, `Pack Islands` y overlay Checker. | **Funcional** | `src/core/uv/uvUnwrap.ts`, `src/core/uv/uvOperations.ts`, `src/components/UVEditorCanvas.tsx`, `src/components/UVSync3DViewport.tsx`, `src/components/UVWorkspace.tsx`, `src/components/UVToolToolbar.tsx` | `EditableMesh.faces[].uvs`, `EditableMesh.edges[].isSeam`. |

### O. Funciones experimentales o incompletas

| Función | Descripción | Estado actual | Archivos donde está implementada | Brecha verificada |
| :--- | :--- | :--- | :--- | :--- |
| Tipos `camera` y `empty` | Declarados en `SceneObjectType`. | **Inexistente** | `src/core/project/types.ts`, `src/components/LinerPanel.tsx`, `src/engine/ViewportEngine.ts` | Sin creadores, sin geometría/visualizador, sin UI de creación. |
| Configuración radial de Escultura | Scope `'sculpt'` existente pero etiquetado `"Escultura (futuro)"`. | **Experimental / Desincronizada** | `src/components/SettingsModal.tsx:318`, `src/components/RadialSlotEditorModal.tsx:37`, `src/core/radial/radialActions.ts` | Faltan acciones radiales dedicadas de pinceles/radio/fuerza/simetría. |
| Soporte PWA offline | Existen `manifest.webmanifest` e iconos. | **Incompleta** | `public/manifest.webmanifest`, `index.html` | Sin Service Worker registrado. |
| Paridad multi-material/textura en IO y Timelapse | Soportado en visor principal (`ViewportEngine`), omitido fuera de él. | **Incompleta** | `src/core/io/meshUtils.ts`, `src/core/timelapse/timelapseRenderer.ts`, `src/core/io/modelThumbnail.ts` | Solo se aplica material único del objeto sin grupos por cara ni texturas. |
| Controles UI de emisión y texturas en Panel de Materiales | Campos presentes en `MaterialAsset` y `ViewportEngine`, ausentes en `MaterialPanel`. | **Incompleta en UI** | `src/components/MaterialPanel.tsx`, `src/components/MaterialWorkspace.tsx` | Faltan controles para `emissiveColor`, `emissiveIntensity` y carga directa de `textureDataUrl`. |

---

## 5. Análisis del motor 3D

### 5.1 Datos comprobados sobre representación geométrica (`EditableMesh`)

Toda la geometría editable está **centralizada en `EditableMesh`** (`src/core/mesh/EditableMesh.ts`) bajo un **sistema de coordenadas Z-up** (convención Blender):
- **Vértices (`MeshVertex`)**: `{ id: string, position: [number, y: number, z: number] }`.
- **Aristas (`MeshEdge`)**: `{ id: string, v0: string, v1: string, isSeam?: boolean, bevelWeight?: number }`.
- **Caras (`MeshFace`)**: `{ id: string, vertexIds: string[], uvs?: Vec2[], normals?: Vec3[], materialId?: string }`. Admite triángulos, quads y n-gons arbitrarios.
- **Índices topológicos en memoria (reconstruidos con `rebuildIndices()`, no serializados en JSON)**:
  `vertexMap`, `edgeMap`, `faceMap`, `edgeKeyToEdge` (clave ordenada `min|max`), `vertexToEdges`, `vertexToFaces`, `edgeToFaces`.

### 5.2 Triangulación, normales y sombreado (Datos comprobados)

- `EditableMesh.buildTriangulatedData(shading, defaultMaterialId)` convierte la topología poligonal a buffers planos/indexados para Three.js (`positions`, `normals`, `uvs`, `triToFaceId`, `triRangesByFace`, `materialGroups`).
- Las caras de más de 3 vértices se triangulan proyectando sobre su plano local (`triangulateFace`), manteniendo un mapeo `triToFaceId` indispensable para traducir el índice de triángulo devuelto por `THREE.Raycaster` al `face.id` original de `EditableMesh`.
- **Normales**: En `'flat'` genera vértices desacoplados con la normal plana de la cara; en `'smooth'` promedia normales incidentes por vértice (o preserva `face.normals` explícitas si existen). La limpieza y orientación topológica reside en `src/core/mesh/normals.ts` (`analyzeMeshNormals`, `recalculateOutsideMesh`, `flipNormalsMesh`).

### 5.3 Creación y actualización de objetos en escena (`ViewportEngine.ts`)

1. Al sincronizar (`syncScene`), `ViewportEngine` compara los `SceneObjectData` entrantes con `this.objectVisuals: Map<string, ObjectVisualRecord>`.
2. Para objetos `'mesh'`: reconstruye `EditableMesh.fromJSON(obj.mesh)` y evalúa la pila de modificadores mediante `evaluateObjectModifiers(obj, baseMesh)` (`src/core/modifiers/evaluateModifiers.ts`), usando una caché LRU (`MAX_CACHE_ENTRIES = 64`).
3. En `rebuildObjectGeometry`:
   - Genera el `BufferGeometry` evaluado (`solidMesh`) con grupos por material (`geometry.groups`) e instancia un arreglo `THREE.MeshStandardMaterial[]`.
   - En Modo Edición genera una geometría colisionadora de la jaula base sin modificadores (`baseSolidCollider`) y overlays de alambre (`LineSegments`), vértices (`Points`) y resaltado de n-gons (`syncNgonHighlightOverlay`).
4. Para `'light'`: instancia `THREE.PointLight` + marcador visual para selección.
5. Para `'reference_image'`: instancia `THREE.PlaneGeometry` con `THREE.Texture`, opacidad, orientación y `renderOrder`/`depthWrite` según `depthMode`.

### 5.4 Transformaciones, selección, escultura y bucle de renderizado (Datos comprobados)

- **Gizmos y transformaciones**:
  - `ViewportEngine` mantiene 3 instancias de `TransformControls` (para soportar modo `'all'` combinado además de `'move'`, `'rotate'`, `'scale'`).
  - En Modo Edición ancla los gizmos al centroide mundial de los vértices seleccionados; durante el arrastre actualiza directamente el buffer de posiciones en GPU (aplicando `proportionalEditing` y `clampVerticesForMirrorClipping`) y comitea el nuevo `EditableMesh` al soltar.
  - Los operadores modales (`G`, `R`, `S`, `vertex_slide`, `edge_slide`) operan sobre eventos pointer en pantalla sin requerir tocar el gizmo.
- **Selección**: Raycasting contra objetos en Modo Objeto, contra `baseSolidCollider` / proyección en pantalla en Modo Edición, y proyección NDC en `boxSelectMath.ts` para selección rectangular.
- **Escultura en vivo**: Durante un trazo en `workMode === 'sculpt'`, `ViewportEngine` mantiene un `EditableMesh` vivo en memoria, invoca `applySculptBrush` (`sculptBrushes.ts`) en cada movimiento de puntero recalculando `BufferGeometry` en caliente y envía `onSculptMeshCommit` al finalizar el trazo.
- **Cámaras, luces y renderizado**:
  - `PerspectiveCamera` y `OrthographicCamera` con `up.set(0, 0, 1)` (Z-up) controladas por `OrbitControls` + `TouchGestureManager`.
  - Estudio fijo (`RoomEnvironment` + `PMREMGenerator` + `AmbientLight` + 3 `DirectionalLight`) + `PointLight` dinámicas de escena.
  - Bucle **bajo demanda (`requestRender()`)** salvo animación/damping activo.

### 5.5 Hallazgos críticos del motor 3D (Datos comprobados vs. Recomendaciones)

- **Dato comprobado — Duplicación de renderers:** Los archivos `ViewportEngine.ts`, `UVSync3DViewport.tsx`, `timelapseRenderer.ts` y `modelThumbnail.ts` crean cada uno su propio `WebGLRenderer`, `PMREMGenerator` + `RoomEnvironment`, luces de 3 puntos, grilla Z-up y `detectSoftwareWebGL()`.
- **Dato comprobado — Inconsistencia multi-material:** Solo `ViewportEngine.ts` aplica `materialGroups` multi-material por cara y `textureDataUrl`; `meshUtils.ts`, `timelapseRenderer.ts` y `modelThumbnail.ts` los omiten.
- **Dato comprobado — Escalabilidad de escultura:** `sculptBrushes.ts` recorre linealmente todos los vértices de la malla en cada *dab* (`O(V)`).
- **Recomendación para LOOPA CORE:** Extraer un **`CoreViewportService`** único que encapsule creación de contexto WebGL, `RoomEnvironment`, cámaras Z-up, caché compartida de `MaterialAsset` + texturas y `MeshBuilder` (`EditableMesh → BufferGeometry`), añadiendo aceleración espacial (**BVH / Octree**) para picking y escultura.

---

## 6. Sistema de estado e historial

### 6.1 Estado de la aplicación y sincronización UI (Datos comprobados)

- Todo el estado de ejecución vive dentro de un único hook React: `useModelerStore()` (`src/state/useModelerStore.ts`, 6,546 líneas) invocado en `App.tsx`.
- Estados clave: `project: ProjectData`, `workMode`, `activeTool`, `moveSubMode`, `axisConstraint`, `editSelectionMode`, `transformOrientation`, `sculptSettings`, `uvSelectionMode`, `selectedObjectId`, `selectedObjectIds`, `selectedComponentIds`, `selectedUvKeys`, `savedEditSelectionsRef`, `operatorSession`, `modalTransform`, `cursor3D`, `settings`, `activeWorkspace`, `saveStatus`, `hasUnsavedChanges`, `meshRevision`.
- Cada modificación actualiza inmutablemente `project` en React state e incrementa `meshRevision`. `Viewport3D` observa decenas de dependencias en `useEffect` para sincronizar imperativamente `ViewportEngine`.

### 6.2 Historial Undo / Redo (Datos comprobados)

- Implementado mediante dos pilas en refs: `undoStackRef` y `redoStackRef` con `MAX_HISTORY = 50` (`src/state/useModelerStore.ts:317`), más un contador `historyVersion` para reactivar botones UI (`canUndo`, `canRedo`).
- Cada entrada (`HistorySnapshot` vía `makeSnapshot()`) realiza una **copia profunda completa mediante `JSON.parse(JSON.stringify(...))` de `project.scenes` y `project.materials`**, además de `activeSceneId`, modos y selecciones.
- **Agrupación de cambios continuos**:
  - Los operadores paramétricos (`EditOperatorBar`) guardan una sola instantánea antes de abrir la sesión y re-evalúan el operador desde el `baseMeshJson` inicial al mover sliders.
  - Los deslizadores de materiales y trazos de escultura empujan historial al iniciar la interacción (`onPushMaterialHistory` / inicio de trazo) y comitean el resultado final.

### 6.3 Limitaciones y diseño universal para LOOPA CORE

- **Dato comprobado:** El esquema actual de `HistorySnapshot` serializa y clona **todas las escenas y mallas completas del proyecto** en cada acción Undo.
- **Hipótesis técnica:** En proyectos con varios objetos de alta densidad o en sesiones continuas de **LOOPA Sculpt** (decenas de trazos seguidos sobre mallas de 50k–200k vértices), 50 copias JSON completas provocarán alto consumo de RAM y pausas perceptibles de GC/serialización.
- **Recomendación para LOOPA CORE:**
  1. Sustituir `useModelerStore.ts` por un **`CoreProjectStore`** independiente de React basado en suscripciones granulares por entidad (`scene`, `objectId`, `materialId`, `selection`).
  2. Implementar un **`CoreCommandHistory`** basado en comandos o *structural sharing* por ID: un trazo de escultura o transformación de un objeto solo almacena el delta de vértices o la versión previa de **ese objeto específico**, compartiendo por referencia inmutable el resto de la escena.
  3. Incorporar un **`EventBus`** tipado (`mesh:changed`, `transform:changed`, `material:changed`, `selection:changed`) que notifique en tiempo real a los visores y módulos activos sin *prop-drilling*.

---

## 7. Sistema de guardado, proyectos y persistencia

### 7.1 Estructura actual de datos guardados (Datos comprobados)

Definida en `src/core/project/types.ts` y normalizada en `src/core/project/hierarchy.ts`:
- `ProjectData`: `version: 2`, `coordinateSystem: 'z-up'` (con migración automática desde v1 `y-up` rotando `-PI/2` en X), `id`, `name`, `createdAt`, `updatedAt`, `lastOpenedAt`, `folderId`, `templateId`, `thumbnailDataUrl`, `thumbnailUpdatedAt`, `activeSceneId`, `materials: MaterialAsset[]`, `scenes: SceneData[]`.
- `SceneData`: `id`, `name`, `activeCollectionId`, `collections: CollectionData[]`, `objects: SceneObjectData[]`.
- `SceneObjectData`: `id`, `name`, `objectType`, `primitiveType`, `collectionId`, `visible`, `locked`, `transform`, `mesh: SerializedEditableMesh`, `material` (fallback legacy), `materialId`, `shading`, `modifiers: ModifierSlot[]`, `referenceImage?: ReferenceImageData`, `light?: LightData`.

### 7.2 Persistencia local, autoguardado y recuperación (Datos comprobados)

- Implementado en `WebProjectStorageAdapter` (`src/core/project/storage.ts`, 1,781 líneas):
  - **IndexedDB (`forma3d_projects_db_v1`, versión 3)** con 8 *object stores*:
    `projects`, `folders`, `thumbnails`, `recovery`, `backups`, `timelapse_meta`, `timelapse_steps`, `timelapse_blobs`.
  - **`localStorage`**: almacena preferencias de usuario (`forma3d_settings_v1`, `loopa_toolbar_layout_prefs_v1`, etc.), último proyecto activo y metadatos espejo/control de cuota.
- **Guardado y recuperación**:
  - Autoguardado periódico configurable (15 s a 5 min) en el store `recovery`.
  - Al guardar manualmente se puede generar respaldo previo en `backups` (`createRecoveryBackups`).
  - Al abrir un proyecto o iniciar la app, si existe un borrador `recovery` más reciente, se ofrece restaurarlo o descartarlo.

### 7.3 Formato nativo e importación/exportación (Datos comprobados)

- **Archivo nativo (`src/core/project/projectFileFormat.ts`)**: `NativeProjectFileEnvelope` con `format: 'forma3d-project'`, `formatVersion: 1`, `exportedAt`, `folderName`, `thumbnailDataUrl`, `project: ProjectData` (extensión `.forma3d.json`).
- **Importación**: `.forma3d.json`/`.json`, `.obj` (`objImport.ts`), `.stl` (`stlImport.ts`), `.glb`/`.gltf` (`glbImport.ts`), imágenes de referencia `.jpg`/`.png` (`imageReference.ts`).
- **Exportación**: `.forma3d.json`, `.obj` (`objExport.ts`), `.stl` (`stlExport.ts`), `.glb` (`glbExport.ts`), video `.mp4` (`timelapseMp4Exporter.ts`).

### 7.4 Limitaciones actuales verificadas (Datos comprobados)

1. **Identidad legacy `forma3d-*`:** Nombre de BD (`forma3d_projects_db_v1`), claves `localStorage` (`forma3d_*`), sobre de archivo (`format: 'forma3d-project'`, `.forma3d.json`).
2. **Binarios embebidos como Base64 en JSON:** `MaterialAsset.textureDataUrl`, `ReferenceImageData.imageDataUrl` y `thumbnailDataUrl` viven embebidos dentro de `ProjectData`, inflando el documento JSON y penalizando guardado/clonado.
3. **Guardado monolítico:** Cada `saveProject` y `saveRecoveryDraft` serializa y escribe todo el proyecto completo aunque cambie un único objeto.
4. **Sin bloques de datos para futuras apps:** No existen campos reservados para múltiples canales UV, máscaras/*face sets* de escultura, niveles multiresolución o grafos de materiales.
5. **Pérdida en exportación (`src/core/io/meshUtils.ts`):** `buildThreeMeshForExport` exporta un único material plano por objeto ignorando `face.materialId` y `textureDataUrl`.

### 7.5 Propuesta de evolución del formato de proyecto para LOOPA CORE *(Recomendación — no implementada)*

1. **Contenedor modular `format: 'loopa-project'`, `formatVersion: 2` (extensión `.loopa`):**
   - **Manifiesto ligero (`project.json`)**: metadatos, `materials[]` (referenciando texturas por `assetId`), `scenes[]`, `collections[]`, transformaciones y referencias a `meshId`.
   - **Assets separados en IndexedDB (y empaquetables como ZIP/bundle en archivo `.loopa`)**:
     - `meshes/<meshId>`: geometría separada por objeto/instancia (carga perezosa y escritura incremental).
     - `textures/<assetId>`: binarios `Blob` nativos (PNG/JPEG/WebP) para texturas albedo, normal, roughness, metallic, AO, emissive e imágenes de referencia, evitando Base64 en el JSON principal.
2. **Bloques `extensions` por aplicación en objetos/mallas/materiales:**
   - `extensions.modeler`: pila de modificadores y parámetros de operadores.
   - `extensions.sculpt`: máscaras por vértice, *face sets*, datos multiresolución.
   - `extensions.uvs`: canales UV adicionales (`uv1`, `uv2`...), pines UV e islas bloqueadas.
   - `extensions.materials`: grafo nodal / presets PBR avanzados.
   - **Regla de oro de interoperabilidad:** cualquier app LOOPA que guarde un proyecto debe preservar intactos los bloques `extensions` de las demás apps aunque no los interprete.
3. **Migración automática retrocompatible:** Leer de forma transparente `forma3d_projects_db_v1` y archivos `.forma3d.json`, convirtiendo v1 Y-up → Z-up y extrayendo `data:image/...` Base64 a `Blob` assets sin pérdida de datos.

---

## 8. Clasificación de componentes para LOOPA CORE

### GRUPO A – CORE (Núcleo compartido del ecosistema)

- **Esquema base e integridad de datos:** `src/core/project/types.ts` (tipos de proyecto, escena, colección, objeto base, material, luz, imagen) y `src/core/project/hierarchy.ts`.
- **Geometría compartida:** `src/core/mesh/EditableMesh.ts` (extensible a canales UV múltiples y atributos por vértice como máscaras/colores).
- **Motor de estado, comandos e historial (a extraer de `src/state/useModelerStore.ts`):** Gestión de proyecto, escenas, colecciones, objetos, materiales, selección universal, Undo/Redo incremental y `EventBus`.
- **Persistencia y formato:** `src/core/project/storage.ts`, `src/core/project/projectFileFormat.ts`, `src/core/project/thumbnail.ts`, `src/core/io/imageReference.ts`.
- **Intercambio 3D (IO):** `src/core/io/meshUtils.ts` *(corrigiendo soporte multi-material y texturas)*, `objImport.ts`, `objExport.ts`, `stlImport.ts`, `stlExport.ts`, `glbImport.ts`, `glbExport.ts`.
- **Motor base de renderizado y visor único (a unificar):** Extracción común de `ViewportEngine.ts`, `UVSync3DViewport.tsx`, `timelapseRenderer.ts` y `modelThumbnail.ts` (gestor WebGL, cámara Z-up Persp/Orto, iluminación estudio + luces, `MaterialCache`, picking base y modos de sombreado).
- **Entrada táctil y utilidades transversales UI:** `src/engine/TouchGestureManager.ts`, `src/engine/boxSelectMath.ts`, `src/components/AxisGizmoWidget.tsx`, `src/components/ViewportDisplaySelector.tsx`, `src/components/NumericFieldInput.tsx`, base extensible de `FloatingRadialMenu` / `radialActions.ts`.
- **Shell de proyecto y Timelapse:** `ProjectGallery.tsx`, `GalleryModals.tsx`, `NewProjectModal.tsx`, `ProjectModal.tsx`, `TopBar.tsx` base, `LinerPanel.tsx` base (Outliner + Inspector Transform/Luz/Referencia), `SettingsModal.tsx` (Visor + Controles táctiles) y `src/core/timelapse/*` + `TimelapseModal.tsx`.

### GRUPO B – MODELER (Exclusivos de modelado poligonal)

- Primitivas: `src/core/mesh/primitives.ts`, `PrimitiveMenu.tsx`, `CtrlShiftPrimitivesMenu.tsx`.
- Operadores poligonales y topológicos: `operations.ts`, `advancedOperations.ts`, `topologyTools.ts`, `connectVertexPath.ts`, `loopCut.ts`, `loopSelect.ts`, `shortestPathSelect.ts`, `slideTools.ts`, `proportionalEditing.ts` *(opcionalmente promovible a utilidad geométrica CORE)*.
- Modificadores no destructivos: `src/core/modifiers/*` (`evaluateModifiers.ts`, `mirrorModifier.ts`, `subdivisionModifier.ts`, `solidifyModifier.ts`, `bevelModifier.ts`, `types.ts`) y `ModifierStackPanel.tsx`.
- UI específica de edición poligonal: `EditOperatorBar.tsx`, `DeleteMenuPopover.tsx`, `CtrlAltOperationsMenu.tsx`, secciones de edición en `LeftToolSidebar.tsx` y `ViewportContextMenu.tsx`, overlay de n-gons.

### GRUPO C – FUTURAS APLICACIONES (Ya presentes en el repositorio)

- **LOOPA Sculpt:** `src/core/mesh/sculptBrushes.ts`, lógica de trazo/cursor de pincel en `ViewportEngine.ts`, sección escultura de `LeftToolSidebar.tsx`, ámbito `'sculpt'` de `radialActions.ts`.
- **LOOPA UVs:** `src/core/uv/types.ts`, `uvUnwrap.ts`, `uvOperations.ts`, `UVWorkspace.tsx`, `UVEditorCanvas.tsx`, `UVSync3DViewport.tsx` *(a migrar sobre renderer CORE)*, `UVToolToolbar.tsx`.
- **LOOPA Materiales:** `MaterialWorkspace.tsx`, `MaterialPanel.tsx`, lógica de emisión/texturas en `MaterialAsset` y `syncSharedMaterials`.

### GRUPO D – POR REVISAR (Requieren decisión técnica o saneamiento antes de mover)

- **`src/core/mesh/normals.ts` + `Face Orientation`:** Útil en Modeler (topología), Sculpt (orientación de pinceles) y UVs (islas invertidas). *Recomendación: ubicar en utilidades geométricas de CORE.*
- **Contenedores `Viewport3D.tsx` y `LinerPanel.tsx`:** Mezclan responsabilidades de CORE con herramientas de Modeler y Materiales; requieren refactor a arquitectura extensible por slots/módulos.
- **Objetos `camera` y `empty` en `SceneObjectType`:** Decidir si se implementan en CORE o se depuran del esquema.
- **Dependencias muertas (`@google/genai`, `motion`, `express`, `dotenv`) y prefijos `forma3d_*`:** Limpiar dependencias y definir estrategia de migración de storage.
- **Service Worker PWA:** Decidir si el ecosistema CORE requiere funcionamiento offline completo con caché PWA.

---

## 9. Compatibilidad con futuras aplicaciones y arquitectura recomendada para LOOPA CORE

### 9.1 Análisis de preparación actual y brechas por aplicación

| Aplicación | Capacidad existente (Dato comprobado) | Brechas técnicas para producción (Datos comprobados e Hipótesis) |
| :--- | :--- | :--- |
| **LOOPA Modeler** | Modelado poligonal completo, B-Rep con n-gons, modificadores, snapping, slide y edición proporcional. | Alto acoplamiento en `useModelerStore.ts` (6,546 l.) y `ViewportEngine.ts` (6,345 l.). |
| **LOOPA Sculpt** | 10 pinceles funcionales sobre `EditableMesh` (`sculptBrushes.ts`), simetría X/Y/Z, cursor 3D y trazo en vivo. | *(Comprobado)* Sin BVH/octree (recorrido `O(V)`), sin multiresolución/remesh/Dyntopo, Undo por JSON completo, etiquetas `"Escultura (futuro)"`. *(Hipótesis)* Se degradará rápidamente en tablets al superar ~20k–50k vértices sin BVH ni Undo incremental. |
| **LOOPA UVs** | Unwrap automático/proyectado, costuras, editor 2D (`UVEditorCanvas`), pack de islas y visor 3D (`UVSync3DViewport`). | *(Comprobado)* `UVSync3DViewport` duplica un `WebGLRenderer` aparte; `EditableMeshFace.uvs` solo soporta 1 canal UV; faltan pines UV persistentes en `ProjectData`. |
| **LOOPA Materiales** | `MaterialAsset` con color, metalness, roughness, opacity, emissive y `textureDataUrl`; multi-material por cara en visor. | *(Comprobado)* `MaterialPanel` oculta `emissive` y carga de texturas; faltan mapas PBR (`normal`, `roughness`, `metallic`, `ao`); texturas en Base64 dentro del JSON; exportadores/timelapse ignoran multi-material y texturas. |

### 9.2 Arquitectura recomendada para LOOPA CORE (sincronización en tiempo real sin exportar/importar)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        LOOPA SHELL / LAUNCHER CENTRAL                      │
│  Galería de Proyectos · Selector de App Activa · TopBar Global · Ajustes   │
└───────────────┬────────────────────────────────────────┬───────────────────┘
                │                                        │
┌───────────────▼────────────────────────────────────────▼───────────────────┐
│                                 LOOPA CORE                                 │
│  1. CoreProjectStore (Escenas, Objetos, Meshes, Materiales, Selección,     │
│     EventBus tipado, cero dependencia de React)                            │
│  2. CoreCommandHistory (Undo/Redo por deltas/comandos por objeto/material) │
│  3. CoreAssetStorage (IndexedDB: Manifiesto + Meshes + Blobs binarios)     │
│  4. CoreViewportService (WebGLRenderer único Z-up, Cámaras, Iluminación,   │
│     MaterialCache PBR, BVH/Picking, Gizmos y Overlays por plugin)          │
│  5. CoreIO & CoreTimelapse (OBJ/STL/GLB multi-material, .loopa, MP4)       │
└───▲───────────────────▲───────────────────────▲────────────────────▲───────┘
    │                   │                       │                    │
┌───┴────────┐    ┌─────┴───────┐        ┌──────┴─────┐       ┌──────┴───────┐
│   MODELER  │    │    SCULPT   │        │    UVs     │       │  MATERIALES  │
│ Modifiers  │    │ BVH/Brushes │        │ Canvas 2D  │       │ PBR + Mapas  │
│ Topo Ops   │    │ Multires/   │        │ Unwrap/Pack│       │ Preview/Nodos│
│ Edit Tools │    │ Masks/Sets  │        │ Seams/Pins │       │ Texture Store│
└────────────┘    └─────────────┘        └────────────┘       └──────────────┘
```

**Mecanismo de operación recomendada en tiempo real:**
1. **Un solo proyecto vivo en RAM (`CoreProjectStore`):** Al cambiar entre Modeler, Sculpt, UVs y Materiales desde el launcher/TopBar, solo cambia el módulo de herramientas y paneles acoplados; todos operan por referencia controlada sobre el mismo `EditableMesh`, `MaterialAsset` y `SceneData` sin serializar ni exportar archivos intermedios.
2. **Contexto WebGL único persistente (`CoreViewportService`):** Evita recrear contextos WebGL y compilaciones de shaders al alternar entre Modeler, UVs (panel 3D) y Materiales (crítico en iPadOS/Safari por límites de contextos WebGL).
3. **Pipeline reactivo por capas:** Edición de topología/esculpido actualiza geometría base (`baseMesh`) → edición UV actualiza canales UV/costuras → modificadores evalúan la malla renderizable final → `MaterialCache` actualiza uniformes y texturas GPU al instante.

---

## 10. Problemas técnicos y riesgos identificados

### 10.1 Datos comprobados en el código actual
1. **Concentración monolítica en `useModelerStore.ts` (6,546 l.) y `ViewportEngine.ts` (6,345 l.):** Alta densidad de responsabilidades mezcladas y elevado riesgo de regresiones transversales.
2. **4 implementaciones paralelas de WebGL (`ViewportEngine.ts`, `UVSync3DViewport.tsx`, `timelapseRenderer.ts`, `modelThumbnail.ts`):** Código duplicado de renderizado, luces, `RoomEnvironment` y cámaras Z-up con divergencias funcionales.
3. **Undo/Redo por clonado JSON completo (`makeSnapshot` en `useModelerStore.ts`):** Copia hasta 50 veces todas las escenas y mallas completas del proyecto.
4. **Inconsistencia en tubería multi-material y texturas:** Soportado en `ViewportEngine`, ausente en `meshUtils.ts` (`buildThreeMeshForExport` para OBJ/GLB), `timelapseRenderer.ts`, `modelThumbnail.ts` y sin controles de `emissive`/texturas en `MaterialPanel.tsx`.
5. **Dependencias muertas en `package.json`:** `@google/genai`, `motion`, `express`, `@types/express`, `dotenv` sin ninguna importación.
6. **Elementos huérfanos o desincronizados:** `camera`/`empty` en `SceneObjectType` sin implementación; etiquetas `"Escultura (futuro)"` en `SettingsModal.tsx` y `RadialSlotEditorModal.tsx` pese a que el modo Escultura ya funciona.
7. **PWA incompleta:** Manifiesto e iconos presentes sin registro de Service Worker.
8. **Escultura `O(V)` lineal (`sculptBrushes.ts`):** Sin estructura de aceleración espacial.
9. **Persistencia con identidad `forma3d-*` y binarios Base64 en JSON.**

### 10.2 Riesgos de migración e hipótesis técnicas
- **Riesgo comprobado de pérdida de proyectos locales si se renombra IndexedDB sin migrador:** `forma3d_projects_db_v1` y claves `forma3d_*` contienen los datos actuales de los usuarios.
- **Hipótesis de pérdida de contexto WebGL en dispositivos Apple/iPadOS:** Mantener renderers duplicados en `UVSync3DViewport` o `TimelapseModal` junto al viewport principal incrementa el riesgo de agotamiento de memoria WebGL en Safari móvil.
- **Hipótesis de conflicto topológico Modeler ↔ Sculpt/UVs:** Operaciones destructivas en Modeler (`bevel`, `loopCut`, `subdivide`, `dissolve`) alteran IDs de vértices y caras; sin reglas explícitas en CORE, podrían invalidar máscaras de escultura o islas UV parciales.

---

## 11. Plan de migración recomendado hacia LOOPA CORE

| Fase | Objetivo | Acciones técnicas recomendadas | Criterio de validación |
| :--- | :--- | :--- | :--- |
| **Fase 1: Higiene y línea base** | Limpiar deuda obvia sin alterar lógica de negocio. | Retirar dependencias sin uso (`motion`, `@google/genai`, `express`, `dotenv`); actualizar etiquetas `"Escultura (futuro)"`; definir futuro de `camera`/`empty`; fijar batería de pruebas base de proyectos existentes. | `npm run lint` (`tsc --noEmit`), `npm run build` y verificación manual de todas las herramientas de Modeler. |
| **Fase 2: Esquema CORE v2 y migrador retrocompatible** | Establecer contrato común de datos y almacenamiento binario. | Separar `src/core/project/types.ts` en tipos CORE + `extensions` por app; implementar almacenamiento separado de `meshes` y `Blob` de texturas en IndexedDB manteniendo **lectura/migración automática desde `forma3d_projects_db_v1` y `.forma3d.json`**. | Apertura y migración sin pérdida de proyectos legacy con materiales, UVs, referencias y timelapses. |
| **Fase 3: Unificación del motor 3D (`CoreViewportService`)** | Eliminar los 4 renderers WebGL duplicados y resolver paridad PBR. | Extraer renderer, cámaras Z-up, iluminación de estudio, `MaterialCache` multi-material con texturas/emisión y `EditableMesh → BufferGeometry` a un servicio compartido usado por `ViewportEngine`, `UVSync3DViewport`, `timelapseRenderer`, `modelThumbnail` y `meshUtils`. | Exportación GLB/OBJ con multi-material y texturas verificada; render idéntico en viewport, thumbnail y timelapse. |
| **Fase 4: Desacoplamiento del Store e Historial Incremental** | Romper `useModelerStore.ts` (6,546 l.). | Extraer `CoreProjectStore` (TypeScript puro con selectores/suscripciones) + `CoreCommandHistory` por deltas/entidad + `EventBus`, manteniendo temporalmente un hook puente para los componentes React de Modeler. | Paridad completa de Undo/Redo y operadores paramétricos con reducción medible de RAM/latencia. |
| **Fase 5: Pluginización de `ViewportEngine.ts`** | Separar núcleo de visor de herramientas de dominio. | Dividir `ViewportEngine.ts` (6,345 l.) en visor CORE + plugins de interacción (`ModelerInteractionPlugin`, `SculptInteractionPlugin` con BVH). | Misma fluidez táctil en `TouchGestureManager`, gizmos, `G`/`R`/`S`/Slide y selección de jaula base. |
| **Fase 6: Shell / Launcher del ecosistema LOOPA** | Unificar navegación multi-app sobre estado vivo único. | Convertir `App.tsx`, `TopBar` y `LinerPanel` en el Shell extensible de LOOPA CORE registrando **Modeler**, **Sculpt**, **UVs** y **Materiales** sobre el mismo `CoreProjectStore` y `CoreViewportService`. | Cambio instantáneo entre aplicaciones sin exportar/importar ni perder selección ni historial. |
| **Fase 7: Maduración de apps especializadas** | Completar capacidades clave de las nuevas apps sobre CORE. | **Sculpt**: BVH, máscaras, *face sets*, multires/remesh; **UVs**: múltiples canales UV y pines persistentes; **Materiales**: UI completa para texturas PBR, emisión y mapas normal/roughness/metallic/AO. | Pruebas de rendimiento en mallas >50k vértices y flujo completo Modeler → UVs → Materiales → Export GLB. |

---

## 12. Lista de archivos y componentes críticos

### A. Cuellos de botella prioritarios a refactorizar
1. `src/state/useModelerStore.ts` (6,546 l.) — Estado global, historial por snapshot completo, acciones, autoguardado y timelapse.
2. `src/engine/ViewportEngine.ts` (6,345 l.) — Renderizado, picking, 3 `TransformControls`, modal transform, box select, overlays y escultura en vivo.
3. `src/App.tsx` (2,347 l.) — Orquestador de workspaces, atajos globales y *prop-drilling*.
4. `src/components/LinerPanel.tsx` (2,109 l.) — Outliner + Inspectores + Modifiers + Materials acoplados.
5. `src/core/project/storage.ts` (1,781 l.) — Persistencia IndexedDB/localStorage bajo esquema legacy `forma3d_*`.

### B. Piezas clave reutilizables en LOOPA CORE
- `src/core/mesh/EditableMesh.ts` (854 l.)
- `src/core/project/types.ts` (397 l.), `src/core/project/hierarchy.ts` (1,353 l.), `src/core/project/projectFileFormat.ts` (142 l.)
- `src/engine/TouchGestureManager.ts` (1,347 l.), `src/engine/boxSelectMath.ts` (127 l.)
- `src/core/io/meshUtils.ts` (278 l.), `glbImport.ts`, `glbExport.ts`, `objImport.ts`, `objExport.ts`, `stlImport.ts`, `stlExport.ts`, `imageReference.ts`, `modelThumbnail.ts`
- `src/core/timelapse/timelapseRecorder.ts`, `timelapseStorage.ts`, `timelapseRenderer.ts`, `timelapseMp4Exporter.ts`, `types.ts`
- `src/core/radial/radialActions.ts` (1,809 l.)
- `src/components/ProjectGallery.tsx`, `TopBar.tsx`, `SettingsModal.tsx`, `AxisGizmoWidget.tsx`, `ViewportDisplaySelector.tsx`

### C. Piezas clave por aplicación especializada
- **Modeler:** `src/core/mesh/primitives.ts`, `operations.ts`, `advancedOperations.ts` (3,435 l.), `topologyTools.ts` (1,747 l.), `connectVertexPath.ts`, `slideTools.ts`, `loopCut.ts`, `loopSelect.ts`, `shortestPathSelect.ts`, `proportionalEditing.ts`, `normals.ts`, `src/core/modifiers/*`, `EditOperatorBar.tsx`, `ModifierStackPanel.tsx`, `DeleteMenuPopover.tsx`, `CtrlShiftPrimitivesMenu.tsx`, `CtrlAltOperationsMenu.tsx`.
- **Sculpt:** `src/core/mesh/sculptBrushes.ts` (580 l.).
- **UVs:** `src/core/uv/types.ts`, `uvUnwrap.ts`, `uvOperations.ts`, `UVWorkspace.tsx`, `UVEditorCanvas.tsx`, `UVSync3DViewport.tsx`, `UVToolToolbar.tsx`.
- **Materiales:** `src/components/MaterialWorkspace.tsx`, `src/components/MaterialPanel.tsx`.
