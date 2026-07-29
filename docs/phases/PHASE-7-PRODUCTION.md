# Fase 7 — Endurecimiento y salida a producción

## Resultado de la fase

La plataforma opera con seguridad, observabilidad, backups, presupuestos,
runbooks y rollback probados. Un piloto controlado valida el circuito completo
antes de ampliar automatizaciones o integrar eventos del sistema comercial.

## Invariantes

- Producción no se inaugura con fallos críticos conocidos.
- Backups no cuentan como protección hasta probar restauración.
- Logs, métricas y alertas deben permitir operar sin consultar la base manualmente.
- Toda acción externa sensible conserva aprobación, idempotencia y auditoría.
- El lanzamiento es gradual y reversible.

## P7-T01 — Completar threat model y revisión de seguridad

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T08`, `P6-T09`
- Riesgo: Alto

### Objetivo

Revisar activos, límites de confianza, OAuth, prompts, uploads, tenancy, colas y
acciones externas antes de exponer producción.

### Entregables

- Threat model actualizado.
- Lista priorizada de hallazgos.
- Evidencia de mitigación o aceptación formal.

### Criterios de aceptación

- [ ] Se modelan abuso de tokens, SSRF, uploads, prompt injection e IDOR.
- [ ] Autorización se prueba en todos los endpoints y jobs.
- [ ] URLs remotas se validan contra política y no habilitan red interna.
- [ ] Dependencias críticas no tienen vulnerabilidades sin decisión.
- [ ] Secretos, logs y backups tienen controles revisados.
- [ ] Hallazgos altos están resueltos; excepciones tienen propietario y fecha.

### Verificación obligatoria

- [ ] Escaneo de dependencias y secretos.
- [ ] Tests de autorización/tenancy y entradas maliciosas.
- [ ] Revisión manual independiente del checklist.

### Fuera de alcance

- Certificación formal no requerida por el negocio.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P7-T02 — Consolidar suite de calidad

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T09`, `P7-T01`
- Riesgo: Alto

### Objetivo

Garantizar que dominio, UI, integraciones, render y automatizaciones tienen
pruebas proporcionales a su riesgo y gates estables.

### Entregables

- Pirámide de pruebas final.
- Suites E2E y visuales en CI.
- Política de flakes y fixtures externos.

### Criterios de aceptación

- [ ] Transiciones, autorización, idempotencia y cálculo temporal tienen cobertura exhaustiva.
- [ ] Contratos OpenAI, Cloudinary y Meta se prueban con dobles y smoke tests reales controlados.
- [ ] Flujos críticos tienen E2E.
- [ ] Visual regression cubre formatos y perfiles aprobados.
- [ ] Un test inestable no se reintenta indefinidamente ni se ignora sin ticket.
- [ ] CI produce evidencia diagnóstica sin secretos.

### Verificación obligatoria

- [ ] Ejecutar pipeline desde checkout limpio.
- [ ] Ejecutar suites críticas repetidas para medir flakes.
- [ ] Confirmar detección de una regresión intencional por categoría.

### Fuera de alcance

- Maximizar cobertura numérica sin valor.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P7-T03 — Implementar observabilidad y health operacional

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P6-T07`
- Riesgo: Alto

### Objetivo

Medir salud, latencia, errores, costos y backlog con correlación de extremo a
extremo.

### Entregables

- Logs estructurados, métricas y trazas.
- Dashboards operativos.
- Health/readiness por dependencia.

### Criterios de aceptación

- [ ] Request, publicación, generación, job e intento comparten correlation IDs.
- [ ] Se observan latencia/error de OpenAI, Meta, Cloudinary, DB y Redis.
- [ ] Dashboards muestran backlog, atraso, éxito parcial y costo de IA.
- [ ] Readiness impide tráfico cuando una dependencia crítica no está disponible.
- [ ] Datos sensibles y tokens están redactados.
- [ ] Alertas tienen umbrales, propietario y runbook.

### Verificación obligatoria

- [ ] Trazar un flujo completo en staging.
- [ ] Interrumpir cada dependencia y observar health/alerta.
- [ ] Revisar muestras de logs por filtración.

### Fuera de alcance

- Analítica de engagement comercial.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P7-T04 — Probar backups, restauración y retención

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P7-T01`
- Riesgo: Alto

### Objetivo

Poder recuperar PostgreSQL, configuración y referencias de medios dentro de RPO
y RTO acordados.

### Entregables

