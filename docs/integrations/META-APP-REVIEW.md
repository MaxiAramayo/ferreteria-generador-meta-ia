# Paquete de Meta App Review

Revisado contra la implementación y la documentación oficial disponible:
2026-08-31. La consulta de referencias Graph devolvió HTTP 429; no se cambiaron
permisos ni contratos. La ficha oficial del producto sí pudo verificarse.

## Estado

### Autorización vigente del 2026-08-31

El usuario aprobó la imagen y copy que figuran debajo y pidió «publica nomas,
y continua». Se registra una orden inmediata con `instagram_feed` y
`facebook_page`, sin precio y sin destinos adicionales. La huella presentada
`7e44022a2020875ba420e99736711b7f8953051d6afb6bb8d462f59a460b012e`
queda fijada en el manifiesto. Esto sustituye las menciones históricas a
aprobación pendiente de esta misma candidata, no las restricciones de acceso
ni el máximo de una orden. No se ha enviado todavía App Review.

Odoo revalidó identidad y seis unidades en cada sucursal el 2026-08-31 a las
14:26:39–40Z. Request IDs: producto `f1297c94-0fff-4c63-a01a-c38dd7b01025`,
Casa Central `8ede2ee5-afc2-4a03-ad79-f1d595517e18`, Rivadavia
`2021f32e-4b41-4a0b-bad5-00afeeb5d339`. Se conserva el snapshot histórico de
la aprobación sin reescribirlo. La conexión revalidó los cinco permisos y ambos
activos a las 14:32:09Z. No había órdenes ni trabajos pendientes.

El provisionador conserva la publicación y agrega revisión, medios y snapshot
nuevos; sólo admite reemplazar la muestra técnica exacta, sin ninguna orden,
con lock y control de versión. Nunca edita ni elimina el snapshot anterior.
El original PNG se carga en Cloudinary staging y se verifica por checksum;
`--delivery=<comprobante.json>` es obligatorio para evitar una URL de publicación
que no exista en el almacenamiento usado por el worker. El comprobante valida
organización, original, formato, tamaño, cloud y espacio staging. La variante
JPEG para Meta la resuelve el adaptador existente.


El paquete está **en reemplazo y no está listo para enviar**.
Las URLs, callbacks, justificaciones y guion están definidos. El negocio eligió
usar la Page real de Aramayo y `@ferreteria_aramayo`; no se crearán activos de
prueba separados. La aprobación administrativa sigue vigente, pero la
aprobación de la publicación se renovó el 2026-08-31:

1. ~~aprobación administrativa del texto legal y del nombre público~~ —recibida
   el 2026-08-21;
2. aprobación concreta del nuevo bitmap comercial, copy, destinos, ventana y
   responsable —**pendiente**.

