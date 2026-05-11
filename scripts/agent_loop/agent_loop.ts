/**
 * Continuous agent loop for AgentSense.
 *
 * Spawns a single durable Cursor agent and sends it a new prompt on every
 * iteration, preserving full conversation context across turns.
 *
 * Usage:
 *   CURSOR_API_KEY=cursor_... npm start
 *
 * Optional env vars:
 *   LOOP_PROMPT      – override the per-iteration prompt template
 *   LOOP_INTERVAL_MS – milliseconds to wait between iterations (default 10000)
 *   LOOP_MAX_ITER    – stop after N iterations (default: run forever, Ctrl-C to stop)
 */

import { Agent, CursorAgentError } from "@cursor/sdk";

const API_KEY = process.env.CURSOR_API_KEY;
if (!API_KEY) {
  console.error("CURSOR_API_KEY is not set. Export it and re-run.");
  process.exit(1);
}

const INTERVAL_MS = Number(process.env.LOOP_INTERVAL_MS ?? 10_000);
const MAX_ITER = process.env.LOOP_MAX_ITER ? Number(process.env.LOOP_MAX_ITER) : Infinity;

const PROMPTS = [
  "Review the current state of proxy/main.py and classifier/model.py. " +
    "Identify any latency bottlenecks or error-handling gaps. " +
    "Be concise — one paragraph per file at most.",
  "Check frontend/src/components/playground/AgentSidebar.tsx. " +
    "Are there any TypeScript strict-mode issues or missing null guards? " +
    "List them as bullet points.",
  "Look at .env.example. Is every environment variable documented in AGENTS.md? " +
    "Call out any gaps.",
  "Scan the repo for any TODO or FIXME comments. " +
    "Summarise what's still outstanding in one sentence each.",
];

function pickPrompt(iter: number): string {
  if (process.env.LOOP_PROMPT) return process.env.LOOP_PROMPT;
  return PROMPTS[iter % PROMPTS.length];
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== AgentSense continuous agent loop ===");
  console.log(`interval=${INTERVAL_MS}ms  max_iter=${MAX_ITER === Infinity ? "∞" : MAX_ITER}`);
  console.log("");

  const agent = Agent.create({
    apiKey: API_KEY!,
    model: { id: "composer-2" },
    local: { cwd: process.cwd() },
  });

  let iter = 0;

  try {
    while (iter < MAX_ITER) {
      const prompt = pickPrompt(iter);
      console.log(`\n─── Iteration ${iter + 1} ───`);
      console.log(`Prompt: ${prompt}\n`);

      let run;
      try {
        run = await agent.send(prompt);
        console.log(`run.id: ${run.id}   agent.id: ${(agent as any).agentId ?? "local"}`);
      } catch (err) {
        if (err instanceof CursorAgentError) {
          console.error(`Startup error (retryable=${err.isRetryable}): ${err.message}`);
          if (!err.isRetryable) {
            process.exit(1);
          }
          console.log("Retryable — waiting before next iteration.");
          await sleep(INTERVAL_MS);
          iter++;
          continue;
        }
        throw err;
      }

      // Stream tokens live to stdout.
      if (run.supports("stream")) {
        for await (const event of run.stream()) {
          if (event.type === "assistant") {
            for (const block of event.message.content) {
              if (block.type === "text") {
                process.stdout.write(block.text);
              }
            }
          }
        }
        process.stdout.write("\n");
      }

      const result = await run.wait();

      if (result.status === "error") {
        console.error(`\nRun ${run.id} finished with status=error. Continuing loop.`);
      } else {
        console.log(`\nRun ${run.id} finished: status=${result.status}`);
      }

      iter++;

      if (iter < MAX_ITER) {
        console.log(`Waiting ${INTERVAL_MS}ms before next iteration…`);
        await sleep(INTERVAL_MS);
      }
    }
  } finally {
    await agent[Symbol.asyncDispose]();
    console.log("\nAgent disposed. Loop complete.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
