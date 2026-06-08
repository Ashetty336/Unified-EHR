# Unified Health Records Platform

A consent-driven health records platform inspired by India's ABHA (Ayushman Bharat Health Account). Patients own their data; doctors and hospitals access it only through explicit, time-bound, revocable consent. Clinical documents (C-CDA, HL7v2) are converted to FHIR R4 and stored on a HAPI FHIR server that is never exposed to clients — all access is gatekept by the application backend.

## Roles

| Role | Description |
|------|-------------|
| **Patient** | Owns records. Gets an auto-generated ABHA number/address on first login. Grants and revokes consent. |
| **Doctor** | Must belong to a hospital. Requests patient data by ABHA number. Requires admin approval. |
| **Hospital** | Organization. Requires admin approval. |
| **Admin** | Approves hospitals and doctors. |

## Architecture

```
┌────────────────────────────────────────────┐
│  Next.js app (abdm/)                         │
│  - UI (patient/doctor/hospital/admin dash)   │
│  - API routes = backend (consent gatekeeper) │
└───┬───────────────┬───────────────┬──────────┘
    │               │               │
┌───▼─────┐  ┌──────▼────────┐  ┌───▼──────────────┐
│ Supabase│  │ HAPI FHIR      │  │ MS FHIR Converter │
│ auth+db │  │ (private)      │  │ (C-CDA/HL7→FHIR)  │
└─────────┘  └────────────────┘  └───────────────────┘
```

- **Frontend + backend:** Next.js 16 (App Router). No separate backend service — all logic lives in API routes.
- **Auth + database:** Supabase (email OTP + OAuth, Postgres).
- **FHIR storage:** HAPI FHIR server (R4). Not publicly reachable; backend is the only client.
- **Document conversion:** Microsoft FHIR Converter container converts C-CDA / HL7v2 / JSON / STU3 to FHIR R4.

## Repository Layout

| Path | Purpose |
|------|---------|
| `abdm/` | The Next.js application (the project you run). |
| `abdm/supabase/` | Database schema, RLS, indexes, migrations. |
| `abdm/lib/fhir/` | HAPI FHIR + Microsoft Converter clients. |
| `FHIR-Converter/` | Vendored Microsoft FHIR Converter source (reference; you run its container, not this source). |
| `demo/` | Sample documents (`ccdaex.xml`, `myreport.pdf`) for testing conversion. |
| `progress.md files/` | Design notes and context docs. |

---

## Prerequisites

- **Node.js 22+** (developed on v22.21.1) and npm
- **Docker** (for the FHIR Converter and, optionally, HAPI FHIR)
- A **Supabase** project (cloud or local CLI)

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd "unified ehr/abdm"
npm install
```

> All app commands run from inside the `abdm/` directory.

### 2. Set up Supabase

Create a project at [supabase.com](https://supabase.com) (or run `supabase start` locally). Then apply the database schema.

Run the SQL files against your Supabase database in this order (via the Supabase SQL editor or `psql`):

1. `supabase/schema.sql` — tables, enums, types
2. `supabase/index.sql` — indexes
3. `supabase/rls.sql` — row-level security policies
4. `supabase/helper.sql` — helper functions
5. `supabase/migrations/005_uploads_and_linked_records.sql`
6. `supabase/migrations/006_prescriptions.sql`
7. `supabase/migrations/007_approval_audit_columns.sql`

Example with `psql`:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
psql "$DATABASE_URL" -f supabase/index.sql
psql "$DATABASE_URL" -f supabase/rls.sql
psql "$DATABASE_URL" -f supabase/helper.sql
psql "$DATABASE_URL" -f supabase/migrations/005_uploads_and_linked_records.sql
psql "$DATABASE_URL" -f supabase/migrations/006_prescriptions.sql
psql "$DATABASE_URL" -f supabase/migrations/007_approval_audit_columns.sql
```

**Create a storage bucket** named `medical-uploads` (Supabase Dashboard → Storage → New bucket). This holds uploaded clinical documents.

