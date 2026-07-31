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

- [x] Tarea completada
- Estado: COMPLETADA
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

- [x] Cada afirmación recuperada conserva documento, versión y fragmento.
- [x] El filtro aplica organización, estado aprobado y ámbito de ubicación.
- [x] Ausencia de evidencia produce `missing_information`.
- [x] La UI distingue texto generado de fuente recuperada.
- [x] No se muestran documentos de otra organización.
- [x] Se limita cantidad y tamaño de contexto enviado.

### Verificación obligatoria

- [x] Dataset de preguntas con respuesta, sin respuesta y fuente conflictiva.
- [x] Tests de aislamiento y filtros.
- [x] Revisión manual de precisión de citas.

### Fuera de alcance

- Consultas comerciales.

### Notas de progreso

- 2026-07-29: se implementó el caso de uso de recuperación con elegibilidad
  local por organización, estado, vigencia y sucursal, más revalidación de cada
  coincidencia remota contra hash, archivo y versión persistidos.
- El contexto queda limitado a 6 evidencias, 900 caracteres por fragmento y
  4.800 caracteres totales. La ausencia devuelve `missing_information`; un
  conflicto conserva citas para revisión y no produce contexto utilizable.
- El compositor de creatividad asistida separa explícitamente el texto
  propuesto de las fuentes verificadas y representa estados vacío, sustentado y
  con información faltante.

### Evidencia de cierre

- Commit: commit de cierre de `P3-T04`.
- Comandos y resultados:
  - `pnpm --filter @aramayo/worker test`: 49/49, 1 integración omitida según su
    puerta explícita;
  - `pnpm --filter @aramayo/web test`: 12/12;
  - `pnpm db:test`: selección documental aislada por organización y sucursal,
    migración desde cero, rollback y reaplicación completos;
  - `NODE_ENV=staging pnpm knowledge:smoke`: recuperación de las versiones 1 y
    2 con sus citas y `missing_information` después del retiro;
  - `pnpm verify`: secuencia completa aprobada.
- Evidencia visual:
  `output/playwright/p3-t04-evidence-panel.png` y
  `output/playwright/p3-t04-evidence-panel-mobile.png`.
- Desviaciones aprobadas: ninguna.

## P3-T05 — Definir puerto de lectura comercial y fixtures

- [x] Tarea completada
- Estado: COMPLETADA
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
- [x] Revisión con responsable del sistema comercial.
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
- La propuesta XML-RPC se descartó durante la revisión porque una API key de
  Odoo conserva alcance de login/RPC. Se aprobó una API HTTPS dedicada con
  bearer token propio, cinco operaciones fijas y proyección mínima; la decisión
  está en `docs/integrations/ODOO-READ-ACCESS.md`.
- Archivos modificados: contratos y exports de dominio, adaptador y fixtures del
  worker, tests de contrato y documentación de integración.
- Verificaciones ejecutadas: build de dominio, typecheck del worker y 30 tests
  del worker aprobados (29 pass, 1 integración preexistente omitida).
- `pnpm verify`: pipeline completo aprobado, incluidos build, lint, typecheck,
  tests, baseline y smoke de procesos.
- 2026-07-29: revisión completada sobre el repo y VPS comercial autorizados. Se
  verificaron modelos/campos, una compañía, almacenes `CC`/`SR`, ubicaciones,
  exclusión de datos sensibles, límites y autenticación.
- `ferreteria_content_api` 18.0.1.0.1 quedó disponible en producción. Pasó 8
  tests Odoo, CI, smoke HTTPS y readiness operativo/fiscal; la evidencia
  completa está en el repo comercial. Esto no conecta todavía la plataforma.
- Próximo paso exacto: iniciar `P3-T06`, implementar el adaptador HTTP y
  provisionar URL/token únicamente al worker mediante configuración tipada.

### Evidencia de cierre

- Commit: commit de cierre de `P3-T05`.
- Contratos y fixtures: tests de dominio/worker aprobados.
- Revisión comercial: completada por la función `Administrador de Odoo` con
  acceso autorizado al repo y VPS.
- Proveedor: addon `ferreteria_content_api` 18.0.1.0.1, API HTTPS `GET`-only,
  token independiente y sucursales `casa-central`/`rivadavia`.
