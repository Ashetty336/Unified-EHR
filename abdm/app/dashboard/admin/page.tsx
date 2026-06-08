"use client";

import * as React from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  Hourglass,
  LayoutGrid,
  ShieldCheck,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  DashboardShell,
  type NavGroup,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/fhir/status-badge";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  role: string;
}

interface Hospital {
  hospital_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  registration_no: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
}

interface Doctor {
  doctor_id: string;
  specialization: string | null;
  license_number: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  users: { full_name: string | null; email: string };
  hospitals: { name: string; registration_no: string | null };
}

type Tab = "overview" | "hospitals" | "doctors";
type StatusFilter = "pending" | "approved" | "rejected";

const NAV: NavGroup[] = [
  {
    label: "Console",
    items: [{ id: "overview", label: "Overview", icon: LayoutGrid }],
  },
  {
    label: "Approvals",
    items: [
      { id: "hospitals", label: "Hospitals", icon: Building2 },
      { id: "doctors", label: "Doctors", icon: Stethoscope },
    ],
  },
];

const TAB_META: Record<Tab, { title: string; desc: string }> = {
  overview: {
    title: "Overview",
    desc: "Approval queue across hospitals and practitioners.",
  },
  hospitals: {
    title: "Hospital Approvals",
    desc: "Review registration details and verify each institution before granting access.",
  },
  doctors: {
    title: "Doctor Approvals",
    desc: "Approve practitioners after their hospital is onboarded.",
  },
};

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
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
      roleLabel="Admin Console"
      groups={NAV}
      active={tab}
      onSelect={(id) => setTab(id as Tab)}
      userName={profile?.full_name ?? null}
      userEmail={profile?.email ?? null}
      userMeta={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="size-3" />
            Network administrator
          </Badge>
          {profile?.created_at && (
            <Badge variant="outline" className="font-mono">
              Since {new Date(profile.created_at).toLocaleDateString()}
            </Badge>
          )}
        </div>
      }
      pageTitle={meta.title}
      pageDescription={meta.desc}
    >
      {tab === "overview" && <OverviewPanel onJump={(t) => setTab(t)} />}
      {tab === "hospitals" && <HospitalsPanel />}
      {tab === "doctors" && <DoctorsPanel />}
    </DashboardShell>
  );
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useApprovalQueue<T>(endpoint: string, status: StatusFilter) {
  const [data, setData] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${endpoint}?status=${status}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json)) setData(json);
      else if (!res.ok) setError(json.error ?? "Failed to load.");
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, status]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

