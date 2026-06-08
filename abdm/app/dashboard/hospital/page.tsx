"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Building2,
  ClipboardList,
  Cloud,
  FileSearch,
  LayoutGrid,
  Stethoscope,
  Upload,
  Users,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
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
    hospital_id: string;
    name: string;
    address: string | null;
    phone: string | null;
    registration_no: string | null;
    approval_status: string;
  } | null;
}

interface Doctor {
  doctor_id: string;
  specialization: string;
  license_number: string;
  approval_status: string;
  created_at: string;
  users: { full_name: string; email: string };
}

interface ConsentRequest {
  request_id: string;
  abha_number: string;
  access_type: string;
  resource_scope: string[];
  status: string;
  requested_at: string;
  purpose: string | null;
  requester_type: string;
}

type Tab = "overview" | "ingestion" | "records" | "transfer" | "doctors" | "requests";

const NAV: NavGroup[] = [
  {
    label: "Account",
    items: [{ id: "overview", label: "Overview", icon: LayoutGrid }],
  },
  {
    label: "Patient Data",
    items: [
      { id: "ingestion", label: "Data Ingestion", icon: Upload },
      { id: "records", label: "Patient Records", icon: FileSearch },
      { id: "transfer", label: "Request Transfer", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "doctors", label: "Doctors", icon: Stethoscope },
      { id: "requests", label: "Consent Log", icon: ClipboardList },
    ],
  },
];

const TAB_META: Record<Tab, { title: string; desc: string }> = {
  overview: { title: "Overview", desc: "Hospital profile and operations summary." },
  ingestion: { title: "Data Ingestion", desc: "Upload C-CDA / PDF and convert to FHIR." },
  records: { title: "Patient Records", desc: "View consented patient FHIR resources." },
  transfer: { title: "Request Transfer", desc: "Send a consent request for patient data access." },
  doctors: { title: "Doctors", desc: "Manage approved, pending, and rejected doctors." },
  requests: { title: "Consent Log", desc: "All outgoing consent requests." },
};

export default function HospitalDashboard() {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [profile, setProfile] = React.useState<UserProfile | null>(null);

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
      roleLabel="Hospital Portal"
      groups={NAV}
      active={tab}
      onSelect={(id) => setTab(id as Tab)}
      userName={rp?.name ?? profile?.full_name ?? null}
      userEmail={profile?.email ?? null}
      userMeta={
        rp ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1">
              <Building2 className="size-3" />
              {rp.name}
            </Badge>
            {rp.registration_no && (
              <Badge variant="outline" className="font-mono">
                Reg: {rp.registration_no}
              </Badge>
            )}
            <StatusBadge status={rp.approval_status} />
          </div>
        ) : null
      }
      pageTitle={meta.title}
      pageDescription={meta.desc}
    >
      {tab === "overview" && <OverviewPanel profile={profile} />}
      {tab === "ingestion" && <DataIngestion />}
      {tab === "records" && <PatientRecordsPanel />}
      {tab === "transfer" && <TransferData />}
      {tab === "doctors" && <DoctorsPanel />}
      {tab === "requests" && <RequestsLog />}
    </DashboardShell>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────────

