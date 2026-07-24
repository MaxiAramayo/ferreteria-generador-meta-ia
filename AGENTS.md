# AGENTS.md

## Propósito

Este repositorio implementa el publicador y futura plataforma operativa de
Ferretería y Lubricentro Aramayo. La prioridad es preservar datos comerciales,
identidad de marca y control humano sobre acciones externas.

## Fuente de verdad del trabajo

- Estado global: `docs/STATUS.md`.
- Definición de fases y tareas: `docs/phases/`.
- Arquitectura: `docs/architecture/ARCHITECTURE.md`.
- Reglas del dominio: `docs/architecture/DOMAIN.md`.
- Integraciones: `docs/integrations/`.

Si una instrucción de una tarea contradice una decisión arquitectónica aprobada,
detener el trabajo y proponer un ADR antes de implementar.

## Protocolo obligatorio para ejecutar tareas

1. Identificar el ID de tarea, por ejemplo `P2-T03`.
2. Verificar que todas sus dependencias estén marcadas con `[x]`.
3. Leer la tarea completa, incluidos criterios, pruebas y exclusiones.
4. Declarar los archivos y módulos que se modificarán.
5. Implementar el cambio mínimo necesario.
6. Ejecutar todas las verificaciones indicadas.
7. Revisar tipos, errores, seguridad, idempotencia y regresiones.
8. Registrar evidencia concreta debajo de `Evidencia de cierre`.
9. Marcar criterios con `[x]` únicamente si la evidencia los demuestra.
10. Marcar la tarea con `[x]` solamente cuando todos sus criterios estén
    completos.
11. Actualizar `docs/STATUS.md`.

Una tarea parcialmente implementada permanece `[ ]` y debe explicar el estado
real en `Notas de progreso`.

## Reglas de estado

- `[ ]` significa pendiente o incompleta.
- `[x]` significa implementada, verificada y documentada.
- `BLOQUEADA` significa que existe una dependencia externa concreta.
- No usar porcentajes subjetivos.
- No marcar una fase completa si una tarea hija sigue pendiente.
- No borrar criterios incumplidos para poder cerrar una tarea.
- Si cambia el alcance, actualizar primero la documentación de la fase.

## Reglas técnicas

- TypeScript estricto.
- Nunca usar `any`; usar tipos precisos, `unknown` y validadores de borde.
- Backend organizado por módulos de negocio, no por carpetas técnicas globales.
- Controladores delgados; reglas en servicios o casos de uso.
- Acceso a datos detrás de repositorios o puertos.
- Integraciones externas detrás de interfaces inyectables.
- Toda entrada externa se valida.
- Toda acción externa es idempotente y auditable.
- La base de datos es la fuente de verdad de estados y programación.
- Redis/BullMQ transporta trabajos; no es la única fuente de verdad.
- Nunca registrar secretos, tokens, fotos privadas ni datos personales
  innecesarios.
- Ningún modelo de IA ejecuta SQL arbitrario.
- Precio y stock siempre provienen de fuentes estructuradas verificables.
- El motor generativo produce recursos visuales; logo, texto, precio y CTA se
  componen de forma determinística.

## Frontend

- Crear variantes explícitas de flujo:
  `TemplatePublicationComposer`, `AICreativeComposer`,
  `RecurringStoryComposer` y `ProductPromotionComposer`.
- No acumular booleanos de modo en un componente monolítico.
- El estado compartido se expone mediante una interfaz `state/actions/meta`.
- La UI debe mostrar carga, vacío, éxito, error y publicación parcial.
- Todas las acciones de aprobación y publicación deben ser accesibles por
  teclado y tener confirmación clara.

## Backend

- Empezar como monolito modular NestJS con worker separado.
- Módulos previstos: identidad, organizaciones, conocimiento, catálogo,
  contenido, medios, generación, render, conexiones, publicación,
  programación y auditoría.
- Usar colas para IA, render y publicación.
- Usar transacciones para cambios de estado que deban ser atómicos.
- Usar migraciones; nunca sincronización destructiva de esquema en producción.
- Implementar cierre ordenado de API y workers.

## Acciones externas

- En desarrollo, usar dobles de prueba por defecto.
- OpenAI real requiere presupuesto y credencial de entorno autorizados.
- Meta real requiere activo de prueba o aprobación explícita del responsable.
- Producción requiere una política de automatización activa.
- Un reintento jamás debe repetir un destino que ya se publicó.

## Definition of Done general

Una tarea de código solo está terminada si:

- cumple todos sus criterios de aceptación;
- tiene pruebas proporcionales al riesgo;
- pasa formato, lint, tipos y pruebas afectadas;
- maneja explícitamente fallas esperables;
- no expone secretos ni amplía permisos;
- actualiza documentación y evidencia;
- no introduce una segunda arquitectura para el mismo problema.
