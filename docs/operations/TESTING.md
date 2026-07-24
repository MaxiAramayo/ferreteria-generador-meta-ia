# Estrategia de pruebas

## Pirámide

### Dominio

Pruebas rápidas y sin infraestructura:

- transiciones válidas e inválidas;
- cálculo de estado parcial;
- expiración de aprobación;
- idempotencia;
- reglas recurrentes;
- políticas de frescura.

### Aplicación

Con repositorios y proveedores mock:

- casos de uso;
- permisos;
- mapping de errores;
- transacciones;
- encolado;
- reintentos.

### Contrato

Fixtures versionados para:

- OpenAI Structured Outputs;
- function calling;
- errores de generación;
- Instagram containers;
- Facebook Page publish;
- sistema comercial.

Las pruebas unitarias nunca llaman APIs reales.

### Integración

- PostgreSQL real efímero.
- Redis real efímero.
- migraciones hacia arriba y abajo;
- concurrencia de dispatcher;
- locks e idempotencia;
- carga y descarga de media de prueba.

### E2E

- crear borrador;
- recuperar contexto;
- generar recurso simulado;
- aprobar;
- programar;
- publicar contra adaptador sandbox;
- mostrar éxito o fallo.

### Visual

- fixtures representativos por layout;
- comparación de dimensiones;
- screenshot regression;
- textos largos;
- imágenes ausentes o corruptas;
- zonas seguras;
- feed e historia.

## Pruebas reales controladas

OpenAI y Meta requieren suites separadas, manuales o programadas con presupuesto:

- usan proyecto/cuenta de staging;
- nunca corren en cada commit;
- registran costo;
- no usan información sensible;
- limpian activos de prueba;
- guardan evidencia anonimizada.

## Puertas de calidad

Antes de merge:

- formato;
- lint;
- typecheck;
- unitarias;
- contratos afectados;
- integración afectada;
- documentación actualizada.

Antes de producción:

- E2E completo;
- regresión visual;
- Meta real de prueba;
- prueba de restauración;
- seguridad;
- runbooks;
- rollback.
