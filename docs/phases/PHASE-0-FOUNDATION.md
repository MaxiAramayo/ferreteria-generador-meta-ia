# Fase 0 — Fundación y decisiones verificables

## Resultado de la fase

Un monorepo reproducible con web, API y worker iniciables, infraestructura local,
configuración validada, decisiones técnicas registradas y controles de calidad
capaces de impedir cambios inválidos.

## Invariantes

- TypeScript estricto y sin `any`.
- Ningún secreto real se versiona.
- PostgreSQL es la fuente de verdad; Redis no reemplaza estado persistente.
- Las versiones se fijan después de comprobar compatibilidad, no por memoria.
- Web, API y worker tienen límites y responsabilidades explícitos.

## P0-T01 — Crear repositorio y sistema documental

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: Ninguna
- Riesgo: Bajo

### Objetivo

Crear un repositorio independiente cuyo contexto escrito permita a una persona o
IA continuar el proyecto sin depender de conversaciones anteriores.

### Entregables

- Estructura inicial de monorepo.
- `AGENTS.md`, arquitectura, ADR, integraciones, operaciones y plan por fases.
- Contratos de dominio mínimos para publicaciones y briefs.
- Validador del plan.

### Criterios de aceptación

- [x] El repositorio no modifica ni anida la historia Git del generador actual.
- [x] Existe una única fuente de verdad para estado y tareas.
- [x] Todas las fases P0–P7 tienen tareas con dependencias y criterios binarios.
- [x] Las reglas explican cómo iniciar, pausar, bloquear y cerrar una tarea.
- [x] Las integraciones OpenAI, RAG, Meta y datos comerciales tienen límites documentados.
- [x] La estructura separa web, API, worker, dominio, contratos y motor visual.
- [x] El validador documental detecta IDs duplicados, dependencias inexistentes y archivos faltantes.

### Verificación obligatoria

- [x] Ejecutar `pnpm verify:plan` sin errores.
- [x] Ejecutar `git status --short` luego del commit y confirmar árbol limpio.
- [x] Revisar que no existan credenciales ni archivos generados versionados.

### Fuera de alcance

- Instalar el stack de aplicación.
- Conectar servicios externos.
- Migrar el motor visual existente.

### Notas de progreso

- 2026-07-23: estructura y documentación inicial preparadas.

### Evidencia de cierre

- Commit inicial del repositorio y salida exitosa de `pnpm verify:plan`.

## P0-T02 — Resolver y bloquear versiones y decisiones de stack

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T01`
- Riesgo: Medio

### Objetivo

Elegir versiones compatibles y registrar las decisiones que condicionan el
bootstrap antes de instalar dependencias.

### Entregables

- Matriz de compatibilidad de Node, pnpm, Next.js, React, NestJS y TypeScript.
- ADR de ORM/migraciones, autenticación, almacenamiento y despliegue inicial.
- `packageManager`, `engines` y dependencias fijadas sin rangos ambiguos.

### Criterios de aceptación

- [x] Las versiones se verifican contra documentación oficial vigente.
- [x] Node y pnpm quedan fijados mediante archivos y metadatos del repositorio.
- [x] ORM y migraciones tienen una decisión explícita con alternativas descartadas.
- [x] Autenticación y autorización tienen proveedor o estrategia local decidida.
- [x] Cloudinary, PostgreSQL y Redis tienen responsabilidades no superpuestas.
- [x] Cada decisión reversible o costosa queda registrada en ADR.
- [x] No se incorpora una dependencia sin justificar su uso inmediato.

### Verificación obligatoria

- [x] Instalar desde cero con el lockfile y sin advertencias de peer dependencies.
- [x] Ejecutar un script que imprima y valide las versiones esperadas.
- [x] Revisar enlaces y fecha de verificación en cada ADR técnico.

### Fuera de alcance

- Implementar módulos de negocio.
- Crear ambientes remotos.

### Notas de progreso

- 2026-07-24: versiones y peers verificados contra documentación oficial y
  registro; matriz, catálogo, validador y ADR de persistencia, identidad,
  almacenamiento y despliegue preparados.
- 2026-07-24: instalación congelada ejecutada desde una copia temporal sin
  `node_modules`; revisión de rangos, secretos, enlaces y sintaxis completada.

### Evidencia de cierre

- Commit: commit de cierre de `P0-T02`.
- `pnpm install --frozen-lockfile`: instalación limpia de los cinco workspaces,
  sin advertencias de peer dependencies.
- `pnpm verify:stack`: Node `24.18.0`, pnpm `11.17.0`, Next.js `16.2.11`,
  React `19.2.8`, NestJS `11.1.28`, TypeScript `5.9.3` y Prisma `7.9.0`
  validados.
- `pnpm verify:plan`: 66 tareas únicas en ocho fases; plan válido.
- `node --check tools/verify-stack.mjs` y `git diff --check`: sin errores.
- Evidencia remota: enlaces oficiales y dist-tags consultados el 2026-07-24.
- Desviaciones: TypeScript `5.9.3` se mantiene deliberadamente frente a la
  transición mayor reciente de TypeScript 7; justificación en `STACK.md`.

## P0-T03 — Proveer infraestructura local reproducible

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T02`
- Riesgo: Medio

