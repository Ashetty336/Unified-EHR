"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Building2,
  ClipboardList,
  FileSearch,
  LayoutGrid,
  Pill,
  Search as SearchIcon,
  ShieldCheck,
  Stethoscope,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import {
  DashboardShell,
  type NavGroup,
} from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/fhir/status-badge";
import { HospitalGroupedRecords } from "@/components/fhir/hospital-grouped-records";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  roleProfile: {
    doctor_id: string;
    hospital_id: string | null;
    specialization: string | null;
    license_number: string | null;
    approval_status: string;
    hospitals?: {
      name: string | null;
      registration_no: string | null;
      address: string | null;
      phone: string | null;
      approval_status: string | null;
    } | null;
  } | null;
}

interface PatientLookup {
  user_id: string;
  abha_number: string;
  abha_address: string;
}

interface ConsentRecord {
  consent_id: string;
  status: string;
  access_type: string;
  resource_scope: string[];
  granted_at: string | null;
  expires_at: string | null;
  patients?: { abha_number: string; abha_address: string };
}

interface ConsentRequest {
  request_id: string;
  abha_number: string;
  access_type: string;
  resource_scope: string[];
  status: string;
  requested_at: string;
  purpose: string | null;
}

type Tab =
  | "overview"
  | "search"
  | "request"
  | "records"
  | "prescribe"
  | "access";

const NAV: NavGroup[] = [
  {
    label: "Account",
    items: [{ id: "overview", label: "Overview", icon: LayoutGrid }],
  },
  {
    label: "Patient Workflow",
    items: [
      { id: "search", label: "Patient Search", icon: SearchIcon },
      { id: "request", label: "Request Data", icon: ArrowLeftRight },
      { id: "records", label: "Patient Data", icon: FileSearch },
      { id: "prescribe", label: "Prescribe", icon: Pill },
    ],
  },
  {
    label: "Privacy",
    items: [{ id: "access", label: "Access Status", icon: ShieldCheck }],
  },
];

