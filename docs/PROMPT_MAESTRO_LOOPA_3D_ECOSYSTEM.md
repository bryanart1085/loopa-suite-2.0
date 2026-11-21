PROMPT MAESTRO — LOOPA 3D ECOSYSTEM

Quiero desarrollar LOOPA, un ecosistema de aplicaciones de modelado y creación 3D.

LOOPA debe funcionar como una suite de aplicaciones independientes que comparten un mismo sistema de proyectos.

No quiero una aplicación 3D monolítica con todas las herramientas mezcladas. Quiero una arquitectura modular, donde cada aplicación tenga una función específica y pueda trabajar con los proyectos de LOOPA Ecosystem.

1. Antes de comenzar

Primero analiza todo el código existente del proyecto.

* Identifica la arquitectura actual.
* Revisa qué funcionalidades ya están implementadas.
* Identifica errores, componentes incompletos y funcionalidades simuladas.
* Conserva todo lo que ya funciona.
* No elimines ni reemplaces código funcional sin una razón técnica.
* No reconstruyas el proyecto desde cero si la arquitectura existente puede aprovecharse.

Después de analizarlo, establece un plan de implementación y comienza a desarrollar sobre la estructura existente.

No te limites a crear una interfaz visual. Las funcionalidades deben ser reales y operativas dentro de las capacidades técnicas del proyecto.

2. Concepto principal

LOOPA es una suite de creación 3D formada por cinco componentes:

1. LOOPA Suite
2. LOOPA Modeler
3. LOOPA Sculpt
4. LOOPA UVs
5. LOOPA Materials

LOOPA Suite será la aplicación principal y funcionará como centro de acceso a todos los proyectos.

Las otras cuatro aplicaciones serán módulos independientes.

3. LOOPA Suite — Galería principal

Al iniciar LOOPA, el usuario debe ingresar a una galería de proyectos.

Cada proyecto debe mostrar:

* Miniatura o render de vista previa.
* Nombre del proyecto.
* Fecha de última modificación.
* Formato o tipo de proyecto.
* Acceso para abrirlo.
* Opciones para renombrar, duplicar y eliminar.

La galería debe incluir:

* Botón para crear un proyecto nuevo.
* Buscador de proyectos.
* Ordenar por nombre, fecha y última modificación.
* Vista en cuadrícula con miniaturas.
* Estado vacío cuando todavía no existen proyectos.

Cada proyecto debe tener una miniatura visible y persistente.

Cuando el usuario guarde cambios en una aplicación, la miniatura debe actualizarse cuando corresponda.

Los proyectos deben conservarse al cerrar y volver a abrir la aplicación.

4. Selector de aplicaciones

Al seleccionar un proyecto, LOOPA debe mostrar las aplicaciones disponibles para abrirlo:

* LOOPA Modeler
* LOOPA Sculpt
* LOOPA UVs
* LOOPA Materials

Cada aplicación debe tener su propio icono, nombre y descripción.

El usuario puede abrir el mismo proyecto en cualquiera de las cuatro aplicaciones.

La aplicación seleccionada debe cargar el proyecto existente, no crear una copia independiente sin relación con el original.

5. LOOPA Modeler

Esta aplicación estará dedicada exclusivamente al modelado 3D.

Debe permitir desarrollar progresivamente herramientas como:

* Crear objetos básicos.
* Seleccionar objetos.
* Seleccionar vértices, aristas y caras.
* Mover, rotar y escalar.
* Editar geometría.
* Extruir.
* Subdividir.
* Eliminar geometría.
* Crear y organizar objetos.
* Visualizar la geometría en modo sólido y wireframe.

LOOPA Modeler NO debe contener herramientas de esculpido, edición UV ni edición de materiales.

No debe modificar los datos de esas áreas.

6. LOOPA Sculpt

Esta aplicación estará dedicada exclusivamente al esculpido digital.

Debe tener una interfaz especializada para trabajar sobre la superficie de los modelos.

Debe permitir desarrollar herramientas como:

* Pinceles de esculpido.
* Añadir y quitar volumen.
* Suavizar.
* Inflar.
* Pellizcar.
* Mover la superficie.
* Controlar el tamaño e intensidad del pincel.
* Visualizar la malla durante el esculpido.

LOOPA Sculpt puede modificar la geometría de la superficie, pero no debe editar las UVs ni los materiales.

7. LOOPA UVs

Esta aplicación estará dedicada exclusivamente al mapeado UV.

Debe permitir:

* Visualizar las coordenadas UV.
* Desenvolver una malla.
* Crear y editar islas UV.
* Mover, rotar y escalar islas.
* Organizar las islas dentro del espacio UV.
* Visualizar una textura de comprobación.
* Detectar problemas básicos de distribución.

LOOPA UVs no debe modificar la geometría del modelo ni los materiales.

8. LOOPA Materials

Esta aplicación estará dedicada exclusivamente a los materiales y texturas.

Debe permitir:

* Crear materiales.
* Cambiar colores.
* Ajustar propiedades PBR.
* Controlar metallic.
* Controlar roughness.
* Asignar materiales a objetos.
* Visualizar los materiales sobre el modelo.
* Gestionar texturas cuando estén disponibles.

LOOPA Materials no debe modificar la geometría, el esculpido ni las coordenadas UV.

9. LOOPA Ecosystem — Sistema para compartir proyectos

