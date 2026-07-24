# ADR-006: Prisma ORM y migraciones explícitas

- Estado: aceptado
- Fecha: 2026-07-24

## Contexto

El backend modular necesita consultas tipadas, transacciones auditables y
migraciones reproducibles. Las entidades de dominio no pueden depender de
decoradores ni tipos de persistencia.

## Decisión

Usar Prisma ORM 7 con PostgreSQL y el adaptador `pg`. Prisma vive en
infraestructura y se expone a los casos de uso mediante repositorios o puertos
orientados al dominio.

- Las migraciones se generan y revisan como SQL versionado.
- Desarrollo usa `prisma migrate dev`.
- Entornos compartidos usan `prisma migrate deploy` como paso de despliegue
  único; API y worker no migran al arrancar.
- No se usa `db push` sobre staging o producción.
- No existe sincronización automática de esquema.
- Los cambios incompatibles siguen expandir, migrar datos y contraer.
- API, worker, migraciones y outbox comparten transacciones explícitas cuando
  una invariante lo requiere.

## Límites

- Tipos generados por Prisma no atraviesan hacia `packages/domain` ni contratos
  públicos.
- Consultas complejas permanecen encapsuladas en adaptadores de persistencia.
- Cada consulta se filtra por organización o ámbito cuando corresponda.
- Migraciones destructivas requieren respaldo, plan de rollback y revisión
  específica.

## Alternativas descartadas

### TypeORM

Su integración con NestJS es directa, pero los decoradores sobre entidades
facilitan mezclar persistencia y dominio, y la sincronización automática es un
riesgo que este proyecto no necesita.

### Drizzle ORM

Ofrece SQL transparente y buen tipado. Se descarta para el bootstrap porque
Prisma aporta un flujo integrado y maduro de cliente, migraciones y diagnóstico
de deriva con menos decisiones adicionales. La capa de repositorios conserva la
posibilidad de reemplazo.

### SQL o Kysely sin ORM

Dan control fino, pero obligan a elegir y mantener por separado generación de
tipos, migraciones y convenciones de mapeo antes de validar una necesidad real.

## Consecuencias

- Prisma schema y migraciones serán parte de infraestructura, no del dominio.
- Prisma 7 requiere ESM y driver adapter; ambos quedan incluidos en la matriz.
- El cliente generado aumenta el paso de build, que deberá cachearse y
  verificarse en CI.
- Las transacciones largas y consultas N+1 continúan siendo responsabilidad del
  código; el ORM no las corrige automáticamente.

## Fuentes verificadas

- [Descripción y requisitos de Prisma ORM](https://www.prisma.io/docs/orm)
- [Requisitos del sistema](https://www.prisma.io/docs/orm/reference/system-requirements)
- [Prisma Migrate en producción](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
