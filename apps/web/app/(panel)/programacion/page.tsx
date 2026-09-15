import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { SchedulingWorkspace } from "./scheduling-workspace";

export const dynamic = "force-dynamic";

export default async function SchedulingPage({
  searchParams,
}: {
  readonly searchParams: Promise<
    Readonly<{ publicacion?: string | readonly string[] }>
  >;
}) {
  const configuration = parseWebPublicEnvironment(process.env);
  const requested = (await searchParams).publicacion;
  return (
    <SchedulingWorkspace
      apiBaseUrl={configuration.apiBaseUrl}
      initialPublicationId={typeof requested === "string" ? requested : null}
    />
  );
}
