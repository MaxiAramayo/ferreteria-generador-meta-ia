# Fase 3 — OpenAI, RAG y datos comerciales

## Resultado de la fase

El sistema interpreta pedidos en lenguaje natural y produce un `ContentBrief`
estructurado basado exclusivamente en conocimiento aprobado de la ferretería y
consultas comerciales seguras, con citas, trazabilidad y evaluación de fidelidad.

## Invariantes

- El modelo no consulta SQL ni recibe credenciales.
- Documentos y datos operativos usan canales de recuperación distintos.
- Precio, stock, promoción y horario requieren fuente vigente.
- Toda afirmación comercial relevante conserva evidencia.
- Información faltante se declara; no se inventa.

## P3-T01 — Inventariar fuentes y reglas de conocimiento

- [ ] Tarea completada
- Estado: EN PROGRESO
- Dependencias: `P2-T03`
- Riesgo: Alto

### Objetivo

Clasificar qué información puede usar la IA, quién la mantiene, su vigencia y
qué afirmaciones requieren aprobación humana.

### Entregables

- Catálogo de fuentes documentales y comerciales.
- Matriz de autoridad, sensibilidad, vigencia y propietario.
- Política de afirmaciones y disclaimers.

### Criterios de aceptación

- [x] Cada fuente tiene propietario y fecha de revisión.
- [x] Se distinguen hechos estables de datos de alta volatilidad.
- [x] Precio y stock no se incorporan desde documentos estáticos.
- [x] Se excluyen datos personales y comerciales innecesarios.
- [x] Se define qué hacer cuando dos fuentes se contradicen.
- [x] Documentos obsoletos pueden retirarse y dejan de recuperarse.

### Verificación obligatoria

- [ ] Revisión de fuentes con responsable de la ferretería.
- [ ] Ejecutar escenarios de contradicción y ausencia de información.
- [ ] Registrar aprobación de la política.

### Fuera de alcance

- Ingestar o consultar fuentes.

### Notas de progreso

- 2026-07-29: iniciada después de cerrar y publicar la Fase 2. La tarea
  clasifica fuentes y decisiones; no ingiere documentos, no consulta sistemas
  comerciales y no habilita OpenAI.
- Invariantes: precio, stock y promociones sólo pueden provenir de herramientas
  estructuradas vigentes; una ausencia o contradicción bloquea la afirmación;
  una fuente retirada no vuelve a recuperarse; datos personales, costo, margen,
  proveedor y secretos quedan excluidos.
- Casos principales y bordes: hecho estable, dato volátil, stock cero versus
  desconocido, sucursales diferentes, fuente ausente, dos fuentes
  contradictorias, documento vencido o retirado, prompt injection, dato de otra
  organización y SKU ambiguo.
- Responsabilidades: el catálogo define autoridad, sensibilidad, vigencia y
  propietario funcional; los escenarios definen el resultado seguro; el
  responsable de negocio confirma fuentes, umbrales y disclaimers. El nombre de
  la persona y cualquier dato privado no se versionan.
- Archivos previstos:
  `docs/integrations/KNOWLEDGE-SOURCE-CATALOG.md`,
  `docs/integrations/KNOWLEDGE-POLICY-SCENARIOS.md`, índices y este handoff.
- Verificación prevista: revisión documental y de precedencia,
  `pnpm verify:plan`, escenarios `S-01` a `S-14` con responsable del negocio y
  registro de aprobación. La parte humana permanece pendiente.
- 2026-07-29: inventario técnico completado. El perfil heredado y el catálogo
  editorial existen, pero siguen como candidatos; servicios, políticas,
  sistema comercial, precio, stock y promociones carecen de una fuente
  aprobada identificada. No se inventaron fixtures comerciales para ocultar
  esas ausencias.
- 2026-07-29: el negocio aportó los datos que faltaban y el catálogo se
  completó con ellos. El sistema comercial quedó identificado como Odoo 18
  Community, en producción desde junio de 2026 en reemplazo de ADM Global, con
  cerca de 10.000 productos —unos 9.600 activos— y una taxonomía de 18 rubros de
  primer nivel y unas 244 categorías. `KC-001`, `KC-002`, `KC-003` y `KC-005`
  pasaron de `missing` a `candidate`.
