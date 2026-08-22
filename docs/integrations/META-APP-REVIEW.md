# Paquete de Meta App Review

Revisado contra la implementación y la documentación oficial disponible:
2026-08-21.

## Estado

El paquete técnico está **desplegado en staging pero no listo para enviar**.
Las URLs, callbacks, justificaciones y guion están definidos. El negocio eligió
usar la Page real de Aramayo y `@ferreteria_aramayo`; no se crearán activos de
prueba separados. Las dos aprobaciones humanas requeridas fueron recibidas:

1. ~~aprobación administrativa del texto legal y del nombre público~~ —recibida
   el 2026-08-21;
2. ~~aprobación concreta del bitmap, copy, destinos, ventana y responsable de
   la publicación técnica sobre los activos reales~~ —recibida el 2026-08-21.

El segundo punto es un conflicto con
[ADR-019](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md):
esa decisión rechaza activos Meta de prueba separados y exige autorización
concreta para cada escritura en los activos existentes. App Review puede probar
la aplicación siguiendo el screencast, y los dos permisos de publicación sólo
se demuestran con una escritura. La autorización acotada quedó vinculada al
checksum, copy, destinos y ventana que se definen debajo.

El 2026-08-21 el SHA `c5e9d7d4764ece01e2f1a461d443fee40379afd6`
quedó sano en staging y la app Meta `2161967167868736` persistió nombre,
dominio, privacidad, términos, callback de eliminación, callback de
desautorización y redirect OAuth. No se pulsó **Publicar**, no se abrió un envío
de App Review y no se ejecutó contenido.

## Aprobaciones requeridas del negocio

### Identidad, textos y canales

El responsable debe aprobar expresamente:

- nombre público: **Aramayo Content Platform**;
- marca responsable: **Ferretería y Lubricentro Aramayo**;
- dominio: **staging.content.ferreteriaaramayo.com.ar** y los endpoints API
  listados en la matriz;
- política de privacidad, términos e instrucciones de eliminación vigentes;
- teléfono **3854 403534** y domicilios **República de Siria 365** y
  **Rivadavia 673**, Frías, como canales públicos correctos.

### Única prueba de publicación permitida

La autorización concreta final se registra sólo después de presentar al negocio
el preview y checksum del bitmap. Debe quedar fijada con estos límites:

| Término | Valor a aprobar |
|---|---|
| Activos | Page real de Aramayo y `@ferreteria_aramayo` |
| Dataset visible | Sólo “Muestra técnica de App Review” en staging |
| Media | [`assets/meta-app-review-technical.png`](assets/meta-app-review-technical.png), 1080×1350, 103.721 bytes, rotulado “PRUEBA TÉCNICA · APP REVIEW”, sin producto, precio, stock ni promoción |
| SHA-256 | `91a4fd42bd7ecfd60f10f1862e8081124993683de34883a46a7bea547cbc74f0` |
| Copy aprobado | “Publicación de prueba para la revisión técnica de Aramayo Content Platform. Sin oferta comercial.” |
| Destinos | `instagram_feed` y `facebook_page`; no historia |
| Límite | Una publicación confirmada por destino mediante una única orden idempotente |
| Ventana | Desde la entrega de credenciales temporales hasta la decisión de Meta, con máximo de 30 días corridos |
| Supervisión | Responsable del negocio que otorgó la aprobación y asumió la supervisión humana |
| Retiro | Manual después de la decisión de Meta; nunca compensación automática |

El revisor no recibe permiso para crear otra pieza, cambiar el copy, agregar un
destino, publicar historias ni repetir una orden con otra clave. Si la respuesta
remota es ambigua, el sistema reconcilia y deriva a una persona; no vuelve a
publicar.

La autorización fue recibida el 2026-08-21. Cualquier regeneración reemplaza el
checksum y devuelve el artefacto a estado pendiente; no se puede heredar esta
aprobación a otros bytes.

## Identidad y URLs exactas

El nombre a presentar es **Aramayo Content Platform**. La marca visible es
**Ferretería y Lubricentro Aramayo**. “Staging” identifica el ambiente y no es
parte del producto.

