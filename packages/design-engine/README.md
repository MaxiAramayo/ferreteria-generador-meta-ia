# Design Engine

Destino code-native del motor visual existente.

El mapa exacto del repositorio fuente está en
[`../../docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md`](../../docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md).
La decisión arquitectónica está en
[`../../docs/architecture/decisions/ADR-005-CODE-NATIVE-DESIGN-MIGRATION.md`](../../docs/architecture/decisions/ADR-005-CODE-NATIVE-DESIGN-MIGRATION.md).

La migración se realizará en Fase 1 después de:

1. consolidar un punto estable del repositorio original;
2. capturar fixtures y renders de referencia;
3. definir la API pública del paquete;
4. probar paridad visual.

El destino debe contener:

- tokens de color, tipografía, espaciado, radios y escala como variables tipadas;
- temas, formatos y safe zones como registros exhaustivos;
- `Photo`, `Icon`, `Logo`, `Canvas` y CTA como primitivas compartidas;
- layouts como componentes React;
- un registro tipado y documentos de entrada validados.

No copiar archivos manualmente sin ejecutar `P1-T01`. No usar PNG, HTML
exportado ni el repositorio anterior como implementación o dependencia de
runtime.
