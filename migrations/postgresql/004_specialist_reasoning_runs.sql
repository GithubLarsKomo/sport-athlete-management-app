CREATE TABLE IF NOT EXISTS specialist_reasoning_runs (
  id VARCHAR(36) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  trigger_type VARCHAR(64) NOT NULL,
  selected_types_json JSONB NOT NULL,
  status VARCHAR(32) NOT NULL,
  result_json JSONB NULL,
  error_text TEXT NULL,
  created_by_subject VARCHAR(191) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT fk_specialist_reasoning_run_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_specialist_reasoning_run_athlete ON specialist_reasoning_runs (athlete_id, started_at);
CREATE INDEX IF NOT EXISTS idx_specialist_reasoning_run_status ON specialist_reasoning_runs (status, started_at);

ALTER TABLE specialist_artifacts ADD COLUMN IF NOT EXISTS reasoning_run_id VARCHAR(36) NULL;
ALTER TABLE specialist_artifacts ADD COLUMN IF NOT EXISTS provenance_json JSONB NULL;
CREATE INDEX IF NOT EXISTS idx_specialist_artifact_reasoning_run ON specialist_artifacts (reasoning_run_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_specialist_artifact_reasoning_run') THEN
    ALTER TABLE specialist_artifacts
      ADD CONSTRAINT fk_specialist_artifact_reasoning_run
      FOREIGN KEY (reasoning_run_id) REFERENCES specialist_reasoning_runs(id) ON DELETE SET NULL;
  END IF;
END $$;
