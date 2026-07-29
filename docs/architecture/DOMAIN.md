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

### Publication

Representa una intención editorial completa. Contiene brief, recursos,
aprobación y destinos.

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

El borrado ocurre en dos fases. Antes de contactar al proveedor, la base bloquea
activos referenciados o dentro de retención y marca los demás como
`pending_deletion`; un reintento puede continuar esa eliminación sin volver a
decidir sobre otro activo. Adjuntar una revisión exige estado `available` y se
serializa contra la decisión de borrado mediante locks de fila.

### ProviderConnection

Conexión cifrada con OpenAI, Meta, Cloudinary o sistema comercial. Expone estado
y capacidades, nunca el secreto.

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
