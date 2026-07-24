# ADR-002: monolito modular con worker separado

- Estado: aceptado
- Fecha: 2026-07-23

## Decisión

Implementar un backend NestJS organizado por módulos de negocio y un worker
desplegable por separado.

## Motivos

- Reduce complejidad operativa frente a microservicios.
- Conserva límites claros de dominio.
- Permite escalar render y publicación sin duplicar el backend.
- Facilita transacciones y auditoría centralizadas.

## Restricción

La separación en procesos no autoriza dependencias directas entre módulos ni una
base de datos por servicio en la primera versión.
