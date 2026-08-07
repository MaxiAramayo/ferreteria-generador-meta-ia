# ADR-018: Reels deterministas con Remotion, sujetos a licencia

- Estado: propuesto; implementación bloqueada hasta confirmar licencia
- Fecha: 2026-08-07
- Tarea relacionada: `P4-T08`

## Contexto

Aramayo necesita probar Reels sin gastar tokens en generación de video ni
recrear productos, marcas o locales con IA. Las piezas estáticas ya separan la
fotografía aprobada de la capa determinista de marca, precio, localidad y CTA.
La misma frontera puede reutilizarse en una línea de tiempo de video.

Remotion permite crear MP4 mediante componentes React y renderizar una
composición con `@remotion/renderer`. Su documentación vigente también define
licencias distintas según el tamaño del equipo y si el render se automatiza.
Fuentes oficiales consultadas el 2026-08-07:

- [Remotion](https://www.remotion.dev/);
- [`renderMedia()`](https://www.remotion.dev/docs/renderer/render-media);
- [Licencia](https://www.remotion.dev/docs/licensing).

Por eso la conveniencia técnica no alcanza para agregar la dependencia: primero
hay que confirmar qué licencia corresponde al negocio y al modo de operación de
la plataforma.

## Decisión propuesta

Cuando la licencia esté confirmada, implementar Reels como una capacidad
separada del motor estático:

1. una composición recibe un snapshot comercial inmutable y activos ya
   aprobados;
2. anima únicamente fotografía, logo, titular, explicación, precio, vigencia y
   CTA compuestos en código;
3. no genera video, voz, etiquetas, productos ni escenarios con IA;
4. el worker renderiza el MP4 explícitamente; guardar o aprobar una pieza no
   inicia el render de forma oculta;
5. el manifiesto conserva versión de plantilla, duración, resolución, activos,
   snapshot y hash del archivo;
6. el paquete pesado y el renderer quedan fuera de `apps/web` y se cargan sólo
   en el proceso que produce video.

El primer experimento reutilizará las tres familias aprobadas y producirá un
Reel corto por familia. No se desarrolla antes de que las seis piezas estáticas
sean aprobadas visualmente.

## Invariantes

- Un Reel mantiene una sola idea principal.
- Producto, uso, precio, vigencia, `EN FRÍAS` y CTA provienen del snapshot y de
  la capa determinista.
- Una representación de categoría conserva `IMAGEN ILUSTRATIVA` durante el
  tiempo suficiente para leerse.
- Una foto de surtido real no implica stock ni precio vigente por sí sola.
- No se publican Reels automáticamente ni se agregan permisos de Meta.
- Sin licencia confirmada no se instala Remotion ni se renderiza para uso
  comercial.

## Consecuencias

- Los prototipos de video pueden costar cero tokens de IA.
- Fotografías y plantillas se reutilizan entre feed, historia y Reel.
- El render de video requiere pruebas propias de duración, safe zones, audio,
  codecs y rendimiento; no se mezcla con la validación PNG.
- La implementación permanece pendiente de una decisión comercial de licencia,
  no de una limitación técnica.
