# Fase 2 — Dominio, persistencia y panel base

## Resultado de la fase

Usuarios autorizados pueden crear un borrador, adjuntar medios, previsualizar una
pieza determinista, enviarla a revisión y aprobarla. El estado queda persistido,
auditado y protegido contra escrituras duplicadas.

## Invariantes

- Organización y ubicación limitan todas las consultas y mutaciones.
- Publicar nunca es un efecto secundario de guardar un borrador.
- Una aprobación referencia un snapshot inmutable.
- Toda transición se valida en el dominio y se audita.
- Acciones externas usan idempotencia.

## P2-T01 — Diseñar esquema y migraciones del núcleo

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T02`, `P0-T03`, `P1-T02`
- Riesgo: Alto

### Objetivo

Persistir organizaciones, usuarios, marcas, ubicaciones, publicaciones, revisiones
y medios con integridad referencial y migraciones reversibles.

### Entregables

- Modelo entidad-relación.
- Migración inicial y datos mínimos de desarrollo.
- Repositorios tipados con filtros de pertenencia.

### Criterios de aceptación

- [x] Todas las tablas de negocio tienen identificador, timestamps y ownership.
- [x] Estados se restringen a valores de dominio válidos.
- [x] Snapshots aprobados no dependen de filas mutables para reconstruirse.
- [x] Índices cubren listados por organización, estado y programación.
- [x] Borrados y cascadas tienen comportamiento explícito.
- [x] No se filtran entidades de otra organización por error.

### Verificación obligatoria

- [x] Aplicar migraciones desde base vacía.
- [x] Revertir y reaplicar la última migración.
- [x] Ejecutar tests de aislamiento entre dos organizaciones.
- [x] Revisar plan de consultas de listados críticos.

### Fuera de alcance

- Catálogo comercial completo.
- Vectores RAG.

### Notas de progreso

- 2026-07-28: se modelaron organizaciones, identidades globales, membresías,
  marcas, ubicaciones, publicaciones, revisiones, snapshots y medios. Las
  relaciones tenant usan claves compuestas con `organization_id`; un UUID de
  otra organización falla también a nivel PostgreSQL.
- 2026-07-28: Prisma vive en `infrastructure/database`; los puertos están en
  `packages/domain` y la API compone los adaptadores con tokens. Ningún tipo
  generado atraviesa al dominio.
- 2026-07-28: el snapshot aprobado guarda el documento autocontenido y un
  trigger impide actualizarlo o eliminarlo. Todos los borrados de negocio son
  restrictivos y reemplazar un medio implica otra fila/version.
- 2026-07-28: al auditar el estado previo se detectó que el smoke dejaba vivo el
  timer de cinco minutos usado para supervisar `next build`. Se cancelan timers
  al completar cada proceso y una prueba reproduce el defecto; era necesario
  para que `pnpm verify` pudiera terminar.

### Evidencia de cierre

- Commit: árbol de trabajo de cierre de `P2-T01`.
- `pnpm db:test`: base efímera creada; migración aplicada desde cero; seed
  idempotente verificado; aislamiento, snapshots, referencias e índices
  aprobados; `down.sql` ejecutado; migración reaplicada y pruebas repetidas.
- `pnpm verify`: pipeline completo aprobado y smoke finalizado sin handles
  abiertos.
- Aislamiento: repositorios exigen `organizationId`, devuelven `null` frente a
  IDs de otro tenant y las claves compuestas rechazan relaciones cruzadas.
- Inmutabilidad: actualizar un snapshot aprobado y borrar un medio referenciado
  fallan en PostgreSQL.
- Planes: `EXPLAIN` usa `publications_org_status_created_idx` y
  `publications_org_scheduled_idx`.
- Seed: organización Aramayo, identidad local `.invalid`, membresía de
  desarrollo, perfil aprobado y dos ubicaciones; no contiene responsables ni
  credenciales reales.
- Fuentes oficiales verificadas el 2026-07-28: configuración, cliente con
  adaptador `pg`, migraciones y seed de Prisma ORM 7.
- Desviaciones: Prisma Migrate no posee `down` automático; la migración conserva
  un `down.sql` explícito y `pnpm db:test` demuestra rollback y reaplicación en
  una base descartable.

## P2-T02 — Implementar autenticación y autorización

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P0-T07`, `P2-T01`
- Riesgo: Alto

### Objetivo

