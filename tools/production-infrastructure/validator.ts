type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} debe ser un objeto.`);
  }
  return value as UnknownRecord;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} debe ser una lista de strings.`);
  }

  const entries: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(`${label} debe ser una lista de strings.`);
    }
    entries.push(entry);
  }
  return entries;
}

function serviceNames(value: unknown): ReadonlySet<string> {
  if (Array.isArray(value)) {
    return new Set(stringArray(value, "services.*.networks"));
  }
  return new Set(Object.keys(record(value, "services.*.networks")));
}

function assertServiceNetwork(
  services: UnknownRecord,
  serviceName: string,
  networkName: string,
): void {
  const service = record(services[serviceName], `services.${serviceName}`);
  if (!serviceNames(service["networks"]).has(networkName)) {
    throw new Error(
      `services.${serviceName} debe pertenecer a la red ${networkName}.`,
    );
  }
}

function assertDependencyCondition(
  services: UnknownRecord,
  serviceName: string,
  dependencyName: string,
  expectedCondition: string,
): void {
  const service = record(services[serviceName], `services.${serviceName}`);
  const dependencies = record(
    service["depends_on"],
    `services.${serviceName}.depends_on`,
  );
  const dependency = record(
    dependencies[dependencyName],
    `services.${serviceName}.depends_on.${dependencyName}`,
  );
  if (dependency["condition"] !== expectedCondition) {
    throw new Error(
      `services.${serviceName} debe esperar ${expectedCondition} de ${dependencyName}.`,
    );
  }
}

export function assertProductionComposeConfiguration(
  configuration: unknown,
): void {
  const root = record(configuration, "compose");
  const services = record(root["services"], "services");
  const expectedServices = [
    "api",
    "caddy",
    "migrate",
    "postgres",
    "redis",
    "web",
    "worker",
  ];

  const actualServices = Object.keys(services).sort();
  if (
    actualServices.length !== expectedServices.length ||
    actualServices.some(
      (serviceName, index) => serviceName !== expectedServices[index],
    )
  ) {
    throw new Error(
      `Servicios inesperados: ${actualServices.join(", ") || "ninguno"}.`,
    );
  }

  const servicesWithPublishedPorts = actualServices.filter((serviceName) => {
    const service = record(services[serviceName], `services.${serviceName}`);
    return Array.isArray(service["ports"]) && service["ports"].length > 0;
  });
  if (
    servicesWithPublishedPorts.length !== 1 ||
    servicesWithPublishedPorts[0] !== "caddy"
  ) {
    throw new Error("Caddy debe ser el único servicio con puertos publicados.");
  }

  const networks = record(root["networks"], "networks");
  const backendNetwork = record(networks["backend"], "networks.backend");
  if (backendNetwork["internal"] !== true) {
    throw new Error("La red backend debe ser interna.");
  }

  for (const serviceName of ["api", "migrate", "postgres", "redis", "worker"]) {
    assertServiceNetwork(services, serviceName, "backend");
  }
  for (const serviceName of ["api", "caddy", "web"]) {
    assertServiceNetwork(services, serviceName, "edge");
  }

  for (const serviceName of ["api", "web", "worker"]) {
    const service = record(services[serviceName], `services.${serviceName}`);
    if (service["read_only"] !== true) {
      throw new Error(`services.${serviceName} debe ser read_only.`);
    }
    const securityOptions = stringArray(
      service["security_opt"],
      `services.${serviceName}.security_opt`,
    );
    if (!securityOptions.includes("no-new-privileges:true")) {
      throw new Error(
        `services.${serviceName} debe bloquear privilegios nuevos.`,
      );
    }
  }

  assertDependencyCondition(
    services,
    "api",
    "migrate",
    "service_completed_successfully",
  );
  assertDependencyCondition(
    services,
    "worker",
    "migrate",
    "service_completed_successfully",
  );
  assertDependencyCondition(services, "caddy", "api", "service_healthy");
  assertDependencyCondition(services, "caddy", "web", "service_healthy");

  const apiEnvironment = record(
    record(services["api"], "services.api")["environment"],
    "services.api.environment",
  );
  if (String(apiEnvironment["TRUST_PROXY_HOPS"]) !== "1") {
    throw new Error("La API debe confiar exactamente en el proxy Caddy.");
  }

  const workerEnvironment = record(
    record(services["worker"], "services.worker")["environment"],
    "services.worker.environment",
  );
  const chromiumPath = workerEnvironment["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
  if (
    typeof chromiumPath !== "string" ||
    !chromiumPath.startsWith("/ms-playwright/")
  ) {
    throw new Error(
      "El worker debe declarar el Chromium fijado por la imagen Playwright.",
    );
  }

  for (const serviceName of actualServices) {
    const image = record(services[serviceName], `services.${serviceName}`)[
      "image"
    ];
    if (typeof image !== "string" || image.endsWith(":latest")) {
      throw new Error(
        `services.${serviceName} debe usar una imagen explícita y no latest.`,
      );
    }
  }
}
