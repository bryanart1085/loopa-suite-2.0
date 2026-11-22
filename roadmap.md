# LOOPA Ecosystem — roadmap (según docs/PROMPT_MAESTRO_LOOPA_3D_ECOSYSTEM.md)

## Fase 1 — LOOPA Suite (galería)
- [x] Miniatura visible en cada tarjeta
- [x] Fecha de última modificación + creación, tipo/formato, última app usada
- [x] Ordenar por nombre / fecha de creación / última modificación
- [x] Confirmación antes de eliminar
- [x] Cabecera adaptable a pantallas pequeñas
- [x] Tarjeta de Sculpt en "Ecosistema & Módulos" abre Sculpt de verdad

## Fase 2 — LOOPA Core
- [x] Registro de apps y áreas de datos que puede modificar cada una
- [x] Metadatos de ecosistema en el formato de proyecto (última app, historial de sesiones, base de UVs)
- [x] Firmas por área (topología, forma, transformaciones, UVs, materiales) y detección de cambios
- [x] Aviso cuando la geometría cambió después de editar UVs
- [x] Aviso si una app modifica un área que no le corresponde
- [x] Botón "Compartir con LOOPA Ecosystem" en todas las apps (guardar → abrir mismo proyecto en otra app)
- [x] Pruebas unitarias de las reglas de Core

## Pedido del usuario (22 nov)
- [x] Selector de modo dentro de las apps: solo Objeto y Edición (sin Esculpido)
- [x] Botón Ecosystem junto al selector de modo para cambiar entre apps
- [x] Quitar el botón del ecosystem de la barra superior (BARHOME)

## Fase 3 — Apps independientes (siguiente)
- [ ] Modeler sin herramientas de UV/materiales (el modo Esculpido ya no está en su selector)
- [ ] Sculpt con interfaz propia (pinceles, tamaño, intensidad)
- [ ] UVs y Materials con solo sus herramientas

## Fase 4/5 — Integración y pruebas end-to-end
- [ ] Flujo completo: crear → modelar → Sculpt → UVs → Materials → cerrar → reabrir, sin pérdida de datos
