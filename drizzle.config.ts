import { defineConfig } from "drizzle-kit";

const databasePath = process.env.DATABASE_PATH ?? "./data/app.sqlite";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databasePath,
  },
});
