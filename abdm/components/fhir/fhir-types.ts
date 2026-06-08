export interface LabResult {
  id: string;
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  status: string;
  effectiveDate: string | null;
}

export interface Prescription {
  id: string;
  medication: string;
  status: string;
  intent: string;
  authoredOn: string | null;
  dosageInstruction: string | null;
}

export interface Condition {
  id: string;
  name: string;
  clinicalStatus: string | null;
  verificationStatus: string | null;
  onsetDate: string | null;
  recordedDate: string | null;
}

export interface Allergy {
  id: string;
  substance: string;
  category: string | null;
  criticality: string | null;
  clinicalStatus: string | null;
  recordedDate: string | null;
}

export interface Procedure {
  id: string;
  name: string;
  status: string;
  performedDate: string | null;
}

export interface DiagnosticReport {
  id: string;
  name: string;
  status: string;
  effectiveDate: string | null;
  conclusion: string | null;
}

export interface Encounter {
  id: string;
  type: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

export interface Immunization {
  id: string;
  vaccine: string;
  status: string;
  occurrenceDate: string | null;
}

export interface FhirPatient {
  id: string;
  name: string;
  gender: string | null;
  birthDate: string | null;
  identifiers?: { system: string; value: string }[];
}

export interface FhirRecords {
  patient: FhirPatient | null;
  labResults: LabResult[];
  prescriptions: Prescription[];
  conditions?: Condition[];
  allergies?: Allergy[];
  procedures?: Procedure[];
  diagnosticReports?: DiagnosticReport[];
  encounters?: Encounter[];
  immunizations?: Immunization[];
}
