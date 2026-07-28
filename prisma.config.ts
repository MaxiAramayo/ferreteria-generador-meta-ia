import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "infrastructure/database/prisma/schema.prisma",
  migrations: {
    path: "infrastructure/database/prisma/migrations",
    seed: "node infrastructure/database/dist/seed.js",
  },
  ...(databaseUrl === undefined
    ? {}
    : {
        datasource: {
          url: databaseUrl,
        },
      }),
});
