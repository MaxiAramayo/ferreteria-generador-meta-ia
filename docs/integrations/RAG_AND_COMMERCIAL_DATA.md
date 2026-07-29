# RAG y datos comerciales

## Principio

El contexto “siempre Ferretería Aramayo” se implementa con aislamiento de
organización, conocimiento aprobado y funciones verificables. No depende de
memoria informal del modelo.

## Capa documental

OpenAI File Search será la primera implementación de `KnowledgeRetrieverPort`.
La interfaz debe permitir reemplazar el proveedor en el futuro.

Fuentes previstas:

- identidad y tono;
- direcciones, horarios y teléfonos;
- servicios de ferretería y lubricentro;
- medios de pago;
- rubros;
- preguntas frecuentes;
- estrategia de contenido;
- fichas y guías aprobadas;
- políticas de promoción.

Fuente técnica:
[File Search](https://developers.openai.com/api/docs/guides/tools-file-search).

## Metadatos obligatorios

Cada documento o archivo indexado debe incluir:

- `organization_id`
- `document_type`
- `brand`
- `location_ids`
- `status`
- `effective_from`
- `effective_until`
- `source_owner`
- `sensitivity`
- `content_hash`
- `version`

Solo `status=approved` y documentos vigentes entran en recuperación publicable.

## Ciclo de vida

1. Subir fuente.
2. Analizar formato y sensibilidad.
3. Asignar propietario.
4. Revisar y aprobar.
5. Versionar.
6. Indexar.
7. Probar recuperación.
8. Activar.
9. Expirar o reemplazar.

La eliminación de un documento debe retirar o invalidar su versión del índice.

### Implementación inicial

El worker acepta Markdown, texto plano, PDF y DOCX aprobados, con un máximo
local de 10 MiB. `KnowledgeDocument` identifica la fuente lógica y
`KnowledgeDocumentVersion` conserva versión, SHA-256, aprobación, vigencia,
ámbito y referencias de OpenAI. El mismo hash no crea otra versión.

La indexación usa `candidate` hasta que OpenAI informa `completed`; sólo
entonces cambia los atributos remotos a `approved` y activa la versión en una
transacción local. Una consulta futura deberá usar los hashes activos de
PostgreSQL además de los atributos remotos. Esta defensa es obligatoria porque
el retiro de un archivo del vector store es eventualmente consistente.

Los estados `sync_failed` y `retiring` conservan diagnóstico seguro y permiten
reanudar una subida ya asociada, completar la activación o repetir el retiro.
La fuente queda fuera de consultas desde que comienza el retiro local.

### Recuperación inicial

La consulta comienza en PostgreSQL y sólo habilita versiones activas,
aprobadas, vigentes y aplicables a la organización y sucursal de la sesión.
File Search recibe ese conjunto acotado de hashes junto con el tenant y el
estado aprobado. Cada resultado remoto se valida nuevamente contra la versión,
hash, archivo y nombre locales antes de usarse.

El contexto es determinista y acotado: hasta 6 fragmentos, 900 caracteres por
fragmento y 4.800 caracteres totales. Cada evidencia preserva la fuente lógica,
versión, fragmento exacto y metadatos necesarios para revisión. Sin evidencia
se devuelve `missing_information`; ante fuentes vigentes conflictivas se
conservan ambas citas para revisión, pero el contexto queda vacío.

## Capa comercial

Precio, stock, SKU, disponibilidad y recepción se consultan mediante
`CommercialCatalogPort`.

El contrato y la propuesta de acceso XML-RPC de solo lectura para Odoo 18 se
detallan en [`ODOO-READ-ACCESS.md`](ODOO-READ-ACCESS.md). La selección sigue
pendiente de revisión por el `Administrador de Odoo`; no habilita una conexión.

Capacidades iniciales:

- buscar productos;
- resolver producto por ID externo;
- obtener precio vigente;
- obtener stock por local;
- conocer fecha de actualización;
- comprobar si una recepción está confirmada.

## Restricciones de datos

- Credencial técnica de solo lectura.
- Vistas o endpoints con campos permitidos.
- Ningún SQL proveniente del modelo.
- Límite de resultados y timeout.
- No exponer costos, márgenes o proveedores si no son necesarios.
- Toda respuesta incluye fuente y timestamp.
- Todo uso publicable queda como snapshot.
- Consultas en staging usan fixtures o datos anonimizados.

## Frescura

Política aprobada por el negocio el 2026-07-29:

- un dato sin timestamp no es publicable;
- precio tiene vigencia máxima de 15 minutos;
- stock tiene vigencia máxima de 5 minutos;
- un dato vencido bloquea aprobación o publicación;
- precio y stock se vuelven a consultar antes de publicar;
- una discrepancia posterior a aprobación vuelve la pieza a revisión.

## Prevención de prompt injection

- Documentos se tratan como datos, no instrucciones.
- Herramientas no aceptan IDs de organización desde el modelo.
- Se filtran campos y tamaños.
- Las fuentes no pueden cambiar política, permisos ni estado.
- El sistema registra qué fragmentos sustentaron el brief.
- Fuentes externas no aprobadas no se mezclan con conocimiento de marca.
