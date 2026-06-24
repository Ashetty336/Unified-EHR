"use client";

import * as React from "react";
import {
  Building2,
  ChevronRight,
  Cloud,
  FileHeart,
  FileText,
  Folder,
  Heart,
  IdCard,
  Languages,
  LayoutGrid,
  Link2,
  Pill,
  ShieldCheck,
  Stethoscope,
  Upload,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  DashboardShell,
  type NavGroup,
} from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/fhir/status-badge";
import { FullRecordsView } from "@/components/fhir/fhir-visualizer";
import type { FhirRecords } from "@/components/fhir/fhir-types";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  roleProfile: {
    patient_id: string;
    abha_number: string;
    abha_address: string;
    date_of_birth: string | null;
    gender: string | null;
    blood_group: string | null;
  } | null;
}

// Keep only the first row per id. Defends against duplicate rows in API
// responses (consent_requests has no unique (requester_id, abha_number)
// constraint, so non-pending dupes can accumulate) which otherwise trip
// React's "two children with the same key" error.
function dedupeBy<T>(rows: T[], keyOf: (row: T) => string): T[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const k = keyOf(row);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

interface ConsentRequest {
  request_id: string;
  abha_number: string;
  access_type: string;
  resource_scope: string[];
  status: string;
  requested_at: string;
  purpose: string | null;
  users?: { full_name: string; email: string; role: string };
}

interface Consent {
  consent_id: string;
  status: string;
  access_type: string;
  resource_scope: string[];
  granted_at: string | null;
  expires_at: string | null;
  users?: { full_name: string; email: string; role: string };
}

type Tab = "overview" | "records" | "upload" | "prescriptions" | "consents" | "link";

const NAV: NavGroup[] = [
  {
    label: "Account",
    items: [
      { id: "overview", label: "Overview", icon: LayoutGrid },
    ],
  },
  {
    label: "Health Data",
    items: [
      { id: "records", label: "Health Records", icon: FileHeart },
      { id: "prescriptions", label: "Prescriptions", icon: Pill },
      { id: "upload", label: "Upload Document", icon: Upload },
      { id: "link", label: "Link Records", icon: Link2 },
    ],
  },
  {
    label: "Privacy",
    items: [{ id: "consents", label: "Consents", icon: ShieldCheck }],
  },
];

// ─── Root ──────────────────────────────────────────────────────────────────────

const TAB_META: Record<Tab, { title: string; desc: string }> = {
  overview: {
    title: "Overview",
    desc: "Your ABHA identity and account profile.",
  },
  records: {
    title: "Health Records",
    desc: "Medical records grouped by hospital. Each record shows the original document next to its FHIR rendering.",
  },
  upload: {
    title: "Upload Document",
    desc: "Add a clinical PDF, C-CDA, or JSON document to your record.",
  },
  prescriptions: {
    title: "Prescriptions",
    desc: "Medications prescribed by doctors who treated you, with prescriber and hospital details.",
  },
  consents: {
    title: "Consents",
    desc: "Manage access requests from doctors and hospitals.",
  },
  link: {
    title: "Link Records",
    desc: "External Patient resources matching your ABHA number that have not been linked to your account yet.",
  },
};

export default function PatientDashboard() {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [profile, setProfile] = React.useState<UserProfile | null>(null);

  React.useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setProfile(d))
      .catch(() => {});
  }, []);

  const meta = TAB_META[tab];

  return (
    <DashboardShell
      roleLabel="Patient Portal"
      groups={NAV}
      active={tab}
      onSelect={(id) => setTab(id as Tab)}
      userName={profile?.full_name ?? null}
      userEmail={profile?.email ?? null}
      userMeta={
        profile?.roleProfile?.abha_number ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <IdCard className="size-3" />
              ABHA {profile.roleProfile.abha_number}
            </Badge>
            {profile.roleProfile.abha_address && (
              <span className="font-mono">
                {profile.roleProfile.abha_address}
              </span>
            )}
          </div>
        ) : null
      }
      pageTitle={meta.title}
      pageDescription={meta.desc}
    >
      {tab === "overview" && <OverviewPanel profile={profile} />}
      {tab === "records" && <HealthRecords />}
      {tab === "prescriptions" && <PrescriptionsList />}
      {tab === "upload" && <UploadSection />}
      {tab === "consents" && <ConsentManagement />}
      {tab === "link" && <LinkRecords />}
    </DashboardShell>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────────

