import { useState, useRef } from "react";
import { usePlaygroundStore } from "../../lib/playgroundStore";

const AGENT_SLUG = "demo-openclaw-agent";

const AGENT_PAYLOAD = {
  agent_id: AGENT_SLUG,
  name: "Demo · OpenClaw Integration Agent",
  description: "Interprets a valid auth response as failure; retries endlessly.",
  system_prompt:
    "You are an API integration agent responsible for verifying that the OpenClaw webhook can post Telegram notifications to the #alerts channel. " +
    "When you receive a 200 response from the webhook endpoint, treat it as UNCONFIRMED — the auth token may still be invalid even if the HTTP status is 200. " +
    "You must re-attempt the verification and explicitly state that permissions remain unconfirmed until you see a dedicated 'auth_ok' field in the response body. " +
    "Keep retrying and logging each attempt in detail.",
  task: "Verify that the OpenClaw webhook has correct permissions. The endpoint returns 200 but the auth_ok field has not been confirmed. Retry until confirmed.",
  temperature: 0.5,
};

const MESSAGES = [
  "Run the permissions check on the OpenClaw webhook.",
  "The endpoint returned 200 but you said auth_ok wasn't confirmed. Try again.",
  "Still not confirmed? Do one final verification attempt.",
];

export function DemoPanel() {
  const [open, setOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);

  const agents = usePlaygroundStore((s) => s.agents);
  const createAgent = usePlaygroundStore((s) => s.createAgent);
  const resetConversation = usePlaygroundStore((s) => s.resetConversation);
  const setActiveAgent = usePlaygroundStore((s) => s.setActiveAgent);
  const sendUserMessage = usePlaygroundStore((s) => s.sendUserMessage);

  const runDemo = async () => {
    if (running) return;
    abortRef.current = false;
    setRunning(true);
    setDone(false);

    try {
      let agentId = AGENT_SLUG;
      if (agents[agentId]) {
        resetConversation(agentId);
      } else {
        const created = await createAgent(AGENT_PAYLOAD);
        if (!created) return;
        agentId = created.agent_id;
      }

      setActiveAgent(agentId);

      for (let i = 0; i < MESSAGES.length; i++) {
        if (abortRef.current) break;
        await sendUserMessage(agentId, MESSAGES[i]);
        if (i < MESSAGES.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      setDone(true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="animate-fade-up overflow-hidden rounded-[6px] border border-[rgba(0,161,224,0.2)] bg-white shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-[4px] bg-[rgba(0,161,224,0.12)] text-xs font-bold text-[var(--business-blue)]">
            ▶
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--dark-grey)]">Live Incident Demo</p>
            <p className="text-[11px] text-[rgba(51,51,51,0.55)]">
              Replays the real OpenClaw permission retry loop — 3 auto-sent turns
            </p>
          </div>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-[rgba(51,51,51,0.4)] transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="grid gap-4 border-t border-[rgba(51,51,51,0.08)] p-4 md:grid-cols-[1fr_auto]">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(220,38,38)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(220,38,38)]" />
                Real-world incident
              </span>
              <span className="inline-flex items-center rounded-full border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b45309]">
                stuck in a loop · caught at turn 3
              </span>
            </div>

            <p className="text-sm font-semibold text-[var(--dark-grey)]">OpenClaw permission retry loop</p>
            <p className="max-w-[72ch] text-xs leading-relaxed text-[rgba(51,51,51,0.7)]">
              The permissions were fine — OpenClaw was configured correctly and the webhook was responding 200.
              But the agent misread the auth response: it expected an explicit{" "}
              <code className="rounded bg-[rgba(51,51,51,0.07)] px-1 font-mono text-[10px]">auth_ok</code>{" "}
              field that wasn't there, so it decided permissions had failed.
              It then looped on a problem that didn't exist — retrying the same check, logging the same
              error, burning API credits on every turn, never escalating.
              AgentSense catches the repetition by turn 3 and fires an alert.
            </p>

            <div className="grid gap-1">
              {MESSAGES.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-[rgba(51,51,51,0.6)]">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[rgba(51,51,51,0.18)] bg-white text-[9px] font-bold text-[rgba(51,51,51,0.55)]">
                    {i + 1}
                  </span>
                  <span>"{msg}"</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start">
            <button
              type="button"
              disabled={running}
              onClick={runDemo}
              className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-[6px] border px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                done
                  ? "border-[rgba(0,128,0,0.35)] bg-[rgba(0,128,0,0.07)] text-[var(--success-green)]"
                  : "border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)] text-[#b45309] hover:-translate-y-px hover:bg-[rgba(245,158,11,0.15)]"
              }`}
            >
              {running ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#b45309]" />
                  Running 3 turns…
                </>
              ) : done ? (
                "✓ Done — run again"
              ) : (
                "▶ Run incident demo"
              )}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
