export const localComposeProjectName = "aramayo-content-platform-local";
export const cleanupConfirmationFlag = "--confirm";

export type InfrastructureCommand =
  "clean" | "config" | "down" | "health" | "restart" | "up";

const supportedCommands: readonly InfrastructureCommand[] = [
  "clean",
  "config",
  "down",
  "health",
  "restart",
  "up",
];

export function parseInfrastructureCommand(
  commandName: string | undefined,
): InfrastructureCommand {
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

export function assertCleanupConfirmation(
  argumentsAfterCommand: readonly string[],
): void {
  const [flag, projectName, ...unexpectedArguments] = argumentsAfterCommand;
  if (
    flag !== cleanupConfirmationFlag ||
    projectName !== localComposeProjectName ||
    unexpectedArguments.length > 0
  ) {
    throw new Error(
      `La limpieza requiere: ${cleanupConfirmationFlag} ${localComposeProjectName}`,
    );
  }
}

export function buildComposeArguments(
  environmentFilePath: string,
  composeFilePath: string,
  composeArguments: readonly string[],
): string[] {
  return [
    "compose",
    "--project-name",
    localComposeProjectName,
    "--env-file",
    environmentFilePath,
    "--file",
    composeFilePath,
    ...composeArguments,
  ];
}