| Campo de Meta | Staging |
|---|---|
| Dominio de la app | staging.content.ferreteriaaramayo.com.ar |
| Política de privacidad | https://staging.content.ferreteriaaramayo.com.ar/legal/privacy |
| Términos | https://staging.content.ferreteriaaramayo.com.ar/legal/terms |
| Instrucciones de eliminación | https://staging.content.ferreteriaaramayo.com.ar/legal/data-deletion |
| Callback de eliminación | https://api.staging.content.ferreteriaaramayo.com.ar/integrations/meta/data-deletion |
| Callback de desautorización | https://api.staging.content.ferreteriaaramayo.com.ar/integrations/meta/deauthorize |
| OAuth redirect | https://api.staging.content.ferreteriaaramayo.com.ar/oauth/meta/callback |

El Dashboard vigente ofrece instrucciones públicas y callback de eliminación
como alternativas de un mismo campo. Se seleccionó el callback firmado; la URL
de instrucciones continúa pública y es la referencia legal para personas. El
nombre, dominio y las direcciones configurables se comprobaron tras recargar el
Dashboard. El ícono todavía requiere aprobación y carga antes de enviar.

## Alcance que se presenta

Sólo se presentan imagen en feed de Instagram, imagen en historia de Instagram
e imagen con copy en Facebook Page. No se presentan anuncios, Reels,
carruseles, comentarios, mensajes, insights ni gestión general del portfolio.

**public_profile** puede aparecer como permiso implícito de Facebook Login, pero
la aplicación no lo incluye en scope. Los cinco permisos explícitos viven en
**metaRequiredPermissions**; cualquier diferencia entre esta tabla, el diálogo
OAuth y el formulario de Meta detiene el envío.

## Justificación por permiso

### pages_show_list

Permite vincular la autorización humana con la Page declarada que Aramayo
administra y obtener la credencial de Page necesaria para operar sus destinos.
Después del consentimiento, Configuración muestra una única Page autorizada,
nunca una lista fija del cliente. La API resuelve la Page y cifra el token, que
no aparece en pantalla. Sin el permiso no puede comprobar la autorización ni
obtener la credencial con la que publica Facebook e Instagram.

### pages_read_engagement

Permite leer los datos mínimos de la Page y su vínculo con la cuenta profesional
de Instagram. La tarjeta de conexión muestra el nombre de la Page y la cuenta
Instagram Business vinculada. No se leen comentarios, mensajes, seguidores ni
insights. Sin el permiso no se puede confirmar que ambos destinos pertenecen a
la Page autorizada.

### instagram_basic

Identifica la cuenta Instagram Business vinculada y su nombre de usuario para
que la persona sepa dónde publicará. Configuración muestra la cuenta y la
confirmación de publicación la nombra como destino. Sin el permiso no se puede
resolver ni mostrar Instagram antes de una acción irreversible.

### instagram_content_publish

Publica una imagen aprobada en feed o historia. La confirmación muestra bitmap,
copy y destino; el resultado muestra el identificador remoto. En historias no
se envía caption porque Meta lo descarta. Sin el permiso Instagram queda sólo
para lectura.

### pages_manage_posts

Prepara una foto y publica un post con el copy aprobado en la Facebook Page. El
resultado muestra un desenlace e identificador independientes de Instagram. Sin
el permiso no puede publicarse el snapshot aprobado en la Page.

## Usuario de revisión

Las credenciales nunca se escriben en Git, documentación, capturas o video. El
administrador de identidad crea una cuenta individual, temporal y rotulada para
App Review; entrega URL, usuario y contraseña únicamente en el campo privado de
instrucciones de Meta.

Condiciones del usuario:

- pertenece sólo al ambiente staging;
- no reutiliza la identidad ni contraseña de una persona real;
- expira o se revoca al terminar la revisión;
- recibe admin, editor, approver, publisher y viewer sólo durante la ventana
  aprobada y para el dataset sintético;
- ve una publicación sintética rotulada para revisión, sin precios, stock,
  clientes ni información comercial interna;
- no accede a infraestructura, secretos ni configuración del proveedor.

Estado operativo del 2026-08-21: la identidad fue creada individualmente en
staging con los cinco roles, pero permanece `disabled` y sin sesiones. La base
conserva sólo Argon2id; el texto plano está únicamente en el Llavero local. La
auditoría exige activación explícita y máximo de 30 días desde la entrega. Como
no se autorizó enviar la revisión, la credencial no fue cargada en Meta y la
ventana todavía no comenzó.

