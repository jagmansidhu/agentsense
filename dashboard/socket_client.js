// AgentSense dashboard — Socket.IO client.
// Subscribes to `agent_event` and renders color-coded health cards.

const PROXY_URL = "http://localhost:8000";

const socket = io(PROXY_URL);
const feed = document.getElementById("feed");
const status = document.getElementById("status");
const counter = document.getElementById("counter");

let totalEvents = 0;
let anomalyEvents = 0;

function labelClass(label) {
  if (!label) return "";
  const key = label.toLowerCase();
  if (key.includes("healthy")) return "healthy";
  if (key.includes("hallucin")) return "hallucinating";
  if (key.includes("stuck") || key.includes("loop")) return "stuck";
  if (key.includes("off")) return "off";
  if (key.includes("refus")) return "refusing";
  return "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

socket.on("connect", () => {
  status.textContent = "Connected — monitoring agent";
  status.style.color = "#22c55e";
});

socket.on("disconnect", () => {
  status.textContent = "Disconnected";
  status.style.color = "#ef4444";
});

socket.on("agent_event", (data) => {
  totalEvents += 1;
  if (labelClass(data.label) && labelClass(data.label) !== "healthy") {
    anomalyEvents += 1;
  }
  counter.textContent = `${totalEvents} events monitored · ${anomalyEvents} anomalies detected`;

  const conf =
    typeof data.confidence === "number"
      ? `${(data.confidence * 100).toFixed(1)}% confidence`
      : "";

  const div = document.createElement("div");
  div.className = `event ${labelClass(data.label)}`;
  div.innerHTML = `
    <div class="label">
      ${escapeHtml(data.label || "unknown")}
      <span class="confidence">${conf}</span>
    </div>
    <div class="message">${escapeHtml(data.message)}</div>
    ${data.explanation ? `<div class="explanation">${escapeHtml(data.explanation)}</div>` : ""}
    ${data.greptile_context ? `<div class="explanation">Code: ${escapeHtml(data.greptile_context)}</div>` : ""}
    <div class="meta">session ${escapeHtml(data.session_id || "default")} · ${new Date().toLocaleTimeString()}</div>
  `;
  feed.prepend(div);
});
