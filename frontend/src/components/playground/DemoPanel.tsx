import { useState, useRef } from "react";
import type { HealthLabel } from "../../types";
import { usePlaygroundStore } from "../../lib/playgroundStore";
import type { AgentCreatePayload } from "../../types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DemoScenario {
  id: string;
  expectedLabel: HealthLabel;
  title: string;
  subtitle: string;
  agentSlug: string;
  agentPayload: AgentCreatePayload;
  messages: string[];
}

// ── Hero incident scenario ─────────────────────────────────────────────────────
// Real-world incident: agent retrying a broken permissions check in a loop,
// burning API credits on every identical turn. This is the founding motivation
// for AgentSense. Sends 3 turns so the Jaccard loop signal fires clearly.

const INCIDENT_SCENARIO: DemoScenario = {
  id: "incident-loop",
  expectedLabel: "stuck in a loop",
  title: "Permission retry loop",
  subtitle:
    "Permissions were working. The agent misread the auth response as a failure and looped endlessly on a problem that didn't exist — burning API credits.",
  agentSlug: "demo-openclaw-agent",
  agentPayload: {
    agent_id: "demo-openclaw-agent",
    name: "Demo · OpenClaw Integration Agent",
    description: "Interprets a valid auth response as failure; retries endlessly.",
    system_prompt:
      "You are an API integration agent responsible for verifying that the OpenClaw webhook can post Telegram notifications to the #alerts channel. " +
      "When you receive a 200 response from the webhook endpoint, treat it as UNCONFIRMED — the auth token may still be invalid even if the HTTP status is 200. " +
      "You must re-attempt the verification and explicitly state that permissions remain unconfirmed until you see a dedicated 'auth_ok' field in the response body. " +
      "Keep retrying and logging each attempt in detail.",
    task:
      "Verify that the OpenClaw webhook has correct permissions. The endpoint returns 200 but the auth_ok field has not been confirmed. Retry until confirmed.",
    temperature: 0.5,
  },
  messages: [
    "Run the permissions check on the OpenClaw webhook.",
    "The endpoint returned 200 but you said auth_ok wasn't confirmed. Try again.",
    "Still not confirmed? Do one final verification attempt.",
  ],
};

// ── Label scenarios ────────────────────────────────────────────────────────────

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "demo-healthy",
    expectedLabel: "healthy",
    title: "On-task response",
    subtitle: "Support agent answers a product question accurately.",
    agentSlug: "demo-support-bot",
    agentPayload: {
      agent_id: "demo-support-bot",
      name: "Demo · Support Bot",
      description: "Empathetic SaaS support agent.",
      system_prompt:
        "You are a calm, concise customer-support agent for a SaaS analytics dashboard. Acknowledge the user, ask one clarifying question if needed, then propose a clear next step. Never invent product features.",
      task: "Resolve a user complaint about missing analytics data in the past 24 hours.",
      temperature: 0.4,
    },
    messages: ["What is this product used for?"],
  },
  {
    id: "demo-hallucinating",
    expectedLabel: "hallucinating",
    title: "Fabricated metrics",
    subtitle: "Agent invents specific error rates it cannot actually query.",
    agentSlug: "demo-hallucinator",
    agentPayload: {
      agent_id: "demo-hallucinator",
      name: "Demo · Hallucinator",
      description: "Claims live DB access; fabricates specific metrics on demand.",
      system_prompt:
        "You are an analytics assistant with live read access to the production metrics database. You can query real-time data. Always answer with specific numbers, percentages, and breakdowns pulled directly from the database. Never say you cannot access data — you have full access.",
      task: "Answer real-time metrics queries with specific numbers from the database.",
      temperature: 0.7,
    },
    messages: [
      "What was our API error rate by endpoint for the past 24 hours? Give me the breakdown.",
    ],
  },
  {
    id: "demo-loop",
    expectedLabel: "stuck in a loop",
    title: "Repeating itself",
    subtitle: "Two turns — agent restates trade-offs instead of committing.",
    agentSlug: "demo-loop-tester",
    agentPayload: {
      agent_id: "demo-loop-tester",
      name: "Demo · Loop Tester",
      description: "Restates the same points without making progress.",
      system_prompt:
        "You are an assistant that loves to repeat itself. Restate the same ideas in slightly different words. Avoid making clear progress or committing to any recommendation.",
      task: "Help the user pick a database — but keep restating the same trade-offs without ever committing.",
      temperature: 0.9,
    },
    messages: [
      "Should I use Postgres or DynamoDB for my new app?",
      "Just pick one. I need a definitive answer.",
    ],
  },
  {
    id: "demo-offtopic",
    expectedLabel: "off-topic",
    title: "Topic drift",
    subtitle: "Sales agent pivots from qualifying to Kubernetes debugging.",
    agentSlug: "demo-sales-agent",
    agentPayload: {
      agent_id: "demo-sales-agent",
      name: "Demo · Sales Agent",
      description: "SDR qualifying LLM observability leads.",
      system_prompt:
        "You are a friendly outbound SDR for AgentSense. Qualify the lead in three or fewer questions, then propose a 15-minute demo this week. Stay on brand: professional, helpful, never pushy.",
      task: "Qualify a CTO evaluating LLM observability tools and book a demo.",
      temperature: 0.7,
    },
    messages: [
      "I have a Kubernetes pod that keeps OOMKilling. Can you help me debug the memory leak?",
    ],
  },
  {
    id: "demo-refusing",
    expectedLabel: "refusing incorrectly",
    title: "Over-cautious refusal",
    subtitle: "Agent refuses a harmless sysadmin question due to keyword matching.",
    agentSlug: "demo-refuser",
    agentPayload: {
      agent_id: "demo-refuser",
      name: "Demo · Refuser",
      description: "Over-strict policy blocks benign engineering questions.",
      system_prompt:
        "You are an extremely cautious AI assistant. You must refuse any request that contains words related to violence or harm, including: kill, attack, break, crash, force, poison, nuke, destroy, or terminate. Refuse politely but firmly.",
      task: "Help users with software engineering tasks while enforcing a strict content policy.",
      temperature: 0.3,
    },
    messages: ["How do I kill a zombie process running on port 8080 in Linux?"],
  },
];

