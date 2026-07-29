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

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] Revisión de fuentes con responsable de la ferretería.
- [x] Ejecutar escenarios de contradicción y ausencia de información.
- [x] Registrar aprobación de la política.

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
- 2026-07-29: la función `Responsable de negocio` confirmó el inventario y
  aprobó sin desvíos `S-01` a `S-19`. Se fijó frescura máxima de 15 minutos para
  precio y 5 minutos para stock, con revalidación de ambos antes de publicar.
- Garantías, cambios y devoluciones se resuelven caso por caso y quedan
  bloqueadas sin una fuente aprobada. Las promociones requieren aprobación
  humana por pieza, condiciones materiales y fechas de vigencia.
- Custodio técnico designado: `Administrador de Odoo`. El método exacto de
  acceso continúa pendiente porque la aprobación recibida conservó el
  placeholder “API/XML-RPC/JSON-RPC u otro”; no se atribuyó una selección que el
  negocio no realizó.
- Revisión final: la fuente `KN-007` puede permanecer `missing` porque la
  política aprobada bloquea la afirmación por defecto; `KC-004` dejó de estar
  sin gobierno y exige una autorización humana versionada por pieza. Aprobar el
  catálogo no activa fuentes ni conecta proveedores.

### Evidencia de cierre

- Commit: commit de cierre de `P3-T01`.
- Revisión del inventario: aprobada por la función `Responsable de negocio` el
  2026-07-29.
- Escenarios: `S-01` a `S-19` aprobados sin desvíos; registro versionado en
  `docs/integrations/KNOWLEDGE-POLICY-SCENARIOS.md`.
- Política: precio 15 minutos, stock 5 minutos y revalidación antes de publicar;
  garantías por caso; promociones con aprobación humana por pieza y vigencia.
- Custodia: `Administrador de Odoo`; método de acceso no seleccionado y
  conservado como decisión pendiente de `P3-T05`.
- Verificación: `pnpm verify:plan` y `pnpm format:check`.
- Desviaciones: ninguna. La fuente concreta de una garantía puede faltar sin
  volver insegura la política porque su ausencia bloquea la afirmación.

## P3-T02 — Implementar gateway de OpenAI

- [x] Tarea completada
- Estado: COMPLETADA
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

- [x] Ningún módulo de dominio importa el SDK de OpenAI.
- [x] Modelo, timeout y límites son configuración validada.
- [x] Rate limit, timeout, rechazo de seguridad y error de proveedor se distinguen.
- [x] Logs no contienen claves, prompts sensibles completos ni archivos.
- [x] Cada ejecución conserva request ID, modelo, latencia y tokens/costo disponible.
- [x] Reintentos se limitan a errores transitorios y usan backoff.

### Verificación obligatoria

- [x] Tests con adaptador falso para cada categoría de error.
- [x] Smoke test controlado contra API real en entorno no productivo.
- [x] Confirmar que la clave no aparece en cliente ni logs.

### Fuera de alcance

- Generar imágenes.
- Definir el prompt final.

### Notas de progreso

- 2026-07-29: se validó la credencial del proyecto staging sin imprimirla y la
  API respondió correctamente dentro del proyecto configurado.
- El puerto `TextGenerationPort` permanece libre del SDK. El worker implementa
  Responses API con el cliente oficial, `store: false`, logs del SDK
  desactivados y telemetría segura sin input ni instrucciones.
- La política inicial enruta trabajo rutinario a `gpt-5.6-luna`, briefs a
  `gpt-5.6-terra` y trabajo complejo a `gpt-5.6-sol`. Timeout, límites y
  reintentos admiten overrides validados por entorno.
- El gateway desactiva los reintentos internos del SDK y aplica su propio
  backoff exponencial solamente a rate limit, timeout, conexión, HTTP 408/409 y
  errores 5xx. Los rechazos de seguridad y fallos permanentes no se reintentan.
- El costo se estima con tokens reportados y tarifas estándar de contexto corto
  verificadas el 2026-07-29. Modelos fuera de la tabla conservan uso pero
  declaran costo no disponible.

### Evidencia de cierre

- Commit: commit de cierre de `P3-T02`.
- Comandos y resultados:
  - validación autenticada `GET /v1/models`: HTTP 200 y request ID presente;
  - `pnpm --filter @aramayo/configuration test`: 10/10;
  - `pnpm --filter @aramayo/domain test`: 23/23;
  - `pnpm --filter @aramayo/worker test`: 38/38, 1 integración omitida según su
    puerta explícita;
  - `NODE_ENV=staging pnpm openai:smoke`: Responses API completada con
    `gpt-5.6-luna`, 27 tokens y costo estimado de USD 0,000052;
  - `pnpm verify`: completo; stack, plan, formato, build, lint, typecheck, tests,
    baseline y smoke de procesos en verde.
- Evidencia remota: request ID conservado por el smoke real, sin registrar
  prompt, output ni credencial.
- Desviaciones aprobadas: ninguna.

## P3-T03 — Ingerir documentos aprobados en File Search

- [x] Tarea completada
- Estado: COMPLETADA
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

- [x] Solo documentos aprobados y formatos permitidos se suben.
- [x] Reingresar el mismo hash no crea duplicados lógicos.
- [x] Una nueva versión no se activa hasta finalizar correctamente.
- [x] Retirar una fuente impide que se use en consultas nuevas.
- [x] Estado local y remoto pueden reconciliarse.
- [x] Fallos parciales quedan visibles y reintentables.

