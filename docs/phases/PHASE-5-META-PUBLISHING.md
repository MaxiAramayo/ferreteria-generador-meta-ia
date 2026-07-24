# Fase 5 — Publicación mediante Meta

## Resultado de la fase

Una persona autorizada puede conectar activos de Meta, aprobar una pieza y
publicarla en Instagram y/o Facebook de manera idempotente, auditable y
recuperable ante fallos parciales.

## Invariantes

- Solo snapshots aprobados pueden publicarse.
- Una credencial nunca llega al navegador ni a logs.
- Cada destino conserva estado y resultado independiente.
- Se fija y prueba una versión de Graph API.
- No se promete un flujo que el tipo de cuenta o permiso no soporte.

## P5-T01 — Inventariar activos, capacidades y requisitos de Meta

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P0-T07`, `P4-T08`
- Riesgo: Alto

### Objetivo

Confirmar cuentas, páginas, portfolio empresarial, roles, tipos de Instagram y
capacidades reales antes de diseñar OAuth o solicitar permisos.

### Entregables

- Inventario anonimizado de activos y propietarios.
- Matriz destino × formato × capacidad × permiso.
- Versión fijada de Graph API y plan de actualización.

### Criterios de aceptación

- [ ] Página de Facebook e Instagram profesional están vinculados cuando se requiere.
- [ ] Se identifica quién puede administrar la app y completar verificaciones.
- [ ] Feed, stories y formatos inicialmente soportados están confirmados con documentación oficial.
- [ ] Permisos mínimos se listan con justificación por caso de uso.
- [ ] Limitaciones de cuentas, media, URLs y rate limits se documentan.
- [ ] Los activos de prueba están separados de producción.

### Verificación obligatoria

- [ ] Revisar configuración real sin copiar tokens a documentación.
- [ ] Ejecutar consulta read-only de activos con herramienta oficial o API.
- [ ] Obtener aprobación del alcance inicial.

### Fuera de alcance

- Solicitar App Review.
- Publicar contenido.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T02 — Implementar OAuth y almacenamiento de conexiones

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T02`, `P5-T01`
- Riesgo: Alto

### Objetivo

Conectar una cuenta de Meta mediante OAuth, descubrir activos autorizados y
almacenar tokens cifrados con ciclo de vida administrado.

### Entregables

- Inicio/callback OAuth con state y PKCE cuando aplique.
- Entidades de conexión y activo.
- Servicio de cifrado, renovación, revocación y health.

### Criterios de aceptación

- [ ] `state`, redirect URI y sesión se validan en callback.
- [ ] Solo un administrador puede crear o revocar conexiones.
- [ ] Tokens se cifran en reposo y se descifran únicamente en backend/worker.
- [ ] La UI muestra cuenta, activos, permisos y salud sin mostrar token.
- [ ] Expiración, permiso revocado y activo removido tienen estados distintos.
- [ ] Revocar elimina capacidad de publicar y conserva auditoría.

### Verificación obligatoria

- [ ] Flujo OAuth completo en staging.
- [ ] Pruebas de state inválido, callback repetido y usuario sin permisos.
- [ ] Inspeccionar BD y logs para confirmar cifrado y redacción.

### Fuera de alcance

- Publicar una pieza.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T03 — Implementar adaptador de publicación en Instagram

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T02`
- Riesgo: Alto

### Objetivo

Crear contenedores de media, consultar procesamiento y publicar formatos
inicialmente aprobados en Instagram.

### Entregables

- Puerto y adaptador de Instagram.
- Estado de contenedor y resultado normalizado.
- Validación previa por formato.

### Criterios de aceptación

- [ ] Solo usa URLs HTTPS públicas y activos aprobados.
- [ ] Valida dimensiones, tipo y límites antes de llamar a Meta.
- [ ] Se espera el estado procesable antes de publicar.
- [ ] IDs de contenedor y publicación se guardan por intento.
- [ ] Rate limit, token, media inválida y error de procesamiento se distinguen.
- [ ] Repetir el comando no crea una segunda publicación si ya hay éxito confirmado.

### Verificación obligatoria

- [ ] Publicación real en cuenta de prueba.
- [ ] Casos de URL inaccesible, media inválida y procesamiento fallido.
- [ ] Reintento después de timeout con reconciliación por estado.

### Fuera de alcance

- Facebook y programación.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T04 — Implementar adaptador de publicación en Facebook

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T02`
- Riesgo: Alto

### Objetivo

Publicar piezas y copy en la página de Facebook manteniendo un contrato de
resultado coherente con Instagram.

### Entregables

- Puerto y adaptador de Facebook Pages.
- Validación de media/copy.
- Resultado con ID y permalink cuando esté disponible.

### Criterios de aceptación

- [ ] El destino debe pertenecer a la conexión y organización.
- [ ] Copy y media se validan antes de la llamada.
- [ ] ID remoto y respuesta segura quedan persistidos.
- [ ] Fallos se normalizan sin perder código útil de Meta.
- [ ] Reintentos usan idempotencia y reconciliación.
- [ ] Un fallo de Facebook no muta el resultado de Instagram.

### Verificación obligatoria

- [ ] Publicación real en página de prueba.
- [ ] Pruebas de permiso revocado, media inválida y timeout.
- [ ] Verificar correlación entre intento local y publicación remota.

### Fuera de alcance

