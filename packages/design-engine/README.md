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

## API pública (`P1-T02`)

El paquete no tiene dependencias de ejecución: no importa React, Playwright,
NestJS, Next.js, disco ni red. Todo lo que exporta es dato o contrato.

| Módulo | Responsabilidad | Exporta |
|---|---|---|
| `contracts/document` | Documento de diseño versionado | `DesignDocument`, `DesignContent`, `MediaAsset`, `AssetReference`, `DESIGN_SCHEMA_VERSION` |
| `contracts/errors` | Fallos por etapa | `DesignFailure`, `DesignEngineError` |
| `contracts/render` | Puerto de render y resultado | `DesignRenderer`, `RenderRequest`, `RenderResult` |
| `formats` | Dimensiones y zonas seguras canónicas | `FORMATS`, `formatFor`, `hasCircularSafeArea` |
| `themes` | Identidad de temas | `THEME_DESCRIPTORS`, `DEFAULT_THEME_ID` |
| `registry` | Layouts e iconos semánticos | `LAYOUT_SPECS`, `layoutSpecFor`, `ICON_NAMES` |
| `validation` | Validación de borde | `parseDesignDocument`, `DesignIssue` |

### Documento de diseño

```ts
import { parseDesignDocument } from "@aramayo/design-engine";

const result = parseDesignDocument({
  content: { title: "Taladros para resolver en el día" },
  format: "feed",
  layout: "producto-destacado",
  media: [
    {
      alt: "Taladro sobre un banco de trabajo",
      reference: { assetId: "stock-herramientas", source: "brand-library" },
    },
  ],
  schemaVersion: 1,
  slug: "producto-destacado-taladros",
  theme: "taller",
});

if (!result.ok) {
  // Cada problema nombra su ruta y su causa, nunca el valor recibido.
  return result.issues;
}
```

Reglas del contrato:

- `schemaVersion` viaja con el documento; un valor distinto se rechaza en lugar
  de interpretarse.
- El documento no transporta caption ni hashtags: ese copy pertenece al
  contrato de contenido de la plataforma.
- Una referencia de activo es un identificador del inventario aprobado o una
  URL HTTPS. Nunca una ruta local ni un nombre de archivo del generador.
- El texto alternativo de cada imagen es obligatorio.
- Un campo que el layout no admite es un error (`field-not-supported`), igual
  que un campo inexistente en el contrato (`unknown-field`).
- Los fallos se discriminan por etapa —contenido, activo, layout, render y
  exportación— para que quien los recibe sepa qué acción tomar.

Los identificadores de layout, tema, formato e icono se conservan en español
porque nombran piezas reales del sistema visual congelado; los campos de
contenido usan el vocabulario en inglés del resto de los contratos de la
plataforma.

Los tokens, las primitivas y los componentes React de cada layout se incorporan
en `P1-T03` y `P1-T04` sobre estos mismos identificadores.

## Línea base congelada (`P1-T01`)

`baseline/` es la evidencia contra la que se comparará la migración:

| Ruta | Contenido |
|---|---|
| `baseline/manifest.json` | Snapshot del generador, inventario y hashes de todo lo congelado |
| `baseline/INVENTORY.md` | Lectura humana del inventario y de la cobertura |
| `baseline/fixtures/` | Una pieza por layout en uso, más los casos borde |
| `baseline/references/` | PNG exportados desde el generador, a escala 1 |

La línea base son datos, no código: nada de `baseline/` puede importarse desde
el motor migrado.

### Regenerar y verificar

```bash
pnpm baseline:freeze   # requiere el checkout del generador
pnpm baseline:verify   # sólo necesita este repositorio
```

`freeze` copia el generador a un directorio descartable, deja únicamente los
fixtures congelados y ejecuta allí `EXPORT_SCALE=1 npm run export`. El
repositorio fuente nunca se modifica. `verify` recalcula hashes y comprueba que
cada PNG tenga las dimensiones que declara su formato; corre en el pipeline sin
necesidad del generador.

### Comportamientos observados en los casos borde

La línea base documenta cómo se comporta hoy el generador, no cómo debería
comportarse:

- `borde-texto-largo`: el título desborda el canvas y empuja subtítulo y CTA
  fuera de la pieza, sin diagnóstico. `P1-T04` debe reemplazar esto por una
  regla explícita o por un error.
- `borde-sin-foto`: la pieza resuelve con un marcador visible; no queda un hueco
  ambiguo.
- `borde-foto-panoramica`: una foto con proporción extrema se resuelve con
  `contain` dentro del marco.

### Propiedad de los activos

Las 38 imágenes inventariadas son propias de Ferretería y Lubricentro Aramayo;
la confirmación quedó registrada activo por activo, con fecha, en
[`tools/design-baseline/asset-ownership.ts`](../../tools/design-baseline/asset-ownership.ts).

Un activo que se agregue al generador y no figure en esa lista vuelve a
aparecer como `por-confirmar`: `P1-T03` no debe migrarlo sin revisarlo.
