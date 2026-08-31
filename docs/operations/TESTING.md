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
- configuración de organización normalizada, conflictos de versión y mapping
  de errores;
- login con rechazo uniforme y rate limiting;
- cookie de sesión, origen confiable, rotación y validación CSRF;
- sesión ausente, vencida, revocada y usuario deshabilitado;
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
- sesiones revocables, roles vigentes, cambio de contraseña y auditoría
  append-only;
- cambios de organización, marca y ubicaciones con compare-and-swap, ownership,
  auditoría antes/después e inmutabilidad de snapshots aprobados;
- aislamiento de membresías entre organizaciones;
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
- arranque del worker con Meta y Cloudinary configurados con credenciales
  falsas, para verificar la resolución real de sus dependencias NestJS sin
  órdenes ni llamadas a proveedores;
- cierre ordenado ante `SIGTERM` en API y worker;
- panel que compila, renderiza su estado inicial y no expone configuración
  privada en el bundle del cliente;
- variable `NEXT_PUBLIC_` no declarada que impide servir el panel.

El smoke no reemplaza la verificación con infraestructura real: readiness en 200
se comprueba con `pnpm infra:up` antes de cerrar una tarea que toque el
arranque.

### Seguridad y costo de imágenes

Los tests automáticos de generación usan transportes falsos y no llaman a
OpenAI. Deben cubrir como mínimo:

- validación y CAS de política;
- reserva atómica y carreras en cuotas/presupuesto;
- frontera diaria UTC y alerta mensual única;
- retries, cancelación, liquidación y recuperación `unconfirmed`;
- moderación previa y posterior fail-closed;
- costo liquidado antes de almacenamiento/composición;
- retención por categoría, referencias y carrera adjuntar-vs-borrar;
- aislamiento del ID determinista entre organizaciones.

`pnpm db:test` aplica todas las migraciones desde una base vacía, ejecuta la
integración, revierte la última migración mediante su `down.sql`, la reaplica y
vuelve a verificar el esquema. La suite cubre, entre otros flujos, aislamiento
OAuth por sesión y organización, cifrado de conexiones Meta, revocación y
auditoría; también conserva generar–editar–comparar–seleccionar con genealogía
completa y control de versión.

### Calidad visual y factual de imágenes

`P4-T08` agrega una preevaluación local con 18 casos sintéticos: seis perfiles
por `feed`, `cuadrado` e `historia`. No llama a OpenAI. Compara producto, precio,
stock, CTA y disclaimer con el snapshot, exige la baseline técnica de
composición y rechaza cualquier diferencia como fallo bloqueante.

```bash
pnpm image-quality:eval -- --write
pnpm image-quality:eval
```

El primer comando sólo actualiza la baseline automática; no concede aprobación
humana. El segundo debe quedar bloqueado con `human-review-pending` hasta que la
muestra real supere la rúbrica. Cambiar dataset, prompt, perfil, modelo,
composición o hashes de overlay invalida la baseline. Los bytes del PNG
sintético no forman parte de la identidad porque su codificación puede diferir
entre macOS y Linux. La prueba introduce además un precio incorrecto deliberado
y confirma el rechazo.

La corrida real y el paquete ciego requieren activos generados en staging y no
forman parte de CI porque consumen una API facturable. El procedimiento y los
umbrales están en
[`IMAGE-QUALITY-EVALUATION.md`](IMAGE-QUALITY-EVALUATION.md).

## Pruebas reales controladas

OpenAI, Cloudinary y Meta requieren suites separadas, manuales o programadas
con presupuesto:

- usan proyecto/cuenta de staging;
- nunca corren en cada commit;
- registran costo;
- no usan información sensible;
- limpian activos de prueba;
- guardan evidencia anonimizada.

El smoke remoto de medios se ejecuta exclusivamente con credenciales y carpeta
de staging:

```bash
pnpm media:smoke:cloudinary
```

