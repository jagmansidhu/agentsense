import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SessionPage } from "./pages/SessionPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import "./styles/globals.css";

registerSW({ immediate: true });

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/monitor",
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "playground", element: <PlaygroundPage /> },
      { path: "session/:sessionId", element: <SessionPage /> },
      { path: "session", element: <Navigate to="/monitor/session/all" replace /> },
    ],
  },
  { path: "/session", element: <Navigate to="/monitor/session/all" replace /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
