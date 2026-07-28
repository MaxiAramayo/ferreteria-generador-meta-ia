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
- La cookie de sesión es `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` fuera
  de desarrollo y test. Una segunda cookie CSRF, legible por el panel, permite
  reconstruir el header después de una recarga; su hash sigue siendo la única
  copia persistida por el servidor. En ambientes remotos ambas usan el prefijo
  `__Host-`.
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
- Tokens de Meta cifrados por la aplicación antes de persistir.
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
- OAuth con `state`, redirect exacto y sesión asociada.
- Rate limiting en autenticación, generación y webhooks.

## Datos comerciales

- Solo lectura.
- Mínimo privilegio.
- Sin SQL generado.
- No enviar margen, costo o proveedor a OpenAI salvo caso aprobado.
- Snapshots con retención definida.
- Datos personales excluidos de prompts por defecto.

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