Identificar personas y aplicar roles en el servidor para lectura, edición,
aprobación, configuración y futura publicación.

### Entregables

- Integración de identidad.
- Guards y políticas de autorización.
- Flujo de sesión para web y API.

### Criterios de aceptación

- [x] Ningún endpoint privado confía en un rol enviado por el cliente.
- [x] `editor` no puede aprobar ni gestionar conexiones.
- [x] `approver` puede aprobar pero no administrar secretos.
- [x] `admin` opera solo dentro de su organización.
- [x] Sesiones expiradas y usuarios revocados pierden acceso.
- [x] Respuestas no revelan si existe un recurso fuera del scope.

### Verificación obligatoria

- [x] Matriz automatizada de rol × acción × ownership.
- [x] Pruebas de sesión ausente, expirada y usuario deshabilitado.
- [x] Revisión de todos los controladores mediante guard global o excepción explícita.

### Fuera de alcance

- OAuth de cuentas Meta.

### Notas de progreso

- 2026-07-28: `packages/domain` define cinco roles, ocho permisos y una matriz
  exhaustiva sin herencia implícita. Los roles son acumulables y toda decisión
  incluye el `organizationId` del recurso.
- 2026-07-28: `IdentityModule` agrega login local, sesión opaca revocable,
  logout individual/global y guards globales de origen, sesión, CSRF y permiso.
  Sólo login, health y readiness declaran excepción pública.
- 2026-07-28: las contraseñas usan Argon2id versionado. Cookie, sesión y CSRF
  siguen contratos separados; la cookie CSRF permite recuperarlo después de
  recargar la web. PostgreSQL conserva sólo hashes de los tokens y vuelve a
  consultar usuario, membresía y roles en cada request.
- 2026-07-28: cinco fallos por sujeto y huella dentro de quince minutos bloquean
  el ingreso. Los rechazos no distinguen email, contraseña, organización,
  usuario deshabilitado o membresía revocada.
- 2026-07-28: la tercera migración agrega credenciales opcionales, sesiones y
  eventos append-only. Cambio de contraseña, deshabilitación, vencimiento,
  revocación de sesión o membresía eliminan acceso.
- 2026-07-28: el seed sigue sin contraseña ni acceso predeterminado. Alta,
  recuperación de cuenta y MFA continúan como procedimientos administrativos
  explícitos antes del piloto; no se agregó registro público.

### Evidencia de cierre

- Commit: árbol de trabajo de cierre de `P0-T07` y `P2-T02`.
- `pnpm --filter @aramayo/domain test`: matriz exhaustiva para cada combinación
  rol × permiso, composición de roles y denegación para otra organización.
- `pnpm --filter @aramayo/api test`: diez pruebas; login, rechazo uniforme,
  rate limit, hashes de tokens, CSRF, cookie, origen, permisos, revocación,
  usuario deshabilitado y parámetros Argon2id reales.
- `pnpm db:test`: base efímera desde cero, sesiones vencidas, roles vigentes,
  cambio de contraseña, usuario deshabilitado, cambio/revocación de membresía,
  aislamiento entre organizaciones y auditoría inmutable. La migración se
  revirtió y reaplicó.
- `pnpm verify`: stack, plan, formato, build, lint, typecheck, pruebas, línea
  base y smoke de API, web y worker completos.
- Revisión de controladores: los cuatro guards son globales; `HealthController`
  es público por clase y sólo `POST /auth/login` lo es dentro de identidad.
- Desviaciones: OAuth Meta, registro público, recuperación y MFA permanecen
  fuera de alcance. El bootstrap del primer administrador se ejecutará al
  provisionar staging y no introduce una credencial versionada.