Con los activos reales elegidos, el usuario de staging sólo debe ver el dataset
sintético de revisión. El bitmap, copy, ventana, destinos, responsable y retiro
posterior ya quedaron aprobados por escrito; antes de entregar el usuario se
deben verificar nuevamente contra el manifiesto.

## Guion del screencast

Grabar a resolución legible, velocidad normal y sin cortes que oculten pasos.
El video no muestra tokens, contraseñas, variables, consola ni datos privados.

1. **00:00 — Identidad.** Mostrar nombre, dominio staging y las tres URLs
   legales públicas sin sesión.
2. **00:25 — Acceso.** Ingresar como usuario temporal de revisión.
3. **00:45 — OAuth.** Abrir Configuración, elegir “Conectar Meta” y mostrar el
   consentimiento con los cinco permisos.
4. **01:25 — Descubrimiento.** Mostrar cuenta, Page, Instagram Business,
   permisos y salud. Demuestra pages_show_list, pages_read_engagement e
   instagram_basic.
5. **02:00 — Snapshot.** Abrir la pieza sintética aprobada y mostrar bitmap,
   checksum, copy exacto, cuenta y destinos.
6. **02:35 — Publicación.** Confirmar una vez y mostrar resultado e IDs remotos.
   Demuestra instagram_content_publish y pages_manage_posts.
7. **03:20 — Idempotencia.** Recargar y mostrar la misma orden sin duplicado.
8. **03:40 — Revocación.** Revocar la conexión y mostrar que ya no publica.
9. **04:10 — Eliminación.** Mostrar instrucciones públicas y una confirmación
   producida por el callback firmado.

Las instrucciones pegadas en Meta deben seguir ese orden. Cada permiso enlaza
al minuto en que su resultado se ve.

## Instrucciones para el revisor

1. Abrir la URL staging entregada en el campo privado.
2. Ingresar con las credenciales temporales.
3. Abrir **Configuración → Facebook e Instagram**.
4. Abrir **Publicaciones** y elegir “Muestra técnica de App Review”.
5. Elegir **Publicar…**, comparar bitmap, copy, cuenta y destinos, y confirmar.
6. Esperar el resultado independiente de Instagram y Facebook.
7. Recargar y comprobar que la orden y los identificadores son los mismos.
8. Revocar la conexión si el paquete privado lo indica.

No se le pide conocer IDs, correos internos, configuración ni secretos.

## Verificación técnica reproducible

- Firma válida HMAC-SHA256: procesa la cuenta indicada por user_id.
- Firma inválida, algoritmo distinto o payload incompleto: HTTP 400 sin leer ni
  modificar conexiones.
- Desautorización: elimina tokens y corta capacidad.
- Eliminación: elimina además permisos, nombres, usernames e identificadores
  aportados por Meta.
- Repetición: una cuenta ya ausente se reconoce como completada.
- Respuesta: contiene url y confirmation_code, con código opaco firmado.
- Estado: la URL pública valida el código sin revelar la cuenta.

Las unitarias cubren firma, servicio y confirmación. pnpm db:test cubre la
eliminación real y transaccional en PostgreSQL.

### Checklist antes de enviar

- [x] Responsable del negocio aprobó privacidad, términos y canales de contacto
      el 2026-08-21.
- [x] Administrador de Meta confirmó nombre, dominio y URLs configurables el
      2026-08-21.
- [ ] Ícono público aprobado y cargado en Meta.
- [x] Se eligió y documentó la estrategia de activos para el revisor: activos
      reales con autorización puntual recibida el 2026-08-21.
- [x] Usuario temporal creado `disabled`, sin sesiones y con secreto sólo en el
      Llavero.
- [ ] Usuario activado y credenciales cargadas sólo en el campo privado de Meta.
- [x] Dataset sintético aprobado y sin afirmaciones comerciales.
- [ ] Guion recorrido de punta a punta en staging.
- [ ] Screencast final reproduce exactamente las instrucciones.
- [ ] Los cinco permisos y ningún otro están en la presentación.
- [ ] Revocación y eliminación probadas en staging con evidencia redactada.
- [ ] Usuario temporal y conexión de revisión tienen plan de baja.

## Fuentes oficiales

- [Guía de presentación de App Review](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
- [Callback de eliminación](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)
- [Publicación de Instagram](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Permisos de Facebook Login](https://developers.facebook.com/docs/permissions)
- [Publicaciones de Pages API](https://developers.facebook.com/docs/pages-api/posts/)
