import type { CommonConfiguration, RawEnvironment } from "./types.ts";
import {
  failConfiguration,
  parseCommonConfiguration,
  parseHttpUrl,
} from "./validation.ts";

export interface WebPublicConfiguration extends CommonConfiguration {
  readonly apiBaseUrl: string;
}

const allowedPublicVariables = new Set(["NEXT_PUBLIC_API_BASE_URL"]);

function assertPublicContract(rawEnvironment: RawEnvironment): void {
  for (const variable of Object.keys(rawEnvironment)) {
    if (
      variable.startsWith("NEXT_PUBLIC_") &&
      !allowedPublicVariables.has(variable)
    ) {
      failConfiguration("web", variable, "forbidden-public-variable");
    }
  }
}

export function parseWebPublicEnvironment(
  rawEnvironment: RawEnvironment,
): WebPublicConfiguration {
  assertPublicContract(rawEnvironment);
  const commonConfiguration = parseCommonConfiguration(rawEnvironment, "web");

  return Object.freeze({
    ...commonConfiguration,
    apiBaseUrl: parseHttpUrl(
      rawEnvironment,
      "web",
      "NEXT_PUBLIC_API_BASE_URL",
      commonConfiguration.environment,
    ),
  });
}
