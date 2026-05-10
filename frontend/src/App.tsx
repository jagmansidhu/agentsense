import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { Button } from "./components/ui/button";
import { startSocket, socket } from "./lib/socket";
import { useDashboardStore } from "./lib/store";

function App() {
  const clearEvents = useDashboardStore((state) => state.clearEvents);
  const dataSource = useDashboardStore((state) => state.dataSource);
  const connectionStatus = useDashboardStore((state) => state.connectionStatus);

  useEffect(() => {
    const activeSocket = startSocket();
    return () => {
      if (activeSocket.connected) {
        socket.close();
      }
    };
  }, []);

  const statusDot =
    connectionStatus === "connected"
      ? "bg-[var(--success-green)]"
      : connectionStatus === "connecting"
        ? "bg-[var(--warm-orange)]"
        : "bg-[rgb(220,38,38)]";

  return (
    <div className="min-h-[100dvh]">
      {/* Sticky top nav */}
      <header className="glass-surface sticky top-0 z-[100]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12L12 4l8 8-8 8-8-8Z" stroke="#00A1E0" strokeWidth="1.8" />
              <path d="M12 4v16" stroke="#00A1E0" strokeWidth="1.8" />
              <path d="M4 12h16" stroke="#00A1E0" strokeWidth="1.8" />
            </svg>
            <span className="text-sm font-bold tracking-tight text-[var(--dark-grey)]">
              AgentSense
            </span>
            <span className="hidden text-xs text-[rgba(51,51,51,0.45)] sm:inline">/ Monitor</span>
          </div>

          {/* Status + controls */}
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <span className="flex items-center gap-1.5 rounded-full border border-[rgba(51,51,51,0.12)] bg-white px-3 py-1 text-xs font-medium text-[rgba(51,51,51,0.7)]">
              <span className={`h-2 w-2 rounded-full ${statusDot}`} />
              {connectionStatus}
              {dataSource === "mock" && (
                <span className="ml-1 rounded-[2px] bg-[rgba(255,165,0,0.15)] px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--warm-orange)]">
                  mock
                </span>
              )}
            </span>

            <Button variant="ghost" size="sm" onClick={clearEvents}>
              Clear
            </Button>

            <Link
              to="/"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-[rgba(0,161,224,0.35)] bg-[var(--business-blue)] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-95"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Landing
            </Link>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6">
        <div className="mb-5 animate-fade-up">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Agent Health Monitor
          </h1>
          <p className="mt-1 text-sm text-[rgba(51,51,51,0.65)]">
            Per-agent health, confidence scores, and issue resolution — backend-ready, running on mock data.
          </p>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export default App;
