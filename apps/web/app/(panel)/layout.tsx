import { parseWebPublicEnvironment } from "@aramayo/configuration/web";
import type { ReactNode } from "react";

import { PanelShell } from "./panel-shell";

export const dynamic = "force-dynamic";

/**
 * Todo lo que requiere sesión comparte esta barra. Login, documentos legales y
 * el catálogo de diseño quedan afuera del grupo y no consultan la sesión.
 */
export default function PanelLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const configuration = parseWebPublicEnvironment(process.env);
  return (
    <PanelShell apiBaseUrl={configuration.apiBaseUrl}>{children}</PanelShell>
  );
}
