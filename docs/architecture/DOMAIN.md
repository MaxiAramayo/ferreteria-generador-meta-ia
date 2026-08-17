# Dominio y flujos

## Agregados principales

### Identity

`User` es una identidad global. El acceso existe únicamente mediante una
`OrganizationMembership` activa; una misma persona puede pertenecer a más de
una organización y debe elegirla al ingresar cuando tenga varias membresías.
No existe registro público.

Los roles se componen de forma aditiva, pero `admin` no hereda permisos
editoriales:

| Rol | Permisos |
|---|---|
| `admin` | lectura, conexiones, configuración de organización e identidades |
| `editor` | lectura y edición de contenido |
| `approver` | lectura, aprobación y programación |
| `publisher` | lectura y publicación |
| `viewer` | lectura |

El actor autenticado contiene usuario, membresía, organización, roles y sesión.
El servidor vuelve a consultar usuario y membresía para cada solicitud: un
cambio de rol se aplica sin renovar la cookie. Deshabilitar la identidad,
revocar la membresía, cambiar la contraseña, vencer o revocar la sesión elimina
el acceso.

Las decisiones de autorización combinan permiso y `organizationId`. Una
operación sobre otra organización se representa como no encontrada en el caso
de uso o repositorio, sin revelar que el identificador existe.

### OrganizationConfiguration

`Organization` es la raíz del tenant. Su configuración reúne identidad
comercial, una `Brand` y sus `Location`; una publicación pertenece siempre a la
organización y puede limitarse a una ubicación de ese mismo tenant.

La lectura requiere `content:read`. Sólo `admin`, mediante
`organization:manage`, puede modificar nombre visible, razón social, defaults
de marca, contactos, dirección, horario, zona horaria o disponibilidad de una
sucursal. El `organizationId` y el autor se toman de la sesión, nunca del body.

Cada mutación declara la versión esperada. Cambiar identidad comercial compara
en una transacción las versiones de organización y marca; cambiar una sucursal
compara la versión de esa ubicación. Una carrera devuelve conflicto sin
escritura ni evento parcial. Los teléfonos argentinos se canonizan como `+54`
más diez dígitos, las zonas horarias deben ser IANA y cada rango `HH:mm` exige
apertura anterior al cierre.

Los eventos de configuración son append-only e incluyen actor, objetivo,
timestamp y documentos `before`/`after`. Una configuración nueva sólo afecta
trabajo futuro: el snapshot de una revisión aprobada conserva la marca y los
medios que tenía al aprobarse.

### ContentBrief y ContentBriefRun

El `ContentBrief` es la entrada estructurada que el motor visual y la revisión
humana consumen sin interpretar texto libre. Separa tres cosas que no pueden
mezclarse: hechos verificados —cada uno atado a una evidencia que recolectó el
servidor—, propuesta creativa y información faltante.

El modelo no declara evidencia propia. Antes de generar, el caso de uso arma un
ledger con las citas documentales y las observaciones comerciales de la
ejecución, y la validación exige que cada hecho cite una entrada existente,
capaz de sustentar ese tipo de afirmación y vigente cuando corresponde. Precio y
stock caducan a los 15 y 5 minutos; el resto se apoya en fuentes estables. Una
promoción no tiene fuente habilitada y queda bloqueada hasta que exista una
autorización humana versionada.

Un brief inválido no existe: el resultado del caso de uso es una unión
discriminada y sólo su variante generada contiene uno. Un faltante declarado o
un objetivo de promoción obligan a aprobación humana.

`ContentBriefRun` es el historial append-only de cada ejecución. Conserva
pedido, prompt y esquema versionados, modelo efectivo, herramientas ofrecidas e
invocadas, evidencia citada, uso y costo, y el brief cuando lo hubo. Una
restricción de base impide el estado híbrido: generado conserva brief sin
rechazo, rechazado conserva motivo sin brief. Si el historial no puede
escribirse, no se entrega brief.

