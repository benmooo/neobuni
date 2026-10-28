/**
 * Manual smoke probe for the OpenCode provider.
 *
 * It exercises the same code path Study uses for lesson enrichment and check
 * grading: the raw OpenAI-compatible client with the OpenCode headers, not the
 * TanStack chat adapter, so a green run here means the smoke run's AI steps will
 * not fail on provider wiring.
 *
 * Usage:
 *   OPENCODE_API_KEY=sk-... bun run apps/server/scripts/opencode-smoke.ts
 *   OPENCODE_API_KEY=sk-... OPENCODE_MODEL=deepseek-v4.1-flash \
 *     bun run apps/server/scripts/opencode-smoke.ts
 */

import { OPENCODE_DEFAULT_BASE_URL } from "@neobuni/contracts";

import { createChatCompletion } from "../src/providers/openai-compatible-client";
import {
  buildOpenCodeHeaders,
  listOpenCodeModels,
} from "../src/providers/opencode";

const apiKey = process.env.OPENCODE_API_KEY?.trim() ?? "";
const model = process.env.OPENCODE_MODEL?.trim() || "glm-5.3-flash";

if (apiKey.length === 0) {
  throw new Error("OPENCODE_API_KEY is required (OpenCode Go or Console key).");
}

const headers = buildOpenCodeHeaders({ sessionId: "smoke:opencode" });

const models = await listOpenCodeModels({});
console.log(`catalogue: ${models.length} models`);
if (!models.includes(model)) {
  console.warn(
    `warning: "${model}" is not in the catalogue; check the id before saving it in Settings.`
  );
}

const chatStartedAt = Date.now();
const chatText = await createChatCompletion(
  {
    apiKey,
    baseUrl: OPENCODE_DEFAULT_BASE_URL,
    headers,
    model,
  },
  [{ role: "user", content: "Reply with exactly: ok" }],
  { maxTokens: 16, temperature: 0 }
);
console.log(
  `chat: ${Date.now() - chatStartedAt}ms → ${JSON.stringify(chatText.trim())}`
);

const jsonStartedAt = Date.now();
const jsonText = await createChatCompletion(
  {
    apiKey,
    baseUrl: OPENCODE_DEFAULT_BASE_URL,
    headers,
    model,
  },
  [
    {
      role: "system",
      content:
        'Return JSON only, no markdown fences: {"ok":true,"note":"pong"}',
    },
    { role: "user", content: "ping" },
  ],
  { maxTokens: 64, temperature: 0 }
);

let parsedJson: unknown = null;
try {
  parsedJson = JSON.parse(jsonText.trim());
} catch {
  parsedJson = null;
}

if (parsedJson === null) {
  throw new Error(`model did not return parseable JSON: ${jsonText}`);
}

console.log(
  `json: ${Date.now() - jsonStartedAt}ms → ${JSON.stringify(parsedJson)}`
);
console.log("opencode provider probe passed");