- Decisión de política del negocio: precio y disponibilidad no requieren
  aprobación humana por pieza porque provienen del sistema; lo que los habilita
  es una lectura con timestamp vigente. Descuentos y plazos sí requieren
  autorización explícita porque ningún sistema los respalda. Se corrigió la
  redacción anterior, que exigía aprobación humana para precio y stock, y se
  separó en dos secciones para que la diferencia no dependa de interpretación.
- Identificar Odoo no lo vuelve consultable: sin el puerto de `P3-T05` toda
  afirmación de precio o stock queda bloqueada por falta de lectura, no
  aprobada por otra vía. El escenario `S-19` fija ese comportamiento.
- La taxonomía de Odoo se registró como estructura operativa, no como autoridad
  sobre el surtido: que exista una categoría no prueba que el rubro se venda.
  Lo declara `KN-004` y el escenario `S-16` lo verifica.
- Se incorporó el informe de contexto del negocio como `KN-006`, con su extracto
  publicable delimitado. Queda `interna`: rubros, servicios, medios de pago y
  alcance son publicables; nombres del personal, facturación, comparación entre
  locales, competidores y diagnóstico interno no entran al índice.
- Se registró el sitio web para clientes como proyecto no publicado. No es un
  canal vigente y no se afirma su existencia hasta que el negocio lo confirme.
- Fuentes `missing` restantes: `KN-007` garantías y devoluciones, y `KC-004`
  gobierno de promociones.
- Escenarios ampliados de `S-14` a `S-19`: rubro excluido, taxonomía contra
  surtido, sitio web no publicado, plazo sin autorización y precio sin puerto.
- Verificaciones ejecutadas: `pnpm verify:plan` y `pnpm format:check`.
- Verificaciones pendientes: las tres son humanas. Confirmar fila por fila el
  inventario, recorrer `S-01` a `S-19` y registrar la aprobación.
- Próximo paso exacto: ejecutar los escenarios con el responsable de negocio,
  volcar el resultado en el registro de ejecución y designar al custodio técnico
  del acceso a Odoo, que es requisito de `P3-T05`.

### Evidencia de cierre

- Avance local documentado; revisión de fuentes, ejecución de escenarios y
  aprobación del responsable de negocio pendientes.

## P3-T02 — Implementar gateway de OpenAI

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P0-T04`, `P3-T01`
- Riesgo: Alto

### Objetivo

Encapsular autenticación, selección de modelo, Responses API, timeouts, errores,
telemetría y costos detrás de un puerto de aplicación.

### Entregables

- Cliente oficial configurado solo en servidor.
- Política de modelos por tipo de trabajo.
- Errores normalizados y métricas de uso.

### Criterios de aceptación

- [ ] Ningún módulo de dominio importa el SDK de OpenAI.
- [ ] Modelo, timeout y límites son configuración validada.
- [ ] Rate limit, timeout, rechazo de seguridad y error de proveedor se distinguen.
- [ ] Logs no contienen claves, prompts sensibles completos ni archivos.
- [ ] Cada ejecución conserva request ID, modelo, latencia y tokens/costo disponible.
- [ ] Reintentos se limitan a errores transitorios y usan backoff.

### Verificación obligatoria

- [ ] Tests con adaptador falso para cada categoría de error.
- [ ] Smoke test controlado contra API real en entorno no productivo.
- [ ] Confirmar que la clave no aparece en cliente ni logs.

### Fuera de alcance

- Generar imágenes.
- Definir el prompt final.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P3-T03 — Ingerir documentos aprobados en File Search

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T01`, `P3-T02`
- Riesgo: Medio

### Objetivo

Versionar, validar y sincronizar conocimiento documental de marca y operación con
OpenAI File Search.

### Entregables

- Pipeline de ingestión.
- Registro local de documento, versión, hash y vector store.
- Flujo de activación, reemplazo y retiro.

