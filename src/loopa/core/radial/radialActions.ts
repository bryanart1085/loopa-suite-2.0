export type RadialWorkMode = 'object' | 'edit' | 'sculpt';

export type RadialMenuKind = 'barhome' | 'tools';

export type RadialLayoutScope =
  | 'barhome'
  | 'object'
  | 'edit'
  | 'sculpt'
  | 'uv_editing'
  | 'materials';

export type RadialActionCategoryId =
  | 'barhome_file'
  | 'barhome_viewport'
  | 'navigation'
  | 'selection'
  | 'transform'
  | 'creation'
  | 'modification'
  | 'deletion'
  | 'uv_tools'
  | 'materials_tools'
  | 'history'
  | 'general';

export interface RadialCategoryMeta {
  id: RadialActionCategoryId;
  label: string;
  menuKinds: RadialMenuKind[];
}

export const RADIAL_ACTION_CATEGORIES: RadialCategoryMeta[] = [
  {
    id: 'barhome_file',
    label: 'BARHOME · Archivo e I/O',
    menuKinds: ['barhome'],
  },
  {
    id: 'barhome_viewport',
    label: 'BARHOME · Vistas y visualización',
    menuKinds: ['barhome'],
  },
  {
    id: 'selection',
    label: '1. Selección',
    menuKinds: ['tools'],
  },
  {
    id: 'transform',
    label: '2. Transformación',
    menuKinds: ['tools'],
  },
  {
    id: 'creation',
    label: '3. Creación de geometría',
    menuKinds: ['tools'],
  },
  {
    id: 'modification',
    label: '4. Modelado y edición',
    menuKinds: ['tools'],
  },
  {
    id: 'deletion',
    label: '5. Eliminación',
    menuKinds: ['tools'],
  },
  {
    id: 'uv_tools',
    label: '6. Herramientas UV',
    menuKinds: ['tools'],
  },
  {
    id: 'materials_tools',
    label: '7. Materiales y sombreado',
    menuKinds: ['tools'],
  },
  {
    id: 'navigation',
    label: '8. Navegación 3D',
    menuKinds: ['barhome', 'tools'],
  },
  {
    id: 'history',
    label: '9. Historial',
    menuKinds: ['tools'],
  },
  {
    id: 'general',
    label: '10. Generales y visualización',
    menuKinds: ['barhome', 'tools'],
  },
];

export type RadialActionId =
  // BARHOME · Archivo e I/O
  | 'barhome_new_project'
  | 'barhome_open_project'
  | 'barhome_save_as'
  | 'barhome_open_import_menu'
  | 'barhome_import_project'
  | 'barhome_import_obj'
  | 'barhome_import_stl'
  | 'barhome_import_jpg'
  | 'barhome_import_png'
  | 'barhome_open_export_menu'
  | 'barhome_export_project'
  | 'barhome_export_selected'
  | 'barhome_export_scene'
  | 'barhome_export_obj'
  | 'barhome_export_stl'
  | 'barhome_return_gallery'
  // BARHOME · Viewport y visualización
  | 'barhome_open_views_menu'
  | 'barhome_open_display_menu'
  | 'view_back'
  | 'view_left'
  | 'view_bottom'
  | 'display_solid'
  | 'display_wireframe'
  | 'display_material'
  | 'barhome_toggle_axes'
  | 'barhome_toggle_liner'
  | 'barhome_toggle_barhome'
  // Navegación
  | 'focus_camera'
  | 'view_iso'
  | 'view_front'
  | 'view_top'
  | 'view_right'
  | 'toggle_projection'
  // Selección
  | 'select_all'
  | 'deselect_all'
  | 'select_connected'
  | 'mode_vertex'
  | 'mode_edge'
  | 'mode_face'
  | 'select_edge_loop'
  | 'toggle_multi_select'
  | 'toggle_shift_modifier'
  // Transformación
  | 'tool_select'
  | 'tool_move'
  | 'tool_rotate'
  | 'tool_scale'
  | 'tool_g_move'
  | 'axis_free'
  | 'axis_x'
  | 'axis_y'
  | 'axis_z'
  | 'toggle_proportional'
  | 'toggle_proportional_connected'
  | 'cycle_proportional_falloff'
  // Creación de geometría
  | 'open_add_menu'
  | 'add_plane'
  | 'add_cube'
  | 'add_circle'
  | 'add_uv_sphere'
  | 'add_cylinder'
  | 'add_cone'
  | 'add_torus'
  | 'add_pyramid'
  | 'add_suzanne'
  | 'fill_mesh'
  // Modificación de geometría y objeto
  | 'op_extrude'
  | 'op_inset'
  | 'op_subdivide'
  | 'op_bevel'
  | 'op_loop_cut'
  | 'op_merge'
  | 'op_merge_by_distance'
  | 'op_bridge_loops'
  | 'connect_vertex_path'
  | 'op_recalculate_normals'
  | 'op_flip_normals'
  | 'duplicate_object'
  | 'apply_object_transform'
  | 'center_object_origin'
  | 'separate_geometry'
  | 'uv_mark_seam'
  | 'uv_clear_seam'
  | 'uv_select_seams'
  | 'uv_deselect_seams'
  // Eliminación
  | 'delete_contextual'
  | 'dissolve_quick'
  | 'op_dissolve_limited'
  | 'delete_edges_verts'
  | 'delete_faces_edges'
  // Herramientas UV (Espacio UV)
  | 'uv_mode_vertex'
  | 'uv_mode_edge'
  | 'uv_mode_face'
  | 'uv_mode_island'
  | 'uv_tool_move'
  | 'uv_tool_rotate'
  | 'uv_tool_scale'
  | 'uv_box_select'
  | 'uv_unwrap'
  | 'uv_planar'
  | 'uv_cylindrical'
  | 'uv_spherical'
  | 'uv_pack'
  | 'uv_toggle_checker'
  | 'uv_select_all'
  | 'uv_deselect_all'
  | 'uv_invert_selection'
  | 'uv_sync_from_3d'
  | 'uv_sync_to_3d'
  // Herramientas de materiales
  | 'mat_shading_flat'
  | 'mat_shading_smooth'
  // Historial
  | 'undo'
  | 'redo'
  // Herramientas generales
  | 'work_object'
  | 'work_edit'
  | 'toggle_xray'
  | 'toggle_face_orientation'
  | 'toggle_grid'
  | 'save_project'
  | 'open_settings';

