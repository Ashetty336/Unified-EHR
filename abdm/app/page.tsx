"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const FEATURES = [
  {
    title: "Consent-led exchange",
    desc: "Patients approve every request, set expiry, and revoke access from one privacy cockpit.",
    metric: "100%",
    label: "gated",
  },
  {
    title: "FHIR-native records",
    desc: "Clinical documents become structured resources that are readable by patients and providers.",
    metric: "R4",
    label: "ready",
  },
  {
    title: "Audit-grade trust",
    desc: "Every view, write, and transfer leaves a clear trail tied to role, purpose, and consent.",
    metric: "24/7",
    label: "trace",
  },
];

const ROLES = [
  {
    role: "Patient",
    desc: "Control your ABHA identity, health timeline, consents, linked records, and uploads.",
    href: "/auth/login?role=patient",
    tone: "bg-teal-500/12 text-teal-700",
  },
  {
    role: "Doctor",
    desc: "Find patients, request scoped access, view FHIR cards, and create MedicationRequests.",
    href: "/auth/login?role=doctor",
    tone: "bg-rose-500/12 text-rose-700",
  },
  {
    role: "Hospital",
    desc: "Ingest clinical documents, manage doctors, and coordinate consented transfers.",
    href: "/auth/login?role=hospital",
    tone: "bg-amber-500/16 text-amber-800",
  },
];

const TIMELINE = [
  { kind: "Observation", title: "Hemoglobin", value: "13.8 g/dL", tone: "bg-teal-500" },
  { kind: "MedicationRequest", title: "Atorvastatin", value: "Active", tone: "bg-rose-500" },
  { kind: "DiagnosticReport", title: "Lipid Panel", value: "Final", tone: "bg-amber-500" },
  { kind: "Consent", title: "Dr. Sharma", value: "Expires in 30d", tone: "bg-indigo-500" },
];

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
        transitionProperty: "opacity, transform, filter",
        transitionDuration: "900ms",
        transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
      }}
      className={visible ? "translate-y-0 opacity-100 blur-0" : "translate-y-12 opacity-0 blur-sm"}
    >
      {children}
    </div>
  );
}

