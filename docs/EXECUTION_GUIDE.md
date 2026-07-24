# Guía de ejecución para agentes y desarrolladores

## Objetivo

Permitir que una persona o agente retome el proyecto sin depender de contexto
conversacional previo y avance sin cerrar tareas prematuramente.

## Selección de tarea

Una tarea puede comenzar cuando:

- figura con `[ ]`;
- todas sus dependencias están `[x]`;
- no tiene un bloqueo externo vigente;
- su alcance sigue siendo consistente con los ADR;
- existe capacidad para ejecutar sus verificaciones.

Si varias tareas están habilitadas, priorizar:

1. la que desbloquea más trabajo;
2. la de mayor riesgo técnico;
3. la menor vertical completa;
4. la que reduce incertidumbre externa.

## Inicio de una tarea

Antes de editar:

1. citar el ID y objetivo;
2. enumerar restricciones e invariantes;
3. revisar patrones existentes;
4. listar archivos previstos;
5. confirmar dependencias;
6. describir la verificación;
7. actualizar `Notas de progreso` si el trabajo abarcará más de una sesión.

## Evidencia aceptable

La evidencia debe ser reproducible:

- comando y resultado de tests;
- captura de una prueba visual;
- ID de publicación de una cuenta de prueba;
- migración aplicada y revertida;
- respuesta de contrato anonimizada;
- enlace o ruta a documentación;
- log estructurado sin secretos;
- commit que contiene el resultado.

No son evidencia suficiente:

- “parece funcionar”;
- “código implementado”;
- una captura sin explicar escenario;
- una prueba manual sin pasos;
- un mock cuando el criterio exige integración real.

## Cierre de una tarea

Para cerrar:

1. completar cada criterio con `[x]`;
2. ejecutar cada verificación;
3. realizar revisión de código completa;
4. documentar desviaciones;
5. completar `Evidencia de cierre`;
6. marcar la tarea principal con `[x]`;
7. actualizar `docs/STATUS.md`;
8. actualizar ADR o contratos si cambió una decisión.

Si un criterio no es aplicable, no borrarlo. Registrar la razón y obtener una
decisión explícita en la misma tarea o en un ADR.

## Trabajo parcial

Cuando una sesión termina antes que la tarea:

- dejar la tarea `[ ]`;
- agregar fecha y resumen en `Notas de progreso`;
- indicar archivos cambiados;
- indicar verificaciones ejecutadas y pendientes;
- describir el próximo paso exacto;
- no actualizar la fase como completa.

## Cambios de alcance

Si aparece trabajo no previsto:

- si es necesario para el criterio actual, agregar subtarea y justificar;
- si es una mejora opcional, registrarla como tarea futura;
- si cambia arquitectura, crear ADR;
- si requiere más permisos o una escritura externa nueva, detenerse.

## Revisión obligatoria

Antes de entregar cualquier tarea verificar:

- corrección funcional;
- estados de carga, vacío, error y éxito;
- tipos estrictos;
- validación de entradas;
- autorización;
- idempotencia;
- transacciones;
- manejo de errores externos;
- privacidad y secretos;
- observabilidad;
- accesibilidad;
- regresiones visuales;
- documentación.