## P2-T03 — Gestionar organización, marca y ubicaciones

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T01`, `P2-T02`
- Riesgo: Medio

### Objetivo

Representar Ferretería Aramayo, sus parámetros de marca y sucursales como
contexto obligatorio para generar contenido.

### Entregables

- Casos de uso y pantallas de configuración.
- Horarios, contactos, dirección, WhatsApp y defaults de marca.
- Validación y auditoría de cambios.

### Criterios de aceptación

- [ ] Una publicación pertenece a una organización y puede apuntar a una ubicación.
- [ ] Teléfonos, horarios y direcciones se validan y normalizan.
- [ ] Cambios de marca no alteran snapshots ya aprobados.
- [ ] Solo administradores pueden editar configuración sensible.
- [ ] Cada modificación registra autor, antes y después.
- [ ] La UI maneja carga, vacío, error, éxito y permisos insuficientes.

### Verificación obligatoria

- [ ] Tests de casos de uso y validadores.
- [ ] Flujo E2E de edición autorizada y rechazada.
- [ ] Comprobar inmutabilidad de una publicación aprobada anterior.

### Fuera de alcance

- Ingestar documentos RAG.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P2-T04 — Implementar máquina de estados de publicación

- [x] Tarea completada
- Estado: COMPLETA
- Dependencias: `P2-T01`
- Riesgo: Alto

### Objetivo

Centralizar transiciones, invariantes y motivos de fallo desde borrador hasta
cancelación, dejando estados de publicación externa para fases posteriores.

### Entregables

- Servicio de dominio de transiciones.
- Historial de estado.
- Matriz de transiciones permitidas.

### Criterios de aceptación

- [x] Transiciones inválidas fallan sin mutar datos.
- [x] La versión esperada evita sobrescrituras concurrentes.
- [x] `approved` requiere snapshot, revisor y timestamp.
- [x] Editar contenido aprobado crea revisión o devuelve a borrador según política.
- [x] Fallos conservan código, mensaje seguro y posibilidad de reintento.
- [x] Cancelación no borra historial ni evidencia.

### Verificación obligatoria

- [x] Tests de cada transición permitida y prohibida.
- [x] Prueba de dos actualizaciones concurrentes.
- [x] Revisión de que controladores no escriben estados directamente.

### Fuera de alcance

- Llamar a OpenAI o Meta.

### Notas de progreso

- 2026-07-28: se implementó una matriz exhaustiva sobre los quince estados y
  comandos discriminados para avance, aprobación, fallo, cancelación,
  expiración y edición de contenido aprobado.
- 2026-07-28: aprobar exige snapshot, revisor y timestamp. La política de
  edición aprobada exige `newRevisionId`, vuelve a `draft` e invalida la
  aprobación vigente sin borrar el snapshot histórico.
- 2026-07-28: `PublicationTransitionService` sólo orquesta dominio y puerto.
  `PrismaPublicationStateRepository` aplica compare-and-swap por estado/versión
  y agrega el historial en una misma transacción.
- 2026-07-28: no se agregaron controladores de contenido. Los controladores
  existentes son únicamente health/readiness y no pueden escribir estados.

### Evidencia de cierre

- Commit: árbol de trabajo de cierre de `P2-T04`.
- `pnpm --filter @aramayo/domain test`: seis pruebas; la matriz compara los 225
  pares estado-origen/destino y cubre versión vencida, aprobación, edición,
  fallos y terminales.
- `pnpm --filter @aramayo/api test`: tres pruebas de composición Nest; una
  transición inválida no llega al repositorio, otro tenant devuelve
  `not-found` y perder compare-and-swap devuelve conflicto.
- `pnpm db:test`: dos commits concurrentes sobre la misma versión producen
  exactamente un `committed`, un `version-conflict`, una sola fila de historial
  y versión incrementada una vez. El historial rechaza mutaciones.
- `pnpm verify`: build, lint, typecheck, suites, línea base y smoke completos.
- La segunda migración agrega diagnóstico actual y un historial append-only con
  ownership compuesto; su `down.sql` fue ejecutado y reaplicado en PostgreSQL
  efímero.
- Desviaciones: los estados de publicación externa están definidos para
  mantener una sola máquina, pero esta tarea no invoca OpenAI, Meta, colas ni
  adaptadores externos.

## P2-T05 — Construir borradores, medios y revisiones

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T07`, `P2-T03`, `P2-T04`
- Riesgo: Alto

### Objetivo

Permitir crear y editar un borrador con formato, texto, CTA, productos y medios,
manteniendo versiones revisables.

### Entregables

- Casos de uso CRUD limitados al dominio.
- Revisión versionada y snapshot.
- Endpoints tipados y validación.

### Criterios de aceptación

- [ ] Crear o actualizar no puede disparar una publicación externa.
- [ ] Inputs se validan antes del caso de uso.
- [ ] Medios pertenecen a la misma organización.
- [ ] Una actualización requiere versión esperada.
- [ ] El historial permite identificar qué versión fue aprobada.
- [ ] Errores parciales no dejan referencias huérfanas.
- [ ] Listados están paginados y filtrados en servidor.