- Política de backup y retención.
- Procedimiento de restauración.
- Evidencia de simulacro.

### Criterios de aceptación

- [ ] RPO y RTO están definidos y aceptados.
- [ ] Backups están cifrados y separados del entorno primario.
- [ ] Restauración reconstruye usuarios, publicaciones, estados y auditoría.
- [ ] Referencias a medios se verifican tras restaurar.
- [ ] Secretos se reinyectan; no se almacenan en el backup documental.
- [ ] Retención y borrado cumplen política de datos.

### Verificación obligatoria

- [ ] Restaurar en un entorno aislado.
- [ ] Ejecutar checks de integridad y un render de snapshot.
- [ ] Medir tiempo y documentar desvíos.

### Fuera de alcance

- Recuperación multi-región si no fue aprobada.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P7-T05 — Fijar presupuestos de rendimiento y costo

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P7-T02`, `P7-T03`
- Riesgo: Medio

### Objetivo

Definir límites operativos para interacción web, API, render, IA, publicación y
almacenamiento, y detectar regresiones.

### Entregables

- SLO y presupuestos.
- Escenarios de carga.
- Alertas y reporte de costo por operación.

### Criterios de aceptación

- [ ] Se definen p95/p99 para endpoints y colas críticas.
- [ ] Render y generación tienen timeout y concurrencia basados en medición.
- [ ] Listados permanecen paginados bajo volumen esperado.
- [ ] Costo por brief, variante y publicación puede atribuirse.
- [ ] El sistema degrada de forma controlada ante rate limits.
- [ ] Umbrales de presupuesto generan alerta antes del corte.

### Verificación obligatoria

- [ ] Prueba de carga sobre staging con datos representativos.
- [ ] Prueba de backlog y recuperación.
- [ ] Comparar costo estimado y observado.

### Fuera de alcance

- Optimizar sin una medición que lo justifique.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P7-T06 — Completar y ensayar runbooks

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P7-T03`, `P7-T04`
- Riesgo: Alto

### Objetivo

Permitir que una persona diagnostique y contenga incidentes frecuentes con
acciones seguras, verificables y reversibles.

### Entregables

- Runbooks de Meta, OpenAI, colas, DB, media, tokens y rollback.
- Matriz de escalamiento.
- Registro de simulacros.

### Criterios de aceptación

- [ ] Cada runbook tiene síntomas, diagnóstico, contención, recuperación y verificación.
- [ ] Comandos destructivos están delimitados y advertidos.
- [ ] Existen procedimientos para pausar generación y publicación por separado.
- [ ] Rotar/revocar credenciales está documentado y probado.
- [ ] Se define cuándo comunicar a responsables de negocio.
- [ ] Una persona distinta del autor puede ejecutar el runbook.

### Verificación obligatoria

- [ ] Simulacro de token Meta revocado.
- [ ] Simulacro de cola atascada y proveedor OpenAI degradado.
- [ ] Revisión post-simulacro y corrección de pasos ambiguos.

### Fuera de alcance

