# Guía de revisión de seguridad

Para quien revisa el [threat model](THREAT-MODEL.md) sin haber escrito el
código, que es lo que exige `P7-T01`. Cada punto dice qué se afirma, cómo
comprobarlo y qué respuesta esperar. Si algo no coincide con lo esperado, eso es
un hallazgo: anotalo y no lo des por bueno.

Toma alrededor de media hora, de la cual la mayor parte es esperar comandos.

## Antes de empezar

```bash
pnpm install
pnpm run infra:up
```

La infraestructura local —PostgreSQL y Redis en Docker— hace falta para los
puntos 3 y 4. Al terminar, `pnpm run infra:down`.

## 1. Ninguna ruta queda sin permiso declarado

**Se afirma:** olvidar el decorador de permiso no deja el endpoint al alcance de
cualquier sesión, porque el guard falla cerrado.

```bash
pnpm --filter @aramayo/api build && pnpm --filter @aramayo/api test
```

**Esperado:** todo pasa, incluido `route-authorization.test.ts`, que arma una
ruta sin permiso declarado y espera rechazo. Abrí ese archivo y leé el caso: si
la prueba esperara `true`, la afirmación sería falsa.

**Mirá también** `apps/api/src/identity/identity.guards.ts`: `PermissionGuard`
deja pasar sólo lo declarado como público y exige permiso en todo lo demás.

## 2. La API rechaza lo que el panel no ofrece

**Se afirma:** esconder un botón no es el control; el control está en la API.

```bash
pnpm run e2e:publishing
```

**Esperado:** entre los chequeos aparece «la API rechaza a una editora aunque
llame directo». Ese recorrido llama al endpoint de publicar con la sesión de
alguien que no publica y espera rechazo.

## 3. Una organización no ve datos de otra

```bash
pnpm run db:test
```

**Esperado:** pasa, incluido el aislamiento de membresías entre organizaciones,
contra PostgreSQL real.

## 4. Sesión, contraseña e intentos

**Se afirma:** cambiar la contraseña cierra todas las sesiones, y el login corta
tras cinco intentos fallidos.

En el panel, con tu cuenta:

1. Entrá, abrí «Cambiar contraseña» desde el menú de sesión y cambiala. Tenés
   que quedar afuera y volver a entrar con la nueva.
2. Cerrá sesión y probá entrar con una contraseña equivocada seis veces
   seguidas. Las primeras cinco tienen que decir que los datos no son válidos y
   la sexta que hubo demasiados intentos.

## 5. Secretos

```bash
git ls-files | grep -E "(^|/)\.env"
```

**Esperado:** sólo archivos `.env.example`. Ningún `.env` real versionado.

```bash
pnpm run build && pnpm run smoke
```

**Esperado:** entre los chequeos, «el bundle del cliente no contiene secretos de
la plataforma»: el smoke busca los valores del entorno dentro de lo que se sirve
al navegador.

Los tokens de Meta se guardan cifrados: `apps/api/src/connections/token-cipher.ts`
usa AES-256-GCM y su prueba incluye que un tag alterado falla cerrado.

## 6. Dependencias

```bash
pnpm audit --audit-level high
```

**Esperado:** los avisos que quedan son los de la CLI de Prisma —`fast-uri`,
`find-my-way`, `mysql2`, `deepmerge-ts`—, registrados como excepción aceptada en
el threat model: no tienen versión estable que los corrija y no viajan en las
imágenes de API, panel ni worker, que se arman sin dependencias de desarrollo.
**Si aparece un paquete que no está en esa lista, es un hallazgo nuevo.**

## 7. Lo que el modelo puede hacer

**Se afirma:** la evidencia de un brief la emite el servidor, no el modelo, y las
herramientas comerciales no aceptan alcance elegido por él.

Leé `apps/worker/src/catalog/commercial-tool-execution.service.ts`: organización,
membresía y sucursal salen del servidor y no de los argumentos; cada búsqueda
está acotada en filas y la salida, en caracteres. Un modelo que pida otra
organización no tiene dónde escribirla.

## 8. Subidas y direcciones remotas

```bash
grep -rnE "FileInterceptor|multipart|@UploadedFile" apps/api/src --include="*.ts"
grep -rnE "@IsUrl|IsUrl\(" apps/api/src --include="*.dto.ts"
```

**Esperado:** ambos vacíos. No hay ruta que reciba archivos ni entrada que acepte
una dirección elegida por quien llama, que es lo que evitaría un SSRF por
dirección.

## Dónde anotar el resultado

| Punto | Resultado | Nota |
|---|---|---|
| 1. Permisos por ruta | | |
| 2. Rechazo de la API | | |
| 3. Aislamiento | | |
| 4. Sesión y contraseña | | |
| 5. Secretos | | |
| 6. Dependencias | | |
| 7. Herramientas del modelo | | |
| 8. Subidas y URLs | | |

Con los ocho puntos conformes, `P7-T01` cierra: alcanza con anotar la fecha y el
resultado en las notas de la tarea, en
[`PHASE-7-PRODUCTION.md`](../phases/PHASE-7-PRODUCTION.md). Si alguno no
coincide, se corrige antes de cerrar y la corrección se prueba.
