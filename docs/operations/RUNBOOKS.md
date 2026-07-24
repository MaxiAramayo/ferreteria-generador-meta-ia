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
