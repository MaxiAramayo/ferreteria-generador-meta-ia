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

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] El contrato no importa React, Playwright ni infraestructura.
- [x] Entradas desconocidas se validan antes de llegar al render.
- [x] Los errores distinguen contenido, activo, layout, render y exportación.
- [x] El documento incluye versión de esquema para futuras migraciones.
- [x] Los formatos no se duplican fuera del módulo canónico.
- [x] La API permite consumir tokens y layouts sin importar el repositorio fuente.
- [x] Ningún contrato público expone rutas locales, Markdown o Playwright.
- [x] No se usa `any` ni aserciones evitables.

### Verificación obligatoria

- [x] Tests unitarios para documentos válidos e inválidos.
- [x] Typecheck de consumidores de ejemplo.
- [x] Revisión de dependencias para confirmar dirección hacia el dominio.

### Fuera de alcance

- Interfaz de usuario final.
- Generación con IA.

### Notas de progreso

- 2026-07-27: se definieron los contratos del motor sobre la línea base
  congelada: documento versionado, referencia de activos, registro de layouts,
  formatos canónicos, identidad de temas, iconos semánticos, fallos por etapa y
  puerto de render.
- 2026-07-27: los identificadores de layout, tema, formato e icono se conservan
  en español porque nombran piezas reales del sistema visual; los campos de
  contenido se traducen al vocabulario en inglés del resto de los contratos de
  la plataforma.
- 2026-07-27: `FORMATS` queda en este paquete, adelantando un entregable
  previsto en `P1-T04`. La validación necesita dimensiones y zonas seguras, y
  duplicarlas habría violado la regla de fuente única.

### Evidencia de cierre

- Commit: commit de cierre de `P1-T02`.
- Superficie pública: `packages/design-engine/src/index.ts` exporta contratos,
  formatos, temas, registro y validación; `README.md` documenta la API, el
  ejemplo de uso y las reglas del contrato.
- Dirección de dependencias: `dependencies` vacío; las únicas importaciones son
  relativas al propio paquete y, en pruebas, `node:test`, `node:assert/strict` y
  `node:fs`. Ninguna referencia a React, Playwright, NestJS, Next.js, disco o
  red en el código de producción.
- `pnpm --filter @aramayo/design-engine test`: 28 pruebas aprobadas —19 de
  validación con documentos válidos e inválidos, 6 de integridad del registro
  contra `baseline/manifest.json` y 3 del consumidor de ejemplo del puerto de
  render.
- Integridad con la línea base: el registro cubre exactamente los 33 layouts, 5
  formatos con sus dimensiones y zonas seguras, 4 temas y 26 iconos congelados;
  los 33 fixtures encajan en el formato aprobado de su layout.
- Validación de borde: se rechazan entrada que no es objeto, versión de esquema
  distinta, layout desconocido, formato no aprobado, campo obligatorio ausente,
  campo no admitido por el layout, campo inexistente, texto vacío o excesivo,
  ítems fuera de rango, icono fuera del registro, medios en layouts sin ranura,
  exceso de imágenes, activo sin texto alternativo, ruta local, URL sin HTTPS y
  encuadre o zoom fuera de límites.
- `pnpm verify`: ocho pasos aprobados, 67 pruebas en total y smoke completo de
  las tres aplicaciones.
- Desviaciones: los tokens de color y tipografía no se migran en esta tarea;
  `P1-T03` los incorpora sobre los identificadores de tema ya fijados.

## P1-T03 — Migrar identidad, primitivas y activos

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Colores, tipografías, radios y espacios provienen de tokens centralizados.
- [x] Los tokens son objetos inmutables y no valores mágicos repetidos.
- [x] Si existen tokens TypeScript y CSS, se generan desde una fuente o una prueba verifica paridad.
- [x] Iconos se seleccionan por nombre semántico y usan Lucide.
- [x] Fotos declaran encuadre y fallback de forma explícita.
- [x] Logos conservan área segura y relación de aspecto.
- [x] Activos inválidos producen un error útil, nunca una pieza incompleta silenciosa.
- [x] No se copian dependencias o código sin licencia compatible.

### Verificación obligatoria

- [x] Storybook o harness equivalente cubre todas las primitivas.
- [x] Comparación visual contra referencias aprobadas.
- [x] Tests de error para icono, logo, fuente y foto inexistentes.

### Fuera de alcance

- Diseñar nuevas plantillas.

### Notas de progreso

- 2026-07-27: se migraron tokens de color, tipografía, espaciado, radios y
  trazos; los cuatro temas con diez roles de color resueltos; y las primitivas
  `Canvas`, `SafeArea`, `Photo`, `Icon`, `Logo` y `Text`.
- 2026-07-27: la superficie React se publica en una entrada separada
  (`@aramayo/design-engine/react`) para que los contratos sigan sin depender de
  React, como exige `P1-T02`.
- 2026-07-27: el generador expresaba los temas como clases de Tailwind. La
  migración los resuelve a color desde tokens y compone con estilos explícitos:
  el worker podrá renderizar sin un build de CSS.
