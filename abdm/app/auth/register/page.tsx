"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "patient" | "doctor" | "hospital";

const ROLE_META = {
  patient: {
    label: "Patient",
    tone: "bg-teal-500/12 text-teal-700 ring-teal-500/15",
    desc: "Get your ABHA number and control records, consents, uploads, and linked FHIR data.",
  },
  doctor: {
    label: "Doctor",
    tone: "bg-rose-500/12 text-rose-700 ring-rose-500/15",
    desc: "Register with an approved hospital to request access and work with patient records.",
  },
  hospital: {
    label: "Hospital",
    tone: "bg-amber-500/16 text-amber-800 ring-amber-500/20",
    desc: "Register your institution for ingestion, transfers, and doctor onboarding.",
  },
} as const;

interface FormState {
  email: string;
  full_name: string;
  phone: string;
  hospital_id: string;
  specialization: string;
  license_number: string;
  name: string;
  address: string;
  registration_no: string;
}

const INITIAL: FormState = {
  email: "",
  full_name: "",
  phone: "",
  hospital_id: "",
  specialization: "",
  license_number: "",
  name: "",
  address: "",
  registration_no: "",
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

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[1.25rem] bg-muted/55 px-4 py-3 text-sm outline-none ring-1 ring-border transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-muted-foreground/55 focus:bg-white focus:ring-primary/35"
      />
    </div>
  );
}