function ArrowGlyph() {
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-black/7 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-px group-hover:scale-105">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2 10L10 2M10 2H3.5M10 2V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function ProductPreview() {
  return (
    <div className="ehr-surface rotate-[1.5deg] p-2 max-md:rotate-0">
      <div className="ehr-core overflow-hidden">
        <div className="border-b border-border/60 bg-white/70 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">ABHA Timeline</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">Ananya Rao</p>
            </div>
            <div className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-medium text-emerald-700">
              Consent active
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-3">
            {[
              ["Patient", "ABHA 91-2845-6071-3321"],
              ["Encounter", "OPD follow-up"],
              ["Scope", "Observation, Medication"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-muted/55 p-4 ring-1 ring-border/60">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                <p className="mt-2 text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[1.5rem] bg-[#102a2e] p-4 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium text-white/70">FHIR resources</p>
              <p className="font-mono text-[10px] text-white/35">Bundle/4281</p>
            </div>
            <div className="space-y-3">
              {TIMELINE.map((item, index) => (
                <div
                  key={item.kind}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10"
                  style={{
                    transform: `translateX(${index % 2 === 0 ? 0 : 10}px)`,
                  }}
                >
                  <span className={`size-2.5 rounded-full ${item.tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">{item.kind}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/75">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-4 items-end gap-2">
              {[42, 74, 58, 88, 63, 96, 51, 80].map((height, index) => (
                <span
                  key={index}
                  className="rounded-full bg-white/20"
                  style={{ height: `${height}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden text-foreground">
      <header className="fixed inset-x-0 top-5 z-40 px-4">
        <nav className="mx-auto flex max-w-5xl items-center justify-between rounded-full border border-white/70 bg-background/75 px-3 py-2 shadow-[0_18px_54px_rgba(24,52,64,0.10)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2 rounded-full px-2 py-1.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight">Unified EHR</span>
          </Link>

          <div className="hidden items-center gap-6 text-xs font-medium text-muted-foreground md:flex">
            <a href="#platform" className="ehr-motion hover:text-foreground">Platform</a>
            <a href="#roles" className="ehr-motion hover:text-foreground">Roles</a>
            <a href="#records" className="ehr-motion hover:text-foreground">FHIR View</a>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="hidden rounded-full px-4 py-2 text-xs font-medium text-muted-foreground ehr-motion hover:bg-muted hover:text-foreground md:inline-flex">
              Sign in
            </Link>
            <Link href="/auth/register" className="group inline-flex items-center gap-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[0_12px_28px_rgba(10,129,145,0.22)] ehr-motion active:scale-[0.98]">
              Get started
              <span className="flex size-6 items-center justify-center rounded-full bg-white/18">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
                  <path d="M1.5 7.5L7.5 1.5M7.5 1.5H2.5M7.5 1.5V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative min-h-[100dvh] px-4 pb-20 pt-32 md:pb-28 md:pt-36">
          <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[0.92fr_1.08fr]">
            <FadeUp>
              <div className="space-y-8">
                <span className="ehr-eyebrow">Consent-native health exchange</span>
                <div className="space-y-5">
                  <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-balance md:text-7xl">
                    Health records that feel clear, controlled, and alive.
                  </h1>
                  <p className="max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                    A unified EHR for ABHA-first workflows: patients control access, doctors request scoped views, hospitals move documents into clean FHIR experiences.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href="/auth/register" className="group inline-flex items-center justify-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_16px_34px_rgba(10,129,145,0.26)] ehr-motion active:scale-[0.98]">
                    Create account
                    <ArrowGlyph />
                  </Link>
                  <Link href="/auth/login" className="inline-flex items-center justify-center rounded-full bg-white/70 px-6 py-3.5 text-sm font-medium ring-1 ring-black/5 ehr-motion hover:bg-white">
                    Enter portal
                  </Link>
                </div>
              </div>
            </FadeUp>

            <FadeUp delay={140}>
              <ProductPreview />
            </FadeUp>
          </div>
        </section>

        <section id="platform" className="px-4 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <FadeUp>
              <div className="mb-12 max-w-2xl space-y-4">
                <span className="ehr-eyebrow">Platform</span>
                <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Built around healthcare work, not generic tables.</h2>
              </div>
            </FadeUp>
            <div className="grid gap-5 md:grid-cols-3">
              {FEATURES.map((feature, index) => (
                <FadeUp key={feature.title} delay={index * 80}>
                  <div className="ehr-surface h-full">
                    <div className="ehr-core flex h-full flex-col gap-8 p-6">
                      <div>
                        <p className="text-5xl font-semibold tracking-tight">{feature.metric}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{feature.label}</p>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold tracking-tight">{feature.title}</h3>
                        <p className="text-sm leading-6 text-muted-foreground">{feature.desc}</p>
                      </div>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        <section id="roles" className="px-4 py-24 md:py-32">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.72fr_1.28fr]">
            <FadeUp>
              <div className="space-y-4 md:sticky md:top-28">
                <span className="ehr-eyebrow">Workspaces</span>
                <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Three dashboards, one clinical language.</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Each role gets its own rhythm, but every record renders as readable FHIR cards, timelines, charts, and consent capsules.
                </p>
              </div>
            </FadeUp>
            <div className="space-y-4">
              {ROLES.map((role, index) => (
                <FadeUp key={role.role} delay={index * 80}>
                  <Link href={role.href} className="group block">
                    <div className="ehr-surface">
                      <div className="ehr-core grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                        <span className={`flex size-14 items-center justify-center rounded-full text-sm font-semibold ${role.tone}`}>
                          {role.role.slice(0, 2)}
                        </span>
                        <div>
                          <h3 className="text-xl font-semibold tracking-tight">{role.role}</h3>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{role.desc}</p>
                        </div>
                        <ArrowGlyph />
                      </div>
                    </div>
                  </Link>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        <section id="records" className="px-4 py-24 md:py-32">
          <FadeUp>
            <div className="ehr-surface mx-auto max-w-5xl">
              <div className="ehr-core overflow-hidden p-6 md:p-8">
                <div className="grid gap-8 md:grid-cols-[0.86fr_1.14fr] md:items-center">
                  <div className="space-y-4">
                    <span className="ehr-eyebrow">FHIR view</span>
                    <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Clinical data gets a shape humans can scan.</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Observations become value cards and charts. Encounters become timelines. Consents become privacy decisions with status, scope, and expiry.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {TIMELINE.map((item) => (
                      <div key={item.kind} className="rounded-[1.5rem] bg-muted/55 p-4 ring-1 ring-border/60">
                        <div className="mb-8 flex items-center justify-between">
                          <span className={`size-2.5 rounded-full ${item.tone}`} />
                          <span className="font-mono text-[10px] text-muted-foreground">{item.kind}</span>
                        </div>
                        <p className="text-lg font-semibold tracking-tight">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>
        </section>
      </main>

      <footer className="px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 border-t border-border/70 pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>Unified EHR · ABDM-inspired healthcare workspace</span>
          <span>FHIR R4 · Consent-driven · Audit logged</span>
        </div>
      </footer>
    </div>
  );
}