### Objetivo

Permitir ejecutar PostgreSQL y Redis localmente con configuración segura,
persistencia controlada y comprobaciones de salud.

### Entregables

- Definición de contenedores locales.
- Scripts de inicio, parada, limpieza segura y healthcheck.
- Variables de ejemplo documentadas.

### Criterios de aceptación

- [x] Un entorno nuevo inicia la infraestructura con un único comando documentado.
- [x] PostgreSQL conserva datos al reiniciar y usa una base exclusiva del proyecto.
- [x] Redis expone healthcheck y no es accesible públicamente por defecto.
- [x] Los puertos pueden configurarse sin editar archivos versionados.
- [x] La limpieza de volúmenes requiere un comando explícito y advertido.
- [x] Ninguna contraseña real aparece en Git o logs de CI.

### Verificación obligatoria

- [x] Iniciar, detener y reiniciar los servicios.
- [x] Confirmar conectividad desde un proceso local.
- [x] Ejecutar el procedimiento de limpieza únicamente sobre recursos del proyecto.

### Fuera de alcance

- Alta disponibilidad o infraestructura de producción.
- Esquema de negocio.

### Notas de progreso

- 2026-07-24: alcance definido para PostgreSQL 17.9 y Redis 8.2.7 en
  contenedores oficiales fijados por digest. Se preparan comandos tipados,
  healthchecks, conectividad desde Node y limpieza limitada al proyecto Compose.
- 2026-07-24: integración verificada con creación, `down/up`, reinicio,
  persistencia de marcadores y conexiones autenticadas desde Node.
- 2026-07-24: puertos alternativos `55432` y `56379` verificados desde `.env`;
  confirmación negativa y limpieza efectiva ejecutadas. No quedaron recursos
  Docker ni credenciales de prueba.

### Evidencia de cierre

- Commit: commit de cierre de `P0-T03`.
- `pnpm infra:config` y `pnpm infra:up`: configuración válida; PostgreSQL y
  Redis saludables y conectables en loopback.
- Persistencia: marcador PostgreSQL y clave Redis conservaron `persisted`
  después de `infra:down` y un nuevo `infra:up`.
- `pnpm infra:restart` y `pnpm infra:health`: ambos servicios saludables;
  conexiones autenticadas confirmadas.
- Puertos: PostgreSQL `55432` y Redis `56379` publicados únicamente en
  `127.0.0.1` y comprobados desde el proceso Node local.
- `pnpm infra:clean` sin confirmación: rechazado antes de invocar Docker.
- `pnpm infra:clean --confirm aramayo-content-platform-local`: contenedores,
  red y ambos volúmenes eliminados; filtros por label sin recursos restantes.
- `pnpm infra:typecheck`: sin errores.
- `pnpm infra:test`: siete pruebas aprobadas.
- `pnpm install --frozen-lockfile`, `pnpm verify:stack` y
  `pnpm verify:plan`: aprobados.
- Desviaciones: ninguna.

