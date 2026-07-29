# Acceso de solo lectura a Odoo 18

- Estado: PROPUESTA TÉCNICA PENDIENTE DE REVISIÓN DEL `Administrador de Odoo`
- Fecha: 2026-07-29
- Alcance: contrato y fixtures de `P3-T05`; no conecta el sistema real

## Decisión provisional

El adaptador real usará la API externa XML-RPC de Odoo 18 sobre HTTPS:

- autenticación en `/xmlrpc/2/common`;
- consultas de modelos mediante `execute_kw` en `/xmlrpc/2/object`;
- API key de un usuario técnico dedicado;
- permisos de Odoo limitados a lectura sobre los modelos y registros
  estrictamente necesarios.

La [documentación oficial de Odoo 18](https://www.odoo.com/documentation/18.0/developer/reference/external_api.html)
documenta XML-RPC como su External API, `execute_kw` como operación para modelos
y API keys como reemplazo del password en webservices. La clave conserva poder
equivalente a la contraseña del usuario: se trata como secreto y nunca entra al
dominio, al cliente, a logs ni a OpenAI.

Esta selección reemplaza el placeholder “API/XML-RPC/JSON-RPC u otro” como
propuesta técnica. No se considera validada hasta que el `Administrador de Odoo`
confirme que la instancia productiva expone esos endpoints y revise permisos,
modelos, campos y alcance de sucursales.

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
RPC. El futuro adaptador XML-RPC contiene una lista fija de operaciones y
proyecta las respuestas a tipos del dominio. Reemplazar el proveedor no cambia
los casos de uso.

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
- Los fixtures no contienen clientes, costos, márgenes, proveedores ni secretos.

## Límites iniciales

- búsqueda: entre 2 y 120 caracteres;
- resultados: 10 por defecto y 25 como máximo;
- identificadores: hasta 120 caracteres y sin sintaxis ejecutable;
- latencia simulada: entre 0 y 5000 ms;
- errores normalizados del puerto: `invalid-request`, `timeout` y `unavailable`.

El timeout y los límites del adaptador real se fijarán en configuración validada
antes de conectarlo. `P3-T06` agrega frecuencia, autorización de sesión,
minimización para el modelo y auditoría por invocación.

## Fixtures de contrato

Los fixtures deterministas cubren:

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

## Revisión pendiente del `Administrador de Odoo`

Antes de cerrar `P3-T05` debe confirmar:

1. URL HTTPS y disponibilidad de `/xmlrpc/2/common` y `/xmlrpc/2/object`;
2. nombre de base y login técnico, guardados fuera de Git;
3. API key rotatable y usuario sin permisos de creación, edición o eliminación;
4. modelos y campos exactos para producto, precio, stock por local y recepción;
5. mapping entre ubicaciones de Odoo y `locationId` de la plataforma;
6. reglas de compañía, almacén y registros aplicables;
7. que búsquedas de prueba no devuelvan costo, margen, proveedor ni datos
   personales;
8. límites y timeout aceptables para la instancia.

Hasta completar esa revisión, no se implementa ni habilita el adaptador real.