### Criterios de aceptación

- [ ] Solo documentos aprobados y formatos permitidos se suben.
- [ ] Reingresar el mismo hash no crea duplicados lógicos.
- [ ] Una nueva versión no se activa hasta finalizar correctamente.
- [ ] Retirar una fuente impide que se use en consultas nuevas.
- [ ] Estado local y remoto pueden reconciliarse.
- [ ] Fallos parciales quedan visibles y reintentables.

### Verificación obligatoria

- [ ] Ingerir, consultar, reemplazar y retirar un documento de prueba.
- [ ] Interrumpir una sincronización y confirmar recuperación.
- [ ] Verificar hash, versión y estado remoto.

### Fuera de alcance

- Datos de stock, precio o ventas.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P3-T04 — Recuperar contexto documental con citas

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T03`
- Riesgo: Alto

### Objetivo

Responder consultas internas con fragmentos pertinentes, metadatos de fuente y
citas presentables al revisor.

### Entregables

- Caso de uso de recuperación.
- Contrato de evidencia y citas.
- UI de fuentes usadas.

### Criterios de aceptación

- [ ] Cada afirmación recuperada conserva documento, versión y fragmento.
- [ ] El filtro aplica organización, estado aprobado y ámbito de ubicación.
- [ ] Ausencia de evidencia produce `missing_information`.
- [ ] La UI distingue texto generado de fuente recuperada.
- [ ] No se muestran documentos de otra organización.
- [ ] Se limita cantidad y tamaño de contexto enviado.

### Verificación obligatoria

- [ ] Dataset de preguntas con respuesta, sin respuesta y fuente conflictiva.
- [ ] Tests de aislamiento y filtros.
- [ ] Revisión manual de precisión de citas.

### Fuera de alcance

- Consultas comerciales.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P3-T05 — Definir puerto de lectura comercial y fixtures

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T01`
- Riesgo: Alto

### Objetivo

Definir consultas mínimas de productos, stock, precios, compras y promociones sin
acoplar el dominio al sistema comercial aún desconocido.

### Entregables

- Interfaces por intención de negocio.
- Tipos de respuesta con origen y timestamp.
- Adaptador de fixtures realistas y deterministas.

### Criterios de aceptación

- [ ] Las interfaces expresan `searchProducts`, `getStock`, `getPrice` y consultas aprobadas.
- [ ] Toda respuesta incluye fecha, moneda/unidad y ámbito de sucursal.
- [ ] Stock desconocido se diferencia de cero.
- [ ] Fixtures cubren SKU duplicado, producto discontinuado y precio ausente.
- [ ] No existe interfaz para SQL arbitrario.
- [ ] La implementación puede reemplazarse sin cambiar casos de uso.

### Verificación obligatoria

- [ ] Tests de contrato del adaptador de fixtures.
- [ ] Revisión con responsable del sistema comercial.
- [ ] Simular errores, latencia y datos incompletos.

### Fuera de alcance

- Conectar la base comercial real.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P3-T06 — Exponer herramientas comerciales seguras al modelo

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T02`, `P3-T05`
- Riesgo: Alto

### Objetivo

Permitir function calling estrictamente tipado sobre consultas de solo lectura,
con límites, autorización y auditoría.

### Entregables

- Definiciones estrictas de herramientas.
- Ejecutores autorizados.
- Límites de filas, frecuencia y timeout.

### Criterios de aceptación

- [ ] Argumentos desconocidos o fuera de rango son rechazados.
- [ ] Organización y ubicación se derivan de sesión, no del modelo.
- [ ] El modelo no controla nombres de tablas, campos ni SQL.
- [ ] Herramientas son de solo lectura y usan usuario de BD restringido.
- [ ] Resultados se minimizan antes de enviarse a OpenAI.
- [ ] Cada invocación registra herramienta, parámetros seguros, duración y resultado.

### Verificación obligatoria

- [ ] Pruebas de argumentos maliciosos y scopes cruzados.
- [ ] Confirmar permisos read-only en un entorno de integración.
- [ ] Medir truncamiento y timeout con resultados grandes.

### Fuera de alcance

- Crear compras, cambiar precios o reservar stock.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P3-T07 — Generar `ContentBrief` estructurado

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T04`, `P3-T06`
- Riesgo: Alto

