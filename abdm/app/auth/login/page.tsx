"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ROLE_META = {
  patient: {
    label: "Patient",
    tone: "bg-teal-500/12 text-teal-700 ring-teal-500/15",
    desc: "Access your health timeline, linked FHIR records, and consent controls.",
  },
  doctor: {
    label: "Doctor",
    tone: "bg-rose-500/12 text-rose-700 ring-rose-500/15",
    desc: "Request consent, view patient records, and create clinical prescriptions.",
  },
  hospital: {
    label: "Hospital",
    tone: "bg-amber-500/16 text-amber-800 ring-amber-500/20",
    desc: "Manage institution workflows, ingestion, doctors, and transfers.",
  },
} as const;

type Role = keyof typeof ROLE_META;

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-white/20 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-px group-hover:scale-105">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <path d="M2 9L9 2M9 2H3M9 2V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function AuthBrand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-sm font-semibold tracking-tight text-foreground ring-1 ring-black/5 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      Unified EHR
    </Link>
  );
}

function Divider() {
  return (
    <div className="my-1 flex items-center gap-3">
      <div className="h-px flex-1 bg-border/70" />
      <span className="text-[11px] text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-border/70" />
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = (params.get("role") as Role) || "patient";
  const registered = params.get("registered") === "1";
  const urlError = params.get("error");

  const [role, setRole] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState(urlError ?? "");

  const meta = ROLE_META[role];

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send OTP");
        return;
      }

      router.push(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setOauthLoading(true);
    setError("");
    const supabase = createClient();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setOauthLoading(false);
    }
  }

  return (
    <div className="min-h-dvh px-4 py-8 text-foreground md:py-12">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="hidden space-y-8 lg:block">
          <AuthBrand />
          <div className="max-w-xl space-y-5">
            <span className="ehr-eyebrow">Secure access</span>
            <h1 className="text-6xl font-semibold leading-[1.02] tracking-tight">
              Sign in to your clinical workspace.
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground">
              Continue with OTP or Google. Your dashboard opens with the same consent-first FHIR experience across roles.
            </p>
          </div>
          <div className="grid max-w-xl grid-cols-3 gap-3">
            {Object.values(ROLE_META).map((item) => (
              <div key={item.label} className={`rounded-[1.5rem] p-4 ring-1 ${item.tone}`}>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-2 text-xs leading-5 opacity-75">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <AuthBrand />
          </div>

          <div className="ehr-surface">
            <div className="ehr-core overflow-hidden">
              <div className="border-b border-border/60 px-6 py-6 sm:px-8">
                <span className="ehr-eyebrow">Welcome back</span>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">Sign in</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {registered ? "Account created. Sign in to continue." : "Enter your email to receive an OTP."}
                </p>
              </div>

              <div className="space-y-5 px-6 py-6 sm:px-8">
                <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
                  {(Object.keys(ROLE_META) as Role[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`rounded-full px-3 py-2 text-xs font-semibold transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                        role === r ? "bg-card text-foreground shadow-[0_10px_24px_rgba(22,50,63,0.10)]" : "text-muted-foreground"
                      }`}
                    >
                      {ROLE_META[r].label}
                    </button>
                  ))}
                </div>

                <div className={`rounded-[1.5rem] px-4 py-3 text-sm leading-6 ring-1 ${meta.tone}`}>
                  {meta.desc}
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={oauthLoading}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full bg-white px-4 py-3 text-sm font-semibold text-foreground ring-1 ring-border transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(24,52,64,0.12)] active:scale-[0.98] disabled:opacity-50"
                >
                  {oauthLoading ? <Spinner /> : <GoogleIcon />}
                  Continue with Google
                </button>

                <Divider />

                <form onSubmit={handleOtp} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Email address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-[1.25rem] bg-muted/55 px-4 py-3 text-sm outline-none ring-1 ring-border transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-muted-foreground/55 focus:bg-white focus:ring-primary/35"
                    />
                  </div>

                  {error && (
                    <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-xs leading-5 text-red-700 ring-1 ring-red-500/15">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group flex w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_16px_34px_rgba(10,129,145,0.26)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Spinner />
                        Sending OTP
                      </>
                    ) : (
                      <>
                        Send OTP
                        <ArrowGlyph />
                      </>
                    )}
                  </button>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                  No account?{" "}
                  <Link href="/auth/register" className="font-semibold text-primary transition-colors hover:text-primary/75">
                    Register here
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
