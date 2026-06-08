# ABDM EHR System — Next.js + FHIR

A healthcare data management system modeled on the **Ayushman Bharat Digital Mission (ABDM)**. Patients, doctors, hospitals, and admins manage interoperable health records. Clinical documents (C-CDA XML, lab PDFs, FHIR JSON) are converted to **FHIR R4** and stored in a **HAPI FHIR** server. Access is gated by ABDM-style consent and Supabase Row-Level Security.

## Overview

- **ABDM consent flow** — patients grant/revoke; doctors & hospitals request and read records under consent.
- **FHIR conversion** — C-CDA, PDF lab reports, and JSON → FHIR R4 bundles, persisted in HAPI.
- **Document storage** — original uploaded file kept in Supabase Storage, paired with its FHIR rendering.
- **Auth & RBAC** — Supabase Auth + OTP; roles: Patient, Doctor, Hospital, Admin.
- **Audit trail** — every record access logged.
- **Stack** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase, HAPI FHIR.

## Architecture

```
abdm/
├── app/
│   ├── api/                  # backend route handlers
│   │   ├── auth/             # register, login, verify-otp, callback
│   │   ├── admin/            # approve hospitals/doctors
│   │   ├── consents/         # create / list / revoke consent
│   │   ├── consent-requests/ # incoming data-share requests
│   │   ├── fhir/             # upload, records, prescriptions (FHIR-facing)
│   │   ├── patient/          # patient upload, records, uploads, link-records
│   │   ├── doctor/           # patient-lookup
│   │   ├── hospital/         # doctors
│   │   └── me/               # current profile
│   ├── auth/                 # login / register / verify-otp pages
│   ├── dashboard/            # patient / doctor / hospital / admin dashboards
│   └── page.tsx
├── lib/
│   ├── auth.ts               # requireRole, session helpers
│   ├── consent.ts            # consent business logic
│   ├── audit.ts              # access logging
│   ├── storage.ts            # Supabase Storage helpers (original files)
│   ├── supabase/             # client / server / admin clients
│   ├── fhir/
│   │   ├── hapi.ts           # HAPI FHIR HTTP client (store/fetch resources)
│   │   ├── converter.ts      # Microsoft FHIR Converter HTTP client (optional)
│   │   ├── bundle.ts         # tag/transform bundles, inject ABHA identifier
│   │   └── transform.ts      # bundle → flattened view models
│   ├── ccda/
│   │   └── to-fhir.ts        # direct C-CDA → FHIR R4 mapper (default path)
│   └── pdf/
│       ├── extract.ts        # pdf-parse text extraction
│       ├── structure.ts      # regex extraction → StructuredReport
│       └── to-fhir.ts        # StructuredReport → FHIR R4 bundle
└── supabase/
    ├── schema.sql            # tables + ABDM enums
    ├── rls.sql               # Row-Level Security policies
    ├── index.sql             # indexes
    ├── helper.sql            # helper functions
    └── migrations/           # numbered incremental migrations (005+, ...)
```

## How conversion works

The app uses a **hybrid** conversion strategy. The Microsoft FHIR Converter is **optional** and only used for some inputs; the default paths are in-process mappers.

| Input | Default (no `template` field) | When `template` field is sent |
|-------|-------------------------------|-------------------------------|
| **C-CDA** (XML) | `ccdaToFhirBundle()` — direct DOM walk via `fast-xml-parser` (`lib/ccda/to-fhir.ts`) | `convertCcda()` → Microsoft FHIR Converter (HTTP) |
| **PDF** (lab report) | `pdfReportToBundle()` — `pdf-parse` text → regex structuring → builder (`lib/pdf/`) | n/a (PDF never uses MS converter) |
| **JSON** | `convertJson()` → Microsoft FHIR Converter (HTTP) | same |

Routing logic: `app/api/patient/upload/route.ts` and `app/api/fhir/upload/route.ts`.

**Why the direct mappers:** the MS converter's generic Liquid templates dropped or mangled sections (medications, encounters, immunizations) in this HAPI deployment, and the PDF `ExamplePatient` template emitted only demographics. The custom mappers emit complete bundles. The MS converter container is only required if you upload **JSON**, or **C-CDA with an explicit `template`**.

