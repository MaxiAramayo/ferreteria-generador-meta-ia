/**
 * Catálogo versionado de perfiles visuales.
 *
 * Cada perfil es el lenguaje visual aprobado de una campaña escrito como datos:
 * qué formato ocupa, para qué sirve, cómo se fotografía, qué queda nítido, qué
 * región se reserva para la capa determinista y qué nunca debe aparecer.
 *
 * El texto es parte del contrato. Cambiar una sola línea cambia la imagen que
 * el proveedor devuelve, así que la versión del perfil es explícita y el hash
 * del prompt se calcula sobre el contenido real: una edición silenciosa queda
 * registrada en la ejecución aunque alguien olvide subir la versión.
 *
 * Alta o cambio de perfil requiere revisión visual y comercial del negocio,
 * igual que un activo.
 */

import type { FormatId } from "@aramayo/design-engine";
import {
  visualProfileIds,
  type VisualFormatId,
  type VisualProfile,
  type VisualProfileId,
} from "@aramayo/domain";

/**
 * El dominio no depende del motor de diseño, así que declara sus formatos por
 * separado. El worker es el único proceso que ve ambas listas y acá se comprueba
 * en tiempo de compilación que siguen siendo la misma: agregar un formato de un
 * lado y no del otro rompe el typecheck en lugar de generar contra una medida
 * que el render no sabe componer.
 */
type AssertAssignable<Target, Source extends Target> = Source;
type DomainFormatSatisfiesEngine = AssertAssignable<FormatId, VisualFormatId>;
type EngineFormatSatisfiesDomain = AssertAssignable<VisualFormatId, FormatId>;

/**
 * Presenta el formato del dominio como formato del motor. Es identidad en
 * runtime: la equivalencia ya quedó probada por los tipos de arriba.
 */
export function toDesignFormatId(
  format: DomainFormatSatisfiesEngine,
): EngineFormatSatisfiesDomain {
  return format;
}

/**
 * `2026-08-03.2` recoge la revisión visual y comercial del negocio: las
 * personas pasan a estar admitidas en los seis perfiles, la marca de un producto
 * se compone desde su foto real en lugar de dibujarse, y la gatita del local
 * entra como sujeto propio con fotos suyas de referencia.
 */
export const visualProfileVersion = "visual-profile/2026-08-03.2";

/**
 * Restricciones que comparten todos los perfiles.
 *
 * Están acá y no repetidas en cada entrada porque no son estética: son el
 * límite entre lo que la IA puede proponer y lo que sólo el motor determinista
 * puede afirmar. Un perfil puede agregar restricciones; ninguno puede quitarlas.
 */
const sharedRestrictions: readonly string[] = Object.freeze([
  "La imagen no lleva ningún texto: ni título, ni precio, ni porcentaje, ni fecha, ni llamado a la acción.",
  "La imagen no dibuja logotipos, isotipos ni etiquetas de marca. Un producto de marca se compone después desde su foto real; nunca se genera.",
  "Las personas que aparecen son genéricas y no representan a nadie del negocio ni a una persona real reconocible.",
  "La composición deja libre el rectángulo reservado para que el texto se componga encima.",
]);

const sharedNegativeGuidance: readonly string[] = Object.freeze([
  "texto, letras, números, tipografía",
  "logotipo, isotipo, etiqueta de marca legible",
  "cartel de precio, etiqueta de oferta",
  "retrato de una persona real reconocible",
  "mano con dedos de más, anatomía imposible",
  "collage, marco, borde decorativo",
  "deformación de herramientas o envases",
  "acabado plástico artificial, brillo irreal",
]);

function profile(
  id: VisualProfileId,
  entry: Omit<VisualProfile, "id" | "restrictions" | "version"> &
    Readonly<{ extraRestrictions: readonly string[] }>,
): VisualProfile {
  return Object.freeze({
    allowedReferenceRoles: Object.freeze([...entry.allowedReferenceRoles]),
    brands: Object.freeze([...entry.brands]),
    defaultFormat: entry.defaultFormat,
    focus: entry.focus,
    formats: Object.freeze([...entry.formats]),
    id,
    intent: entry.intent,
    negativeGuidance: Object.freeze([
      ...sharedNegativeGuidance,
      ...entry.negativeGuidance,
    ]),
    peoplePolicy: entry.peoplePolicy,
    requiredReferenceRole: entry.requiredReferenceRole,
    reservedSpace: entry.reservedSpace,
    restrictions: Object.freeze([
      ...sharedRestrictions,
      ...entry.extraRestrictions,
    ]),
    style: Object.freeze({ ...entry.style }),
    version: visualProfileVersion,
  });
}

