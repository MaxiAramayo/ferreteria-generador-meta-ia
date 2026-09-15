import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { SchedulingWorkspace } from "./scheduling-workspace";

export const dynamic = "force-dynamic";

export default function SchedulingPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return <SchedulingWorkspace apiBaseUrl={configuration.apiBaseUrl} />;
}
