# AGENTS.md — Manual operativo de Aramayo Content Platform

## 1. Propósito

Este archivo es el punto de entrada obligatorio para cualquier persona o agente
de IA que trabaje en este repositorio. Su objetivo es permitir continuar el
proyecto sin depender de conversaciones anteriores y sin tomar decisiones de
negocio, seguridad o arquitectura por intuición.

La plataforma crea, revisa, programa y publica contenido para Ferretería y
Lubricentro Aramayo. La prioridad, en este orden, es:

1. exactitud de la información comercial;
2. control humano sobre publicaciones y automatizaciones;
3. seguridad de credenciales y aislamiento de datos;
4. coherencia de marca;
5. idempotencia y trazabilidad;
6. mantenibilidad técnica;
7. velocidad de implementación.

## 2. Inicio rápido obligatorio

Antes de modificar archivos:

1. Leer este archivo completo.
2. Leer [`docs/STATUS.md`](docs/STATUS.md) para conocer fase, próxima tarea y
   bloqueos.
3. Leer la tarea completa en [`docs/phases/`](docs/phases/README.md).
4. Verificar que todas sus dependencias estén marcadas `[x]`.
5. Abrir los documentos específicos indicados en la tabla de routing.
6. Inspeccionar el código y los patrones existentes.
7. Declarar objetivo, invariantes, archivos previstos y verificación.
8. Implementar solamente el alcance de la tarea habilitada.

Comandos disponibles desde la raíz:

```bash
pnpm verify
pnpm dev
```

`pnpm verify` ejecuta la misma secuencia que integración continua:
`verify:stack`, `verify:plan`, `format:check`, `build`, `lint`, `typecheck`,
`test` y `smoke`. Cada paso también puede ejecutarse por separado; el detalle y
las pruebas obligatorias por tipo de cambio están en
[`docs/operations/TESTING.md`](docs/operations/TESTING.md).

No asumir comandos no listados en `package.json`.

## 3. Acceso rápido a documentación

| Necesidad | Leer primero |
|---|---|
| Estado y próxima tarea | [`docs/STATUS.md`](docs/STATUS.md) |
| Cómo comenzar, pausar o cerrar una tarea | [`docs/EXECUTION_GUIDE.md`](docs/EXECUTION_GUIDE.md) |
| Índice documental | [`docs/README.md`](docs/README.md) |
| Arquitectura y límites | [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) |
| Estados, entidades e invariantes | [`docs/architecture/DOMAIN.md`](docs/architecture/DOMAIN.md) |
| Stack y versiones fijadas | [`docs/architecture/STACK.md`](docs/architecture/STACK.md) |
| Fuente y migración del diseño | [`docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md`](docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md) |
| Decisiones aprobadas | [`docs/architecture/decisions/`](docs/architecture/decisions/) |
| OpenAI y selección de modelos | [`docs/integrations/OPENAI.md`](docs/integrations/OPENAI.md) |
| RAG y sistema comercial | [`docs/integrations/RAG_AND_COMMERCIAL_DATA.md`](docs/integrations/RAG_AND_COMMERCIAL_DATA.md) |
| Meta, OAuth y publicación | [`docs/integrations/META.md`](docs/integrations/META.md) |
| Configuración por proceso | [`docs/operations/CONFIGURATION.md`](docs/operations/CONFIGURATION.md) |
| Seguridad | [`docs/operations/SECURITY.md`](docs/operations/SECURITY.md) |
| Secretos y rotación | [`docs/operations/SECRETS.md`](docs/operations/SECRETS.md) |
| Estrategia de pruebas | [`docs/operations/TESTING.md`](docs/operations/TESTING.md) |
| Incidentes y recuperación | [`docs/operations/RUNBOOKS.md`](docs/operations/RUNBOOKS.md) |
| Backlog completo | [`docs/phases/README.md`](docs/phases/README.md) |

### Fases

