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

  /**
   * How many database connections one process may hold open at once.
   *
   * Ten is node-postgres's own default and the right number for the Docker
   * path, where one container serves every request for months. On Vercel it
   * must be 1: a serverless instance handles one request at a time, so a pool
   * of ten there is nine connections held open for nothing — multiplied by
   * however many instances the platform decided to start.
   */
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  /**
   * Whether to encrypt the connection to PostgreSQL, and whether to check who
   * answered.
   *
   * off      Local Docker. The database sits on a private network the outside
   *          world cannot reach, so there is nothing in between to encrypt
   *          against.
   * require  Encrypt, but do not verify the certificate. What a hosted
   *          database such as Supabase accepts out of the box, and honest
   *          about its limit: nobody can read the traffic in transit, but
   *          nothing proves the server on the other end is the one you meant.
   * verify   Encrypt and check the certificate against the machine's trusted
   *          authorities. Stronger, and it fails unless the provider's
   *          certificate authority is one of them.
   */
  DB_SSL: z.enum(["off", "require", "verify"]).default("off"),

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

  /**
   * Whether foreign-currency conversion is switched on. Off by default.
   *
   * Off, there is one currency: the base. An amount is stored exactly as typed
   * and a currency mentioned in a sentence is ignored, so "30 quid" with a euro
   * base records 30 euros. Switching the base then only changes the symbol in
   * front of every number, which makes it completely reversible.
   *
   * On, the whole conversion path above comes back: live rates from the day the
   * money was spent, the business-day fallback, and the fixed table when the
   * service cannot be reached. None of that code was deleted — it is behind this
   * flag, and turning it on is the only step needed.
   */
  FX_CONVERSION: z.enum(["on", "off"]).default("off"),
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
