# ADR-034: sacar una pieza en un gesto, sin trámite de revisión

- Estado: aceptado
- Fecha: 2026-09-28
- Tareas: `P2-T11`
- Relacionadas: [`ADR-031`](ADR-031-PRODUCT-STORY-OWN-PHOTO.md),
  [`ADR-032`](ADR-032-DELETE-UNAPPROVED-PUBLICATIONS.md),
  [`ADR-033`](ADR-033-PRODUCT-PHOTO-FRAMES.md)

## Contexto

El dueño opera el sistema solo y publica productos casi todos los días, sobre
todo historias que duran un día. Pidió que subir una pieza sea «lo más intuitivo
y rápido posible», «sin importar tanto las revisiones», porque son piezas
temporales que se pueden borrar.

El camino que había, después de guardar, era: esperar el PNG, abrirlo, elegir
día y hora en un calendario mensual con un horario fijo de la mañana, aprobar y
programar, y para publicar en el momento, otra pantalla de confirmación. Además
pedía un texto obligatorio que una historia de Instagram no publica.

`AGENTS.md` fija que guardar, generar, aprobar, programar y publicar son
acciones distintas y que ninguna dispara otra de forma oculta, y que antes de
publicar hay que mostrar pieza, copy, destino y horario.

## Decisión

1. Después de guardar se abre la hoja «¿Cuándo sale?», que muestra que la
   imagen se está preparando y, cuando está, la imagen final, el texto, a dónde
   sale y con qué cuenta.
2. Un toque la saca: **«Publicar ahora»** aprueba y pide la orden de
   publicación; **«Programar para…»** aprueba con el turno. El botón nombra lo
   que hace y debajo dice «Al publicar queda aprobada». No hay acción oculta: es
   un gesto explícito que encadena los mismos comandos de siempre, en orden.
3. Nada sale sin que la persona haya visto lo que sale: la hoja no habilita el
   botón hasta que la imagen confirmada está a la vista, y muestra destino y
   cuenta antes del toque. Es la misma regla que `ADR-031` y el «Aprobar y
   programar» de la aprobación ya aplicaban.
4. Cada paso conserva su idempotencia: las claves se generan al abrir la hoja,
   así un doble toque no aprueba dos veces ni crea dos órdenes. Si la
   publicación se rechaza después de aprobar, la pieza queda aprobada, la hoja
   lo dice y se reintenta desde la pieza con «Publicar…».
5. El destino sale del formato: una historia va a historias de Instagram; un
   post, al feed, y opcionalmente a Facebook, que exige texto.
6. «Más tarde» usa los selectores de fecha y hora del teléfono y propone la
   próxima media hora, no un horario fijo que casi siempre ya pasó.
7. El texto de la publicación es opcional. En una historia ni se pide.
8. Editar una pieza de producto ya en revisión la devuelve a borrador con un
   comando explícito y guarda una revisión nueva; el historial de revisiones no
   se muestra, pero se conserva.

## Consecuencias

- Del compositor a la pieza publicada hay dos toques: «Continuar» y «Publicar
  ahora».
- La aprobación sigue existiendo con su snapshot, su auditoría y su validación
  previa; lo que desaparece es la pantalla aparte para hacerla.
- Una persona con permiso de aprobar pero no de publicar ve la hoja con
  «Programar»; sin permiso de aprobar, sólo ve la imagen.
- Una pieza aprobada, programada o publicada sigue sin poder eliminarse
  (`ADR-032`): es evidencia de lo que salió. Lo que ya salió se muestra plegado
  al final del listado.

## Alternativas descartadas

- **Publicar desde el compositor, sin ver el PNG**: la vista previa del
  compositor es la misma composición, pero el snapshot aprobado exige el render
  confirmado, y aprobar sin haberlo visto rompe la regla de mostrar lo que sale.
- **Aprobar solo al guardar**: sería una aprobación oculta, disparada por otra
  acción.
- **Quitar la aprobación del dominio**: el snapshot es lo que permite
  revalidar precio y horario antes de salir y reconstruir lo que se publicó.