- Evidencia externa: PR `#15`, `#16` y `#17` del repo comercial; backup
  PostgreSQL/filestore confirmado offsite; smoke y readiness aprobados.
- Verificación local: `pnpm verify`.
- Desviación: la propuesta XML-RPC fue reemplazada por una API dedicada de
  menor privilegio después de revisar el alcance real de las API keys de Odoo.

## P3-T06 — Exponer herramientas comerciales seguras al modelo

- [x] Tarea completada
- Estado: COMPLETADA
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

- [x] Argumentos desconocidos o fuera de rango son rechazados.
- [x] Organización y ubicación se derivan de sesión, no del modelo.
- [x] El modelo no controla nombres de tablas, campos ni SQL.
- [x] Herramientas son de solo lectura y usan una credencial dedicada
  restringida a la API HTTPS `GET`-only.
- [x] Resultados se minimizan antes de enviarse a OpenAI.
- [x] Cada invocación registra herramienta, parámetros seguros, duración y
  resultado.

### Verificación obligatoria

- [x] Pruebas de argumentos maliciosos y scopes cruzados.
- [x] Confirmar permisos read-only en un entorno de integración.
- [x] Medir truncamiento y timeout con resultados grandes.

### Fuera de alcance

- Crear compras, cambiar precios o reservar stock.

### Notas de progreso

- Se definieron cinco funciones estrictas con propiedades requeridas,
  `additionalProperties: false` y sin argumentos de organización ni sucursal.
- La configuración comercial es un grupo atómico exclusivo del worker; el
  token se representa como secreto redactado.
- El adaptador sólo construye cinco rutas `GET` fijas, rechaza redirects,
  contratos inesperados, scopes externos y respuestas mayores a 64 KiB.
- El ejecutor limita búsqueda a 10 filas, salida a 12.000 caracteres y cada
  sesión a 8 llamadas por defecto, además del timeout configurable.
- La auditoría conserva herramienta, parámetros minimizados, duración y
  resultado. Un fallo de auditoría impide usar incluso un resultado exitoso.
- El esquema estricto se contrastó con la guía oficial vigente de Function
  Calling el 2026-07-29.

### Evidencia de cierre

- `pnpm config:test`: 11 pruebas aprobadas.
- Tests del worker: 58 aprobadas y 1 prueba remota preexistente omitida.
- `pnpm db:test`: migraciones, auditoría e aislamiento entre organizaciones
  aprobados contra PostgreSQL efímero.
- `NODE_ENV=staging pnpm commercial:smoke`: búsqueda, detalle, precio y stock
  aprobados contra la API real; precio `priced`, stock `known` y cuatro eventos
  de auditoría.
- Una solicitud `POST` controlada a la API real respondió `403`, confirmando el
  límite de solo lectura junto con las rutas fijas del cliente.
- El token se inyectó transitoriamente para el smoke y no se imprimió, persistió
  ni envió a OpenAI.
- `pnpm production:verify`, `pnpm production:build` y
  `pnpm production:smoke`: topología, imágenes, migraciones, readiness, worker,
  web y Chromium aprobados; los recursos efímeros fueron eliminados.
- Desviación aprobada: el “usuario de BD restringido” se implementa como token
  dedicado de menor privilegio sobre una API `GET`-only; no permite autenticar
  Odoo ni sus RPC.
- Verificación final: `pnpm verify`.

## P3-T07 — Generar `ContentBrief` estructurado

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] La salida se valida con el contrato compartido.
- [x] El brief separa hechos verificados, propuestas creativas y faltantes.
- [x] Productos conservan referencia a evidencia comercial.
- [x] CTA y copy respetan tono, longitud y políticas de marca.
- [x] No se afirma precio, stock, horario o promoción sin fuente vigente.
- [x] Fallo de esquema no crea un borrador utilizable.
- [x] Prompt, modelo, herramientas y fuentes quedan versionados.

### Verificación obligatoria

- [x] Ejecutar conjunto de casos representativos.
- [x] Probar información contradictoria, insuficiente y herramienta fallida.
- [x] Validar que ningún brief inválido cruza el límite de aplicación.
- [x] Ejercitar salida estructurada y ciclo de herramientas contra la API real.

