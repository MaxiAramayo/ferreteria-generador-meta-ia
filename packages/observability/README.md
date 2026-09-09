# Observability

Correlación de extremo a extremo y logs operativos estructurados, compartidos
por `apps/api` y `apps/worker`.

El paquete no depende de NestJS, Next.js, la base ni el paquete de
configuración: sólo del contrato público que nombra los procesos.

- `runWithCorrelation` abre el alcance de una intención y
  `currentCorrelation` lo recupera desde cualquier capa, sin pasarlo como
  argumento por toda la pila.
- Un identificador entrante se acepta únicamente con su forma exacta —32
  hexadecimales—; cualquier otra cosa produce uno nuevo. Aceptar texto libre de
  un cliente permitiría inyectar contenido en los logs y en la base.
- `createLogEmitter` escribe una línea JSON por evento con proceso, evento,
  correlación, resultado y duración.
- Todo detalle variable pasa por `redactDetail`, que tapa secretos por nombre
  de campo y por forma del valor, recorta textos largos y descarta estructuras
  anidadas.
