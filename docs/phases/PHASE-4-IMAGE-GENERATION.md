# Fase 4 — Generación personalizada de imágenes

## Resultado de la fase

Un brief aprobado puede producir variantes visuales personalizadas mediante
OpenAI, combinarlas con el sistema determinista de marca, revisarlas y aprobar
una pieza reproducible, segura y trazable.

## Invariantes

- La generación no publica ni aprueba automáticamente.
- Texto crítico, precio, CTA y logo se componen de forma determinista.
- Los prompts derivan de briefs validados y perfiles versionados.
- Toda ejecución conserva modelo, entradas, costo, estado y activos.
- Referencias de personas o marcas de terceros requieren autorización.

## P4-T01 — Definir perfiles visuales y política de prompts

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T06`, `P3-T07`
- Riesgo: Alto

### Objetivo

Traducir el lenguaje visual de Aramayo a perfiles versionados que controlen
composición, fotografía, iluminación, textura, restricciones y negative guidance.

### Entregables

- Perfiles por campaña y tipo de producto.
- Constructor tipado de prompt.
- Política de activos permitidos y prohibidos.

### Criterios de aceptación

- [ ] Cada perfil indica formato, intención, estilo, foco y espacio reservado.
- [ ] El prompt no delega a la imagen generada el texto comercial crítico.
- [ ] Logo e identidad se agregan mediante activos aprobados.
- [ ] Variables del usuario se escapan y validan como datos, no instrucciones.
- [ ] Perfil y versión quedan ligados a la ejecución.
- [ ] Existe fallback a render completamente determinista.

### Verificación obligatoria

- [ ] Snapshots de prompts para briefs representativos.
- [ ] Pruebas de prompt injection dentro de campos de producto.
- [ ] Revisión visual y comercial de cada perfil inicial.

### Fuera de alcance

- Llamar a la API de imágenes.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P4-T02 — Validar y preparar entradas visuales

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T07`, `P4-T01`
- Riesgo: Alto

### Objetivo

Normalizar fotos de producto y referencias autorizadas antes de enviarlas a un
proveedor o componerlas.

### Entregables

- Pipeline de validación y transformación.
- Extracción de metadatos y eliminación de EXIF sensible.
- Reglas de resolución, proporción, fondo y cantidad.

### Criterios de aceptación

- [ ] Se valida contenido, MIME, dimensiones, tamaño y decodificación.
- [ ] Se remueven metadatos de ubicación y cámara no necesarios.
- [ ] La imagen original se conserva según política, separada de derivados.
- [ ] Activos de otra organización o no aprobados se rechazan.
- [ ] Se informa qué entrada falló y cómo corregirla.
- [ ] Transformaciones son deterministas y conservan referencia al original.

### Verificación obligatoria

- [ ] Casos de archivo válido, corrupto, enorme, EXIF y MIME engañoso.
- [ ] Comparar dimensiones y hashes de derivados repetidos.
- [ ] Inspeccionar metadatos del archivo preparado.

### Fuera de alcance

- Moderación del resultado generado.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P4-T03 — Implementar adaptador de OpenAI Images

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T02`, `P4-T02`
- Riesgo: Alto

### Objetivo

Encapsular generación y edición de imágenes con GPT Image detrás de un puerto
estable, separado del gateway de texto.

### Entregables

- Puerto de generación/edición.
- Adaptador OpenAI Images.
- Mapeo de calidad, tamaño, fondo, errores y resultados.

### Criterios de aceptación

- [ ] El dominio no importa el SDK.
- [ ] Generación nueva y edición con referencias tienen contratos distintos.
- [ ] Parámetros no soportados fallan antes de la llamada.
- [ ] Se distinguen rechazo de seguridad, rate limit, timeout y contenido inválido.
- [ ] Respuestas se almacenan de inmediato con hash y metadatos.
- [ ] No se registran binarios ni URLs temporales sensibles en logs.

### Verificación obligatoria

- [ ] Tests de contrato con adaptador falso.
- [ ] Smoke test real de generación y edición en staging.
- [ ] Simular timeout y respuesta incompleta.

### Fuera de alcance

- Decidir automáticamente cuál variante aprobar.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P4-T04 — Orquestar ejecuciones asíncronas de generación

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T06`, `P4-T03`
- Riesgo: Alto

### Objetivo

Procesar variantes fuera del request web, con estados persistentes, límites de
concurrencia, cancelación e idempotencia.

### Entregables

- Modelo `GenerationRun` y jobs de worker.
- Estados y progreso consultables.
- Política de retry y cancelación.

### Criterios de aceptación

- [ ] La API encola y responde sin esperar la imagen.
- [ ] PostgreSQL conserva el estado canónico de la ejecución.
- [ ] Redis/BullMQ transporta trabajos sin ser fuente de verdad.
- [ ] La misma clave idempotente no factura dos lotes involuntariamente.
- [ ] Cancelar impide promover resultados tardíos, aunque no pueda detener al proveedor.
- [ ] Fallos parciales conservan variantes válidas y explican las fallidas.

### Verificación obligatoria

