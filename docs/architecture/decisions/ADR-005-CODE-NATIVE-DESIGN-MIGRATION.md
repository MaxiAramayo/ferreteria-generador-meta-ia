# ADR-005: migración code-native del sistema visual

- Estado: aceptado
- Fecha: 2026-07-24

## Contexto

El generador vigente distribuye el diseño entre CSS, variables TypeScript,
componentes React, layouts, Markdown, activos y PNG exportados. También existe
una carpeta histórica llamada `Diseño system ferretería y lubricentro`, pero no
representa por sí sola la implementación completa.

Copiar capturas, HTML exportado o todo el repositorio anterior produciría un
motor difícil de mantener y mantendría dependencias no deseadas.

## Decisión

El sistema se migrará como código nativo dentro de `packages/design-engine`:

- tokens como objetos TypeScript tipados e inmutables;
- bindings CSS derivados o verificados contra esos tokens;
- temas y formatos como registros exhaustivos;
- safe zones como datos, no números duplicados en componentes;
- primitivas compartidas para foto, icono, logo, canvas y CTA;
- layouts como componentes React tipados;
- documentos de entrada validados y versionados;
- registro explícito de layouts;
- Playwright limitado a infraestructura de render/export.

El repositorio anterior se usa únicamente para inventario, fixtures, baselines y
comparación. No será dependencia de build ni runtime.

## Fuente canónica

El mapa completo está en
[`../DESIGN-SYSTEM-SOURCE-MAP.md`](../DESIGN-SYSTEM-SOURCE-MAP.md).

`P1-T01` debe fijar el commit o snapshot exacto antes de migrar. Ningún agente
debe asumir que la carpeta histórica, `output/**` o el `HEAD` de un árbol sucio
contienen por sí solos el estado aprobado.

## Consecuencias

- Los diseños serán editables, revisables y testeables como código.
- Un cambio de color, tipografía o formato tendrá un punto canónico.
- Los PNG servirán para regresión visual, no para implementar layouts.
- Migrar requiere más trabajo inicial que copiar archivos, pero elimina
  acoplamiento y deriva visual.
- Las diferencias respecto al generador vigente deberán aprobarse mediante
  evidencia visual.

## Alternativas descartadas

### Copiar la carpeta histórica completa

Descartada porque contiene material de referencia, no todo el motor activo.

### Copiar PNG como plantillas

Descartada porque impide cambiar contenido, validar overflow y mantener
accesibilidad o safe zones.

### Importar el repositorio anterior como dependencia

Descartada porque conserva dos arquitecturas, dificulta despliegue y vuelve
frágil la reproducción.

### Reescribir el diseño desde cero

Descartada porque se perdería la identidad ya validada y no habría baseline de
paridad.
