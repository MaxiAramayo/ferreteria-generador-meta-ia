# Catálogo y política de fuentes de conocimiento

- Estado: POLÍTICA APROBADA; FUENTES AÚN NO ACTIVADAS
- Inventario técnico: 2026-07-29
- Datos de negocio incorporados: 2026-07-29
- Aprobación de negocio: 2026-07-29
- Responsable de aprobación: función `Responsable de negocio`
- Activación para IA: NO AUTORIZADA

## Propósito y límite

Este documento clasifica las fuentes que podrían sustentar un `ContentBrief`.
No ingiere archivos, no habilita OpenAI y no convierte datos del seed, del
generador histórico o de este repositorio en hechos comerciales aprobados.

La asignación de propiedad se expresa por función. El nombre de la persona y la
evidencia de su aprobación viven fuera de Git, de acuerdo con
[`ADR-012`](../architecture/decisions/ADR-012-IDENTITY-ENVIRONMENTS-OWNERSHIP.md).

## Clasificaciones

### Canal

- `documental`: identidad, tono, servicios, políticas, preguntas frecuentes o
  fichas aprobadas. Puede recuperarse semánticamente sólo después de `P3-T03`.
- `estructurado`: productos, precio, stock, promociones, horarios y contactos
  vigentes. Se consulta mediante un puerto tipado; no se copia a documentos.
- `humano`: brief o decisión puntual aprobada y asociada a una campaña.

### Sensibilidad

- `publicable`: puede mostrarse externamente cuando está vigente y aprobada.
- `interna`: puede orientar el trabajo, pero no se reproduce textualmente.
- `restringida`: sólo llega al caso de uso autorizado y nunca al modelo si no
  resulta imprescindible.
- `prohibida`: secretos, datos personales innecesarios, costo, margen, datos de
  proveedores o credenciales. No se ingiere ni se envía al modelo.

### Estado de ciclo de vida

- `candidate`: identificada, todavía no aprobada para recuperación.
- `approved`: revisada por su propietario, todavía no activada.
- `active`: aprobada, vigente y disponible para nuevas consultas.
- `suspended`: bloqueada temporalmente por contradicción, incidente o revisión.
- `retired`: retirada; no participa en consultas nuevas.
- `missing`: la fuente requerida todavía no fue identificada.

Una salida generada, un chat, un prompt o una publicación anterior nunca son una
fuente y no reciben nivel de autoridad.

## Inventario

La fecha de revisión técnica confirma únicamente que la referencia existe o que
la ausencia fue comprobada. No reemplaza la revisión del negocio.

