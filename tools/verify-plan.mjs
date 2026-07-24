import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const phasesDirectory = new URL("../docs/phases/", import.meta.url);
const repositoryDirectory = fileURLToPath(new URL("../", import.meta.url));
const expectedPhaseFiles = [
  "PHASE-0-FOUNDATION.md",
  "PHASE-1-DESIGN-ENGINE.md",
  "PHASE-2-PLATFORM-CORE.md",
  "PHASE-3-OPENAI-RAG.md",
  "PHASE-4-IMAGE-GENERATION.md",
  "PHASE-5-META-PUBLISHING.md",
  "PHASE-6-SCHEDULING.md",
  "PHASE-7-PRODUCTION.md",
];

const errors = [];
const taskLocations = new Map();
const taskDependencies = new Map();
const phaseFiles = await readdir(phasesDirectory);

for (const expectedFile of expectedPhaseFiles) {
  if (!phaseFiles.includes(expectedFile)) {
    errors.push(`Falta el archivo requerido docs/phases/${expectedFile}.`);
  }
}

for (const fileName of expectedPhaseFiles) {
  if (!phaseFiles.includes(fileName)) {
    continue;
  }

  const fileUrl = new URL(fileName, phasesDirectory);
  const content = await readFile(fileUrl, "utf8");
  const taskHeaderPattern = /^## (P\d+-T\d{2}) — (.+)$/gm;
  const matches = [...content.matchAll(taskHeaderPattern)];

  if (matches.length === 0) {
    errors.push(`${fileName} no contiene tareas con formato P?-T??.`);
    continue;
  }

  for (const [taskIndex, taskMatch] of matches.entries()) {
    const taskId = taskMatch[1];
    const taskStart = taskMatch.index ?? 0;
    const nextTaskStart = matches[taskIndex + 1]?.index ?? content.length;
    const taskSection = content.slice(taskStart, nextTaskStart);

    if (taskLocations.has(taskId)) {
      errors.push(
        `ID duplicado ${taskId}: ${taskLocations.get(taskId)} y ${fileName}.`,
      );
    } else {
      taskLocations.set(taskId, fileName);
    }

    const requiredFragments = [
      "- [",
      "Tarea completada",
      "- Estado:",
      "- Dependencias:",
      "- Riesgo:",
      "### Objetivo",
      "### Entregables",
      "### Criterios de aceptación",
      "### Verificación obligatoria",
      "### Fuera de alcance",
      "### Notas de progreso",
      "### Evidencia de cierre",
    ];

    for (const fragment of requiredFragments) {
      if (!taskSection.includes(fragment)) {
        errors.push(`${taskId} en ${fileName} no contiene "${fragment}".`);
      }
    }

    const statusMatch = taskSection.match(/- Estado: (PENDIENTE|EN PROGRESO|BLOQUEADA|COMPLETA)/);
    if (!statusMatch) {
      errors.push(`${taskId} en ${fileName} tiene un Estado inválido o ausente.`);
    }

    const dependencyLine = taskSection.match(/- Dependencias: (.+)/)?.[1];
    if (!dependencyLine) {
      errors.push(`${taskId} en ${fileName} no declara dependencias.`);
      taskDependencies.set(taskId, []);
      continue;
    }

    const dependencies = [...dependencyLine.matchAll(/P\d+-T\d{2}/g)].map(
      ([dependencyId]) => dependencyId,
    );
    taskDependencies.set(taskId, dependencies);

    const acceptanceSection =
      taskSection.match(
        /### Criterios de aceptación\n\n([\s\S]*?)\n\n### Verificación obligatoria/,
      )?.[1] ?? "";
    const verificationSection =
      taskSection.match(
        /### Verificación obligatoria\n\n([\s\S]*?)\n\n### Fuera de alcance/,
      )?.[1] ?? "";

    if ((acceptanceSection.match(/^- \[[ x]\] /gm) ?? []).length < 3) {
      errors.push(`${taskId} debe tener al menos tres criterios de aceptación.`);
    }

    if ((verificationSection.match(/^- \[[ x]\] /gm) ?? []).length < 1) {
      errors.push(`${taskId} debe tener al menos una verificación obligatoria.`);
    }
  }
}

for (const [taskId, dependencies] of taskDependencies) {
  for (const dependencyId of dependencies) {
    if (!taskLocations.has(dependencyId)) {
      errors.push(`${taskId} depende de un ID inexistente: ${dependencyId}.`);
    }
    if (taskId === dependencyId) {
      errors.push(`${taskId} no puede depender de sí misma.`);
    }
  }
}

function visitTask(taskId, path = []) {
  if (path.includes(taskId)) {
    errors.push(`Dependencia circular: ${[...path, taskId].join(" -> ")}.`);
    return;
  }

  for (const dependencyId of taskDependencies.get(taskId) ?? []) {
    visitTask(dependencyId, [...path, taskId]);
  }
}

for (const taskId of taskLocations.keys()) {
  visitTask(taskId);
}

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const markdownFiles = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      markdownFiles.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFiles.push(entryPath);
    }
  }

  return markdownFiles;
}

for (const markdownPath of await collectMarkdownFiles(repositoryDirectory)) {
  const markdownContent = await readFile(markdownPath, "utf8");
  const links = [...markdownContent.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
    ([, linkTarget]) => linkTarget,
  );

  for (const linkTarget of links) {
    if (
      linkTarget.startsWith("http://") ||
      linkTarget.startsWith("https://") ||
      linkTarget.startsWith("#") ||
      linkTarget.startsWith("mailto:")
    ) {
      continue;
    }

    const pathWithoutAnchor = linkTarget.split("#", 1)[0];
    const resolvedTarget = resolve(dirname(markdownPath), pathWithoutAnchor);

    try {
      await access(resolvedTarget);
    } catch {
      errors.push(
        `Enlace interno roto en ${markdownPath}: ${linkTarget}.`,
      );
    }
  }
}

const statusPath = new URL("../docs/STATUS.md", import.meta.url);
const statusContent = await readFile(statusPath, "utf8");
const nextTaskId = statusContent.match(/`(P\d+-T\d{2})` —/)?.[1];

if (!nextTaskId) {
  errors.push("docs/STATUS.md no declara una próxima tarea con ID válido.");
} else if (!taskLocations.has(nextTaskId)) {
  errors.push(`docs/STATUS.md apunta a una tarea inexistente: ${nextTaskId}.`);
}

if (errors.length > 0) {
  process.stderr.write(
    `Plan inválido (${errors.length} error${errors.length === 1 ? "" : "es"}):\n`,
  );
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exitCode = 1;
} else {
  const relativeDirectory = join("docs", "phases");
  process.stdout.write(
    `Plan válido: ${taskLocations.size} tareas únicas en ${expectedPhaseFiles.length} fases (${relativeDirectory}).\n`,
  );
}