function FileField({
  label,
  file,
  onChange,
  required,
  hint,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[1.25rem] bg-muted/55 px-4 py-3 text-sm ring-1 ring-border transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white focus-within:bg-white focus-within:ring-primary/35">
        <span className={file ? "truncate font-medium text-foreground" : "text-muted-foreground/70"}>
          {file ? file.name : "Choose PDF file"}
        </span>
        <span className="shrink-0 rounded-full bg-foreground/5 px-3 py-1 text-[11px] font-semibold text-foreground/70">
          Browse
        </span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          required={required}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </label>
      {hint && <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
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

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("patient");
  const [form, setForm] = useState<FormState>(INITIAL);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState("");
  const [abhaResult, setAbhaResult] = useState<{ abha_number: string; abha_address: string } | null>(null);

  function set(key: keyof FormState) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  async function handleGoogleRegister() {
    setOauthLoading(true);
    setError("");
    const supabase = createClient();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setOauthLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if ((role === "doctor" || role === "hospital") && !certificate) {
      setError("Please upload the certificate PDF.");
      return;
    }

    setLoading(true);
    setError("");

    const fields: Record<string, string> = {
      email: form.email,
      role,
      full_name: form.full_name,
      phone: form.phone,
    };
    if (role === "doctor") {
      fields.hospital_id = form.hospital_id;
      fields.specialization = form.specialization;
      fields.license_number = form.license_number;
    }
    if (role === "hospital") {
      fields.name = form.name;
      fields.address = form.address;
      fields.registration_no = form.registration_no;
    }

    // Patient: plain JSON. Doctor/hospital: multipart so the certificate uploads.
    let init: RequestInit;
    if (role === "patient") {
      init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      };
    } else {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      if (certificate) fd.append("certificate", certificate);
      init = { method: "POST", body: fd };
    }

    try {
      const res = await fetch("/api/auth/register", init);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      if (role === "patient" && data.abha_number) {
        setAbhaResult({ abha_number: data.abha_number, abha_address: data.abha_address });
      } else {
        router.push(`/auth/verify-otp?email=${encodeURIComponent(form.email)}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const meta = ROLE_META[role];

  if (abhaResult) {
    return (
      <div className="min-h-dvh px-4 py-8 text-foreground md:py-12">
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md items-center">
          <div className="w-full">
            <div className="mb-8 text-center">
              <AuthBrand />
            </div>
            <div className="ehr-surface">
              <div className="ehr-core overflow-hidden">
                <div className="flex flex-col items-center gap-5 px-6 py-9 text-center sm:px-8">
                  <div className="flex size-16 items-center justify-center rounded-[1.5rem] bg-teal-500/12 text-teal-700 ring-1 ring-teal-500/15">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <span className="ehr-eyebrow">Identity issued</span>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight">ABHA identity ready</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Check your email for the OTP to complete sign-in.
                    </p>
                  </div>
                  <div className="w-full rounded-[1.5rem] bg-muted/55 p-4 text-left ring-1 ring-border/60">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">ABHA Number</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{abhaResult.abha_number}</p>
                    <div className="mt-4 border-t border-border/70 pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">ABHA Address</p>
                      <p className="mt-1 break-words font-mono text-sm text-muted-foreground">{abhaResult.abha_address}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/auth/verify-otp?email=${encodeURIComponent(form.email)}`)}
                    className="group flex w-full items-center justify-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_16px_34px_rgba(10,129,145,0.26)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                  >
                    Enter OTP to sign in
                    <ArrowGlyph />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-4 py-8 text-foreground md:py-12">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="hidden space-y-8 lg:block">
          <AuthBrand />
          <div className="max-w-xl space-y-5">
            <span className="ehr-eyebrow">Create workspace</span>
            <h1 className="text-6xl font-semibold leading-[1.02] tracking-tight">
              Start with the right clinical role.
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground">
              Patient accounts get ABHA identity immediately. Doctor and hospital accounts enter the approval-aware workflow.
            </p>
          </div>
          <div className="ehr-surface max-w-xl">
            <div className="ehr-core grid gap-3 p-4">
              {Object.values(ROLE_META).map((item) => (
                <div key={item.label} className={`rounded-[1.5rem] px-4 py-3 ring-1 ${item.tone}`}>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 opacity-75">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <div className="mb-8 text-center lg:hidden">
            <AuthBrand />
          </div>
          <div className="ehr-surface">
            <div className="ehr-core overflow-hidden">
              <div className="border-b border-border/60 px-6 py-6 sm:px-8">
                <span className="ehr-eyebrow">Registration</span>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">Create account</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Choose the role that matches your healthcare workflow.
                </p>
              </div>

              <div className="space-y-5 px-6 py-6 sm:px-8">
                <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
                  {(Object.keys(ROLE_META) as Role[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRole(r);
                        setCertificate(null);
                        setError("");
                      }}
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

                {role === "patient" && (
                  <>
                    <button
                      type="button"
                      onClick={handleGoogleRegister}
                      disabled={oauthLoading}
                      className="flex w-full items-center justify-center gap-2.5 rounded-full bg-white px-4 py-3 text-sm font-semibold text-foreground ring-1 ring-border transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(24,52,64,0.12)] active:scale-[0.98] disabled:opacity-50"
                    >
                      {oauthLoading ? <Spinner /> : <GoogleIcon />}
                      Sign up with Google
                    </button>
                    <Divider />
                    <p className="text-center text-xs text-muted-foreground">
                      Google sign-up creates a patient account
                    </p>
                  </>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <Field label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} required />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name" placeholder="Priya Sharma" value={form.full_name} onChange={set("full_name")} required />
                    <Field label="Phone" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
                  </div>

                  {role === "doctor" && (
                    <div className="space-y-4 rounded-[1.5rem] bg-rose-500/[0.06] p-4 ring-1 ring-rose-500/15">
                      <p className="text-xs leading-5 text-rose-700">
                        Doctor accounts require an approved hospital. Use the hospital ID provided by your institution.
                      </p>
                      <Field label="Hospital ID" placeholder="Hospital UUID" value={form.hospital_id} onChange={set("hospital_id")} required />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Specialization" placeholder="Cardiology" value={form.specialization} onChange={set("specialization")} required />
                        <Field label="License number" placeholder="MCI-12345" value={form.license_number} onChange={set("license_number")} required />
                      </div>
                      <FileField
                        label="Medical Registration Certificate (PDF)"
                        file={certificate}
                        onChange={setCertificate}
                        required
                        hint="Admin verifies your license against this document before approval."
                      />
                    </div>
                  )}

                  {role === "hospital" && (
                    <div className="space-y-4 rounded-[1.5rem] bg-amber-500/[0.08] p-4 ring-1 ring-amber-500/20">
                      <p className="text-xs leading-5 text-amber-800">
                        Hospital accounts require admin approval before activation.
                      </p>
                      <Field label="Hospital / Institution name" placeholder="Apollo Hospitals" value={form.name} onChange={set("name")} required />
                      <Field label="Address" placeholder="123, MG Road, Bengaluru" value={form.address} onChange={set("address")} required />
                      <Field label="Registration number" placeholder="KA-HOS-2024-001" value={form.registration_no} onChange={set("registration_no")} required />
                      <FileField
                        label="Registration Certificate (PDF)"
                        file={certificate}
                        onChange={setCertificate}
                        required
                        hint="Admin verifies your institution against this document before approval."
                      />
                    </div>
                  )}

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
                        Creating account
                      </>
                    ) : (
                      <>
                        {role === "patient" ? "Create and get ABHA" : `Register as ${ROLE_META[role].label}`}
                        <ArrowGlyph />
                      </>
                    )}
                  </button>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/auth/login" className="font-semibold text-primary transition-colors hover:text-primary/75">
                    Sign in
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
