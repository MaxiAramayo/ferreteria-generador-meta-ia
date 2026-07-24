# ADR-001: repositorio separado

- Estado: aceptado
- Fecha: 2026-07-23

## Decisión

Crear `aramayo-content-platform` como repositorio separado y migrar el motor
visual mediante un paquete interno.

## Motivos

- El generador actual es una herramienta local basada en Vite, Markdown y
  Playwright.
- El publicador necesita persistencia, autenticación, workers y OAuth.
- El repositorio original contiene contenido y cambios activos.
- Una migración por paridad reduce el riesgo de perder comportamiento visual.

## Consecuencias

- Habrá dos repositorios durante la transición.
- La Fase 1 debe evitar duplicación permanente.
- El generador original no se archiva hasta superar las pruebas de paridad.
