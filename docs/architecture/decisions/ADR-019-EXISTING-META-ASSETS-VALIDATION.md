# ADR-019: validación de Meta sobre los activos existentes

- Estado: aceptado con excepción operativa
- Fecha: 2026-08-13
- Tarea: `P5-T01`

## Contexto

El portfolio de Aramayo contiene una única Page productiva, una única cuenta de
Instagram conectada y una aplicación existente. No se observó una Page ni una
cuenta de Instagram separadas para pruebas. El plan original requería esa
separación para que una publicación de prueba no afectara la presencia pública
del negocio.

El usuario decidió no crear ni usar activos Meta separados: la integración debe
usar los activos existentes y llegar a producción sólo después de smokes
verificados. Esta decisión es una excepción acotada a los activos externos de
Meta; no cambia el aislamiento de entornos, secretos, base de datos, colas,
Cloudinary ni OpenAI definido en `ADR-012`.

## Decisión

1. La Page, la cuenta de Instagram y la aplicación inventariadas son los
   candidatos para la vertical final de Meta. Esta decisión no configura OAuth,
   permisos, tokens ni conexiones.
2. Los smokes previos a una publicación real se limitan a contratos, dobles,
   validación local, preflight de medios y lecturas remotas permitidas. No
   crean containers ni publicaciones en los activos existentes.
3. Una operación que escriba en Meta —incluso un test de container— requiere
   una autorización posterior, concreta y con el activo, media, copy, destino
   y efecto esperados. Una publicación pública además exige snapshot aprobado,
   rol `publisher`, idempotencia y confirmación humana.
4. El requisito de `P5-T01` de separar activos de prueba queda exceptuado por
   la decisión del usuario. Las verificaciones de publicación real de tareas
   posteriores no se consideran automáticamente satisfechas ni autorizadas por
   esta excepción.
5. Antes de implementar Stories, se confirmó de forma visible y documentada
   que `@ferreteria_aramayo` es una cuenta profesional de tipo Business. Las
   personas humanas con acceso vigente a la app asumen la responsabilidad de
   gestionar configuración, App Review y verificaciones.

## Consecuencias

- No habrá contenido de prueba, borradores remotos ni limpiezas automáticas en
  la presencia pública actual de Aramayo.
- La cobertura que normalmente aporta una cuenta de prueba se sustituye sólo
  en parte por fixtures, dobles y preflight; no equivale a probar publicación
  remota y el riesgo residual se conserva explícitamente.
- La primera publicación remota real tendrá una aprobación separada y no se
  tratará como smoke.
- `P5-T01` cerró después de confirmar el tipo Business de Instagram y la
  responsabilidad operativa de las personas humanas con acceso vigente a la
  app; esta decisión únicamente exceptúa la separación de activos de prueba.

## Aprobación

El usuario indicó el 2026-08-13 que se usará la cuenta existente, con smokes
verificados antes de subir contenido. La aprobación cubre esta excepción
documental y no autoriza escritura ni publicación en Meta.

## Enmienda 2026-08-19 — primera publicación real autorizada

El usuario autorizó de forma explícita y concreta la primera escritura en los
activos reales, con estos términos:

| Término | Valor |
|---|---|
| Activos | Page de Aramayo y `@ferreteria_aramayo` |
| Media | Pieza de electricidad aportada por el negocio, subida a Cloudinary staging y entregada como JPEG por la variante `meta-feed` |
| Copy | Redactado por el asistente y aprobado sin cambios por el usuario |
| Destinos | `instagram_feed` y `facebook_page` |
| Efecto esperado | Dos publicaciones visibles al público, una por destino |

Esto satisface el punto 3 en cuanto a autorización concreta, idempotencia y
confirmación humana. **No lo satisface en dos puntos, y la desviación se
registra en vez de disimularse:**

- **no hay snapshot aprobado.** La pieza no proviene de un brief ni de una
  revisión aprobada: es material que el negocio ya tenía. El mecanismo que
  exigiría el snapshot es la orquestación de `P5-T05`, que todavía no existe;
- **no interviene el rol `publisher`.** La corrida es una operación de
  plataforma ejecutada en el servidor de staging, no una acción de la aplicación
  con su control de acceso.

El usuario aceptó esas dos desviaciones al autorizar la corrida. La excepción es
**puntual**: cubre esta publicación y no habilita publicaciones posteriores sin
una autorización nueva. La verificación de publicación real de `P5-T09` —que
exige pieza salida de brief y snapshot aprobados— no queda satisfecha por esto.