function OverviewPanel({ profile }: { profile: UserProfile | null }) {
  if (!profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const rp = profile.roleProfile;
  const personal = [
    { k: "Full Name", v: profile.full_name ?? "—", icon: UserIcon },
    { k: "Email", v: profile.email },
    { k: "Phone", v: profile.phone ?? "—" },
    {
      k: "Member Since",
      v: new Date(profile.created_at).toLocaleDateString(),
    },
  ];
  const health = [
    { k: "Date of Birth", v: rp?.date_of_birth ?? "—" },
    { k: "Gender", v: rp?.gender ?? "—" },
    { k: "Blood Group", v: rp?.blood_group ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="ehr-surface">
        <div className="ehr-core overflow-hidden">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8">
            <div>
              <span className="ehr-eyebrow">ABHA Identity</span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                {rp?.abha_number ?? "Identity pending"}
              </h2>
              <p className="mt-3 font-mono text-sm text-muted-foreground">
                {rp?.abha_address ?? "No ABHA address linked yet"}
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-red-500/10 px-5 py-4 text-red-700 ring-1 ring-red-500/15">
              <Heart className="mb-3 size-5" strokeWidth={1.6} />
              <p className="text-sm font-semibold">Patient-controlled record</p>
              <p className="mt-1 text-xs leading-5 text-red-700/70">
                Consents, uploads, and linked FHIR bundles stay under this identity.
              </p>
            </div>
          </div>
          <div className="grid border-t border-border/60 sm:grid-cols-3">
            {health.map((r) => (
              <div key={r.k} className="border-border/60 p-5 sm:border-r last:border-r-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {r.k}
                </p>
                <p className="mt-2 text-lg font-semibold">{r.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {personal.map((r) => (
              <div key={r.k}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {r.k}
                </p>
                <p className="mt-1 text-sm font-medium">{r.v}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-accent/45">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-red-500" />
              Record Readiness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["Identity", rp?.abha_number ? "Linked" : "Pending"],
              ["FHIR uploads", "Available from Health Records"],
              ["Consent control", "Approve, reject, revoke"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-2xl bg-white/55 px-4 py-3 ring-1 ring-white">
                <p className="text-xs font-medium text-muted-foreground">{k}</p>
                <p className="text-sm font-semibold">{v}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Health Records ────────────────────────────────────────────────────────────

interface UploadRow {
  upload_id: string;
  hospital_id: string | null;
  input_type: "pdf" | "ccda" | "json";
  original_filename: string | null;
  content_type: string | null;
  file_size: number | null;
  resource_count: number;
  uploader_role: string;
  created_at: string;
}

interface HospitalGroup {
  hospital_id: string | null;
  hospital_name: string;
  registration_no: string | null;
  uploads: UploadRow[];
}

function HealthRecords() {
  const [groups, setGroups] = React.useState<HospitalGroup[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [activeHospital, setActiveHospital] = React.useState<string | null>(null);
  const [activeUpload, setActiveUpload] = React.useState<UploadRow | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/patient/records/by-hospital");
        const json = await res.json();
        if (res.ok) setGroups(json.groups ?? []);
        else setError(json.error ?? "Failed to load records.");
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Folder className="size-10 opacity-30" />
          <p className="text-sm text-muted-foreground">
            No medical records yet. Upload a document or wait for a hospital to send one.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Drill-down: hospital → upload → split view.
  if (activeUpload) {
    return (
      <UploadDetailView
        upload={activeUpload}
        onBack={() => setActiveUpload(null)}
        breadcrumbs={[
          {
            label: groups.find((g) => (g.hospital_id ?? "self") === activeHospital)?.hospital_name ?? "Records",
            onClick: () => setActiveUpload(null),
          },
          { label: activeUpload.original_filename ?? "Record" },
        ]}
      />
    );
  }

  if (activeHospital) {
    const group = groups.find((g) => (g.hospital_id ?? "self") === activeHospital);
    if (!group) {
      setActiveHospital(null);
      return null;
    }
    return (
      <HospitalUploadList
        group={group}
        onBack={() => setActiveHospital(null)}
        onOpen={(u) => setActiveUpload(u)}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <button
          key={g.hospital_id ?? "self"}
          type="button"
          onClick={() => setActiveHospital(g.hospital_id ?? "self")}
          className="ehr-motion group rounded-2xl border bg-card p-5 text-left hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-5" strokeWidth={1.6} />
            </div>
            <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary" strokeWidth={1.6} />
          </div>
          <h3 className="mt-4 text-base font-semibold tracking-tight">
            {g.hospital_name}
          </h3>
          {g.registration_no && (
            <p className="mt-0.5 text-xs font-mono text-muted-foreground">
              Reg: {g.registration_no}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {g.uploads.length} record{g.uploads.length === 1 ? "" : "s"} · {g.uploads.reduce((s, u) => s + u.resource_count, 0)} FHIR resources
          </p>
        </button>
      ))}
    </div>
  );
}

function HospitalUploadList({
  group,
  onBack,
  onOpen,
}: {
  group: HospitalGroup;
  onBack: () => void;
  onOpen: (u: UploadRow) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          Hospitals
        </button>
        <ChevronRight className="size-4 text-muted-foreground" />
        <span className="font-medium">{group.hospital_name}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {group.uploads.map((u) => (
          <button
            key={u.upload_id}
            type="button"
            onClick={() => onOpen(u)}
            className="ehr-motion group flex items-start gap-3 rounded-xl border bg-card p-4 text-left hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Folder className="size-5" strokeWidth={1.6} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {u.original_filename ?? "Document"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(u.created_at).toLocaleString()} · {u.input_type.toUpperCase()} · {u.resource_count} resources
              </p>
              <Badge variant="outline" className="mt-2 text-[10px]">
                Uploaded by {u.uploader_role}
              </Badge>
            </div>
            <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary" strokeWidth={1.6} />
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadDetailView({
  upload,
  onBack,
  breadcrumbs,
}: {
  upload: UploadRow;
  onBack: () => void;
  breadcrumbs: { label: string; onClick?: () => void }[];
}) {
  const [records, setRecords] = React.useState<FhirRecords | null>(null);
  const [recordsLoading, setRecordsLoading] = React.useState(true);
  const [recordsError, setRecordsError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/patient/uploads/${upload.upload_id}/fhir`);
        const json = await res.json();
        if (res.ok) setRecords(json);
        else setRecordsError(json.error ?? "Failed to fetch FHIR resources.");
      } catch {
        setRecordsError("Network error.");
      } finally {
        setRecordsLoading(false);
      }
    })();
  }, [upload.upload_id]);

  const originalUrl = `/api/patient/uploads/${upload.upload_id}/original`;
  const isPdf = upload.input_type === "pdf";
  const isJson = upload.input_type === "json";
  const isCcda = upload.input_type === "ccda";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          Back
        </button>
        {breadcrumbs.map((b, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="size-4 text-muted-foreground" />
            {b.onClick ? (
              <button onClick={b.onClick} className="text-muted-foreground hover:text-foreground">
                {b.label}
              </button>
            ) : (
              <span className="font-medium">{b.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-primary" />
              Original {upload.input_type.toUpperCase()}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {upload.original_filename ?? "Document"}
              {upload.file_size ? ` · ${(upload.file_size / 1024).toFixed(1)} KB` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPdf && (
              <iframe
                src={originalUrl}
                className="h-[70vh] w-full rounded-md border"
                title="Original PDF"
              />
            )}
            {(isJson || isCcda) && (
              <OriginalTextPreview url={originalUrl} kind={isJson ? "json" : "xml"} />
            )}
            <Button asChild variant="outline" size="sm">
              <a href={originalUrl} download={upload.original_filename ?? undefined}>
                Download original
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileHeart className="size-4 text-primary" />
              FHIR rendering
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Resources extracted from this upload, transformed for the dashboard.
            </p>
          </CardHeader>
          <CardContent>
            {recordsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-48" />
              </div>
            ) : recordsError ? (
              <p className="text-sm text-destructive">{recordsError}</p>
            ) : records ? (
              <FullRecordsView records={records} />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OriginalTextPreview({ url, kind }: { url: string; kind: "json" | "xml" }) {
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          setError("Failed to load original.");
          return;
        }
        const raw = await res.text();
        if (kind === "json") {
          try {
            setText(JSON.stringify(JSON.parse(raw), null, 2));
          } catch {
            setText(raw);
          }
        } else {
          setText(raw);
        }
      } catch {
        setError("Network error.");
      }
    })();
  }, [url, kind]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (text === null) return <Skeleton className="h-72" />;

  return (
    <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
      <code>{text}</code>
    </pre>
  );
}

// ─── Upload ────────────────────────────────────────────────────────────────────

type InputType = "pdf" | "ccda" | "json" | "image";

interface ExtractedMedicationView {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  route?: string;
  instructions?: string;
}

interface PrescriptionExtractionView {
  detectedLanguage: string;
  detectedLanguageName: string;
  extractedText: string;
  translatedText: string;
  prescriber?: string;
  patientName?: string;
  prescribedDate?: string;
  medications: ExtractedMedicationView[];
  warnings: string[];
}

interface TranslateResult {
  extraction: PrescriptionExtractionView;
  bundle: unknown;
}

function UploadSection() {
  const [inputType, setInputType] = React.useState<InputType>("pdf");
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<TranslateResult | null>(null);
  const [showJson, setShowJson] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const resetFile = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!file) {
      toast.error("Select a file.");
      return;
    }
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("inputType", inputType);
    const endpoint =
      inputType === "image" ? "/api/patient/prescription-translate" : "/api/patient/upload";
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok) {
        if (inputType === "image") {
          setResult({ extraction: json.extraction, bundle: json.bundle });
          toast.success("Prescription translated and saved to FHIR.");
        } else {
          toast.success("Document uploaded and converted to FHIR.");
        }
        resetFile();
      } else {
        toast.error(json.error ?? "Upload failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const acceptFor = (t: InputType) =>
    t === "ccda"
      ? ".xml,.cda"
      : t === "json"
        ? ".json,application/json"
        : t === "image"
          ? "image/png,image/jpeg,image/webp"
          : ".pdf";

  const dropLabel = (t: InputType) =>
    t === "ccda"
      ? "C-CDA XML"
      : t === "json"
        ? "JSON"
        : t === "image"
          ? "prescription image (PNG/JPG/WEBP)"
          : "PDF";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs
              value={inputType}
              onValueChange={(v) => {
                setInputType(v as InputType);
                resetFile();
                setResult(null);
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="pdf" className="flex-1">PDF Report</TabsTrigger>
                <TabsTrigger value="ccda" className="flex-1">C-CDA (XML)</TabsTrigger>
                <TabsTrigger value="json" className="flex-1">JSON</TabsTrigger>
                <TabsTrigger value="image" className="flex-1">Image </TabsTrigger>
              </TabsList>
            </Tabs>

            {inputType === "image" && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                <Languages className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  Upload a Kannada, Hindi, Tamil, or English prescription image. AI extracts the
                  text, translates it to English, and generates FHIR medication records.
                </span>
              </div>
            )}

            <div>
              <Label className="mb-2 block">File</Label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-4 py-10 text-center transition-colors hover:border-primary hover:bg-accent/50"
              >
                <Cloud className="size-8 text-muted-foreground group-hover:text-primary" />
                <p className="text-sm font-medium">
                  {file ? file.name : `Drop ${dropLabel(inputType)} here or click`}
                </p>
                {file && (
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept={acceptFor(inputType)}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </button>
            </div>

            <Button className="w-full" onClick={submit} disabled={loading}>
              {loading
                ? "Processing..."
                : inputType === "image"
                  ? "Translate & Convert to FHIR"
                  : "Upload & Convert to FHIR"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What Happens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {(inputType === "image"
              ? [
                  { step: "01", title: "Upload", desc: "Prescription image uploaded to server and stored securely." },
                  { step: "02", title: "Understand", desc: "Groq vision model performs OCR, detects the language, translates to English, and extracts structured medications." },
                  { step: "03", title: "Convert", desc: "Medications are mapped to FHIR R4 MedicationRequest resources." },
                  { step: "04", title: "Store", desc: "FHIR bundle stored on HAPI; meds appear in Health Records & Prescriptions tabs." },
                ]
              : [
                  {
                    step: "01",
                    title: "Upload",
                    desc:
                      inputType === "pdf"
                        ? "PDF uploaded to server."
                        : inputType === "json"
                          ? "JSON document uploaded to server."
                          : "C-CDA XML uploaded to server.",
                  },
                  {
                    step: "02",
                    title: "Convert",
                    desc:
                      inputType === "pdf"
                        ? "pdfjs-dist extracts text → regex-structured record → FHIR Bundle (Patient + Observations + MedicationRequests + Conditions)."
                        : inputType === "json"
                          ? "Microsoft FHIR Converter applies the JSON Liquid template (ExamplePatient) → FHIR Bundle."
                          : "Microsoft FHIR Converter (Liquid templates) maps C-CDA → FHIR.",
                  },
                  { step: "03", title: "Store", desc: "FHIR Bundle stored on HAPI FHIR server under your identity." },
                  { step: "04", title: "Visible", desc: "Records appear in Health Records tab immediately." },
                ]
            ).map((s) => (
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

      {result && <TranslationResult result={result} showJson={showJson} onToggleJson={() => setShowJson((v) => !v)} />}
    </div>
  );
}

function TranslationResult({
  result,
  showJson,
  onToggleJson,
}: {
  result: TranslateResult;
  showJson: boolean;
  onToggleJson: () => void;
}) {
  const { extraction, bundle } = result;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="size-4 text-primary" />
            Translated Prescription
          </CardTitle>
          <Badge variant="secondary">
            {extraction.detectedLanguageName} ({extraction.detectedLanguage})
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {extraction.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium">Notes</p>
            <ul className="mt-1 list-disc pl-4">
              {extraction.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {(extraction.prescriber || extraction.patientName || extraction.prescribedDate) && (
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {extraction.patientName && <span><span className="font-medium text-foreground">Patient:</span> {extraction.patientName}</span>}
            {extraction.prescriber && <span><span className="font-medium text-foreground">Prescriber:</span> {extraction.prescriber}</span>}
            {extraction.prescribedDate && <span><span className="font-medium text-foreground">Date:</span> {extraction.prescribedDate}</span>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Original ({extraction.detectedLanguageName})</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{extraction.extractedText || "—"}</pre>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">English</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{extraction.translatedText || "—"}</pre>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Medications ({extraction.medications.length})</p>
          {extraction.medications.length === 0 ? (
            <p className="text-xs text-muted-foreground">No medications extracted.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Medicine</th>
                    <th className="px-3 py-2">Dosage</th>
                    <th className="px-3 py-2">Frequency</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Instructions</th>
                  </tr>
                </thead>
                <tbody>
                  {extraction.medications.map((m, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2">{m.dosage || "—"}</td>
                      <td className="px-3 py-2">{m.frequency || "—"}</td>
                      <td className="px-3 py-2">{m.duration || "—"}</td>
                      <td className="px-3 py-2">{m.instructions || (m.route ? m.route : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <Button variant="outline" size="sm" onClick={onToggleJson}>
            {showJson ? "Hide FHIR JSON" : "Show FHIR JSON"}
          </Button>
          {showJson && (
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(bundle, null, 2)}</pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Prescriptions ─────────────────────────────────────────────────────────────

interface PrescriptionRow {
  prescription_id: string;
  fhir_resource_id: string;
  medication: string;
  dosage: string | null;
  status: string;
  created_at: string;
  doctor: {
    full_name: string | null;
    email: string | null;
    specialization: string | null;
    license_number: string | null;
    hospital_name: string | null;
    hospital_registration_no: string | null;
  };
}

function PrescriptionsList() {
  const [items, setItems] = React.useState<PrescriptionRow[] | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/patient/prescriptions");
        const json = await res.json();
        if (res.ok) setItems(json.prescriptions ?? []);
        else setError(json.error ?? "Failed to load prescriptions.");
      } catch {
        setError("Network error.");
      }
    })();
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!items) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Pill className="size-10 opacity-30" />
          <p className="text-sm text-muted-foreground">
            No prescriptions yet. They appear here as soon as a doctor writes one for you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((p) => (
        <Card key={p.prescription_id}>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-700">
                  <Pill className="size-5" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{p.medication}</p>
                  {p.dosage && (
                    <p className="mt-1 text-xs text-muted-foreground">{p.dosage}</p>
                  )}
                </div>
              </div>
              <StatusBadge status={p.status} />
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Stethoscope className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <span className="font-medium">
                  {p.doctor.full_name ?? "Unknown doctor"}
                </span>
                {p.doctor.specialization && (
                  <span className="text-xs text-muted-foreground">
                    · {p.doctor.specialization}
                  </span>
                )}
              </div>
              {p.doctor.hospital_name && (
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                  <span className="text-sm">{p.doctor.hospital_name}</span>
                  {p.doctor.hospital_registration_no && (
                    <span className="text-xs font-mono text-muted-foreground">
                      · {p.doctor.hospital_registration_no}
                    </span>
                  )}
                </div>
              )}
              {p.doctor.license_number && (
                <p className="text-xs text-muted-foreground">
                  License: <span className="font-mono">{p.doctor.license_number}</span>
                </p>
              )}
              {p.doctor.email && (
                <p className="text-xs text-muted-foreground">{p.doctor.email}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Prescribed {new Date(p.created_at).toLocaleString()}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                FHIR {p.fhir_resource_id.slice(0, 8)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Consents ──────────────────────────────────────────────────────────────────

function ConsentManagement() {
  const [requests, setRequests] = React.useState<ConsentRequest[]>([]);
  const [consents, setConsents] = React.useState<Consent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<Record<string, boolean>>({});

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        fetch("/api/consent-requests"),
        fetch("/api/consents"),
      ]);
      const [rJson, cJson] = await Promise.all([rRes.json(), cRes.json()]);
      if (rRes.ok) setRequests(dedupeBy(rJson, (r) => r.request_id));
      if (cRes.ok) setConsents(dedupeBy(cJson, (c) => c.consent_id));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(id);
  }, [reload]);

  const respond = async (requestId: string, action: "approve" | "reject") => {
    setActing((a) => ({ ...a, [requestId]: true }));
    try {
      const res = await fetch(`/api/consent-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) toast.success(`Request ${action}d.`);
      else toast.error("Action failed.");
      await reload();
    } finally {
      setActing((a) => ({ ...a, [requestId]: false }));
    }
  };

  const revoke = async (consentId: string) => {
    setActing((a) => ({ ...a, [consentId]: true }));
    try {
      const res = await fetch(`/api/consents/${consentId}/revoke`, {
        method: "POST",
      });
      if (res.ok) toast.success("Consent revoked.");
      else toast.error("Revoke failed.");
      await reload();
    } finally {
      setActing((a) => ({ ...a, [consentId]: false }));
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const activeConsents = consents.filter((c) => c.status === "approved");
  const [now] = React.useState(() => Date.now());
  const history = [
    ...requests.filter((r) => r.status !== "pending"),
    ...consents.filter((c) => c.status !== "approved"),
  ].sort((a, b) => {
    const da = "requested_at" in a ? a.requested_at : a.granted_at ?? "";
    const db = "requested_at" in b ? b.requested_at : b.granted_at ?? "";
    return new Date(db).getTime() - new Date(da).getTime();
  });

  if (loading) return <Skeleton className="h-64" />;

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">
          Pending {pending.length > 0 && `(${pending.length})`}
        </TabsTrigger>
        <TabsTrigger value="active">
          Active {activeConsents.length > 0 && `(${activeConsents.length})`}
        </TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="pending" className="mt-6 space-y-3">
        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No pending consent requests.
            </CardContent>
          </Card>
        ) : (
          pending.map((r) => (
            <Card key={r.request_id} className="border-amber-200 dark:border-amber-900">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {r.users?.full_name ?? "Unknown"}{" "}
                      <span className="text-muted-foreground">
                        ({r.users?.role ?? "—"})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.users?.email}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <Field
                    k="Access"
                    v={
                      r.access_type === "full"
                        ? "Full Access"
                        : r.resource_scope.join(", ")
                    }
                  />
                  {r.purpose && <Field k="Purpose" v={r.purpose} />}
                  <Field
                    k="Requested"
                    v={new Date(r.requested_at).toLocaleDateString()}
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respond(r.request_id, "approve")}
                    disabled={acting[r.request_id]}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => respond(r.request_id, "reject")}
                    disabled={acting[r.request_id]}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>
      <TabsContent value="active" className="mt-6 space-y-3">
        {activeConsents.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No active consents.
            </CardContent>
          </Card>
        ) : (
          activeConsents.map((c) => {
            const expiringSoon =
              c.expires_at &&
              new Date(c.expires_at).getTime() - now <
                7 * 24 * 60 * 60 * 1000;
            return (
              <Card
                key={c.consent_id}
                className="border-emerald-200 dark:border-emerald-900"
              >
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {c.users?.full_name ?? "Unknown"}{" "}
                        <span className="text-muted-foreground">
                          ({c.users?.role ?? "—"})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.users?.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {expiringSoon && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                          Expiring Soon
                        </Badge>
                      )}
                      <StatusBadge status={c.status} />
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                    <Field
                      k="Access"
                      v={
                        c.access_type === "full"
                          ? "Full Access"
                          : c.resource_scope.join(", ")
                      }
                    />
                    <Field
                      k="Granted"
                      v={
                        c.granted_at
                          ? new Date(c.granted_at).toLocaleDateString()
                          : "—"
                      }
                    />
                    <Field
                      k="Expires"
                      v={
                        c.expires_at
                          ? new Date(c.expires_at).toLocaleDateString()
                          : "Never"
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="mt-4"
                    onClick={() => revoke(c.consent_id)}
                    disabled={acting[c.consent_id]}
                  >
                    Revoke Access
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </TabsContent>
      <TabsContent value="history" className="mt-6 space-y-2">
        {history.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No history.
            </CardContent>
          </Card>
        ) : (
          history.map((item) => {
            const isRequest = "request_id" in item;
            return (
              <Card
                key={
                  isRequest
                    ? (item as ConsentRequest).request_id
                    : (item as Consent).consent_id
                }
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">
                      {isRequest
                        ? (item as ConsentRequest).users?.full_name ??
                          "Unknown"
                        : (item as Consent).users?.full_name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isRequest
                        ? `Request · ${new Date(
                            (item as ConsentRequest).requested_at,
                          ).toLocaleDateString()}`
                        : `Consent · ${
                            (item as Consent).granted_at
                              ? new Date(
                                  (item as Consent).granted_at!,
                                ).toLocaleDateString()
                              : "—"
                          }`}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </CardContent>
              </Card>
            );
          })
        )}
      </TabsContent>
    </Tabs>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-muted-foreground uppercase tracking-wide">{k}</p>
      <p className="mt-0.5 font-medium text-foreground">{v}</p>
    </div>
  );
}

// ─── Link Records ──────────────────────────────────────────────────────────────

interface LinkCandidate {
  fhir_patient_id: string;
  hospital_code: string | null;
  hospital_name: string;
  last_updated: string | null;
}

function LinkRecords() {
  const [abha, setAbha] = React.useState<string | null>(null);
  const [candidates, setCandidates] = React.useState<LinkCandidate[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [acting, setActing] = React.useState<Record<string, boolean>>({});

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/patient/link-records");
      const json = await res.json();
      if (res.ok) {
        setAbha(json.abha ?? null);
        setCandidates(json.candidates ?? []);
      } else {
        setError(json.error ?? "Failed to scan for linkable records.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const link = async (fhirPatientId: string) => {
    setActing((s) => ({ ...s, [fhirPatientId]: true }));
    try {
      const res = await fetch("/api/patient/link-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fhir_patient_id: fhirPatientId }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success("Record linked to your account.");
        await reload();
      } else {
        toast.error(json.error ?? "Link failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setActing((s) => ({ ...s, [fhirPatientId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-muted-foreground">Scanning HAPI for ABHA</p>
            <p className="mt-1 font-mono text-xl font-semibold">{abha ?? "—"}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Patient resources matching your ABHA from other hospitals appear below until you link them.
            </p>
          </div>
          <Button variant="outline" onClick={reload} disabled={loading}>
            {loading ? "Scanning..." : "Re-scan"}
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-32" />
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : !candidates || candidates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Link2 className="size-10 opacity-30" />
            <p className="text-sm text-muted-foreground">
              No external records found. Everything matching your ABHA is already linked.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {candidates.map((c) => (
            <Card key={c.fhir_patient_id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{c.hospital_name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground break-all">
                      Patient/{c.fhir_patient_id}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">External</Badge>
                </div>
                {c.last_updated && (
                  <p className="text-xs text-muted-foreground">
                    Last updated {new Date(c.last_updated).toLocaleString()}
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={() => link(c.fhir_patient_id)}
                  disabled={!!acting[c.fhir_patient_id]}
                >
                  Link to my account
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