### Verificación obligatoria

- [ ] Tests de repositorio, servicio y endpoint.
- [ ] Pruebas de ownership, concurrencia y rollback.
- [ ] Flujo E2E crear–editar–versionar–consultar.

### Fuera de alcance

- Brief libre con IA.
- Programación.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P2-T06 — Implementar auditoría, idempotencia y outbox

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T04`, `P2-T05`
- Riesgo: Alto

### Objetivo

Hacer trazables las mutaciones y preparar efectos asíncronos sin transacciones
distribuidas ni duplicación accidental.

### Entregables

- Registro de auditoría append-only.
- Tabla y servicio de idempotencia.
- Outbox transaccional y publicador.

### Criterios de aceptación

- [ ] Mutación y evento outbox se confirman en la misma transacción.
- [ ] Repetir una clave devuelve el resultado anterior o conflicto coherente.
- [ ] Claves se limitan por organización, operación y actor.
- [ ] Payloads de auditoría omiten secretos y datos innecesarios.
- [ ] El publicador tolera reinicio y entrega repetida.
- [ ] Existe retención y limpieza segura documentada.

### Verificación obligatoria

- [ ] Repetir requests concurrentes con la misma clave.
- [ ] Detener el proceso entre commit y entrega y confirmar recuperación.
- [ ] Inspeccionar auditoría de un flujo completo.

### Fuera de alcance

- Garantizar exactly-once en proveedores externos.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P2-T07 — Construir shell del panel y compositores explícitos

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T02`, `P2-T05`
- Riesgo: Medio

### Objetivo

Crear navegación, listados y un compositor escalable con variantes explícitas
para plantilla, IA, historia recurrente y promoción de productos.

### Entregables

- Shell autenticado y listado de publicaciones.
- `TemplatePublicationComposer`, `AICreativeComposer`,
  `RecurringStoryComposer` y `ProductPromotionComposer`.
- Provider compartido con `state`, `actions` y `meta`.

### Criterios de aceptación

- [ ] No existe un componente monolítico controlado por muchos booleanos.
- [ ] Cada variante muestra solo las acciones válidas para su flujo.
- [ ] Estado compartido y metadatos de formulario están separados.
- [ ] Estados loading, empty, error, success y forbidden son explícitos.
- [ ] Formularios son navegables por teclado y anuncian errores.
- [ ] Datos iniciales se cargan en servidor cuando evita waterfalls.
- [ ] Los consumidores dependen de contratos públicos, no del contexto interno.

### Verificación obligatoria

- [ ] Tests de composición y acciones inválidas fuera del provider.
- [ ] E2E de listado y compositor por plantilla.
- [ ] Auditoría de accesibilidad y revisión de renders innecesarios.

### Fuera de alcance

- Implementar lógica de IA, recurrente o producto; solo sus límites de UI.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P2-T08 — Completar vertical determinista de borrador y aprobación

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T06`, `P2-T06`, `P2-T07`
- Riesgo: Alto

### Objetivo

Demostrar el flujo completo local: crear una pieza desde plantilla, renderizarla,
revisarla, aprobarla y conservar su snapshot.

### Entregables

- Orquestación API–worker–almacenamiento.
- UI de preview y aprobación.
- Prueba E2E y evidencia visual.

### Criterios de aceptación

- [ ] El usuario selecciona layout, formato y medios permitidos.
- [ ] El worker produce PNG y el panel refleja éxito o fallo real.
- [ ] Aprobar fija contenido, activo, formato y versión de diseño.
- [ ] Reintentar render no duplica revisiones ni medios.
- [ ] Un editor no puede aprobar; un approver sí.
- [ ] Cada paso aparece en auditoría y estado.

### Verificación obligatoria

- [ ] E2E desde sesión nueva hasta snapshot aprobado.
- [ ] Repetir el flujo con imagen corrupta y confirmar fallo explícito.
- [ ] Restaurar el snapshot y comparar con el PNG aprobado.

### Fuera de alcance

- Publicación externa.
- Contenido generado por IA.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 2

- [ ] `P2-T01` a `P2-T08` están completas.
- [ ] Aislamiento, autorización e idempotencia tienen pruebas.
- [ ] Existe un flujo determinista aprobado de punta a punta.
- [ ] Ninguna acción del panel publica o llama a IA de forma implícita.
- [ ] El snapshot aprobado puede reconstruirse y auditarse.
