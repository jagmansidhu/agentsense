import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useParams,
} from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { DashboardPage } from "./pages/DashboardPage";
import { SessionPage } from "./pages/SessionPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import "./styles/globals.css";

registerSW({ immediate: true });

function RedirectSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <Navigate to={`/session/${encodeURIComponent(sessionId ?? "all")}`} replace />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "playground", element: <PlaygroundPage /> },
      { path: "session/:sessionId", element: <SessionPage /> },
      { path: "session", element: <Navigate to="/session/all" replace /> },
    ],
  },
  // Backwards-compat redirects from the previous /monitor namespace.
  { path: "/monitor", element: <Navigate to="/" replace /> },
  { path: "/monitor/playground", element: <Navigate to="/playground" replace /> },
  { path: "/monitor/session", element: <Navigate to="/session/all" replace /> },
  { path: "/monitor/session/:sessionId", element: <RedirectSession /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