| Fase | Documento | Resultado esperado |
|---|---|---|
| 0 | [`PHASE-0-FOUNDATION.md`](docs/phases/PHASE-0-FOUNDATION.md) | Stack reproducible y decisiones técnicas |
| 1 | [`PHASE-1-DESIGN-ENGINE.md`](docs/phases/PHASE-1-DESIGN-ENGINE.md) | Motor visual migrado y validado |
| 2 | [`PHASE-2-PLATFORM-CORE.md`](docs/phases/PHASE-2-PLATFORM-CORE.md) | Borrador, revisión y aprobación |
| 3 | [`PHASE-3-OPENAI-RAG.md`](docs/phases/PHASE-3-OPENAI-RAG.md) | Brief factual con fuentes |
| 4 | [`PHASE-4-IMAGE-GENERATION.md`](docs/phases/PHASE-4-IMAGE-GENERATION.md) | Variantes visuales personalizadas |
| 5 | [`PHASE-5-META-PUBLISHING.md`](docs/phases/PHASE-5-META-PUBLISHING.md) | Publicación segura en Meta |
| 6 | [`PHASE-6-SCHEDULING.md`](docs/phases/PHASE-6-SCHEDULING.md) | Calendario y recurrencias |
| 7 | [`PHASE-7-PRODUCTION.md`](docs/phases/PHASE-7-PRODUCTION.md) | Producción, observabilidad y piloto |

## 4. Routing por tipo de trabajo

El agente debe leer solamente la documentación relevante, pero nunca omitir la
tarea activa ni `STATUS.md`.

### Cambios de dominio o persistencia

Leer:

- `docs/architecture/DOMAIN.md`;
- `docs/architecture/ARCHITECTURE.md`;
- ADR relacionados;
- fase activa;
- `docs/operations/SECURITY.md`;
- `docs/operations/TESTING.md`.

Comprobar especialmente ownership, autorización, idempotencia, transacciones,
auditoría, migraciones y concurrencia.

### Cambios frontend

Leer:

- arquitectura;
- `docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md` cuando afecte piezas o tokens;
- contratos de la funcionalidad;
- estados de dominio relevantes;
- criterios visuales de Fase 1 o Fase 4;
- pruebas y accesibilidad.

Usar variantes explícitas para flujos diferentes. No crear un compositor
monolítico gobernado por muchos booleanos.

### OpenAI, prompts o generación de imágenes

Leer:

- `docs/integrations/OPENAI.md`;
- `docs/integrations/RAG_AND_COMMERCIAL_DATA.md`;
- Fase 3 y/o Fase 4;
- seguridad;
- contratos de `ContentBrief`.

Un cambio de modelo, prompt, herramienta o esquema requiere evaluación y versión
registrada. No actualizar modelos por memoria.

### Meta, OAuth, publicación o programación

Leer:

- `docs/integrations/META.md`;
- Fase 5 y/o Fase 6;
- dominio;
- seguridad;
- runbooks.

Confirmar cuenta, destino, snapshot aprobado, idempotencia y efecto del reintento
antes de cualquier escritura externa.

### Contenido, copy y calendario editorial

Leer:

- contexto de marca aprobado;
- fuente factual del producto o mensaje;
- criterios visuales;
- tarea activa;
- reglas de la skill especializada que corresponda.

El calendario editorial de marketing no reemplaza la programación técnica del
sistema. Las recomendaciones generales de una skill nunca sustituyen datos
reales de rendimiento, horarios comerciales o restricciones de Meta.

## 5. Fuente de verdad y precedencia

La precedencia es:

1. seguridad, permisos y restricciones legales;
2. pedido explícito del usuario;
3. este `AGENTS.md`;
4. ADR aprobados;
5. arquitectura y dominio;
6. tarea activa y criterios de aceptación;
7. documentación de integración;
8. recomendaciones de skills;
9. preferencias locales de implementación.

Si dos documentos del mismo nivel se contradicen:

- no elegir silenciosamente;
- registrar el conflicto;
- proponer la decisión mínima;
- crear o actualizar un ADR antes de implementar si cambia arquitectura.

La documentación externa puede cambiar. Cuando importen versiones, permisos,
formatos soportados, modelos, precios, límites o políticas, verificar fuentes
oficiales vigentes y registrar fecha/enlace.

