import type { Metadata } from "next";

import { LegalDocument } from "../legal-document";

export const metadata: Metadata = {
  description: "Términos de uso de Aramayo Content Platform.",
  title: "Términos de uso · Aramayo Content Platform",
};

export default function TermsPage() {
  return (
    <LegalDocument
      description="Condiciones para acceder y operar el panel interno de contenido y publicación."
      eyebrow="Documento público"
      title="Términos de uso"
      updatedAt="21 de agosto de 2026"
    >
      <section>
        <h2>1. Aceptación y acceso</h2>
        <p>
          Aramayo Content Platform es una herramienta interna de Ferretería y
          Lubricentro Aramayo. Sólo pueden usarla personas expresamente
          autorizadas, con una identidad individual y los roles asignados para
          su función. El acceso no se puede compartir ni transferir.
        </p>
      </section>

      <section>
        <h2>2. Uso permitido</h2>
        <p>
          La plataforma se usa para crear, revisar, aprobar y publicar contenido
          de Aramayo. Cada persona debe verificar que productos, precios, stock,
          promociones, horarios, imágenes y llamados a la acción tengan una
          fuente vigente y que cuenta con autorización para usar los activos.
          Guardar, generar, aprobar, programar y publicar son acciones
          independientes.
        </p>
      </section>

      <section>
        <h2>3. Conexión y publicación en Meta</h2>
        <p>
          Al conectar Meta, la persona confirma que puede administrar la Page y
          la cuenta profesional seleccionadas. La plataforma solicita sólo los
          permisos necesarios para descubrir esos activos, leer la información
          mínima de vinculación y publicar contenido confirmado. Una conexión
          puede revocarse desde el panel o desde Meta.
        </p>
        <p>
          Una publicación requiere un snapshot aprobado y una confirmación que
          muestra cuenta, destinos y copy. La plataforma implementa idempotencia
          y reconciliación, pero la disponibilidad y las políticas de Meta son
          externas y pueden impedir o demorar una operación.
        </p>
      </section>

      <section>
        <h2>4. Conductas prohibidas</h2>
        <ul>
          <li>Acceder con la identidad de otra persona o eludir permisos.</li>
          <li>Copiar, revelar o registrar credenciales y tokens.</li>
          <li>
            Publicar datos falsos, contenido no aprobado o activos ajenos.
          </li>
          <li>
            Intentar duplicar publicaciones, alterar auditorías o interferir con
            la seguridad y disponibilidad del sistema.
          </li>
          <li>
            Usar la integración para anuncios, mensajes o fines no aprobados.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Contenido y propiedad</h2>
        <p>
          Aramayo conserva sus marcas, activos y contenido comercial. Los
          derechos de terceros siguen perteneciendo a sus titulares. Cargar o
          publicar un recurso implica que existe permiso suficiente para usarlo
          en los destinos elegidos.
        </p>
      </section>

      <section>
        <h2>6. Suspensión y finalización</h2>
        <p>
          Aramayo puede revocar sesiones, roles o conexiones ante una baja,
          cambio de función, incidente, pérdida de permisos o incumplimiento.
          Quitar la integración corta publicaciones futuras y elimina las
          credenciales locales; no borra automáticamente publicaciones ya
          realizadas en Meta.
        </p>
      </section>

      <section>
        <h2>7. Disponibilidad y responsabilidad</h2>
        <p>
          El sistema se opera con controles razonables de seguridad y
          recuperación, sin prometer disponibilidad ininterrumpida de servicios
          externos. Los fallos parciales se muestran para decisión humana y no
          habilitan a repetir a ciegas una publicación cuyo resultado sea
          incierto.
        </p>
      </section>

      <section>
        <h2>8. Privacidad, cambios y jurisdicción</h2>
        <p>
          El tratamiento de información se describe en la{" "}
          <a href="/legal/privacy">política de privacidad</a>. Los cambios
          relevantes se publicarán con una nueva fecha de vigencia. Estos
          términos se interpretan conforme a las leyes de la República
          Argentina, sin limitar derechos que resulten inderogables.
        </p>
      </section>
    </LegalDocument>
  );
}