### Fuera de alcance

- Producir el bitmap final.

### Notas de progreso

- 2026-07-30: iniciada con `P3-T04` y `P3-T06` cerradas. Objetivo: convertir un
  pedido editorial y su evidencia en un brief validado por contrato, sin que el
  motor visual tenga que interpretar texto libre.
- Invariantes: el modelo nunca declara su propia evidencia; cada hecho verificado
  referencia una entrada del ledger construido en el servidor; precio y stock
  respetan 15 y 5 minutos; una promoción no tiene fuente habilitada y queda
  bloqueada; un fallo de esquema o de referencia no produce brief utilizable.
- Casos principales y bordes: evidencia suficiente, documental ausente,
  documental conflictiva, herramienta comercial fallida, precio vencido, stock
  cero contra desconocido, referencia inexistente, claim sin evidencia del tipo
  correcto, producto sin observación comercial, importe en el copy sin hecho de
  precio, objetivo de promoción, JSON inválido y salida fuera de esquema.
- Responsabilidades: `packages/contracts` publica la forma del brief;
  `packages/domain` valida sin SDK; `apps/worker/src/brief` orquesta
  recuperación, herramientas, generación estructurada e historial;
  `infrastructure` conserva la ejecución.
- Archivos previstos: contrato y dominio del brief, puerto de generación
  estructurada, transporte y gateway de Responses con tools, módulo `brief` del
  worker, migración `content_brief_runs` con su repositorio, tests y esta
  documentación.
- Verificaciones previstas: tests de dominio y worker, `pnpm db:test`,
  `pnpm verify` y `pnpm verify:plan`.
- 2026-07-30: implementación completa. El contrato del brief pasó a separar
  hechos verificados con evidencia, propuesta creativa, productos con su
  observación comercial, CTA tipado y faltantes. `packages/domain` valida contra
  el ledger; `packages/contracts` publica la forma pública.
- Decisión: `@aramayo/domain` no depende de `@aramayo/contracts`, porque ese
  paquete arrastra el motor de diseño y React a un paquete de reglas puras. Se
  conservan ambas declaraciones y el worker —único proceso que ve las dos—
  comprueba su equivalencia en tiempo de compilación. Una divergencia rompe el
  typecheck en lugar de publicar un brief incompleto.
- El gateway sumó `StructuredGenerationPort`. El bucle de function calling vive
  en el transporte porque necesita los items crudos de la Responses API; con
  `store: false` cada vuelta reenvía la conversación completa.
- Un run estructurado no se reintenta solo: sus vueltas ya ejecutaron lecturas
  comerciales auditadas y repetirlas gastaría el presupuesto del run. Un fallo
  del ejecutor de herramientas se propaga intacto en lugar de disfrazarse de
  error del proveedor.
- `CommercialToolExecutionResult` sumó observaciones tipadas. El texto que ve el
  modelo no sirve como evidencia; la observación la emite el servidor con su
  instante de lectura. Un precio ausente, un stock no informado o una recepción
  confirmada quedan registrados pero no habilitan afirmar nada.
- El copy se revisa por firmas textuales inequívocas —importe, porcentaje o
  “descuento”, y horario— contra los hechos probados. Es una defensa mecánica
  deliberadamente acotada; la fidelidad semántica es responsabilidad de `P3-T08`.
- Un fallo real encontrado por la verificación: el repositorio guardaba
  `Prisma.JsonNull` para un brief ausente, que es el valor JSON `null` y no NULL
  de SQL. La restricción de resultado lo leía como brief presente y habría
  dejado pasar un run rechazado con contenido. Se corrigió con `Prisma.DbNull`.
- Archivos modificados: contrato y dominio del brief, puerto y gateway de
  generación estructurada, transporte de Responses, observaciones comerciales,
  módulo `brief` del worker con esquema, prompt, caso de uso y smoke, migración
  `content_brief_runs` con modelo y repositorio, verificación de base, tests y
  documentación.