## 6. Protocolo de tareas

### Selección

Una tarea se puede iniciar únicamente si:

- está marcada `[ ]`;
- todas sus dependencias están `[x]`;
- no existe un bloqueo externo aplicable;
- su alcance coincide con los ADR;
- es posible ejecutar sus verificaciones.

No comenzar una tarea posterior porque resulte más atractiva. Si una tarea
habilitada es demasiado grande, dividirla dentro del mismo alcance y mantener su
ID padre abierto.

### Antes de implementar

Registrar en el comentario de trabajo:

- ID y objetivo;
- restricciones e invariantes;
- casos principales y bordes;
- módulos responsables;
- archivos previstos;
- verificaciones que se ejecutarán.

Para módulos complejos, definir primero estados, transiciones, permisos,
idempotencia y fallos parciales.

### Durante la implementación

- Hacer cambios pequeños y revisables.
- Mantener la tarea `[ ]` mientras exista trabajo o verificación pendiente.
- Documentar decisiones nuevas.
- No ampliar permisos ni integrar proveedores por conveniencia.
- No ocultar fallos con fallbacks silenciosos.
- Si el trabajo cruza sesiones, actualizar `Notas de progreso`.

### Cierre

Para cerrar una tarea:

1. completar cada criterio con `[x]`;
2. ejecutar todas las verificaciones;
3. revisar el cambio completo;
4. documentar desviaciones;
5. completar `Evidencia de cierre`;
6. marcar `Tarea completada`;
7. actualizar `docs/STATUS.md`;
8. ejecutar `pnpm verify:plan`;
9. dejar el árbol Git limpio o explicar cambios ajenos.

Una afirmación como “funciona” o “código terminado” no es evidencia.

## 7. Invariantes del negocio

- Todo contenido se crea para Ferretería y Lubricentro Aramayo.
- Una pieza tiene una idea principal.
- Texto, CTA y producto deben poder leerse en móvil.
- El CTA principal se orienta a consulta o WhatsApp, salvo campaña aprobada.
- Precio, stock, promoción y horario requieren una fuente vigente.
- Stock desconocido es distinto de stock cero.
- Si falta información, el sistema debe declararlo y bloquear la afirmación.
- Un dato recuperado debe conservar fuente, fecha y ámbito de sucursal.
- Una pieza aprobada referencia un snapshot inmutable.
- Editar contenido aprobado requiere una nueva revisión.
- Guardar, generar, aprobar, programar y publicar son acciones diferentes.
- Ninguna de esas acciones puede disparar otra de forma oculta.
- Automatizar desde compras queda fuera de alcance hasta integrar y aprobar el
  sistema comercial.

## 8. Arquitectura obligatoria

### Límites

- `apps/web`: presentación y composición de experiencia.
- `apps/api`: transporte, autenticación y casos de uso síncronos.
- `apps/worker`: IA, render, publicación y trabajos programados.
- `packages/configuration`: contratos de entorno tipados por proceso.
- `packages/domain`: reglas puras sin Nest, React, SDK ni base de datos.
- `packages/contracts`: contratos públicos entre procesos.
- `packages/process-health`: sondas de infraestructura y readiness compartidas.
- `packages/design-engine`: composición visual determinista.
- `packages/brand-knowledge`: conocimiento aprobado y versionado.
- `infrastructure`: migraciones y recursos operativos.

### Backend

- Monolito modular NestJS con worker separado.
- El bootstrap valida configuración antes de aceptar tráfico o trabajos.
- Liveness y readiness son endpoints distintos; readiness sí consulta
  dependencias.
- Controladores delgados.
- Reglas en dominio o casos de uso.
- Acceso a datos detrás de repositorios o puertos.
- SDK externos detrás de adaptadores inyectables.
- PostgreSQL es fuente de verdad.
- Redis/BullMQ transporta trabajo y no es la única fuente de estado.
- Cambios atómicos usan transacciones.
- Efectos externos usan outbox/idempotencia cuando corresponda.
- API y workers implementan cierre ordenado.

### Frontend

