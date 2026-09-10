# Backup, restauración y retención

Tarea `P7-T04`. Este archivo reúne la política propuesta, el procedimiento y la
evidencia del simulacro. **Dos puntos siguen abiertos y son decisión del
negocio**: dónde viven las copias y qué RPO/RTO se aceptan.

## Qué hay que poder recuperar

PostgreSQL es la única fuente de verdad: publicaciones, aprobaciones, snapshots
inmutables, programación, auditoría, identidad y referencias de medios. Redis no
guarda estado propio y se reconstruye desde la base. Los archivos de medios
viven en Cloudinary y la base guarda su referencia, no su contenido.

Perder la base es perder el sistema. Perder Redis es perder un rato de cola.

## Objetivos propuestos, pendientes de aceptación

| Objetivo | Propuesta | Por qué |
|---|---|---|
| RPO | 24 h | Una copia diaria. El negocio publica pocas piezas por día y cada una nace de una decisión humana que puede rehacerse; perder un día de trabajo editorial es molesto y no destruye información comercial. |
| RTO | 1 h | El simulacro restauró en 210 ms; el resto del tiempo es traer la copia, reinyectar el entorno y levantar servicios. Una hora deja margen para hacerlo con calma y verificar antes de abrir tráfico. |

Ambos números son una propuesta. Mientras el negocio no los acepte, el criterio
correspondiente de `P7-T04` sigue abierto.

## Procedimiento

Las copias se toman con el `pg_dump` **de la misma imagen** que corre el motor:
un `pg_dump` de otra versión mayor se niega a leer la base y ese descubrimiento
en medio de un incidente cuesta caro. En el VPS y en local es el mismo comando
porque es el mismo contenedor.

```bash
docker exec <postgres> pg_dump -U <usuario> -d <base> -Fc | gzip > copia.dump.gz
```

Restaurar en una base nueva, nunca sobre la que está en uso:

```bash
psql "<admin>" -c 'CREATE DATABASE "<destino>"'
gunzip -c copia.dump.gz | docker exec -i <postgres> pg_restore -U <usuario> -d <destino> --exit-on-error
```

`--exit-on-error` es deliberado: una restauración a medias que no avisa es peor
que una que falla.

Después de restaurar, y antes de apuntar la aplicación:

1. comparar conteos por tabla contra el origen —o contra la copia anterior—;
2. comprobar que no queden restricciones sin validar;
3. comprobar la huella de los snapshots aprobados;
4. correr la suite de integración contra la base restaurada.

## Secretos

El dump **no contiene secretos utilizables**. Los tokens de Meta se guardan
cifrados con AES-256-GCM y su clave vive únicamente en `TOKEN_ENCRYPTION_KEYS`,
en el entorno del host. Restaurar exige reinyectar ese entorno; una copia sola no
alcanza para publicar en nombre de nadie. La contraseña de la base tampoco viaja
en la copia.

## Retención

| Dato | Retención | Dónde se aplica |
|---|---|---|
| Copias de PostgreSQL | 30 días, más la última de cada mes por 12 meses | pendiente del destino |
| Original de un medio subido | 90 días | `original_retention_days` |
| Referencia visual | 30 días | `reference_retention_days` |
| Medio generado sin referenciar | 24 h | `generated_orphan_retention_hours` |
| Mensaje outbox entregado | purga por antigüedad | barrido del worker |
| Auditoría y transiciones | sin borrado automático | son la evidencia del sistema |

Las tres primeras filas de medios ya se aplican solas; la de copias depende del
destino que falta confirmar.

## Evidencia del simulacro

Ejecutado el **2026-09-09** contra PostgreSQL 17.9 en una base efímera, con
datos reales producidos por la suite de integración —240 filas de negocio entre
publicaciones, auditoría y snapshots aprobados—.

| Medición | Resultado |
|---|---|
| Copia comprimida | 110 ms, 159.599 bytes |
| Restauración en base aislada | 210 ms |
| Conteos por tabla, origen contra destino | idénticos en las 37 tablas |
| Huella de snapshots aprobados | idéntica (`md5` sobre id y hash de contenido) |
| Restricciones sin validar tras restaurar | 0 |
| Suite de integración contra la base restaurada | 75 pruebas en verde |

La suite corrió **contra la base restaurada**, no contra una nueva: comprueba
que el esquema recuperado funciona, no sólo que está presente.

## Lo que falta

1. **Destino de las copias.** Hoy no hay ninguno confirmado. Mientras la copia
   viva en el mismo host que la base, un incidente que se lleve el host se lleva
   las dos. Decidir el destino incluye decidir su cifrado en reposo y quién
   tiene acceso.
2. **Aceptar RPO y RTO.**
3. **Verificar referencias de medios contra Cloudinary tras restaurar.** La copia
   conserva las referencias intactas —lo prueba la huella—, pero comprobar que
   cada objeto sigue existiendo del otro lado necesita credenciales de staging.