/**
 * `Record<VisualProfileId, VisualProfile>` obliga a registrar cada perfil:
 * agregar un identificador sin definirlo no compila.
 */
export const VISUAL_PROFILES: Readonly<Record<VisualProfileId, VisualProfile>> =
  Object.freeze({
    "ferreteria-obra": profile("ferreteria-obra", {
      allowedReferenceRoles: ["store_context", "mascot_photo"],
      brands: ["ferreteria"],
      defaultFormat: "feed",
      extraRestrictions: [
        "La obra se ve ordenada y segura; nada de andamios precarios ni trabajo sin protección.",
        "Quien trabaja lleva la protección que la tarea exige: casco, guantes o gafas según corresponda.",
      ],
      focus:
        "El material de obra en primer plano, con la construcción legible detrás sin robarle atención.",
      formats: ["feed", "cuadrado", "historia"],
      intent:
        "Mostrar materiales de obra y construcción en el contexto real donde se usan.",
      negativeGuidance: ["obra abandonada", "escombros sucios", "cielo plano"],
      peoplePolicy: "generic_people",
      requiredReferenceRole: null,
      reservedSpace: "lower_third",
      style: {
        composition:
          "Plano medio con profundidad: material en primer plano y obra desenfocada al fondo.",
        lighting:
          "Luz natural de media mañana, sombras marcadas pero abiertas, sin contraluz.",
        photography:
          "Fotografía documental de obra, lente 35 mm, ángulo a la altura del pecho.",
        texture:
          "Polvo de cemento, madera, hierro y ladrillo con grano real; nada pulido.",
      },
    }),
    "ferreteria-producto-limpio": profile("ferreteria-producto-limpio", {
      allowedReferenceRoles: ["product_photo", "mascot_photo"],
      brands: ["ferreteria"],
      defaultFormat: "feed",
      extraRestrictions: [
        "El producto se muestra completo, sin recortes que oculten su forma.",
        "No se inventan accesorios, repuestos ni variantes que la referencia no tenga.",
        "Si aparece una persona, sostiene o usa el producto sin taparlo.",
      ],
      focus:
        "La herramienta o el material, nítido de punta a punta y fiel a su forma real.",
      formats: ["feed", "cuadrado", "historia", "destacada"],
      intent:
        "Presentar una herramienta o material de ferretería con lectura inmediata del producto.",
      negativeGuidance: [
        "fondo recargado",
        "producto flotando sin apoyo",
        "múltiples productos superpuestos",
      ],
      peoplePolicy: "generic_people",
      requiredReferenceRole: "product_photo",
      reservedSpace: "lower_third",
      style: {
        composition:
          "Producto centrado sobre superficie de trabajo lisa, fondo liso de un solo tono.",
        lighting:
          "Luz de estudio suave y direccional, sombra propia corta hacia abajo, sin reflejos especulares duros.",
        photography:
          "Fotografía de producto, lente 50 mm, ángulo levemente cenital, profundidad de campo amplia.",
        texture:
          "Metal, plástico técnico y goma con textura real; se ven las marcas de uso propias del material.",
      },
    }),
    "ferreteria-taller": profile("ferreteria-taller", {
      allowedReferenceRoles: ["store_context", "mascot_photo"],
      brands: ["ferreteria"],
      defaultFormat: "feed",
      extraRestrictions: [
        "El taller se ve ordenado y en uso; nada de desorden que sugiera descuido.",
        "Puede aparecer alguien trabajando, de cuerpo entero, concentrado en la tarea y no posando.",
      ],
      focus:
        "La herramienta en uso sobre el banco, reconocible aunque el fondo esté desenfocado.",
      formats: ["feed", "cuadrado", "historia"],
      intent:
        "Mostrar herramientas de ferretería en el contexto de trabajo del oficio.",
      negativeGuidance: [
        "taller vacío y frío",
        "herramientas nuevas sin usar en exhibidor",
        "pose de catálogo mirando a cámara",
      ],
      peoplePolicy: "generic_people",
      requiredReferenceRole: null,
      reservedSpace: "upper_band",
      style: {
        composition:
          "Banco de trabajo en diagonal, herramienta en el tercio central.",
        lighting:
          "Luz lateral cálida de ventana de taller, sombras largas, ambiente ligeramente oscuro.",
        photography:
          "Fotografía documental de oficio, lente 35 mm, profundidad de campo media.",
        texture:
          "Madera gastada, viruta, metal con marcas de uso y polvo fino visible.",
      },
    }),
    "lubricentro-producto-limpio": profile("lubricentro-producto-limpio", {
      allowedReferenceRoles: ["product_photo", "store_context", "mascot_photo"],
      brands: ["lubricentro"],
      defaultFormat: "feed",
      extraRestrictions: [
        "El envase de marca no se dibuja: la escena se arma para que la foto real del producto se componga encima.",
        "No se inventan medidas, viscosidades ni certificaciones.",
        "Si aparece una persona, sostiene el envase sin taparle el frente.",
      ],
      focus:
        "El lugar donde va el envase o el filtro, con la luz y la superficie resueltas para recibirlo.",
      formats: ["feed", "cuadrado", "historia", "destacada"],
      intent:
        "Presentar lubricantes, filtros y baterías con lectura inmediata del producto.",
      negativeGuidance: [
        "envase con etiqueta inventada",
        "aceite derramado",
        "envase abollado",
      ],
      peoplePolicy: "generic_people",
      requiredReferenceRole: "product_photo",
      reservedSpace: "lower_third",
      style: {
        composition:
          "Superficie oscura mate y fondo liso, con el centro despejado para el envase.",
        lighting:
          "Luz de estudio fría y direccional, reflejo controlado sobre el plástico, sombra corta.",
        photography:
          "Fotografía de producto automotor, lente 50 mm, ángulo frontal a la altura de la etiqueta.",
        texture:
          "Plástico técnico mate, metal de filtro y goma; sin brillos irreales.",
      },
    }),
    "lubricentro-servicio": profile("lubricentro-servicio", {
      allowedReferenceRoles: ["store_context", "mascot_photo"],
      brands: ["lubricentro"],
      defaultFormat: "historia",
      extraRestrictions: [
        "El vehículo se ve genérico: sin patente legible, sin insignia de fabricante reconocible.",
        "El operario puede verse completo, con su protección puesta y atento al trabajo.",
      ],
      focus:
        "La operación de servicio —cambio de aceite o filtro— legible en el centro del cuadro.",
      formats: ["historia", "feed", "cuadrado"],
      intent:
        "Mostrar el servicio del lubricentro en curso, con el trabajo como protagonista.",
      negativeGuidance: [
        "patente legible",
        "insignia de fabricante",
        "aceite derramado en el piso",
      ],
      peoplePolicy: "generic_people",
      requiredReferenceRole: null,
      reservedSpace: "upper_band",
      style: {
        composition:
          "Fosa o elevador en diagonal, operación en el tercio central.",
        lighting:
          "Luz de taller mixta, fría de tubo y cálida de foco puntual, ambiente contrastado.",
        photography:
          "Fotografía documental de servicio, lente 35 mm, ángulo bajo desde la fosa.",
        texture:
          "Metal, goma de neumático y piso de cemento pulido con marcas de uso.",
      },
    }),
    "promocion-estacional": profile("promocion-estacional", {
      allowedReferenceRoles: ["product_photo", "store_context", "mascot_photo"],
      brands: ["ferreteria", "lubricentro"],
      defaultFormat: "historia",
      extraRestrictions: [
        "La estación se sugiere con luz y entorno, nunca con un cartel ni con una fecha.",
        "El descuento no se representa de ninguna forma visual: ni sello, ni cinta, ni globo.",
      ],
      focus:
        "El grupo de productos de la promoción, todos reconocibles y sin superponerse.",
      formats: ["historia", "feed", "cuadrado", "banner-fb"],
      intent:
        "Acompañar una promoción estacional con un clima visual, sin representar la oferta.",
      negativeGuidance: [
        "sello de descuento",
        "cinta de oferta",
        "globo de porcentaje",
        "confeti",
      ],
      peoplePolicy: "generic_people",
      requiredReferenceRole: null,
      reservedSpace: "center_circle",
      style: {
        composition:
          "Bodegón de pocos productos sobre superficie amplia, con el centro despejado.",
        lighting:
          "Luz cálida y envolvente, coherente con la estación, sin sombras duras.",
        photography:
          "Fotografía de bodegón comercial, lente 50 mm, ángulo cenital suave.",
        texture:
          "Materiales reales con grano visible, sin acabado publicitario.",
      },
    }),
  });

export function visualProfileFor(id: VisualProfileId): VisualProfile {
  return VISUAL_PROFILES[id];
}

export const VISUAL_PROFILE_LIST: readonly VisualProfile[] = Object.freeze(
  visualProfileIds.map((id) => VISUAL_PROFILES[id]),
);
