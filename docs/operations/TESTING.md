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

### Smoke de procesos

`pnpm build && pnpm smoke` ejecuta cada aplicación como proceso real, con un
entorno construido —nunca heredado de la terminal— y valores falsos que además
sirven de sonda de fugas:

- arranque rechazado por variable ausente o formato inválido, con el nombre de
  la variable y sin su valor;
- `GET /health` disponible sin consultar dependencias;
- `GET /ready` en 503 con PostgreSQL y Redis inalcanzables y sin credenciales en
  la respuesta;
- worker que reporta estado y no procesa trabajo simulado;
- cierre ordenado ante `SIGTERM` en API y worker;
- panel que compila, renderiza su estado inicial y no expone configuración
  privada en el bundle del cliente;
- variable `NEXT_PUBLIC_` no declarada que impide servir el panel.

El smoke no reemplaza la verificación con infraestructura real: readiness en 200
se comprueba con `pnpm infra:up` antes de cerrar una tarea que toque el
arranque.

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

El pipeline completo se ejecuta con un único comando local, idéntico en orden y
contenido al de integración continua:

```bash
pnpm verify
```

Equivale a `verify:stack`, `verify:plan`, `format:check`, `build`, `lint`,
`typecheck`, `test` y `smoke`. Cualquier paso fallido detiene el resto y el
error indica el workspace responsable (por ejemplo `apps/api typecheck:
Failed`).

El `build` va antes que `lint` y `typecheck` porque los paquetes compartidos
publican sus tipos desde `dist/`: sin compilarlos primero, el análisis con
tipos vería `any` en cada import entre workspaces.

### Pruebas obligatorias por tipo de cambio

Todo cambio requiere `pnpm verify` en verde. La tabla agrega lo que además es
obligatorio según lo que se toca:

| Tipo de cambio | Además de `pnpm verify` |
|---|---|
| Contratos o dominio | Unitarias de transiciones e invariantes del paquete afectado |
| Configuración o secretos | `pnpm config:test` y smoke del proceso afectado; revisión de que ningún valor llegue a logs o al cliente |
| API | Smoke de `apps/api`; pruebas de contrato, autorización e idempotencia de las rutas nuevas |
| Worker | Smoke de `apps/worker`; pruebas de reintentos, concurrencia y cierre ordenado |
| Panel web | Smoke de `apps/web`; revisión de estados vacío, carga, error y accesibilidad |
| Persistencia y migraciones | Integración con PostgreSQL real efímero; migración aplicada y revertida |
| Infraestructura local | `pnpm infra:test` y ciclo real `infra:up`, `infra:health`, `infra:down` |
| Motor visual | Fixtures por layout y regresión visual con comparación de dimensiones |
| OpenAI, Meta o sistema comercial | Fixtures de contrato y dobles; las llamadas reales van en suites separadas y nunca en CI |
| Documentación o plan | `pnpm verify:plan` y actualización de `docs/STATUS.md` cuando cambia la tarea activa |

### Integración continua

El workflow [`ci.yml`](../../.github/workflows/ci.yml) ejecuta los mismos pasos
en `push` a `main`, en cada pull request y a demanda:

- instala con `pnpm install --frozen-lockfile`; un lockfile desactualizado falla
  antes de compilar;
- fija Node desde `.node-version`, la misma fuente que el entorno local;
- cachea únicamente el store de pnpm, invalidado por el lockfile. No se cachean
  `dist/`, `.next/` ni `*.tsbuildinfo`, de modo que ninguna caché puede ocultar
  un fallo reproducible;
- ejecuta cada puerta como paso independiente para identificar cuál falló.

Antes de producción:

- E2E completo;
- regresión visual;
- Meta real de prueba;
- prueba de restauración;
- seguridad;
- runbooks;
- rollback.
