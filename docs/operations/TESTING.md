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

Dos recorridos existen como comandos y no forman parte de `pnpm verify` porque
levantan la vertical entera con un navegador real:

- `pnpm e2e:publishing` recorre publicar por rol y por estado, el doble envío y
  la recarga durante la publicación;
- `pnpm e2e:recurring-story` recorre regla → borrador → aprobación → ocurrencia:
  activa la regla desde el panel, comprueba que eso no cree ninguna pieza,
  materializa con el servicio del worker, renderiza con el Chromium del worker,
  aprueba por HTTP y verifica la ocurrencia planificada sin orden.

Ambos usan una base efímera y dobles locales de medios; ninguno contacta Meta
ni Cloudinary.

### Visual

`pnpm visual:regression` renderiza 53 piezas por el mismo camino que el worker
—documento por `file://`, fuentes y activos locales, recorte de
`[data-card]`— y compara lo que el navegador compuso contra la línea base
versionada en `apps/worker/visual-regression/`:

- **catálogo**: cada pieza vigente en cada formato que declara —feed,
  cuadrado, historia, banner y portada destacada—, 26 piezas;
- **perfil**: los seis perfiles visuales en los tres formatos que componen,
  con los briefs y los fondos sintéticos de `P4-T08`, 18 piezas;
- **determinista**: las tres piezas de composición sin imagen generada;
- **tema**: los cuatro temas sobre una publicación y una historia, para que
  ninguno quede sin una pieza que lo pinte.

Por cada elemento se anota su caja, los estilos que lo pintan —color, fondo,
tipografía, borde, radio, sombra, filtro, opacidad y transformación—, su texto
y en cuántas líneas corta, la imagen que muestra y la forma de cada trazo SVG;
además, qué fuentes cargaron. La geometría tolera 1 px y todo lo demás tiene
que coincidir exacto. Una diferencia se informa por elemento, con sólo lo que
cambió:

```text
@72,752 900×79 → @72,754 900×76 h1 «Taladro percutor 650 W» 1 línea: font-size 92px → 88px; line-height 79.12px → 75.68px
```

**No se comparan píxeles, y es una decisión medida.** El 2026-09-10 las
mismas 53 piezas renderizadas con Chrome 151 en macOS y con el Chromium 151
del contenedor de producción difirieron en el 34 % al 70 % de sus píxeles,
hasta en 237 niveles, por el antialiasing del texto y el remuestreo de las
fotos; ni promediando celdas de 54 px la diferencia bajó de 14 niveles. La
composición, en cambio, coincidió a 0,02 px, con los mismos estilos, cortes de
línea y fuentes. Una tolerancia que absorbiera lo primero dejaría pasar un
cambio de color de marca; lo segundo se puede exigir exacto.

La línea base generada en macOS pasó sin tocarla en el contenedor de
producción —en `aarch64`, desde un árbol limpio con instalación nueva, y en CI
en x86_64, como producción— y en cinco corridas seguidas en macOS: ninguna
diferencia.

Reescribir la línea base es una decisión de diseño, no un trámite:

```bash
pnpm visual:regression -- --update
```

Renderiza cada pieza dos veces, no escribe una cuyos dos renders difieran y
deja el diff de los archivos para revisar en el PR. Una corrida con
diferencias guarda en `output/visual-regression/` el PNG, el inventario actual
y el informe de cada pieza distinta; CI conserva esa carpeta como artefacto.

Textos largos, zonas seguras, imágenes rotas y dimensiones de formato siguen
en las pruebas del motor y del render; esta suite cubre lo que sólo se ve
renderizando.

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

## Pirámide medida

Medido el 2026-09-09. Los números importan menos que la proporción: el dominio
—donde viven las reglas que un error rompe en silencio— concentra la mayoría, y
las capas caras se reservan para lo que ninguna otra puede probar.

| Capa | Pruebas | Qué prueba que ninguna otra pueda |
|---|---|---|
| Dominio | 246 | Transiciones, autorización, idempotencia y cálculo temporal, sin infraestructura |
| API | 133 | Casos de uso, permisos por ruta y contratos de transporte |
| Panel | 90 | Clientes fail-closed y presentación de estados |
| Motor de diseño | 82 | Composición, formatos y paleta aprobada |
| Configuración, contratos, observabilidad y salud | 29 | Bordes de entorno, correlación y redacción |
| Integración | 75 | Aislamiento entre organizaciones, transacciones y concurrencia real sobre PostgreSQL |
| Extremo a extremo | 3 suites | La cadena completa con Chrome real: regla, borrador, aprobación, ocurrencia y excepción |
| Regresión visual | 53 piezas | Lo que el navegador compone en cada formato, perfil y tema aprobados |
| Smoke de procesos | 14 comprobaciones | Arranque, readiness, cierre ordenado y ausencia de secretos |

**Integración y extremo a extremo son ahora una compuerta de CI.** Corrían sólo
cuando alguien se acordaba en su máquina, y son justamente las que encuentran lo
que los dobles no pueden ver: migraciones, aislamiento entre organizaciones y la
cadena completa de una historia recurrente. Desde el 2026-09-10 la regresión
visual también lo es, en su propio job y dentro de la imagen que renderiza en
producción.

## Política de inestabilidad

Una prueba inestable no se reintenta hasta que pase ni se ignora en silencio.

1. Se registra acá con la fecha, la tasa observada y quién la mira.
2. Se busca la causa antes que el paliativo: casi siempre es tiempo, orden o
   estado compartido, no «el runner».
3. Si hay que desactivarla, se desactiva **con** su entrada acá y una fecha de
   revisión. Una prueba desactivada sin registro es una prueba borrada.