- Automatizar toda respuesta a incidentes.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P7-T07 — Desplegar producción y probar rollback

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P7-T01`, `P7-T02`, `P7-T04`, `P7-T06`
- Riesgo: Alto

### Objetivo

Provisionar producción separada, desplegar una versión identificable y demostrar
rollback de aplicación y migraciones compatibles.

### Entregables

- Infraestructura y pipeline de producción.
- Checklist de despliegue.
- Procedimiento y evidencia de rollback.

### Criterios de aceptación

- [ ] Producción usa credenciales, datos y conexiones separados.
- [ ] Artefactos son inmutables y trazables a un commit.
- [ ] Migraciones siguen estrategia compatible con rollback.
- [ ] Healthchecks bloquean promoción de una versión no sana.
- [ ] Rollback no pierde publicaciones ya confirmadas.
- [ ] Acceso productivo usa mínimo privilegio y queda auditado.

### Verificación obligatoria

- [ ] Desplegar release candidata en staging con el mismo mecanismo.
- [ ] Ejecutar rollback completo y smoke tests.
- [ ] Validar configuración y ausencia de secretos en artefactos.

### Fuera de alcance

- Activar usuarios reales.

### Notas de progreso

- 2026-07-29: por autorización explícita se preparó anticipadamente el
  scaffolding local para el VPS dedicado, sin iniciar la tarea ni omitir sus
  dependencias. Incluye imágenes separadas por proceso, Caddy como único punto
  público, redes privadas, migración one-shot, healthchecks y límites acordes
  al VPS de 4 vCPU/8 GB.
- La validación local construyó los cuatro targets y el smoke efímero aplicó las
  ocho migraciones, inició API/web/worker, comprobó `/ready` y ejecutó Chromium.
  El proyecto de prueba y sus volúmenes fueron eliminados al terminar.
- Continúan pendientes y no simulados: publicación de imágenes inmutables,
  credenciales separadas, staging remoto, backup/restauración y rollback. La
  tarea permanece `PENDIENTE` hasta completar sus dependencias.
- 2026-07-29: después de autorizar la clave se actualizó y reinició Ubuntu
  `26.04`, se instaló Docker desde su repositorio oficial, se agregaron 2 GiB de
  swap y se prepararon directorios protegidos. SSH quedó limitado a clave sin
  root/contraseña/X11; UFW permite sólo 22/tcp, 80/tcp, 443/tcp y 443/udp para
  IPv4/IPv6. Caddy fijado por digest ejecutó correctamente. No se desplegaron
  aplicación, bases ni secretos y la tarea continúa `PENDIENTE`.
- Se eligió GHCR y se preparó un workflow manual que construye `linux/amd64` y
  publica las cuatro imágenes sólo con el SHA de `main`. No se ejecutó todavía
  ni se creó un tag mutable.
- Donweb sirve autoritativamente los registros `A` y `AAAA` de
  `content.ferreteriaaramayo.com.ar` y `api.content.ferreteriaaramayo.com.ar`.
  La propagación pública todavía era parcial por caché negativa; Caddy permanece
  detenido.

### Evidencia de cierre

- Pendiente.

## P7-T08 — Ejecutar piloto y checklist de salida

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P7-T05`, `P7-T07`
- Riesgo: Alto

### Objetivo

Habilitar un grupo pequeño, con aprobación humana obligatoria y límites bajos,
para validar operación real antes de ampliar automatizaciones.

### Entregables

- Checklist go-live.
- Plan de piloto, responsables y métricas.
- Registro de incidencias y decisión go/no-go.

### Criterios de aceptación

- [ ] Usuarios, roles, ubicaciones y conexiones iniciales están verificados.
- [ ] Cuotas y feature flags comienzan en modo conservador.
- [ ] Toda publicación del piloto requiere confirmación humana.
- [ ] Soporte y escalamiento tienen responsables y horarios.
- [ ] Backups, alertas y rollback fueron probados recientemente.
- [ ] Existe criterio explícito para pausar o ampliar el piloto.

### Verificación obligatoria

- [ ] Ejecutar checklist con firmas/responsables.
- [ ] Publicar casos reales aprobados durante la ventana piloto.
- [ ] Revisar diariamente errores, costos, duplicados y feedback.

### Fuera de alcance

- Automatizar promociones desde compras.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P7-T09 — Cerrar revisión post-lanzamiento y siguiente etapa

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P7-T08`
- Riesgo: Medio

### Objetivo

Comparar el piloto contra criterios, corregir problemas y decidir si se amplía el
uso o se inicia la integración de eventos comerciales.

### Entregables

- Informe post-lanzamiento.
- Backlog priorizado.
- Decisión sobre automatización desde compras.

### Criterios de aceptación

- [ ] Se analizan éxito, fallos, duplicados, latencia, costo y carga operativa.
- [ ] Feedback se transforma en tareas con prioridad y propietario.
- [ ] Incidentes tienen causa y acción preventiva.
- [ ] Se confirma si los controles de aprobación siguen siendo adecuados.
- [ ] La integración de compras tiene alcance, permisos y eventos definidos antes de implementarse.
- [ ] La decisión de ampliar, pausar o revertir queda registrada.

### Verificación obligatoria

- [ ] Reunión de revisión con responsables técnicos y de negocio.
- [ ] Contrastar métricas con los criterios del piloto.
- [ ] Actualizar `STATUS.md`, roadmap y ADR necesarios.

### Fuera de alcance

- Implementar el conector de compras dentro de esta tarea.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 7

- [ ] `P7-T01` a `P7-T09` están completas.
- [ ] No hay hallazgos críticos abiertos.
- [ ] Restauración, alertas, runbooks y rollback tienen evidencia reciente.
- [ ] El piloto cumple criterios o existe decisión documentada de pausa/reversión.
- [ ] El siguiente alcance está definido a partir de datos, no de supuestos.
