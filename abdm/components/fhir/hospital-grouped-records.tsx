"use client";

import * as React from "react";
import {
  Building2,
  ChevronRight,
  FileHeart,
  FileText,
  Folder,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FullRecordsView } from "./fhir-visualizer";
import type { FhirRecords } from "./fhir-types";

export interface UploadRow {
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

export interface HospitalGroup {
  hospital_id: string | null;
  hospital_name: string;
  registration_no: string | null;
  uploads: UploadRow[];
}

interface Props {
  // API base path used to assemble three calls:
  //   GET <basePath>           → { groups: HospitalGroup[] }
  //   GET <basePath>/uploads/<id>/fhir
  //   GET <basePath>/uploads/<id>/original
  // Example: "/api/patient/records/by-hospital"
  //          "/api/fhir/records/by-abha/<abha>/by-hospital"
  basePath: string;
  uploadsPath?: string; // override if uploads live under a different base
}

export function HospitalGroupedRecords({ basePath, uploadsPath }: Props) {
  const [groups, setGroups] = React.useState<HospitalGroup[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [activeHospital, setActiveHospital] = React.useState<string | null>(null);
  const [activeUpload, setActiveUpload] = React.useState<UploadRow | null>(null);

  const uploadsBase = uploadsPath ?? basePath.replace(/\/by-hospital$/, "");

  React.useEffect(() => {
    setLoading(true);
    setGroups(null);
    setActiveHospital(null);
    setActiveUpload(null);
    (async () => {
      try {
        const res = await fetch(basePath);
        const json = await res.json();
        if (res.ok) setGroups(json.groups ?? []);
        else setError(json.error ?? "Failed to load records.");
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    })();
  }, [basePath]);

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
        <CardContent className="py-10 text-center text-sm text-destructive">
          {error}
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
            No medical records found for this patient.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (activeUpload) {
    return (
      <UploadDetail
        upload={activeUpload}
        uploadsBase={uploadsBase}
        breadcrumbs={[
          {
            label:
              groups.find((g) => (g.hospital_id ?? "self") === activeHospital)
                ?.hospital_name ?? "Records",
            onClick: () => setActiveUpload(null),
          },
          { label: activeUpload.original_filename ?? "Record" },
        ]}
        onBack={() => setActiveUpload(null)}
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
            <ChevronRight
              className="size-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary"
              strokeWidth={1.6}
            />
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
            {g.uploads.length} record{g.uploads.length === 1 ? "" : "s"} ·{" "}
            {g.uploads.reduce((s, u) => s + u.resource_count, 0)} FHIR resources
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
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
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
                {new Date(u.created_at).toLocaleString()} · {u.input_type.toUpperCase()} ·{" "}
                {u.resource_count} resources
              </p>
              <Badge variant="outline" className="mt-2 text-[10px]">
                Uploaded by {u.uploader_role}
              </Badge>
            </div>
            <ChevronRight
              className="size-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary"
              strokeWidth={1.6}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadDetail({
  upload,
  uploadsBase,
  breadcrumbs,
  onBack,
}: {
  upload: UploadRow;
  uploadsBase: string;
  breadcrumbs: { label: string; onClick?: () => void }[];
  onBack: () => void;
}) {
  const [records, setRecords] = React.useState<FhirRecords | null>(null);
  const [recordsLoading, setRecordsLoading] = React.useState(true);
  const [recordsError, setRecordsError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${uploadsBase}/uploads/${upload.upload_id}/fhir`);
        const json = await res.json();
        if (res.ok) setRecords(json);
        else setRecordsError(json.error ?? "Failed to fetch FHIR resources.");
      } catch {
        setRecordsError("Network error.");
      } finally {
        setRecordsLoading(false);
      }
    })();
  }, [upload.upload_id, uploadsBase]);

  const originalUrl = `${uploadsBase}/uploads/${upload.upload_id}/original`;
  const isPdf = upload.input_type === "pdf";
  const isJson = upload.input_type === "json";
  const isCcda = upload.input_type === "ccda";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
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

function OriginalTextPreview({
  url,
  kind,
}: {
  url: string;
  kind: "json" | "xml";
}) {
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