4. Ninguna suite se reintenta automáticamente en CI: un reintento convierte una
   señal en ruido y esconde exactamente lo que hay que arreglar.

### Inestabilidades abiertas

| Observada | Suite | Tasa | Estado | Dueño |
|---|---|---|---|---|
| 2026-09-09 | `pnpm --recursive test` | 1 fallo en 13 corridas | Sin identificar: la corrida que falló sólo conservó los conteos. No se reprodujo en 24 corridas posteriores —10 completas, 6 del worker, 4 de la API y 4 de salud—. La próxima aparición en CI conserva el nombre y el diagnóstico. | rol `admin` |

## Regresión intencional: qué detecta cada capa

Comprobado el 2026-09-09 rompiendo a propósito y confirmando quién avisa; las
tres últimas filas, el 2026-09-10.

| Categoría | Rotura introducida | Detectada por |
|---|---|---|
| Dominio | Un día pasó a durar 86.400.001 ms | Pruebas de programación |
| Autorización | Se quitó `RequirePermission` de una ruta | Prueba que enumera rutas |
| Entrega | Se quitó el manifiesto de un workspace del `Dockerfile` | `verify:stack` |
| Marca | Se cambió el color `ferre` | Huella de paleta aprobada |
| Tema | El tema `claro` pintó su fondo con `white` en lugar de `paper` | Regresión visual, en sus dos piezas; la huella de paleta siguió en verde |
| Tipografía | El titular `h1` pasó de 92 a 88 px | Regresión visual, en las 15 piezas que lo usan |
| Fuentes | Saira Condensed 800 dejó de cargarse | Regresión visual, en 52 de las 53 piezas |

La categoría **marca no tenía quién avisara**: `baseline:verify` confirma que los
PNG de referencia siguen íntegros, no que el motor siga pintando igual, y
ninguna prueba de composición mira el color resultante. Se cerró con una huella
de la paleta aprobada, que obliga a actualizarla en el mismo commit.

**La regresión sobre la imagen renderizada existe desde el 2026-09-10**, y las
tres roturas nuevas la prueban. La del tema es justo la que la huella no puede
ver: los dos colores están en la paleta aprobada, así que la paleta no cambió;
cambió qué color pinta la pieza. La de fuentes es la más silenciosa: el
navegador sintetiza el peso con el más cercano, la pieza se sigue viendo bien y
el llamado a la acción se ensancha 2 px.

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
| Programación o recurrencias | `pnpm db:test` y `pnpm e2e:recurring-story`; casos de feriado, horario especial, sucursal cerrada y dato faltante, más medianoche, fin de año y cambio de hora en la zona de la sucursal |
| Persistencia y migraciones | Integración con PostgreSQL real efímero; migración aplicada y revertida |
| Infraestructura local | `pnpm infra:test` y ciclo real `infra:up`, `infra:health`, `infra:down` |
| Infraestructura de producción | `pnpm production:verify`, `pnpm production:build` y `pnpm production:smoke`; el smoke debe usar únicamente el proyecto efímero de validación |
| Motor visual | `pnpm visual:regression`; si el cambio es deliberado, `--update` y el diff de la línea base revisado en el PR |
| OpenAI, Meta o sistema comercial | Fixtures de contrato y dobles; las llamadas reales van en suites separadas y nunca en CI |
| Documentación o plan | `pnpm verify:plan` y actualización de `docs/STATUS.md` cuando cambia la tarea activa |

La verificación reproducible del núcleo persistente es `pnpm db:test`. Usa una
base efímera, nunca la base configurada como destino de datos de desarrollo, y
la elimina al terminar. También ejecuta la vertical de render con outbox y
almacenamiento doble, restaura el snapshot, compara su SHA-256 con los bytes del
PNG, verifica el ciclo documental y repite la integración después de revertir y
reaplicar la última migración.

### Integración continua

El workflow [`ci.yml`](../../.github/workflows/ci.yml) corre en `push` a
`main`, en cada pull request y a demanda. Su job de calidad ejecuta los mismos
pasos que `pnpm verify`:

- instala con `pnpm install --frozen-lockfile`; un lockfile desactualizado falla
  antes de compilar;
- fija Node desde `.node-version`, la misma fuente que el entorno local;
- cachea únicamente el store de pnpm, invalidado por el lockfile. No se cachean
  `dist/`, `.next/` ni `*.tsbuildinfo`, de modo que ninguna caché puede ocultar
  un fallo reproducible;
- ejecuta cada puerta como paso independiente para identificar cuál falló.

Dos compuertas más corren en jobs propios:

- **integración y extremo a extremo**, con PostgreSQL y Redis levantados por el
  mismo Compose de desarrollo;
- **regresión visual**, dentro de la imagen de Playwright del worker de
  producción, fijada por el mismo digest y con la misma ruta de Chromium.
  `verify:stack` falla si esa imagen o esa ruta se separan del `Dockerfile` o
  del Compose de producción: la compuerta mediría un navegador que producción
  ya no usa. Si encuentra diferencias, el job conserva
  `output/visual-regression/` como artefacto durante 14 días.

Esa ubicación no es un detalle: en su primera corrida, antes de comparar una
sola pieza, el job no pudo abrir Chromium porque la ruta que declaraba el
Compose de producción era la de arm64, y la imagen x64 lo ubica en
`chrome-linux64/`. El worker desplegado habría fallado igual en cada render.

Antes de producción:

- E2E completo;
- regresión visual;
- Meta real de prueba;
- prueba de restauración;
- seguridad;
- runbooks;
- rollback.