- [ ] Reiniciar worker y Redis durante un lote.
- [ ] Enviar requests duplicados concurrentes.
- [ ] Probar cancelación antes, durante y después de la respuesta externa.

### Fuera de alcance

- Programación horaria.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P4-T05 — Componer la salida con la capa de marca

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P1-T05`, `P4-T04`
- Riesgo: Alto

### Objetivo

Usar el resultado de IA como fondo o producto visual y aplicar encima texto,
precio, CTA, disclaimers y logo con el motor determinista.

### Entregables

- Layouts híbridos.
- Reglas de contraste, safe zone y recorte.
- Snapshot combinado reproducible.

### Criterios de aceptación

- [ ] El texto comercial no depende de píxeles generados por el modelo.
- [ ] Logo, precio y CTA provienen del brief aprobado.
- [ ] Contraste y legibilidad cumplen umbrales definidos.
- [ ] Recortes no ocultan el producto ni invaden safe zones.
- [ ] El snapshot registra hashes de base generada y overlays.
- [ ] Re-renderizar la misma composición produce resultado equivalente.

### Verificación obligatoria

- [ ] Suite visual en todos los formatos iniciales.
- [ ] Casos de fondos claros, oscuros, recargados y producto fuera de centro.
- [ ] Comparar salida con snapshot aprobado.

### Fuera de alcance

- Publicar o programar.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P4-T06 — Implementar variantes y edición conversacional

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P3-T09`, `P4-T05`
- Riesgo: Medio

### Objetivo

Permitir pedir cambios controlados, comparar variantes y conservar genealogía sin
sobrescribir el material previamente generado.

### Entregables

- UI de variantes.
- Edición por instrucción y controles explícitos.
- Relación padre–hijo entre ejecuciones y activos.

### Criterios de aceptación

- [ ] Cada edición crea una ejecución nueva.
- [ ] El usuario distingue cambio visual de cambio factual del brief.
- [ ] Modificar precio, producto o promoción exige revalidar evidencia.
- [ ] Se pueden comparar prompt, perfil, costo y resultado.
- [ ] Seleccionar una variante no borra las demás.
- [ ] Acciones no disponibles no se exponen en variantes fallidas.

### Verificación obligatoria

- [ ] E2E generar–editar–comparar–seleccionar.
- [ ] Prueba de cambio factual que obliga a revalidar.
- [ ] Confirmar historial y auditoría completos.

### Fuera de alcance

- Aprendizaje automático desde elecciones del usuario.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P4-T07 — Aplicar seguridad, cuotas y control de costos

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P4-T04`
- Riesgo: Alto

### Objetivo

Evitar abuso, gasto inesperado, entradas prohibidas y resultados que no puedan
mostrarse con seguridad.

### Entregables

- Cuotas por organización y usuario.
- Presupuestos, alertas y corte.
- Moderación y política de retención.

### Criterios de aceptación

- [ ] Se estima y muestra costo antes de generar cuando sea posible.
- [ ] Límites diarios y mensuales se aplican en servidor.
- [ ] Una carrera concurrente no excede silenciosamente el presupuesto.
- [ ] Solicitudes o resultados bloqueados conservan motivo seguro y auditable.
- [ ] No se persisten más datos de referencia de los necesarios.
- [ ] Un administrador puede desactivar generación sin detener el resto del sistema.

### Verificación obligatoria

- [ ] Tests de cuota al límite y concurrencia.
- [ ] Simular alerta y corte de presupuesto.
- [ ] Revisar escenarios de contenido prohibido y privacidad.

### Fuera de alcance

- Facturación a clientes.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P4-T08 — Aprobar calidad visual y factual

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P4-T06`, `P4-T07`
- Riesgo: Alto

### Objetivo

Definir y superar una evaluación que combine estética, marca, fidelidad factual,
legibilidad y seguridad antes de habilitar la integración Meta.

### Entregables

- Dataset de briefs y referencias.
- Rúbrica de revisión.
- Baseline por perfil y formato.

### Criterios de aceptación

- [ ] La rúbrica separa calidad estética de exactitud comercial.
- [ ] Precio, stock, producto, CTA y disclaimers se comparan con snapshot.
- [ ] Se incluyen herramientas, lubricantes, ofertas y mensajes institucionales.
- [ ] Ningún resultado crítico puede autoaprobarse.
- [ ] Umbrales y responsables de aprobación están definidos.
- [ ] Regresiones bloquean cambios de prompt, perfil o modelo.

### Verificación obligatoria

- [ ] Ejecutar evaluación completa y guardar resultados.
- [ ] Revisión humana ciega de una muestra acordada.
- [ ] Introducir una pieza con error factual y confirmar rechazo.

### Fuera de alcance

- Métricas de rendimiento de publicaciones reales.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 4

- [ ] `P4-T01` a `P4-T08` están completas.
- [ ] Un brief produce, edita y aprueba variantes trazables.
- [ ] Texto crítico y marca se componen determinísticamente.
- [ ] Costos, cuotas y fallos externos están controlados.
- [ ] Evaluaciones visuales y factuales superan umbrales aprobados.
