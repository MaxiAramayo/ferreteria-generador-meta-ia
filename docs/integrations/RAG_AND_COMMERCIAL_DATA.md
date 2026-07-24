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

## Capa comercial

Precio, stock, SKU, disponibilidad y recepción se consultan mediante
`CommercialCatalogPort`.

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

La política inicial se definirá con responsables comerciales. Hasta entonces:

- un dato sin timestamp no es publicable;
- un dato vencido bloquea aprobación;
- precio y stock se vuelven a consultar antes de publicar;
- una discrepancia posterior a aprobación vuelve la pieza a revisión.

## Prevención de prompt injection

- Documentos se tratan como datos, no instrucciones.
- Herramientas no aceptan IDs de organización desde el modelo.
- Se filtran campos y tamaños.
- Las fuentes no pueden cambiar política, permisos ni estado.
- El sistema registra qué fragmentos sustentaron el brief.
- Fuentes externas no aprobadas no se mezclan con conocimiento de marca.
