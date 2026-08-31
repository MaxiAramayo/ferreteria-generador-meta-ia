# Mapa de origen del sistema visual

## Propósito

Este documento identifica exactamente dónde vive el sistema visual vigente y
cómo debe migrarse a `packages/design-engine`. Evita confundir una carpeta de
referencia, un PNG exportado o un post de ejemplo con la implementación
canónica.

La decisión de migración como código está registrada en
[`decisions/ADR-005-CODE-NATIVE-DESIGN-MIGRATION.md`](decisions/ADR-005-CODE-NATIVE-DESIGN-MIGRATION.md).

## Repositorio fuente

- Repositorio: `ferreteria-aramayo-image-generator`.
- Checkout hermano esperado desde la raíz de este repositorio:
  `../ferreteria-aramayo-image-generator`.
- Destino: `packages/design-engine`.
- Dependencia en runtime: prohibida.

La ruta local es una ayuda de desarrollo, no una dependencia portable. Antes de
migrar, `P1-T01` debe registrar un commit o snapshot fuente reproducible. No
asumir que `HEAD` representa el diseño completo sin confirmar que el árbol de
trabajo fuente esté limpio.

## Línea base congelada

`P1-T01` dejó la evidencia en
[`packages/design-engine/baseline/`](../../packages/design-engine/baseline/):
snapshot del generador, inventario, fixtures y PNG de referencia.

```bash
pnpm baseline:freeze   # vuelve a congelar desde el checkout del generador
pnpm baseline:verify   # comprueba hashes y dimensiones sin el generador
```

El congelamiento trabaja sobre una copia descartable del generador: el
repositorio fuente no se modifica ni se ejecuta desde este monorepo.

## Mapa canónico

Todas las rutas de esta sección son relativas al repositorio fuente.

| Responsabilidad | Fuente vigente | Tratamiento en la migración |
|---|---|---|
| Colores y familias tipográficas | `src/index.css` | Convertir a tokens tipados y bindings CSS |
| Pesos de fuentes cargados | `src/main.tsx`, `package.json` | Registrar familias, pesos, licencia y carga |
| Temas visuales | `src/theme.ts` | Convertir a `THEMES` y `themeFor` tipados |
| Datos operativos de marca | `src/brand.ts` | Separar identidad visual de datos comerciales mutables |
| Formatos y safe zones | `src/formats.ts` | Convertir a `FORMATS` tipado y único |
| Escala tipográfica y composición base | `src/layouts/kit.tsx` | Convertir a tokens y primitivas reutilizables |
| Registro y layouts principales | `src/layouts/index.tsx` | Migrar como componentes React registrados |
| Historias recurrentes | `src/layouts/dailyStories.tsx` | Migrar como layouts React tipados |
| Carruseles | `src/layouts/launchCarousels.tsx` | Migrar como layouts/series React tipados |
| Series de historias | `src/layouts/storySeries.tsx` | Migrar como layouts React tipados |
| Foto | `src/components/Photo.tsx` | Migrar como primitiva con validación y error explícito |
| Logo | `src/components/Logo.tsx` | Migrar como primitiva y registro de variantes |
| Iconos | `src/components/Icon.tsx` | Migrar como adaptador Lucide por nombre semántico |
| Canvas exportable | `src/components/Card.tsx` | Migrar conservando el límite `[data-card]` |
| Preview escalado | `src/components/ScaledPreview.tsx` | Usar como referencia del editor, no del dominio |
| Contrato de pieza | `src/domain/post.ts` | Traducir a contrato versionado del nuevo motor |
| Validación | `src/domain/postSchema.ts` | Recrear como validadores de borde estrictos |
| Serialización | `src/domain/postSerialization.ts` | Conservar compatibilidad mediante fixtures, no acoplamiento |
| Configuraciones de piezas | `posts/**` | Usar como fixtures de entrada y cobertura |
| Exportación PNG | `scripts/export.mts` | Reimplementar en el worker mediante Playwright |

## Activos

| Tipo | Fuente vigente | Tratamiento |
|---|---|---|
| Logos y fotos institucionales | `public/media/brand/**` | Inventariar, verificar derechos, hash y variante |
| Fotos de producto y stock | `public/media/**` | Usar solo si tienen origen y permiso documentados |
| Fuentes | dependencias `@fontsource/*` | Verificar familia, pesos y licencia antes de copiar |
| Iconos | `lucide-react` | Mantener referencia semántica, no copiar SVG arbitrarios |