### 3. Start the HAPI FHIR server

The backend talks to a HAPI FHIR R4 server. Run one with Docker:

```bash
docker run -d -p 8080:8080 --name hapi-fhir hapiproject/hapi:latest
```

The FHIR base will be at `http://localhost:8080/fhir`. **Do not expose this port publicly** — only the Next.js backend should reach it.

### 4. Start the Microsoft FHIR Converter

Converts C-CDA / HL7v2 / JSON / STU3 documents to FHIR R4:

```bash
docker run -d -p 5000:8080 --name fhir-converter \
  mcr.microsoft.com/healthcareapis/fhir-converter:1.0.430-preview
```

Health check: `curl http://localhost:5000/health/check`.

> Local template mount paths are **not** supported by the preview container. To use custom templates, push them to an OCI registry (`oras push`) and reference via the `FHIR_CONVERTER_TEMPLATE_*` env vars.

### 5. Configure environment variables

Copy the example and fill in values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|----------|:--------:|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role key (server-only; never exposed to client). |
| `HAPI_FHIR_URL` | ✅ | HAPI FHIR base URL. Default `http://localhost:8080/fhir`. |
| `FHIR_CONVERTER_URL` | ✅ | Converter container URL. Default `http://localhost:5000`. |
| `MEDICAL_UPLOADS_BUCKET` | optional | Storage bucket name. Default `medical-uploads`. |
| `FHIR_CONVERTER_API_VERSION` | optional | Converter API version. Default `2024-05-01-preview`. |
| `FHIR_CONVERTER_TEMPLATE_CCDA` | optional | Override C-CDA template ref. |
| `FHIR_CONVERTER_TEMPLATE_HL7V2` | optional | Override HL7v2 template ref. |
| `FHIR_CONVERTER_TEMPLATE_JSON` | optional | Override JSON template ref. |
| `FHIR_CONVERTER_TEMPLATE_STU3` | optional | Override STU3→R4 template ref. |

> `NEXT_PUBLIC_*` vars are sent to the browser. Keep `SUPABASE_SERVICE_ROLE_KEY` and `HAPI_FHIR_URL` server-only.

### 6. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Start dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | Run ESLint. |

---

## How It Works

### Authentication & identity
- Email OTP (passwordless) plus OAuth. One email = one account.
- Each user has a Supabase UUID (internal joins only).
- On first login a patient identity is created with an **ABHA number** (external lookup ID) and **ABHA address** (display only). Both are system-generated and immutable.

### Consent flow
1. Doctor enters a patient's ABHA number → a consent request is created.
2. Patient approves or rejects from their dashboard.
3. On approval, access is granted — **full** or **resource-level** (e.g. Observation only, Medication only).
4. Consent is time-bound (`expires_at`) and revocable at any time; revocation is immediate.

### Access enforcement
Every data request passes through the backend, which:
1. Verifies the Supabase JWT.
2. Checks the user's role.
3. Validates consent exists, is approved, not expired, not revoked.
4. Only then queries the HAPI FHIR server.

### FHIR mapping
Patient → `Patient`, Doctor → `Practitioner`, Hospital → `Organization`, Consent → `Consent`. Every data access is written to an audit log (doctor, patient, resource, timestamp, consent used).

---

## Testing Document Conversion

Use the samples in `demo/`:
- `demo/ccdaex.xml` — example C-CDA document for the converter.
- `demo/myreport.pdf` — example PDF report (parsed via `pdf-parse` / OCR).

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `converter unreachable` | FHIR Converter container running? `curl http://localhost:5000/health/check`. |
| FHIR reads/writes fail | HAPI server up at `HAPI_FHIR_URL`? |
| Auth/db errors | Supabase URL + keys correct in `.env.local`; schema applied. |
| Upload fails | `medical-uploads` bucket exists; `SUPABASE_SERVICE_ROLE_KEY` set. |