| ID | Hechos permitidos | Canal y referencia actual | Autoridad | Sensibilidad | Volatilidad y vigencia propuesta | Función propietaria | Revisión técnica | Revisión de negocio | Estado |
|---|---|---|---|---|---|---|---|---|---|
| `KN-001` | nombre, nombre corto, claim, handle | documental: [`packages/brand-knowledge/src/brand-profile.ts`](../../packages/brand-knowledge/src/brand-profile.ts) | perfil heredado confirmado por el negocio | publicable | estable; revisar cada 180 días o ante cambio de marca | Responsable de negocio | 2026-07-29 | inventario aprobado 2026-07-29 | approved |
| `KN-002` | tono, objetivos, CTA y tipos de pieza permitidos | documental: [`PIECE-CATALOG.md`](../architecture/PIECE-CATALOG.md) y reglas de copy de `AGENTS.md` | política editorial aprobada del proyecto | interna/publicable según campo | estable; revisar cada 180 días y ante cambio editorial | Responsable de negocio | 2026-07-29 | inventario aprobado 2026-07-29 | approved |
| `KN-003` | direcciones, teléfono, WhatsApp y horario semanal por sucursal | estructurado: configuración auditada de organización y ubicación en PostgreSQL | fuente operativa prevista | publicable | alta; versión vigente y revalidación el día de aprobación/publicación | Responsable de negocio | 2026-07-29 | inventario aprobado; el seed no constituye evidencia publicable | approved |
| `KN-004` | servicios reales de ferretería y lubricentro, alcance, rubros que se venden y que no | documental: `KN-006`, secciones 6 y 7 | fuente aportada y aprobada por el negocio | publicable | media; revisar cada 90 días o al cambiar un servicio | Responsable de negocio | 2026-07-29 | inventario y extracto aprobados 2026-07-29 | approved |
| `KN-005` | medios de pago, cuenta corriente y alcance geográfico | documental: `KN-006`, sección 8 | fuente aportada y aprobada por el negocio | publicable | media; cada versión declara inicio y fin | Responsable de negocio | 2026-07-29 | inventario y extracto aprobados 2026-07-29 | approved |
| `KN-006` | contexto del negocio: identificación, locales, surtido, servicios, segmentos | documental: informe de contexto y definición de negocio, fuera del repositorio | documento del negocio, actualizado a julio de 2026 | interna; extracto publicable acotado | media; revisar cada 180 días o ante cambio de surtido, sistema o locales | Responsable de negocio | 2026-07-29 | inventario y extracto publicable aprobados 2026-07-29 | approved |
| `KN-007` | garantías, cambios y devoluciones | humano: fuente aprobada para cada caso; no existe una política general activa | sin una fuente aprobada para el caso no existe autoridad | publicable/interna | limitada al caso y a la vigencia declarada por su fuente | Responsable de negocio | 2026-07-29 | política de consulta caso por caso aprobada 2026-07-29 | missing |
| `KC-001` | identidad de producto, SKU, marca, presentación, categoría y estado discontinuado | estructurado: Odoo 18 (ver [Sistema comercial](#sistema-comercial)); puerto tipado pendiente de `P3-T05` | maestro comercial identificado | publicable; excluir costo/proveedor | media; consultar en el flujo y conservar timestamp | Responsable de negocio + Administrador de Odoo | 2026-07-29 | inventario aprobado; método de acceso aún no seleccionado | approved |
| `KC-002` | precio vigente, moneda, unidad y condiciones explícitas | estructurado: Odoo 18; puerto tipado pendiente de `P3-T05` | única fuente válida para precio | publicable; costo y margen prohibidos | muy alta; máximo 15 minutos y revalidación antes de publicar | Responsable de negocio + Administrador de Odoo | 2026-07-29 | umbral aprobado 2026-07-29 | approved |
| `KC-003` | stock por sucursal y timestamp | estructurado: Odoo 18; puerto tipado pendiente de `P3-T05` | única fuente válida para disponibilidad | interna/publicable según política | muy alta; máximo 5 minutos y revalidación antes de publicar | Responsable de negocio + Administrador de Odoo | 2026-07-29 | umbral aprobado 2026-07-29 | approved |
| `KC-004` | promoción, precio anterior, condiciones e intervalo de vigencia | humano: autorización del negocio por pieza; Odoo no gobierna promociones hoy | única fuente válida para promoción | publicable | muy alta; aprobación por pieza con condiciones, `effective_from` y `effective_until`; revalidar antes de publicar | Responsable de negocio | 2026-07-29 | gobierno por pieza aprobado 2026-07-29 | approved |
| `KC-005` | recepción de mercadería confirmada | estructurado: Odoo 18; consulta futura | evidencia operativa, nunca disparador automático | interna | alta; sólo el evento confirmado y su timestamp | Responsable de negocio + Administrador de Odoo | 2026-07-29 | inventario aprobado; fuera de automatización hasta implementar el acceso | approved |
| `KH-001` | objetivo, público, oferta y restricciones de una campaña puntual | humano: brief versionado y aprobado, todavía no implementado | decisión de campaña dentro de su alcance | interna/publicable según campo | limitada al intervalo de la campaña | Responsable de negocio | 2026-07-29 | pendiente por campaña | candidate |

## Sistema comercial

| Aspecto | Detalle |
|---|---|
| Sistema | Odoo 18 Community, en producción desde junio de 2026 |
| Reemplazó a | ADM Global |
| Escala | Cerca de 10.000 productos, unos 9.600 activos |
| Taxonomía | Árbol `Catálogo Aramayo`: 18 rubros de primer nivel y unas 244 categorías con productos |
| Datos disponibles | Producto, SKU, categoría, precio vigente, stock por local, fecha de actualización |
| Custodio técnico | `Administrador de Odoo` |
| Método de acceso | **Propuesta técnica: XML-RPC sobre HTTPS**, con API key de un usuario técnico de solo lectura y operaciones `execute_kw` encerradas por el adaptador. Requiere revisión del `Administrador de Odoo` antes de conectar; ver [`ODOO-READ-ACCESS.md`](ODOO-READ-ACCESS.md) |

La escala decide el canal: un maestro de ese tamaño, que cambia sin versión, no
puede copiarse a un documento. El catálogo se consulta; no se indexa.

La taxonomía de Odoo es la estructura operativa del catálogo, no una fuente de
autoridad sobre el surtido. Que exista una categoría no prueba que el rubro se
comercialice: eso lo declara `KN-004`. Una categoría vacía, heredada o creada
para una prueba no habilita ninguna afirmación.

> **Discrepancia resuelta.** El informe de contexto de junio de 2026 declaraba
> ADM Global como sistema de gestión. El negocio confirmó que el sistema en
> producción es Odoo 18 y el informe se corrigió en julio de 2026. Este catálogo
> toma Odoo 18 como fuente vigente.

Identificar el sistema y definir un puerto no lo vuelve consultable: `KC-001` a
`KC-005` siguen sin un adaptador real revisado y habilitado. Hasta que exista esa
lectura, toda afirmación de precio o stock queda bloqueada, no aprobada por otra
vía.

## Canal web para clientes

Existe un sitio web para clientes **en desarrollo y todavía no publicado**. Es un
proyecto separado de esta plataforma: mostrará el catálogo por rubros con pedido
o consulta por WhatsApp, sin carrito ni pago en línea.

- No se afirma que el sitio existe, está online o permite comprar, hasta que el
  negocio lo confirme publicado. Hoy es un estado, no un canal vigente.
- Su alcance previsto no cambia ninguna regla: siguen valiendo que no se afirma
  delivery, que no hay compra ni pago en línea y que el CTA apunta a consulta o
  WhatsApp.
- Cuando se publique, su estado y URL los declara la configuración de
  organización, no este catálogo.

## Extracto publicable de `KN-006`

El informe de contexto es `interna`. Sólo el siguiente extracto puede sustentar
una afirmación externa; el resto orienta el trabajo pero no se reproduce.

Publicable:

- Rubros que se comercializan: bulonería, herramientas manuales y eléctricas,
  electricidad, plomería, pinturas y entonadores, rodamientos, juntas,
  cerrajería, baterías con instalación, cosmética automotriz, correas,
  repuestos de hormigonera, línea chica de repuestos de línea blanca, insumos y
  bombas de pileta, manguera, alambre de construcción, seguridad industrial,
  línea invierno y accesorios de hogar.
- Rubros que **no** se comercializan: materiales de corralón y construcción
  pesada, bombas de agua domiciliarias, alambre rural y línea agropecuaria
  especializada, copias de llaves.
- Servicios del lubricentro: cambio de aceite con fosa, venta de lubricantes,
  filtros y baterías; para autos, motos, utilitarios y autoelevadoras. No se
  atienden camiones ni maquinaria agrícola. Funciona únicamente en casa central.
- Medios de pago aceptados y alcance geográfico local.
- Cuenta corriente disponible sólo para empresas.
- Ausencia de servicio de delivery.

No publicable, aunque esté en la misma fuente:

- Nombres propios de titularidad, gestión y personal. Se usan funciones.
- Facturación, márgenes, ticket promedio y comparación de rendimiento entre
  locales.
- Nombres de competidores y cualquier evaluación sobre ellos.
- Diagnóstico interno: debilidades, FODA y limitaciones de sistemas.
- Costos, proveedores y condiciones de compra.

La restricción es de contenido, no de redacción: estos datos no entran al índice.
No depende de que el modelo decida no mencionarlos.

## Autoridad por tipo de afirmación

| Afirmación | Fuente exigida | Una fuente que no alcanza |
|---|---|---|
| Identidad y tono | versión `active` de `KN-001`/`KN-002` | memoria del modelo o texto de una publicación anterior |
| Dirección, contacto u horario | versión vigente de `KN-003`, con sucursal explícita | perfil heredado, captura o folleto sin fecha |
| Servicio ofrecido y condiciones | versión `active` de `KN-004` | inferencia por el nombre “Lubricentro” |
| Producto y presentación | resultado vigente de `KC-001` | foto, caption anterior o SKU ambiguo |
| Precio | resultado vigente de `KC-002` | catálogo PDF, flyer, documento RAG o prompt |
| Stock/disponibilidad | resultado vigente de `KC-003` y sucursal | “producto existente”, recepción o stock de otra sucursal |
| Promoción/urgencia/descuento | `KC-004` vigente y, si aplica, `KH-001` | precio anterior aislado o campaña vencida |
| Plazo de entrega o pedido | autorización explícita del negocio por pieza | práctica habitual, pedido anterior o supuesto del modelo |
| Rubro comercializado o excluido | versión `active` de `KN-004` | existencia de una categoría en la taxonomía de Odoo |
| Existencia del sitio web para clientes | confirmación del negocio de que está publicado | que el proyecto exista o esté en desarrollo |
| Beneficio técnico, garantía o seguridad | ficha aprobada específica y aprobación humana | conocimiento general del modelo o descripción comercial no atribuida |

## Resolución de ausencia y contradicción

1. El caso de uso identifica el tipo de afirmación y su fuente exigida.
2. Una fuente `candidate`, `suspended`, `retired`, vencida o de otra
   organización se trata como ausente.
3. Si falta una fuente obligatoria, el resultado declara
   `missing_information`; no rellena el dato, no cambia de canal y no inventa un
   disclaimer para volverlo publicable.
4. Si dos fuentes activas difieren sobre el mismo hecho y ámbito, se conservan
   ambas evidencias, se bloquea la afirmación y se solicita resolución a la
   función propietaria.
5. Una fuente estructurada vigente prevalece sobre una copia documental sólo
   cuando esta matriz la declara autoridad para ese hecho. La copia obsoleta se
   suspende o retira; no se oculta el conflicto.
6. Resolver una contradicción crea una nueva versión o cambia el estado de una
   fuente. Nunca se reescribe la evidencia usada por un snapshot anterior.

## Política de afirmaciones

### Permitidas con evidencia vigente

- Reproducir hechos explícitos dentro del ámbito de organización, sucursal,
  producto y campaña indicado por la fuente.
- Parafrasear una descripción aprobada sin ampliar su significado.
- Proponer copy creativo separándolo de los hechos verificados.
- Omitir un precio opcional y usar un CTA real de consulta cuando la pieza lo
  permita. Omitir no autoriza afirmar disponibilidad.

### Requieren lectura estructurada vigente, no aprobación por pieza

Decisión del negocio del 2026-07-29: precio y disponibilidad no se firman uno
por uno, porque salen del sistema comercial. Lo que los habilita es la lectura
con timestamp vigente, no una persona.

- Precio corriente de un producto.
- Disponibilidad y stock por sucursal.
- Categoría y presentación del producto.

Sin lectura vigente la afirmación queda bloqueada. La ausencia de aprobación
humana no es permiso para afirmar de memoria, ni para tomar el dato de un
documento: es exactamente el caso que `KC-002` y `KC-003` gobiernan.

### Requieren aprobación humana explícita

Son afirmaciones que ningún sistema respalda. No se infieren de un precio más
bajo, de una compra anterior ni de una publicación previa.

- Descuento, promoción, urgencia, escasez o promesa de resultado.
- Plazo de entrega, de pedido o de disponibilidad futura.
- Horario especial o cambio de contacto.
- Beneficios técnicos, compatibilidad, rendimiento o seguridad.
- Garantías, cambios y devoluciones, siempre con una fuente aprobada para el caso.
- Comparaciones, testimonios, reseñas, atribuciones y marcas de terceros.
- Todo contenido generado por IA durante las fases iniciales.

### Prohibidas

- Inferir stock a partir de existencia del producto o de una compra/recepción.
- Convertir stock desconocido en cero, o cero en “consultar disponibilidad”.
- Calcular descuentos o vigencias que la fuente no entregue.
- Usar un documento estático como precio o stock actual.
- Exponer costo, margen, proveedor, credenciales o datos personales
  innecesarios.
- Presentar texto generado como cita o como evidencia.

## Disclaimers

Un disclaimer agrega condiciones conocidas; nunca compensa evidencia faltante.

- Precio: mostrar moneda, unidad, condición e intervalo sólo si la fuente los
  entrega. Si falta una condición necesaria, bloquear.
- Stock: comunicar el ámbito de sucursal y la frescura aprobada. Si el estado es
  desconocido, declarar que falta información o usar una pieza que no afirme
  disponibilidad.
- Promoción: mostrar condiciones materiales y fecha de finalización provistas
  por la fuente; no crear “hasta agotar stock” por defecto.
- Horario especial: indicar fecha y sucursal. El horario semanal no demuestra
  apertura en un feriado o excepción.

Los umbrales aprobados son 15 minutos para precio y 5 minutos para stock, ambos
con revalidación obligatoria antes de publicar. El wording final puede adaptarse
a la pieza, pero no puede omitir condiciones materiales ni compensar una fuente
ausente.

## Retiro y trazabilidad

- Retirar una fuente crea una versión con estado `retired`, motivo, actor y
  fecha; no borra versiones citadas por ejecuciones o snapshots.
- Toda consulta futura filtra `organization_id`, `status=active` y ventana de
  vigencia antes de recuperar contenido.
- Si existe copia remota, el retiro queda incompleto hasta reconciliar su
  eliminación o desactivación. Esta operación pertenece a `P3-T03`.
- Una ejecución conserva ID de fuente, versión, hash, ámbito y timestamp. El
  contenido completo sólo se retiene según su clasificación.

## Aprobación de negocio

Resuelto el 2026-07-29 por el negocio:

- Sistema comercial identificado: Odoo 18 Community, en producción desde junio
  de 2026, con su escala y taxonomía registradas.
- Política de aprobación: precio y disponibilidad se habilitan por lectura
  vigente; descuentos y plazos exigen autorización explícita.
- Fuente aportada para servicios, rubros y medios de pago (`KN-006`), con su
  extracto publicable delimitado.
- Canal web declarado como proyecto no publicado.
- Inventario completo y escenarios `S-01` a `S-19` aprobados por la función
  `Responsable de negocio` el 2026-07-29.
- Precio aprobado con vigencia máxima de 15 minutos y stock con vigencia máxima
  de 5 minutos; ambos deben revalidarse antes de publicar.
- Garantías, cambios y devoluciones se consultan caso por caso y no se afirman
  sin una fuente aprobada para ese caso.
- Promociones requieren aprobación humana por pieza, condiciones materiales y
  fechas de vigencia.
- Custodio técnico designado por función: `Administrador de Odoo`.

La aprobación de esta política no activa por sí sola ninguna fuente ni autoriza
una conexión real. Continúan pendientes:

1. revisar con el `Administrador de Odoo` la propuesta XML-RPC, el mapping y los
   permisos exactos de solo lectura;
2. activar documentos únicamente después del ciclo de ingestión de `P3-T03`;
3. aportar la fuente aprobada de cada garantía, cambio o devolución cuando un
   caso concreto la requiera.