export type RadialIconKey =
  | 'file_plus'
  | 'folder_open'
  | 'save_as'
  | 'import'
  | 'export'
  | 'image'
  | 'file_box'
  | 'gallery'
  | 'views_menu'
  | 'display_menu'
  | 'solid'
  | 'wireframe'
  | 'material'
  | 'axes'
  | 'liner'
  | 'barhome'
  | 'g_move'
  | 'select_connected'
  | 'apply_transform'
  | 'center_origin'
  | 'separate'
  | 'uv_island'
  | 'uv_box_select'
  | 'uv_unwrap'
  | 'uv_pack'
  | 'uv_checker'
  | 'uv_invert'
  | 'uv_sync'
  | 'shading_flat'
  | 'shading_smooth'
  | 'focus'
  | 'compass'
  | 'view_front'
  | 'view_top'
  | 'view_right'
  | 'camera'
  | 'check_square'
  | 'deselect'
  | 'vertex'
  | 'edge'
  | 'face'
  | 'edge_loop'
  | 'edge_ring'
  | 'multi_select'
  | 'shift'
  | 'pointer'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'axis_free'
  | 'axis_x'
  | 'axis_y'
  | 'axis_z'
  | 'proportional'
  | 'proportional_connected'
  | 'plus'
  | 'plane'
  | 'cube'
  | 'circle'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'pyramid'
  | 'suzanne'
  | 'fill'
  | 'extrude'
  | 'inset'
  | 'subdivide'
  | 'bevel'
  | 'loop_cut'
  | 'merge'
  | 'merge_dist'
  | 'bridge'
  | 'connect_path'
  | 'recalculate_normals'
  | 'flip_normals'
  | 'duplicate'
  | 'trash'
  | 'dissolve'
  | 'undo'
  | 'redo'
  | 'work_object'
  | 'work_edit'
  | 'xray'
  | 'face_orientation'
  | 'grid'
  | 'save'
  | 'settings';

export interface RadialActionDefinition {
  id: RadialActionId;
  label: string;
  shortLabel: string;
  description: string;
  category: RadialActionCategoryId;
  icon: RadialIconKey;
  danger?: boolean;
  menuKinds: RadialMenuKind[];
  /** Contexts where this action has direct functional effect */
  supportedScopes: RadialLayoutScope[];
}

const ALL_TOOL_SCOPES: RadialLayoutScope[] = [
  'object',
  'edit',
  'sculpt',
  'uv_editing',
  'materials',
];