No todos los archivos dentro de `public/media/**` son automáticamente activos
aprobados. La inclusión en el repositorio fuente no reemplaza el inventario de
licencias y ownership de `P1-T01`.

## Referencias que no son la implementación canónica

### Carpeta de referencia histórica

`Diseño system ferretería y lubricentro/` contiene un HTML, imágenes y contexto
histórico. Es material de consulta. No contiene por sí sola todo el motor activo
y no debe copiarse como paquete de producción.

### Salidas generadas

- `output/**`: PNG y metadatos exportados.
- `dist/**`: build generado.

Estas carpetas no se migran como código. Una selección aprobada de `output/**`
puede copiarse a fixtures de regresión visual con hash, tamaño, post fuente y
commit de origen.

## Forma obligatoria del destino

El sistema migrado debe quedar expresado mediante módulos versionables:

```text
packages/design-engine/src/
  contracts/        Documentos y resultados tipados
  tokens/           Color, tipografía, espaciado, radios y escala
  themes/           Temas y resolución de variantes
  formats/          Dimensiones y safe zones
  primitives/       Canvas, Photo, Icon, Logo y CTA
  layouts/          Componentes React por familia de pieza
  registry/         Registro tipado de layouts
  render/           Contrato de render; infraestructura fuera del dominio
```

Los nombres concretos pueden ajustarse en `P1-T02`, pero estas responsabilidades
no deben mezclarse.

## Representación como variables y componentes

- `COLORS`, `TYPOGRAPHY`, `SPACING`, `RADII`, `TYPE_SCALE`, `THEMES` y
  `FORMATS` deben ser objetos tipados e inmutables.
- Los valores visuales tienen una única fuente canónica.
- Si React necesita custom properties, se derivan desde los tokens o se valida
  su paridad automáticamente; no se mantienen dos paletas manuales.
- `themeFor`, `formatFor` y el registro de layouts son funciones o mapas
  exhaustivos y tipados.
- Cada layout es un componente React que recibe un documento validado.
- Fotos, iconos y logos se resuelven mediante primitivas compartidas.
- Los layouts no leen Markdown, disco, variables de entorno ni SDK externos.
- Un PNG es una salida o fixture, nunca la definición editable del diseño.
- Un HTML exportado es una referencia, nunca el código fuente del motor nuevo.

Ejemplo conceptual:

```ts
export const COLORS = {
  ink: "#1c1a19",
  paper: "#f6f1ea",
  ferreteria: "#e63b1e",
  lubricentro: "#ffb200",
  action: "#b62a12",
} as const;

export const FORMATS = {
  feed: {
    width: 1080,
    height: 1350,
    safe: { top: 72, right: 72, bottom: 72, left: 72 },
  },
} as const;
```

El ejemplo comunica la forma, no autoriza a copiar valores sin ejecutar el
inventario y la comparación de `P1-T01`.

## Estado de la migración

| Pieza | Estado |
|---|---|
| Inventario, fixtures y referencias | Congelados en `P1-T01` |
| Contratos, formatos y registro de layouts | Migrados en `P1-T02` |
| Tokens, temas, primitivas y activos | Migrados en `P1-T03` |
| Layouts y zonas seguras por pieza | Pendientes de `P1-T04` |
| Render y exportación PNG | Pendientes de `P1-T05` |
| Paridad visual aprobada | Pendiente de `P1-T06` |

## Procedimiento de migración

1. Verificar que el checkout fuente sea reproducible.
2. Registrar `source_repository`, `source_commit` y estado del árbol.
3. Inventariar archivos canónicos, activos y layouts.
4. Elegir fixtures representativos desde `posts/**`.
5. Exportar baselines desde el generador fuente.
6. Definir contratos del nuevo paquete.
7. Recrear tokens y formatos como variables tipadas.
8. Recrear primitivas y layouts como componentes.
9. Renderizar los mismos fixtures en ambos motores.
10. Aprobar diferencias o corregirlas.
11. Eliminar cualquier dependencia de runtime con el repositorio fuente.

## Prohibiciones

- No copiar `output/**` y presentarlo como motor migrado.
- No importar módulos mediante rutas que salgan del nuevo monorepo.
- No ejecutar el repositorio fuente en producción.
- No conservar valores mágicos repetidos dentro de layouts.
- No duplicar formatos o safe zones por componente.
- No usar la carpeta histórica de diseño como única fuente.
- No cerrar Fase 1 sin paridad visual y evidencia reproducible.
