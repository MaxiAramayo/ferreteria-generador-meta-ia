import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { OperationalAlertWorkspace } from "./operational-alert-workspace";

export const dynamic = "force-dynamic";

export default function OperationsPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return <OperationalAlertWorkspace apiBaseUrl={configuration.apiBaseUrl} />;
}
