"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const OTP_LENGTH = 6;

const DASHBOARD: Record<string, string> = {
  patient: "/dashboard/patient",
  doctor: "/dashboard/doctor",
  hospital: "/dashboard/hospital",
  admin: "/dashboard/admin",
};

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

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleInput(i: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = char;
    setOtp(next);
    if (char && i < OTP_LENGTH - 1) {
      inputsRef.current[i + 1]?.focus();
    }
    if (next.every((c) => c) && next.join("").length === OTP_LENGTH) {
      submitOtp(next.join(""));
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((c, i) => {
      next[i] = c;
    });
    setOtp(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputsRef.current[focusIdx]?.focus();
    if (pasted.length === OTP_LENGTH) submitOtp(pasted);
  }

  async function submitOtp(token: string) {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (verifyErr || !data.user) {
      setError(verifyErr?.message ?? "Invalid OTP. Check and try again.");
      setLoading(false);
      setOtp(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
      return;
    }

    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const profile = await res.json();
        router.push(DASHBOARD[profile.role] ?? "/dashboard/patient");
      } else {
        router.push("/dashboard/patient");
      }
    } catch {
      router.push("/dashboard/patient");
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setResent(false);
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
      setCountdown(60);
      setOtp(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } catch {
      // silent
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = otp.join("");
    if (token.length !== OTP_LENGTH) {
      setError("Enter all 6 digits.");
      return;
    }
    await submitOtp(token);
  }

  return (
    <div className="min-h-dvh px-4 py-8 text-foreground md:py-12">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden space-y-8 lg:block">
          <AuthBrand />
          <div className="max-w-xl space-y-5">
            <span className="ehr-eyebrow">Email verification</span>
            <h1 className="text-6xl font-semibold leading-[1.02] tracking-tight">
              One-time code, then straight to care.
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground">
              The OTP confirms your session before the app opens the matching patient, doctor, hospital, or admin dashboard.
            </p>
          </div>
          <div className="ehr-surface max-w-xl">
            <div className="ehr-core grid gap-3 p-4">
              {["Secure Supabase session", "Profile role lookup", "Dashboard handoff"].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-[1.5rem] bg-muted/55 px-4 py-3 ring-1 ring-border/60">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm font-medium">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <AuthBrand />
          </div>

          <div className="ehr-surface">
            <div className="ehr-core overflow-hidden">
              <div className="border-b border-border/60 px-6 py-7 text-center sm:px-8">
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary ring-1 ring-primary/15">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <path d="M22 6l-10 7L2 6" />
                  </svg>
                </div>
                <span className="ehr-eyebrow mx-auto">Check your email</span>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight">Enter verification code</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  6-digit code sent to <span className="font-semibold text-foreground">{email}</span>
                </p>
              </div>

              <div className="px-6 py-6 sm:px-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="flex justify-center gap-2" onPaste={handlePaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          inputsRef.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleInput(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        disabled={loading}
                        className={`h-13 min-w-0 flex-1 rounded-[1.15rem] text-center text-lg font-semibold outline-none ring-1 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                          digit
                            ? "bg-primary/10 text-primary ring-primary/25"
                            : "bg-muted/55 text-foreground ring-border focus:bg-white focus:ring-primary/35"
                        }`}
                      />
                    ))}
                  </div>

                  {loading && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Spinner />
                      Verifying
                    </div>
                  )}

                  {error && (
                    <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-center text-xs leading-5 text-red-700 ring-1 ring-red-500/15">
                      {error}
                    </p>
                  )}
                  {resent && (
                    <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-center text-xs leading-5 text-emerald-700 ring-1 ring-emerald-500/15">
                      OTP resent. Check your inbox.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || otp.join("").length !== OTP_LENGTH}
                    className="group flex w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_16px_34px_rgba(10,129,145,0.26)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-45"
                  >
                    Verify and continue
                    <span className="flex size-7 items-center justify-center rounded-full bg-white/20 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-px group-hover:scale-105">
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                        <path d="M2 9L9 2M9 2H3M9 2V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    onClick={handleResend}
                    disabled={countdown > 0}
                    className="text-xs font-medium text-muted-foreground transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-foreground disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
                  >
                    {countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
                  </button>
                </div>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Wrong email?{" "}
                  <Link href="/auth/login" className="font-semibold text-primary transition-colors hover:text-primary/75">
                    Go back
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

export default function VerifyOtpPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