## P0-T04 — Validar configuración y secretos en los límites

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T02`
- Riesgo: Alto

### Objetivo

Rechazar configuraciones incompletas o inválidas al arrancar y evitar que
credenciales lleguen al cliente, logs o repositorio.

### Entregables

- Esquemas tipados de entorno para web, API y worker.
- Matriz de variables por ambiente.
- Política de rotación y almacenamiento de secretos.

### Criterios de aceptación

- [x] Cada proceso valida sus variables antes de aceptar tráfico o trabajos.
- [x] Variables públicas y privadas están separadas por contrato.
- [x] Los errores indican el nombre de la variable sin revelar su contenido.
- [x] `.env.example` cubre todas las claves y no contiene secretos válidos.
- [x] Tokens de Meta y claves de OpenAI nunca se exponen al navegador.
- [x] Existe una estrategia documentada para cifrado en reposo y rotación.

### Verificación obligatoria

- [x] Probar arranque correcto con configuración válida.
- [x] Probar fallo intencional por variable ausente, formato inválido y secreto vacío.
- [x] Buscar patrones de secretos en archivos rastreados.

### Fuera de alcance

- Cargar credenciales reales.
- Implementar OAuth de Meta.

### Notas de progreso

- 2026-07-24: se creó `packages/configuration` con contratos independientes para
  web, API y worker, valores secretos redactables y grupos opcionales que
  rechazan configuraciones parciales.
- 2026-07-24: se definieron la matriz por proceso y ambiente, el keyring
  versionado y la política de cifrado AES-256-GCM y rotación de tokens Meta.
- 2026-07-24: la integración con los bootstrap reales queda explícitamente en
  `P0-T05`; los parsers ya modelan el límite que debe ejecutarse antes de
  `listen()` o de iniciar consumidores.

### Evidencia de cierre

- Commit: commit de cierre de `P0-T04`.
- `pnpm install --frozen-lockfile`: seis workspaces instalados desde el lockfile.
- `pnpm config:typecheck`: sin errores con TypeScript estricto.
- `pnpm config:test`: ocho pruebas aprobadas para configuración válida,
  faltante, formato inválido, secreto vacío, grupos parciales, contrato público,
  redacción y `.env.example`.
- `pnpm infra:typecheck` y `pnpm infra:test`: sin regresiones; siete pruebas
  aprobadas.
- `pnpm verify:stack` y `pnpm verify:plan`: versiones fijadas y 66 tareas
  válidas.
- Búsqueda con `rg` de claves OpenAI, tokens Meta, private keys y URLs
  Cloudinary en archivos del repositorio: sin coincidencias.
- Desviaciones: las credenciales externas permanecen ausentes y las
  integraciones se representan como deshabilitadas; configurarlas parcialmente
  detiene el proceso.

## P0-T05 — Inicializar web, API y worker

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T02`, `P0-T03`, `P0-T04`
- Riesgo: Medio

### Objetivo

Crear aplicaciones mínimas, iniciables y observables sin introducir aún lógica
de publicación.

### Entregables

- Next.js para el panel.
- NestJS para API y worker.
- Endpoints de salud y scripts raíz de desarrollo/build.

### Criterios de aceptación

- [x] `pnpm dev` inicia los procesos requeridos o documenta comandos equivalentes.
- [x] Web muestra un estado inicial accesible y sin secretos serializados.
- [x] API expone health y readiness diferenciados.
- [x] Worker arranca, valida configuración y reporta estado sin procesar tareas falsas.
- [x] Las aplicaciones importan contratos compartidos sin dependencias circulares.
- [x] Los controladores permanecen delgados y no contienen reglas de dominio.

### Verificación obligatoria

- [x] Ejecutar build, typecheck y smoke test de cada aplicación.
- [x] Confirmar fallo de readiness cuando PostgreSQL o Redis no están disponibles.
- [x] Inspeccionar el bundle del cliente para descartar secretos.

### Fuera de alcance

- Autenticación completa.
- Persistencia de publicaciones.

### Notas de progreso

- 2026-07-25: se crearon el panel Next.js 16, la API NestJS con liveness y
  readiness diferenciados, y el worker NestJS standalone que reporta estado sin
  procesar trabajo simulado. Los tres validan configuración antes de aceptar
  tráfico o trabajo.
- 2026-07-25: los paquetes compartidos pasan a emitir `dist/` con declaraciones.
  Node 24 ejecuta TypeScript pero no soporta propiedades de parámetro ni
  `emitDecoratorMetadata`, que NestJS necesita para inyección de dependencias.
- 2026-07-25: se agregó `packages/process-health` con las sondas de PostgreSQL y
  Redis compartidas por API y worker; decisión registrada en `ADR-010`.
- 2026-07-25: se agregó `tools/smoke` con escenarios de arranque, salud, cierre
  ordenado y ausencia de secretos en el bundle del cliente.

