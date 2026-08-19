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