export const RADIAL_ACTION_LIBRARY: RadialActionDefinition[] = [
  // =========================================================================
  // BARHOME · Archivo e I/O
  // =========================================================================
  {
    id: 'barhome_new_project',
    label: 'Nuevo proyecto',
    shortLabel: 'Nuevo',
    description: 'Abre el asistente de nuevo proyecto desde BARHOME',
    category: 'barhome_file',
    icon: 'file_plus',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_open_project',
    label: 'Abrir proyecto',
    shortLabel: 'Abrir',
    description: 'Abre la lista de proyectos guardados',
    category: 'barhome_file',
    icon: 'folder_open',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'save_project',
    label: 'Guardar proyecto',
    shortLabel: 'Guardar',
    description: 'Guarda el estado actual del proyecto localmente',
    category: 'barhome_file',
    icon: 'save',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', ...ALL_TOOL_SCOPES],
  },
  {
    id: 'barhome_save_as',
    label: 'Guardar como',
    shortLabel: 'Guardar c.',
    description: 'Guarda una nueva copia del proyecto con otro nombre',
    category: 'barhome_file',
    icon: 'save_as',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_open_import_menu',
    label: 'Importar (selector)',
    shortLabel: 'Importar',
    description: 'Despliega las opciones reales de importación (Proyecto, OBJ, STL, JPG, PNG)',
    category: 'barhome_file',
    icon: 'import',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_import_project',
    label: 'Importar proyecto (.forma3d)',
    shortLabel: 'Imp. Proy.',
    description: 'Importa un archivo de proyecto nativo .forma3d o .json',
    category: 'barhome_file',
    icon: 'import',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_import_obj',
    label: 'Importar OBJ',
    shortLabel: 'Imp. OBJ',
    description: 'Importa un modelo 3D .obj a la escena actual',
    category: 'barhome_file',
    icon: 'file_box',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_import_stl',
    label: 'Importar STL',
    shortLabel: 'Imp. STL',
    description: 'Importa un modelo 3D .stl a la escena actual',
    category: 'barhome_file',
    icon: 'file_box',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_import_jpg',
    label: 'Importar imagen JPG',
    shortLabel: 'Imp. JPG',
    description: 'Importa una imagen de referencia JPG en la escena',
    category: 'barhome_file',
    icon: 'image',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_import_png',
    label: 'Importar imagen PNG',
    shortLabel: 'Imp. PNG',
    description: 'Importa una imagen de referencia PNG con transparencia',
    category: 'barhome_file',
    icon: 'image',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_open_export_menu',
    label: 'Exportar (selector)',
    shortLabel: 'Exportar',
    description: 'Despliega todas las opciones de exportación (Proyecto, Sel., Escena, OBJ, STL)',
    category: 'barhome_file',
    icon: 'export',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_export_project',
    label: 'Exportar proyecto completo',
    shortLabel: 'Exp. Proy.',
    description: 'Descarga el archivo completo del proyecto (.forma3d)',
    category: 'barhome_file',
    icon: 'export',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_export_selected',
    label: 'Exportar objeto seleccionado',
    shortLabel: 'Exp. Sel.',
    description: 'Abre el exportador para el objeto seleccionado',
    category: 'barhome_file',
    icon: 'export',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_export_scene',
    label: 'Exportar escena',
    shortLabel: 'Exp. Esc.',
    description: 'Abre el exportador para toda la escena',
    category: 'barhome_file',
    icon: 'export',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_export_obj',
    label: 'Exportar OBJ',
    shortLabel: 'Exp. OBJ',
    description: 'Exporta la selección o escena en formato OBJ',
    category: 'barhome_file',
    icon: 'export',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_export_stl',
    label: 'Exportar STL',
    shortLabel: 'Exp. STL',
    description: 'Exporta la selección o escena en formato STL',
    category: 'barhome_file',
    icon: 'export',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_return_gallery',
    label: 'Volver a la Galería',
    shortLabel: 'Galería',
    description: 'Regresa a la pantalla principal de proyectos de LOOPA',
    category: 'barhome_file',
    icon: 'gallery',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },

  // =========================================================================
  // BARHOME · Vistas y visualización
  // =========================================================================
  {
    id: 'barhome_open_views_menu',
    label: 'Vistas del viewport',
    shortLabel: 'Vistas 3D',
    description: 'Abre selector de vistas (Frontal, Posterior, Laterales, Sup., Inf., Iso, Proyección)',
    category: 'barhome_viewport',
    icon: 'views_menu',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_open_display_menu',
    label: 'Configuración de visualización',
    shortLabel: 'Visualiz.',
    description: 'Sombreado (Sólido, Wireframe, Material, Rayos X), Cuadrícula, Ejes y Orientación',
    category: 'barhome_viewport',
    icon: 'display_menu',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'view_back',
    label: 'Vista Posterior',
    shortLabel: 'Posterior',
    description: 'Alinea la cámara al eje posterior (+Y)',
    category: 'barhome_viewport',
    icon: 'view_front',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'view_left',
    label: 'Vista Lateral Izquierda',
    shortLabel: 'Izquierda',
    description: 'Alinea la cámara al lateral izquierdo (-X)',
    category: 'barhome_viewport',
    icon: 'view_right',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'view_bottom',
    label: 'Vista Inferior',
    shortLabel: 'Inferior',
    description: 'Alinea la cámara desde abajo (-Z)',
    category: 'barhome_viewport',
    icon: 'view_top',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'display_solid',
    label: 'Vista Sólida',
    shortLabel: 'Sólido',
    description: 'Cambia el sombreado del viewport a modo Sólido',
    category: 'barhome_viewport',
    icon: 'solid',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'display_wireframe',
    label: 'Vista Wireframe',
    shortLabel: 'Wireframe',
    description: 'Muestra la malla en modo estructura de alambre',
    category: 'barhome_viewport',
    icon: 'wireframe',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'display_material',
    label: 'Vista Material',
    shortLabel: 'Material',
    description: 'Previsualiza los materiales PBR en el viewport 3D',
    category: 'barhome_viewport',
    icon: 'material',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', 'materials', 'object', 'edit'],
  },
  {
    id: 'barhome_toggle_axes',
    label: 'Mostrar / Ocultar Ejes X/Y/Z',
    shortLabel: 'Ejes XYZ',
    description: 'Alterna la visibilidad de los ejes principales del mundo',
    category: 'barhome_viewport',
    icon: 'axes',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_toggle_liner',
    label: 'Mostrar / Ocultar LINER',
    shortLabel: 'LINER',
    description: 'Abre o cierra el panel lateral derecho LINER',
    category: 'barhome_viewport',
    icon: 'liner',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },
  {
    id: 'barhome_toggle_barhome',
    label: 'Mostrar / Ocultar BARHOME',
    shortLabel: 'BARHOME',
    description: 'Contrae o despliega la barra superior BARHOME',
    category: 'barhome_viewport',
    icon: 'barhome',
    menuKinds: ['barhome'],
    supportedScopes: ['barhome'],
  },

  // =========================================================================
  // =========================================================================
  // Navegación 3D (compartido BARHOME y Herramientas)
  // =========================================================================
  {
    id: 'focus_camera',
    label: 'Centrar en selección',
    shortLabel: 'Centrar',
    description: 'Encuadra el objeto seleccionado en la vista 3D',
    category: 'navigation',
    icon: 'focus',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', ...ALL_TOOL_SCOPES],
  },
  {
    id: 'view_iso',
    label: 'Vista 3D isométrica',
    shortLabel: 'Vista 3D',
    description: 'Restablece la cámara en perspectiva isométrica',
    category: 'navigation',
    icon: 'compass',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', ...ALL_TOOL_SCOPES],
  },
  {
    id: 'view_front',
    label: 'Vista Frontal',
    shortLabel: 'Frontal',
    description: 'Alinea la cámara al eje frontal (-Y)',
    category: 'navigation',
    icon: 'view_front',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', 'object', 'edit', 'sculpt', 'materials'],
  },
  {
    id: 'view_top',
    label: 'Vista Superior',
    shortLabel: 'Superior',
    description: 'Alinea la cámara desde arriba (+Z)',
    category: 'navigation',
    icon: 'view_top',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', 'object', 'edit', 'sculpt', 'materials'],
  },
  {
    id: 'view_right',
    label: 'Vista Derecha',
    shortLabel: 'Derecha',
    description: 'Alinea la cámara al lateral derecho (+X)',
    category: 'navigation',
    icon: 'view_right',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', 'object', 'edit', 'sculpt', 'materials'],
  },
  {
    id: 'toggle_projection',
    label: 'Perspectiva / Ortográfica',
    shortLabel: 'Persp/Orto',
    description: 'Alterna entre proyección Perspectiva y Ortográfica',
    category: 'navigation',
    icon: 'camera',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', 'object', 'edit', 'sculpt', 'materials'],
  },

  // =========================================================================
  // 1. Selección (HERRAMIENTAS)
  // =========================================================================
  {
    id: 'select_all',
    label: 'Seleccionar todo',
    shortLabel: 'Sel. todo',
    description: 'Selecciona todos los componentes en Edición o todos los objetos en Escena',
    category: 'selection',
    icon: 'check_square',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'deselect_all',
    label: 'Limpiar selección',
    shortLabel: 'Deselec.',
    description: 'Limpia la selección actual de componentes o de objeto',
    category: 'selection',
    icon: 'deselect',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'select_connected',
    label: 'Seleccionar conectados',
    shortLabel: 'Conectados',
    description: 'Selecciona la isla topológica conectada en Modo Edición',
    category: 'selection',
    icon: 'select_connected',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'mode_vertex',
    label: 'Modo Vértices',
    shortLabel: 'Vértices',
    description: 'Cambia el submodo de Edición a Vértices',
    category: 'selection',
    icon: 'vertex',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'mode_edge',
    label: 'Modo Aristas',
    shortLabel: 'Aristas',
    description: 'Cambia el submodo de Edición a Aristas',
    category: 'selection',
    icon: 'edge',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'mode_face',
    label: 'Modo Caras',
    shortLabel: 'Caras',
    description: 'Cambia el submodo de Edición a Caras',
    category: 'selection',
    icon: 'face',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'select_edge_loop',
    label: 'Seleccionar Bucle (Edge Loop)',
    shortLabel: 'Bucle',
    description: 'Selecciona el bucle continuo de aristas a partir de la arista activa',
    category: 'selection',
    icon: 'edge_loop',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'toggle_multi_select',
    label: 'Selección múltiple táctil',
    shortLabel: 'Múltiple',
    description: 'Activa o desactiva la acumulación automática por toque',
    category: 'selection',
    icon: 'multi_select',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'toggle_shift_modifier',
    label: 'Alternar SHIFT en pantalla',
    shortLabel: 'SHIFT',
    description:
      'Activa o desactiva el modificador SHIFT para agregar o quitar elementos de la selección',
    category: 'selection',
    icon: 'shift',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },

  // =========================================================================
  // 2. Transformación (HERRAMIENTAS)
  // =========================================================================
  {
    id: 'tool_select',
    label: 'Herramienta Seleccionar',
    shortLabel: 'Selec.',
    description: 'Activa selección directa sin manipulador de transformación',
    category: 'transform',
    icon: 'pointer',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'tool_move',
    label: 'Mover',
    shortLabel: 'Mover',
    description: 'Activa el manipulador de traslación (G)',
    category: 'transform',
    icon: 'move',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'tool_rotate',
    label: 'Rotar',
    shortLabel: 'Rotar',
    description: 'Activa el manipulador de rotación (R)',
    category: 'transform',
    icon: 'rotate',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'tool_scale',
    label: 'Escalar',
    shortLabel: 'Escalar',
    description: 'Activa el manipulador de escala (S)',
    category: 'transform',
    icon: 'scale',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'tool_g_move',
    label: 'Mover G / Slide modal',
    shortLabel: 'Mover G',
    description: 'Inicia traslación libre con toque/arrastre modal (G)',
    category: 'transform',
    icon: 'g_move',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'axis_free',
    label: 'Eje Libre',
    shortLabel: 'Eje Libre',
    description: 'Libera la restricción de ejes en el manipulador',
    category: 'transform',
    icon: 'axis_free',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'axis_x',
    label: 'Restringir a Eje X',
    shortLabel: 'Eje X',
    description: 'Restringe transformaciones al eje rojo X',
    category: 'transform',
    icon: 'axis_x',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'axis_y',
    label: 'Restringir a Eje Y',
    shortLabel: 'Eje Y',
    description: 'Restringe transformaciones al eje verde Y',
    category: 'transform',
    icon: 'axis_y',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'axis_z',
    label: 'Restringir a Eje Z',
    shortLabel: 'Eje Z',
    description: 'Restringe transformaciones al eje celeste Z',
    category: 'transform',
    icon: 'axis_z',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'toggle_proportional',
    label: 'Edición Proporcional (O)',
    shortLabel: 'Proporc.',
    description:
      'Activa o desactiva la deformación gradual de vértices cercanos en Modo Edición (O)',
    category: 'transform',
    icon: 'proportional',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'toggle_proportional_connected',
    label: 'Solo Conectados (Alt+O)',
    shortLabel: 'Conect.',
    description:
      'Limita la edición proporcional únicamente a vértices conectados topológicamente',
    category: 'transform',
    icon: 'proportional_connected',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'cycle_proportional_falloff',
    label: 'Cambiar curva proporcional',
    shortLabel: 'Curva Prop',
    description: 'Rota la curva de caída de Edición Proporcional (Shift+O)',
    category: 'transform',
    icon: 'proportional',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },

  // =========================================================================
  // 3. Creación de geometría
  // =========================================================================
  {
    id: 'open_add_menu',
    label: 'Agregar primitiva (selector)',
    shortLabel: 'Agregar',
    description: 'Abre el selector rápido de primitivas 3D',
    category: 'creation',
    icon: 'plus',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_plane',
    label: 'Agregar Plano',
    shortLabel: 'Plano',
    description: 'Inserta un plano cuadrangular editable en la escena',
    category: 'creation',
    icon: 'plane',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_cube',
    label: 'Agregar Cubo',
    shortLabel: 'Cubo',
    description: 'Inserta una nueva malla Cubo en la escena',
    category: 'creation',
    icon: 'cube',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_circle',
    label: 'Agregar Círculo',
    shortLabel: 'Círculo',
    description: 'Inserta un anillo poligonal en la escena',
    category: 'creation',
    icon: 'circle',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_uv_sphere',
    label: 'Agregar Esfera UV',
    shortLabel: 'Esfera',
    description: 'Inserta una esfera UV editable en la escena',
    category: 'creation',
    icon: 'sphere',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_cylinder',
    label: 'Agregar Cilindro',
    shortLabel: 'Cilindro',
    description: 'Inserta un cilindro editable en la escena',
    category: 'creation',
    icon: 'cylinder',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_cone',
    label: 'Agregar Cono',
    shortLabel: 'Cono',
    description: 'Inserta un cono editable en la escena',
    category: 'creation',
    icon: 'cone',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_torus',
    label: 'Agregar Toroide',
    shortLabel: 'Toroide',
    description: 'Inserta un toroide editable en la escena',
    category: 'creation',
    icon: 'torus',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_pyramid',
    label: 'Agregar Pirámide',
    shortLabel: 'Pirámide',
    description: 'Inserta una pirámide editable en la escena',
    category: 'creation',
    icon: 'pyramid',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'add_suzanne',
    label: 'Agregar Suzanne',
    shortLabel: 'Suzanne',
    description: 'Inserta la malla poligonal Suzanne (cabeza de mono)',
    category: 'creation',
    icon: 'suzanne',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'fill_mesh',
    label: 'Crear cara (Make Face)',
    shortLabel: 'Crear cara',
    description:
      'Crea una cara nueva o arista a partir de vértices o aristas seleccionadas (F)',
    category: 'creation',
    icon: 'fill',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },

  // =========================================================================
  // 4. Modificación de geometría y objeto
  // =========================================================================
  {
    id: 'op_extrude',
    label: 'Extruir (Extrude)',
    shortLabel: 'Extruir',
    description: 'Extruye vértices, aristas o caras seleccionadas (E)',
    category: 'modification',
    icon: 'extrude',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_inset',
    label: 'Insertar caras (Inset)',
    shortLabel: 'Inset',
    description: 'Crea un margen interior en las caras seleccionadas (I)',
    category: 'modification',
    icon: 'inset',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_subdivide',
    label: 'Subdividir (Subdivide)',
    shortLabel: 'Subdividir',
    description: 'Divide las caras o aristas seleccionadas con suavizado',
    category: 'modification',
    icon: 'subdivide',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_bevel',
    label: 'Biselar (Bevel)',
    shortLabel: 'Bevel',
    description: 'Bisela aristas, vértices o bordes de caras (B)',
    category: 'modification',
    icon: 'bevel',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_loop_cut',
    label: 'Corte de Bucle (Loop Cut)',
    shortLabel: 'Bucle',
    description: 'Inserta cortes continuos alrededor de un bucle de quads (K)',
    category: 'modification',
    icon: 'loop_cut',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_merge',
    label: 'Fusionar vértices (Merge)',
    shortLabel: 'Fusionar',
    description: 'Colapsa vértices seleccionados al centro o punto medio (M)',
    category: 'modification',
    icon: 'merge',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_merge_by_distance',
    label: 'Fusionar por distancia',
    shortLabel: 'Fus. dist.',
    description: 'Suelda vértices duplicados o cercanos dentro de un umbral',
    category: 'modification',
    icon: 'merge_dist',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_bridge_loops',
    label: 'Bridge Edge Loops',
    shortLabel: 'Bridge',
    description: 'Conecta dos contornos abiertos con segmentos y suavizado ajustables',
    category: 'modification',
    icon: 'bridge',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'connect_vertex_path',
    label: 'Connect Vertex Path (J)',
    shortLabel: 'Conectar (J)',
    description:
      'Crea aristas entre vértices seleccionados y divide las caras atravesadas (J)',
    category: 'modification',
    icon: 'connect_path',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_recalculate_normals',
    label: 'Recalculate Outside',
    shortLabel: 'Recalcular',
    description:
      'Recalcula y orienta las normales de las caras cerradas hacia el exterior',
    category: 'modification',
    icon: 'recalculate_normals',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_flip_normals',
    label: 'Flip Normals',
    shortLabel: 'Invertir N.',
    description:
      'Invierte la orientación de las normales de las caras seleccionadas o de toda la malla',
    category: 'modification',
    icon: 'flip_normals',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'duplicate_object',
    label: 'Duplicar objeto',
    shortLabel: 'Duplicar',
    description: 'Crea una copia del objeto seleccionado',
    category: 'modification',
    icon: 'duplicate',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'apply_object_transform',
    label: 'Aplicar transformaciones',
    shortLabel: 'Aplicar T.',
    description: 'Hornea posición, rotación y escala en la geometría de la malla',
    category: 'modification',
    icon: 'apply_transform',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'center_object_origin',
    label: 'Centrar origen',
    shortLabel: 'Origen',
    description: 'Centra el origen al centro geométrico de la malla',
    category: 'modification',
    icon: 'center_origin',
    menuKinds: ['tools'],
    supportedScopes: ['object'],
  },
  {
    id: 'separate_geometry',
    label: 'Separar selección',
    shortLabel: 'Separar',
    description: 'Extrae la geometría seleccionada como un nuevo objeto',
    category: 'modification',
    icon: 'separate',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'uv_mark_seam',
    label: 'Mark Seam (Costura UV)',
    shortLabel: 'Mark Seam',
    description: 'Marca las aristas seleccionadas como costura para Unwrap UV',
    category: 'modification',
    icon: 'loop_cut',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'uv_clear_seam',
    label: 'Clear Seam',
    shortLabel: 'Clear Seam',
    description: 'Quita las costuras UV de la selección actual',
    category: 'modification',
    icon: 'deselect',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'uv_select_seams',
    label: 'Select Seams',
    shortLabel: 'Sel. Seam',
    description: 'Selecciona todas las aristas marcadas como costura UV',
    category: 'modification',
    icon: 'check_square',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'uv_deselect_seams',
    label: 'Deselect Seams',
    shortLabel: 'Des. Seam',
    description: 'Deselecciona las aristas de costura UV',
    category: 'modification',
    icon: 'dissolve',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },

  // =========================================================================
  // 5. Eliminación
  // =========================================================================
  {
    id: 'delete_contextual',
    label: 'Eliminar selección',
    shortLabel: 'Eliminar',
    description: 'Elimina el objeto activo o los componentes seleccionados',
    category: 'deletion',
    icon: 'trash',
    danger: true,
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'dissolve_quick',
    label: 'Disolver selección',
    shortLabel: 'Disolver',
    description: 'Disuelve los componentes manteniendo la continuidad de la malla',
    category: 'deletion',
    icon: 'dissolve',
    danger: true,
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'op_dissolve_limited',
    label: 'Limited Dissolve',
    shortLabel: 'Lim. Diss.',
    description: 'Simplifica aristas planas y vértices colineales según el ángulo configurado',
    category: 'deletion',
    icon: 'dissolve',
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'delete_edges_verts',
    label: 'Eliminar aristas y vértices',
    shortLabel: 'Aris.+Vért.',
    description: 'Elimina las aristas seleccionadas junto con sus vértices',
    category: 'deletion',
    icon: 'trash',
    danger: true,
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },
  {
    id: 'delete_faces_edges',
    label: 'Eliminar caras y aristas',
    shortLabel: 'Caras+Aris.',
    description: 'Elimina las caras seleccionadas y sus aristas libres',
    category: 'deletion',
    icon: 'trash',
    danger: true,
    menuKinds: ['tools'],
    supportedScopes: ['edit'],
  },

  // =========================================================================
  // 6. Herramientas UV (Editor UV)
  // =========================================================================
  {
    id: 'uv_mode_vertex',
    label: 'UV: Modo Vértices',
    shortLabel: 'UV Vért.',
    description: 'Selecciona vértices 2D en el editor UV',
    category: 'uv_tools',
    icon: 'vertex',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_mode_edge',
    label: 'UV: Modo Aristas',
    shortLabel: 'UV Arista',
    description: 'Selecciona aristas UV en el mapa 2D',
    category: 'uv_tools',
    icon: 'edge',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_mode_face',
    label: 'UV: Modo Caras',
    shortLabel: 'UV Cara',
    description: 'Selecciona caras UV en el mapa 2D',
    category: 'uv_tools',
    icon: 'face',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_mode_island',
    label: 'UV: Modo Islas',
    shortLabel: 'UV Isla',
    description: 'Selecciona islas UV completas en el mapa 2D',
    category: 'uv_tools',
    icon: 'uv_island',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_tool_move',
    label: 'UV: Mover',
    shortLabel: 'Mover UV',
    description: 'Activa la herramienta Mover en el lienzo UV',
    category: 'uv_tools',
    icon: 'move',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_tool_rotate',
    label: 'UV: Rotar',
    shortLabel: 'Rotar UV',
    description: 'Activa la herramienta Rotar en el lienzo UV',
    category: 'uv_tools',
    icon: 'rotate',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_tool_scale',
    label: 'UV: Escalar',
    shortLabel: 'Escalar UV',
    description: 'Activa la herramienta Escalar en el lienzo UV',
    category: 'uv_tools',
    icon: 'scale',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_box_select',
    label: 'UV: Selección por área',
    shortLabel: 'Área UV',
    description: 'Alterna la selección rectangular en el lienzo UV',
    category: 'uv_tools',
    icon: 'uv_box_select',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_unwrap',
    label: 'UV: Unwrap',
    shortLabel: 'Unwrap',
    description: 'Despliega las UVs respetando las costuras marcadas',
    category: 'uv_tools',
    icon: 'uv_unwrap',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_planar',
    label: 'UV: Proyección Plana',
    shortLabel: 'Plana UV',
    description: 'Aplica proyección UV planar sobre el objeto',
    category: 'uv_tools',
    icon: 'plane',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_cylindrical',
    label: 'UV: Proyección Cilíndrica',
    shortLabel: 'Cilínd. UV',
    description: 'Aplica proyección UV cilíndrica',
    category: 'uv_tools',
    icon: 'cylinder',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_spherical',
    label: 'UV: Proyección Esférica',
    shortLabel: 'Esfér. UV',
    description: 'Aplica proyección UV esférica',
    category: 'uv_tools',
    icon: 'sphere',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_pack',
    label: 'UV: Pack Islas',
    shortLabel: 'Pack Islas',
    description: 'Empaqueta y optimiza el espacio de todas las islas UV',
    category: 'uv_tools',
    icon: 'uv_pack',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_toggle_checker',
    label: 'UV: Patrón Checker',
    shortLabel: 'Checker',
    description: 'Muestra u oculta el patrón de cuadrícula para revisar distorsiones',
    category: 'uv_tools',
    icon: 'uv_checker',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_select_all',
    label: 'UV: Seleccionar todo',
    shortLabel: 'Todo UV',
    description: 'Selecciona todos los elementos del lienzo UV',
    category: 'uv_tools',
    icon: 'check_square',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_deselect_all',
    label: 'UV: Limpiar selección',
    shortLabel: 'Limpiar UV',
    description: 'Deselecciona todos los elementos del lienzo UV',
    category: 'uv_tools',
    icon: 'deselect',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_invert_selection',
    label: 'UV: Invertir selección',
    shortLabel: 'Invert. UV',
    description: 'Invierte la selección actual en el mapa UV',
    category: 'uv_tools',
    icon: 'uv_invert',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_sync_from_3d',
    label: 'UV: Traer selección 3D',
    shortLabel: 'Desde 3D',
    description: 'Sincroniza la selección actual del visor 3D al Editor UV',
    category: 'uv_tools',
    icon: 'uv_sync',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },
  {
    id: 'uv_sync_to_3d',
    label: 'UV: Enviar selección a 3D',
    shortLabel: 'Hacia 3D',
    description: 'Sincroniza la selección UV hacia el visor 3D',
    category: 'uv_tools',
    icon: 'uv_sync',
    menuKinds: ['tools'],
    supportedScopes: ['uv_editing'],
  },

  // =========================================================================
  // 7. Materiales y sombreado
  // =========================================================================
  {
    id: 'mat_shading_flat',
    label: 'Sombreado Plano (Flat)',
    shortLabel: 'S. Plano',
    description: 'Aplica sombreado plano al objeto de malla seleccionado',
    category: 'materials_tools',
    icon: 'shading_flat',
    menuKinds: ['tools'],
    supportedScopes: ['materials', 'object'],
  },
  {
    id: 'mat_shading_smooth',
    label: 'Sombreado Suave (Smooth)',
    shortLabel: 'S. Suave',
    description: 'Aplica sombreado suavizado al objeto de malla seleccionado',
    category: 'materials_tools',
    icon: 'shading_smooth',
    menuKinds: ['tools'],
    supportedScopes: ['materials', 'object'],
  },

  // =========================================================================
  // 8. Historial
  // =========================================================================
  {
    id: 'undo',
    label: 'Deshacer (Undo)',
    shortLabel: 'Deshacer',
    description: 'Revierte la última operación realizada',
    category: 'history',
    icon: 'undo',
    menuKinds: ['tools'],
    supportedScopes: ALL_TOOL_SCOPES,
  },
  {
    id: 'redo',
    label: 'Rehacer (Redo)',
    shortLabel: 'Rehacer',
    description: 'Reaplica la última operación revertida',
    category: 'history',
    icon: 'redo',
    menuKinds: ['tools'],
    supportedScopes: ALL_TOOL_SCOPES,
  },

  // =========================================================================
  // 9. Herramientas generales
  // =========================================================================
  {
    id: 'work_object',
    label: 'Cambiar a Modo Objeto',
    shortLabel: 'M. Objeto',
    description: 'Pasa al modo de escena y manipulación de objetos',
    category: 'general',
    icon: 'work_object',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit', 'sculpt'],
  },
  {
    id: 'work_edit',
    label: 'Cambiar a Modo Edición',
    shortLabel: 'M. Edición',
    description: 'Entra a editar vértices, aristas y caras del objeto',
    category: 'general',
    icon: 'work_edit',
    menuKinds: ['tools'],
    supportedScopes: ['object', 'edit'],
  },
  {
    id: 'toggle_xray',
    label: 'Alternar Rayos X',
    shortLabel: 'Rayos X',
    description: 'Activa o desactiva la vista translúcida X-Ray y selección posterior',
    category: 'general',
    icon: 'xray',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', 'object', 'edit', 'materials'],
  },
  {
    id: 'toggle_face_orientation',
    label: 'Face Orientation',
    shortLabel: 'Orientación',
    description:
      'Muestra caras exteriores en azul y caras invertidas en rojo sin alterar materiales',
    category: 'general',
    icon: 'face_orientation',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', 'object', 'edit'],
  },
  {
    id: 'toggle_grid',
    label: 'Mostrar / Ocultar cuadrícula',
    shortLabel: 'Cuadrícula',
    description: 'Alterna la visibilidad de la cuadrícula de referencia',
    category: 'general',
    icon: 'grid',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', ...ALL_TOOL_SCOPES],
  },
  {
    id: 'open_settings',
    label: 'Abrir configuración',
    shortLabel: 'Ajustes',
    description: 'Abre el panel de configuración y controles táctiles',
    category: 'general',
    icon: 'settings',
    menuKinds: ['barhome', 'tools'],
    supportedScopes: ['barhome', ...ALL_TOOL_SCOPES],
  },
];