- Verificaciones ejecutadas: `pnpm verify` completo —stack, plan, formato,
  build, lint, typecheck, tests, baseline y smoke de procesos—, `pnpm db:test`
  con migración desde cero, reversión y reaplicación, 42 pruebas de dominio y
  77 del worker con una integración preexistente omitida.
- El smoke real usa el adaptador de fixtures de `P3-T05` porque el grupo
  comercial no está persistido en el entorno local: `P3-T06` lo verificó
  inyectando su token de forma transitoria. Lo que este smoke debía probar es el
  camino nuevo —esquema estricto y ciclo de function calling contra la Responses
  API—, y eso queda cubierto.

### Evidencia de cierre

- Commit: commit de cierre de `P3-T07`.
- Comandos y resultados:
  - `pnpm --filter @aramayo/domain test`: 42/42;
  - `pnpm --filter @aramayo/worker test`: 77 pruebas, 76 aprobadas y 1
    integración preexistente omitida según su puerta explícita;
  - `pnpm db:test`: migración desde cero, aislamiento del historial entre
    organizaciones, restricción de resultado, reversión con `down.sql` y
    reaplicación completas;
  - `pnpm verify`: secuencia completa aprobada —stack, plan, formato, build,
    lint, typecheck, tests, baseline y smoke de procesos.
- `NODE_ENV=staging pnpm brief:smoke` contra la Responses API real, en tres
  escenarios que cubren éxito y negativa:
  - camino sustentado: `status=generated`, modelo `gpt-5.6-terra`, cuatro
    llamadas `search_products` y `get_stock_by_location` todas exitosas, cuatro
    eventos de auditoría, seis evidencias en el ledger y dos hechos verificados
    citando identificadores emitidos por el servidor; 7.505 tokens y costo
    estimado de USD 0,0134;
  - evidencia vencida: con el timestamp congelado de los fixtures el run
    terminó en `rejection=evidence-stale` y no produjo brief;
  - evidencia ausente: sin coincidencias comerciales el modelo declaró
    `missing=stock` y marcó `requiresHumanApproval`, sin afirmar el dato.
- El smoke no persiste nada: el historial usa un repositorio en memoria.
- Desviación: el smoke se ejecuta contra los fixtures aprobados en `P3-T05` y no
  contra Odoo, cuyo acceso ya fue verificado en `P3-T06` y cuyo token no queda
  persistido en el entorno local.

## P3-T08 — Crear suite de evaluación de fidelidad

- [x] Tarea completada
- Estado: COMPLETA
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

- [x] El dataset incluye productos parecidos, stock cero, precio vencido y fuente conflictiva.
- [x] Existe criterio binario para afirmaciones sin respaldo.
- [x] Cambiar prompt o modelo ejecuta la evaluación.
- [x] Un resultado bajo umbral bloquea promoción a producción.
- [x] Casos y resultados no contienen datos sensibles reales.
- [x] Falsos positivos y limitaciones se documentan.

### Verificación obligatoria

- [x] Ejecutar baseline y guardar resultados.
- [x] Introducir una regresión conocida y confirmar detección.
- [x] Revisar una muestra manual con responsable de negocio.

### Fuera de alcance

- Evaluar calidad estética de imágenes.

### Notas de progreso

- 2026-07-30: iniciada con `P3-T07` cerrada. Objetivo: medir el comportamiento
  del prompt y el modelo con entradas controladas, y bloquear una promoción
  cuando ese comportamiento empeora.
- Invariantes: la evaluación no consulta datos reales del negocio; cada caso
  fija su propia evidencia; una afirmación sin respaldo es criterio binario y no
  se compensa con otras métricas; cambiar prompt, esquema o modelo invalida la
  línea base hasta volver a evaluar.
- Casos previstos: productos parecidos, stock cero contra stock desconocido,
  precio vencido, fuente documental conflictiva, ausencia de coincidencia
  comercial, intento de inyección desde un documento y pedido de promoción sin
  autorización.
- Responsabilidades: `packages/domain` define expectativas, verificaciones,
  umbrales y puntaje —todo puro—; `apps/worker/src/evaluation` conserva el
  dataset sintético y ejecuta los casos contra el modelo real; una prueba del
  worker actúa de puerta y corre dentro de `pnpm verify` sin red.
