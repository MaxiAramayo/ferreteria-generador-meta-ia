# Seguridad

## Activos críticos

- tokens de Meta;
- clave y proyecto OpenAI;
- credenciales Cloudinary;
- credencial del sistema comercial;
- datos de clientes futuros;
- piezas no publicadas;
- historial de aprobación;
- logs y auditoría.

## Roles iniciales

- `admin`: conexiones, políticas y usuarios.
- `editor`: crea y modifica borradores.
- `approver`: aprueba y programa.
- `publisher`: publica o reintenta destinos.
- `viewer`: solo lectura.

Una persona puede tener varios roles. El backend decide autorización; la UI no
es un límite de seguridad.

## Autenticación y sesiones

- No existe registro público; las credenciales se incorporan mediante un flujo
  administrativo auditado.
- Las contraseñas usan Argon2id versionado con 19 MiB de memoria, dos
  iteraciones, paralelismo uno y salida de 32 bytes.
- El identificador de sesión y el token CSRF tienen 32 bytes aleatorios. La
  base conserva únicamente sus hashes SHA-256.
- La cookie de sesión es `HttpOnly` y `Path=/`. En desarrollo y test usa
  `SameSite=Lax`; en ambientes remotos usa `SameSite=None`, `Secure` y el
  prefijo `__Host-` para que el panel pueda llamar a la API desde otro sitio sin
  exponer la cookie a JavaScript.
- El login entrega un token CSRF en el cuerpo autenticado. Antes de una
  mutación, el panel puede rotarlo con `GET /auth/csrf`: el endpoint exige la
  cookie de sesión, reemplaza atómicamente el hash anterior y devuelve la única
  copia legible. Esto evita depender de una cookie compartida cuando web y API
  usan hosts diferentes.
- Las mutaciones autenticadas por cookie exigen `X-CSRF-Token`; además, un
  `Origin` presente debe coincidir exactamente con `WEB_ORIGIN`.
- El ingreso responde con el mismo rechazo ante email, contraseña,
  organización, usuario o membresía inválidos.
- Cinco fallos para el mismo hash de email y huella de cliente dentro de quince
  minutos bloquean nuevos intentos y generan auditoría.
- Las sesiones son opacas, revocables y expiran según
  `AUTH_SESSION_TTL_SECONDS`. Roles y estados se leen desde PostgreSQL en cada
  solicitud.
- Los eventos de ingreso, rate limit, revocación y cambio de membresía son
  append-only. Email e IP no se guardan en esos eventos: sólo hashes de sujeto
  y huella.

Health y readiness son excepciones públicas explícitas. El resto de los
controladores queda detrás de guards globales de origen, sesión, CSRF y permiso;
un endpoint público nuevo debe declarar `@PublicRoute()`.

## Secretos

- Nunca en Git.
- Nunca en `NEXT_PUBLIC_*`.
- Nunca completos en UI o logs.
- Staging y producción usan credenciales separadas.
- Tokens de Meta cifrados con AES-256-GCM antes de persistir. Cada valor tiene
  IV aleatorio de 96 bits, tag de autenticación y versión del keyring; revocar
  elimina ciphertext, IV, tag y versión sin borrar auditoría.
- Rotación probada antes de producción.
- `.env.example` contiene nombres, no valores.

La matriz de variables y el contrato de arranque están en
[`CONFIGURATION.md`](CONFIGURATION.md). El formato de cifrado, keyring, rotación
y respuesta ante exposición están en [`SECRETS.md`](SECRETS.md).

## Validación

- DTO y esquemas en todas las entradas.
- MIME verificado por contenido, no solo extensión.
- Límite de tamaño.
- URLs salientes permitidas o normalizadas.
- Webhooks con firma y protección contra replay.
- OAuth con `state` aleatorio de 32 bytes, hash SHA-256 persistido, redirect
  exacto, expiración de diez minutos y organización, membresía y sesión
  asociadas. El callback consume `state` atómicamente una sola vez.
- Rate limiting en autenticación, generación y webhooks.

## Datos comerciales

- Solo lectura.
- Mínimo privilegio.
- Sin SQL generado.
- No enviar margen, costo o proveedor a OpenAI salvo caso aprobado.
- Snapshots con retención definida.
- Datos personales excluidos de prompts por defecto.
- La credencial comercial autoriza únicamente la API HTTPS `GET`-only
  dedicada; no autentica Odoo, XML-RPC ni JSON-RPC.
- Organización, actor y sucursal se derivan del contexto autorizado del
  servidor, nunca de argumentos del modelo.
- La auditoría comercial excluye token, consulta literal, respuestas y payloads
  de proveedor.

## Generación de imágenes

- La política se administra con `organization:manage` y compare-and-swap.
- Las cuotas se calculan por organización y membresía; las ventanas diarias y
  mensuales usan UTC.
- La admisión autoritativa y las reservas de todas las variantes se escriben en
  una sola transacción. Preflight no reserva.
- Al agotarse política, cuota o presupuesto, un pedido nuevo usa fallback
  determinista sin llamada externa.
- El identificador que recibe Images es un SHA-256 del tenant y membership; no
  es reversible y no contiene PII.
- Moderación previa y posterior fallan cerrado. La auditoría excluye prompt,
  binario, data URL, scores y secretos.
- Una cancelación libera sólo reservas nunca iniciadas. Timeout o respuesta
  ambigua conservan el máximo como costo no confirmado.
- El barrido de retención sólo recibe activos vencidos sin referencias; los
  guards de PostgreSQL serializan adjuntar contra borrar.

## Acciones externas

- Aprobación explícita o política de automatización.
- Auditoría con actor, hora, intención y resultado.
- Idempotencia.
- Confirmación reforzada para producción.
- Cuenta de prueba por defecto en entornos no productivos.

## Threat model mínimo

Evaluar:

- robo de token;
- OAuth redirect manipulation;
- prompt injection documental;
- SSRF mediante URLs de imagen;
- publicación duplicada;
- elevación de rol;
- acceso entre organizaciones;
- filtración en logs;
- webhook falso;
- modificación de contenido después de aprobar;
- trabajo programado con datos vencidos;
- dependencia externa comprometida.
