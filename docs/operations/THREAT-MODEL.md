# Threat model

Revisión: 2026-09-09, tarea `P7-T01`. Cubre la plataforma completa tal como está
en `main`: API, panel, worker, base, cola y los cuatro proveedores externos.

Cada amenaza se responde con evidencia verificable, no con una afirmación. Donde
la defensa es una prueba, se nombra la prueba: lo que ningún comando comprueba
puede romperse mañana sin que nadie lo note.

## Límites de confianza

1. **Público → Caddy.** Único ingreso. Expone panel y API por HTTPS.
2. **Panel → API.** Cruza origen: cookie de sesión `HttpOnly`, CSRF por token y
   verificación de `Origin` en toda mutación.
3. **API → PostgreSQL / Redis.** Red privada del Compose; sin puertos públicos.
4. **API → worker.** No hay llamada directa: la intención viaja por `outbox` en
   la misma transacción que la escribe.
5. **Worker → proveedores.** OpenAI, Meta, Cloudinary y el sistema comercial.
   Salidas, nunca entradas: ningún proveedor abre una conexión hacia adentro,
   salvo los tres callbacks de cumplimiento de Meta.

Todo lo que cruza el límite 1 es hostil hasta demostrar lo contrario. Lo que
llega por el 5 —respuestas de proveedor, documentos recuperados— es **dato**, no
instrucción ni autoridad.

## Amenazas modeladas

### Abuso de tokens

Los tokens de Meta se cifran con AES-256-GCM y vector de inicialización aleatorio
por registro, con claves versionadas en `TOKEN_ENCRYPTION_KEYS`. Nunca salen en
una respuesta, en un log ni en una alerta: la redacción del emisor los tapa por
nombre de campo y por forma —`EAA…` tiene su propio patrón— y la bandeja
operativa persiste sólo identificadores internos y códigos.

La sesión propia vive en cookie `HttpOnly` y `SameSite`, con `__Host-` fuera de
desarrollo. Cerrar sesión revoca; `logout-all` revoca todas.

### SSRF

**Ninguna entrada de la API acepta una URL.** No hay DTO con una, no hay ruta
multipart y el worker nunca busca una dirección que haya elegido una persona:

- la URL de un medio la devuelve Cloudinary al subir los bytes, y se rechaza si
  no pertenece al cloud propio (`#isOwnedSecureUrl`);
- la lectura pública que decide si Meta alcanza la pieza usa esa misma URL, con
  `redirect: "error"`: una redirección se trata como inalcanzable;
- Graph API se arma sobre un origen constante con identificadores propios;
- el sistema comercial usa la base configurada, `GET` únicamente y con token
  propio.

El panel sirve activos por lista blanca (`BRAND_ASSETS`): cualquier otra ruta
responde 404 sin tocar el disco.

### Uploads

Los bytes se validan antes de almacenarse —tipo declarado contra contenido real,
tamaño máximo, dimensiones y checksum— y después se comparan contra lo que
devolvió el proveedor: si no coinciden, la carga se marca fallida en vez de
confirmarse. El procesamiento usa sharp, que quedó en 0.35.4 para cerrar las
vulnerabilidades heredadas de libvips y libheif; es la dependencia más expuesta
del sistema porque toca lo que llega de afuera.

### Prompt injection

La defensa es estructural antes que textual:

- **la evidencia la emite el servidor**, no el modelo. Lo que el modelo escribe
  no sirve como prueba de un precio, un stock o un horario;
- **organización y sucursal se derivan de la sesión**, nunca de un argumento del
  modelo;
- las herramientas comerciales son de sólo lectura, acotadas en filas, campos y
  tiempo, y auditadas por llamada;
- el prompt declara que documentos y resultados de herramientas son datos y no
  instrucciones, y está versionado con su hash: una edición silenciosa queda
  registrada;
- un brief que no valida contra el ledger de evidencia no produce brief.