Genera una imagen sintética, la sube con una clave temporal, comprueba la
variante HTTPS para Meta, la renderiza con el navegador real y elimina el
recurso en `finally`. Rechaza `NODE_ENV` distinto de `staging` o una
`CLOUDINARY_FOLDER` que no identifique explícitamente staging. No forma parte de
`pnpm verify` porque realiza escrituras externas.

El smoke de OpenAI usa un input sintético, `store: false`, la ruta rutinaria de
menor costo y un máximo de 32 tokens:

```bash
NODE_ENV=staging pnpm openai:smoke
```

Requiere el proyecto y credencial exclusivos de staging, conserva request ID,
modelo, latencia, tokens y costo estimado, y nunca imprime clave, prompt ni
output. Tampoco forma parte de `pnpm verify` porque consume una API facturable.

El smoke de conocimiento crea el vector store de staging si falta, ingiere una
fuente sintética, recupera su primera versión mediante el caso de uso completo,
la reemplaza, recupera la segunda y la retira:

```bash
NODE_ENV=staging pnpm knowledge:smoke
```

Requiere PostgreSQL local migrado y con el seed de Aramayo. Si crea el vector
store, su identificador se copia a `OPENAI_VECTOR_STORE_ID` en el entorno no
versionado. Los documentos no contienen información comercial ni personal. El
smoke confirma hash, versión, estados local/remoto y la secuencia
`grounded`, `grounded`, `missing_information`; no forma parte de CI porque
escribe activos facturables en el proyecto de staging.

El smoke comercial usa el ejecutor completo contra la API de solo lectura
aprobada y registra la auditoría en PostgreSQL local:

```bash
NODE_ENV=staging pnpm commercial:smoke
```

Requiere la base local migrada y con el seed de Aramayo, además de URL, token,
organización y mapa de sucursales en el entorno no versionado. Ejecuta búsqueda,
detalle, precio y stock, confirma cuatro eventos de auditoría y sólo informa
tipos de resultado; no imprime token, identificadores, consultas ni valores
comerciales. No forma parte de CI porque consulta el proveedor real.

El smoke OAuth de Meta es manual porque requiere una sesión humana y el
consentimiento visible del administrador. Antes de ejecutarlo deben existir un
host staging real con TLS, base y llaves separadas, y una app Meta de staging;
no se registra una URL nominal o todavía no provisionada. La callback exacta
es:

```text
https://<api-staging>/oauth/meta/callback
```

Desde el panel staging, un `admin` inicia OAuth y concede únicamente
`instagram_basic`, `instagram_content_publish`, `pages_manage_posts`,
`pages_read_engagement` y `pages_show_list`. La evidencia confirma cuenta,
Page, Instagram Business, permisos, expiración, salud, `state` consumido y
columnas cifradas sin copiar tokens, códigos OAuth ni secretos a capturas o
logs. Este smoke no crea containers ni publica contenido en los activos
existentes; conserva los límites de `ADR-019`.

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
| Infraestructura de producción | `pnpm production:verify`, `pnpm production:build` y `pnpm production:smoke`; el smoke debe usar únicamente el proyecto efímero de validación |
| Motor visual | Fixtures por layout y regresión visual con comparación de dimensiones |
| OpenAI, Meta o sistema comercial | Fixtures de contrato y dobles; las llamadas reales van en suites separadas y nunca en CI |
| Documentación o plan | `pnpm verify:plan` y actualización de `docs/STATUS.md` cuando cambia la tarea activa |

La verificación reproducible del núcleo persistente es `pnpm db:test`. Usa una
base efímera, nunca la base configurada como destino de datos de desarrollo, y
la elimina al terminar. También ejecuta la vertical de render con outbox y
almacenamiento doble, restaura el snapshot, compara su SHA-256 con los bytes del
PNG, verifica el ciclo documental y repite la integración después de revertir y
reaplicar la última migración.

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