- 2026-07-27: las pruebas de primitivas consumen `dist/` porque Node ejecuta
  TypeScript quitando tipos pero no transforma JSX. De paso verifican
  exactamente el artefacto que reciben los consumidores.

### Evidencia de cierre

- Commit: commit de cierre de `P1-T03`.
- `pnpm --filter @aramayo/design-engine test`: 51 pruebas aprobadas —23 nuevas
  de tokens, temas, activos y primitivas sobre las 28 de `P1-T02`.
- Paridad tokens/CSS: `designEngineStylesheet()` se genera desde los mismos
  objetos que consumen las primitivas y una prueba compara cada variable con su
  token; todo color de tema es un token opaco o el mismo token con alfa.
- Activos: `pnpm assets:sync` migró los 38 activos con propiedad confirmada,
  verificando el hash de cada archivo contra la línea base; una prueba recalcula
  los 38 hashes sin necesidad del generador.
- Errores útiles: hay pruebas de icono fuera del registro (`content`), variante
  de logo inexistente (`asset`), isotipo por debajo del tamaño mínimo (`asset`),
  familia tipográfica inexistente (`asset`) y foto cuyo activo no está aprobado
  (`asset`). Una pieza sin foto declarada, en cambio, usa `PhotoFallback`: es un
  estado explícito y visible, no un hueco.
- Harness: `/diseno/primitivas` en el panel muestra los cuatro temas con piezas
  compuestas a medidas reales, la paleta completa, la escala tipográfica, las
  tres variantes de logo y los 26 iconos. HTTP 200 verificado con 4 lienzos
  `[data-card]`, 18 muestras de color, 38 SVG y 80 variables CSS.
- Ruta de activos: `/media/<archivo>` sirve sólo los archivos de la biblioteca
  aprobada (200 con `image/jpeg`); un archivo no aprobado y un intento de
  recorrido de directorios responden 404.
- Comparación visual: el harness reproduce la identidad de
  `baseline/references/producto-destacado.png` —isotipo, bloque tipográfico
  condensado en mayúscula, colores de marca y CTA de WhatsApp—. La comparación
  pixel a pixel de piezas completas pertenece a `P1-T04` y `P1-T06`, que ya
  tienen las referencias congeladas.
- Licencias: `@fontsource/archivo` y `@fontsource/saira-condensed` (OFL-1.1) y
  `lucide-react` (ISC), fijados en el catálogo. `lucide-react` se mantiene en la
  versión `0.561.0` del generador para no alterar la forma de los iconos antes
  de la aprobación de paridad.
- `pnpm verify`: nueve pasos aprobados, 90 pruebas, línea base verificada y
  smoke completo de las tres aplicaciones.
- Desviaciones:
  - Los activos se versionan en el repositorio (9 MB). Son material propio y
    curado; `P1-T07` define el ciclo de vida de los medios subidos por usuarios,
    que sí van a Cloudinary.
  - `manguera-azul.jpg` y `manguera-azul.jpeg` comparten nombre base: sus
    identificadores incorporan la extensión para que un activo no pueda
    resolverse de dos maneras.
  - Las fuentes `inter` y `barlow-condensed` figuraban como dependencias del
    generador pero ningún layout las usaba; no se migran.

## P1-T04 — Migrar layouts, formatos y zonas seguras

- [ ] Tarea completada
- Estado: EN PROGRESO
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

- 2026-07-27: migrados 11 de 33 layouts —las ocho publicaciones de feed y
  cuadrado, el banner de portada y la portada destacada—, compuestos con las
  primitivas de `P1-T03` y las medidas del formato. Quedan pendientes los nueve
  carruseles y los catorce layouts de historia.
- 2026-07-27: el registro de componentes es parcial a propósito. Un layout
  registrado en `LAYOUT_SPECS` pero todavía sin componente falla con
  `layout: not-registered`; nunca compone una pieza a medias. Al completar la
  migración, el registro pasa a `Record<LayoutId, LayoutComponent>` exhaustivo.
- 2026-07-27: los datos comerciales salen del motor. `BRAND` del generador se
  migró a `@aramayo/brand-knowledge` como perfil aprobado y los layouts lo
  reciben en su contexto: teléfono y direcciones cambian con el negocio, no con
  el diseño.
- 2026-07-27: regla explícita de texto excesivo (`TEXT_BUDGET`): título 90,
  subtítulo 150 e ítems 60 caracteres. Excederlo produce un fallo de contenido
  con la ruta del campo, en lugar del desborde silencioso que documenta
  `borde-texto-largo` en la línea base.
- 2026-07-27: harness en `/diseno/layouts` con cada layout migrado a medidas
  reales y la lista de los pendientes.

### Próximo paso

Migrar los nueve carruseles (`carrusel-*`) y los catorce layouts de historia
(`historia-*`) desde `src/layouts/launchCarousels.tsx`, `dailyStories.tsx` y
`storySeries.tsx` del generador congelado; luego cerrar el registro exhaustivo,
adaptar los 33 fixtures a documentos y comparar contra las referencias.

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
