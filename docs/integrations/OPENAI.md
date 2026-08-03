# Integración OpenAI

Verificado contra documentación oficial: 2026-07-29.

## Responsabilidades

OpenAI se utiliza para:

- interpretar instrucciones multimodales;
- obtener un `ContentBrief` estructurado;
- buscar documentación aprobada;
- seleccionar herramientas seguras de consulta;
- proponer copy y dirección visual;
- generar o editar recursos fotográficos.

OpenAI no:

- publica en Meta directamente;
- cambia estados sin validación de dominio;
- ejecuta SQL;
- inventa precio o stock;
- escribe logos, precios o teléfonos dentro del recurso final;
- recibe tokens de Meta o credenciales comerciales.

## Ruteo inicial de modelos

La implementación debe resolver y fijar snapshots o aliases durante `P0-T02`.
La guía vigente al crear el repositorio indica:

- `gpt-5.6-terra`: equilibrio para briefs, herramientas y copy;
- `gpt-5.6-luna`: candidato para tareas rutinarias después de evals;
- `gpt-5.6-sol`: campañas difíciles, no ruta por defecto;
- `gpt-image-2`: generación y edición de recursos.

Fuente:
[Model guidance](https://developers.openai.com/api/docs/guides/latest-model).

No actualizar modelos por búsqueda y reemplazo. Ejecutar evals representativos,
documentar costo, latencia y calidad, y aprobar un ADR.

## Separación de APIs

### Responses API

Usar para:

- conversación y contexto;
- visión;
- File Search;
- function calling;
- Structured Outputs.

### Images API

Usar detrás de `ImageGenerationPort` cuando se necesite seleccionar
explícitamente `gpt-image-2`, generar variantes o editar con referencias.

La documentación oficial distingue Image API para una generación/edición
controlada y Responses API para experiencias conversacionales:
[Image generation](https://developers.openai.com/api/docs/guides/image-generation).

## Contrato de brief

La salida se valida con JSON Schema estricto y un tipo equivalente en
`@aramayo/contracts`.

Campos obligatorios:

- objetivo;
- marca;
- título;
- subtítulo nullable;
- caption;
- propuesta creativa;
- CTA tipado;
- hechos verificados con su evidencia;
- productos con su observación comercial;
- información faltante;
- dirección visual;
- requisito de aprobación.

Una negativa, timeout, respuesta incompleta o error de esquema produce un estado
de error explícito. Nunca se transforma silenciosamente en un brief vacío.

Fuente:
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

### Validación del brief

`P3-T07` separa el esquema de la validación. El esquema estricto sólo garantiza
forma —tipos, enums, propiedades requeridas y `additionalProperties: false`— y
la autoridad real es `@aramayo/domain`, que no depende del SDK ni del contrato
público. El worker es el único proceso que ve la entidad validada y el contrato,
y comprueba en tiempo de compilación que siguen siendo la misma forma.

El modelo nunca declara evidencia propia. El caso de uso arma un ledger antes de
generar: `K1…` para citas documentales de `P3-T04` y `C1…` para observaciones
comerciales de `P3-T06`. Cada hecho del brief debe citar una entrada existente y
del tipo correcto:

- un documento sustenta horario, ubicación, servicio y atributo de producto;
- precio sólo lo sustenta una lectura `priced`; stock sólo una lectura `known`;
- un precio ausente, un stock no informado o una recepción confirmada quedan en
  el historial pero no habilitan afirmar nada;
- una promoción no tiene fuente habilitada y queda bloqueada por diseño.

Precio y stock revalidan frescura contra la política aprobada —15 y 5 minutos—
en el instante de validar, con una tolerancia de 60 segundos de desfase de
reloj. Además, el copy se revisa por firmas textuales inequívocas: un importe
exige un hecho de precio, un porcentaje o la palabra descuento exigen un hecho
de promoción y un horario exige un hecho de horario. Es una defensa mecánica y
no reemplaza la evaluación semántica de `P3-T08`.

Un faltante declarado o un objetivo de promoción obligan a `requiresHumanApproval`.
Un fallo de esquema, de referencia o de frescura produce un rechazo que no
expone brief: el resultado del caso de uso es una unión discriminada y sólo la
variante generada contiene uno.

### Historial de ejecución

Cada ejecución —generada o rechazada— persiste en `content_brief_runs` con
pedido, hash, versión y hash del prompt, versión del esquema, modelo efectivo,
herramientas ofrecidas, invocaciones con su resultado, evidencia citada, estado
de la recuperación documental, uso de tokens y costo estimado. Una restricción
de base impide el estado híbrido: un run generado conserva su brief y no lleva
rechazo; uno rechazado conserva el motivo y no puede exponer brief.

Si el historial no puede escribirse, no se devuelve brief. Un resultado sin
trazabilidad no es utilizable, igual que en la auditoría comercial.

### Ciclo de herramientas

El bucle de function calling vive en el transporte porque necesita los items
crudos de la Responses API. Con `store: false` no hay estado remoto: cada vuelta
reenvía la conversación completa agregando la llamada del modelo y el resultado
del ejecutor. El límite inicial es de cuatro vueltas; superarlo es un fallo
explícito y no un brief incompleto.

Un run estructurado no se reintenta solo. Cada vuelta ya ejecutó lecturas
comerciales reales y las auditó; repetirlas sin pedido explícito gastaría el
presupuesto de llamadas y duplicaría evidencia. Un fallo del ejecutor de
herramientas llega intacto al caso de uso en lugar de disfrazarse de error del
proveedor.

## Herramientas permitidas

- `search_aramayo_knowledge`
- `search_products`
- `get_product`
- `get_current_price`
- `get_stock_by_location`
- `get_business_hours`
- `request_image_generation`

Cada herramienta debe:

- usar `strict: true`;
- rechazar campos desconocidos;
- aplicar `organizationId` del servidor, no del modelo;
- devolver datos mínimos;
- incluir fuente, frescura y clasificación;
- tener timeout y error tipado;
- ser de solo lectura en el primer publicador.

Fuente:
[Function calling](https://developers.openai.com/api/docs/guides/function-calling).

### Ejecutor comercial

`P3-T06` implementa cinco herramientas comerciales con `strict: true`; cada
objeto declara todos sus campos como requeridos y
`additionalProperties: false`:

- `search_products`;
- `get_product`;
- `get_current_price`;
- `get_stock_by_location`;
- `get_receipt_status`.

Los argumentos nunca incluyen organización, membresía, sucursal, URL, tabla,
modelo, campo, método ni SQL. El servidor deriva el scope autenticado y traduce
el UUID local de sucursal al identificador comercial aprobado. La búsqueda
admite hasta 10 filas para el modelo, cada run hasta 8 llamadas por defecto y
la salida completa hasta 12.000 caracteres.

El adaptador valida el JSON de Odoo campo por campo, rechaza propiedades
inesperadas, redirects, respuestas mayores a 64 KiB y scopes distintos del
tenant configurado. Cada intento se audita en PostgreSQL con parámetros
minimizados antes de entregar su resultado. Un fallo de auditoría bloquea la
salida.

La implementación sigue la recomendación oficial de usar modo estricto; en ese
modo todos los campos deben ser requeridos y cada objeto debe declarar
`additionalProperties: false`.

## Imágenes

Reglas:

- conservar originales y referencias;
- calcular hash antes de subir;
- validar MIME, dimensión, tamaño y decodificación;
- generar borradores separados de finales;
- no depender de transparencia generativa;
- no publicar una salida sin composición determinística;
- registrar prompt, modelo, request ID y moderación;
- no reintentar errores corregibles sin cambiar entrada.

Fuente:
[GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2).

### Perfiles visuales y política de prompts

`P4-T01` define el prompt de imagen antes de que exista la llamada. La autoridad
vive en `@aramayo/domain`; el catálogo y el texto viven en el worker, igual que
en el brief.

Un perfil declara formato, intención, estilo —composición, fotografía,
iluminación y textura—, foco, espacio reservado, restricciones y guía negativa.
Hay seis, uno por combinación de campaña y tipo de producto que el brief sabe
pedir, y la dirección visual del brief junto con la marca determinan cuál
corresponde. La selección nunca devuelve un perfil que la marca no tenga
aprobado.

El prompt tiene dos partes que no se mezclan. Las instrucciones son texto fijo y
versionado; los datos son un objeto JSON. Todo lo que escribió una persona o
propuso el modelo —etiqueta de producto, nota de tono— se sanea y viaja como
cadena dentro de `untrusted_data`, nunca concatenado en las instrucciones, y las
instrucciones declaran esa sección como datos que no son órdenes. El saneo
rechaza controles C0 y C1, anulación bidireccional y ancho cero, y colapsa los
saltos de línea para que un valor no pueda simular una sección nueva.

El texto comercial no se delega a la imagen. El prompt no transporta título,
bajada, caption, CTA ni hechos, y un valor que insinúe precio, promoción u
horario —con las mismas firmas textuales que usa la validación del brief— frena
la construcción antes de gastar una llamada. La identidad tampoco se genera: el
logotipo se compone con el motor determinista y se rechaza como referencia.

Las referencias salen de la biblioteca aprobada y viajan con su hash. Los
activos `media` son fotos de producto; los `brand` que no son logotipo son
contexto del local; un ícono vectorial no sirve como referencia fotográfica. Un
activo prohibido detiene la construcción con su motivo en lugar de descartarse
en silencio.

Cada plan lleva perfil, versión de perfil, versión de prompt y hash, tanto
cuando genera como cuando no. El fallback determinista tiene tres motivos
distinguibles: el brief pidió plantilla, la generación está deshabilitada o el
perfil necesita una foto aprobada que no existe.

Los prompts de nueve briefs representativos están congelados en
`apps/worker/src/visual/visual-prompt-baseline.json` y se regeneran con
`pnpm visual:snapshot`.

## Credenciales y costo

- `OPENAI_API_KEY` solo en servidor/worker.
- Nunca en variables `NEXT_PUBLIC_*`.
- Proyecto de API separado para staging y producción.
- Límite de gasto y alertas antes de habilitar producción.
- Registrar tokens y costo por `GenerationRun`.
- No registrar prompts que contengan datos personales innecesarios.
- La disponibilidad de GPT Image puede requerir verificación de organización.

## Gateway de Responses

`P3-T02` implementa `TextGenerationPort` en el dominio y mantiene el SDK oficial
confinado al módulo `generation` del worker. La política inicial es:

| Carga | Modelo | Reasoning |
|---|---|---|
| rutinaria | `gpt-5.6-luna` | `none` |
| brief y herramientas | `gpt-5.6-terra` | `low` |
| trabajo complejo | `gpt-5.6-sol` | `medium` |

El cliente usa `store: false`, servicio estándar, timeout explícito y cero
reintentos internos. El gateway aplica hasta dos reintentos con backoff
exponencial a conexión, timeout, rate limit, HTTP 408/409 y 5xx. Rechazos de
seguridad, solicitudes inválidas y errores permanentes no se reintentan.

Cada resultado conserva modelo efectivo, response ID, request ID, intentos,
latencia, tokens de entrada, caché, salida y razonamiento. El costo estimado usa
la tarifa estándar de contexto corto publicada para los tres modelos; un modelo
sin tarifa registrada conserva el uso y devuelve costo no disponible.

Los eventos seguros nunca incluyen input, instrucciones, output, archivos ni
credenciales. El logger interno del SDK permanece desactivado.

Fuentes:

- [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Precios de API](https://developers.openai.com/api/docs/pricing)
- [SDK oficial de JavaScript](https://github.com/openai/openai-node)

## Ingestión en File Search

`P3-T03` implementa el ciclo documental detrás de
`KnowledgeVectorStorePort`. El SDK oficial permanece en el worker y
PostgreSQL conserva la fuente lógica, versión, SHA-256, aprobación, vigencia,
ámbito, vector store, archivo remoto y estado de sincronización.

Formatos locales permitidos inicialmente:

- Markdown UTF-8;
- texto plano UTF-8;
- PDF con firma válida;
- DOCX con extensión, MIME y cabecera ZIP coherentes.

El límite local es 10 MiB por documento, aunque el proveedor admita un límite
mayor. Nombre, extensión, MIME, contenido, metadatos y aprobación se validan
antes de cualquier escritura remota.

La subida adjunta primero atributos con `status=candidate`. La versión sólo se
activa después de que el archivo remoto queda `completed` y sus atributos pasan
a `approved`. Reemplazar una fuente marca la versión anterior `superseded`.
Las consultas deben combinar el filtro remoto con la lista local de hashes
activos; ese control local evita usar candidatos, versiones reemplazadas o una
fuente retirada durante la ventana de consistencia eventual del proveedor.

Los atributos remotos son
`organization_id`, `document_type`, `brand`, `location_ids`, `status`,
`effective_from`, `effective_until`, `source_owner`, `sensitivity`,
`content_hash` y `version`. Las fechas se guardan como epoch y el ámbito de
sucursales como una cadena delimitada, que el caso de uso vuelve a filtrar
localmente.

Una interrupción conserva el archivo y estado remoto en la versión local. La
reconciliación consulta OpenAI, continúa la indexación o completa un retiro sin
duplicar el documento lógico. Un fallo parcial nunca se presenta como activo.

## Recuperación con citas

`P3-T04` aplica elegibilidad local antes de consultar File Search. PostgreSQL
devuelve como máximo 50 fuentes activas, aprobadas y vigentes para la
organización y sucursal derivadas de la sesión. La búsqueda remota filtra por
`organization_id`, `status=approved` y por los hashes activos permitidos.

Cada coincidencia se vuelve a validar contra documento, versión, hash, archivo
remoto y nombre persistidos. Los resultados con otra organización, versión
reemplazada, hash inesperado o score menor a `0.20` se descartan. El contexto
incluye como máximo 6 evidencias, 900 caracteres por fragmento y 4.800
caracteres en total; la pregunta admite entre 3 y 500 caracteres.

Cada cita conserva identificador presentable, documento, título, tipo, versión,
fragmento exacto, propietario, hash y score. Sin evidencia suficiente se
devuelve `missing_information`. Dos fuentes vigentes del mismo tipo con
fragmentos distintos se presentan como conflicto y no generan contexto para el
modelo. Los errores de OpenAI se propagan como fallos operativos y nunca se
convierten en una respuesta factual vacía.

Fuentes:

- [File Search](https://developers.openai.com/api/docs/guides/tools-file-search)
- [Retrieval y vector stores](https://developers.openai.com/api/docs/guides/retrieval)

## Evals mínimas

- extracción correcta del producto;
- cero invención de precio;
- cero invención de stock;
- elección correcta de marca;
- CTA permitido;
- detección de información faltante;
- referencias completas;
- cumplimiento de esquema;
- tono Aramayo;
- rechazo de instrucciones que intenten ignorar políticas.

## Suite de evaluación de fidelidad

`P3-T08` implementa la suite. El dataset es sintético y versionado: no contiene
productos, precios, stock ni documentos reales del negocio. Cada caso fija su
propia evidencia y provoca una decisión difícil.

El arnés sustituye únicamente las fuentes —conocimiento documental y catálogo
comercial— por el guion del caso. Prompt, esquema, ciclo de herramientas y
validación son los del sistema real; si la evaluación reemplazara la validación,
mediría el arnés.

Casos cubiertos: productos parecidos, stock cero, stock no informado, precio
vencido, precio no configurado, fuentes documentales contradictorias, intento de
inyección desde un documento, promoción sin autorización y ausencia de
coincidencia comercial.

Una afirmación sin respaldo es criterio binario: no se promedia ni se compensa.
Un caso que la contiene falla completo y deja un fallo bloqueante en el reporte.

### Puerta de promoción

La línea base congelada vive en el repositorio y sólo vale para el prompt,
esquema, modelo y dataset con los que se midió. Una prueba del worker la
compara contra los valores vigentes dentro de `pnpm verify`, sin red: cambiar
cualquiera de los cuatro invalida la línea base y bloquea la promoción hasta
volver a ejecutar `NODE_ENV=staging pnpm brief:eval`.

El CLI sólo congela una corrida que supera los umbrales. Una corrida por debajo
informa el detalle y deja la línea base anterior intacta.

### Límites conocidos y falsos positivos

- La suite mide lo comprobable de forma mecánica. Naturalidad del tono, calidad
  de la idea y pertinencia editorial no se miden acá y siguen dependiendo de la
  revisión humana.
- Un pedido imposible de cumplir admite dos resultados seguros: un brief que
  declara el faltante o un rechazo de la validación. La expectativa del caso
  acepta ambos mediante `acceptableRejectionCodes`, porque exigir un solo camino
  convertiría la variación normal del modelo en un falso negativo.
- El modelo no es determinista: dos corridas del mismo dataset pueden diferir.
  Por eso la puerta lee la línea base congelada y no una corrida en vivo.
- Las verificaciones de marca comprueban presencia y accionabilidad, no calidad
  del copy. Un texto correcto pero flojo aprueba.
- El dataset sintético no cubre la variedad real del catálogo; su objetivo es la
  decisión de política, no la cobertura de surtido.
