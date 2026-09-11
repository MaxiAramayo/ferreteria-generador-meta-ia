# Brand Knowledge

Documentos aprobados que describen a Ferretería y Lubricentro Aramayo.

Solo deben ingresar documentos con:

- propietario;
- fuente;
- fecha de vigencia;
- estado de aprobación;
- clasificación de sensibilidad.

No colocar exportaciones de clientes, tokens ni credenciales en esta carpeta.

El inventario y la política que determinan qué fuentes podrían ingresar están
en
[`docs/integrations/KNOWLEDGE-SOURCE-CATALOG.md`](../../docs/integrations/KNOWLEDGE-SOURCE-CATALOG.md).
El perfil TypeScript actual es una referencia heredada y un fixture de
configuración; no se considera una fuente activa para IA hasta que el
responsable de negocio lo revise y apruebe.

## Corpus para IA

[`corpus/`](corpus/) contiene los documentos que pueden activarse y su
manifiesto. El manifiesto es la única fuente de los metadatos de cada uno:
fuente del catálogo, sensibilidad, referencia de aprobación y vigencia. El
worker los carga con `knowledge:corpus`; el procedimiento está en
[`OPENAI.md`](../../docs/integrations/OPENAI.md).

Hoy entran `KN-002` y `KN-004`. `KN-001` espera la revisión del negocio y
`KN-005`, que su versión declare fin de vigencia.
