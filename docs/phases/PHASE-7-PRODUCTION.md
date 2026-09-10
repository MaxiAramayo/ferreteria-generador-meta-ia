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
- Estado: EN PROGRESO
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

- [x] Se modelan abuso de tokens, SSRF, uploads, prompt injection e IDOR.
- [x] Autorización se prueba en todos los endpoints y jobs.
- [x] URLs remotas se validan contra política y no habilitan red interna.
- [x] Dependencias críticas no tienen vulnerabilidades sin decisión.
- [x] Secretos, logs y backups tienen controles revisados.
- [x] Hallazgos altos están resueltos; excepciones tienen propietario y fecha.

### Verificación obligatoria

- [x] Escaneo de dependencias y secretos.
- [x] Tests de autorización/tenancy y entradas maliciosas.
- [ ] Revisión manual independiente del checklist.

### Fuera de alcance

- Certificación formal no requerida por el negocio.

### Notas de progreso

- Fecha: 2026-09-09.
- **Desviación registrada**: la tarea empezó con `P6-T09` sin cerrar. Lo que esa
  tarea agrega es evidencia de una corrida real de publicación, no superficie de
  ataque nueva: todo el código de programación está en `main`, así que la
  superficie a revisar ya existe entera. El usuario pidió avanzar igual.
- Entregado: [`THREAT-MODEL.md`](../operations/THREAT-MODEL.md) con límites de
  confianza, las seis amenazas modeladas con su evidencia, cuatro hallazgos y
  las excepciones aceptadas con dueño y fecha de revisión.
- **F-01, crítica**: Next.js 16.2.11 arrastraba dos avisos de ejecución remota,
  uno en optimización de imágenes. Resuelto con 16.3.4; el panel además declara
  `images.unoptimized`, que apaga `/_next/image` —un endpoint que no usaba y que
  igual quedaba expuesto en el ingreso público—.
- **F-02, alta**: sharp 0.34.5 con las vulnerabilidades de libvips y libheif. Es
  la dependencia más expuesta del sistema porque procesa lo que llega de afuera.
  Resuelto con 0.35.4; el salto probó de paso que la comparación con `"jpg"` en
  la evaluación de calidad era código muerto.
- **F-03, alta**: `PermissionGuard` devolvía `true` cuando la ruta no declaraba
  permiso, así que **olvidar el decorador dejaba el endpoint al alcance de
  cualquier rol autenticado** y nada lo denunciaba. Ahora falla cerrado.
  `AuthenticatedRoute` nombra el tercer estado que existía sin nombre —exige
  sesión y ningún permiso— para que decidirlo no se confunda con olvidarlo.
- **F-04, media**: la imagen de producción no copiaba el manifiesto de
  `packages/observability`. CI corre `pnpm verify` y nunca construye la imagen,
  así que el defecto no tenía dónde aparecer hasta el despliegue. `verify:stack`
  ahora enumera los workspaces y lo exige.
- **Lo que la revisión confirmó sin hallazgo**: ninguna entrada de la API acepta
  una URL y no hay ruta multipart, así que no existe SSRF por dirección elegida
  por una persona; la URL de un medio la devuelve el proveedor y se rechaza si
  no pertenece al cloud propio; la evidencia de un brief la emite el servidor y
  no el modelo, que es la defensa real contra prompt injection; los tokens de
  Meta se cifran con AES-256-GCM; ningún secreto está versionado.
- **Sobre tenancy**: auditadas 232 consultas de repositorio. Las que no filtran
  por organización son barridos del worker que cruzan tenants a propósito; cada
  fila que devuelven lleva su organización y la escritura posterior vuelve a
  acotar.
- Pendiente: la revisión manual independiente del checklist. Es la única
  verificación que no puede hacerse desde adentro de la sesión que escribió el
  código.

### Evidencia de cierre

- Pendiente: falta la revisión manual independiente.

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
- Estado: EN PROGRESO
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

- [x] Request, publicación, generación, job e intento comparten correlation IDs.
- [x] Se observan latencia/error de OpenAI, Meta, Cloudinary, DB y Redis.
- [x] Dashboards muestran backlog, atraso, éxito parcial y costo de IA.
- [x] Readiness impide tráfico cuando una dependencia crítica no está disponible.
- [x] Datos sensibles y tokens están redactados.
- [x] Alertas tienen umbrales, propietario y runbook.

### Verificación obligatoria