### Evidencia de cierre

- Commit: commit de cierre de `P0-T05`.
- `pnpm install --frozen-lockfile`: diez workspaces desde el lockfile, sin
  advertencias de peer dependencies.
- `pnpm typecheck`: seis workspaces más herramientas de infraestructura y smoke,
  sin errores con TypeScript estricto.
- `pnpm test`: 26 pruebas aprobadas (contratos 3, configuración 8,
  process-health 4, infraestructura local 7, smoke 4).
- `pnpm build`: paquetes compartidos, API, worker y panel compilados.
- `pnpm smoke`: doce comprobaciones aprobadas sobre procesos reales (API 5,
  panel 4, worker 3), con entorno construido y valores falsos como sonda.
- Readiness negativa: `GET /ready` responde 503 con PostgreSQL y Redis
  inalcanzables. Con infraestructura real, detener el contenedor de Redis
  produjo `postgres:up,redis:down` y 503; reiniciarlo devolvió 200.
- Readiness positiva: con `pnpm infra:up`, `GET /health` y `GET /ready`
  respondieron 200 y el worker registró
  `worker.ready estado=ready dependencias=postgres:up,redis:up`.
- `pnpm dev`: panel en `:3000` (HTTP 200), API en `:3001` con `/health` y
  `/ready` en 200, y worker reportando estado en paralelo.
- Bundle del cliente: escaneo de `.next/static` compilado con secretos falsos en
  el entorno, sin coincidencias; el HTML servido tampoco contiene la contraseña
  de PostgreSQL.
- Contrato público: una variable `NEXT_PUBLIC_` no declarada impide servir el
  panel (HTTP 500) y el registro nombra la variable sin su valor.
- `pnpm verify:stack` y `pnpm verify:plan`: versiones fijadas y 66 tareas
  válidas.
- Búsqueda de patrones de secretos en archivos rastreados: sin coincidencias.
- Desviaciones:
  - `packages/process-health` es un límite nuevo respecto de la estructura
    original; justificado y registrado en `ADR-010`.
  - `apps/web` usa `tools/run-with-env.mjs` para cargar el `.env` de la raíz:
    Next.js propaga los `execArgv` del proceso padre por `NODE_OPTIONS`, donde
    `--env-file-if-exists` está prohibido. API y worker usan el mismo mecanismo
    por uniformidad.
  - `sharp`, dependencia de Next.js, queda declarado en `allowBuilds: false`
    para no ejecutar scripts de instalación de terceros.
  - `lint` y el pipeline de integración continua permanecen fuera de alcance y
    pertenecen a `P0-T06`.

