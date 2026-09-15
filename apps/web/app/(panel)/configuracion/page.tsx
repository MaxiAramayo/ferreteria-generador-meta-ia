import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { OrganizationConfigurationPanel } from "./organization-configuration-panel";

export const dynamic = "force-dynamic";

export default function ConfigurationPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return (
    <OrganizationConfigurationPanel apiBaseUrl={configuration.apiBaseUrl} />
  );
}