const TAB_META: Record<Tab, { title: string; desc: string }> = {
  overview: { title: "Overview", desc: "Your practitioner profile." },
  search: { title: "Patient Search", desc: "Look up a patient by ABHA number." },
  request: { title: "Request Data Access", desc: "Send a consent request to a patient." },
  records: { title: "Patient Data", desc: "View FHIR records for the active patient." },
  prescribe: { title: "Prescribe", desc: "Create a MedicationRequest for the active patient." },
  access: { title: "Access Status", desc: "All your consent requests and granted access." },
};

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function DoctorDashboard() {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [activePatient, setActivePatient] = React.useState<PatientLookup | null>(null);

  React.useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setProfile(d))
      .catch(() => {});
  }, []);

  const meta = TAB_META[tab];
  const rp = profile?.roleProfile;

  return (
    <DashboardShell
      roleLabel="Doctor Portal"
      groups={NAV}
      active={tab}
      onSelect={(id) => setTab(id as Tab)}
      userName={profile?.full_name ?? null}
      userEmail={profile?.email ?? null}
      userMeta={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {rp?.hospitals?.name && (
            <Badge variant="secondary" className="gap-1">
              <Building2 className="size-3" />
              {rp.hospitals.name}
            </Badge>
          )}
          {rp?.specialization && (
            <Badge variant="secondary" className="gap-1">
              <Stethoscope className="size-3" />
              {rp.specialization}
            </Badge>
          )}
          {rp?.license_number && (
            <Badge variant="outline" className="font-mono">
              Lic: {rp.license_number}
            </Badge>
          )}
          {rp?.approval_status && <StatusBadge status={rp.approval_status} />}
          {activePatient && (
            <Badge variant="default" className="gap-1">
              <UserPlus className="size-3" />
              Active patient: {activePatient.abha_number}
            </Badge>
          )}
        </div>
      }
      pageTitle={meta.title}
      pageDescription={meta.desc}
    >
      {tab === "overview" && <OverviewPanel profile={profile} />}
      {tab === "search" && (
        <PatientSearch
          onFound={(p) => {
            setActivePatient(p);
            toast.success(`Active patient set: ${p.abha_number}`);
            setTab("records");
          }}
        />
      )}
      {tab === "request" && <RequestData activePatient={activePatient} />}
      {tab === "records" && <PatientData patient={activePatient} onChange={() => setTab("search")} />}
      {tab === "prescribe" && <PrescribePanel patient={activePatient} />}
      {tab === "access" && <AccessStatus />}
    </DashboardShell>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────────

function OverviewPanel({ profile }: { profile: UserProfile | null }) {
  if (!profile) return <Skeleton className="h-48" />;
  const rp = profile.roleProfile;
  const items = [
    { k: "Full Name", v: profile.full_name ?? "—" },
    { k: "Email", v: profile.email },
    { k: "Phone", v: profile.phone ?? "—" },
    { k: "Specialization", v: rp?.specialization ?? "—" },
    { k: "License Number", v: rp?.license_number ?? "—" },
    { k: "Hospital", v: rp?.hospitals?.name ?? "—" },
    {
      k: "Hospital Reg. No.",
      v: rp?.hospitals?.registration_no ?? "—",
    },
    {
      k: "Hospital Phone",
      v: rp?.hospitals?.phone ?? "—",
    },
    {
      k: "Member Since",
      v: new Date(profile.created_at).toLocaleDateString(),
    },
  ];
  return (
    <div className="ehr-surface">
      <div className="ehr-core overflow-hidden">
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8">
          <div>
            <span className="ehr-eyebrow">Practitioner Profile</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              {profile.full_name ?? "Doctor"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {rp?.specialization ?? "Specialization pending"} · License {rp?.license_number ?? "pending"}
            </p>
            {rp?.hospitals?.name && (
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <Building2 className="size-4 text-primary" strokeWidth={1.6} />
                {rp.hospitals.name}
                {rp.hospitals.registration_no && (
                  <span className="font-mono text-xs text-muted-foreground">
                    · {rp.hospitals.registration_no}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="rounded-[1.5rem] bg-rose-500/10 px-5 py-4 text-rose-700 ring-1 ring-rose-500/15">
            <Stethoscope className="mb-3 size-5" strokeWidth={1.6} />
            <p className="text-sm font-semibold">Consent-first care</p>
            <p className="mt-1 text-xs leading-5 text-rose-700/70">
              Search, request, view, prescribe, and audit from one workflow.
            </p>
          </div>
        </div>
        <div className="grid border-t border-border/60 sm:grid-cols-2 md:grid-cols-3">
          {items.map((r) => (
            <div key={r.k} className="border-border/60 p-5 md:border-r md:[&:nth-child(3n)]:border-r-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {r.k}
              </p>
              <p className="mt-2 text-sm font-semibold">{r.v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Patient Search ────────────────────────────────────────────────────────────

function PatientSearch({ onFound }: { onFound: (p: PatientLookup) => void }) {
  const [abha, setAbha] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [found, setFound] = React.useState<PatientLookup | null>(null);
  const [error, setError] = React.useState("");

  const lookup = async () => {
    if (!abha.trim()) return;
    setLoading(true);
    setError("");
    setFound(null);
    try {
      const res = await fetch(
        `/api/doctor/patient-lookup?abha_number=${encodeURIComponent(abha.trim())}`,
      );
      const json = await res.json();
      if (res.ok) setFound(json);
      else setError(json.error ?? "Patient not found.");
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lookup by ABHA Number</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={abha}
            onChange={(e) => {
              setAbha(e.target.value);
              setFound(null);
              setError("");
            }}
            placeholder="XX-XXXX-XXXX-XXXX"
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <Button onClick={lookup} disabled={loading || !abha.trim()}>
            {loading ? "Looking up..." : "Find Patient"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {found && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-primary">
                  Patient Found
                </p>
                <StatusBadge status="approved" />
              </div>
              <div>
                <p className="font-mono text-sm font-medium">{found.abha_number}</p>
                <p className="text-xs text-muted-foreground">{found.abha_address}</p>
              </div>
              <Button onClick={() => onFound(found)} size="sm">
                Set as Active Patient →
              </Button>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Request Data ──────────────────────────────────────────────────────────────

function RequestData({
  activePatient,
}: {
  activePatient: PatientLookup | null;
}) {
  const [abha, setAbha] = React.useState(activePatient?.abha_number ?? "");
  const [accessType, setAccessType] = React.useState<"full" | "resource_level">(
    "full",
  );
  const [scope, setScope] = React.useState<string[]>([]);
  const [duration, setDuration] = React.useState("30");
  const [purpose, setPurpose] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!activePatient?.abha_number) return;
    const id = window.setTimeout(() => setAbha(activePatient.abha_number), 0);
    return () => window.clearTimeout(id);
  }, [activePatient]);

  const resourceTypes = ["Observation", "MedicationRequest", "Patient", "DocumentReference"];
  const toggleScope = (r: string) =>
    setScope((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

  const submit = async () => {
    if (!abha) {
      toast.error("ABHA number required.");
      return;
    }
    if (accessType === "resource_level" && scope.length === 0) {
      toast.error("Select at least one resource type.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/consent-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          abha_number: abha,
          access_type: accessType,
          resource_scope: accessType === "resource_level" ? scope : [],
          requested_duration: Number(duration),
          purpose: purpose || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success("Consent request sent to patient.");
        setPurpose("");
      } else {
        toast.error(json.error ?? "Request failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Send Consent Request</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label htmlFor="rd-abha">Patient ABHA Number</Label>
          <Input
            id="rd-abha"
            value={abha}
            onChange={(e) => setAbha(e.target.value)}
            placeholder="XX-XXXX-XXXX-XXXX"
            className="mt-2"
          />
        </div>

        <div>
          <Label>Access Type</Label>
          <Tabs
            value={accessType}
            onValueChange={(v) => setAccessType(v as "full" | "resource_level")}
            className="mt-2"
          >
            <TabsList className="w-full">
              <TabsTrigger value="full" className="flex-1">Full Access</TabsTrigger>
              <TabsTrigger value="resource_level" className="flex-1">Resource Level</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {accessType === "resource_level" && (
          <div>
            <Label>Resources</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {resourceTypes.map((r) => (
                <Toggle
                  key={r}
                  pressed={scope.includes(r)}
                  onPressedChange={() => toggleScope(r)}
                  variant="outline"
                  size="sm"
                >
                  {r}
                </Toggle>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>Duration (days)</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["7", "14", "30", "60", "90"].map((d) => (
                <SelectItem key={d} value={d}>
                  {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="rd-purpose">Purpose (optional)</Label>
          <Input
            id="rd-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Follow-up consultation"
            className="mt-2"
          />
        </div>

        <Button onClick={submit} disabled={loading || !abha}>
          {loading ? "Sending..." : "Send Consent Request"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Patient Data ──────────────────────────────────────────────────────────────

function PatientData({
  patient,
  onChange,
}: {
  patient: PatientLookup | null;
  onChange: () => void;
}) {
  if (!patient) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <SearchIcon className="mx-auto mb-2 size-8 opacity-30" />
          <p className="text-sm text-muted-foreground">
            No active patient. Use Patient Search first.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onChange}>
            Go to Patient Search
          </Button>
        </CardContent>
      </Card>
    );
  }

  const abha = encodeURIComponent(patient.abha_number);
  return (
    <HospitalGroupedRecords
      basePath={`/api/fhir/records/by-abha/${abha}/by-hospital`}
      uploadsPath={`/api/fhir/records/by-abha/${abha}`}
    />
  );
}

// ─── Prescribe ─────────────────────────────────────────────────────────────────

function PrescribePanel({ patient }: { patient: PatientLookup | null }) {
  const [medication, setMedication] = React.useState("");
  const [dosage, setDosage] = React.useState("");
  const [status, setStatus] = React.useState("active");
  const [loading, setLoading] = React.useState(false);

  if (!patient) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <SearchIcon className="mx-auto mb-2 size-8 opacity-30" />
          <p className="text-sm text-muted-foreground">
            No active patient. Use Patient Search first.
          </p>
        </CardContent>
      </Card>
    );
  }

  const submit = async () => {
    if (!medication.trim()) {
      toast.error("Medication required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/fhir/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          abha_number: patient.abha_number,
          medication,
          status,
          dosageInstruction: dosage || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Prescription created. FHIR ID: ${json.fhir_id}`);
        setMedication("");
        setDosage("");
      } else {
        toast.error(json.error ?? "Failed to create prescription.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Prescription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-3">
              <p className="text-xs uppercase tracking-wide text-primary">
                Patient
              </p>
              <p className="font-mono text-sm font-medium">{patient.abha_number}</p>
            </CardContent>
          </Card>

          <div>
            <Label htmlFor="med">Medication</Label>
            <Input
              id="med"
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              placeholder="e.g. Amoxicillin 500mg"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="dosage">Dosage Instructions</Label>
            <Textarea
              id="dosage"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g. 1 tablet twice daily for 7 days"
              className="mt-2"
              rows={3}
            />
          </div>

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on-hold">On Hold</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Creating..." : "Create MedicationRequest"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {[
            {
              title: "Consent Required",
              desc: "MedicationRequest scope must be in active consent (Full or resource_level including MedicationRequest).",
            },
            {
              title: "FHIR Standard",
              desc: "Creates a MedicationRequest resource on HAPI FHIR server linked to patient's FHIR Patient resource.",
            },
            {
              title: "Audit Logged",
              desc: "Writes are audit-logged with your doctor ID, patient ID, consent ID, and timestamp.",
            },
          ].map((n) => (
            <div key={n.title} className="border-l-2 border-primary/40 pl-3">
              <p className="font-medium">{n.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{n.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Access Status ─────────────────────────────────────────────────────────────

function AccessStatus() {
  const [consents, setConsents] = React.useState<ConsentRecord[]>([]);
  const [requests, setRequests] = React.useState<ConsentRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<
    "all" | "approved" | "pending" | "rejected" | "revoked"
  >("all");

  React.useEffect(() => {
    (async () => {
      try {
        const [cRes, rRes] = await Promise.all([
          fetch("/api/consents"),
          fetch("/api/consent-requests"),
        ]);
        const [cJson, rJson] = await Promise.all([cRes.json(), rRes.json()]);
        if (cRes.ok && Array.isArray(cJson)) setConsents(cJson);
        if (rRes.ok && Array.isArray(rJson)) setRequests(rJson);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const merged = [
    ...consents.map((c) => ({
      id: c.consent_id,
      abha: c.patients?.abha_number ?? "—",
      access:
        c.access_type === "full"
          ? "Full"
          : c.resource_scope.join(", ") || "—",
      status: c.status,
      date: c.granted_at ?? "",
      expires: c.expires_at,
      kind: "Consent",
    })),
    ...requests.map((r) => ({
      id: r.request_id,
      abha: r.abha_number,
      access:
        r.access_type === "full"
          ? "Full"
          : r.resource_scope.join(", ") || "—",
      status: r.status,
      date: r.requested_at,
      expires: null as string | null,
      kind: "Request",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = filter === "all" ? merged : merged.filter((r) => r.status === filter);

  const counts = merged.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Approved", key: "approved", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Pending", key: "pending", color: "text-amber-600 dark:text-amber-400" },
          { label: "Rejected", key: "rejected", color: "text-red-600 dark:text-red-400" },
          { label: "Revoked", key: "revoked", color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.key}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className={`mt-1 text-2xl font-semibold ${s.color}`}>
                {counts[s.key] ?? 0}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="revoked">Revoked</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <Skeleton className="h-48" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="mx-auto mb-2 size-8 opacity-30" />
            No records found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge variant="outline" className="mb-2 text-xs">
                      {r.kind}
                    </Badge>
                    <p className="font-mono text-sm font-medium">{r.abha}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wide">
                      Access
                    </p>
                    <p className="mt-0.5">{r.access}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wide">
                      {r.kind === "Consent" ? "Granted" : "Requested"}
                    </p>
                    <p className="mt-0.5">
                      {r.date ? new Date(r.date).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  {r.expires && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground uppercase tracking-wide">
                        Expires
                      </p>
                      <p className="mt-0.5">
                        {new Date(r.expires).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