El smoke que la ejecuta —`apps/worker/src/publishing/publish-smoke.ts`— falla
cerrado: sin la frase de autorización exacta en la línea de comandos termina sin
haber llamado a Meta. Su diario de intentos es un archivo y no memoria, para que
repetir el comando encuentre la publicación anterior en vez de duplicarla.

### Resultado de la corrida

Ejecutada el 2026-08-19. Publicó una vez en cada destino:

| Destino | Medio preparado | Publicación | Enlace |
|---|---|---|---|
| Instagram feed | contenedor `17875714101627070` | `17868397647637585` | — |
| Facebook Page | foto `1587397383077625` | `252222471780140_1587397416410955` | [posts/1587397416410955](https://www.facebook.com/1587397443077619/posts/1587397416410955) |

Repetir el comando exacto devolvió `already-published` en ambos destinos, con
los mismos identificadores y sin crear una segunda publicación.

**Defecto conocido y aceptado.** La pieza es material generado con IA y las
térmicas SICA que muestra llevan marcados fabricados: los amperajes son
caracteres deformados, la letra chica es texto ilegible y los valores «C 60» y
«C 90» no existen en la línea residencial. Se le señaló al usuario antes de
publicar, con un recorte ampliado, y decidió publicar igual. Es el mismo defecto
que `P4-T08` había registrado con los filtros Wega.

Los secretos que hubo que cargar en el servidor para la corrida —credenciales de
Cloudinary staging— se eliminaron al terminar. El servidor queda sin capacidad
de volver a publicar sin una preparación deliberada, que es la postura que
corresponde a una autorización puntual.

## Enmienda 2026-08-21 — estrategia de activos para App Review

El usuario decidió que App Review use los activos reales existentes: la Page de
Aramayo y `@ferreteria_aramayo`. No se crearán activos separados para el
revisor.

Esta decisión resuelve **qué activos** se usarán, pero no autoriza todavía una
escritura. Antes de habilitar el usuario temporal o entregar las instrucciones a
Meta siguen siendo obligatorios:

1. aprobar el bitmap final y su checksum;
2. aprobar el copy exacto y los destinos;
3. fijar una ventana de revisión y un límite de una publicación por destino;
4. identificar a la persona responsable de supervisar y, si corresponde,
   retirar manualmente el contenido después de la revisión;
5. aprobar nombre público, textos legales, dominios y canales de contacto.

El usuario temporal de staging sólo verá el dataset acotado de App Review. La
autorización no cubre historias, piezas diferentes, cambios de copy, reintentos
manuales ni acciones fuera del flujo idempotente del panel. Una respuesta
ambigua se reconcilia; no se vuelve a publicar a ciegas.

### Aprobación administrativa recibida

El 2026-08-21 el usuario aprobó expresamente para App Review:

- el nombre público **Aramayo Content Platform**;
- la marca responsable **Ferretería y Lubricentro Aramayo**;
- el dominio `staging.content.ferreteriaaramayo.com.ar`;
- los textos vigentes de privacidad, términos y eliminación de datos;
- el teléfono `3854 403534` y los domicilios República de Siria 365 y
  Rivadavia 673, Frías, como canales públicos correctos.

Esta aprobación satisface el punto 5 anterior. No autoriza la publicación
técnica: bitmap, checksum, copy, destinos, ventana y supervisión se presentan en
una autorización separada.

### Autorización concreta de App Review recibida

El 2026-08-21 el usuario aprobó el bitmap SHA-256
`91a4fd42bd7ecfd60f10f1862e8081124993683de34883a46a7bea547cbc74f0` y
el copy exacto documentado para una única orden idempotente, con una publicación
en el feed de `@ferreteria_aramayo` y otra en la Page real de Aramayo.

La ventana empieza cuando se entreguen las credenciales temporales y termina al
recibirse la decisión de Meta o al cumplirse 30 días corridos, lo que ocurra
primero. El responsable del negocio asume supervisión y retiro manual posterior.
Una respuesta ambigua sólo autoriza reconciliación; no autoriza volver a
publicar.

Esta aprobación satisface los puntos 1 a 4 para ese archivo exacto. Cualquier
cambio de bytes, copy, destino, límite o ventana exige una aprobación nueva. No
autoriza despliegue, configuración remota, creación de credenciales ni la
publicación inmediata por parte del agente.

### Reemplazo solicitado por el negocio

El 2026-08-22 el usuario descartó expresamente la placa y el copy técnicos. La
autorización concreta anterior quedó revocada antes de producir una orden o una
escritura en Meta. La primera candidata comercial, basada en una foto propia de
herramientas eléctricas y con SHA-256
`21f1e5d2af47aeca4d71a353b3aac256d1b85c2d81c649398914d8bd082208c1`,
también fue descartada antes de aprobarse: el negocio confirmó que esa misma
publicación ya había salido.

Se preparó entonces una candidata distinta sobre soldadoras. Usa una escena
genérica generada mediante la IA integrada del chat —sin consumir la API de
imágenes de la plataforma— y queda rotulada “Imagen ilustrativa”. El 2026-08-24
el negocio pidió que la foto quedara completa, que la identidad funcionara como
marco y que la pieza identificara un producto real. La API comercial GET-only
de Odoo confirmó `odoo-product-3941`: **LA-SER Inverter 160 A, referencia DISC 225,
SKU 7039**, precio minorista **$239.399,91** y seis unidades en cada sucursal a
las 23:20:16Z. El snapshot conserva referencias y request IDs seguros, pero no
el token ni campos de costo, margen o proveedor.

El negocio pidió después retirar la referencia y el SKU de todo contenido
visible. Ambos quedan sólo como evidencia interna de identidad. Odoo identifica
a LA-SER como proveedor principal y la ficha oficial exacta mostraba
**$233.288,00** con impuestos al 2026-08-24T23:33:49Z. Esa observación se registra
como comparación y nunca sobreescribe automáticamente el precio minorista de
Aramayo.

El layout `producto-editorial` duplica la escena sólo para formar un fondo
desenfocado, conserva la copia nítida completa y admite ahora precio opcional.
El doble render determinista actualizado produjo 1080×1350, 1.149.658 bytes y
SHA-256
`a6022b74d3356a95e72a33bd51bbe1636df48e27d4b0a5ac56eb17de0053c19d`.
La acción se presenta como “Escribinos” en rojo profundo de Aramayo; el verde
de WhatsApp fue retirado del sistema visual por decisión expresa del negocio.
Precio y stock deben revalidarse antes de cualquier publicación: una diferencia
obliga a generar bitmap/copy nuevos y obtener otra aprobación.

La nueva candidata no hereda ninguna autorización anterior: bitmap, copy exacto y SHA
quedan pendientes de aprobación. Se conservan únicamente los destinos
`instagram_feed` y `facebook_page`, la orden única idempotente, la ventana
máxima, la supervisión, el retiro manual y la regla de reconciliación ya
decididos.

### Corrección comercial y selección del ícono — 2026-08-31

El usuario pidió mantener la soldadora, pero retirar el precio de la candidata
y mostrar «Consultar precio» en tipografía normal. El copy debe explicar la
utilidad del producto al principio y decir «Disponible en nuestros negocios»
con ambos locales; no expone la frase administrativa «al momento de la
verificación». Se admiten pocos emojis en Instagram/Facebook. La advertencia
«Imagen ilustrativa» permanece en el bitmap y su texto alternativo, sin
repetirse en el caption.

El precio histórico de Odoo se conserva sólo como evidencia interna. La nueva
pieza no necesita un importe publicable, pero debe revalidar identidad y stock
antes de una publicación real. La ficha oficial LA-SER consultada el
2026-08-31 respalda el formato compacto y liviano con dimensiones y peso;
el copy no promete materiales, espesores ni superioridad sin fuente.

La versión `meta-app-review/2026-08-31.1-candidate` produjo 1080×1350,
1.146.451 bytes y SHA-256
`407de4f95c8e18f4c52fa0544785f06f81fe9832de1032a3ac7e977fa0ca7d43`.
Este reemplazo deja sin efecto la candidata anterior, no concede aprobación
final ni permiso para publicar, habilitar usuarios o enviar App Review.

El usuario eligió la A exacta de la pieza para el ícono de la app. Se reutiliza
`AramayoMark`, sin redibujarlo ni generar otro logotipo; su PNG para carga y el
favicon del panel comparten geometría y colores. Falta la carga remota.
El correo de contacto se omite salvo que Meta lo exija para enviar. El valor
que autorizó el usuario queda fuera de Git y del contenido público.
