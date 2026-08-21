import type { Metadata } from "next";

import { LegalDocument } from "../legal-document";

export const metadata: Metadata = {
  description:
    "Política de privacidad de Aramayo Content Platform y su integración con Meta.",
  title: "Política de privacidad · Aramayo Content Platform",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      description="Explica qué información usa el panel interno, para qué la usa y cómo pedir su eliminación."
      eyebrow="Documento público"
      title="Política de privacidad"
      updatedAt="21 de agosto de 2026"
    >
      <section>
        <h2>1. Responsable y alcance</h2>
        <p>
          Ferretería y Lubricentro Aramayo, con operación en Frías, Santiago del
          Estero, es responsable de Aramayo Content Platform. La plataforma es
          una herramienta interna para que personas autorizadas creen, revisen y
          publiquen contenido comercial en activos de Meta administrados por el
          negocio. No ofrece registro público ni servicios dirigidos a menores.
        </p>
      </section>

      <section>
        <h2>2. Información que tratamos</h2>
        <ul>
          <li>
            Identidad de operadores: nombre, correo, roles, hash de contraseña,
            sesiones revocables y eventos de acceso.
          </li>
          <li>
            Conexión con Meta: identificador y nombre de la cuenta que autoriza,
            páginas y cuentas profesionales disponibles, permisos concedidos,
            estado y vencimiento de la conexión.
          </li>
          <li>
            Credenciales OAuth: tokens cifrados en reposo, accesibles sólo por
            la API y el proceso de publicación; nunca se envían al navegador ni
            a modelos de inteligencia artificial.
          </li>
          <li>
            Actividad del panel: borradores, revisiones, aprobaciones, órdenes
            de publicación, resultados por destino y auditoría técnica.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Finalidades</h2>
        <p>
          Usamos esa información para autenticar y autorizar operadores,
          descubrir los activos que la cuenta de Meta permite administrar,
          publicar únicamente contenido aprobado, impedir duplicados, resolver
          fallos, revocar accesos y mantener evidencia de seguridad. No vendemos
          datos personales ni los usamos para publicidad comportamental.
        </p>
      </section>

      <section>
        <h2>4. Proveedores y transferencias</h2>
        <p>
          La operación puede requerir servicios de Meta para autorización y
          publicación, infraestructura de alojamiento, almacenamiento de medios
          y proveedores de inteligencia artificial para funciones creativas.
          Cada proveedor recibe sólo lo necesario para su función. Meta recibe
          el contenido y destino que una persona autorizada confirma; los
          proveedores creativos no reciben credenciales de Meta ni identidades
          de operadores. Algunos proveedores pueden procesar información fuera
          de Argentina bajo sus propias condiciones y medidas de seguridad.
        </p>
      </section>

      <section>
        <h2>5. Conservación y seguridad</h2>
        <p>
          Las credenciales se conservan mientras la conexión esté habilitada y
          se eliminan criptográficamente al revocarla. Una solicitud de
          eliminación firmada por Meta también reemplaza los identificadores y
          nombres aportados por Meta por valores internos anónimos. Se conserva
          la evidencia mínima de acciones y publicaciones cuando resulte
          necesaria para seguridad, trazabilidad u obligaciones del negocio; esa
          evidencia no conserva tokens OAuth.
        </p>
        <p>
          Aplicamos cifrado autenticado, mínimo privilegio, aislamiento por
          organización, validación de entradas, sesiones opacas, protección
          CSRF, idempotencia y auditoría de acciones sensibles.
        </p>
      </section>

      <section>
        <h2>6. Cookies</h2>
        <p>
          El panel utiliza una cookie estrictamente necesaria, segura y no
          accesible desde JavaScript para mantener la sesión. No utiliza cookies
          publicitarias ni rastreadores de terceros en estas páginas legales.
        </p>
      </section>

      <section>
        <h2>7. Acceso, corrección y eliminación</h2>
        <p>
          Una persona autorizada puede desconectar Meta desde Configuración. Una
          persona también puede quitar la integración desde Meta, lo que activa
          la desautorización del lado de la plataforma. Las instrucciones y el
          estado de una solicitud están disponibles en la página de{" "}
          <a href="/legal/data-deletion">eliminación de datos</a>.
        </p>
        <p>
          Para consultar, corregir o eliminar información, se puede contactar a
          Aramayo al teléfono publicado del negocio, 3854 403534, o presentarse
          en República de Siria 365 o Rivadavia 673, Frías, Santiago del Estero.
          Antes de atender un pedido podremos verificar la identidad y la
          relación con la cuenta o activo involucrado.
        </p>
      </section>

      <section>
        <h2>8. Cambios</h2>
        <p>
          Si cambia el alcance, los datos tratados o los proveedores, esta
          política se actualizará antes de habilitar el cambio. La fecha visible
          al inicio identifica la versión vigente.
        </p>
      </section>
    </LegalDocument>
  );
}
