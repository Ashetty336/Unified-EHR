"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  ShieldCheck,
  Stethoscope,
  Syringe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { StatusBadge } from "./status-badge";
import type {
  Allergy,
  Condition,
  DiagnosticReport,
  Encounter,
  FhirPatient,
  FhirRecords,
  Immunization,
  LabResult,
  Prescription,
  Procedure,
} from "./fhir-types";

function fmtDate(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

function parseNumber(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "PT";
}

function SectionShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ehr-surface ${className}`}>
      <div className="ehr-core h-full overflow-hidden">{children}</div>
    </div>
  );
}

function ResourceTitle({
  icon: Icon,
  title,
  count,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  count: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
          <Icon className="size-4" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">FHIR resource view</p>
        </div>
      </div>
      <Badge variant="secondary" className="rounded-full">
        {count}
      </Badge>
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/55 px-4 py-3 ring-1 ring-border/60">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 wrap-break-word text-sm font-medium">{value}</p>
    </div>
  );
}

export function PatientHeaderCard({ patient }: { patient: FhirPatient }) {
  const items = [
    { k: "Gender", v: patient.gender ?? "-" },
    { k: "Date of Birth", v: fmtDate(patient.birthDate) },
    { k: "FHIR ID", v: patient.id, mono: true },
  ];

  return (
    <SectionShell>
      <div className="grid gap-6 p-5 md:grid-cols-[auto_1fr] md:p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-20 items-center justify-center rounded-[1.5rem] bg-primary text-2xl font-semibold text-primary-foreground shadow-[0_18px_36px_rgba(10,129,145,0.25)]">
            {initials(patient.name)}
          </div>
          <div className="min-w-0">
            <p className="ehr-eyebrow">FHIR Patient</p>
            <h2 className="mt-3 truncate text-3xl font-semibold tracking-tight">
              {patient.name}
            </h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((r) => (
            <MetaPill key={r.k} label={r.k} value={r.v} />
          ))}
        </div>
      </div>
      {patient.identifiers && patient.identifiers.length > 0 && (
        <div className="border-t border-border/60 px-5 py-4 md:px-6">
          <div className="flex flex-wrap gap-2">
            {patient.identifiers.slice(0, 4).map((id, index) => (
              <Badge key={`${id.system}-${index}`} variant="outline" className="max-w-full rounded-full font-mono">
                <span className="truncate">{id.value}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

export function ResourceStatsGrid({ records }: { records: FhirRecords }) {
  const stats = [
    {
      label: "Lab Results",
      count: records.labResults.length,
      icon: FlaskConical,
      tone: "bg-teal-500/12 text-teal-700",
    },
    {
      label: "Medications",
      count: records.prescriptions.length,
      icon: Pill,
      tone: "bg-rose-500/12 text-rose-700",
    },
    {
      label: "Conditions",
      count: records.conditions?.length ?? 0,
      icon: HeartPulse,
      tone: "bg-amber-500/16 text-amber-800",
    },
    {
      label: "Allergies",
      count: records.allergies?.length ?? 0,
      icon: AlertTriangle,
      tone: "bg-red-500/12 text-red-700",
    },
    {
      label: "Procedures",
      count: records.procedures?.length ?? 0,
      icon: Stethoscope,
      tone: "bg-cyan-500/12 text-cyan-700",
    },
    {
      label: "Reports",
      count: records.diagnosticReports?.length ?? 0,
      icon: FileText,
      tone: "bg-fuchsia-500/12 text-fuchsia-700",
    },
    {
      label: "Encounters",
      count: records.encounters?.length ?? 0,
      icon: CalendarDays,
      tone: "bg-indigo-500/12 text-indigo-700",
    },
    {
      label: "Immunizations",
      count: records.immunizations?.length ?? 0,
      icon: Syringe,
      tone: "bg-emerald-500/12 text-emerald-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        const countStr = s.count > 9999 ? `${(s.count / 1000).toFixed(1)}k` : String(s.count);
        const sizeClass =
          countStr.length >= 5
            ? "text-lg"
            : countStr.length === 4
              ? "text-xl"
              : countStr.length === 3
                ? "text-2xl"
                : "text-3xl";
        return (
          <SectionShell key={s.label}>
            <div className="flex items-center gap-3 overflow-hidden p-4">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${s.tone}`}>
                <Icon className="size-5" strokeWidth={1.6} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`${sizeClass} truncate font-semibold leading-none tracking-tight tabular-nums`}
                  title={String(s.count)}
                >
                  {countStr}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground" title={s.label}>
                  {s.label}
                </p>
              </div>
            </div>
          </SectionShell>
        );
      })}
    </div>
  );
}

