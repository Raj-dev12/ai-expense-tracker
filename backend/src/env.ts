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
  // Which AI adapter to use. Defaults to the offline mock so the app runs
  // fully with no API key set anywhere.
  AI_PROVIDER: z.enum(["mock", "claude", "openai"]).default("mock"),

  // Keys are optional, because the app must run without them. An entry left
  // blank in .env arrives as an empty string rather than as nothing at all, so
  // it is turned back into "not set" here — otherwise an empty key would be
  // handed to an SDK and fail confusingly on the first request instead of
  // falling back to the mock.
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined)),

  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5"),
  OPENAI_MODEL: z.string().min(1).default("gpt-5"),

  // How long to wait on a provider before giving up and using the mock.
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  // Exchange rates. Frankfurter serves European Central Bank rates with no key
  // and no account, which is what keeps the "runs with nothing configured"
  // promise true for currency conversion as well as for the AI.
  FX_API_URL: z.string().min(1).default("https://api.frankfurter.app"),
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
