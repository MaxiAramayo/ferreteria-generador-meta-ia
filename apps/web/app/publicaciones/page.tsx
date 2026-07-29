import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { PublicationWorkspace } from "./publication-workspace";

export const dynamic = "force-dynamic";

export default function PublicationsPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return <PublicationWorkspace apiBaseUrl={configuration.apiBaseUrl} />;
}
