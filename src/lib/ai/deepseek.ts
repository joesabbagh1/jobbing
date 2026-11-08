import OpenAI from "openai";
import type { z } from "zod";

// DeepSeek's API is OpenAI-compatible. Called server-side only so the key never reaches the browser.
let client: OpenAI | undefined;

export function isAiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

function getClient(): OpenAI {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not set in .env.local");
  // The SDK's default timeout is 10 minutes per attempt, so one stuck call could stall a whole scoring run.
  // A job that times out keeps no score and is retried on the next run.
  client ??= new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
    timeout: Number(process.env.DEEPSEEK_TIMEOUT_SECONDS || 90) * 1000,
    maxRetries: 2,
  });
  return client;
}

/** Sends a prompt in JSON mode and validates the reply against `schema`. */
export async function completeJson<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const res = await getClient().chat.completions.create({
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    response_format: { type: "json_object" },
    temperature: opts.temperature ?? 0.2,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  const content = res.choices[0]?.message.content;
  if (!content) throw new Error("DeepSeek returned an empty response");
  const parsed = opts.schema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`DeepSeek reply didn't match the expected shape: ${issue?.path.join(".")} ${issue?.message}`);
  }
  return parsed.data;
}