- [ ] Trazar un flujo completo en staging.
- [x] Interrumpir cada dependencia y observar health/alerta.
- [x] Revisar muestras de logs por filtración.

### Fuera de alcance

- Analítica de engagement comercial.

### Notas de progreso

- Fecha: 2026-09-09. Primer tramo entregado; la tarea sigue abierta.
- Entregado: `packages/observability` —correlación en `AsyncLocalStorage`, log
  estructurado y redacción—; correlación de extremo a extremo entre API, base y
  worker; migración `20260909120000_observability_correlation`; log JSON en
  ambos procesos, incluido el del framework; smoke que verifica registros y no
  frases. La decisión está en
  [`ADR-028`](../architecture/decisions/ADR-028-CORRELATION-AND-STRUCTURED-LOGS.md).
- **La correlación no se pasa por argumento.** Hay más de treinta lugares que
  escriben auditoría, casi todos dentro de transacciones de un repositorio;
  alcanza con que uno la olvide para que la cadena se corte justo en el caso que
  se quería investigar. Se estampa en el borde de persistencia con una extensión
  del cliente Prisma.
- **Un identificador entrante se acepta sólo con su forma exacta.** Sin eso,
  cualquiera puede escribir texto arbitrario en los logs y en la base desde un
  encabezado.
- **El alcance se abre antes de los guards.** Un 401 o un 403 son parte de la
  solicitud; con el registro en un interceptor no aparecerían en ningún lado.
- **El worker no hereda la correlación del trabajo anterior.** Un mensaje sin
  correlación recibe una nueva: mezclar dos intenciones es peor que no tener
  ninguna.
- Consecuencia técnica registrada: el cliente Prisma extendido tiene otro tipo
  que el base, así que `DatabaseTransactionClient` reemplazó a
  `Prisma.TransactionClient` en los repositorios que reciben una transacción.
- Fecha: 2026-09-09. Segundo tramo entregado; la tarea sigue abierta.
- Entregado: observación `dependency.call` con latencia y desenlace en cada
  adaptador de proveedor —OpenAI respuestas e imágenes, Meta Graph, Cloudinary y
  sistema comercial—; PostgreSQL y Redis publican la latencia que ya medía su
  sonda; readiness con criticidad explícita.
- **La observación no lleva URL ni mensaje del proveedor.** Una URL de Graph
  lleva identificadores del negocio y un mensaje de error puede traer cualquier
  cosa: se registran la dependencia, una operación de un conjunto acotado que
  escribe el código y un código de fallo corto.
- **La criticidad viene marcada por omisión.** `measureProbe` declara crítica
  toda sonda que no diga lo contrario, así que abrir una dependencia es una
  decisión explícita y no un descuido. El smoke lo mostró de la peor manera:
  con la criticidad ausente, `/ready` respondía 200 con PostgreSQL y Redis
  caídos.
- **Los proveedores externos no se consultan en cada readiness.** Probar OpenAI,
  Meta o Cloudinary por cada verificación sería lento y los limitaría; su salud
  se observa en el log y en la bandeja operativa de `P6-T07`.
- Fecha: 2026-09-09. Tercer tramo entregado; la tarea sigue abierta por
  verificación, no por implementación.
- Entregado: tablero operativo en `/operacion` con backlog de turnos y trabajos,
  atraso, salidas parciales, destinos sin confirmar y costo de IA del mes;
  umbrales declarados en el dominio y documentados en
  [`RUNBOOKS.md`](../operations/RUNBOOKS.md) con su dueño por rol y el runbook
  que corresponde; dos runbooks nuevos —worker detenido y presupuesto de IA—.
- **Los umbrales viven en el dominio, no en la pantalla.** Un tablero que decide
  su propio criterio deja de coincidir con la bandeja de alertas y con el
  runbook, y dos personas mirando lo mismo terminan discutiendo si está mal.
  Cada motivo informa qué umbral cruzó y con qué número medido.
- **No hay pipeline de métricas ni serie temporal.** La pregunta que responde el
  tablero —¿hay algo que atender ahora?— se contesta con el estado presente de
  las tablas que ya gobiernan el trabajo. Un contador en memoria del proceso
  mentiría después de cada reinicio.
- **Sin presupuesto declarado no se informa porcentaje.** Decir 0 % sería
  afirmar que sobra presupuesto y 100 % que se agotó; ambas serían inventadas.
- Consecuencia registrada: la API expone `x-correlation-id` en CORS. Sin eso el
  navegador lo esconde por ser cruzada de origen y el panel no puede nombrar la
  correlación de una solicitud que falló.