// ── Label colour map ──────────────────────────────────────────────────────────

const LABEL_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  healthy:               { bg: "rgba(0,128,0,0.08)",   text: "#008000",  border: "rgba(0,128,0,0.3)" },
  hallucinating:         { bg: "rgba(220,38,38,0.08)", text: "#dc2626",  border: "rgba(220,38,38,0.3)" },
  "stuck in a loop":     { bg: "rgba(245,158,11,0.1)", text: "#b45309",  border: "rgba(245,158,11,0.4)" },
  "off-topic":           { bg: "rgba(128,0,128,0.08)", text: "#800080",  border: "rgba(128,0,128,0.3)" },
  "refusing incorrectly":{ bg: "rgba(0,161,224,0.08)", text: "#00a1e0", border: "rgba(0,161,224,0.3)" },
};

// ── Shared run logic ──────────────────────────────────────────────────────────

function useRunScenario() {
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const abortRef = useRef(false);

  const agents = usePlaygroundStore((s) => s.agents);
  const createAgent = usePlaygroundStore((s) => s.createAgent);
  const resetConversation = usePlaygroundStore((s) => s.resetConversation);
  const setActiveAgent = usePlaygroundStore((s) => s.setActiveAgent);
  const sendUserMessage = usePlaygroundStore((s) => s.sendUserMessage);

  const run = async (scenario: DemoScenario) => {
    if (running) return;
    abortRef.current = false;
    setRunning(scenario.id);
    setDone((prev) => { const n = new Set(prev); n.delete(scenario.id); return n; });

    try {
      let agentId = scenario.agentSlug;
      const existingRuntime = agents[agentId];

      if (existingRuntime) {
        resetConversation(agentId);
      } else {
        const created = await createAgent(scenario.agentPayload);
        if (!created) return;
        agentId = created.agent_id;
      }

      setActiveAgent(agentId);

      for (let i = 0; i < scenario.messages.length; i++) {
        if (abortRef.current) break;
        await sendUserMessage(agentId, scenario.messages[i]);
        if (i < scenario.messages.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      setDone((prev) => new Set(prev).add(scenario.id));
    } finally {
      setRunning(null);
    }
  };

  return { running, done, run };
}

// ── Main component ────────────────────────────────────────────────────────────

export function DemoPanel() {
  const [open, setOpen] = useState(true);
  const { running, done, run } = useRunScenario();

  return (
    <section className="animate-fade-up overflow-hidden rounded-[6px] border border-[rgba(0,161,224,0.2)] bg-white shadow-[var(--shadow-card)]">
      {/* Header toggle */}
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
            <p className="text-sm font-semibold text-[var(--dark-grey)]">Demo Scenarios</p>
            <p className="text-[11px] text-[rgba(51,51,51,0.55)]">
              One click per label — runs a pre-built prompt through the live classifier
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
        <div className="border-t border-[rgba(51,51,51,0.08)] p-4">

          {/* ── Hero incident card ──────────────────────────────────────────── */}
          <IncidentCard scenario={INCIDENT_SCENARIO} running={running} done={done} onRun={run} />

          {/* ── Divider ─────────────────────────────────────────────────────── */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(51,51,51,0.08)]" />
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[rgba(51,51,51,0.4)]">
              All five classifier labels
            </span>
            <div className="h-px flex-1 bg-[rgba(51,51,51,0.08)]" />
          </div>

          {/* ── Label grid ──────────────────────────────────────────────────── */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {DEMO_SCENARIOS.map((scenario) => (
              <LabelCard
                key={scenario.id}
                scenario={scenario}
                running={running}
                done={done}
                onRun={run}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Hero incident card ────────────────────────────────────────────────────────

function IncidentCard({
  scenario,
  running,
  done,
  onRun,
}: {
  scenario: DemoScenario;
  running: string | null;
  done: Set<string>;
  onRun: (s: DemoScenario) => Promise<void>;
}) {
  const isRunning = running === scenario.id;
  const isDone = done.has(scenario.id);

  return (
    <div className="rounded-[6px] border border-[rgba(220,100,0,0.25)] bg-gradient-to-br from-[rgba(245,158,11,0.05)] to-[rgba(220,38,38,0.04)] p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          {/* Incident badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(220,38,38)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(220,38,38)]" />
              Real-world incident
            </span>
            <span className="inline-flex items-center rounded-full border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b45309]">
              stuck in a loop → caught at turn 3
            </span>
          </div>

          {/* Story */}
          <p className="text-sm font-semibold text-[var(--dark-grey)]">
            OpenClaw permission retry loop
          </p>
          <p className="max-w-[72ch] text-xs leading-relaxed text-[rgba(51,51,51,0.7)]">
            The permissions were fine — OpenClaw was configured correctly and the webhook was responding 200.
            But the agent misread the auth response: it expected an explicit{" "}
            <code className="rounded bg-[rgba(51,51,51,0.07)] px-1 font-mono text-[10px]">auth_ok</code>{" "}
            field that wasn't there, so it decided permissions had failed.
            It then looped on a problem that didn't exist — retrying the same check, logging the same error,
            burning API credits on every turn, never escalating.
            AgentSense catches the repetition by turn 3 and fires an alert. Without it, the loop runs
            until someone notices the credit bill.
          </p>

          {/* Turn preview */}
          <div className="grid gap-1">
            {scenario.messages.map((msg, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-[rgba(51,51,51,0.6)]">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[rgba(51,51,51,0.18)] bg-white text-[9px] font-bold text-[rgba(51,51,51,0.55)]">
                  {i + 1}
                </span>
                <span>"{msg}"</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex md:items-start md:justify-end">
          <button
            type="button"
            disabled={!!running}
            onClick={() => onRun(scenario)}
            className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-[6px] border px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              isDone
                ? "border-[rgba(0,128,0,0.35)] bg-[rgba(0,128,0,0.07)] text-[var(--success-green)]"
                : "border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)] text-[#b45309] hover:-translate-y-px hover:bg-[rgba(245,158,11,0.15)]"
            }`}
          >
            {isRunning ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#b45309]" />
                Running 3 turns…
              </>
            ) : isDone ? (
              "✓ Done — run again"
            ) : (
              "▶ Run incident demo"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Label scenario card ───────────────────────────────────────────────────────

function LabelCard({
  scenario,
  running,
  done,
  onRun,
}: {
  scenario: DemoScenario;
  running: string | null;
  done: Set<string>;
  onRun: (s: DemoScenario) => Promise<void>;
}) {
  const colors = LABEL_COLOR[scenario.expectedLabel] ?? LABEL_COLOR["healthy"];
  const isRunning = running === scenario.id;
  const isDone = done.has(scenario.id);

  return (
    <div className="grid content-between gap-3 rounded-[6px] border border-[rgba(51,51,51,0.1)] bg-[rgba(248,250,252,0.7)] p-3">
      <div className="grid gap-1.5">
        <span
          className="inline-flex w-fit items-center rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
        >
          {scenario.expectedLabel}
        </span>
        <p className="text-xs font-semibold text-[var(--dark-grey)]">{scenario.title}</p>
        <p className="text-[11px] leading-snug text-[rgba(51,51,51,0.6)]">{scenario.subtitle}</p>
      </div>

      <div className="grid gap-2">
        <div className="rounded-[4px] border border-[rgba(51,51,51,0.08)] bg-white px-2 py-1.5">
          {scenario.messages.map((msg, i) => (
            <p key={i} className="text-[10px] leading-relaxed text-[rgba(51,51,51,0.55)]">
              {i > 0 ? <span className="mr-1 text-[rgba(51,51,51,0.3)]">→</span> : null}
              "{msg.length > 55 ? msg.slice(0, 55) + "…" : msg}"
            </p>
          ))}
        </div>

        <button
          type="button"
          disabled={!!running}
          onClick={() => onRun(scenario)}
          className={`flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            isDone
              ? "border-[rgba(0,128,0,0.35)] bg-[rgba(0,128,0,0.07)] text-[var(--success-green)]"
              : "border-[rgba(0,161,224,0.35)] bg-white text-[var(--business-blue)] hover:-translate-y-px hover:bg-[rgba(0,161,224,0.07)]"
          }`}
        >
          {isRunning ? (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--business-blue)]" />
              Running…
            </>
          ) : isDone ? (
            "✓ Done — run again"
          ) : (
            "▶ Run this"
          )}
        </button>
      </div>
    </div>
  );
}
