-- Performance Lab app state is isolated from HSG and trader state.
ALTER TABLE app_state DROP CONSTRAINT IF EXISTS app_state_area_check;
ALTER TABLE app_state ADD CONSTRAINT app_state_area_check CHECK (area IN ('hsg', 'trader', 'performance'));
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_area_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_area_check CHECK (area IN ('hsg', 'trader', 'performance', 'system'));
