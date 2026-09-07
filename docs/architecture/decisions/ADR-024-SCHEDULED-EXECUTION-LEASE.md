# ADR-024: lease durable e identidad de orden para una ocurrencia programada

- Estado: aceptado
- Fecha: 2026-09-07
- Tarea: `P6-T03`

## Contexto

El dispatcher de `P6-T02` deja una intención durable y un job reconstruible,
pero entregar el job no prueba que exista una orden. Redis puede perderse, un
worker puede terminar después de recibirlo y dos procesos pueden ver la misma
ocurrencia. Además, una llamada a Meta puede haber producido un efecto aunque
su respuesta no haya llegado.

Se necesitan dos identidades distintas: quién está autorizado ahora a
materializar la orden y qué orden/destino representa para siempre esta
ocurrencia. La primera debe vencer; la segunda no puede cambiar con una
reentrega.

## Decisión

1. PostgreSQL conserva una lease por ocurrencia con propietario, token UUID,
   vencimiento y heartbeat. Los cuatro campos existen o faltan juntos.
2. La adquisición bloquea la fila de la ocurrencia. Una lease vigente devuelve
   `busy`; una vencida puede reemplazarse. Completar exige el mismo propietario
   y token, de modo que un worker recuperado tarde no puede atribuirse el
   trabajo del nuevo propietario.
3. `execution_started_at` registra el primer intento de ejecución y no cambia
   al recuperar una lease. `execution_completed_at` se fija al crear o enlazar
   la orden y no afirma que el proveedor remoto terminó.
4. El UUID de la orden es el UUID de la ocurrencia. El identificador existente
   `orden:destino` del diario de publicación pasa a ser también una clave
   estable `ocurrencia:destino`, sin agregar identidad proveniente de Redis.
5. Orden, destinos, transición de publicación, auditoría, outbox y enlace con
   la ocurrencia se escriben en una sola transacción. Una reentrega consulta el
   enlace persistido y devuelve la orden existente.
6. BullMQ es sólo transporte. Si la lease está ocupada, el consumidor mueve el
   mismo job a `delayed` hasta `retryAt` en lugar de agotar reintentos. Los jobs
   completados o fallidos pueden reconstruirse porque PostgreSQL conserva la
   intención.
7. La ejecución remota sigue en el flujo de Fase 5. El estado final de la orden
   se calcula desde los intentos por destino. Un desenlace ambiguo queda
   `unknown`, no vuelve a pendiente y debe reconciliarse antes de publicar de
   nuevo.

## Consecuencias

- Dos workers pueden recibir el mismo payload, pero sólo uno materializa.
- Matar al propietario antes del commit deja una lease recuperable; matarlo
  después del commit deja una orden que la reentrega reconoce.
- La unicidad de la orden y de sus destinos no depende de cuánto conserve Redis.
- La ocurrencia sabe cuándo empezó y cuándo produjo su orden, mientras que la
  orden sigue siendo la única fuente del resultado remoto.
- Pausar o cancelar la regla bloquea la materialización al volver a validar en
  la transacción; no se confía en el estado que llevaba el job.

## Alternativas descartadas

- **Usar solamente el lock de BullMQ**: desaparece con Redis y no protege una
  reentrega reconstruida desde PostgreSQL.
- **Crear una orden con UUID aleatorio en cada intento**: obliga a una búsqueda
  previa vulnerable a carreras y debilita la identidad ocurrencia/destino.
- **Mantener un lock sin vencimiento**: una terminación deja la ocurrencia
  bloqueada hasta intervención manual.
- **Marcar la ocurrencia como publicada al crear la orden**: confunde la
  materialización local con el efecto remoto y duplica el estado que ya deriva
  el agregado de publicación.
- **Reintentar una llamada ambigua a Meta**: puede duplicar una publicación que
  sí salió. El diario y la reconciliación existentes resuelven esa incertidumbre
  antes de habilitar otro intento.
