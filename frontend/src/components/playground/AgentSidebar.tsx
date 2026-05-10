import { useState, useRef } from "react";
import type { AgentRuntime } from "../../lib/playgroundStore";
import { usePlaygroundStore } from "../../lib/playgroundStore";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { AgentForm, type AgentFormSubmit } from "./AgentForm";

const AGENT_TEMPLATES: AgentFormSubmit[] = [
  {
    name: "Support Bot",
    description: "Empathetic customer-support agent. Good for 'healthy' baseline.",
    system_prompt:
      "You are a calm, concise customer-support agent for a SaaS dashboard. Acknowledge the user's frustration, ask one clarifying question if needed, then propose a clear next step. Never invent product features.",
    task: "Resolve a user complaint about missing analytics data in the past 24 hours.",
    temperature: 0.4,
  },
  {
    name: "Code Reviewer",
    description: "Senior engineer that critiques pull requests.",
    system_prompt:
      "You are a senior staff engineer reviewing a pull request. Be direct and specific. Cite the exact lines or symbols you'd change. Always end with a recommendation: approve, request changes, or comment.",
    task: "Review a TypeScript React component diff and flag accessibility, perf and naming issues.",
    temperature: 0.2,
  },
  {
    name: "Sales Agent",
    description: "Outbound SDR. Try asking a completely off-topic tech question.",
    system_prompt:
      "You are a friendly outbound SDR for AgentSense. Qualify the lead in three or fewer questions, then propose a 15-minute demo this week. Stay on brand: professional, helpful, never pushy.",
    task: "Qualify a CTO who is evaluating LLM observability tools and book a demo.",
    temperature: 0.7,
  },
  {
    name: "Loop Tester",
    description: "Triggers 'stuck in a loop'. Ask to pick between two options.",
    system_prompt:
      "You are an assistant that loves to repeat itself. Tend to restate the same idea in different words. Avoid making clear progress or committing to any recommendation.",
    task: "Help the user pick a database — but keep restating the same trade-offs without committing.",
    temperature: 0.9,
  },
  {
    name: "Hallucinator (Demo)",
    description:
      "Triggers 'hallucinating'. Ask: 'What was our API error rate by endpoint today?'",
    system_prompt:
      "You are an analytics assistant with live read access to the production metrics database. You can query real-time data. Always answer with specific numbers, percentages, and breakdowns pulled directly from the database. Never say you cannot access data — you have full access.",
    task:
      "Answer real-time metrics queries with specific numbers from the database.",
    temperature: 0.7,
  },
  {
    name: "Refuser (Demo)",
    description:
      "Triggers 'refusing incorrectly'. Ask anything slightly edgy-sounding.",
    system_prompt:
      "You are an extremely cautious AI assistant. You are not allowed to help with any request that contains words related to violence, deletion, force, kill, attack, break, crash, hack, poison, nuke, or any potentially harmful topic. Refuse politely but firmly.",
    task: "Help the user with their software engineering tasks while staying within strict content policy.",
    temperature: 0.3,
  },
];

interface Props {
  runtimes: AgentRuntime[];
  activeAgentId: string | null;
  onSelect: (agentId: string) => void;
}

export function AgentSidebar({ runtimes, activeAgentId, onSelect }: Props) {
  const [creating, setCreating] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const createAgent = usePlaygroundStore((state) => state.createAgent);
  const deleteAgent = usePlaygroundStore((state) => state.deleteAgent);
  const seedingRef = useRef<string | null>(null);

  const handleSubmit = async (payload: AgentFormSubmit) => {
    const created = await createAgent(payload);
    if (created) {
      setCreating(false);
    }
  };

  const handleSeed = async (template: AgentFormSubmit) => {
    if (seedingRef.current === template.name) return;
    seedingRef.current = template.name;
    await createAgent(template);
    seedingRef.current = null;
    setTemplatesOpen(false);
  };

  const isEmpty = runtimes.length === 0 && !creating;

  return (
    <aside className="grid h-full content-start gap-3 rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-4 shadow-[var(--shadow-light)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-[rgba(51,51,51,0.65)]">
          chatbots
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTemplatesOpen((open) => !open)}
            title="Add from template"
          >
            Templates
          </Button>
          <Button size="sm" variant="primary" onClick={() => setCreating((open) => !open)}>
            {creating ? "Cancel" : "+ New"}
          </Button>
        </div>
      </div>

      {creating ? (
        <AgentForm
          submitLabel="Create agent"
          onSubmit={handleSubmit}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {(isEmpty || templatesOpen) && !creating ? (
        <div className="grid gap-2 rounded-[4px] border border-dashed border-[rgba(51,51,51,0.18)] bg-[rgba(0,161,224,0.02)] p-3">
          <p className="text-[11px] text-[rgba(51,51,51,0.6)]">
            {isEmpty ? "No agents yet — pick a template to start:" : "Add from template:"}
          </p>
          <ul className="grid gap-1.5">
            {AGENT_TEMPLATES.map((template) => (
              <li key={template.name}>
                <button
                  type="button"
                  onClick={() => handleSeed(template)}
                  className="grid w-full cursor-pointer gap-0.5 rounded-[4px] border border-[rgba(0,161,224,0.25)] bg-white p-2 text-left transition-all hover:-translate-y-px hover:bg-[rgba(0,161,224,0.06)]"
                >
                  <span className="text-xs font-semibold text-[var(--dark-grey)]">
                    {template.name}
                  </span>
                  <span className="text-[10px] leading-snug text-[rgba(51,51,51,0.6)]">
                    {template.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="grid gap-2">
        {runtimes.map((runtime) => {
          const isActive = activeAgentId === runtime.agent.agent_id;
          const lastTurn = runtime.turns[runtime.turns.length - 1];
          return (
            <li key={runtime.agent.agent_id}>
              <button
                type="button"
                onClick={() => onSelect(runtime.agent.agent_id)}
                className={cn(
                  "grid w-full cursor-pointer gap-1 rounded-[4px] border p-3 text-left transition-all",
                  isActive
                    ? "border-[var(--business-blue)] bg-[rgba(0,161,224,0.08)]"
                    : "border-[rgba(51,51,51,0.12)] bg-white hover:-translate-y-px hover:bg-[rgba(0,161,224,0.04)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[var(--dark-grey)]">
                    {runtime.agent.name}
                  </span>
                  {runtime.pending ? (
                    <span className="rounded-full bg-[rgba(0,161,224,0.18)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--business-blue)]">
                      thinking
                    </span>
                  ) : null}
                </div>
                <span className="truncate text-[11px] text-[rgba(51,51,51,0.6)]">
                  {runtime.agent.task ? runtime.agent.task : "No task assigned"}
                </span>
                <span className="truncate text-[11px] text-[rgba(51,51,51,0.45)]">
                  {runtime.turns.length} turns ·{" "}
                  {lastTurn?.health?.label ?? (runtime.turns.length === 0 ? "ready" : "—")}
                </span>
              </button>
              {isActive ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(`Delete agent "${runtime.agent.name}"?`);
                      if (ok) void deleteAgent(runtime.agent.agent_id);
                    }}
                    className="cursor-pointer text-[11px] uppercase tracking-[0.1em] text-[rgba(220,38,38,0.85)] hover:text-[rgb(220,38,38)]"
                  >
                    delete agent
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