### GenerationRun y GenerationRunVariant

`GenerationRun` es un lote de variantes y también la unidad append-only de una
edición. Un lote raíz se apunta a sí mismo con `lineageRootId`; un hijo conserva
además `parentRunId`, `parentVariantId`, clase `visual | factual` e instrucción.
La base impide raíces con datos de edición e hijos incompletos.

Una edición visual conserva el `ContentBriefRun` y exige una variante padre
exitosa, generada y compuesta. Una edición factual exige un brief generado,
posterior y distinto: cambiar precio, producto o promoción nunca se resuelve
sólo modificando píxeles.

Cada ejecución puede apuntar a una variante exitosa mediante
`selectedVariantId`. `selectionVersion` protege carreras y la selección conserva
actor y fecha. El puntero no cambia el estado de las variantes ni elimina las no
seleccionadas; seleccionar tampoco equivale a aprobar.

### Publication

Representa una intención editorial completa. Contiene brief, recursos,
aprobación y destinos.

Mientras está en `draft`, cada guardado crea una `PublicationRevision` nueva y
eleva la versión de la publicación mediante compare-and-swap. El cliente debe
enviar `expectedVersion`; una carrera devuelve conflicto y no crea una revisión
parcial. El título, texto, referencias comerciales y documento del motor de
diseño se validan antes de persistir.

La organización y membresía autora se derivan de la sesión. Una revisión sólo
puede adjuntar `MediaAsset` disponibles de esa organización y conserva por
ranura el identificador, texto alternativo, URL controlada, hash, dimensiones y
versión del almacenamiento. Publicación, revisión y referencias a medios se
escriben en una única transacción.

Las revisiones son append-only: editar significa agregar otra fila, no mutar la
anterior. El historial paginado expone `approvalSnapshotId` y `approvedAt`
cuando una revisión fue aprobada, aunque una edición posterior pase a ser la
vigente.

Solicitar render conserva la revisión vigente y mueve la publicación a
`generating_assets`. El worker genera un único `MediaAsset` derivado por
revisión; al confirmarlo, enlaza `renderedMediaAssetId`, marca la revisión
`in_review` y mueve la publicación a `ready_for_review`. Un reintento usa la
misma identidad y no agrega revisión ni medio.

Aprobar exige `content:approve`, la versión vigente y un render confirmado. La
misma transacción crea `ApprovalSnapshot`, marca la revisión `approved`, mueve
la publicación a `approved`, agrega la transición, auditoría y respuesta
idempotente. El snapshot autocontenido conserva contenido, hash, documento y
versión de diseño, medios de entrada y metadatos exactos del PNG derivado.

### PublicationTarget

Representa la entrega a un destino concreto. Cada destino tiene su propio
estado, intento, ID externo y error.

### Creative

Versión editable de contenido y composición. Una publicación puede tener varias
variantes, pero solo una versión final aprobada.

### MediaAsset

Archivo original o derivado, con hash, formato, dimensiones, origen y política
de eliminación. Su ciclo de vida persistente es:

```text
pending_upload -> available
       |             |
       v             v
     failed    pending_deletion -> deleted
```

La reserva se identifica por `organizationId + mediaAssetId`. Reintentar la
misma carga no crea otra fila; reutilizar ese identificador con otro propietario,
origen, nombre o contenido es conflicto. Un reemplazo siempre recibe otro
`mediaAssetId`: las revisiones y snapshots ya aprobados continúan apuntando a la
versión anterior.

Solo PNG y JPEG decodificables, de hasta 8 MiB, 8192 píxeles por dimensión y
40 millones de píxeles totales pueden quedar disponibles. El tipo declarado y
la extensión deben coincidir con el contenido detectado. `available` conserva
propietario, origen, SHA-256, bytes, dimensiones, clave, versión y URL HTTPS.

