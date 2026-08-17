# ADR-020: staging temporal aislado en el VPS dedicado

- Estado: aceptado
- Fecha: 2026-08-17
- Tarea: `P5-T02`

## Contexto

El smoke OAuth de Meta necesita una web y una API de staging con DNS y TLS
reales. Render dejó de ser el proveedor aprobado cuando `ADR-013` sustituyó su
decisión de costo, y no existe otro host remoto de staging.

El VPS dedicado de Content Platform todavía no ejecuta producción. Una
inspección de solo lectura del 2026-08-17 comprobó 6,9 GiB de RAM disponible,
59 GB de disco libre, swap prácticamente sin uso, siete imágenes precargadas y
cero contenedores o volúmenes activos. Sólo SSH escuchaba públicamente.

El usuario autorizó continuar con el despliegue de staging y sus cambios DNS.
La autorización no incluye publicar contenido, activar la app de Meta ni
mezclar recursos con producción.

## Decisión

Usar temporalmente el VPS físico de `ADR-013` para staging bajo estas
condiciones:

1. producción permanece detenida durante toda la ventana;
2. staging usa un proyecto Compose, directorios, volúmenes, base, Redis,
   credenciales, keyring y apps externas exclusivos;
3. los dominios son `staging.content.ferreteriaaramayo.com.ar` y
   `api.staging.content.ferreteriaaramayo.com.ar`;
4. staging y producción no ejecutan Caddy simultáneamente porque ambos publican
   `80/443`;
5. para `P5-T02` se inician web, API, migración, PostgreSQL, Redis y Caddy; el
   worker y los proveedores de generación quedan deshabilitados;
6. detener staging conserva volúmenes y evidencia; destruirlos exige otra
   autorización;
7. antes de cualquier despliegue productivo se detiene staging y se vuelve a
   comprobar listeners, recursos y proyecto activo.

## Invariantes

- `NODE_ENV=staging` y `COMPOSE_PROJECT_NAME=aramayo-content-staging` son
  obligatorios.
- `/etc/aramayo-content/staging.env` es `0600 root:root` y nunca se imprime.
- El callback registrado en Meta coincide exactamente con la API staging.
- El App Secret y los tokens de Meta no entran en Git, logs ni navegador del
  panel.
- Las imágenes son inmutables y llevan el SHA de `main` que las produjo.
- El smoke OAuth descubre activos, pero no crea containers ni publicaciones.

## Consecuencias

- Se evita un segundo costo de hosting para completar la integración.
- Staging y producción no pueden estar disponibles simultáneamente con esta
  topología. Antes del piloto deberá reevaluarse un edge compartido o un host
  separado si se necesita convivencia.
- Compartir el dominio de falla físico no elimina el aislamiento lógico; sí
  aumenta el impacto de un fallo del host y queda aceptado sólo para la etapa de
  staging previa al piloto.
- Este ADR habilita el smoke de `P5-T02`; no inicia ni cierra tareas de Fase 7.

## Alternativas descartadas

### Contratar otro proveedor ahora

Ofrece aislamiento físico y convivencia, pero agrega costo y provisión que el
smoke OAuth no necesita.

### Usar los hostnames productivos

Mezclaría identidad, callback y certificados de ambientes y queda prohibido.

### Ejecutar ambos ambientes en paralelo

Requiere rediseñar el ingreso Caddy y demostrar capacidad bajo carga. No es
necesario para la verificación actual.
