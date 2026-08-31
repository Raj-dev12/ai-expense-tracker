import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// The whole repository shares one .env file at the root, so there is only ever
// one place to look for a setting. Under Docker (hour 5) the values arrive as
// real environment variables and there is no file to read, which is why this is
// only attempted when the file actually exists.
const envFile = resolve(process.cwd(), "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Configuration is an input crossing a boundary like any other, so it gets the
// same Zod treatment. Failing loudly at startup beats a confusing crash later.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  ALLOW_SEED: z.enum(["true", "false"]).default("false"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Environment is not usable:\n${problems}\n\nCopy .env.example to .env and fill it in.`);
  process.exit(1);
}

export const env = result.data;