- Fecha: 2026-09-09. Cuarto tramo: se cortó cada dependencia y se comprobó qué
  deja observado.
- Cada proveedor se interrumpe con su propio doble —conexión rechazada o
  timeout— y la prueba exige que el corte deje observación con su dependencia,
  su operación, una causa corta y su duración: Meta en `graph.request`,
  Cloudinary en `media.probe`, el sistema comercial en `catalog.request` y
  OpenAI en `responses.create`, este último contra un puerto reservado sin
  servicio para no salir a la red. Sin esta prueba un adaptador podría perder su
  instrumentación en un refactor y nadie lo notaría hasta necesitarla en un
  incidente.
- **Qué produce el corte de cada dependencia**: PostgreSQL y Redis, `/ready` en
  503 más su observación, comprobado en el smoke; Meta, observación más la
  alerta `connection-degraded` de `P6-T07`; Cloudinary, sistema comercial y
  OpenAI, observación con causa. La carga y el borrado en Cloudinary se
  ejercitan contra el proveedor real en `pnpm media:smoke:cloudinary`; la prueba
  corta la lectura pública, que es la que decide si Meta alcanza la pieza.
- La clave de OpenAI no aparece en el registro aunque el SDK la lleve en el
  error: la prueba lo verifica sobre el texto emitido.
- **Pendiente, y sólo eso: trazar un flujo completo en staging.** Necesita
  desplegar esta rama en el VPS, que hoy tiene la release seleccionada pero sin
  servicios iniciados y con OpenAI, Cloudinary y Meta deshabilitados. El trazado
  local ya está: el E2E con Chrome comprueba que la correlación que devuelve la
  API llega a la auditoría y al trabajo que la ejecuta.

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
- Continúan pendientes y no simulados: credenciales separadas, staging remoto,
  backup/restauración y rollback. La tarea permanece `PENDIENTE` hasta completar
  sus dependencias.
- 2026-07-29: después de autorizar la clave se actualizó y reinició Ubuntu
  `26.04`, se instaló Docker desde su repositorio oficial, se agregaron 2 GiB de
  swap y se prepararon directorios protegidos. SSH quedó limitado a clave sin
  root/contraseña/X11; UFW permite sólo 22/tcp, 80/tcp, 443/tcp y 443/udp para
  IPv4/IPv6. Caddy fijado por digest ejecutó correctamente. No se desplegaron
  aplicación, bases ni secretos y la tarea continúa `PENDIENTE`.
- Se eligió GHCR y se preparó un workflow manual que construye `linux/amd64` y
  publica las cuatro imágenes sólo con el SHA de `main`. La ejecución
  `30476757409` terminó correctamente para
  `3b83df4c667e8b14b3ff1e65363e6e6cf1a5ebf1`; no se creó un tag mutable. Los
  paquetes quedaron públicos por autorización explícita.
- Donweb sirve autoritativamente los registros `A` y `AAAA` de
  `content.ferreteriaaramayo.com.ar` y `api.content.ferreteriaaramayo.com.ar`.
  La propagación pública todavía era parcial por caché negativa; Caddy permanece
  detenido.
- La release declarativa del mismo commit se copió a
  `/opt/aramayo-content/releases/` y el symlink `current` quedó apuntando a
  ella. Compose y Caddy pasaron validación en el host sin crear volúmenes ni
  iniciar contenedores.
- Se creó `/etc/aramayo-content/production.env` con modo `0600 root:root`,
  correo ACME confirmado y secretos de PostgreSQL, Redis y cifrado generados
  dentro del VPS. El archivo pasó `docker compose config --quiet`; los grupos
  OpenAI, Cloudinary y Meta permanecen vacíos.
- `docs/operations/VPS_OPERATIONS.md` registra huella SSH, inventario,
  directorios, inspección, actualizaciones, despliegue condicionado, rollback,
  backup, incidentes y acciones destructivas prohibidas.
- El VPS descargó anónimamente las cuatro imágenes `linux/amd64` y las tres
  imágenes de infraestructura fijadas. Todas las imágenes de aplicación
  reportaron el SHA esperado; quedaron 60 GB libres y no se crearon
  contenedores ni volúmenes.
- Los cuatro registros DNS ya responden en 1.1.1.1 y 8.8.8.8. Caddy permanece
  detenido hasta autorizar el despliegue.

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