Las variantes principales son:

- `TemplatePublicationComposer`;
- `AICreativeComposer`;
- `RecurringStoryComposer`;
- `ProductPromotionComposer`.

El estado compartido debe exponerse con límites `state`, `actions` y `meta`.
Cada pantalla representa explícitamente loading, empty, error, success,
forbidden y partial success cuando aplique.

### TypeScript

- TypeScript estricto.
- Nunca usar `any`.
- Usar `unknown` y validadores de borde.
- Tipos públicos de entrada y salida explícitos.
- Uniones discriminadas para estados y resultados variantes.
- No mezclar DTO de transporte, entidades de dominio y modelos de UI.
- Evitar aserciones de tipo; justificar las inevitables.

## 9. IA, RAG y datos comerciales

- Responses API y Images API cumplen responsabilidades diferentes.
- El modelo no ejecuta SQL.
- El modelo no recibe credenciales.
- Los documentos aprobados se recuperan mediante File Search.
- Precio, stock, productos y compras se consultan mediante herramientas
  comerciales tipadas y de solo lectura.
- Organización y sucursal se derivan de la sesión, nunca de argumentos del
  modelo.
- Limitar filas, campos, tamaño, timeout y frecuencia.
- Separar hechos verificados, propuesta creativa e información faltante.
- Conservar modelo, prompt, herramientas, fuentes, latencia, costo y request ID.
- Un fallo de esquema no produce un brief utilizable.
- Cambios de modelo o prompt deben superar la suite de evaluación.

## 10. Diseño y contenido

### Reglas visuales de Aramayo

- El sistema vigente se localiza mediante
  `docs/architecture/DESIGN-SYSTEM-SOURCE-MAP.md`.
- La migración es code-native: variables tipadas, tokens, formatos, primitivas y
  componentes React.
- PNG, HTML exportado y la carpeta histórica son referencias o fixtures; no son
  la implementación del motor.
- Una idea por pieza.
- Jerarquía fuerte y lectura inmediata.
- Sin decoración gratuita ni fondos recargados.
- Usar activos, colores y tipografías aprobados.
- Iconos Lucide por nombre semántico.
- Logo, texto crítico, precio y CTA se componen determinísticamente.
- La imagen generativa puede aportar fondo, escena o recurso de producto.
- Las safe zones y formatos tienen una única definición.
- Una imagen que no decodifica hace fallar el render.
- Portadas de destacadas se centran en el círculo seguro.

### Reglas de copy

- Español argentino claro y natural.
- No copiar tonos genéricos, exagerados o de “gurú”.
- No inventar beneficios técnicos, disponibilidad, urgencia o descuentos.
- No usar engagement bait como sustituto de una propuesta útil.
- La primera línea debe comunicar producto, beneficio o contexto.
- El CTA indica una acción real disponible.
- Hashtags y longitud se adaptan al destino; no se replican a ciegas.
- Incluir texto alternativo cuando el formato/plataforma lo permita.

## 11. Skills disponibles y cuándo usarlas

Las skills aportan un procedimiento especializado, pero no cambian la fuente de
verdad ni autorizan acciones externas.

| Skill | Usar cuando |
|---|---|
| `social-media-context-sms` | Definir o actualizar audiencia, voz, pilares y plataformas |
| `content-strategy-sms` | Diseñar pilares, mix y estrategia editorial |
| `content-calendar-sms` | Crear un calendario editorial antes de programarlo técnicamente |
| `caption-writer-sms` | Escribir captions para Instagram, Facebook, Reels o Stories |
| `imagegen` | Generar o editar recursos raster con IA |
| `frontend-design` | Definir una dirección visual distintiva para el panel |
| `vercel-react-best-practices` | Implementar o revisar React/Next.js |
| `vercel-composition-patterns` | Diseñar composición y ownership de componentes |
| `nestjs-best-practices` | Implementar módulos, DTO, guards, colas o servicios NestJS |
| `openai-docs` | Verificar implementación y modelos vigentes de OpenAI |
| `playwright` | Automatizar navegador, render o pruebas E2E |