Todas las aplicaciones deben incluir un botón visible llamado:

Compartir con LOOPA Ecosystem

Al pulsarlo, debe abrirse un selector con las otras aplicaciones disponibles.

Ejemplo:

Un proyecto abierto en LOOPA Modeler puede compartirse con LOOPA Sculpt, LOOPA UVs o LOOPA Materials.

Al seleccionar una aplicación:

1. Guardar los cambios pendientes del proyecto actual.
2. Preparar los datos necesarios.
3. Abrir el mismo proyecto en la aplicación seleccionada.
4. Mantener la relación con el proyecto original.
5. Evitar duplicar archivos innecesariamente.

El usuario debe poder regresar a LOOPA Suite y continuar trabajando.

El sistema debe conservar la información que no pertenece a la aplicación actual.

10. Arquitectura y protección de datos

Implementa una arquitectura modular.

Cada aplicación debe tener:

* Su propio módulo.
* Su propia interfaz.
* Sus propias herramientas.
* Sus propios controles.
* Su propia lógica de edición.

Todas deben utilizar un núcleo compartido llamado LOOPA Core.

LOOPA Core será responsable de:

* Gestionar proyectos.
* Guardar y cargar archivos.
* Mantener identificadores únicos.
* Gestionar miniaturas.
* Compartir datos entre aplicaciones.
* Mantener versiones.
* Detectar cambios.
* Proteger los datos que una aplicación no puede modificar.

Define un formato de proyecto común para LOOPA Ecosystem.

Cada proyecto debe conservar, como mínimo:

* Geometría.
* Transformaciones.
* Datos de esculpido.
* Coordenadas UV.
* Materiales.
* Texturas.
* Configuración del proyecto.
* Miniatura.

Las aplicaciones deben trabajar únicamente sobre los datos que les corresponden.

Si una modificación afecta a otra área, el sistema debe detectar el cambio y mostrar una advertencia cuando sea necesario.

Por ejemplo, si Modeler modifica la geometría después de crear las UVs, LOOPA debe avisar que las UVs podrían necesitar actualización.

11. Interfaz visual

Quiero una interfaz profesional, moderna y minimalista.

Estilo visual:

* Tema oscuro.
* Fondo negro o grafito.
* Paneles gris oscuro.
* Acentos discretos.
* Tipografía moderna y legible.
* Iconografía consistente.
* Interfaz limpia.
* Diseño orientado a artistas 3D.

La galería debe sentirse como una suite profesional de creación 3D.

Las aplicaciones deben tener una estructura visual consistente, pero cada una debe mostrar únicamente las herramientas de su especialidad.

No quiero interfaces saturadas ni elementos decorativos innecesarios.

12. Requisitos técnicos

Antes de implementar nuevas funcionalidades, verifica qué tecnologías utiliza actualmente el proyecto.

Mantén la compatibilidad con la arquitectura existente siempre que sea viable.

Requisitos:

* Código modular y organizado.
* Componentes reutilizables.
* Persistencia real de proyectos.
* Gestión de errores.
* Guardado seguro.
* Arquitectura preparada para futuras herramientas.
* Interfaz adaptable a diferentes tamaños de pantalla.
* Evitar dependencias innecesarias.
* No utilizar servicios de inteligencia artificial de pago como requisito para el funcionamiento básico.

Si el proyecto utiliza tecnologías web, implementa una solución compatible con ellas.

No simules funcionalidades 3D que todavía no puedan ejecutarse. Si una herramienta requiere un motor 3D adicional, identifica la dependencia y prepara su integración correctamente.

13. Orden de desarrollo

Desarrolla el ecosistema en este orden:

FASE 1 — LOOPA Suite

* Galería.
* Miniaturas.
* Crear proyectos.
* Guardar proyectos.
* Abrir proyectos.
* Persistencia.

FASE 2 — LOOPA Core

* Formato de proyecto.
* Gestión de datos.
* Identificadores.
* Comunicación entre aplicaciones.
* Sistema de compartir.

FASE 3 — Aplicaciones independientes

* LOOPA Modeler.
* LOOPA Sculpt.
* LOOPA UVs.
* LOOPA Materials.

FASE 4 — Integración

* Abrir un proyecto desde cualquier aplicación.
* Compartirlo con las otras aplicaciones.
* Guardar cambios.
* Regresar a la galería.
* Verificar que no se pierdan datos.

FASE 5 — Pruebas

* Crear un proyecto.
* Modelar un objeto.
* Compartirlo con Sculpt.
* Compartirlo con UVs.
* Compartirlo con Materials.
* Guardar y cerrar.
* Volver a abrirlo.
* Verificar que la geometría, UVs, materiales y miniatura se mantengan correctamente.

14. Instrucción final

Comienza revisando el código actual y determina cuál es la mejor forma de integrar esta arquitectura sin destruir el trabajo existente.

Prioriza primero un ecosistema funcional con un flujo completo de proyectos, aunque las herramientas de modelado sean inicialmente básicas.

No intentes construir todas las herramientas avanzadas de una sola vez.

Quiero una base sólida, funcional y ampliable, sobre la cual podamos desarrollar cada aplicación de LOOPA progresivamente.

El objetivo final es que LOOPA sea una suite 3D modular, donde cada aplicación sea independiente, pero todas compartan el mismo ecosistema de proyectos.