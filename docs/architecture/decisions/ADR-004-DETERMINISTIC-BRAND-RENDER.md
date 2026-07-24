# ADR-004: composición de marca determinística

- Estado: aceptado
- Fecha: 2026-07-23

## Decisión

OpenAI genera o edita el recurso fotográfico. El motor React compone logo,
tipografía, precio, CTA y zonas seguras.

## Motivos

- Los datos comerciales deben ser exactos.
- La identidad visual necesita resultados repetibles.
- Las variantes deben poder regenerarse sin alterar información aprobada.
- El generador actual ya resuelve formatos y exportación.

## Consecuencias

- Una imagen de IA nunca es la pieza publicable completa.
- Toda salida pasa por validación de dimensiones, decodificación y overflow.
- El motor visual es una dependencia crítica de publicación.
- El motor se migra como tokens, variables, contratos, primitivas y componentes,
  según
  [`ADR-005`](ADR-005-CODE-NATIVE-DESIGN-MIGRATION.md).