### Orden recomendado para trabajo de redes

1. `social-media-context-sms`;
2. revisar fuentes factuales de Aramayo;
3. `content-strategy-sms`;
4. `content-calendar-sms`;
5. `caption-writer-sms`;
6. `imagegen` o motor determinista;
7. revisión factual y visual;
8. aprobación humana;
9. programación o publicación mediante el dominio de la plataforma.

Antes de usar las skills sociales por primera vez, crear y aprobar
`.agents/social-media-context-sms.md`. Los defaults genéricos de una skill no
deben imponerse sobre la estrategia, horarios, voz o plataformas de Aramayo.

## 12. Seguridad y acciones externas

### Secretos

- Nunca versionar `.env` real.
- Nunca mostrar tokens completos.
- Nunca enviar secretos al cliente o al modelo.
- Redactar logs, errores, fixtures y capturas.
- Cifrar tokens de Meta en reposo.
- Aplicar mínimo privilegio y rotación.

### Efectos externos

En desarrollo, usar dobles por defecto.

Antes de publicar, programar o cambiar una conexión real:

1. confirmar que el usuario pidió esa acción;
2. resolver el activo exacto;
3. mostrar snapshot, copy, destino y horario;
4. comprobar rol y aprobación;
5. usar idempotencia;
6. registrar auditoría;
7. representar fallos parciales;
8. reconciliar antes de reintentar una respuesta ambigua.

Un reintento nunca vuelve a publicar un destino ya confirmado. No borrar una
publicación remota automáticamente para “compensar” un fallo parcial.

## 13. Pruebas y revisión

La verificación se elige por riesgo:

- dominio: unit tests exhaustivos de transiciones e invariantes;
- persistencia: integración, ownership, transacciones y migraciones;
- API: contrato, validación, autorización e idempotencia;
- UI: componentes, accesibilidad y E2E;
- diseño: visual regression y revisión en tamaño real;
- OpenAI: schemas, tools, evaluaciones y smoke tests controlados;
- Meta: dobles, sandbox/cuenta de prueba y reconciliación;
- scheduling: tiempo, concurrencia, reinicios y duplicados;
- operación: restore, alertas, runbooks y rollback.

Antes de entregar:

- revisar corrección funcional;
- revisar tipos y nombres;
- revisar errores y fallos parciales;
- revisar autorización y scopes;
- revisar transacciones e idempotencia;
- revisar secretos y privacidad;
- revisar accesibilidad;
- revisar observabilidad;
- revisar documentación y regresiones.

## 14. Cambios de documentación

Actualizar documentos en la misma tarea cuando cambie:

- una decisión arquitectónica;
- un contrato público;
- un estado o transición;
- un permiso o scope;
- un proveedor/modelo;
- un procedimiento operativo;
- un criterio de aceptación;
- un bloqueo o próxima tarea.

No duplicar la misma regla en varios archivos si puede enlazarse. Este archivo
resume y enruta; los detalles viven en sus documentos especializados.

Después de tocar documentación de proyecto, ejecutar:

```bash
pnpm verify:plan
```

## 15. Handoff obligatorio

Si una tarea queda abierta, registrar:

```md
### Notas de progreso

- Fecha:
- Estado real:
- Archivos modificados:
- Decisiones tomadas:
- Verificaciones ejecutadas:
- Verificaciones pendientes:
- Bloqueo, si existe:
- Próximo paso exacto:
```

Para cerrar:

```md
### Evidencia de cierre

- Commit:
- Comandos y resultados:
- Evidencia visual o remota:
- Desviaciones aprobadas:
```

## 16. Definition of Done general

Una tarea está terminada solo cuando:

- cumple todos sus criterios de aceptación;
- respeta dependencias y arquitectura;
- tiene pruebas proporcionales al riesgo;
- maneja éxito, error y fallos parciales;
- mantiene tipos estrictos;
- no expone secretos ni amplía permisos;
- conserva idempotencia y auditoría donde corresponde;
- actualiza documentación y evidencia;
- `pnpm verify:plan` pasa;
- el árbol Git no contiene cambios accidentales.
