# Catálogo de piezas

- Estado: propuesta para revisión del negocio
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
| `producto-precio` | Responder "cuánto sale" sin fricción | Foto, título, precio, vigencia opcional | Reservar por WhatsApp |
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
| `historia-turno-lubricentro` | Pedir turno de servicio | Servicio, horario, teléfono | Pedir turno |
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
| Vigente | `producto-destacado`, `promo-producto`, `producto-mosaico`, `epp-seguridad`, `tip-oficio`, `lubricentro-servicio`, `presentacion-marca`, `sucursales`, `banner-marca`, `destacada-cover`, `historia-producto` | Tienen objetivo claro y contenido real; ya están migrados |
| Rediseño | `historia-promo`, `historia-oferta-diaria`, `historia-tip-diario`, `historia-recordatorio-lubricentro`, `historia-locales` | La idea sirve; la composición se rehace con la jerarquía del catálogo nuevo |
| Retirado | Los nueve `carrusel-*`, `historia-apertura`, `historia-informativa`, `historia-lubricentro-diaria`, `historia-producto-del-dia`, `historia-reposicion`, `historia-encuesta`, `historia-preguntas`, `historia-resena` | Piezas de campañas puntuales, sin contenido vigente o solapadas con otra pieza del catálogo |

Los identificadores retirados siguen registrados para conservar la trazabilidad
con la línea base congelada; componerlos falla de forma explícita.

## Qué falta decidir

Antes de implementar las piezas nuevas se necesita confirmación del negocio
sobre:

1. Si el catálogo cubre lo que se quiere publicar, o falta alguna pieza.
2. Si el precio se muestra en la pieza o se responde por WhatsApp. Cambia la
   pieza `producto-precio` y el pilar principal.
3. Qué reseñas reales pueden usarse en `testimonio`, con autorización.
4. Si el lubricentro toma turnos por WhatsApp o por teléfono; define el CTA.
5. Si se conserva el carrusel como formato para guías, con otra composición, o
   se descarta por completo.
