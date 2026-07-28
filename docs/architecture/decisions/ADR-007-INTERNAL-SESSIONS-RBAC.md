# ADR-007: identidad interna con sesiones revocables y RBAC

- Estado: aceptado
- Fecha: 2026-07-24

## Contexto

La plataforma es una herramienta interna con web y API separadas. Necesita
revocar accesos, auditar actores y aplicar roles en cada mutación. Los
responsables concretos todavía no están confirmados, pero la estrategia técnica
debe permitir avanzar sin delegar seguridad a la UI.

## Decisión

Implementar identidad local en el módulo `identity` de NestJS:

- usuarios creados o invitados únicamente por un administrador;
- sin registro público;
- credenciales almacenadas con hash Argon2id y parámetros versionados;
- sesión opaca aleatoria; en PostgreSQL se guarda sólo su hash, actor,
  expiración y metadatos de auditoría;
- cookie `HttpOnly`, `Secure` en ambientes remotos y `SameSite=Lax`;
- identificador nuevo en cada autenticación; los cambios de rol se leen desde
  la membresía vigente y la baja revoca las sesiones afectadas;
- revocación individual y global por usuario;
- protección CSRF para toda mutación autenticada por cookie;
- rate limiting y auditoría de intentos de ingreso;
- autorización mediante guards de NestJS y políticas del caso de uso;
- roles y membresías consultados desde PostgreSQL, no confiados desde el cliente.

Los roles iniciales siguen siendo `admin`, `editor`, `approver`, `publisher` y
`viewer`. Una persona puede tener varios roles. Los límites, propietarios y
procedimiento de asignación quedan definidos en
[ADR-012](ADR-012-IDENTITY-ENVIRONMENTS-OWNERSHIP.md); los datos nominales
permanecen en el inventario privado de accesos y no en Git.

## Invariantes

- PostgreSQL conserva usuarios, membresías y sesiones; Redis no es fuente de
  identidad ni requisito para revocar.
- Ningún token de sesión se registra completo.
- La UI puede ocultar acciones, pero sólo el backend autoriza.
- Cambiar contraseña, desactivar usuario o quitar membresía invalida las
  sesiones afectadas.
- Recuperación de cuenta y MFA deben estar definidos antes del piloto de
  producción.

## Alternativas descartadas

### JWT autocontenido en el navegador

Complica revocación inmediata y puede conservar roles obsoletos. No hay una
necesidad de terceros que deban verificar tokens sin consultar la API.

### Auth.js o Better Auth como dueño transversal

Auth.js está centrado en el límite Next.js y la integración NestJS de Better
Auth depende de un adaptador comunitario. Ambos agregarían otra capa de esquema
y migraciones antes de validar una ventaja concreta.

### Clerk, Auth0 o Keycloak

Clerk y Auth0 agregan costo, dependencia externa y configuración remota; Keycloak
agrega una carga operativa desproporcionada para el equipo inicial. Se podrán
reevaluar si aparecen SSO, MFA corporativo o gestión centralizada obligatoria.

## Consecuencias

- La autenticación es responsabilidad sensible del backend y requiere pruebas de
  sesión, CSRF, rate limiting, revocación y ownership.
- No se delega el esquema, la sesión ni la autorización a una librería de
  autenticación transversal.
- `P2-T02` fija `argon2@0.45.1` y aplica Argon2id con 19 MiB, dos iteraciones,
  paralelismo uno y 32 bytes de salida; sólo su binding nativo queda autorizado
  en `allowBuilds`.
- NestJS aplica guards globales para origen, sesión, CSRF y permisos. Las únicas
  excepciones públicas actuales son login, health y readiness.
- El seed local no contiene contraseña: el alta de una credencial continúa
  siendo una operación administrativa explícita, no un acceso predeterminado.

## Fuentes verificadas

- [Autenticación en NestJS](https://docs.nestjs.com/security/authentication)
- [Guards de NestJS](https://docs.nestjs.com/guards)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