### IDOR y aislamiento entre organizaciones

`organizationId` sale siempre de la sesión y nunca del cuerpo. Una operación
sobre otra organización se representa como inexistente, sin revelar que el
identificador existe.

Se auditaron **232 consultas de repositorio**. Las que no filtran por
organización son barridos del worker —reintentos vencidos, desenlaces abiertos,
reclamo de outbox— que cruzan tenants **a propósito**: cada fila que devuelven
lleva su organización y la escritura posterior vuelve a acotar. El resto arma su
`where` en una constante previa que sí la lleva.

### Autorización de rutas

`PermissionGuard` fallaba abierto: una ruta sin `RequirePermission` quedaba al
alcance de cualquier rol autenticado. Ahora se rechaza, y una prueba enumera los
controladores compilados exigiendo que cada ruta declare exactamente una forma
de autorización. Las seis públicas están listadas a mano; tres las llama Meta y
se autentican con la firma HMAC de su `signed_request`, comparada en tiempo
constante.

### Secretos, logs y copias

Ningún secreto está versionado: `.env` no se rastrea y el escaneo del árbol sólo
encuentra la contraseña falsa que el smoke usa justamente para probar que no
se filtra. El bundle del cliente se revisa contra los valores privados de la
configuración en cada corrida. Los logs son JSON con redacción por nombre y por
forma, con textos recortados y sin estructuras anidadas. Las copias de
PostgreSQL se toman antes de cada operación irreversible y se verifican por
catálogo.

## Hallazgos

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| F-01 | Crítica | Next.js 16.2.11 con dos avisos de ejecución remota, uno en optimización de imágenes | Resuelto: 16.3.4 y `/_next/image` apagado |
| F-02 | Alta | sharp 0.34.5 con vulnerabilidades de libvips y libheif, sobre imágenes que llegan de afuera | Resuelto: 0.35.4 |
| F-03 | Alta | Autorización faltante en una ruta fallaba abierta | Resuelto: falla cerrado, con prueba que enumera rutas |
| F-04 | Media | La imagen de producción no copiaba el manifiesto de un workspace nuevo | Resuelto: guard en `verify:stack` |

No quedan hallazgos altos sin resolver.

## Excepciones aceptadas

Avisos que quedan abiertos porque su camino no existe en esta plataforma. Cada
uno se revisa de nuevo el **2026-12-09** o antes si cambia su alcance.

| Aviso | Dónde vive | Por qué se acepta | Dueño |
|---|---|---|---|
| `multer` (3 avisos altos) | NestJS lo trae con `platform-express` | Ninguna ruta usa multipart: no hay `FileInterceptor` ni `@UploadedFile` en toda la API | rol `admin` |
| `find-my-way`, `fast-uri`, `deepmerge-ts`, `mysql2`, `valibot` | herramientas de desarrollo de Prisma | No están en las imágenes de API, panel ni worker; la de migración corre `migrate deploy` en red privada y no usa MySQL ni el servidor de desarrollo | rol `admin` |
| `brace-expansion` | cadena de ESLint | Sólo desarrollo | rol `admin` |
| `nanoid`, `postcss` bajo `next` | build del panel | Se ejecutan al construir, no al servir | rol `admin` |
| `qs` (2 moderados) | `express` | Denegación de servicio acotada; el ingreso público es Caddy y el panel es la única aplicación cliente | rol `admin` |

## Qué sostiene esta revisión

- `pnpm verify` — incluye el guard de manifiestos, el smoke que comprueba que
  ningún valor privado aparece en el bundle ni en el log, y la prueba que
  enumera las 62 rutas exigiendo autorización declarada.
- `pnpm audit` — escaneo de dependencias; la tabla de excepciones es su
  contraparte escrita.
- `pnpm db:test` — aislamiento entre organizaciones sobre PostgreSQL real.
- E2E de identidad — una ruta sin decorador, puesta a propósito, se rechaza con
  sesión válida.