const labChartConfig = {
  value: { label: "Value", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function LabResultsViz({ items }: { items: LabResult[] }) {
  const numeric = items
    .map((l) => ({ ...l, num: parseNumber(l.value) }))
    .filter((l) => l.num !== null) as (LabResult & { num: number })[];

  return (
    <Card>
      <CardHeader>
        <ResourceTitle
          icon={FlaskConical}
          title="Lab Results"
          count={items.length}
          tone="bg-teal-500/12 text-teal-700"
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyMsg msg="No lab results" />
        ) : (
          <Tabs defaultValue="cards">
            <TabsList>
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="chart" disabled={numeric.length === 0}>
                Trend
              </TabsTrigger>
            </TabsList>
            <TabsContent value="cards" className="mt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((l) => (
                  <LabCard key={l.id} lab={l} />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="chart" className="mt-4">
              <ChartContainer config={labChartConfig} className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={numeric} margin={{ top: 10, right: 10, bottom: 56, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 6" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      angle={-25}
                      textAnchor="end"
                      height={64}
                      fontSize={11}
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="num" fill="var(--color-value)" radius={[12, 12, 4, 4]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function LabCard({ lab }: { lab: LabResult }) {
  return (
    <div className="w-full min-w-0 rounded-[1.5rem] bg-muted/45 p-4 ring-1 ring-border/60 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-white">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold leading-tight">{lab.name}</p>
        <StatusBadge status={lab.status} />
      </div>
      <div className="mt-5 flex min-w-0 flex-wrap items-end gap-x-1 gap-y-0.5">
        <span className="min-w-0 wrap-break-word text-4xl font-semibold leading-none tracking-tight">
          {lab.value}
        </span>
        {lab.unit && <span className="pb-1 text-sm text-muted-foreground">{lab.unit}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {lab.referenceRange && <span>Ref {lab.referenceRange}</span>}
        <span>{fmtDate(lab.effectiveDate)}</span>
      </div>
    </div>
  );
}

export function PrescriptionsViz({ items }: { items: Prescription[] }) {
  return (
    <Card>
      <CardHeader>
        <ResourceTitle
          icon={Pill}
          title="Medications"
          count={items.length}
          tone="bg-rose-500/12 text-rose-700"
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyMsg msg="No medications" />
        ) : (
          <div className="space-y-3">
            {items.map((p) => (
              <div
                key={p.id}
                className="rounded-[1.5rem] bg-rose-500/[0.06] p-4 ring-1 ring-rose-500/15"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-rose-700">
                      <Pill className="size-5" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">{p.medication}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDate(p.authoredOn)} · {p.intent}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                {p.dosageInstruction && (
                  <p className="mt-3 rounded-2xl bg-white/65 px-3 py-2 text-xs leading-5 text-muted-foreground ring-1 ring-white">
                    {p.dosageInstruction}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConditionsViz({ items }: { items: Condition[] }) {
  return (
    <TimelineCard
      title="Conditions"
      count={items.length}
      icon={HeartPulse}
      tone="bg-amber-500/16 text-amber-800"
      empty="No conditions"
      items={items.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: `Onset ${fmtDate(c.onsetDate ?? c.recordedDate)}`,
        badge: c.clinicalStatus,
      }))}
    />
  );
}

export function AllergiesViz({ items }: { items: Allergy[] }) {
  return (
    <Card>
      <CardHeader>
        <ResourceTitle
          icon={AlertTriangle}
          title="Allergies"
          count={items.length}
          tone="bg-red-500/12 text-red-700"
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyMsg msg="No allergies" />
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <div key={a.id} className="rounded-[1.5rem] bg-red-500/[0.06] p-4 ring-1 ring-red-500/15">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-700" strokeWidth={1.6} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{a.substance}</p>
                      {a.clinicalStatus && <StatusBadge status={a.clinicalStatus} />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.category ?? "Uncategorized"}
                      {a.criticality ? ` · ${a.criticality} criticality` : ""}
                      {a.recordedDate ? ` · ${fmtDate(a.recordedDate)}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProceduresViz({ items }: { items: Procedure[] }) {
  return (
    <TimelineCard
      title="Procedures"
      count={items.length}
      icon={Stethoscope}
      tone="bg-cyan-500/12 text-cyan-700"
      empty="No procedures"
      items={items.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: fmtDate(p.performedDate),
        badge: p.status,
      }))}
    />
  );
}

export function DiagnosticReportsViz({ items }: { items: DiagnosticReport[] }) {
  return (
    <Card>
      <CardHeader>
        <ResourceTitle
          icon={FileText}
          title="Diagnostic Reports"
          count={items.length}
          tone="bg-fuchsia-500/12 text-fuchsia-700"
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyMsg msg="No diagnostic reports" />
        ) : (
          <div className="space-y-3">
            {items.map((d) => (
              <div key={d.id} className="rounded-[1.5rem] bg-muted/45 p-4 ring-1 ring-border/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{d.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fmtDate(d.effectiveDate)}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                {d.conclusion && (
                  <p className="mt-4 rounded-2xl bg-white/65 px-3 py-2 text-sm leading-6 ring-1 ring-white">
                    {d.conclusion}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EncountersViz({ items }: { items: Encounter[] }) {
  const sorted = [...items].sort((a, b) => {
    const da = a.startDate ? new Date(a.startDate).getTime() : 0;
    const db = b.startDate ? new Date(b.startDate).getTime() : 0;
    return db - da;
  });

  return (
    <TimelineCard
      title="Encounter Timeline"
      count={items.length}
      icon={CalendarDays}
      tone="bg-indigo-500/12 text-indigo-700"
      empty="No encounters"
      items={sorted.map((e) => ({
        id: e.id,
        title: e.type,
        subtitle: `${fmtDate(e.startDate)}${e.endDate ? ` to ${fmtDate(e.endDate)}` : ""}`,
        badge: e.status,
      }))}
    />
  );
}

export function ImmunizationsViz({ items }: { items: Immunization[] }) {
  return (
    <Card>
      <CardHeader>
        <ResourceTitle
          icon={Syringe}
          title="Immunizations"
          count={items.length}
          tone="bg-emerald-500/12 text-emerald-700"
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyMsg msg="No immunizations" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <div key={i.id} className="rounded-[1.5rem] bg-emerald-500/[0.06] p-4 ring-1 ring-emerald-500/15">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                    <Syringe className="size-5" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.vaccine}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(i.occurrenceDate)}</p>
                  </div>
                  <StatusBadge status={i.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineCard({
  title,
  count,
  icon,
  tone,
  empty,
  items,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: string;
  empty: string;
  items: { id: string; title: string; subtitle: string; badge?: string | null }[];
}) {
  return (
    <Card>
      <CardHeader>
        <ResourceTitle icon={icon} title={title} count={count} tone={tone} />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyMsg msg={empty} />
        ) : (
          <ScrollArea className="h-72 pr-3">
            <ol className="relative ml-3 space-y-4 border-l border-border/80 pl-6">
              {items.map((item) => (
                <li key={item.id} className="relative">
                  <span className="absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full border-4 border-card bg-primary" />
                  <div className="rounded-2xl bg-muted/45 p-3 ring-1 ring-border/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                      {item.badge && <StatusBadge status={item.badge} />}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyMsg({ msg }: { msg: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-[1.5rem] bg-muted/45 py-10 text-muted-foreground ring-1 ring-border/60">
      <ClipboardList className="size-8 opacity-40" strokeWidth={1.6} />
      <p className="text-sm">{msg}</p>
    </div>
  );
}

export function FullRecordsView({ records }: { records: FhirRecords }) {
  const totalResources =
    records.labResults.length +
    records.prescriptions.length +
    (records.conditions?.length ?? 0) +
    (records.allergies?.length ?? 0) +
    (records.procedures?.length ?? 0) +
    (records.diagnosticReports?.length ?? 0) +
    (records.encounters?.length ?? 0) +
    (records.immunizations?.length ?? 0);

  return (
    <div className="space-y-6">
      <SectionShell>
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
          <div>
            <span className="ehr-eyebrow">FHIR Bundle</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Clinical resource board
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Resources are grouped by clinical meaning with readable summaries, status, dates, and trends.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-[1.5rem] bg-primary/10 px-5 py-4 text-primary ring-1 ring-primary/15">
            <ShieldCheck className="size-5" strokeWidth={1.6} />
            <div>
              <p className="text-3xl font-semibold leading-none">{totalResources}</p>
              <p className="text-xs text-primary/70">rendered resources</p>
            </div>
          </div>
        </div>
      </SectionShell>
      {records.patient && <PatientHeaderCard patient={records.patient} />}
      <ResourceStatsGrid records={records} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <LabResultsViz items={records.labResults} />
        <PrescriptionsViz items={records.prescriptions} />
        {records.conditions && <ConditionsViz items={records.conditions} />}
        {records.allergies && <AllergiesViz items={records.allergies} />}
        {records.procedures && <ProceduresViz items={records.procedures} />}
        {records.diagnosticReports && (
          <DiagnosticReportsViz items={records.diagnosticReports} />
        )}
        {records.encounters && <EncountersViz items={records.encounters} />}
        {records.immunizations && (
          <ImmunizationsViz items={records.immunizations} />
        )}
      </div>
    </div>
  );
}

export { Activity };
