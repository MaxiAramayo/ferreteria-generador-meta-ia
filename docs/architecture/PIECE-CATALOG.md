# Catálogo de piezas

- Estado: vigente, con decisiones del negocio del 2026-07-27
- Fecha: 2026-07-27
- Decisión que lo habilita: [`ADR-011`](decisions/ADR-011-CURATED-PIECE-CATALOG.md)

Este documento define **qué piezas produce la plataforma y para qué sirve cada
una**. Reemplaza al inventario heredado del generador como fuente de verdad del
catálogo. Una pieza sin objetivo comercial no entra.

## Cómo se decide una pieza

Cada pieza responde tres preguntas antes de existir:

1. **Qué gana quien la ve.** Un precio, una solución a un problema concreto, un
   turno resuelto, una dirección. Nunca "presencia de marca" a secas.
2. **Qué acción habilita.** Consultar por WhatsApp, pedir turno, acercarse al
   local. El CTA nombra una acción real y disponible hoy.
3. **Por qué ese formato.** Feed para lo que se busca y se guarda; historia para
   lo urgente y lo cotidiano; carrusel para comparar o enseñar; destacada para
   ordenar el perfil.

Reglas que ya son invariantes del proyecto y se aplican acá: una idea por pieza,
texto legible en móvil, precio y stock sólo con fuente vigente, y ninguna
afirmación de disponibilidad sin dato que la respalde.

## Pilares de contenido

| Pilar | Qué comunica | Frecuencia sugerida |
|---|---|---|
| Producto con precio | Qué hay y cuánto sale, sin tener que preguntar | 2 por semana |
| Solución de oficio | El problema que resuelve el producto | 1 por semana |
| Servicio de lubricentro | Turnos, cambio de aceite, revisión | 1 por semana |
| Confianza | Locales, atención, medios de pago, reseñas | 1 cada dos semanas |
| Oferta con vigencia | Promoción real, con fecha de fin | según campaña |

## Catálogo vigente

### Feed (1080×1350)

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `producto-destacado` | Mostrar un producto y su categoría | Foto, título, rubro | Consultar stock |
| `producto-precio` | Responder "cuánto sale" sin fricción | Foto, título; precio opcional | Reservar por WhatsApp |
| `promo-producto` | Oferta con precio anterior y vigencia | Foto, título, precio, antes, vigencia | Reservar por WhatsApp |
| `combo-kit` | Vender el conjunto que se compra junto | Hasta 3 productos, precio del combo | Consultar combo |
| `problema-solucion` | Partir del problema del cliente | Problema, solución, producto | Consultar cómo resolverlo |
| `epp-seguridad` | Equipos de protección por rubro | Foto, título, tres puntos | Consultar modelos y talles |
| `producto-mosaico` | Surtido de una categoría | 3 a 6 fotos, título | Consultar disponibilidad |

### Historia (1080×1920)

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `historia-producto` | Producto a pantalla completa | Foto, título | Pedir por WhatsApp |
| `historia-precio-dia` | Precio del día, con urgencia real | Foto, título, precio, vigencia | Reservar hoy |
| `historia-turno-lubricentro` | Pedir turno de servicio | Servicio, horario, teléfono | Pedir turno por WhatsApp o en el local |
| `historia-tip` | Tip corto de oficio o mantenimiento | Título, tip, icono | Guardar el tip |
| `historia-locales` | Dónde estamos y hasta qué hora | Direcciones, horario | Cómo llegar |

### Cuadrado (1080×1080)

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `tip-oficio` | Enseñar algo útil y ganar guardados | Título, hasta 4 puntos | Guardar para la próxima compra |
| `testimonio` | Prueba social de un cliente real | Reseña, autor, servicio | Ver más opiniones |
| `lubricentro-servicio` | Explicar un servicio del lubricentro | Servicio, beneficio, foto | Pedir turno |

### Banner y destacadas

| Pieza | Objetivo | Contenido mínimo | CTA |
|---|---|---|---|
| `banner-marca` | Portada de Facebook con datos de contacto | Título, sucursales, teléfono | — |
| `destacada-cover` | Ordenar el perfil por categoría | Icono, título accesible | — |
| `presentacion-marca` | Presentación del negocio y sus rubros | Foto, título, rubros | Consultar por WhatsApp |
| `sucursales` | Las dos sucursales con su detalle | Dos fotos, direcciones, horario | Consultar por WhatsApp |

## Clasificación del inventario heredado

| Estado | Identificadores | Criterio |
|---|---|---|
| Vigente | `producto-destacado`, `promo-producto`, `producto-mosaico`, `epp-seguridad`, `tip-oficio`, `lubricentro-servicio`, `presentacion-marca`, `sucursales`, `banner-marca`, `destacada-cover`, `historia-producto`, `historia-locales` | Tienen objetivo claro y contenido real; están migradas |
| Retirado | Los nueve `carrusel-*` y las historias listadas abajo | Campañas puntuales, sin contenido vigente, o reemplazadas por una pieza nueva |

Piezas heredadas reemplazadas por una pieza del catálogo propio:

| Pieza heredada | La reemplaza | Por qué |
|---|---|---|
| `historia-promo`, `historia-oferta-diaria` | `historia-precio-dia` | Una sola pieza de precio con vigencia, en lugar de dos casi iguales |
| `historia-tip-diario` | `historia-tip` | Misma idea con pasos numerados y jerarquía más clara |
| `historia-recordatorio-lubricentro`, `historia-lubricentro-diaria` | `historia-turno-lubricentro` | El objetivo es el turno, no el recordatorio |
| `historia-producto-del-dia`, `historia-reposicion` | `producto-precio`, `historia-precio-dia` | El precio resuelve mejor lo que buscaban esas piezas |
| `historia-apertura`, `historia-informativa`, `historia-encuesta`, `historia-preguntas`, `historia-resena` | — | Sin contenido vigente; `testimonio` cubrirá la prueba social cuando se aprueben las reseñas |

Los identificadores retirados siguen registrados para conservar la trazabilidad
con la línea base congelada; componerlos falla de forma explícita.

## Decisiones del negocio (2026-07-27)

1. **El precio es opcional en la pieza.** Puede mostrarse o dejarse para
   responder por WhatsApp, según lo que convenga a cada publicación. Las piezas
   de precio se componen igual con y sin él: sin precio, el lugar del número lo
   ocupa la invitación a consultar.
2. **Los turnos del lubricentro se toman por WhatsApp o en el local.** Ese es el
   CTA; no se promete reserva online.
3. **El carrusel se conserva como formato**, pero su contenido está sin definir:
   qué enseña y qué ofrece cada tarjeta se decide antes de componerlo.
4. **`testimonio` queda para después.** Hay reseñas en Google Maps; usarlas
   requiere revisar autorización y forma de atribución.
5. **El catálogo va a crecer.** Esta versión cubre lo esencial; se refina con
   más piezas en una tarea posterior.

## Pendientes de definición

- Contenido y estructura del carrusel: qué enseña, en cuántas tarjetas y con
  qué oferta cierra.
- Piezas adicionales que el negocio quiera publicar y todavía no están acá.
- Uso de reseñas reales en `testimonio`, con autorización y atribución.