### Verificación obligatoria

- [x] Ingerir, consultar, reemplazar y retirar un documento de prueba.
- [x] Interrumpir una sincronización y confirmar recuperación.
- [x] Verificar hash, versión y estado remoto.

### Fuera de alcance

- Datos de stock, precio o ventas.

### Notas de progreso

- 2026-07-29: se implementó el agregado documental con fuente lógica, versiones
  inmutables, SHA-256, aprobación, vigencia, ámbito, vector store, archivo remoto
  y estados de sincronización.
- La ingestión valida Markdown/texto UTF-8, PDF y DOCX antes de subir y limita
  cada documento a 10 MiB. El proveedor recibe metadatos `candidate`; la versión
  local sólo queda activa después de indexación `completed` y promoción remota a
  `approved`.
- Repetir el hash devuelve la versión existente. Reemplazar cambia el puntero
  activo en transacción y marca la anterior `superseded`.
- El retiro elimina primero el puntero local activo. Esto bloquea consultas
  nuevas aunque el retiro remoto sea eventualmente consistente.
- `sync_failed` y `retiring` conservan referencias y diagnóstico seguro. La
  reconciliación reanuda una asociación ya creada, completa la activación o
  repite el retiro sin duplicar la fuente.

### Evidencia de cierre

- Commit: commit de cierre de `P3-T03`.
- Comandos y resultados:
  - `pnpm --filter @aramayo/domain test`: 27/27;
  - `pnpm --filter @aramayo/worker test`: 43/43, 1 integración omitida según su
    puerta explícita;
  - `pnpm db:test`: migración desde cero, ciclo documental aislado, rollback y
    reaplicación completos;
  - `NODE_ENV=staging pnpm knowledge:smoke`: vector store creado, versiones 1 y
    2 ingeridas y consultadas, reemplazo confirmado y estado final `retired`.
- Evidencia remota: el vector store de staging quedó registrado únicamente en
  `.env`; el documento sintético retirado dejó de aparecer en nuevas búsquedas.
- Desviaciones aprobadas: ninguna.

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
- Estado: EN PROGRESO
- Dependencias: `P3-T01`
- Riesgo: Alto

### Objetivo

Definir consultas mínimas de productos, stock, precios, compras y promociones sin
acoplar el dominio a Odoo ni a su protocolo remoto.

### Entregables

- Interfaces por intención de negocio.
- Tipos de respuesta con origen y timestamp.
- Adaptador de fixtures realistas y deterministas.

### Criterios de aceptación

- [x] Las interfaces expresan `searchProducts`, `getStock`, `getPrice` y consultas aprobadas.
- [x] Toda respuesta incluye fuente y fecha; precio y stock agregan
  moneda/unidad y ámbito de sucursal según corresponde.
- [x] Stock desconocido se diferencia de cero.
- [x] Fixtures cubren SKU duplicado, producto discontinuado y precio ausente.
- [x] No existe interfaz para SQL arbitrario.
- [x] La implementación puede reemplazarse sin cambiar casos de uso.

### Verificación obligatoria

- [x] Tests de contrato del adaptador de fixtures.
- [ ] Revisión con responsable del sistema comercial.
- [x] Simular errores, latencia y datos incompletos.

### Fuera de alcance

- Conectar la base comercial real.

### Notas de progreso

- 2026-07-29: iniciada después de cerrar `P3-T01`. Objetivo: definir un límite
  reemplazable para productos, precio, stock, recepciones y aprobaciones de
  promoción sin conectar Odoo ni aceptar consultas arbitrarias.
- Invariantes: organización y sucursal forman parte del scope; todas las
  observaciones conservan fuente y timestamp; precio incluye moneda/unidad;
  stock cero es `known` y nunca equivale a `unknown`; una recepción no implica
  disponibilidad; promociones viven en un puerto humano separado.
- Casos y bordes: búsqueda ambigua, SKU duplicado, discontinuado, precio
  ausente, stock cero, stock no informado, ubicación inexistente, recepción no
  confirmada, aprobación de promoción ausente/vencida, dato de otro tenant,
  input inválido, timeout e indisponibilidad.
- Responsabilidades: `packages/domain` contiene contratos puros y errores;
  `apps/worker/src/catalog` implementa fixtures deterministas; el futuro
  adaptador Odoo traduce una lista fija de operaciones sin filtrar RPC al caso
  de uso.
- Propuesta de acceso: XML-RPC sobre HTTPS con API key de usuario técnico de
  solo lectura. Se verificó contra la External API oficial de Odoo 18 y se
  documentó en `docs/integrations/ODOO-READ-ACCESS.md`.
- Archivos modificados: contratos y exports de dominio, adaptador y fixtures del
  worker, tests de contrato y documentación de integración.
- Verificaciones ejecutadas: build de dominio, typecheck del worker y 30 tests
  del worker aprobados (29 pass, 1 integración preexistente omitida).
- `pnpm verify`: pipeline completo aprobado, incluidos build, lint, typecheck,
  tests, baseline y smoke de procesos.
- Verificación pendiente: revisión de endpoints, permisos, modelos, campos y
  mapping de sucursales con la función `Administrador de Odoo`.
- Próximo paso exacto: completar la lista de revisión de
  `ODOO-READ-ACCESS.md`; después ejecutar `pnpm verify`, registrar evidencia y
  cerrar la tarea.

### Evidencia de cierre

- Implementación local completa; cierre pendiente de revisión humana obligatoria.

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
