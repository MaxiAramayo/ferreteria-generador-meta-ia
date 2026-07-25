# Stack fijado y matriz de compatibilidad

- Estado: aprobado
- Verificado: 2026-07-24
- Tarea: `P0-T02`

## Versiones canónicas

| Componente | Versión | Restricción verificada | Fuente oficial |
|---|---:|---|---|
| Node.js | `24.18.0` | Línea LTS; satisface Next.js, NestJS, pnpm y Prisma | [Node.js 24.18.0](https://nodejs.org/en/blog/release/v24.18.0) |
| pnpm | `11.17.0` | pnpm 11 requiere Node 22 o superior y soporta Node 24 | [instalación y compatibilidad](https://pnpm.io/installation), [paquete](https://www.npmjs.com/package/pnpm/v/11.17.0) |
| Next.js | `16.2.11` | Node `>=20.9.0`; React 19 admitido | [requisitos](https://nextjs.org/docs/app/getting-started/installation), [paquete](https://www.npmjs.com/package/next/v/16.2.11) |
| React / React DOM | `19.2.8` | Versión estable de la línea 19.2; ambos paquetes quedan alineados | [versiones](https://react.dev/versions), [paquete](https://www.npmjs.com/package/react/v/19.2.8) |
| NestJS | `11.1.28` | Node 20 o superior; paquetes oficiales en la misma versión | [migración a v11](https://docs.nestjs.com/migration-guide), [paquete](https://www.npmjs.com/package/@nestjs/core/v/11.1.28) |
| TypeScript | `5.9.3` | Supera el mínimo de Next.js y Prisma sin adoptar una transición mayor durante el bootstrap | [TypeScript 5.9](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html), [paquete](https://www.npmjs.com/package/typescript/v/5.9.3) |
| Prisma ORM | `7.9.0` | Soporta Node 24 y TypeScript 5.4 o superior | [requisitos](https://www.prisma.io/docs/orm/reference/system-requirements), [paquete](https://www.npmjs.com/package/prisma/v/7.9.0) |

Los peers mínimos asociados quedan fijados en el catálogo: `pg@8.22.0`,
`reflect-metadata@0.2.2` y `rxjs@7.8.2`. Next.js y React se actualizan siempre
como una unidad compatible. Los paquetes `@nestjs/*` se mantienen en la misma
versión exacta.

Las herramientas locales verificadas en `P0-T03` agregan `redis@6.1.0`,
`@types/node@24.13.3` y `@types/pg@8.20.0`. Sólo se instalan en la raíz para
comprobar conectividad y tipos de la infraestructura; no forman contratos de
aplicación.

El bootstrap de aplicaciones (`P0-T05`) incorpora `@types/react@19.2.17` y
`@types/react-dom@19.2.3`, alineados con la línea 19.2 de React fijada arriba.
`pg` y `redis` pasan además a ser dependencias de `packages/process-health`,
que implementa las sondas de readiness compartidas por API y worker.

Las puertas de calidad (`P0-T06`) agregan, sólo en la raíz,
`eslint@10.7.0`, `@eslint/js@10.0.1`, `typescript-eslint@8.65.0`,
`eslint-plugin-react-hooks@7.1.1`, `@next/eslint-plugin-next@16.2.11`,
`globals@17.7.0` y `prettier@3.9.6`. `typescript-eslint@8.65.0` declara soporte
para ESLint 8, 9 y 10 y TypeScript `>=4.8.4 <6.1.0`, compatible con el
`5.9.3` fijado. `@next/eslint-plugin-next` se mantiene en la misma versión que
Next.js. Se elige `eslint@10.7.0` en lugar del último publicado porque la
política de antigüedad mínima de pnpm exige que una versión haya estado
disponible el tiempo suficiente antes de instalarse.

## Forma de fijación

- `.node-version` fija el runtime de desarrollo.
- `package.json#packageManager`, `engines` y `devEngines.runtime` fijan pnpm y
  Node, y permiten que pnpm obtenga el runtime declarado.
- `pnpm-workspace.yaml#catalog` es el único lugar para versiones compartidas.
- `catalogMode: strict` impide agregar una versión diferente a la ya aprobada.
- El lockfile registra la resolución completa y debe instalarse con
  `pnpm install --frozen-lockfile`.
- No se usan `latest`, `next`, `*`, `^` ni `~` para dependencias de aplicación.

El catálogo declara versiones futuras sin instalarlas. Cada aplicación o paquete
las consumirá con `catalog:` sólo cuando una tarea requiera esa dependencia.
Esto permite bloquear compatibilidad en `P0-T02` sin introducir código o
dependencias ociosas antes de `P0-T05`.

## Modelo de compilación y ejecución

| Workspace | Compilación | Ejecución |
|---|---|---|
| `packages/*` | `tsc` a `dist/` con declaraciones | Consumido como JavaScript tipado |
| `apps/api`, `apps/worker` | `tsc` a `dist/` | `node dist/main.js` |
| `apps/web` | `next build` | `next start` o `next dev` |
| `tools/*` | Sin compilación | `node archivo.ts` (type stripping de Node) |

Node 24 ejecuta TypeScript directamente, pero sólo elimina tipos: no soporta
propiedades de parámetro ni `emitDecoratorMetadata`. NestJS depende de ambos
para inyección de dependencias, por lo que API y worker se compilan con `tsc`
antes de ejecutarse. Las herramientas internas, que no usan decoradores,
continúan ejecutándose directamente desde `.ts`.

Los paquetes compartidos importan con extensión `.ts` y emiten `.js` mediante
`rewriteRelativeImportExtensions`, de modo que el código fuente sigue siendo
ejecutable por Node y el artefacto publicado no depende de un bundler.

### Scripts de instalación de terceros

`pnpm-workspace.yaml#allowBuilds` mantiene la instalación libre de scripts de
terceros. `sharp` llega como dependencia de Next.js, distribuye binarios
precompilados por plataforma y queda declarado en `false`. Autorizar un script
nuevo exige revisarlo y registrarlo en esa lista.

## Decisiones de compatibilidad

### Node.js 24 LTS

Node 20 ya está fuera de soporte y Node 26 continúa en canal Current a la fecha
de verificación. Node 24 es la línea LTS compartida por todo el stack. El patch
se fija para reproducibilidad y se cambia mediante una tarea explícita.

### TypeScript 5.9

TypeScript 7 se publicó recientemente y representa una transición mayor del
compilador. El bootstrap adopta `5.9.3`, compatible con todos los frameworks
seleccionados y suficiente para el modo estricto requerido. Subir de major exige
probar build, decoradores de NestJS, generación de Prisma y tipos de React.

### Express como adaptador HTTP inicial

NestJS 11 usa Express 5 por defecto. Se conserva ese adaptador para reducir
decisiones simultáneas; no se agregan rutas con sintaxis obsoleta. Cambiar a
Fastify sólo se justifica con una medición o requisito concreto.

## Procedimiento de actualización

1. Verificar soporte y notas de seguridad en fuentes oficiales.
2. Consultar engines y peer dependencies publicados en el registro.
3. Cambiar una familia coherente por vez en el catálogo.
4. Regenerar el lockfile.
5. Ejecutar instalación congelada, `verify:stack`, typecheck, tests y build
   disponibles.
6. Actualizar fecha, enlaces y ADR afectados.

## Verificación

```bash
pnpm install --frozen-lockfile
pnpm verify:stack
pnpm verify:plan
```

`verify:stack` compara runtime, metadatos y catálogo contra los valores
aprobados. Debe fallar ante cualquier divergencia.
