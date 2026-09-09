# ADR-028: la correlación viaja por contexto y se estampa en el borde de persistencia

- Estado: aceptado
- Fecha: 2026-09-09
- Tarea: `P7-T03`

## Contexto

Una intención del negocio atraviesa dos procesos y varias capas: la API valida
y persiste, el outbox transporta, el worker ejecuta y recién ahí aparece el
proveedor externo. Cuando algo sale mal, la pregunta operativa es siempre la
misma —qué solicitud produjo este trabajo— y hasta ahora no había forma de
responderla: los logs eran frases con `clave=valor`, cada proceso escribía la
suya y nada ataba una con otra.

Pasar un identificador por argumento parece lo obvio y no lo es: hay más de
treinta lugares que escriben auditoría, casi todos dentro de transacciones
propias de un repositorio. Alcanza con que uno quede sin él para que la cadena
se corte justo en el caso que se quería investigar, y nada avisa cuando pasa.

Un identificador que llega del cliente tampoco es inocente: si se acepta tal
cual, cualquiera puede escribir texto arbitrario en los logs y en la base.

## Decisión

1. La intención se identifica con **32 hexadecimales**. Un identificador
   entrante se acepta **sólo** con esa forma exacta; cualquier otra cosa produce
   uno nuevo. La respuesta HTTP devuelve el que se usó.
2. La correlación vive en un **`AsyncLocalStorage`** del paquete
   `@aramayo/observability`. Ningún repositorio, adaptador ni caso de uso la
   recibe por argumento. El alcance se abre en el borde HTTP —antes de los
   guards, para que un 401 o un 403 también queden observados— y se completa con
   organización y actor recién cuando la sesión se resuelve.
3. La correlación se **estampa en el borde de persistencia**, no en cada
   llamada: una extensión del cliente Prisma la agrega a `audit_events` y
   `outbox_messages`, también dentro de transacciones. Un valor explícito en la
   llamada gana, así un reproceso puede conservar la correlación original.
4. El **worker reabre el alcance** con la correlación que trae el mensaje
   outbox. Un mensaje sin correlación recibe una nueva: heredar la del trabajo
   anterior mezclaría dos intenciones distintas, que es peor que no tener
   ninguna.
5. Toda línea de log es un **objeto JSON** con campos fijos —`ts`, `level`,
   `process`, `event`, `correlationId`, `outcome`, `durationMs`— incluidas las
   del framework. El detalle variable pasa siempre por redacción: se tapa por
   nombre de campo y por forma del valor, se recortan los textos largos y se
   descarta cualquier estructura anidada.
6. La columna es **opcional en la base y con `CHECK` de forma**. Opcional porque
   las filas anteriores y los barridos internos no pueden inventar una
   correlación; con `CHECK` porque una correlación con texto libre volvería
   inútil el índice y guardaría contenido del cliente.

## Consecuencias

- Una investigación empieza por el identificador que la API devolvió y llega
  hasta el trabajo que lo ejecutó, sin depender de horarios ni de adivinar.
- Agregar un repositorio nuevo no obliga a acordarse de la correlación: si
  escribe auditoría u outbox, ya la lleva.
- El log dejó de ser texto: el smoke lo verifica como registros y comprueba
  campo por campo, en lugar de comparar frases.
- El tipo del cliente Prisma extendido no es el mismo que el del cliente base.
  `DatabaseTransactionClient` reemplaza a `Prisma.TransactionClient` en los
  repositorios que reciben una transacción.

## Alternativas descartadas

- **Pasar la correlación por argumento**: treinta y dos lugares donde olvidarla
  y ninguna señal cuando ocurre.
- **Guardarla dentro del `payload` del outbox**: mezcla metadato de transporte
  con contenido de negocio y no se puede indexar.
- **Aceptar el encabezado del cliente sin validar**: permite inyectar texto
  arbitrario en logs y base.
- **Adoptar un colector de trazas ahora**: agrega un componente que todavía no
  tiene dónde correr y no responde la pregunta operativa que existe hoy.
