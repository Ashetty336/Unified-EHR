-- 006_functions.sql

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_consents_updated_at
  BEFORE UPDATE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate ABHA number (14-digit numeric string)
CREATE OR REPLACE FUNCTION generate_abha_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    new_number := LPAD(FLOOR(RANDOM() * 100000000000000)::BIGINT::TEXT, 14, '0');
    SELECT EXISTS(SELECT 1 FROM public.abha_registry WHERE abha_number = new_number)
      INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Auto-expire consents (call via cron or check inline)
CREATE OR REPLACE FUNCTION expire_consents()
RETURNS void AS $$
BEGIN
  UPDATE public.consents
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'approved'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;