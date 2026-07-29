export default function PublicationsLoading() {
  return (
    <main aria-busy="true" className="workspace-shell">
      <section className="workspace-status">
        <p className="workspace-eyebrow">Cargando sesión y publicaciones</p>
        <h1>Mesa de contenido</h1>
        <p>Estamos leyendo el estado actual antes de habilitar acciones.</p>
      </section>
    </main>
  );
}
