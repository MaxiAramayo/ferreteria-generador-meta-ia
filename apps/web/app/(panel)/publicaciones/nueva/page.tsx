import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { composerVariantFromSlug } from "../../../../lib/publication-composer-contract.ts";
import { CreatePieceWorkspace } from "../create-piece-workspace";

export const dynamic = "force-dynamic";

export default async function CreatePiecePage({
  searchParams,
}: {
  readonly searchParams: Promise<
    Readonly<{ flujo?: string | readonly string[] }>
  >;
}) {
  const configuration = parseWebPublicEnvironment(process.env);
  const requested = (await searchParams).flujo;
  return (
    <CreatePieceWorkspace
      apiBaseUrl={configuration.apiBaseUrl}
      requestedVariant={composerVariantFromSlug(
        typeof requested === "string" ? requested : undefined,
      )}
    />
  );
}
