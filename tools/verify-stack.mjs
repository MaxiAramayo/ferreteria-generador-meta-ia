import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import typescript from "typescript";

const repositoryUrl = new URL("../", import.meta.url);
const expectedVersions = Object.freeze({
  node: "24.18.0",
  pnpm: "11.17.0",
  next: "16.2.11",
  react: "19.2.8",
  "react-dom": "19.2.8",
  "@nestjs/common": "11.1.28",
  "@nestjs/core": "11.1.28",
  "@nestjs/platform-express": "11.1.28",
  "@types/node": "24.13.3",
  "@types/pg": "8.20.0",
  typescript: "5.9.3",
  prisma: "7.9.0",
  "@prisma/client": "7.9.0",
  "@prisma/adapter-pg": "7.9.0",
  pg: "8.22.0",
  redis: "6.1.0",
  "reflect-metadata": "0.2.2",
  rxjs: "7.8.2",
});

const errors = [];
const packageJson = JSON.parse(
  await readFile(new URL("package.json", repositoryUrl), "utf8"),
);
const nodeVersionFile = (
  await readFile(new URL(".node-version", repositoryUrl), "utf8")
).trim();
const workspaceContent = await readFile(
  new URL("pnpm-workspace.yaml", repositoryUrl),
  "utf8",
);

function recordMismatch(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: se esperaba ${expected} y se encontró ${actual ?? "ausente"}.`);
  }
}

function readCatalogVersions(content) {
  const catalogStart = content.indexOf("\ncatalog:\n");
  if (catalogStart === -1) {
    return new Map();
  }

  const catalogLines = content.slice(catalogStart + 10).split("\n");
  const versions = new Map();

  for (const line of catalogLines) {
    if (line.length > 0 && !line.startsWith("  ")) {
      break;
    }

    const entryMatch = line.match(/^  "?([^"]+?)"?: ([^\s]+)$/);
    if (entryMatch) {
      versions.set(entryMatch[1], entryMatch[2]);
    }
  }

  return versions;
}

function detectPnpmVersion() {
  const userAgentMatch = process.env.npm_config_user_agent?.match(
    /(?:^|\s)pnpm\/(\d+\.\d+\.\d+)/,
  );
  if (userAgentMatch) {
    return userAgentMatch[1];
  }

  const result = spawnSync("pnpm", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return result.status === 0 ? result.stdout.trim() : undefined;
}

const catalogVersions = readCatalogVersions(workspaceContent);

recordMismatch("packageManager", packageJson.packageManager, `pnpm@${expectedVersions.pnpm}`);
recordMismatch("engines.node", packageJson.engines?.node, expectedVersions.node);
recordMismatch("engines.pnpm", packageJson.engines?.pnpm, expectedVersions.pnpm);
recordMismatch(
  "devEngines.runtime.version",
  packageJson.devEngines?.runtime?.version,
  expectedVersions.node,
);
recordMismatch(".node-version", nodeVersionFile, expectedVersions.node);
recordMismatch(
  "devDependencies.typescript",
  packageJson.devDependencies?.typescript,
  "catalog:",
);

for (const [packageName, expectedVersion] of Object.entries(expectedVersions)) {
  if (packageName === "node" || packageName === "pnpm") {
    continue;
  }
  recordMismatch(
    `catalog.${packageName}`,
    catalogVersions.get(packageName),
    expectedVersion,
  );
}

const actualNodeVersion = process.versions.node;
const actualPnpmVersion = detectPnpmVersion();
recordMismatch("runtime Node.js", actualNodeVersion, expectedVersions.node);
recordMismatch("runtime pnpm", actualPnpmVersion, expectedVersions.pnpm);
recordMismatch("runtime TypeScript", typescript.version, expectedVersions.typescript);

const rows = [
  ["Node.js", expectedVersions.node, actualNodeVersion],
  ["pnpm", expectedVersions.pnpm, actualPnpmVersion ?? "no detectado"],
  ["Next.js", expectedVersions.next, "catálogo"],
  ["React", expectedVersions.react, "catálogo"],
  ["NestJS", expectedVersions["@nestjs/core"], "catálogo"],
  ["TypeScript", expectedVersions.typescript, typescript.version],
  ["Prisma ORM", expectedVersions.prisma, "catálogo"],
];

process.stdout.write("Stack fijado:\n");
for (const [name, expected, observed] of rows) {
  process.stdout.write(`- ${name}: ${expected} (${observed})\n`);
}

if (errors.length > 0) {
  process.stderr.write(`Validación fallida (${errors.length}):\n`);
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Versiones y runtimes validados.\n");
}