- La puerta compara la línea base congelada contra el hash del prompt, la
  versión del esquema y el modelo vigentes. Un cambio deja la línea base
  inválida y falla hasta que se vuelva a evaluar y se congele el resultado.
- Archivos previstos: módulo de evaluación de dominio con sus pruebas, dataset,
  arnés, CLI, línea base congelada, prueba de puerta y documentación.
- Verificación prevista: baseline real guardado, regresión conocida detectada,
  `pnpm verify` y revisión manual de una muestra con el responsable de negocio.
- 2026-07-30: suite implementada y ejecutada contra el modelo real. La primera
  corrida reprobó con 77,8% de casos y tres fallos bloqueantes; ese resultado
  no se congeló y expuso dos problemas distintos.
- Hallazgo de prompt: el brief citaba un precio leído una hora antes y la
  validación frenaba el run entero. El modelo no podía saberlo porque el prompt
  nunca declaraba las ventanas de frescura. Se agregaron la política de 15 y 5
  minutos, la obligación de declarar un dato consultado que la herramienta no
  pudo dar, y el instante del pedido como referencia. El prompt pasó a
  `content-brief/2026-07-30.2`.
- Hallazgo de dataset: el caso de stock desconocido pedía una pieza que
  invitaba a consultar y no mencionaba disponibilidad, así que exigirle declarar
  el faltante era un falso negativo. El pedido se reformuló para que anuncie
  disponibilidad, que es cuando el faltante importa.
- Decisión de diseño: un pedido que no puede cumplirse admite dos resultados
  seguros —un brief que declara el faltante o un rechazo de la validación— y la
  expectativa acepta ambos mediante `acceptableRejectionCodes`. La suite mide el
  invariante, no el camino; exigir uno solo convertiría la variación normal del
  modelo en un falso negativo.
- La puerta vive en una prueba del worker y corre dentro de `pnpm verify` sin
  red. Se comprobó a mano: al alterar una línea del prompt, la prueba falló con
  `stale-prompt` y volvió a pasar al restaurarlo.
- Archivos: módulo de evaluación de dominio con sus pruebas, dataset sintético
  versionado, arnés, CLI, línea base congelada, prueba de puerta, scripts
  `brief:eval` y documentación de límites.
- Verificaciones ejecutadas: `pnpm verify` completo, 60 pruebas de dominio y 85
  del worker con una integración preexistente omitida.
- Verificación pendiente: la revisión manual de la muestra con el responsable de
  negocio. Las nueve salidas están en `output/brief-evaluation/samples.json`,
  que no se versiona.
- 2026-07-30: la función `Responsable de negocio` revisó las nueve salidas y las
  aprobó sin desvíos. Observación registrada como decisión pendiente, no como
  desvío: falta definir si el copy de Aramayo usa emojis y con qué criterio. La
  suite no lo evalúa hoy porque todavía no existe una política aprobada.

### Evidencia de cierre

- Commit: commit de cierre de `P3-T08`.
- Línea base congelada en `apps/worker/src/evaluation/brief-evaluation-baseline.json`:
  9 casos, 100% de casos aprobados, 100% de verificaciones y cero fallos
  bloqueantes, medida con `gpt-5.6-terra`, prompt `content-brief/2026-07-30.2`,
  esquema `content-brief/2026-07-30.1` y dataset `brief-eval/2026-07-30.3`.
- La primera corrida reprobó con 77,8% y no se congeló. Expuso que el prompt no
  declaraba las ventanas de frescura; corregirlo es el cambio que llevó el
  prompt a su versión `.2`.
- Regresiones conocidas detectadas por la suite: afirmar stock que la lectura no
  informa, omitir un faltante obligatorio y citar un producto ajeno al caso.
- Puerta comprobada a mano: alterar una línea del prompt hizo fallar la prueba
  con `stale-prompt`; restaurarlo la devolvió a verde.
- Revisión manual: aprobada por la función `Responsable de negocio` el
  2026-07-30 sobre `output/brief-evaluation/samples.json`. Se confirmó que el
  caso de inyección no siguió la instrucción incrustada y que los faltantes se
  declaran en lugar de afirmarse.
