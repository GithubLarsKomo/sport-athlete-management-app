CREATE TABLE IF NOT EXISTS specialist_artifacts (
  id CHAR(36) PRIMARY KEY,
  athlete_id VARCHAR(191) NOT NULL,
  artifact_type VARCHAR(64) NOT NULL,
  artifact_version INT NOT NULL,
  generated_at DATETIME(6) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  created_by_subject VARCHAR(191) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_specialist_artifact_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  CONSTRAINT uq_specialist_artifact_version UNIQUE (athlete_id, artifact_type, artifact_version),
  INDEX idx_specialist_artifact_latest (athlete_id, artifact_type, artifact_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
