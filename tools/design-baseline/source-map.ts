/**
 * Mapa canónico del sistema visual vigente.
 *
 * Refleja `docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md`. Cada entrada se
 * verifica contra el checkout fuente al congelar la línea base: si un archivo
 * desaparece o se renombra, el congelamiento falla en lugar de producir un
 * inventario incompleto.
 */

export interface CanonicalEntry {
  readonly path: string;
  readonly responsibility: string;
}

export const canonicalEntries: readonly CanonicalEntry[] = Object.freeze([
  { path: "src/index.css", responsibility: "Colores y familias tipográficas" },
  { path: "src/main.tsx", responsibility: "Pesos de fuentes cargados" },
  { path: "package.json", responsibility: "Dependencias de fuentes e iconos" },
  { path: "src/theme.ts", responsibility: "Temas visuales" },
  { path: "src/brand.ts", responsibility: "Datos operativos de marca" },
  { path: "src/formats.ts", responsibility: "Formatos y safe zones" },
  {
    path: "src/layouts/kit.tsx",
    responsibility: "Escala tipográfica y composición base",
  },
  {
    path: "src/layouts/index.tsx",
    responsibility: "Registro y layouts principales",
  },
  {
    path: "src/layouts/dailyStories.tsx",
    responsibility: "Historias recurrentes",
  },
  { path: "src/layouts/launchCarousels.tsx", responsibility: "Carruseles" },
  {
    path: "src/layouts/storySeries.tsx",
    responsibility: "Series de historias",
  },
  { path: "src/components/Photo.tsx", responsibility: "Primitiva de foto" },
  { path: "src/components/Logo.tsx", responsibility: "Primitiva de logo" },
  { path: "src/components/Icon.tsx", responsibility: "Adaptador de iconos" },
  { path: "src/components/Card.tsx", responsibility: "Canvas exportable" },
  {
    path: "src/components/ScaledPreview.tsx",
    responsibility: "Preview escalado del editor",
  },
  { path: "src/domain/post.ts", responsibility: "Contrato de pieza" },
  { path: "src/domain/postSchema.ts", responsibility: "Validación" },
  { path: "src/domain/postSerialization.ts", responsibility: "Serialización" },
  { path: "scripts/export.mts", responsibility: "Exportación PNG" },
]);

/**
 * Carpetas del repositorio fuente que nunca son la implementación canónica.
 * Se registran explícitamente para que el inventario deje constancia de su
 * clasificación.
 */
export const nonCanonicalPaths: readonly CanonicalEntry[] = Object.freeze([
  {
    path: "output",
    responsibility: "Salidas exportadas; sólo pueden usarse como referencia",
  },
  { path: "dist", responsibility: "Build generado; no se migra" },
  {
    path: "Diseño system ferretería y lubricentro",
    responsibility: "Material histórico de consulta; no es el motor activo",
  },
]);