La lectura para edición sólo existe detrás del puerto del worker. El activo se
resuelve dentro del tenant y debe seguir `available`; los bytes recuperados se
inspeccionan otra vez y deben coincidir con SHA-256, tipo, tamaño y dimensiones
persistidos antes de alcanzar Images.

El borrado ocurre en dos fases. Antes de contactar al proveedor, la base bloquea
activos referenciados o dentro de retención y marca los demás como
`pending_deletion`; un reintento puede continuar esa eliminación sin volver a
decidir sobre otro activo. Adjuntar una revisión exige estado `available` y se
serializa contra la decisión de borrado mediante locks de fila.

La misma regla cubre `renderedMediaAssetId`, la base y la composición de una
variante. Un activo con cualquiera de esas referencias no puede comenzar su
borrado. La retención no vence una referencia: el barrido sólo elimina
huérfanos vencidos.

Los IDs deterministas nuevos de entradas visuales usan el namespace
`visual-input:v2` e incluyen `organizationId`. Los IDs históricos no se
reescriben y siguen resolviendo igual.

### GenerationPolicy y GenerationAttempt

`GenerationPolicy` pertenece a una organización y se modifica con versión
esperada. Fija habilitación, cuotas diarias por organización y membresía,
presupuesto mensual, umbral de alerta, UTC y ventanas de retención. Las
organizaciones existentes comienzan habilitadas con la política piloto; una
nueva comienza deshabilitada.

Cada intento tiene una sola transición monetaria válida:

```text
reserved -> in_flight -> settled
                   \-> unconfirmed
reserved -> released
```

Una reserva ocupa cuota y presupuesto. El intento diario se consume al entrar
`in_flight`; `settled` usa el costo calculado desde tokens por modalidad y
`unconfirmed` conserva la reserva máxima. El presupuesto comprometido suma los
tres componentes y se calcula por mes UTC.

### ImageQualityBaseline

La promoción de un prompt, perfil, modelo o composición exige una baseline de
calidad versionada. Sus verificaciones factuales son binarias: producto, precio,
stock, CTA y disclaimer deben coincidir con el snapshot; un fallo no puede
compensarse con estética. La identidad automática incluye el hash de la capa
determinista de cada perfil y formato; no incluye los bytes del fondo sintético,
cuya codificación puede variar entre plataformas sin cambiar la pieza.

El estado humano es `pending | approved | rejected`. `approved` sólo es válido
con la muestra completa, puntuaciones dentro de los umbrales, cero hallazgos
críticos y ambos roles (`business-owner`, `visual-reviewer`). El gate rechaza un
estado aprobado incompleto. La decisión propuesta y el procedimiento están en
[`ADR-017`](decisions/ADR-017-IMAGE-QUALITY-GATE.md) y la rúbrica en
[`IMAGE-QUALITY-EVALUATION.md`](../operations/IMAGE-QUALITY-EVALUATION.md).

### ProviderConnection

Conexión cifrada con OpenAI, Meta, Cloudinary o sistema comercial. Expone estado
y capacidades, nunca el secreto.

La primera implementación concreta es `MetaConnection`, aislada por
`organizationId` y acompañada por `MetaConnectionAsset`. La conexión conserva
la cuenta autorizante, permisos, vencimiento, versión y última comprobación;
los activos distinguen `page` de `instagram_business`. Sus estados de salud son
disjuntos: `healthy`, `token_expired`, `permission_revoked`, `asset_removed` y
`revoked`. Sólo `healthy`, con todos los permisos y ambos tipos de activo
vigentes, puede aportar capacidad de publicación.

`MetaOAuthTransaction` conserva únicamente SHA-256 de `state`, redirect URI
exacta, organización, membresía, sesión y vencimiento. Consumirla es atómico y
de un solo uso. Los tokens de usuario y Page se guardan como AES-256-GCM con
versión de llave, IV y tag; revocar elimina esas cuatro columnas, marca los
activos removidos y agrega auditoría sin borrar la conexión histórica.

### KnowledgeDocument

