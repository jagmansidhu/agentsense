import { useEffect, useMemo } from "react";
import { AgentChatPanel } from "../components/playground/AgentChatPanel";
import { AgentSidebar } from "../components/playground/AgentSidebar";
import { DemoPanel } from "../components/playground/DemoPanel";
import { usePlaygroundStore } from "../lib/playgroundStore";

export function PlaygroundPage() {
  const hydrate = usePlaygroundStore((state) => state.hydrate);
  const agents = usePlaygroundStore((state) => state.agents);
  const order = usePlaygroundStore((state) => state.order);
  const activeAgentId = usePlaygroundStore((state) => state.activeAgentId);
  const setActiveAgent = usePlaygroundStore((state) => state.setActiveAgent);
  const loading = usePlaygroundStore((state) => state.loading);
  const error = usePlaygroundStore((state) => state.error);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const runtimes = useMemo(
    () => order.map((id) => agents[id]).filter(Boolean),
    [order, agents],
  );
  const activeRuntime = activeAgentId ? agents[activeAgentId] : null;

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Multi-agent playground</h1>
        <p className="text-sm text-[rgba(51,51,51,0.65)]">
          Spin up agents, assign them tasks, and send messages through the AgentSense proxy.
          Every reply is classified in real time — loop detection, hallucination scoring,
          topic drift, and refusal checks — and streams live to the monitor.
        </p>
        {loading ? (
          <p className="text-xs text-[rgba(51,51,51,0.55)]">Loading agents from /proxy/agents…</p>
        ) : null}
        {error ? (
          <p className="rounded-[4px] border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.05)] px-3 py-2 text-xs text-[rgb(220,38,38)]">
            {error}
          </p>
        ) : null}
      </header>

      {/* Pre-built demo scenarios – one click per classifier label */}
      <DemoPanel />

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <AgentSidebar
          runtimes={runtimes}
          activeAgentId={activeAgentId}
          onSelect={setActiveAgent}
        />
        {activeRuntime ? (
          <AgentChatPanel runtime={activeRuntime} />
        ) : (
          <div className="grid place-items-center rounded-[4px] border border-dashed border-[rgba(51,51,51,0.18)] bg-white p-12 text-center text-sm text-[rgba(51,51,51,0.6)]">
            <div className="grid gap-2">
              <p className="text-base font-semibold text-[var(--dark-grey)]">
                Select or create an agent to start chatting.
              </p>
              <p>
                Use the Demo Scenarios above for a one-click walkthrough, or pick a template from
                the sidebar to build your own.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