function OverviewPanel({ profile }: { profile: UserProfile | null }) {
  if (!profile) return <Skeleton className="h-48" />;
  const rp = profile.roleProfile;
  const items = [
    { k: "Hospital Name", v: rp?.name ?? "—" },
    { k: "Registration No.", v: rp?.registration_no ?? "—" },
    { k: "Phone", v: rp?.phone ?? profile.phone ?? "—" },
    { k: "Address", v: rp?.address ?? "—" },
    { k: "Email", v: profile.email },
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
            <span className="ehr-eyebrow">Institution Profile</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              {rp?.name ?? "Hospital"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {rp?.address ?? "Address pending"} · Registration {rp?.registration_no ?? "pending"}
            </p>
          </div>
          <div className="rounded-[1.5rem] bg-amber-500/15 px-5 py-4 text-amber-800 ring-1 ring-amber-500/20">
            <Building2 className="mb-3 size-5" strokeWidth={1.6} />
            <p className="text-sm font-semibold">FHIR operations hub</p>
            <p className="mt-1 text-xs leading-5 text-amber-800/70">
              Upload, convert, request access, and manage clinical teams.
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

// ─── Data Ingestion ────────────────────────────────────────────────────────────

function DataIngestion() {
  const [abhaNumber, setAbhaNumber] = React.useState("");
  const [inputType, setInputType] = React.useState<"ccda" | "pdf" | "json">("ccda");
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file || !abhaNumber.trim()) {
      toast.error("Patient ABHA number and file required.");
      return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("abhaNumber", abhaNumber.trim());
    fd.append("inputType", inputType);
    try {
      const res = await fetch("/api/fhir/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok) {
        toast.success("FHIR bundle stored successfully.");
        setFile(null);
        setAbhaNumber("");
        if (fileRef.current) fileRef.current.value = "";
      } else {
        toast.error(json.error ?? "Upload failed.");
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
          <CardTitle className="text-base">Upload Clinical Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="abha">Patient ABHA Number</Label>
            <Input
              id="abha"
              value={abhaNumber}
              onChange={(e) => setAbhaNumber(e.target.value)}
              placeholder="14-digit ABHA number"
              className="mt-2"
            />
          </div>

          <div>
            <Label>Document Type</Label>
            <Tabs
              value={inputType}
              onValueChange={(v) => {
                setInputType(v as "ccda" | "pdf" | "json");
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="mt-2"
            >
              <TabsList className="w-full">
                <TabsTrigger value="ccda" className="flex-1">C-CDA (XML)</TabsTrigger>
                <TabsTrigger value="pdf" className="flex-1">PDF Report</TabsTrigger>
                <TabsTrigger value="json" className="flex-1">JSON</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div>
            <Label>File</Label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-4 py-8 text-center transition-colors hover:border-primary hover:bg-accent/50"
            >
              <Cloud className="size-7 text-muted-foreground group-hover:text-primary" />
              <p className="text-sm font-medium">
                {file
                  ? file.name
                  : `Drop ${
                      inputType === "ccda"
                        ? "C-CDA XML"
                        : inputType === "json"
                          ? "JSON"
                          : "PDF"
                    } or click`}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={
                  inputType === "ccda"
                    ? ".xml,.cda"
                    : inputType === "json"
                      ? ".json,application/json"
                      : ".pdf"
                }
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </button>
          </div>

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading
              ? "Processing..."
              : inputType === "ccda"
                ? "Convert C-CDA → FHIR"
                : inputType === "json"
                  ? "Convert JSON → FHIR"
                  : "Process PDF → FHIR"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {[
            {
              step: "01",
              title: "Upload",
              desc:
                inputType === "ccda"
                  ? "C-CDA XML clinical document."
                  : inputType === "json"
                    ? "JSON document conforming to the ExamplePatient schema."
                    : "Digital PDF report (searchable text).",
            },
            {
              step: "02",
              title: "Convert",
              desc:
                inputType === "ccda"
                  ? "Microsoft FHIR Converter via converter/bin."
                  : inputType === "json"
                    ? "Microsoft FHIR Converter applies the JSON Liquid template."
                    : "pdfjs-dist extracts text → regex-structured record → direct FHIR Bundle (Patient + Observations + MedicationRequests + Conditions).",
            },
            { step: "03", title: "Store", desc: "FHIR Bundle stored on HAPI FHIR server." },
            { step: "04", title: "Link", desc: "fhir_patient_id backfilled into patient record." },
          ].map((s) => (
            <div key={s.step} className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-mono text-primary">
                {s.step}
              </div>
              <div>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Patient Records (by ABHA) ─────────────────────────────────────────────────

function PatientRecordsPanel() {
  const [abha, setAbha] = React.useState("");
  const [committedAbha, setCommittedAbha] = React.useState<string | null>(null);

  const submit = () => {
    const trimmed = abha.trim();
    if (!trimmed) return;
    setCommittedAbha(trimmed);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <Input
            value={abha}
            onChange={(e) => setAbha(e.target.value)}
            placeholder="Patient ABHA number"
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button onClick={submit} disabled={!abha.trim()}>
            Fetch Records
          </Button>
        </CardContent>
      </Card>

      {!committedAbha && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Enter the patient ABHA number to load every hospital record they have
            granted you access to via consent.
          </CardContent>
        </Card>
      )}

      {committedAbha && (
        <HospitalGroupedRecords
          basePath={`/api/fhir/records/by-abha/${encodeURIComponent(committedAbha)}/by-hospital`}
          uploadsPath={`/api/fhir/records/by-abha/${encodeURIComponent(committedAbha)}`}
        />
      )}
    </div>
  );
}

// ─── Transfer Data ─────────────────────────────────────────────────────────────

function TransferData() {
  const [abhaNumber, setAbhaNumber] = React.useState("");
  const [accessType, setAccessType] = React.useState<"full" | "resource_level">("full");
  const [scope, setScope] = React.useState<string[]>([]);
  const [duration, setDuration] = React.useState("30");
  const [purpose, setPurpose] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const resourceTypes = ["Observation", "MedicationRequest", "Patient", "DocumentReference"];

  const toggleScope = (r: string) => {
    setScope((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  };

  const submit = async () => {
    if (!abhaNumber) {
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
          abha_number: abhaNumber,
          access_type: accessType,
          resource_scope: accessType === "resource_level" ? scope : [],
          requested_duration: Number(duration),
          purpose: purpose || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success("Consent request sent to patient.");
        setAbhaNumber("");
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request Patient Data Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="abha-tx">Patient ABHA Number</Label>
            <Input
              id="abha-tx"
              value={abhaNumber}
              onChange={(e) => setAbhaNumber(e.target.value)}
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
              <Label>Resource Types</Label>
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
            <Label htmlFor="purpose">Purpose (optional)</Label>
            <Input
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Emergency referral, Specialist consultation"
              className="mt-2"
            />
          </div>

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Sending..." : "Send Consent Request"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Transfer Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {[
            { n: "1", title: "Request Access", desc: "Enter patient ABHA number and specify scope." },
            { n: "2", title: "Patient Approves", desc: "Patient reviews and approves/rejects from their dashboard." },
            { n: "3", title: "Fetch FHIR Data", desc: "Backend validates consent and fetches FHIR resources from HAPI." },
            { n: "4", title: "Render", desc: "Data rendered as cards, charts, and timelines — never raw FHIR JSON." },
          ].map((s) => (
            <div key={s.n} className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-mono text-primary">
                {s.n}
              </div>
              <div>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Doctors ───────────────────────────────────────────────────────────────────

function DoctorsPanel() {
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"approved" | "pending" | "rejected">("approved");

  React.useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      setLoading(true);
      fetch("/api/hospital/doctors")
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (Array.isArray(j)) {
            setDoctors(j.filter((d: Doctor) => d.approval_status === filter));
          }
        })
        .catch(() => {
          if (!cancelled) setDoctors([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [filter]);

  return (
    <div className="space-y-6">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <Skeleton className="h-48" />
      ) : doctors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-8 opacity-30" />
            No {filter} doctors found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {doctors.map((d) => (
            <Card key={d.doctor_id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Stethoscope className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{d.users.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.users.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.specialization} · {d.license_number}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={d.approval_status} />
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Requests Log ──────────────────────────────────────────────────────────────

function RequestsLog() {
  const [requests, setRequests] = React.useState<ConsentRequest[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/consent-requests")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) setRequests(j);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-48" />;

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <ClipboardList className="mx-auto mb-2 size-8 opacity-30" />
          No consent requests sent yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {requests.map((r) => (
        <Card key={r.request_id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  ABHA
                </p>
                <p className="font-mono text-sm font-medium">{r.abha_number}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground uppercase tracking-wide">Access</p>
                <p className="mt-0.5">
                  {r.access_type === "full" ? "Full" : r.resource_scope.join(", ")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase tracking-wide">Requested</p>
                <p className="mt-0.5">
                  {new Date(r.requested_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            {r.purpose && (
              <p className="border-t pt-2 text-xs text-muted-foreground">
                {r.purpose}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
