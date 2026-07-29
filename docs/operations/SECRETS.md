# Almacenamiento y rotación de secretos

## Alcance

Esta política cubre credenciales de PostgreSQL y Redis, claves de OpenAI y
Cloudinary, secreto de aplicación Meta, llaves de cifrado y tokens OAuth de
Meta. No autoriza cargar credenciales reales ni implementar OAuth.

## Clasificación y ubicación

| Clase | Ejemplos | Ubicación permitida |
|---|---|---|
| Pública | URL pública de API | Contrato web `NEXT_PUBLIC_*` |
| Privada operativa | IDs de proyecto, versión Graph | Configuración del servicio que la consume |
| Secreta de servicio | API keys, passwords, app secret | `.env` ignorado o archivo remoto `0600` |
| Secreta persistida | access/refresh tokens de Meta | PostgreSQL, cifrada por la aplicación |
| Llave maestra | `TOKEN_ENCRYPTION_KEYS` | Secret store del ambiente, nunca PostgreSQL |

Las llaves no se almacenan junto al dato que cifran. Desarrollo, test, staging y
producción usan valores diferentes. Cada servicio recibe sólo las variables que
necesita.

## Tokens de Meta cifrados en reposo

El adaptador de persistencia de `connections` deberá aplicar cifrado autenticado
AES-256-GCM antes de escribir un token. Por cada valor persistirá:

- versión de llave;
- algoritmo;
- nonce aleatorio y único de 12 bytes;
- ciphertext;
- authentication tag;
- metadatos no sensibles de creación, expiración y rotación.

El AAD incluirá al menos `organizationId`, `providerConnectionId` y tipo de
token para impedir mover un ciphertext válido a otro ámbito. La llave activa se
obtiene de la primera entrada de `TOKEN_ENCRYPTION_KEYS`; las restantes son
exclusivamente llaves de lectura durante una rotación.

PostgreSQL conserva ciphertext, nunca el texto ni la llave. Los backups heredan
el cifrado de aplicación. Descifrar sólo está permitido dentro del caso de uso
del proveedor y el valor no puede aparecer en DTO, auditoría, excepciones o
logs.

La implementación criptográfica y la migración pertenecen a la tarea de
`connections` de Fase 5. Esta política es su contrato obligatorio.

## Rotación normal de la llave maestra

1. Generar 32 bytes con un CSPRNG y asignar una versión nueva.
2. Agregarla al inicio del keyring de API y worker, conservando la anterior.
3. Desplegar ambos procesos y confirmar que escriben con la versión nueva.
4. Reencriptar registros antiguos mediante un trabajo idempotente, acotado y
   auditable.
5. Verificar en PostgreSQL que ningún registro referencia la versión anterior.
6. Retirar la llave anterior, volver a desplegar y registrar actor, fecha,
   alcance y resultado.

La rotación nunca cambia el token remoto ni publica contenido. Un fallo parcial
conserva ambas llaves y se reanuda desde los registros pendientes.

## Rotación de credenciales de proveedor

1. Crear la credencial nueva con mínimo privilegio.
2. Cargarla en el archivo de entorno protegido del ambiente sin eliminar la
   vigente.
3. Desplegar y ejecutar un smoke test no destructivo.
4. Revocar la anterior sólo después de confirmar todos los consumidores.
5. Registrar proveedor, ambiente, responsable, fecha y próxima revisión sin
   copiar el secreto.

Cuando el proveedor expone expiración, se registra y alerta antes del
vencimiento. Sin expiración propia, la revisión inicial es trimestral para
credenciales de servicio y semestral para llaves maestras. Cualquier sospecha de
exposición exige rotación y revocación inmediata.

## Incidente o exposición

1. Detener el consumidor afectado si seguir activo amplía el impacto.
2. Revocar o rotar primero en el proveedor.
3. Sustituir el valor en el secret store y desplegar.
4. Revisar auditoría, logs, historial Git y destinos publicados.
5. Si una llave maestra se expuso, reencriptar todo el alcance con una llave
   nueva antes de retirar la comprometida.
6. Documentar causa, ventana, alcance y prevención en el runbook.

No alcanza con borrar el secreto del último commit: el historial y los clones
se consideran comprometidos.

## Reglas de logs y errores

- Registrar nombre de variable y código de validación, nunca valor.
- `SecretValue` debe conservar su redacción al serializar.
- No registrar `process.env`, requests OAuth, headers de autorización ni URLs
  con credenciales.
- Request IDs y metadatos de rotación sí se registran para trazabilidad.
- Las capturas y fixtures usan placeholders reconocibles, no valores válidos.

## Fuentes verificadas

Consultadas el 2026-07-24:

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Node.js Crypto: autenticación en GCM](https://nodejs.org/api/crypto.html#deciphersetauthtagbuffer-encoding)
- [Secrets Management en Docker](https://docs.docker.com/engine/swarm/secrets/)
