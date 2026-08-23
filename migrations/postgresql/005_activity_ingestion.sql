CREATE TABLE IF NOT EXISTS activities (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  planned_session_id VARCHAR(64) NULL,
  completed_session_id VARCHAR(64) NULL,
  activity_type VARCHAR(64) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  duration_s NUMERIC(12,3) NULL,
  distance_m NUMERIC(14,3) NULL,
  canonical_source VARCHAR(32) NULL,
  canonical_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_state VARCHAR(16) NOT NULL DEFAULT 'standalone' CHECK (match_state IN ('standalone','auto_merged','review')),
  match_candidate_activity_id VARCHAR(64) NULL,
  match_score NUMERIC(5,4) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activities_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  CONSTRAINT fk_activities_planned FOREIGN KEY (planned_session_id) REFERENCES planned_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_activities_completed FOREIGN KEY (completed_session_id) REFERENCES completed_sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_activities_match_candidate FOREIGN KEY (match_candidate_activity_id) REFERENCES activities(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_athlete_started ON activities (athlete_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_match_review ON activities (athlete_id, match_state, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_planned ON activities (athlete_id, planned_session_id);

CREATE TABLE IF NOT EXISTS activity_sources (
  id VARCHAR(64) PRIMARY KEY,
  activity_id VARCHAR(64) NOT NULL,
  athlete_id VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('garmin','concept2','rp3','manual')),
  external_activity_id VARCHAR(191) NULL,
  source_started_at TIMESTAMPTZ NULL,
  source_ended_at TIMESTAMPTZ NULL,
  raw_sha256 CHAR(64) NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  intervals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  samples_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_sources_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_sources_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  CONSTRAINT uq_activity_source_external UNIQUE (athlete_id, provider, external_activity_id),
  CONSTRAINT uq_activity_source_hash UNIQUE (athlete_id, provider, raw_sha256)
);

CREATE INDEX IF NOT EXISTS idx_activity_sources_activity ON activity_sources (activity_id, provider);
CREATE INDEX IF NOT EXISTS idx_activity_sources_athlete_provider ON activity_sources (athlete_id, provider, imported_at DESC);

CREATE TABLE IF NOT EXISTS activity_journal_entries (
  activity_id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  session_rpe NUMERIC(4,2) NULL CHECK (session_rpe IS NULL OR (session_rpe >= 0 AND session_rpe <= 10)),
  pain_0_10 INTEGER NULL CHECK (pain_0_10 IS NULL OR (pain_0_10 >= 0 AND pain_0_10 <= 10)),
  comment TEXT NULL,
  deviations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  finalized_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_journal_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_journal_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_import_cursors (
  athlete_id VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  cursor_key VARCHAR(64) NOT NULL,
  cursor_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (athlete_id, provider, cursor_key),
  CONSTRAINT fk_activity_cursor_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE
);
