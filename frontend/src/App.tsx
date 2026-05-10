import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Button } from "./components/ui/button";
import { startSocket, socket } from "./lib/socket";
import { useDashboardStore } from "./lib/store";

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Monitor", end: true },
  { to: "/playground", label: "Playground" },
  { to: "/session/all", label: "Sessions" },
];

function App() {
  const location = useLocation();
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

  const isPlayground = location.pathname.startsWith("/playground");
  const isDashboard = location.pathname === "/";

  return (
    <div className="min-h-[100dvh]">
      <header className="glass-surface sticky top-0 z-[100]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12L12 4l8 8-8 8-8-8Z" stroke="#00A1E0" strokeWidth="1.8" />
                <path d="M12 4v16" stroke="#00A1E0" strokeWidth="1.8" />
                <path d="M4 12h16" stroke="#00A1E0" strokeWidth="1.8" />
              </svg>
              <span className="text-sm font-bold tracking-tight text-[var(--dark-grey)]">
                AgentSense
              </span>
            </Link>

            <nav className="hidden items-center gap-1 sm:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-[4px] px-2.5 py-1 text-xs font-medium transition-all ${
                      isActive
                        ? "bg-[rgba(0,161,224,0.12)] text-[var(--business-blue)]"
                        : "text-[rgba(51,51,51,0.65)] hover:text-[var(--business-blue)]"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full border border-[rgba(51,51,51,0.12)] bg-white px-3 py-1 text-xs font-medium text-[rgba(51,51,51,0.7)]">
              <span className={`h-2 w-2 rounded-full ${statusDot}`} />
              {connectionStatus}
              {dataSource === "mock" && !isPlayground && (
                <span className="ml-1 rounded-[2px] bg-[rgba(255,165,0,0.15)] px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--warm-orange)]">
                  mock
                </span>
              )}
            </span>

            {isDashboard ? (
              <Button variant="ghost" size="sm" onClick={clearEvents}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}

export default App;