Fuente documental aprobada e identificada por
`organizationId + sourceKey`. Cada contenido distinto crea una
`KnowledgeDocumentVersion` inmutable con SHA-256, versión, vigencia, ámbito de
sucursales, aprobación y referencias remotas de File Search.

El ciclo persistente es:

```text
pending_upload -> uploaded -> indexing -> active
                         \-> sync_failed -> reconciliar
active anterior -> superseded
active -> retiring -> retired
```

Repetir el mismo hash dentro de la fuente devuelve la versión existente. Una
versión sólo puede quedar activa cuando OpenAI informa `completed` y sus
atributos remotos se actualizaron a `approved`. El reemplazo cambia
atómicamente el puntero activo y marca la versión anterior `superseded`.

El retiro primero elimina el puntero activo en PostgreSQL y marca
`retiring`; después contacta al proveedor. Así una fuente deja de ser elegible
para consultas nuevas aunque la eliminación remota sea eventualmente
consistente o requiera reintento. `sync_failed` y `retiring` conservan
diagnóstico seguro y referencias suficientes para reconciliar el estado.

### RecurringRule

Regla que materializa publicaciones futuras. No publica directamente.

## Máquina de estados

```text
draft
  -> retrieving_context
  -> missing_information | generating_assets
  -> generation_failed | ready_for_review
  -> approved
  -> scheduled | publishing
  -> partially_published | publish_failed | published
```

Estados terminales adicionales:

- `cancelled`
- `expired`

## Invariantes

1. `approved` requiere versión final inmutable y aprobador identificado.
2. `scheduled` requiere fecha futura, timezone y al menos un destino pendiente.
3. `publishing` requiere conexión válida y clave de idempotencia.
4. `published` requiere éxito de todos los destinos activos.
5. `partially_published` requiere al menos un éxito y un fallo.
6. Un destino publicado nunca vuelve a estado pendiente por reintento.
7. Precio y stock publicables requieren fuente y vigencia.
8. Un cambio de contenido posterior a la aprobación invalida la aprobación.
9. Una regla recurrente materializa instancias auditables.
10. OpenAI no puede efectuar la transición a `publishing`; solo la aplicación.

## Política de aprobación

- Productos, precio, promociones y contenido generado con IA: aprobación humana.
- Historias rutinarias sin datos comerciales: autoaprobación solo mediante
  política específica, versionada y habilitada por administrador.
- Cambios de horario, feriados o datos de contacto: aprobación humana.
- En Fases 0 a 5 toda publicación real requiere aprobación manual.

## Errores parciales

Cada destino se ejecuta de forma independiente. El agregado calcula el estado:

- todos pendientes: publicación pendiente;
- alguno publicando: publicando;
- todos publicados: publicado;
- mezcla de publicado y fallido: publicación parcial;
- todos fallidos: publicación fallida.

## Idempotencia

La clave mínima combina:

- publicación;
- versión final;
- destino;
- ocurrencia programada.

La respuesta externa se guarda dentro de la misma transición protegida. Antes de
reintentar se consulta el registro local y, cuando la API lo permite, el estado
externo.

## Aplicación de transiciones

`packages/domain` contiene la matriz exhaustiva y comandos discriminados:
avanzar, aprobar, fallar, cancelar, expirar y editar contenido aprobado. Aprobar
no es un `advance` genérico: exige snapshot, revisor y timestamp. Cancelar,
expirar y registrar un fallo también exigen comandos propios para no perder
motivo ni diagnóstico.

La política inicial para editar contenido aprobado es siempre crear otra
revisión y volver a `draft`; la aprobación anterior queda en el historial, pero
deja de ser la aprobación vigente. No se modifica una revisión ni un snapshot
aprobado.

Cada comando declara `expectedVersion`. Persistencia hace compare-and-swap de
estado y versión y agrega `PublicationStateTransition` en la misma transacción.
Perder la carrera devuelve conflicto; nunca informa éxito ni agrega un evento
parcial. El historial es append-only.