## P0-T06 — Establecer controles de calidad y CI

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T05`
- Riesgo: Medio

### Objetivo

Hacer que tipos, formato, lint, tests, build y documentación sean condiciones de
integración, no comprobaciones opcionales.

### Entregables

- Scripts raíz uniformes.
- Pipeline de integración continua.
- Convención para tests y cobertura por riesgo.

### Criterios de aceptación

- [x] `lint`, `typecheck`, `test`, `build` y `verify:plan` funcionan desde la raíz.
- [x] CI usa instalación congelada del lockfile.
- [x] Un error en cualquier workspace hace fallar el pipeline.
- [x] Los resultados indican qué aplicación o paquete falló.
- [x] Cachés no pueden ocultar un fallo reproducible.
- [x] Se documenta qué pruebas son obligatorias para cada tipo de cambio.

### Verificación obligatoria

- [x] Ejecutar el pipeline local equivalente.
- [x] Introducir temporalmente un error tipado y confirmar que CI lo detectaría.
- [x] Ejecutar desde un checkout limpio.

### Fuera de alcance

- Despliegue a producción.
- Metas rígidas de cobertura global.

### Notas de progreso

- 2026-07-25: se agregaron ESLint 10 con análisis basado en tipos para todo el
  monorepo, Prettier para archivos de código y el script raíz `pnpm verify`, que
  ejecuta la misma secuencia que integración continua.
- 2026-07-25: el `build` se ejecuta antes de `lint` y `typecheck` porque los
  paquetes compartidos publican sus tipos desde `dist/`; sin compilarlos, el
  análisis con tipos degrada cada import entre workspaces a `any`. El orden se
  detectó ejecutando el pipeline en un checkout limpio.
- 2026-07-25: las reglas agregadas sobre el preset estricto codifican
  invariantes del manual: `no-explicit-any`, tipos de retorno explícitos,
  `switch-exhaustiveness-check` y `no-console`.

### Evidencia de cierre

- Commit: commit de cierre de `P0-T06`.
- `pnpm verify` local: ocho pasos aprobados en orden (`verify:stack`,
  `verify:plan`, `format:check`, `build`, `lint`, `typecheck`, `test`, `smoke`).
- Checkout limpio: clon del repositorio en un directorio nuevo, sin `.env`, sin
  `node_modules` y sin artefactos; `pnpm install --frozen-lockfile` seguido de
  `pnpm verify` completó los ocho pasos, incluidas 26 pruebas y las doce
  comprobaciones de smoke.
- Error tipado introducido a propósito en `apps/api`: el pipeline falló con
  `apps/api typecheck: src/health/health.controller.ts(24,5): error TS2322` y
  `apps/api typecheck: Failed`, identificando el workspace responsable.
- `any` introducido a propósito: `pnpm lint` falló con
  `@typescript-eslint/no-explicit-any` y `@typescript-eslint/no-unsafe-return`.
  Ambos casos se revirtieron y el pipeline volvió a quedar en verde.
- Defecto real detectado por las nuevas puertas: `packages/domain/src/index.ts`
  reexportaba sin extensión explícita y fallaba con `TS2835`; se corrigió en
  esta tarea.
- CI: [`ci.yml`](../../.github/workflows/ci.yml) ejecuta los mismos pasos en
  `push` a `main`, en cada pull request y a demanda, con
  `pnpm install --frozen-lockfile`, Node tomado de `.node-version` y caché
  limitada al store de pnpm invalidado por el lockfile.
- Ejecución real del workflow: corrida `30159029873` sobre `main`, job
  «Calidad y build» aprobado en 5 m 55 s con los trece pasos en verde, incluido
  el smoke de los tres procesos.
- Documentación: `docs/operations/TESTING.md` incorpora la tabla de pruebas
  obligatorias por tipo de cambio y la descripción del pipeline.
- Desviaciones:
  - Prettier se aplica sólo a archivos de código; la documentación conserva sus
    saltos de línea deliberados y queda excluida en `.prettierignore`.
  - Se fija `eslint@10.7.0` en lugar de la última publicada porque la política
    de antigüedad mínima de pnpm bloquea versiones recién liberadas.
  - Esta tarea incluye un formateo mecánico de todo el código existente; no
    modifica comportamiento y quedó cubierto por el pipeline completo.

## P0-T07 — Definir identidad, ambientes y topología de despliegue

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P0-T02`, `P0-T06`
- Riesgo: Alto

### Objetivo

Cerrar las decisiones que condicionan autenticación, URLs, callbacks, redes,
secretos y separación entre staging y producción.

### Entregables

- ADR de identidad y roles iniciales.
- Diagrama de topología por ambiente.
- Matriz de dominios, callbacks, secretos y propietarios.

### Criterios de aceptación

- [ ] Staging y producción usan bases, colas, buckets y credenciales separados.
- [ ] Los roles mínimos `admin`, `editor` y `approver` están definidos.
- [ ] Se documentan URLs públicas necesarias para Meta y Cloudinary.
- [ ] API y worker no quedan expuestos más allá de lo necesario.
- [ ] Cada secreto tiene propietario, ubicación y procedimiento de rotación.
- [ ] La estrategia permite revocar acceso de una persona sin rotar todo el sistema.

### Verificación obligatoria

- [ ] Revisar el diagrama contra los requisitos de OpenAI, Meta y Cloudinary.
- [ ] Simular alta, baja y cambio de rol de un usuario.
- [ ] Obtener aprobación explícita de las decisiones con costo operativo.

### Fuera de alcance

- Provisionar producción.
- Someter la aplicación a revisión de Meta.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 0

- [ ] `P0-T01` a `P0-T07` están completas.
- [ ] Un checkout limpio instala, valida, prueba y compila.
- [ ] Web, API, worker, PostgreSQL y Redis tienen healthchecks verificables.
- [ ] Stack, identidad, secretos y despliegue tienen decisiones registradas.
- [ ] No existen bloqueos técnicos ocultos para iniciar la migración visual.
