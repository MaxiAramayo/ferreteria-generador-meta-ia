# Runbooks requeridos

Este archivo registra runbooks que deben existir antes de producción.

## Publicación fallida

Debe incluir:

- identificar destino e intento;
- clasificar error transitorio o permanente;
- verificar si el contenido existe remotamente;
- reconciliar antes de reintentar;
- reintentar solo destino fallido;
- escalar si el resultado sigue ambiguo.

## Token de Meta vencido o revocado

- pausar trabajos del destino;
- mostrar conexión degradada;
- notificar administrador;
- reconectar;
- validar capacidades;
- reanudar trabajos no vencidos;
- auditar.

## Eliminación o desautorización solicitada desde Meta

1. Confirmar que el callback respondió HTTP 200; nunca copiar la solicitud
   firmada ni el App Secret al ticket o al log.
2. Buscar el evento de auditoría por conexión y operación, no por el
   identificador externo eliminado.
3. Para desautorización, comprobar estado `revoked`, tokens nulos y activos
   removidos.
4. Para eliminación, comprobar además permisos vacíos, nombres sustituidos,
   usernames nulos e identificadores externos reemplazados por referencias
   internas.
5. Abrir la URL pública devuelta y comprobar “Solicitud completada”. Esa URL no
   debe revelar cuenta, Page, Instagram ni organización.
6. Repetir el callback firmado en el ambiente controlado: debe responder
   completado y no crear otra conexión, credencial ni publicación.
7. Si una transacción falla, devolver error para que Meta reintente. No emitir
   un código de confirmación antes de que todas las conexiones encontradas
   terminen.
8. No borrar publicaciones remotas: la solicitud elimina datos de la
   integración, no deshace acciones comerciales previas.

## OpenAI no disponible

- conservar solicitud y fotos;
- no crear brief parcial como válido;
- reintentar según política;
- permitir composición manual;
- mostrar costo cero y error;
- evitar bloqueo de publicaciones ya finalizadas.

## Imagen inválida

- detener render/publicación;
- conservar original si es seguro;
- mostrar causa;
- permitir reemplazo;
- no enviar URL rota a Meta.

## Cola o Redis no disponible

- PostgreSQL conserva programación;
- marcar sistema degradado;
- no perder nuevas intenciones;
- reconstruir trabajos al recuperar;
- verificar duplicados mediante idempotencia.

## Restauración

- restaurar base en entorno aislado;
- comprobar migraciones;
- validar referencias de Cloudinary;
- no ejecutar trabajos externos durante restauración;
- rotar secretos si el incidente lo requiere.

Las tareas de Fase 7 deben convertir cada sección en pasos operativos con
comandos, responsables, señales de éxito y rollback.
