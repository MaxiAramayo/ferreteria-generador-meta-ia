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

- [ ] Tarea completada
- Estado: PENDIENTE
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

- [ ] Las versiones se verifican contra documentación oficial vigente.
- [ ] Node y pnpm quedan fijados mediante archivos y metadatos del repositorio.
- [ ] ORM y migraciones tienen una decisión explícita con alternativas descartadas.
- [ ] Autenticación y autorización tienen proveedor o estrategia local decidida.
- [ ] Cloudinary, PostgreSQL y Redis tienen responsabilidades no superpuestas.
- [ ] Cada decisión reversible o costosa queda registrada en ADR.
- [ ] No se incorpora una dependencia sin justificar su uso inmediato.

### Verificación obligatoria

- [ ] Instalar desde cero con el lockfile y sin advertencias de peer dependencies.
- [ ] Ejecutar un script que imprima y valide las versiones esperadas.
- [ ] Revisar enlaces y fecha de verificación en cada ADR técnico.

### Fuera de alcance

- Implementar módulos de negocio.
- Crear ambientes remotos.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P0-T03 — Proveer infraestructura local reproducible

- [ ] Tarea completada
- Estado: PENDIENTE
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

- [ ] Un entorno nuevo inicia la infraestructura con un único comando documentado.
- [ ] PostgreSQL conserva datos al reiniciar y usa una base exclusiva del proyecto.
- [ ] Redis expone healthcheck y no es accesible públicamente por defecto.
- [ ] Los puertos pueden configurarse sin editar archivos versionados.
- [ ] La limpieza de volúmenes requiere un comando explícito y advertido.
- [ ] Ninguna contraseña real aparece en Git o logs de CI.

### Verificación obligatoria

- [ ] Iniciar, detener y reiniciar los servicios.
- [ ] Confirmar conectividad desde un proceso local.
- [ ] Ejecutar el procedimiento de limpieza únicamente sobre recursos del proyecto.

### Fuera de alcance

- Alta disponibilidad o infraestructura de producción.
- Esquema de negocio.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P0-T04 — Validar configuración y secretos en los límites

- [ ] Tarea completada
- Estado: PENDIENTE
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

- [ ] Cada proceso valida sus variables antes de aceptar tráfico o trabajos.
- [ ] Variables públicas y privadas están separadas por contrato.
- [ ] Los errores indican el nombre de la variable sin revelar su contenido.
- [ ] `.env.example` cubre todas las claves y no contiene secretos válidos.
- [ ] Tokens de Meta y claves de OpenAI nunca se exponen al navegador.
- [ ] Existe una estrategia documentada para cifrado en reposo y rotación.

### Verificación obligatoria

- [ ] Probar arranque correcto con configuración válida.
- [ ] Probar fallo intencional por variable ausente, formato inválido y secreto vacío.
- [ ] Buscar patrones de secretos en archivos rastreados.

### Fuera de alcance

- Cargar credenciales reales.
- Implementar OAuth de Meta.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P0-T05 — Inicializar web, API y worker

- [ ] Tarea completada
- Estado: PENDIENTE
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

- [ ] `pnpm dev` inicia los procesos requeridos o documenta comandos equivalentes.
- [ ] Web muestra un estado inicial accesible y sin secretos serializados.
- [ ] API expone health y readiness diferenciados.
- [ ] Worker arranca, valida configuración y reporta estado sin procesar tareas falsas.
- [ ] Las aplicaciones importan contratos compartidos sin dependencias circulares.
- [ ] Los controladores permanecen delgados y no contienen reglas de dominio.

### Verificación obligatoria

- [ ] Ejecutar build, typecheck y smoke test de cada aplicación.
- [ ] Confirmar fallo de readiness cuando PostgreSQL o Redis no están disponibles.
- [ ] Inspeccionar el bundle del cliente para descartar secretos.

### Fuera de alcance

- Autenticación completa.
- Persistencia de publicaciones.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P0-T06 — Establecer controles de calidad y CI

- [ ] Tarea completada
- Estado: PENDIENTE
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

- [ ] `lint`, `typecheck`, `test`, `build` y `verify:plan` funcionan desde la raíz.
- [ ] CI usa instalación congelada del lockfile.
- [ ] Un error en cualquier workspace hace fallar el pipeline.
- [ ] Los resultados indican qué aplicación o paquete falló.
- [ ] Cachés no pueden ocultar un fallo reproducible.
- [ ] Se documenta qué pruebas son obligatorias para cada tipo de cambio.

### Verificación obligatoria

- [ ] Ejecutar el pipeline local equivalente.
- [ ] Introducir temporalmente un error tipado y confirmar que CI lo detectaría.
- [ ] Ejecutar desde un checkout limpio.

### Fuera de alcance

- Despliegue a producción.
- Metas rígidas de cobertura global.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

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
