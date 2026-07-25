# Fase 1 — Migración del motor visual

## Resultado de la fase

El nuevo repositorio reproduce el lenguaje visual vigente de Ferretería Aramayo
mediante un motor reutilizable, determinista, validado visualmente y ejecutable
por un worker, sin depender del repositorio anterior en tiempo de ejecución.

## Invariantes

- La migración sigue
  [`DESIGN-SYSTEM-SOURCE-MAP.md`](../architecture/DESIGN-SYSTEM-SOURCE-MAP.md).
- Colores, tipografías, temas, formatos y safe zones se expresan como variables
  o registros tipados.
- Los layouts se implementan como componentes React; PNG y HTML son únicamente
  referencias o fixtures.
- El repositorio fuente no es dependencia de build ni runtime.
- Una idea principal por pieza y texto legible en móvil.
- CTA principal orientado a consulta o WhatsApp.
- Formatos y zonas seguras centralizados.
- Imágenes deben decodificar antes de exportar.
- La IA puede producir insumos; la composición de marca permanece controlada.

## P1-T01 — Congelar inventario y fixtures de referencia

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T06`
- Riesgo: Medio

### Objetivo

Definir una línea base legal y visual para comparar la migración sin alterar el
generador existente.

### Entregables

- Snapshot con repositorio, commit y estado limpio del árbol fuente.
- Mapa verificado de fuentes canónicas, referencias y salidas generadas.
- Inventario de layouts, formatos, temas, iconos, logos y fuentes.
- Fixtures representativos de feed, story y destacadas.
- Capturas PNG de referencia con metadatos de origen.

### Criterios de aceptación

- [x] Cada layout productivo tiene al menos un fixture.
- [x] Se registra `source_repository`, `source_commit` y árbol fuente limpio.
- [x] Se verifica cada entrada del mapa de origen contra el snapshot fijado.
- [x] La carpeta histórica, `output/**` y `dist/**` quedan clasificadas como no canónicas.
- [x] Se incluyen textos largos, ausencia de foto y fotos con proporciones extremas.
- [x] Los activos tienen propietario o permiso de uso documentado.
- [x] Las referencias registran tamaño, fecha, contenido y comando de exportación.
- [x] El repositorio anterior no es modificado por esta tarea.

### Verificación obligatoria

- [x] Regenerar las referencias con el comando documentado.
- [x] Comprobar dimensiones y hashes de los fixtures.
- [x] Revisar manualmente la cobertura del inventario.

### Fuera de alcance

- Mejorar diseños o cambiar identidad visual.

### Notas de progreso

- Fecha: 2026-07-25.
- Estado real: línea base congelada, verificable y con todos los criterios
  cumplidos.
- Archivos modificados: `tools/design-baseline/**`,
  `packages/design-engine/baseline/**`, `packages/design-engine/README.md`,
  `docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md`, `package.json` y
  `.github/workflows/ci.yml`.
- Decisiones tomadas:
  - el congelamiento corre sobre una copia descartable del generador, de modo
    que el repositorio anterior no se modifica ni se ejecuta desde este
    monorepo;
  - la cobertura de fixtures se calcula automáticamente —una pieza por layout
    en uso— en lugar de elegirse a mano, para que un layout nuevo no quede sin
    fixture;
  - los activos se clasifican por propiedad con estados explícitos y los que
    requieren confirmación quedan listados, en vez de asumirse aprobados.
- Verificaciones ejecutadas: `pnpm baseline:freeze` reproducido tres veces,
  `pnpm baseline:verify` (33 fixtures y 33 referencias con hash y dimensiones
  correctas), `pnpm verify` completo y revisión manual de `INVENTORY.md` y de
  los PNG de casos borde.
- Verificaciones pendientes: ninguna.
- Resolución de los dos criterios que dependían del negocio, el 2026-07-25:
  1. **Árbol fuente limpio.** El usuario autorizó commitear el trabajo en curso
     del generador. Se consolidó en `f6bccd2` —layouts de historias y
     carruseles, piezas nuevas, exportaciones y ajustes de primitivas— y se
     agregó `.claude/` a su `.gitignore`. El commit quedó local: publicarlo es
     decisión del usuario. La línea base se volvió a congelar sobre ese árbol
     limpio.
  2. **Propiedad de los activos.** El usuario confirmó que las 38 imágenes son
     propias. La confirmación quedó registrada activo por activo, con fecha, en
     `tools/design-baseline/asset-ownership.ts`; un activo nuevo que no figure
     en esa lista vuelve a marcarse como `por-confirmar`.

### Evidencia de cierre

- Commit: commit de cierre de `P1-T01`.
- `packages/design-engine/baseline/manifest.json`: snapshot del generador
  (`ferreteria-aramayo-image-generator`, remoto `ferreteria-post-creator`,
  commit `f6bccd2f97b94f65491d24536ce64d7f5fc3a199`, árbol limpio), 20 archivos
  canónicos con hash e inventario de 33 layouts, 5 formatos, 4 temas, 4 familias
  tipográficas, 26 nombres de icono y 38 activos con propiedad confirmada.
- `packages/design-engine/baseline/fixtures/`: 33 piezas; una por cada uno de
  los 30 layouts en uso, más texto largo, ausencia de foto y foto panorámica.
  Los tres layouts registrados sin pieza —`historia-producto`,
  `presentacion-marca` y `sucursales`— quedan listados para `P1-T04`.
- `packages/design-engine/baseline/references/`: 33 PNG exportados con
  `EXPORT_SCALE=1 npm run export`, cada uno con bytes, dimensiones, hash, fecha
  y comando.
- `pnpm baseline:freeze` reproducido cinco veces con el mismo resultado;
  `pnpm baseline:verify` confirma hashes y dimensiones sin necesitar el
  generador y forma parte de `pnpm verify` y del workflow de CI.
- Revisión manual de `INVENTORY.md` y de los PNG de casos borde: el generador
  actual deja desbordar el texto largo fuera del canvas, resuelve la ausencia de
  foto con un marcador visible y aplica `contain` a la foto panorámica. Queda
  documentado en el README del paquete como comportamiento a corregir en
  `P1-T04`, no a replicar.
- Desviaciones: la exportación corre sobre una copia descartable del generador
  en lugar de sobre el repositorio original, para no modificarlo ni ejecutarlo
  desde este monorepo.

## P1-T02 — Definir API pública del motor de diseño

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T01`
- Riesgo: Alto

### Objetivo

Separar datos, validación, render y exportación mediante contratos estables que
puedan consumir tanto la web como el worker.

### Entregables

- Tipos de `DesignDocument`, layout, tema, formato, activos y resultado.
- Límite público para tokens, temas, formatos, primitivas y registro.
- Validadores de borde.
- Errores discriminados y API pública documentada.

### Criterios de aceptación

- [ ] El contrato no importa React, Playwright ni infraestructura.
- [ ] Entradas desconocidas se validan antes de llegar al render.
- [ ] Los errores distinguen contenido, activo, layout, render y exportación.
- [ ] El documento incluye versión de esquema para futuras migraciones.
- [ ] Los formatos no se duplican fuera del módulo canónico.
- [ ] La API permite consumir tokens y layouts sin importar el repositorio fuente.
- [ ] Ningún contrato público expone rutas locales, Markdown o Playwright.
- [ ] No se usa `any` ni aserciones evitables.

### Verificación obligatoria

- [ ] Tests unitarios para documentos válidos e inválidos.
- [ ] Typecheck de consumidores de ejemplo.
- [ ] Revisión de dependencias para confirmar dirección hacia el dominio.

### Fuera de alcance

- Interfaz de usuario final.
- Generación con IA.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P1-T03 — Migrar identidad, primitivas y activos

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T01`, `P1-T02`
- Riesgo: Medio

### Objetivo

Trasladar las piezas visuales compartidas sin introducir una segunda forma de
resolver temas, fotos, iconos o logos.

### Entregables

- `COLORS`, `TYPOGRAPHY`, `SPACING`, `RADII` y `TYPE_SCALE` tipados.
- `THEMES`, bindings CSS derivados y `themeFor`.
- Primitivas equivalentes a `Photo`, `Icon` y `Logo`.
- Fuentes y activos aprobados con licencias registradas.

### Criterios de aceptación

- [ ] Colores, tipografías, radios y espacios provienen de tokens centralizados.
- [ ] Los tokens son objetos inmutables y no valores mágicos repetidos.
- [ ] Si existen tokens TypeScript y CSS, se generan desde una fuente o una prueba verifica paridad.
- [ ] Iconos se seleccionan por nombre semántico y usan Lucide.
- [ ] Fotos declaran encuadre y fallback de forma explícita.
- [ ] Logos conservan área segura y relación de aspecto.
- [ ] Activos inválidos producen un error útil, nunca una pieza incompleta silenciosa.
- [ ] No se copian dependencias o código sin licencia compatible.

### Verificación obligatoria

- [ ] Storybook o harness equivalente cubre todas las primitivas.
- [ ] Comparación visual contra referencias aprobadas.
- [ ] Tests de error para icono, logo, fuente y foto inexistentes.

### Fuera de alcance

- Diseñar nuevas plantillas.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P1-T04 — Migrar layouts, formatos y zonas seguras

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T03`
- Riesgo: Alto

### Objetivo

Reproducir todos los layouts productivos manteniendo una única definición de
formatos y un registro tipado.

### Entregables

- `FORMATS` y safe zones como datos tipados.
- Layouts como componentes React y registro exhaustivo.
- Render de fixtures de la línea base.

### Criterios de aceptación

- [ ] Cada layout inventariado está registrado y tipado.
- [ ] Ningún layout se implementa mediante un PNG de fondo con texto horneado.
- [ ] Ningún layout importa HTML exportado o código desde fuera del monorepo.
- [ ] Valores compartidos se resuelven mediante tokens, formatos o primitivas.
- [ ] Feed, story y portada destacada respetan dimensiones y zonas seguras.
- [ ] Las portadas quedan centradas dentro del círculo seguro.
- [ ] Texto excesivo falla con diagnóstico o aplica una regla explícita aprobada.
- [ ] Ningún layout carga archivos por rutas arbitrarias.
- [ ] Los datos faltantes producen errores de validación específicos.

### Verificación obligatoria

- [ ] Exportar todos los fixtures.
- [ ] Ejecutar comparación visual con umbral registrado.
- [ ] Revisar manualmente los casos con diferencias aceptadas.

### Fuera de alcance

- Incorporar prompts o decisiones automáticas de IA.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P1-T05 — Implementar render y exportación en worker

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P0-T05`, `P1-T04`
- Riesgo: Alto

### Objetivo

Renderizar documentos de diseño en un proceso aislado y exportar exactamente el
nodo de pieza como PNG reproducible.

### Entregables

- Caso de uso de render.
- Adaptador Playwright y navegador administrado.
- Resultado con dimensiones, hash, duración y error estructurado.

### Criterios de aceptación

- [ ] El worker exporta el nodo `[data-card]` y no la ventana completa.
- [ ] Espera fuentes y decodificación de todas las imágenes.
- [ ] Una imagen que no decodifica hace fallar el trabajo.
- [ ] Cada trabajo tiene timeout, limpieza y límite de concurrencia.
- [ ] Reintentos no crean resultados contradictorios para la misma entrada.
- [ ] Logs correlacionan publicación, ejecución y activo sin revelar contenido sensible.

### Verificación obligatoria

- [ ] Tests con imagen lenta, rota, fuente ausente y navegador que termina.
- [ ] Repetir un fixture y comparar hash o diferencia visual tolerada.
- [ ] Medir memoria y tiempo en un lote representativo.

### Fuera de alcance

- Cola productiva y almacenamiento remoto definitivo.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P1-T06 — Aprobar paridad visual y accesibilidad del editor

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T05`
- Riesgo: Medio

### Objetivo

Demostrar que la migración conserva la marca y que los controles usados para
previsualizarla son accesibles.

### Entregables

- Reporte de comparación visual.
- Lista de diferencias aprobadas.
- Auditoría básica de contraste y navegación por teclado.

### Criterios de aceptación

- [ ] Todos los fixtures están dentro del umbral o tienen excepción aprobada.
- [ ] No hay recortes de CTA, precios, logos ni texto principal.
- [ ] El contenido continúa legible a escala móvil.
- [ ] Controles de preview tienen nombre accesible, foco y estado.
- [ ] Diferencias intencionales se documentan como nueva línea base.

### Verificación obligatoria

- [ ] Ejecutar suite visual completa en entorno limpio.
- [ ] Revisar casos críticos en tamaños reales.
- [ ] Navegar el harness sin mouse y ejecutar auditoría automatizada.

### Fuera de alcance

- Rediseño del panel completo.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P1-T07 — Integrar ciclo de vida de medios

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P0-T07`, `P1-T05`
- Riesgo: Alto

### Objetivo

Subir, validar, versionar y servir medios mediante URLs públicas controladas,
aptas para render y futura publicación en Meta.

### Entregables

- Puerto de almacenamiento y adaptador Cloudinary.
- Políticas de tipo, tamaño, nombre y eliminación.
- Metadatos persistibles y URLs transformadas.

### Criterios de aceptación

- [ ] Solo se aceptan tipos y tamaños permitidos.
- [ ] Se verifica el contenido real, no solo la extensión.
- [ ] Cada activo conserva origen, hash, dimensiones y propietario.
- [ ] Las URLs requeridas por Meta son HTTPS y accesibles durante la publicación.
- [ ] Reemplazar un activo no muta retrospectivamente una publicación aprobada.
- [ ] La eliminación respeta referencias y política de retención.

### Verificación obligatoria

- [ ] Probar carga válida, archivo corrupto, tipo engañoso y tamaño excesivo.
- [ ] Renderizar desde la URL remota.
- [ ] Confirmar que un activo referenciado no puede borrarse accidentalmente.

### Fuera de alcance

- Publicar en Meta.
- Generar imágenes con OpenAI.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 1

- [ ] `P1-T01` a `P1-T07` están completas.
- [ ] El nuevo motor reproduce todos los fixtures aprobados.
- [ ] El worker falla de forma explícita ante activos no decodificables.
- [ ] Medios remotos conservan trazabilidad y pueden renderizarse.
- [ ] El generador anterior ya no es una dependencia de ejecución.
- [ ] Tokens, temas, formatos y layouts son código nativo versionable del paquete.
- [ ] PNG/HTML del repositorio fuente se usan solo como evidencia o fixtures.
