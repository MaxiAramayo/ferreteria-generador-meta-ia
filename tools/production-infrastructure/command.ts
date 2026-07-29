export const productionComposeProjectName =
  "aramayo-content-production-validation";

export type ProductionInfrastructureCommand =
  "build" | "caddy" | "config" | "smoke" | "verify";

const supportedCommands: readonly ProductionInfrastructureCommand[] = [
  "build",
  "caddy",
  "config",
  "smoke",
  "verify",
];

export function parseProductionInfrastructureCommand(
  commandName: string | undefined,
): ProductionInfrastructureCommand {
  const command = supportedCommands.find(
    (supportedCommand) => supportedCommand === commandName,
  );
  if (command === undefined) {
    throw new Error(
      `Comando inválido. Usá uno de: ${supportedCommands.join(", ")}.`,
    );
  }
  return command;
}

export function buildProductionComposeArguments(
  environmentFilePath: string,
  composeFilePaths: readonly string[],
  composeArguments: readonly string[],
): string[] {
  return [
    "compose",
    "--project-name",
    productionComposeProjectName,
    "--env-file",
    environmentFilePath,
    ...composeFilePaths.flatMap((composeFilePath) => [
      "--file",
      composeFilePath,
    ]),
    ...composeArguments,
  ];
}