function useApprovalCounts(endpoint: string) {
  const [counts, setCounts] = React.useState<Record<StatusFilter, number>>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const statuses: StatusFilter[] = ["pending", "approved", "rejected"];
      const results = await Promise.all(
        statuses.map((s) =>
          fetch(`${endpoint}?status=${s}`)
            .then((r) => r.json())
            .then((j) => (Array.isArray(j) ? j.length : 0))
            .catch(() => 0),
        ),
      );
      if (cancelled) return;
      setCounts({
        pending: results[0],
        approved: results[1],
        rejected: results[2],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  return counts;
}

// ─── Overview ──────────────────────────────────────────────────────────────────

function OverviewPanel({ onJump }: { onJump: (t: Tab) => void }) {
  const hospitalCounts = useApprovalCounts("/api/admin/hospitals");
  const doctorCounts = useApprovalCounts("/api/admin/doctors");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Hospitals pending"
          value={hospitalCounts.pending}
          icon={Hourglass}
          tone="amber"
        />
        <StatTile
          label="Hospitals approved"
          value={hospitalCounts.approved}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatTile
          label="Doctors pending"
          value={doctorCounts.pending}
          icon={Clock}
          tone="indigo"
        />
        <StatTile
          label="Doctors approved"
          value={doctorCounts.approved}
          icon={ShieldCheck}
          tone="primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <QueueTeaser
          title="Hospital queue"
          icon={Building2}
          counts={hospitalCounts}
          onOpen={() => onJump("hospitals")}
        />
        <QueueTeaser
          title="Doctor queue"
          icon={Stethoscope}
          counts={doctorCounts}
          onOpen={() => onJump("doctors")}
        />
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: "amber" | "emerald" | "indigo" | "primary";
}) {
  const TONE: Record<typeof tone, string> = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <div className="ehr-surface">
      <div className="ehr-core flex items-center gap-3 p-4">
        <div className={`flex size-10 items-center justify-center rounded-full ${TONE[tone]}`}>
          <Icon className="size-5" strokeWidth={1.6} />
        </div>
        <div>
          <p className="text-2xl font-semibold leading-none tabular-nums">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function QueueTeaser({
  title,
  icon: Icon,
  counts,
  onOpen,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  counts: Record<StatusFilter, number>;
  onOpen: () => void;
}) {
  return (
    <div className="ehr-surface">
      <div className="ehr-core space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" strokeWidth={1.6} />
          </span>
          <div>
            <span className="ehr-eyebrow">Queue</span>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">
              {title}
            </h3>
          </div>
        </div>
        <Separator className="bg-border/60" />
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Pending
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-300">
              {counts.pending}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Approved
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
              {counts.approved}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Rejected
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-muted-foreground">
              {counts.rejected}
            </dd>
          </div>
        </dl>
        <Button onClick={onOpen} className="rounded-full">
          Open queue
        </Button>
      </div>
    </div>
  );
}

// ─── Hospitals Panel ───────────────────────────────────────────────────────────

function HospitalsPanel() {
  const [status, setStatus] = React.useState<StatusFilter>("pending");
  const { data, loading, error, reload } = useApprovalQueue<Hospital>(
    "/api/admin/hospitals",
    status,
  );
  const [acting, setActing] = React.useState<Record<string, boolean>>({});

  const decide = async (id: string, action: "approved" | "rejected") => {
    setActing((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/admin/hospitals/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Hospital ${action}.`);
        await reload();
      } else {
        toast.error(json.error ?? "Action failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setActing((s) => ({ ...s, [id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <FilterTabs status={status} onChange={setStatus} />

      {loading ? (
        <QueueSkeleton />
      ) : error ? (
        <ErrorPanel msg={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyPanel icon={Building2} message={`No ${status} hospitals.`} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.map((h) => (
            <HospitalCard
              key={h.hospital_id}
              hospital={h}
              acting={!!acting[h.hospital_id]}
              onDecide={(action) => decide(h.hospital_id, action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HospitalCard({
  hospital,
  acting,
  onDecide,
}: {
  hospital: Hospital;
  acting: boolean;
  onDecide: (a: "approved" | "rejected") => void;
}) {
  return (
    <div className="ehr-surface">
      <div className="ehr-core space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="size-5" strokeWidth={1.6} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold tracking-tight">
                {hospital.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Registered{" "}
                {new Date(hospital.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
          <StatusBadge status={hospital.approval_status} />
        </div>

        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Field k="Registration No." v={hospital.registration_no ?? "—"} mono />
          <Field k="Phone" v={hospital.phone ?? "—"} />
          <Field
            k="Address"
            v={hospital.address ?? "—"}
            className="sm:col-span-2"
          />
        </dl>

        {hospital.approval_status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => onDecide("approved")}
              disabled={acting}
            >
              <CheckCircle2 className="size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => onDecide("rejected")}
              disabled={acting}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
          </div>
        ) : (
          hospital.approved_at && (
            <p className="text-xs text-muted-foreground">
              Decision recorded{" "}
              {new Date(hospital.approved_at).toLocaleString()}
            </p>
          )
        )}
      </div>
    </div>
  );
}

// ─── Doctors Panel ─────────────────────────────────────────────────────────────

function DoctorsPanel() {
  const [status, setStatus] = React.useState<StatusFilter>("pending");
  const { data, loading, error, reload } = useApprovalQueue<Doctor>(
    "/api/admin/doctors",
    status,
  );
  const [acting, setActing] = React.useState<Record<string, boolean>>({});

  const decide = async (id: string, action: "approved" | "rejected") => {
    setActing((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/admin/doctors/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Doctor ${action}.`);
        await reload();
      } else {
        toast.error(json.error ?? "Action failed.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setActing((s) => ({ ...s, [id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <FilterTabs status={status} onChange={setStatus} />

      {loading ? (
        <QueueSkeleton />
      ) : error ? (
        <ErrorPanel msg={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyPanel icon={Stethoscope} message={`No ${status} doctors.`} />
      ) : (
        <ScrollArea className="max-h-[calc(100dvh-22rem)] pr-1">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {data.map((d) => (
              <DoctorCard
                key={d.doctor_id}
                doctor={d}
                acting={!!acting[d.doctor_id]}
                onDecide={(action) => decide(d.doctor_id, action)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function DoctorCard({
  doctor,
  acting,
  onDecide,
}: {
  doctor: Doctor;
  acting: boolean;
  onDecide: (a: "approved" | "rejected") => void;
}) {
  const name = doctor.users.full_name ?? doctor.users.email;
  const initial = (name || "D").trim().slice(0, 2).toUpperCase();

  return (
    <div className="ehr-surface">
      <div className="ehr-core space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar className="size-11">
              <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold tracking-tight">
                {name}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {doctor.users.email}
              </p>
            </div>
          </div>
          <StatusBadge status={doctor.approval_status} />
        </div>

        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <Field k="Specialization" v={doctor.specialization ?? "—"} />
          <Field k="License" v={doctor.license_number ?? "—"} mono />
          <Field
            k="Hospital"
            v={doctor.hospitals.name}
            className="sm:col-span-2"
          />
          <Field
            k="Hospital Reg. No."
            v={doctor.hospitals.registration_no ?? "—"}
            mono
            className="sm:col-span-2"
          />
        </dl>

        {doctor.approval_status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => onDecide("approved")}
              disabled={acting}
            >
              <CheckCircle2 className="size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => onDecide("rejected")}
              disabled={acting}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
          </div>
        ) : (
          doctor.approved_at && (
            <p className="text-xs text-muted-foreground">
              Decision recorded{" "}
              {new Date(doctor.approved_at).toLocaleString()}
            </p>
          )
        )}
      </div>
    </div>
  );
}

// ─── Shared atoms ──────────────────────────────────────────────────────────────

function FilterTabs({
  status,
  onChange,
}: {
  status: StatusFilter;
  onChange: (s: StatusFilter) => void;
}) {
  return (
    <Tabs value={status} onValueChange={(v) => onChange(v as StatusFilter)}>
      <TabsList className="rounded-full bg-muted/60 p-1">
        <TabsTrigger value="pending" className="rounded-full">
          Pending
        </TabsTrigger>
        <TabsTrigger value="approved" className="rounded-full">
          Approved
        </TabsTrigger>
        <TabsTrigger value="rejected" className="rounded-full">
          Rejected
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function Field({
  k,
  v,
  mono,
  className,
}: {
  k: string;
  v: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {k}
      </dt>
      <dd
        className={
          "mt-1 text-sm font-medium" +
          (mono ? " font-mono break-all text-xs" : "")
        }
      >
        {v}
      </dd>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="ehr-surface">
          <div className="ehr-core space-y-4 p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="ehr-surface">
      <div className="ehr-core flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <XCircle className="size-5" strokeWidth={1.6} />
        </span>
        <p className="text-sm text-destructive">{msg}</p>
        <Button variant="outline" size="sm" className="rounded-full" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  message: string;
}) {
  return (
    <div className="ehr-surface">
      <div className="ehr-core flex flex-col items-center gap-3 p-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" strokeWidth={1.6} />
        </span>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground/70">
          Queue will refresh automatically when new submissions arrive.
        </p>
      </div>
    </div>
  );
}