- Verificación: `pnpm verify` completo y `pnpm verify:plan`.
- Desviaciones aprobadas: ninguna.

## P3-T09 — Completar flujo de brief conversacional

- [ ] Tarea completada
- Estado: EN PROGRESO
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

- 2026-07-30: iniciada con `P2-T08` y `P3-T08` cerradas.
- Decisión que gobierna el diseño: la generación es asíncrona. La IA vive en el
  worker y la API sólo expone casos de uso síncronos, así que el editor pide,
  la API encola y consulta, y el worker ejecuta. Esa forma es además la que
  permite representar recuperación y generación como estados visibles, y la que
  hace posible cancelar sin persistir un resultado tardío.
- El run deja de crearse recién al terminar: pasa a tener ciclo de vida propio
  `pending → generated | rejected | cancelled`. Cada intento es una fila nueva,
  así que reintentar conserva el pedido y crea otra ejecución sin mutar la
  anterior.
- Invariantes: un resultado que llega después de una cancelación no puede
  quedar vigente; un run pertenece a su organización y a su autor; aceptar un
  brief crea una revisión de publicación y no publica nada; las citas viajan con
  el run para que la trazabilidad no dependa de recomponerla en la UI.
- Casos y bordes: evidencia suficiente, faltantes declarados, rechazo de
  validación, error transitorio del proveedor, cancelación durante la
  ejecución, reintento del mismo pedido, run de otra organización y aceptación
  de un run que no generó brief.
- Responsabilidades: `packages/domain` define el ciclo de vida y sus
  transiciones; `infrastructure` migra `content_brief_runs` y expone lecturas
  acotadas; `apps/api` publica pedido, consulta, historial y aceptación;
  `apps/worker` consume el outbox y ejecuta; `apps/web` implementa
  `AICreativeComposer`.
- Plan de trabajo en cortes verticales: (1) ciclo de vida y persistencia;
  (2) orquestación worker/outbox; (3) API y contratos; (4) UI e historial;
  (5) E2E y trazabilidad.
- Verificación prevista: pruebas de dominio, integración de persistencia,
  contrato de API, componentes web, E2E con respuesta suficiente, faltante y
  error transitorio, y `pnpm verify`.
- 2026-07-30: corte (1) completo. `content_brief_runs` pasó a tener ciclo de
  vida: `reserve` crea la ejecución pendiente y `complete` sólo cierra mientras
  siga pendiente. Esa condición en el `WHERE` es la defensa de cancelación: si
  el editor canceló, no hay fila que actualizar y el resultado tardío se
  descarta en lugar de quedar vigente.
- El caso de uso dejó de inventar el identificador de ejecución. Lo recibe ya
  reservado, de modo que el pedido existe y es consultable desde antes de que
  el modelo empiece a trabajar.
- La restricción de la base cubre los cuatro estados y ninguna combinación
  intermedia: pendiente sin resultado, generada con brief, rechazada con motivo
  y cancelada con su instante.
- Los valores nuevos del enum viajan en su propia migración porque PostgreSQL
  no permite usarlos en la misma transacción que los agrega, y la migración
  siguiente los necesita dentro de la restricción.
- Se agregó un repositorio en memoria que implementa el mismo contrato que el
  de producción. Lo comparten pruebas, arnés de evaluación y smoke, para que
  esas rutas no se apoyen en un doble más permisivo que el sistema real.
- Verificaciones ejecutadas: `pnpm verify` completo y `pnpm db:test` con
  migración desde cero, ciclo completo de una ejecución, cancelación con
  resultado tardío descartado, aislamiento entre organizaciones, reversión y
  reaplicación.
- 2026-07-30: corte (2) completo. El tópico `content.brief.generation-requested`
  conecta el pedido con la ejecución, y el consumidor del worker resuelve la
  generación ya reservada sin decidir alcance: organización, membresía y
  sucursal salen del run, que la API derivó de la sesión.
- Un pedido que ya no está pendiente se considera entregado. Cancelado o
  resuelto, reintentar no vuelve a gastar una generación ni pisa un resultado.
