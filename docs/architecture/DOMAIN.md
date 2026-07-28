# Dominio y flujos

## Agregados principales

### Publication

Representa una intención editorial completa. Contiene brief, recursos,
aprobación y destinos.

### PublicationTarget

Representa la entrega a un destino concreto. Cada destino tiene su propio
estado, intento, ID externo y error.

### Creative

Versión editable de contenido y composición. Una publicación puede tener varias
variantes, pero solo una versión final aprobada.

### MediaAsset

Archivo original o derivado, con hash, formato, dimensiones, origen y política
de eliminación.

### ProviderConnection

Conexión cifrada con OpenAI, Meta, Cloudinary o sistema comercial. Expone estado
y capacidades, nunca el secreto.

### RecurringRule

Regla que materializa publicaciones futuras. No publica directamente.

## Máquina de estados

```text
draft
  -> retrieving_context
  -> missing_information | generating_assets
  -> generation_failed | ready_for_review
  -> approved
  -> scheduled | publishing
  -> partially_published | publish_failed | published
```

Estados terminales adicionales:

- `cancelled`
- `expired`

## Invariantes

1. `approved` requiere versión final inmutable y aprobador identificado.
2. `scheduled` requiere fecha futura, timezone y al menos un destino pendiente.
3. `publishing` requiere conexión válida y clave de idempotencia.
4. `published` requiere éxito de todos los destinos activos.
5. `partially_published` requiere al menos un éxito y un fallo.
6. Un destino publicado nunca vuelve a estado pendiente por reintento.
7. Precio y stock publicables requieren fuente y vigencia.
8. Un cambio de contenido posterior a la aprobación invalida la aprobación.
9. Una regla recurrente materializa instancias auditables.
10. OpenAI no puede efectuar la transición a `publishing`; solo la aplicación.

## Política de aprobación

- Productos, precio, promociones y contenido generado con IA: aprobación humana.
- Historias rutinarias sin datos comerciales: autoaprobación solo mediante
  política específica, versionada y habilitada por administrador.
- Cambios de horario, feriados o datos de contacto: aprobación humana.
- En Fases 0 a 5 toda publicación real requiere aprobación manual.

## Errores parciales

Cada destino se ejecuta de forma independiente. El agregado calcula el estado:

- todos pendientes: publicación pendiente;
- alguno publicando: publicando;
- todos publicados: publicado;
- mezcla de publicado y fallido: publicación parcial;
- todos fallidos: publicación fallida.

## Idempotencia

La clave mínima combina:

- publicación;
- versión final;
- destino;
- ocurrencia programada.

La respuesta externa se guarda dentro de la misma transición protegida. Antes de
reintentar se consulta el registro local y, cuando la API lo permite, el estado
externo.

## Aplicación de transiciones

`packages/domain` contiene la matriz exhaustiva y comandos discriminados:
avanzar, aprobar, fallar, cancelar, expirar y editar contenido aprobado. Aprobar
no es un `advance` genérico: exige snapshot, revisor y timestamp. Cancelar,
expirar y registrar un fallo también exigen comandos propios para no perder
motivo ni diagnóstico.

La política inicial para editar contenido aprobado es siempre crear otra
revisión y volver a `draft`; la aprobación anterior queda en el historial, pero
deja de ser la aprobación vigente. No se modifica una revisión ni un snapshot
aprobado.

Cada comando declara `expectedVersion`. Persistencia hace compare-and-swap de
estado y versión y agrega `PublicationStateTransition` en la misma transacción.
Perder la carrera devuelve conflicto; nunca informa éxito ni agrega un evento
parcial. El historial es append-only.