El segundo punto es un conflicto con
[ADR-019](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md):
esa decisión rechaza activos Meta de prueba separados y exige autorización
concreta para cada escritura en los activos existentes. App Review puede probar
la aplicación siguiendo el screencast, y los dos permisos de publicación sólo
se demuestran con una escritura. La autorización anterior quedó revocada por el
negocio el 2026-08-22 al descartar la placa técnica; no puede heredarse al nuevo
checksum ni copy.

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
| Dataset visible | Sólo “LA-SER Inverter 160 A” en staging |
| Media candidata | `meta-app-review-soldadoras.png`, 1080×1350, 1.146.451 bytes; foto completa dentro de un marco construido con la misma escena desenfocada, rotulada “Imagen ilustrativa”; muestra marca y amperaje, invita a “Consultar precio” en tipografía de cuerpo y nombra Casa Central y Rivadavia; sin importe, rótulo de precio minorista, referencia ni SKU; CTA rojo “Escribinos”, sin verde |
| Generación | Una escena creada con la IA integrada del chat; cero llamadas a la API de imágenes de la plataforma |
| Evidencia comercial | Odoo `odoo-product-3941`: LA-SER Inverter 160 A; 6 unidades en Casa Central y 6 en Rivadavia; última verificación 2026-08-24T23:20:16Z. Identificadores y precios anteriores quedan sólo como evidencia histórica interna, no se publican. |
| Referencia del proveedor | [Ficha oficial LA-SER](https://www.la-ser.com.ar/productos/discovery-225-mma/), revisada el 2026-08-31: equipo MMA, 20–160 A, 245×180×170 mm y 2,5 kg. Dimensiones y peso respaldan “compacta y liviana”. No se prometen materiales o espesores específicos. |
| Regla comercial | Reconsultar identidad y ambos stocks antes de publicar; si difieren del paquete aprobado, invalidarlo. No se exige fijar un precio para una pieza que sólo invita a consultarlo. |
| SHA-256 candidato | `407de4f95c8e18f4c52fa0544785f06f81fe9832de1032a3ac7e977fa0ca7d43` |
| Copy candidato | Texto exacto debajo de la tabla; cuatro párrafos, dos emojis, sin precio ni repetición del aviso ilustrativo |
| Destinos | `instagram_feed` y `facebook_page`; no historia |
| Límite | Una publicación confirmada por destino mediante una única orden idempotente |
| Ventana | Desde la entrega de credenciales temporales hasta la decisión de Meta, con máximo de 30 días corridos |
| Supervisión | Responsable del negocio que otorgó la aprobación y asumió la supervisión humana |
| Retiro | Manual después de la decisión de Meta; nunca compensación automática |

Copy exacto de la candidata `meta-app-review/2026-08-31.1-candidate`:

```text
Soldadora inverter LA-SER 160 A: para unir piezas de metal y dar forma a tus proyectos de herrería. 🔧

Compacta y liviana, para llevarla donde necesitás trabajar.

Disponible en nuestros negocios: Casa Central (República de Siria 365) y sucursal Rivadavia (Rivadavia 673), Frías.

📲 Consultanos el precio por WhatsApp al 3854 403534.
```

El usuario pidió este cambio el 2026-08-31: no mostrar precio, explicar utilidad,
nombrar los negocios, evitar lenguaje de verificación en el copy y admitir pocos
emojis. «Imagen ilustrativa» permanece visible en el bitmap y en el texto
alternativo accesible; no se repite en el caption. Estas correcciones no
autorizan publicación, acceso del revisor ni envío de App Review.

El revisor no recibe permiso para crear otra pieza, cambiar el copy, agregar un
destino, publicar historias ni repetir una orden con otra clave. Si la respuesta
remota es ambigua, el sistema reconcilia y deriva a una persona; no vuelve a
publicar.

El paquete está `approved-for-single-app-review-order` desde el pedido explícito del 2026-08-31. El provisionador y el generador
de artefacto aprobado fallan de forma explícita mientras no se registren la
nueva aprobación, fecha y checksum. `--candidate` sólo produce evidencia local
y no escribe en staging ni en Meta.

### Control local de aprobación del paquete (2026-08-31)

`tools/meta-app-review/approval.ts` comparte el mismo control entre el generador
y el provisionador. No basta con conservar el checksum del PNG: la huella
`meta-app-review-approval/v1` también fija el documento determinista, todos los
campos del manifiesto, el copy, evidencia comercial, destinos, permisos,
identidad temporal y condiciones de revisión. Sólo excluye los campos que
registran la aprobación misma. Cambiar el orden de claves JSON no cambia la
huella; modificar contenido, versión o condiciones sí la invalida.

Para preparar evidencia sin aprobar ni publicar:

```bash
pnpm meta-review:artifact --candidate
pnpm meta-review:test
```

El primer comando produce PNG y JSON en `output/meta-app-review-candidate/`.
El JSON conserva el checksum de imagen en `sha256`, la huella del paquete en
`approvalPackageSha256`, diseño, evidencia y condiciones. Siempre se rotula como
candidata pendiente, incluso si existe una aprobación anterior en el manifiesto.

Sólo después de obtener aprobación humana concreta se registran en
`manifest.ts` el estado aprobado, `sha256`, la fecha `approvedAt` en formato
`YYYY-MM-DD` y `publicationApproval.packageSha256` con la huella presentada al
negocio. No se recalcula una huella para conservar una aprobación de otra
versión: si cambia el paquete, hay que volver a presentarlo. El provisionador
registra la huella aprobada en su evento de auditoría. Ambos comandos rechazan
una aprobación incompleta o que no coincida antes de abrir el navegador,
consultar activos públicos o acceder a la base de datos.

Esto verifica integridad del alcance, no actualidad comercial ni autorización
para ejecutar acciones remotas. Identidad y stock siguen exigiendo reconsulta
antes de publicar; el precio se omite por decisión del negocio. Activar el
usuario, desplegar o enviar App Review requieren sus
autorizaciones respectivas. Esta sesión no consultó Odoo ni modificó staging.

La candidata anterior de herramientas eléctricas, SHA-256
`21f1e5d2af47aeca4d71a353b3aac256d1b85c2d81c649398914d8bd082208c1`,
fue descartada antes de aprobarse porque el negocio confirmó que esa misma
publicación ya había salido. No puede provisionarse ni recuperar una aprobación
anterior.

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
Dashboard. El usuario eligió el 2026-08-31 el isotipo **A** usado en la pieza,
no la placa tipográfica anterior. Se reutiliza `AramayoMark` con rojo de marca
sobre fondo oscuro, también en el favicon del panel. El PNG de 1024×1024 se
genera junto con la candidata como `aramayo-app-icon.png`; su SHA-256 es
`7a9d59c2294ac3a7515ca4aae0be61bc5d02bca87f4d468dbcffccb9a5cb31b0`.
Falta cargarlo en Meta, no volver a elegir otro diseño.

El usuario indicó omitir el correo si es opcional. Sólo si Meta lo exige para
enviar se usa el contacto autorizado, conservado localmente fuera de Git en
`output/meta-app-review-private/contact.json`, con modo `0600`. No se incluye
en la publicación, la imagen ni las URLs legales. No se cargó en Meta.

## Alcance que se presenta

Sólo se presentan una imagen en el feed de Instagram y una imagen con copy en
Facebook Page. No se presentan historias, anuncios, Reels,
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

Publica la imagen aprobada en el feed. La confirmación muestra bitmap, copy y
destino; el resultado muestra el identificador remoto. Aunque la plataforma
también implementa historias, la orden de App Review las excluye mediante una
política de destinos exactos. Sin el permiso Instagram queda sólo para lectura.

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
- recibe admin, publisher y viewer sólo durante la ventana aprobada y para el
  dataset acotado;
- ve únicamente la pieza aprobada y sus afirmaciones públicas de producto y
  disponibilidad, sin inventarios detallados, costos, márgenes ni datos de
  clientes;
- no accede a infraestructura, secretos ni configuración del proveedor.

Estado operativo del 2026-08-22: la identidad fue creada individualmente en
staging con los tres roles mínimos, pero permanece `disabled` y sin sesiones. La base
conserva sólo Argon2id; el texto plano está únicamente en el Llavero local. La
auditoría exige activación explícita y máximo de 30 días desde la entrega. Como
no se autorizó enviar la revisión, la credencial no fue cargada en Meta y la
ventana todavía no comenzó.

Con los activos reales elegidos, el usuario de staging sólo debe ver el dataset
acotado de revisión. El bitmap y copy nuevos siguen pendientes; el usuario no
se activa ni se entrega hasta verificarlos contra el manifiesto aprobado.

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
5. **02:00 — Snapshot.** Abrir la pieza comercial aprobada y mostrar bitmap,
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
4. Abrir **Publicaciones** y elegir “LA-SER Inverter 160 A”.
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
- [x] Isotipo A seleccionado por el usuario el 2026-08-31 y PNG preparado.
- [ ] Ícono público cargado en Meta.
- [x] Se eligió y documentó la estrategia de activos para el revisor: activos
      reales con autorización puntual recibida el 2026-08-21.
- [x] Usuario temporal creado `disabled`, sin sesiones y con secreto sólo en el
      Llavero.
- [ ] Usuario activado y credenciales cargadas sólo en el campo privado de Meta.
- [x] Nueva pieza comercial sin precio, copy y checksum aprobados; marca,
      identidad y stock están respaldados por el snapshot de Odoo y deben
      revalidarse antes de publicar.
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
