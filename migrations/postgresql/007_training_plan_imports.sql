CREATE TABLE IF NOT EXISTS training_plan_imports (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  revision INTEGER NOT NULL,
  content_hash CHAR(64) NOT NULL,
  producer_json JSONB NOT NULL,
  source_refs_json JSONB NOT NULL,
  bundle_json JSONB NOT NULL,
  imported_by_subject VARCHAR(191) NOT NULL,
  supersedes_import_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_plan_import_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_plan_import_supersedes FOREIGN KEY (supersedes_import_id) REFERENCES training_plan_imports(id),
  CONSTRAINT uq_plan_import_hash UNIQUE (athlete_id, content_hash),
  CONSTRAINT uq_plan_import_revision UNIQUE (athlete_id, revision),
  CONSTRAINT ck_plan_import_revision CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_plan_imports_athlete_revision
  ON training_plan_imports (athlete_id, revision DESC);