### Objetivo

Transformar un pedido del usuario y evidencia recuperada en un brief validado que
el motor visual pueda consumir sin interpretar texto libre.

### Entregables

- Esquema de salida estructurada.
- Prompt versionado y política de modelo.
- Caso de uso con historial de ejecución.

### Criterios de aceptación

- [ ] La salida se valida con el contrato compartido.
- [ ] El brief separa hechos verificados, propuestas creativas y faltantes.
- [ ] Productos conservan referencia a evidencia comercial.
- [ ] CTA y copy respetan tono, longitud y políticas de marca.
- [ ] No se afirma precio, stock, horario o promoción sin fuente vigente.
- [ ] Fallo de esquema no crea un borrador utilizable.
- [ ] Prompt, modelo, herramientas y fuentes quedan versionados.

### Verificación obligatoria

- [ ] Ejecutar conjunto de casos representativos.
- [ ] Probar información contradictoria, insuficiente y herramienta fallida.
- [ ] Validar que ningún brief inválido cruza el límite de aplicación.

### Fuera de alcance

- Producir el bitmap final.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P3-T08 — Crear suite de evaluación de fidelidad

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T07`
- Riesgo: Alto

### Objetivo

Medir groundedness, exactitud comercial, cumplimiento de marca y manejo de
faltantes antes de permitir cambios de modelo o prompt.

### Entregables

- Dataset versionado de evaluación.
- Métricas y umbrales.
- Reporte comparable por prompt/modelo.

### Criterios de aceptación

- [ ] El dataset incluye productos parecidos, stock cero, precio vencido y fuente conflictiva.
- [ ] Existe criterio binario para afirmaciones sin respaldo.
- [ ] Cambiar prompt o modelo ejecuta la evaluación.
- [ ] Un resultado bajo umbral bloquea promoción a producción.
- [ ] Casos y resultados no contienen datos sensibles reales.
- [ ] Falsos positivos y limitaciones se documentan.

### Verificación obligatoria

- [ ] Ejecutar baseline y guardar resultados.
- [ ] Introducir una regresión conocida y confirmar detección.
- [ ] Revisar una muestra manual con responsable de negocio.

### Fuera de alcance

- Evaluar calidad estética de imágenes.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P3-T09 — Completar flujo de brief conversacional

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T08`, `P3-T08`
- Riesgo: Alto

### Objetivo

Permitir que un editor pida una pieza en lenguaje natural, revise fuentes y
faltantes, corrija el pedido y guarde un brief aceptado.

### Entregables

- UI `AICreativeComposer` funcional.
- Orquestación RAG, tools y brief.
- Historial visible de intentos y costos.

### Criterios de aceptación

- [ ] El usuario ve estado de recuperación y generación.
- [ ] Faltantes se solicitan antes de presentar hechos no sustentados.
- [ ] Las citas son accesibles desde cada brief.
- [ ] Reintentar conserva el pedido original y crea una ejecución distinta.
- [ ] Cancelar evita persistir un resultado tardío como vigente.
- [ ] El usuario puede convertir el brief aceptado en revisión de publicación.

### Verificación obligatoria

- [ ] E2E con respuesta suficiente, faltante y error transitorio.
- [ ] Confirmar autorización y aislamiento.
- [ ] Revisar trazabilidad desde UI hasta fuente y ejecución OpenAI.

### Fuera de alcance

- Generación final de imagen con GPT Image.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 3

- [ ] `P3-T01` a `P3-T09` están completas.
- [ ] La suite de evaluación supera umbrales aprobados.
- [ ] Toda afirmación comercial relevante tiene evidencia o se declara faltante.
- [ ] El modelo no accede a SQL, secretos ni datos fuera del scope.
- [ ] Un editor puede aceptar un brief trazable de punta a punta.
