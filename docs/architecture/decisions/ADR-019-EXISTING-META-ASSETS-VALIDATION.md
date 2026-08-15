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