export const RADIAL_ACTION_MAP: Record<RadialActionId, RadialActionDefinition> =
  RADIAL_ACTION_LIBRARY.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<RadialActionId, RadialActionDefinition>,
  );

export const RADIAL_SLOT_COUNT = 8;

export type RadialSlotList = (RadialActionId | null)[];

export type RadialMenuLayouts = Record<RadialWorkMode, RadialSlotList>;

export interface WorkspaceToolRadialLayouts {
  uv_editing: RadialSlotList;
  materials: RadialSlotList;
}

export const DEFAULT_BARHOME_RADIAL_LAYOUT: RadialSlotList = [
  'save_project',
  'barhome_open_project',
  'barhome_open_import_menu',
  'barhome_open_export_menu',
  'barhome_open_views_menu',
  'barhome_open_display_menu',
  'barhome_return_gallery',
  'barhome_new_project',
];

export const DEFAULT_RADIAL_LAYOUTS: RadialMenuLayouts = {
  object: [
    'open_add_menu',
    'tool_move',
    'tool_rotate',
    'tool_scale',
    'duplicate_object',
    'delete_contextual',
    'focus_camera',
    'work_edit',
  ],
  edit: [
    'op_extrude',
    'op_inset',
    'op_subdivide',
    'op_bevel',
    'op_loop_cut',
    'fill_mesh',
    'op_merge',
    'delete_contextual',
  ],
  sculpt: [
    'undo',
    'redo',
    'focus_camera',
    'view_iso',
    'toggle_projection',
    'toggle_grid',
    'work_object',
    null,
  ],
};

