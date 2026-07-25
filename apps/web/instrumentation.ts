/**
 * Validación de configuración antes de aceptar tráfico.
 *
 * Next.js ejecuta `register` una vez por instancia del servidor. Si el contrato
 * público es inválido, el error corta el arranque en lugar de renderizar una
 * pantalla con datos incompletos.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { parseWebPublicEnvironment } = await import(
    "@aramayo/configuration/web"
  );

  parseWebPublicEnvironment(process.env);
}
