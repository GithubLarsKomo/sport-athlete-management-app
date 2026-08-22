CREATE TABLE IF NOT EXISTS specialist_artifacts (
  id VARCHAR(36) PRIMARY KEY,
  athlete_id VARCHAR(191) NOT NULL,
  artifact_type VARCHAR(64) NOT NULL,
  artifact_version INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  payload_json JSONB NOT NULL,
  created_by_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_specialist_artifact_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  CONSTRAINT uq_specialist_artifact_version UNIQUE (athlete_id, artifact_type, artifact_version)
);

CREATE INDEX IF NOT EXISTS idx_specialist_artifact_latest ON specialist_artifacts (athlete_id, artifact_type, artifact_version);
