# ADR-017: puerta factual determinista y revisión visual humana

- Estado: propuesto; pendiente de acordar muestra y umbrales con el negocio
- Fecha: 2026-08-07
- Tarea: `P4-T08`

## Contexto

La salida de Images combina una base probabilística con una capa comercial
determinista. Un único puntaje estético podría ocultar un precio incorrecto, y
un juez multimodal tampoco ofrece una garantía suficiente para autorizar datos
comerciales o publicación. A la vez, contraste, legibilidad, fidelidad del
producto y coherencia de marca no se resuelven sólo comparando strings.

La promoción de prompt, perfil o modelo necesita una línea base reproducible,
pero una imagen no puede autoaprobarse sólo porque mantuvo un hash técnico.

## Decisión

La puerta tiene dos capas independientes:

1. `packages/domain/src/image-quality-evaluation.ts` aplica verificaciones
   binarias de producto, precio, stock, CTA, disclaimer y baseline técnica.
   Cualquier diferencia bloquea el caso.
2. Una muestra ciega de resultados reales se revisa con seis criterios de 1 a
   5. Requiere responsable comercial y responsable visual, cero hallazgos
   críticos y los umbrales versionados del dominio.

El dataset sintético cubre seis perfiles por tres formatos. La baseline guarda
los hashes de la capa determinista y queda ligada a versiones de dataset,
prompt, perfil, modelo y composición. El hash no incorpora los bytes PNG del
fondo sintético: libvips puede codificarlos distinto entre sistemas operativos
sin que cambien el copy, layout o tema que se busca proteger. Cualquier cambio
real invalida la aprobación humana y obliga a repetir la evaluación; el arnés no
llama a OpenAI durante CI.

Los graders multimodales de OpenAI se consideran una señal auxiliar posible,
no un reemplazo del veto factual ni de la revisión humana.

## Consecuencias

- Una pieza visualmente excelente no compensa un dato o producto incorrecto.
- Una corrida automática en verde sigue bloqueada mientras la revisión humana
  esté pendiente, rechazada o incompleta.
- Los resultados reales se generan sólo en staging y con presupuesto explícito;
  los commits ejecutan únicamente la preevaluación local.
- La clave ciega se mantiene separada de las imágenes hasta terminar la
  puntuación.
- Meta no puede habilitarse mientras `P4-T08` permanezca abierta.
