-- 009_image_prescription_input.sql
--
-- Multilingual prescription translation: patients upload a prescription IMAGE
-- (Kannada/Hindi/Tamil/English) which a Groq vision model OCRs, translates, and
-- extracts into FHIR MedicationRequest resources. These uploads are recorded in
-- medical_uploads with input_type = 'image', which the existing CHECK constraint
-- (pdf|ccda|json) does not allow. Widen it to include 'image'.

ALTER TABLE public.medical_uploads
  DROP CONSTRAINT IF EXISTS medical_uploads_input_type_check;

ALTER TABLE public.medical_uploads
  ADD CONSTRAINT medical_uploads_input_type_check
  CHECK (input_type IN ('pdf', 'ccda', 'json', 'image'));
