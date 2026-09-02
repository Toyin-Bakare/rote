import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-5.6-terra"),
  ROTE_TARGET_URL: z.string().url().default("http://localhost:8083/altoromutual/"),
  ROTE_HEADLESS: z.enum(["true", "false"]).default("false"),
  ROTE_POLICY_PATH: z.string().default("policy.json"),
});

export const config = configSchema.parse(process.env);