export const DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS: WorkspaceToolRadialLayouts = {
  uv_editing: [
    'uv_unwrap',
    'uv_pack',
    'uv_tool_move',
    'uv_tool_rotate',
    'uv_tool_scale',
    'uv_box_select',
    'uv_toggle_checker',
    'uv_mode_island',
  ],
  materials: [
    'display_material',
    'mat_shading_flat',
    'mat_shading_smooth',
    'focus_camera',
    'view_iso',
    'toggle_grid',
    'undo',
    'redo',
  ],
};

export function getDefaultSlotsForScope(scope: RadialLayoutScope): RadialSlotList {
  switch (scope) {
    case 'barhome':
      return [...DEFAULT_BARHOME_RADIAL_LAYOUT];
    case 'uv_editing':
      return [...DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS.uv_editing];
    case 'materials':
      return [...DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS.materials];
    case 'object':
    case 'edit':
    case 'sculpt':
    default:
      return [...DEFAULT_RADIAL_LAYOUTS[scope]];
  }
}

export function cloneDefaultRadialLayouts(): RadialMenuLayouts {
  return {
    object: [...DEFAULT_RADIAL_LAYOUTS.object],
    edit: [...DEFAULT_RADIAL_LAYOUTS.edit],
    sculpt: [...DEFAULT_RADIAL_LAYOUTS.sculpt],
  };
}

export function cloneDefaultWorkspaceToolLayouts(): WorkspaceToolRadialLayouts {
  return {
    uv_editing: [...DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS.uv_editing],
    materials: [...DEFAULT_WORKSPACE_TOOL_RADIAL_LAYOUTS.materials],
  };
}

export function normalizeRadialSlotList(
  input: unknown,
  fallback: RadialSlotList,
): RadialSlotList {
  if (!Array.isArray(input)) {
    return [...fallback];
  }
  const out: RadialSlotList = [];
  for (let i = 0; i < RADIAL_SLOT_COUNT; i++) {
    const val = input[i];
    if (val === null) {
      out.push(null);
    } else if (typeof val === 'string' && val in RADIAL_ACTION_MAP) {
      out.push(val as RadialActionId);
    } else {
      out.push(fallback[i] ?? null);
    }
  }
  return out;
}

export function isValidRadialActionId(id: unknown): id is RadialActionId {
  return typeof id === 'string' && id in RADIAL_ACTION_MAP;
}

export function getMenuKindForScope(scope: RadialLayoutScope): RadialMenuKind {
  return scope === 'barhome' ? 'barhome' : 'tools';
}
