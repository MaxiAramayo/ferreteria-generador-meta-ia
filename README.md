# Aramayo Content Platform

Plataforma interna para crear, revisar, programar y publicar contenido de
Ferretería y Lubricentro Aramayo.

El repositorio está en etapa de planificación y estructura inicial. La fuente de
verdad del trabajo es [`docs/STATUS.md`](docs/STATUS.md); el detalle ejecutable de
cada fase vive en [`docs/phases/`](docs/phases/).

## Objetivo del primer producto

Permitir que una persona autorizada:

1. describa una pieza en lenguaje natural y adjunte fotos;
2. consulte conocimiento aprobado de Aramayo y datos vigentes del sistema
   comercial;
3. genere una composición fiel a la marca;
4. revise y apruebe el contenido;
5. publique ahora o programe Instagram y Facebook;
6. audite el resultado y recupere fallas sin duplicar publicaciones.

## Estado actual

- Repositorio y documentación: base inicial completa (`P0-T01`).
- Aplicaciones ejecutables: pendientes de `P0-T05`.
- Motor visual actual: pendiente de migración en Fase 1.
- Credenciales externas: no configuradas.
- Publicaciones externas: deshabilitadas.

## Estructura

```text
apps/
  web/                 Panel de operación
  api/                 Backend modular
  worker/              Generación, render y publicación
packages/
  contracts/           Contratos compartidos
  domain/              Reglas de negocio puras
  design-engine/       Motor visual a migrar
  brand-knowledge/     Conocimiento aprobado
infrastructure/
  database/            Esquema y migraciones
docs/
  architecture/        Arquitectura y decisiones
  integrations/        OpenAI, Meta y datos
  operations/          Seguridad, pruebas y operación
  phases/              Tareas y criterios de aceptación
```

## Cómo trabajar

1. Leer `AGENTS.md`.
2. Leer `docs/STATUS.md`.
3. Abrir la fase activa y elegir una tarea sin dependencias pendientes.
4. Implementar solamente esa tarea.
5. Ejecutar todas sus verificaciones.
6. Adjuntar evidencia y recién entonces marcarla como completada.

No se debe conectar una cuenta real de Meta ni usar credenciales de producción
antes de completar las puertas de seguridad indicadas en el plan.
