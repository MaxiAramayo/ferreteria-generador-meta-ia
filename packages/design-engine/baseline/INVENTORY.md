# Inventario de la línea base visual

Generado por `pnpm baseline:freeze` el 2026-07-25T13:57:54.074Z.
Tarea: P1-T01.

No editar a mano: se regenera desde el checkout fuente.

## Origen

| Dato | Valor |
|---|---|
| Repositorio | `ferreteria-aramayo-image-generator` |
| Remoto | `git@github.com:MaxiAramayo/ferreteria-post-creator.git` |
| Commit | `234518f41e6358831c70384c3a01aa8a6bf8de25` |
| Fecha del commit | 2026-07-03T12:26:24-03:00 |
| Estado del árbol | con 244 rutas sin commitear |

Los archivos canónicos quedaron fijados por hash en `manifest.json`; esa lista
es la referencia cuando el árbol fuente no está limpio.

## Cobertura

- Layouts registrados: 33.
- Formatos: 5.
- Temas: 4.
- Familias tipográficas: 4.
- Nombres semánticos de icono: 26 (`lucide-react@^0.561.0`).
- Fixtures congelados: 33.
- Referencias PNG: 33.

- Activos de marca (`public/media/brand`): 17.
- Fotografías y recursos (`public/media`): 21.

## Propiedad y permiso de uso de los activos

| Estado | Activos | Criterio |
|---|---:|---|
| `libre-verificada` | 4 | Ilustración vectorial simple incluida en el repositorio fuente; verificar autoría antes de migrarla. |
| `por-confirmar-stock` | 15 | Fotografía de producto tomada para la ferretería; confirmar que sea propia antes de reutilizarla. |
| `aramayo` | 17 | Material propio de Ferretería y Lubricentro Aramayo: logos, frentes e interiores de sus locales. |
| `por-confirmar-catalogo` | 2 | Fotografía de catálogo de un proveedor; requiere confirmar autorización de uso en redes. |

Requieren confirmación del negocio antes de migrarse en `P1-T03`:

- `public/media/botas-seguridad-pvc.jpg`
- `public/media/cano-ips-bicapa.jpg`
- `public/media/captura-pantalla-promo.png`
- `public/media/catalogo-capea-italiana-feed.jpg`
- `public/media/catalogo-capea-italiana-historia.jpg`
- `public/media/conector-t-riego-goteo.jpg`
- `public/media/deposito-plomeria-surtido.jpg`
- `public/media/entrerosca-cano-ips.jpg`
- `public/media/flexible-conexion-agua.jpg`
- `public/media/machete-hacha-biassoni.jpg`
- `public/media/manguera-azul.jpeg`
- `public/media/manguera-azul.jpg`
- `public/media/stock-epp.jpg`
- `public/media/stock-herramientas-electricas.jpg`
- `public/media/stock-pinturas.jpg`
- `public/media/stock-plomeria.jpg`
- `public/media/tapa-pvc-tuboforte.jpg`

## Tipografías e iconos

- `@fontsource/archivo@^5.2.8` (familia `archivo`)
- `@fontsource/barlow-condensed@^5.2.8` (familia `barlow-condensed`)
- `@fontsource/inter@^5.2.8` (familia `inter`)
- `@fontsource/saira-condensed@^5.2.8` (familia `saira-condensed`)
- Iconos: `lucide-react@^0.561.0`, referenciados por nombre semántico.

## Formatos

| Formato | Etiqueta | Tamaño | Zona segura |
|---|---|---|---|
| `feed` | Post feed 4:5 | 1080×1350 | `{ top: 72, right: 72, bottom: 72, left: 72 }` |
| `cuadrado` | Cuadrado 1:1 | 1080×1080 | `{ top: 72, right: 72, bottom: 72, left: 72 }` |
| `historia` | Historia 9:16 | 1080×1920 | `{ top: 250, right: 72, bottom: 300, left: 72 }` |
| `banner-fb` | Banner Facebook | 1640×624 | `{ top: 48, right: 280, bottom: 48, left: 280 }` |
| `destacada` | Portada destacada | 1080×1080 | `{ top: 110, right: 110, bottom: 110, left: 110, circleDiameter: 860 }` |

## Temas

- `taller`
- `claro`
- `promo`
- `lubricentro`

## Layouts

