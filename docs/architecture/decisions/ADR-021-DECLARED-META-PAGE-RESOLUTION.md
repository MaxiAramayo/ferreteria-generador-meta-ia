# ADR-021: la Page de Meta se resuelve por identificador declarado

- Estado: aceptado
- Fecha: 2026-08-18
- Tarea: `P5-T02`

## Contexto

El descubrimiento de activos de `P5-T02` enumeraba `GET /me/accounts` y derivaba
de cada Page su cuenta de Instagram vinculada. Contra la cuenta real de Aramayo
esa enumeración devuelve siempre una colección vacía, y una conexión válida
termina en salud `asset_removed` sin poder publicar.

El diagnóstico se hizo contra staging el 2026-08-18 y descartó tres causas con
evidencia, no por inferencia:

1. **No es el código.** `me/accounts` devuelve `{"data": []}` también desde el
   Explorador de la API Graph, con la misma app, los mismos cinco permisos y la
   misma versión `v26.0`, fuera de la infraestructura de la plataforma.
2. **No es el consentimiento.** En las Integraciones empresariales de la persona
   administradora, la Page figura concedida bajo `pages_show_list` y bajo
   lectura de contenido, y la cuenta de Instagram también.
3. **No es el tipo de diálogo.** Un token emitido a través de la configuración
   de Inicio de sesión con Facebook para empresas devuelve exactamente lo mismo.

La causa quedó confirmada con un resultado positivo: consultar la Page por su
identificador, con ese mismo token, devuelve nombre, `access_token` de Page y
`instagram_business_account` con su identificador y usuario.

`GET /me/accounts` enumera las Pages donde la persona tiene rol propio sobre la
Page. La Page de Aramayo pertenece al portfolio empresarial y la persona la
administra por asignación de negocio —figura con acceso total en Configuración
del negocio—, así que la enumeración no la incluye aunque el permiso exista y el
acceso directo funcione.

La alternativa de enumerar por `GET /{business-id}/owned_pages` exige
`business_management`, un permiso fuera del alcance que `P5-T01` aprobó, con su
propia justificación de App Review y más superficie sobre el portfolio.

## Decisión

1. La conexión de Meta administra los activos de **una Page declarada**. Su
   identificador se configura en `META_PAGE_ID` y pertenece al grupo atómico de
   Meta: los cinco valores se cargan juntos o la integración queda deshabilitada.
2. `MetaGraphPort.discover()` resuelve esa Page con `GET /{page-id}` pidiendo
   `id,name,access_token,instagram_business_account{id,username}`. Deja de
   enumerar `me/accounts`.
3. El descubrimiento distingue dos fallas que antes se confundían:
   - Meta responde que el objeto no existe o no es visible para la credencial
     —código `100` o `404`—: el descubrimiento devuelve **cero activos** y la
     salud lo clasifica como `asset_removed`;
   - cualquier otra falla de Meta **se propaga**. Un corte transitorio no
     declara un activo removido.
4. El alcance de permisos no cambia. Siguen siendo los cinco de `P5-T01` y no
   se agrega `business_management`.
5. La cuenta y los permisos se siguen leyendo de `me` y `me/permissions`: la
   decisión sólo cambia cómo se localiza el activo.

## Consecuencias

- La plataforma deja de descubrir Pages que la persona administre y no estén
  declaradas. Es intencional: el activo publicable es una decisión de
  configuración y no algo que se infiera de los roles de quien conecta.
- Conectar una segunda Page exige una decisión explícita —otro identificador
  declarado— y no ocurre por el solo hecho de que alguien tenga acceso. Eso
  reduce el riesgo de publicar en un activo equivocado.
- El grupo atómico de Meta pasa de cuatro a cinco variables. Un entorno que ya
  tenía Meta habilitada no arranca hasta cargar `META_PAGE_ID`; el arranque
  falla nombrando la variable y sin revelar valores, igual que el resto del
  grupo.
- `asset_removed` gana precisión: ahora significa que el activo declarado no
  está disponible, y ya no se produce por una enumeración que nunca iba a
  devolver nada.
- La verificación de OAuth en staging de `P5-T02` sigue pendiente: esta decisión
  habilita repetirla con activos poblados, no la sustituye.

## Aprobación

El usuario eligió el 2026-08-18 resolver la Page por identificador declarado
antes que ampliar permisos, después de que el diagnóstico descartara las otras
causas. La decisión cubre el cambio de descubrimiento y la variable nueva; no
autoriza publicar en Meta ni rehacer el despliegue de staging.
