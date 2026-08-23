CREATE TABLE IF NOT EXISTS specialist_reasoning_runs (
  id CHAR(36) PRIMARY KEY,
  athlete_id VARCHAR(191) NOT NULL,
  trigger_type VARCHAR(64) NOT NULL,
  selected_types_json LONGTEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  result_json LONGTEXT NULL,
  error_text TEXT NULL,
  created_by_subject VARCHAR(191) NOT NULL,
  started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  CONSTRAINT fk_specialist_reasoning_run_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  INDEX idx_specialist_reasoning_run_athlete (athlete_id, started_at),
  INDEX idx_specialist_reasoning_run_status (status, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE specialist_artifacts ADD COLUMN IF NOT EXISTS reasoning_run_id CHAR(36) NULL AFTER created_by_subject;
ALTER TABLE specialist_artifacts ADD COLUMN IF NOT EXISTS provenance_json LONGTEXT NULL AFTER reasoning_run_id;
ALTER TABLE specialist_artifacts ADD INDEX idx_specialist_artifact_reasoning_run (reasoning_run_id);
ALTER TABLE specialist_artifacts ADD CONSTRAINT fk_specialist_artifact_reasoning_run FOREIGN KEY (reasoning_run_id) REFERENCES specialist_reasoning_runs(id) ON DELETE SET NULL;
