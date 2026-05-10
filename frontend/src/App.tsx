import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Button } from "./components/ui/button";
import { startSocket, socket } from "./lib/socket";
import { useDashboardStore } from "./lib/store";

function App() {
  const clearEvents = useDashboardStore((state) => state.clearEvents);

  useEffect(() => {
    const activeSocket = startSocket();
    return () => {
      if (activeSocket.connected) {
        socket.close();
      }
    };
  }, []);

  return (
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1280px] gap-6 px-4 py-6 md:px-6">
      <header className="grid gap-4 border-b border-zinc-800 pb-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">AgentSense</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">
            Real-time React Dashboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Minimal Swiss-style monitoring surface for web and installable mobile PWA.
          </p>
        </div>
        <Button variant="ghost" onClick={clearEvents}>
          clear live cache
        </Button>
      </header>

      <Outlet />
    </div>
  );
}

export default App;
