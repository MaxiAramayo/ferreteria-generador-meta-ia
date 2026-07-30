# Acceso de solo lectura a Odoo 18

- Estado: APROBADO Y DISPONIBLE EN PRODUCCIÓN
- Fecha: 2026-07-29
- Custodia técnica: `Administrador de Odoo`
- Alcance: revisión y cierre de `P3-T05`; la plataforma todavía no consume la
  API real

## Decisión aprobada

El adaptador comercial usará una API HTTPS acotada, creada específicamente para
Aramayo Content Platform:

```text
https://ferreteriaaramayo.com.ar/api/content/v1/
```

La autenticación usa un bearer token server-to-server propio, almacenado fuera
de Git. No se usa una API key ni un usuario técnico de Odoo: esas credenciales
también podrían autenticar XML-RPC y ampliarían innecesariamente el alcance. El
token aprobado sólo es válido para las rutas versionadas del addon
`ferreteria_content_api`.

La propuesta XML-RPC inicial fue descartada durante la revisión técnica porque
permitía invocar modelos y métodos públicos con el alcance del usuario. La API
dedicada mantiene una lista fija de operaciones, campos y sucursales; no recibe
nombres de modelo, campos, métodos, dominios ni SQL.

## Rutas habilitadas

| Intención | Ruta |
| --- | --- |
| Buscar productos | `GET /products?query=<texto>&limit=<1..25>` |
| Obtener producto | `GET /products/odoo-product-<id>` |
| Obtener precio | `GET /products/odoo-product-<id>/price?locationId=<sucursal>` |
| Obtener stock | `GET /products/odoo-product-<id>/stock?locationId=<sucursal>` |
| Estado de recepción | `GET /receipts/odoo-receipt-<id>` |

El prefijo común es `/api/content/v1`. Nginx rechaza métodos distintos de
`GET`, limita a 5 solicitudes por segundo por IP con ráfaga de 10 y aplica
timeout de 15 segundos. No se habilitó CORS.

## Límite del dominio

`CommercialCatalogPort` expresa intenciones, no detalles de Odoo:

- `searchProducts`;
- `getProduct`;
- `getPrice`;
- `getStock`;
- `getReceiptStatus`.

`PromotionApprovalPort` queda separado porque Odoo no gobierna las promociones
de Aramayo. Una promoción sólo existe para la plataforma cuando la función
`Responsable de negocio` aprueba la revisión, sus condiciones y su intervalo de
vigencia.

Ningún puerto acepta SQL, nombres de tabla, nombres de modelo, campos o métodos
RPC. El adaptador de `P3-T06` traducirá exclusivamente estas cinco intenciones a
las rutas aprobadas y proyectará las respuestas a tipos del dominio.

## Contrato observable

- Cada producto conserva ID externo, SKU, presentación, estado y evidencia.
- Precio conserva importe minorista, `ARS`, unidad, sucursal, fuente y
  timestamp.
- Stock conserva unidad, sucursal, fuente y timestamp; `known` con cantidad
  cero es distinto de `unknown`.
- Una recepción confirmada sólo prueba el evento de recepción; nunca implica
  stock disponible.
- Precio ausente, producto discontinuado y ubicación desconocida son resultados
  explícitos, no valores por defecto.
- Una respuesta vacía también conserva evidencia de la consulta.
- Las respuestas no contienen clientes, costos, márgenes, proveedores, datos
  fiscales, contactos ni secretos.

## Límites aprobados

- búsqueda: entre 2 y 120 caracteres;
- resultados: 10 por defecto y 25 como máximo;
- identificadores: formato opaco `odoo-product-<id>` u
  `odoo-receipt-<id>`;
- sucursales: `casa-central` y `rivadavia`;
- timeout del proxy: 15 segundos;
- frecuencia del proxy: 5 solicitudes por segundo por IP;
- errores HTTP normalizados: `invalid-request`, `unauthorized` y `unavailable`;
- errores del puerto: `invalid-request`, `timeout` y `unavailable`.

`P3-T06` agrega autorización derivada de sesión, timeout del cliente, límite por
herramienta, minimización antes de OpenAI y auditoría por invocación.

## Revisión del `Administrador de Odoo`

La revisión se completó sobre el repositorio y el VPS productivo autorizados por
el titular:

1. HTTPS y dominio productivo respondieron correctamente.
2. El token independiente se generó en el VPS con 64 caracteres, quedó sólo en
   el `.env` productivo con modo `0600` y no se imprimió.
3. La ruta es `GET`-only, sin CORS, con rate limit y timeout específico.
4. La proyección fija usa únicamente:
   - `product.product`: identidad, SKU, nombre, estado, unidad, presentación,
     marca, categoría y PVP;
   - `stock.quant`: suma de cantidad bajo una ubicación interna fija;
   - `stock.picking`: estado y fecha de una recepción de entrada.
5. El mapping aprobado es:
   - `casa-central` → `CC/Stock República de Siria`;
   - `rivadavia` → `SR/Stock Rivadavia`.
6. La instancia tiene una compañía activa y dos almacenes operativos.
7. El smoke confirmó que no se exponen costo, margen, proveedor ni datos
   personales.
8. El addon pasó 8 tests Odoo, CI, smoke HTTP y readiness operativo/fiscal.

La evidencia completa vive en el repo comercial:
`docs/operaciones/despliegue-api-contenido-2026-07-29.md`. El addon productivo
es `ferreteria_content_api` 18.0.1.0.1 y el ref final documentado es `657c859`.

## Fixtures de contrato

Los fixtures deterministas de la plataforma cubren:

- dos registros con el mismo SKU;
- productos con descripción ambigua y presentaciones diferentes;
- producto discontinuado;
- precio ausente;
- stock cero y stock desconocido para sucursales distintas;
- recepción confirmada y no confirmada;
- dato de otra organización;
- aprobación de promoción vigente, vencida y ausente;
- latencia, timeout e indisponibilidad.

No se registran como conocimiento activo ni pueden respaldar una publicación.

## Credencial y siguiente fase

El valor real del token permanece en el VPS de Odoo y nunca se copia a
documentación, logs, OpenAI ni frontend. `P3-T06` debe:

1. agregar configuración tipada de URL y token sólo a worker;
2. provisionar el token mediante el mecanismo de secretos del entorno;
3. implementar el adaptador HTTP con timeout y límites;
4. ejecutar el smoke de integración sin registrar payload comercial;
5. verificar scopes cruzados, truncamiento y fallos.

Hasta completar `P3-T06`, la plataforma continúa usando fixtures y no consulta
el sistema comercial real.
