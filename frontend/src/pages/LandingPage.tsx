import { Link } from "react-router-dom";

const customEffects = `
.business-hero-visual {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(0, 161, 224, 0.24);
  background:
    radial-gradient(circle at 18% 22%, rgba(0, 161, 224, 0.2), transparent 34%),
    radial-gradient(circle at 82% 78%, rgba(128, 0, 128, 0.15), transparent 38%),
    linear-gradient(145deg, #ffffff, #f1f8fc);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.08);
  min-height: 360px;
}

.business-hero-visual::before {
  content: "";
  position: absolute;
  inset: 18px;
  border-radius: 14px;
  border: 1px dashed rgba(0, 161, 224, 0.28);
}

.data-dashboard-animation {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 8%;
  height: 118px;
  display: flex;
  gap: 8px;
  align-items: end;
  justify-content: space-between;
}

.data-dashboard-animation span {
  width: 11%;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(to top, var(--business-blue), rgba(0, 161, 224, 0.38));
  animation: dashboardPulse 2.8s ease-in-out infinite;
  transform-origin: bottom;
  box-shadow: 0 8px 20px rgba(0, 161, 224, 0.24);
}

.data-dashboard-animation span:nth-child(1) { height: 42%; animation-delay: 0s; }
.data-dashboard-animation span:nth-child(2) { height: 68%; animation-delay: 0.2s; }
.data-dashboard-animation span:nth-child(3) { height: 35%; animation-delay: 0.4s; }
.data-dashboard-animation span:nth-child(4) { height: 76%; animation-delay: 0.6s; }
.data-dashboard-animation span:nth-child(5) { height: 53%; animation-delay: 0.8s; }
.data-dashboard-animation span:nth-child(6) { height: 86%; animation-delay: 1s; }
.data-dashboard-animation span:nth-child(7) { height: 61%; animation-delay: 1.2s; }
.data-dashboard-animation span:nth-child(8) { height: 72%; animation-delay: 1.4s; }

.workflow-diagram {
  position: absolute;
  top: 14%;
  left: 11%;
  right: 11%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.workflow-node {
  border-radius: 10px;
  border: 1px solid rgba(0, 161, 224, 0.22);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-light);
  padding: 10px;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
}

.workflow-line {
  position: relative;
  margin-top: 8px;
  height: 2px;
  background: linear-gradient(90deg, rgba(0, 161, 224, 0.24), rgba(0, 161, 224, 0.9));
}

.workflow-line::after {
  content: "";
  position: absolute;
  top: -4px;
  right: -2px;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid var(--business-blue);
}

.sales-progress-ring {
  position: absolute;
  top: 42%;
  right: 10%;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  animation: slowSpin 8s linear infinite;
  background: conic-gradient(var(--success-green) 0 72%, rgba(0, 128, 0, 0.15) 72% 100%);
}

.sales-progress-ring::after {
  content: "72%";
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #fff;
  color: #166534;
  font-size: 0.82rem;
  font-weight: 700;
}

@keyframes dashboardPulse {
  0%, 100% { transform: scaleY(0.95); opacity: 0.75; }
  50% { transform: scaleY(1.05); opacity: 1; }
}

@keyframes slowSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--white)] text-[var(--dark-grey)]">
      <style>{customEffects}</style>

      <header className="sticky top-0 z-[100] border-b border-[rgba(0,161,224,0.14)] bg-[rgba(255,255,255,0.88)] backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <a href="#home" className="cursor-pointer transition-all inline-flex items-center gap-2 no-underline">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12L12 4l8 8-8 8-8-8Z" stroke="#00A1E0" strokeWidth="1.8" />
              <path d="M12 4v16" stroke="#00A1E0" strokeWidth="1.8" />
              <path d="M4 12h16" stroke="#00A1E0" strokeWidth="1.8" />
            </svg>
            <span className="text-lg font-bold tracking-tight">AgentSense Business AI</span>
          </a>

          <ul className="flex flex-wrap items-center gap-4 text-sm md:gap-6">
            <li><a href="#features" className="cursor-pointer transition-all hover:text-[var(--business-blue)]">Features</a></li>
            <li><a href="#testimonials" className="cursor-pointer transition-all hover:text-[var(--business-blue)]">Testimonials</a></li>
            <li><a href="#pricing" className="cursor-pointer transition-all hover:text-[var(--business-blue)]">Pricing</a></li>
            <li><a href="#contact" className="cursor-pointer transition-all hover:text-[var(--business-blue)]">Contact</a></li>
          </ul>

          <Link
            to="/monitor"
            className="cursor-pointer transition-all rounded-[4px] border border-transparent bg-[var(--business-blue)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-light)] hover:-translate-y-px hover:brightness-95 hover:shadow-[0_8px_20px_rgba(0,161,224,0.28)]"
          >
            Open Monitor
          </Link>
        </nav>
      </header>

      <main id="home">
        <section className="py-[clamp(4rem,8vw,8rem)]">
          <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-10 px-6 lg:grid-cols-2">
            <div>
              <p className="mb-4 inline-flex items-center rounded-full border border-[rgba(0,161,224,0.28)] bg-[rgba(0,161,224,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--business-blue)]">
                2026+ Business Intelligence
              </p>
              <h1 className="mb-6 text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[1.05] tracking-tight">
                Turn Every Sales Conversation Into Actionable AI Intelligence
              </h1>
              <p className="mb-8 max-w-[72ch] text-base leading-relaxed text-[rgba(51,51,51,0.8)] md:text-lg">
                AgentSense Business AI gives revenue teams an interactive command center for CRM, forecasting, and conversion health. Monitor signals, optimize workflows, and respond with confidence in real time.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="#pricing"
                  className="cursor-pointer transition-all inline-flex items-center justify-center rounded-[4px] border border-transparent bg-[var(--business-blue)] px-6 py-3 font-semibold text-white shadow-[var(--shadow-light)] hover:-translate-y-px hover:brightness-95"
                >
                  Get Started
                </a>
                <a
                  href="#features"
                  className="cursor-pointer transition-all inline-flex items-center justify-center rounded-[4px] border-[1.5px] border-[rgba(0,161,224,0.42)] bg-transparent px-6 py-3 font-semibold text-[var(--business-blue)] hover:-translate-y-px hover:bg-[rgba(0,161,224,0.08)]"
                >
                  Explore Platform
                </a>
              </div>
            </div>

            <div className="business-hero-visual shadow-[0_0_0_1px_rgba(0,161,224,0.18),0_12px_28px_var(--ai-glow)]">
              <div className="workflow-diagram">
                <div>
                  <div className="workflow-node">Lead Intake</div>
                  <div className="workflow-line" />
                </div>
                <div>
                  <div className="workflow-node">AI Qualification</div>
                  <div className="workflow-line" />
                </div>
                <div>
                  <div className="workflow-node">Deal Prioritization</div>
                  <div className="workflow-line" />
                </div>
              </div>

              <div className="sales-progress-ring" />

              <div className="data-dashboard-animation" aria-hidden="true">
                <span /><span /><span /><span />
                <span /><span /><span /><span />
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-[rgba(242,242,242,0.45)] py-[clamp(4rem,8vw,8rem)]">
          <div className="mx-auto w-full max-w-[1280px] px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Designed for Intelligent Revenue Operations</h2>
              <p className="mx-auto mt-3 max-w-[72ch] text-[rgba(51,51,51,0.8)]">
                Built with a modular, data-driven interface that keeps your team aligned, efficient, and customer-focused.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-[4px] bg-[rgba(0,161,224,0.12)]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                    <path d="M4 19V9m8 10V5m8 14v-7" stroke="#00A1E0" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                </div>
                <h3 className="mb-2 text-xl font-semibold">Interactive Data Views</h3>
                <p className="text-sm leading-relaxed text-[rgba(51,51,51,0.75)]">
                  Visual dashboards track conversion, lead quality, and pipeline velocity with live feedback and anomaly indicators.
                </p>
              </article>

              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-[4px] bg-[rgba(128,0,128,0.1)]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                    <path d="M3 7h6v4H3V7Zm12 0h6v4h-6V7ZM9 13h6v4H9v-4Zm-6 6h18" stroke="#800080" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mb-2 text-xl font-semibold">Workflow Diagrams</h3>
                <p className="text-sm leading-relaxed text-[rgba(51,51,51,0.75)]">
                  Understand the full sales lifecycle with clear AI-assisted process mapping from first touch to close.
                </p>
              </article>

              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-[4px] bg-[rgba(0,128,0,0.12)]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                    <path d="M12 3v8m0 0 3-3m-3 3-3-3M4 13h4m8 0h4M5 18h14" stroke="#008000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mb-2 text-xl font-semibold">Sales Progress Motion</h3>
                <p className="text-sm leading-relaxed text-[rgba(51,51,51,0.75)]">
                  Subtle motion and micro-interactions surface momentum changes instantly without overwhelming your team.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="testimonials" className="hidden py-[clamp(4rem,8vw,8rem)]">
          <div className="mx-auto w-full max-w-[1280px] px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Trusted by Modern Sales Teams</h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <p className="mb-4 text-sm leading-relaxed text-[rgba(51,51,51,0.8)]">
                  "AgentSense gave our revenue team an immediate view of where deals were stalling. We improved forecast confidence in one quarter."
                </p>
                <p className="text-sm font-semibold">Maya Chen</p>
                <p className="text-xs text-[rgba(51,51,51,0.65)]">VP Revenue Operations, NovaGrid</p>
              </article>
              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <p className="mb-4 text-sm leading-relaxed text-[rgba(51,51,51,0.8)]">
                  "The workflow insights are practical and clear. Our reps now act on data faster and move opportunities forward with less friction."
                </p>
                <p className="text-sm font-semibold">Daniel Brooks</p>
                <p className="text-xs text-[rgba(51,51,51,0.65)]">Sales Director, HelioCRM</p>
              </article>
              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <p className="mb-4 text-sm leading-relaxed text-[rgba(51,51,51,0.8)]">
                  "We replaced scattered reports with one intelligent dashboard. The impact on team alignment and speed was immediate."
                </p>
                <p className="text-sm font-semibold">Aria Patel</p>
                <p className="text-xs text-[rgba(51,51,51,0.65)]">Head of GTM Systems, Vertexlane</p>
              </article>
            </div>
          </div>
        </section>

        <section id="pricing" className="hidden bg-[rgba(242,242,242,0.45)] py-[clamp(4rem,8vw,8rem)]">
          <div className="mx-auto w-full max-w-[1280px] px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Pricing for Every Growth Stage</h2>
              <p className="mx-auto mt-3 max-w-[72ch] text-[rgba(51,51,51,0.8)]">
                Start quickly, scale confidently, and give every team member visibility into revenue health.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <h3 className="mb-2 text-xl font-semibold">Starter</h3>
                <p className="mb-6 text-sm text-[rgba(51,51,51,0.7)]">For small sales teams launching data-driven workflows.</p>
                <p className="mb-6 text-4xl font-bold">$29<span className="text-base font-medium text-[rgba(51,51,51,0.7)]">/seat</span></p>
                <ul className="mb-8 space-y-2 text-sm text-[rgba(51,51,51,0.8)]">
                  <li>Pipeline visibility dashboard</li>
                  <li>Basic AI deal alerts</li>
                  <li>Email support</li>
                </ul>
                <a href="#contact" className="cursor-pointer transition-all inline-flex w-full items-center justify-center rounded-[4px] border-[1.5px] border-[rgba(0,161,224,0.42)] bg-transparent px-4 py-3 font-semibold text-[var(--business-blue)] hover:-translate-y-px hover:bg-[rgba(0,161,224,0.08)]">Choose Starter</a>
              </article>

              <article className="cursor-pointer transition-all relative overflow-hidden rounded-[4px] border-2 border-[var(--business-blue)] bg-white p-7 shadow-[0_12px_24px_rgba(0,161,224,0.24)] hover:-translate-y-1">
                <span className="absolute right-[-34px] top-[14px] rotate-[35deg] bg-[var(--business-blue)] px-10 py-1.5 text-[0.7rem] uppercase tracking-[0.04em] text-white">
                  Most Selected
                </span>
                <h3 className="mb-2 text-xl font-semibold">Growth</h3>
                <p className="mb-6 text-sm text-[rgba(51,51,51,0.7)]">For scaling revenue teams needing real-time intelligence.</p>
                <p className="mb-6 text-4xl font-bold">$79<span className="text-base font-medium text-[rgba(51,51,51,0.7)]">/seat</span></p>
                <ul className="mb-8 space-y-2 text-sm text-[rgba(51,51,51,0.8)]">
                  <li>Advanced interactive visualizations</li>
                  <li>Workflow automation insights</li>
                  <li>Priority support</li>
                </ul>
                <a href="#contact" className="cursor-pointer transition-all inline-flex w-full items-center justify-center rounded-[4px] border border-transparent bg-[var(--business-blue)] px-4 py-3 font-semibold text-white hover:-translate-y-px hover:brightness-95">Choose Growth</a>
              </article>

              <article className="cursor-pointer transition-all rounded-[4px] border border-[rgba(51,51,51,0.12)] bg-white p-7 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.11)]">
                <h3 className="mb-2 text-xl font-semibold">Enterprise</h3>
                <p className="mb-6 text-sm text-[rgba(51,51,51,0.7)]">For global organizations with complex CRM ecosystems.</p>
                <p className="mb-6 text-4xl font-bold">Custom</p>
                <ul className="mb-8 space-y-2 text-sm text-[rgba(51,51,51,0.8)]">
                  <li>Custom model routing and governance</li>
                  <li>Dedicated success architecture</li>
                  <li>Security and compliance controls</li>
                </ul>
                <a href="#contact" className="cursor-pointer transition-all inline-flex w-full items-center justify-center rounded-[4px] border-[1.5px] border-[rgba(0,161,224,0.42)] bg-transparent px-4 py-3 font-semibold text-[var(--business-blue)] hover:-translate-y-px hover:bg-[rgba(0,161,224,0.08)]">Talk to Sales</a>
              </article>
            </div>
          </div>
        </section>

        <section id="contact" className="py-[clamp(4rem,8vw,8rem)]">
          <div className="mx-auto w-full max-w-[1280px] px-6">
            <div className="rounded-[4px] border border-[rgba(0,161,224,0.2)] bg-white p-8 text-center shadow-[0_2px_20px_rgba(0,161,224,0.18)] md:p-12">
              <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">Build Your Data-Driven Sales Engine Today</h2>
              <p className="mx-auto mb-8 max-w-[72ch] text-[rgba(51,51,51,0.8)]">
                Join teams that use AgentSense to track behavior signals, prioritize high-impact opportunities, and improve conversion outcomes.
              </p>
              <div className="mx-auto flex max-w-xl flex-col justify-center gap-3 sm:flex-row">
                <a href="#" className="cursor-pointer transition-all inline-flex items-center justify-center rounded-[4px] border border-transparent bg-[var(--business-blue)] px-6 py-3 font-semibold text-white hover:-translate-y-px hover:brightness-95">Book a Demo</a>
                <a href="#" className="cursor-pointer transition-all inline-flex items-center justify-center rounded-[4px] border-[1.5px] border-[rgba(0,161,224,0.42)] bg-transparent px-6 py-3 font-semibold text-[var(--business-blue)] hover:-translate-y-px hover:bg-[rgba(0,161,224,0.08)]">Download Overview</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="z-[0] bg-gradient-to-br from-[#1b1b1b] to-[#111827] text-[#e5e7eb]">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold text-white">AgentSense Business AI</h3>
              <p className="text-sm text-gray-300">
                Professional and intelligent sales infrastructure for modern revenue teams.
              </p>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-gray-200">Company</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">About</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Careers</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Contact</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Press</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-gray-200">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Documentation</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">API Reference</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Security</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Sitemap</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-gray-200">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Privacy Policy</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Terms of Use</a></li>
                <li><a className="cursor-pointer transition-all hover:text-white" href="#">Cookie Policy</a></li>
              </ul>
              <div className="mt-4 flex items-center gap-3">
                <a href="#" aria-label="LinkedIn" className="cursor-pointer transition-all rounded-[4px] border border-gray-600 p-2 hover:border-[var(--business-blue)] hover:text-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 9v8M7 6h.01M12 17v-5a2 2 0 0 1 4 0v5m-8 0h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </a>
                <a href="#" aria-label="X" className="cursor-pointer transition-all rounded-[4px] border border-gray-600 p-2 hover:border-[var(--business-blue)] hover:text-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m4 4 16 16M20 4 4 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </a>
                <a href="#" aria-label="GitHub" className="cursor-pointer transition-all rounded-[4px] border border-gray-600 p-2 hover:border-[var(--business-blue)] hover:text-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 18c-4 1.2-4-2-6-2m12 4v-3.1a2.7 2.7 0 0 0-.8-2.1c2.7-.3 5.5-1.4 5.5-6.1A4.7 4.7 0 0 0 18.5 5 4.4 4.4 0 0 0 18.4 2S17.3 1.7 15 3.2a12.1 12.1 0 0 0-6 0C6.7 1.7 5.6 2 5.6 2A4.4 4.4 0 0 0 5.5 5a4.7 4.7 0 0 0-1.2 3.7c0 4.7 2.8 5.8 5.5 6.1a2.7 2.7 0 0 0-.8 2.1V20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-700 pt-6 text-sm text-gray-400">
            <p>Copyright 2026 AgentSense. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
