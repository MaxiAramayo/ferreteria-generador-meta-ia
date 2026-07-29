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
- CTA;
- referencias a hechos verificados;
- información faltante;
- dirección visual;
- requisito de aprobación.

Una negativa, timeout, respuesta incompleta o error de esquema produce un estado
de error explícito. Nunca se transforma silenciosamente en un brief vacío.

Fuente:
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

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