- `producto-destacado`
- `promo-producto`
- `historia-producto`
- `historia-promo`
- `lubricentro-servicio`
- `tip-oficio`
- `epp-seguridad`
- `banner-marca`
- `destacada-cover`
- `presentacion-marca`
- `sucursales`
- `producto-mosaico`
- `carrusel-bienvenida-portada`
- `carrusel-bienvenida-locales`
- `carrusel-bienvenida-datos`
- `carrusel-productos-portada`
- `carrusel-productos-ferreteria`
- `carrusel-productos-mas`
- `carrusel-lubricentro-portada`
- `carrusel-lubricentro-servicios`
- `carrusel-lubricentro-turno`
- `historia-apertura`
- `historia-locales`
- `historia-informativa`
- `historia-lubricentro-diaria`
- `historia-producto-del-dia`
- `historia-tip-diario`
- `historia-reposicion`
- `historia-encuesta`
- `historia-preguntas`
- `historia-recordatorio-lubricentro`
- `historia-resena`
- `historia-oferta-diaria`

## Fixtures y referencias

| Fixture | Origen | Layout | Tamaño | Cobertura |
|---|---|---|---|---|
| `banner-marca` | `posts/banner/01-banner-marca.md` | `banner-marca` | 1640x624 | Layout `banner-marca` en formato 1640x624 y tema taller |
| `carrusel-bienvenida-datos` | `posts/feed/lanzamiento-01-presentacion-03-datos.md` | `carrusel-bienvenida-datos` | 1080x1080 | Layout `carrusel-bienvenida-datos` en formato 1080x1080 y tema taller |
| `carrusel-bienvenida-locales` | `posts/feed/lanzamiento-01-presentacion-02-locales.md` | `carrusel-bienvenida-locales` | 1080x1080 | Layout `carrusel-bienvenida-locales` en formato 1080x1080 y tema claro |
| `carrusel-bienvenida-portada` | `posts/feed/lanzamiento-01-presentacion.md` | `carrusel-bienvenida-portada` | 1080x1080 | Layout `carrusel-bienvenida-portada` en formato 1080x1080 y tema promo |
| `carrusel-lubricentro-portada` | `posts/feed/lanzamiento-03-lubricentro.md` | `carrusel-lubricentro-portada` | 1080x1080 | Layout `carrusel-lubricentro-portada` en formato 1080x1080 y tema lubricentro |
| `carrusel-lubricentro-servicios` | `posts/feed/lanzamiento-03-lubricentro-02-servicios.md` | `carrusel-lubricentro-servicios` | 1080x1080 | Layout `carrusel-lubricentro-servicios` en formato 1080x1080 y tema lubricentro |
| `carrusel-lubricentro-turno` | `posts/feed/lanzamiento-03-lubricentro-03-turno.md` | `carrusel-lubricentro-turno` | 1080x1080 | Layout `carrusel-lubricentro-turno` en formato 1080x1080 y tema lubricentro |
| `carrusel-productos-ferreteria` | `posts/feed/lanzamiento-02-sucursales-02-ferreteria.md` | `carrusel-productos-ferreteria` | 1080x1080 | Layout `carrusel-productos-ferreteria` en formato 1080x1080 y tema claro |
| `carrusel-productos-mas` | `posts/feed/lanzamiento-02-sucursales-03-mas.md` | `carrusel-productos-mas` | 1080x1080 | Layout `carrusel-productos-mas` en formato 1080x1080 y tema promo |
| `carrusel-productos-portada` | `posts/feed/lanzamiento-02-sucursales.md` | `carrusel-productos-portada` | 1080x1080 | Layout `carrusel-productos-portada` en formato 1080x1080 y tema taller |
| `destacada-cover` | `posts/destacada/01-sucursales.md` | `destacada-cover` | 1080x1080 | Layout `destacada-cover` en formato 1080x1080 y tema taller |
| `epp-seguridad` | `posts/feed/04-epp-seguridad.md` | `epp-seguridad` | 1080x1350 | Layout `epp-seguridad` en formato 1080x1350 y tema taller |
| `historia-apertura` | `posts/historia/diaria-01-ya-abrimos.md` | `historia-apertura` | 1080x1920 | Layout `historia-apertura` en formato 1080x1920 y tema promo |
| `historia-encuesta` | `posts/historia/serie-domingo-01-proyecto.md` | `historia-encuesta` | 1080x1920 | Layout `historia-encuesta` en formato 1080x1920 y tema promo |
| `historia-informativa` | `posts/historia/destacadas/destacada-horarios-01.md` | `historia-informativa` | 1080x1920 | Layout `historia-informativa` en formato 1080x1920 y tema taller |
| `historia-locales` | `posts/historia/destacadas/destacada-sucursales-01.md` | `historia-locales` | 1080x1920 | Layout `historia-locales` en formato 1080x1920 y tema claro |
| `historia-lubricentro-diaria` | `posts/historia/destacadas/destacada-lubricentro-01.md` | `historia-lubricentro-diaria` | 1080x1920 | Layout `historia-lubricentro-diaria` en formato 1080x1920 y tema lubricentro |
| `historia-oferta-diaria` | `posts/historia/serie-domingo-02-riego.md` | `historia-oferta-diaria` | 1080x1920 | Layout `historia-oferta-diaria` en formato 1080x1920 y tema claro |
| `historia-preguntas` | `posts/historia/serie-jueves-01-preguntas.md` | `historia-preguntas` | 1080x1920 | Layout `historia-preguntas` en formato 1080x1920 y tema taller |
| `historia-producto-del-dia` | `posts/historia/serie-lunes-01-producto.md` | `historia-producto-del-dia` | 1080x1920 | Layout `historia-producto-del-dia` en formato 1080x1920 y tema taller |
| `historia-promo` | `posts/historia/02-historia-promo.md` | `historia-promo` | 1080x1920 | Layout `historia-promo` en formato 1080x1920 y tema promo |
| `historia-recordatorio-lubricentro` | `posts/historia/serie-miercoles-02-lubricentro.md` | `historia-recordatorio-lubricentro` | 1080x1920 | Layout `historia-recordatorio-lubricentro` en formato 1080x1920 y tema lubricentro |
| `historia-reposicion` | `posts/historia/reposicion-01-sanitarios-capea.md` | `historia-reposicion` | 1080x1920 | Layout `historia-reposicion` en formato 1080x1920 y tema taller |
| `historia-resena` | `posts/historia/serie-sabado-01-opinion.md` | `historia-resena` | 1080x1920 | Layout `historia-resena` en formato 1080x1920 y tema claro |
| `historia-tip-diario` | `posts/historia/serie-martes-01-tip.md` | `historia-tip-diario` | 1080x1920 | Layout `historia-tip-diario` en formato 1080x1920 y tema claro |
| `lubricentro-servicio` | `posts/feed/03-lubricentro-servicio.md` | `lubricentro-servicio` | 1080x1350 | Layout `lubricentro-servicio` en formato 1080x1350 y tema lubricentro |
| `producto-destacado` | `posts/feed/01-producto-taladro.md` | `producto-destacado` | 1080x1350 | Layout `producto-destacado` en formato 1080x1350 y tema taller |
| `producto-mosaico` | `posts/feed/08-plomeria-mosaico.md` | `producto-mosaico` | 1080x1350 | Layout `producto-mosaico` en formato 1080x1350 y tema taller |
| `promo-producto` | `posts/feed/02-promo-pintura.md` | `promo-producto` | 1080x1350 | Layout `promo-producto` en formato 1080x1350 y tema promo |
| `tip-oficio` | `posts/cuadrado/01-tip-plomeria.md` | `tip-oficio` | 1080x1080 | Layout `tip-oficio` en formato 1080x1080 y tema claro |
| `borde-texto-largo` | derivado de `posts/feed/01-producto-taladro.md` | `producto-destacado` | 1080x1350 | Texto largo en título, subtítulo, badge y CTA |
| `borde-sin-foto` | derivado de `posts/feed/01-producto-taladro.md` | `producto-destacado` | 1080x1350 | Pieza sin foto declarada |
| `borde-foto-panoramica` | derivado de `posts/feed/01-producto-taladro.md` | `producto-destacado` | 1080x1350 | Foto con proporción extrema y encuadre contain |

## Layouts registrados sin pieza en el generador

Estos layouts existen en el registro pero ninguna pieza los usa, así que su fixture debe crearse al migrarlos en `P1-T04`:

- `historia-producto`
- `presentacion-marca`
- `sucursales`

## Rutas no canónicas

- `output`: Salidas exportadas; sólo pueden usarse como referencia.
- `dist`: Build generado; no se migra.
- `Diseño system ferretería y lubricentro`: Material histórico de consulta; no es el motor activo.
