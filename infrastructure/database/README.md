# Database

PostgreSQL será la fuente de verdad de publicaciones, programación, conexiones,
auditoría y snapshots comerciales.

El ORM y la estrategia de migraciones se fijan en `P0-T02` y `P2-T01`. No se
permite sincronización automática destructiva en producción.

La instancia de desarrollo y sus procedimientos están documentados en
[`../local/README.md`](../local/README.md). PostgreSQL `17.9` queda fijado para
el entorno local de Fase 0; cualquier cambio de major requiere probar
migraciones, backup y restauración.