> Note: C-CDA conversion is a real XML DOM walk keyed on `templateId` OIDs — *not* regex. Only the **PDF** path is regex-based (OCR/parsed text has no structure to walk).

## Prerequisites

- **Node.js** 18+ — https://nodejs.org/
- **Supabase** project (free tier) — https://supabase.com/
- **HAPI FHIR server** (Docker) — required for storing/reading records.
- **Docker** — for HAPI FHIR, and optionally the Microsoft FHIR Converter.

## Installation

### 1. Install dependencies

```bash
git clone <your-repo-url>
cd abdm
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# HAPI FHIR server (server-side only, never exposed to client)
HAPI_FHIR_URL=http://localhost:8080/fhir

# Microsoft FHIR Converter container — OPTIONAL (only for JSON / templated C-CDA)
FHIR_CONVERTER_URL=http://localhost:5000
```

### 3. Run HAPI FHIR (required)

```bash
docker run -d --name hapi -p 8080:8080 hapiproject/hapi:latest
```

HAPI takes ~30–90s to boot. Verify:

- Capability statement: http://localhost:8080/fhir/metadata  (returns JSON when ready)
- Web testpage UI: http://localhost:8080/

> A bare `GET http://localhost:8080/fhir` returns **HTTP 400** by design — the FHIR base needs a resource path or `/metadata`. The app appends `/Patient`, `/Observation`, etc., so it works regardless.

### 4. Run the Microsoft FHIR Converter (optional)

Only needed for JSON uploads or C-CDA uploads that pass an explicit `template`:

```bash
docker run -d --name fhir-converter -p 5000:8080 \
  mcr.microsoft.com/healthcareapis/fhir-converter:1.0.430-preview
```

Health check: http://localhost:5000/health/check

### 5. Set up the database

**Supabase CLI:**

```bash
supabase db push
```

**Manual (SQL Editor)** — run in order:

1. `supabase/schema.sql`
2. `supabase/index.sql`
3. `supabase/rls.sql`
4. `supabase/helper.sql`
5. each file in `supabase/migrations/` in ascending number order

Also create the Storage bucket for original uploads (see `migrations/005_uploads_and_linked_records.sql`):

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-uploads', 'medical-uploads', false)
ON CONFLICT (id) DO NOTHING;
```

The schema covers: users (Patient/Doctor/Hospital/Admin), consents, consent requests, medical uploads, linked records, prescriptions, and audit logs.

## Running

```bash
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Upload API

`POST /api/fhir/upload` (doctor/hospital/admin) and `POST /api/patient/upload` (patient) — `multipart/form-data`:

| Field | Value |
|-------|-------|
| `inputType` | `ccda` \| `pdf` \| `json` (defaults to `ccda`) |
| `file` | the C-CDA XML, PDF, or JSON file |
| `patientId` | internal patient UUID |
| `template` | *(optional)* C-CDA/JSON root template — forces MS converter for that input |

**Pipeline:** file → convert to FHIR bundle → tag resources (`urn:upload|<id>`, hospital tag) → inject ABHA identifier → store in HAPI → record original in Supabase Storage + `medical_uploads`. If the patient has no `fhir_patient_id` yet, it is extracted from the bundle and saved.

**Supported C-CDA root templates** (templated path): `CCD`, `ConsultationNote`, `DischargeSummary`, `HistoryandPhysical`, `OperativeNote`, `ProcedureNote`, `ProgressNote`, `ReferralNote`, `TransferSummary`.

## Security

- Supabase Auth (email + OTP), role-based access via `requireRole`.
- Row-Level Security isolates data per user/role.
- HAPI URL and service-role key are server-side only.
- Consent enforced before cross-party record reads; all access audited.

## Key directories

- **API routes** — `app/api/` (auth, admin, consents, consent-requests, fhir, patient, doctor, hospital, me)
- **FHIR** — `lib/fhir/` (HAPI client, MS converter client, bundle tagging/transform)
- **Mappers** — `lib/ccda/`, `lib/pdf/`
- **Data layer** — `lib/supabase/`, `supabase/`