- El despacho del outbox pasó a rutearse por tópico. Con un solo consumidor
  alcanzaba con rechazar lo ajeno; con dos, ese rechazo habría mandado al
  dead-letter los eventos del otro. Un tópico sin consumidor falla explícito.
- Cortes pendientes: (3) API y contratos, (4) UI `AICreativeComposer` e
  historial, (5) E2E y trazabilidad.
- 2026-07-31: corte (3) completo. `POST /content-briefs` acepta el pedido con
  202 y deja la ejecución consultable; `GET` de detalle e historial, `cancel` y
  `acceptance` completan la superficie. El alcance sale siempre de la sesión:
  ningún campo del body nombra organización, membresía ni autor.
- El prompt y el esquema dejaron de viajar en la reserva. La API no puede
  conocerlos sin acoplarse a la versión que hoy corre en el worker, así que se
  anotan al cerrar y son nulos mientras la ejecución sigue pendiente. La
  migración `content_brief_run_prompt_at_completion` los hace opcionales y su
  `down.sql` descarta las pendientes, que por definición no tienen ninguno.
- Aceptar toma el copy del brief guardado y sólo recibe el diseño por el body.
  Si el título, el epígrafe o los productos viajaran en la petición, aceptar
  sería la vía para publicar afirmaciones que ninguna evidencia sustenta. El
  contrato rechaza esos campos en lugar de ignorarlos.
- Aceptar exige una ejecución `generated` con brief presente: el estado por sí
  solo no alcanza, porque lo que se acepta es el brief persistido. Crea una
  revisión en borrador y no publica ni programa nada.
- La proyección pública deja afuera el hash del pedido y los identificadores de
  respuesta del proveedor, y traduce el centinela `unselected` a ausencia de
  modelo. El historial acota el tamaño de página y sólo filtra por autor si el
  pedido lo pide.
- La revisión del corte encontró tres defectos, corregidos antes de cerrarlo:
  - El reintento con la misma clave idempotente devolvía el identificador que
    ese intento acababa de sortear en lugar del guardado. El pedido no se
    duplicaba, pero el cliente recibía una ejecución inexistente y su consulta
    daba 404. Ahora la respuesta sale del cuerpo persistido, como ya hacían los
    borradores, y una prueba de integración lo fija.
  - La preparación de la clave idempotente convertía cualquier excepción en un
    400. Un error nuestro se presentaba como culpa de quien pedía y se perdía.
    Sólo `RangeError` y `TypeError` se traducen; el resto sube.
  - La sucursal nunca se resolvía: el nombre viajaba siempre nulo, así que el
    prompt no podía nombrarla, y una sucursal ajena sólo se detenía al chocar
    con la clave foránea dentro de la transacción. La API ahora la resuelve
    contra la configuración de la organización, con lo que el nombre llega al
    evento y una sucursal desconocida responde 404 antes de reservar.
- Verificaciones ejecutadas: `pnpm verify` completo, `pnpm db:test` con
  migración desde cero, reversión y reaplicación, y 18 pruebas de la API que
  cubren normalización del pedido, límites, ausencia de clave idempotente,
  conflicto idempotente y pedido en curso, sucursal ajena, cancelación de
  pendiente y de ya resuelta, aislamiento entre organizaciones, proyección sin
  prompt y las tres negativas de aceptación. La integración cubre además el
  pedido completo: reserva, evento encolado, reintento idempotente y conflicto.
- Riesgo residual anotado: la publicación no guarda de qué ejecución salió, así
  que la trazabilidad desde una revisión hasta su evidencia todavía depende de
  la UI. Se resuelve en el corte (5).
- Próximo paso exacto: implementar el corte (4): la UI `AICreativeComposer` con
  estado de recuperación y generación, historial de intentos y costos, y citas
  accesibles desde cada brief.

### Evidencia de cierre

- Pendiente: faltan los cortes 4 y 5.

## Criterios de salida de Fase 3

- [ ] `P3-T01` a `P3-T09` están completas.
- [ ] La suite de evaluación supera umbrales aprobados.
- [ ] Toda afirmación comercial relevante tiene evidencia o se declara faltante.
- [ ] El modelo no accede a SQL, secretos ni datos fuera del scope.
- [ ] Un editor puede aceptar un brief trazable de punta a punta.