- Ads Manager o promoción paga.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T05 — Orquestar publicación multidestino

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P2-T06`, `P5-T03`, `P5-T04`
- Riesgo: Alto

### Objetivo

Convertir una orden aprobada en intentos independientes por destino y calcular un
estado agregado sin ocultar fallos parciales.

### Entregables

- Caso de uso y worker de publicación.
- Modelo de orden, destino e intento.
- Máquina de estados `publishing`, `published`, `partially_published`, `publish_failed`.

### Criterios de aceptación

- [ ] La orden referencia un snapshot aprobado e inmutable.
- [ ] Cada destino tiene clave idempotente y estado propio.
- [ ] El agregado es `published` solo si todos los destinos requeridos tuvieron éxito.
- [ ] Un fallo parcial muestra qué destino falló y cuál se publicó.
- [ ] Cancelar antes del inicio evita nuevos intentos; no borra éxitos previos.
- [ ] Acciones y respuestas remotas quedan auditadas sin tokens.

### Verificación obligatoria

- [ ] E2E con éxito total, fallo total y fallo parcial.
- [ ] Requests duplicados y workers concurrentes.
- [ ] Confirmar que un snapshot no aprobado se rechaza.

### Fuera de alcance

- Reintento automático programado por horario.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T06 — Implementar reintentos y reconciliación remota

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T05`
- Riesgo: Alto

### Objetivo

Resolver respuestas ambiguas, caídas y divergencias local/remota sin duplicar
publicaciones ni declarar éxito sin evidencia.

### Entregables

- Política de retry por categoría.
- Jobs de reconciliación.
- Acciones manuales seguras.

### Criterios de aceptación

- [ ] Errores permanentes no se reintentan automáticamente.
- [ ] Timeout después de enviar consulta estado antes de volver a publicar.
- [ ] Backoff y jitter respetan límites de Meta.
- [ ] Agotar intentos genera alerta y acción manual clara.
- [ ] Reconciliación actualiza evidencia, no sobreescribe historial.
- [ ] Reintentar un solo destino no toca destinos exitosos.

### Verificación obligatoria

- [ ] Simular timeout antes y después de aceptación remota.
- [ ] Simular rate limit y token expirado.
- [ ] Ejecutar reconciliación sobre estados inconsistentes conocidos.

### Fuera de alcance

- Borrar publicaciones remotas automáticamente.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T07 — Construir UI de conexiones, aprobación y publicación

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T02`, `P5-T05`
- Riesgo: Medio

### Objetivo

Hacer visibles permisos, destinos, snapshot, riesgos y resultado antes y después
de una acción externa irreversible.

### Entregables

- Pantalla de conexiones.
- Confirmación de publicación.
- Historial e inspección por destino.

### Criterios de aceptación

- [ ] La confirmación muestra preview, cuenta, destino y copy exactos.
- [ ] No existe publicación con un clic accidental desde el editor.
- [ ] La UI impide publicar si falta aprobación o conexión sana.
- [ ] Estado parcial diferencia claramente éxito y error.
- [ ] Acciones de retry requieren rol y contexto correctos.
- [ ] Todos los controles tienen estados de carga y evitan doble envío.

### Verificación obligatoria

- [ ] E2E por rol y estado.
- [ ] Auditoría de accesibilidad.
- [ ] Prueba manual de doble clic, navegación atrás y refresh durante publicación.

### Fuera de alcance

- Calendario de contenido.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T08 — Preparar requisitos legales y App Review

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T07`
- Riesgo: Alto

### Objetivo

Completar materiales, políticas y demostraciones requeridas para operar la
integración con usuarios y activos reales.

### Entregables

- Política de privacidad, términos y eliminación de datos.
- Screencast y pasos de revisión.
- Justificación de permisos y usuario de prueba.

### Criterios de aceptación

- [ ] Las URLs legales son públicas, estables y corresponden al sistema.
- [ ] Cada permiso solicitado aparece en un flujo visible del screencast.
- [ ] El revisor puede acceder sin conocer datos internos reales.
- [ ] Eliminación y revocación tienen procedimiento probado.
- [ ] Marca, nombre y dominios de la app son consistentes.
- [ ] Solo se solicitan permisos usados por el alcance inicial.

### Verificación obligatoria

- [ ] Recorrer el guion completo como usuario de revisión.
- [ ] Probar eliminación/revocación y conservar evidencia.
- [ ] Revisión legal/administrativa antes de enviar.

### Fuera de alcance

- Garantizar aprobación de Meta.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## P5-T09 — Validar publicación real de punta a punta

- [ ] Tarea completada
- Estado: PENDIENTE
- Dependencias: `P5-T06`, `P5-T07`, `P5-T08`
- Riesgo: Alto

### Objetivo

Demostrar en staging que una pieza generada y aprobada llega una sola vez a cada
destino previsto y que el sistema conserva evidencia completa.

### Entregables

- Escenario E2E real.
- IDs/permalinks de prueba.
- Informe de fallos, latencia y reconciliación.

### Criterios de aceptación

- [ ] La pieza proviene de un brief y snapshot aprobados.
- [ ] Se publica una vez en Instagram y Facebook de prueba.
- [ ] El copy y bitmap remotos coinciden con la confirmación.
- [ ] IDs remotos son consultables desde el historial.
- [ ] Repetir la orden no duplica contenido.
- [ ] Un fallo inducido puede reconciliarse sin alterar el destino exitoso.

### Verificación obligatoria

- [ ] Ejecutar y grabar el flujo completo.
- [ ] Verificar manualmente publicaciones remotas.
- [ ] Auditar logs, DB y almacenamiento sin secretos.

### Fuera de alcance

- Publicación automática por horario.
- Promoción paga.

### Notas de progreso

- Sin notas.

### Evidencia de cierre

- Pendiente.

## Criterios de salida de Fase 5

- [ ] `P5-T01` a `P5-T09` están completas.
- [ ] OAuth, cifrado, revocación y permisos están probados.
- [ ] Instagram y Facebook publican desde snapshots aprobados.
- [ ] Duplicados y fallos parciales están controlados.
- [ ] La revisión legal/App Review está aprobada o existe bloqueo externo documentado.
