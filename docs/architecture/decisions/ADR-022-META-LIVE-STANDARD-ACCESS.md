# ADR-022: la app opera en vivo con acceso estándar sobre activos propios

- Estado: aceptado
- Fecha: 2026-09-01
- Tarea: `P5-T08`

## Contexto

`P5-T08` se planificó asumiendo que operar «con usuarios y activos reales»
obligaba a enviar App Review. Ese supuesto quedó desmentido por dos hechos
verificados el 2026-09-01.

Primero, la publicación real. La orden `b2d75f69-40f1-48a8-ad6e-56bd142be220`
ejerció los cinco permisos sobre los activos reales y publicó exactamente una
vez en Instagram feed y Facebook Page, con la app todavía sin publicar y con la
persona administradora usando un rol propio de la app. La evidencia está en el
[registro operativo](../../operations/META-APP-REVIEW-PUBLICATION-2026-08-31.md).

Segundo, la publicación de la app. La persona administradora pulsó **Publicar**
en la consola de Meta, que respondió «Tu aplicación se ha publicado
correctamente» y la describe como «disponible para su uso público». En
**Acciones requeridas** Meta no informa nada pendiente para conservar el acceso.

Ese estado se verificó después leyendo la consola directamente el 2026-09-01,
sin modificar nada:

- **Publicar** muestra la insignia «Publicada» y su única acción disponible es
  **Anular publicación**;
- **Acciones requeridas** responde «No tienes ningún elemento de acción
  requerida para mostrar»;
- los permisos siguen en **«Listo para prueba»** —la etiqueta del acceso
  estándar— después de publicar: `instagram_basic`, `instagram_content_publish`,
  `pages_manage_posts`, `pages_read_engagement` y `pages_show_list`, más
  `business_management` y `public_profile`, que Meta agrega con los casos de uso.
  Ninguno tiene acceso avanzado y ningún otro permiso está añadido;
- **Roles de la aplicación** lista una sola persona, con rol Administrador, y
  cero evaluadores. La app pertenece a la cuenta empresarial Ferretería y
  Lubricentro Aramayo, cuyos administradores pueden tener rol vía Business Suite
  sin aparecer en esa lista.

La documentación oficial explica por qué ambos hechos son coherentes:

- el acceso estándar se aprueba automáticamente para los permisos y funciones
  del tipo de app de negocio, y sólo puede solicitarse a personas usuarias que
  tienen un rol en la app;
- el acceso avanzado existe para cuando las personas que usan la app **no**
  tendrán un rol en ella; exige verificación del negocio y App Review;
- acceder a datos de negocio pertenecientes a otros portfolios exige convertirse
  en **Tech Provider**, con preguntas adicionales sobre datos y App Review antes
  de publicar.

La plataforma de Aramayo opera únicamente la Page y la cuenta de Instagram del
propio negocio, y quienes la operan son personas internas que ya tienen rol en
la app. No hay clientes de terceros ni activos de otros portfolios. Declararse
Tech Provider describiría mal el producto; además, la consola presenta esa
clasificación como una elección que no se revierte.

## Decisión

1. La app permanece publicada, con su clasificación actual y **acceso estándar**
   sobre los cinco permisos de `metaRequiredPermissions`. No se solicita acceso
   avanzado ni se cambia la clasificación a Tech Provider.
2. No se envía App Review mientras el alcance sean activos propios. El paquete
   de [`META-APP-REVIEW.md`](../../integrations/META-APP-REVIEW.md) se conserva
   como documentación de permisos, justificaciones y procedimiento, no como una
   obligación pendiente.
3. **Precondición operativa**: toda persona que conecte Meta desde el panel debe
   tener un rol en la app —administración, desarrollo o prueba—. Sin ese rol el
   acceso estándar no concede los permisos y la conexión no puede publicar.
4. La identidad temporal de revisión no se activa ni se entrega. Se retira según
   el plan de baja ya documentado; nunca tuvo sesiones ni credencial entregada.
5. Ampliar el alcance a activos de terceros reabre esta decisión y exige un ADR
   nuevo antes de implementar: Tech Provider, acceso avanzado, verificación del
   negocio y App Review, en ese orden.

## Consecuencias

- Los criterios de `P5-T08` que dependían del envío —screencast con cada permiso
  y acceso de una persona revisora sin datos internos— quedan sin objeto. Se
  registran como desviación aprobada, no como trabajo hecho: no existe
  screencast y no se recorrió el guion.
- La precondición de rol tiene una defensa ya implementada. `healthFor` de
  [`meta-connection.service.ts`](../../../apps/api/src/connections/meta-connection.service.ts)
  marca la conexión como `permission_revoked` y expone `missingPermissions`
  cuando falta cualquier permiso requerido, de modo que una conexión hecha por
  alguien sin rol se detiene antes de publicar en vez de fallar en Meta.
- El nombre de la app en la consola ya es **Aramayo Content Platform**
  (`2161967167868736`); «Staging» sobrevive sólo en la aplicación de Instagram
  del caso de uso, `Aramayo Content Staging-IG`. Es decir, **el nombre ya no
  indica el ambiente**: lo indica el dominio, que sigue siendo
  `staging.content.ferreteriaaramayo.com.ar`. Publicar la app no promovió
  infraestructura ni datos. La Fase 7 debe decidir explícitamente si producción
  reutiliza esta app o registra otra; la decisión no queda tomada aquí.
- La precondición de rol es hoy estrecha y concreta: **una sola persona tiene
  rol** en la app. Cualquier otra persona que deba conectar Meta necesita que se
  le asigne rol antes, desde Business Suite o desde Roles de la aplicación.
- El riesgo residual se desplaza: ya no depende de la aprobación de Meta, sino
  de conservar los roles de la app y la conexión sana. Una persona que pierda su
  rol pierde la capacidad de publicar aunque el panel siga operativo.
- Los límites de [`ADR-019`](ADR-019-EXISTING-META-ASSETS-VALIDATION.md) sobre
  activos existentes y autorización por publicación siguen vigentes. Esta
  decisión no autoriza publicar ninguna pieza nueva.

## Fuentes

- [Niveles de acceso de Graph API](https://developers.facebook.com/docs/graph-api/overview/access-levels)
- [Tech Providers](https://developers.facebook.com/docs/development/release/tech-providers/)
- [Guía de presentación de App Review](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)

## Aprobación

El usuario resolvió el 2026-09-01, después de publicar la app y revisar
**Acciones requeridas**, que App Review no corresponde al uso propio de Aramayo
y que la clasificación Tech Provider sería incorrecta e irreversible. Esta
decisión cubre el alcance vigente de activos propios y no autoriza escritura ni
publicación adicional en Meta.
