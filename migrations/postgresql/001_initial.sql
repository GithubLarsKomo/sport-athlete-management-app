CREATE TABLE IF NOT EXISTS athletes (
  id VARCHAR(64) PRIMARY KEY,
  auth_subject VARCHAR(191) NOT NULL UNIQUE,
  email VARCHAR(320),
  display_name VARCHAR(191),
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Berlin',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS athlete_profiles (
  athlete_id VARCHAR(64) NOT NULL,
  profile_version INTEGER NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (athlete_id, profile_version),
  CONSTRAINT fk_profiles_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  goal_type VARCHAR(16) NOT NULL,
  description TEXT NOT NULL,
  target_value NUMERIC(18,6),
  target_unit VARCHAR(64),
  target_date DATE,
  priority INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_goals_type CHECK (goal_type IN ('outcome','performance','process')),
  CONSTRAINT ck_goals_status CHECK (status IN ('active','completed','cancelled')),
  CONSTRAINT fk_goals_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

CREATE INDEX IF NOT EXISTS idx_goals_athlete_status ON goals (athlete_id, status);

CREATE TABLE IF NOT EXISTS competitions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  competition_date DATE NOT NULL,
  priority VARCHAR(1) NOT NULL,
  discipline VARCHAR(191),
  notes TEXT,
  CONSTRAINT ck_competitions_priority CHECK (priority IN ('A','B','C')),
  CONSTRAINT fk_competitions_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

CREATE INDEX IF NOT EXISTS idx_competitions_athlete_date ON competitions (athlete_id, competition_date);

CREATE TABLE IF NOT EXISTS seasons (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'planned',
  payload_json JSONB NOT NULL,
  CONSTRAINT ck_seasons_status CHECK (status IN ('planned','active','completed')),
  CONSTRAINT fk_seasons_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

CREATE INDEX IF NOT EXISTS idx_seasons_active ON seasons (athlete_id, status);

CREATE TABLE IF NOT EXISTS mesocycles (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  season_id VARCHAR(64) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  primary_adaptation VARCHAR(191) NOT NULL,
  payload_json JSONB NOT NULL,
  CONSTRAINT fk_mesocycles_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_mesocycles_season FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX IF NOT EXISTS idx_mesocycles_dates ON mesocycles (athlete_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS microcycles (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  mesocycle_id VARCHAR(64) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  focus VARCHAR(191) NOT NULL,
  payload_json JSONB NOT NULL,
  CONSTRAINT fk_microcycles_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_microcycles_meso FOREIGN KEY (mesocycle_id) REFERENCES mesocycles(id)
);

CREATE INDEX IF NOT EXISTS idx_microcycles_dates ON microcycles (athlete_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS planned_sessions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  microcycle_id VARCHAR(64),
  local_date DATE NOT NULL,
  planned_start TIMESTAMPTZ NOT NULL,
  session_type VARCHAR(64) NOT NULL,
  objective TEXT NOT NULL,
  planned_duration_min NUMERIC(8,2) NOT NULL,
  planned_rpe NUMERIC(4,2),
  status VARCHAR(16) NOT NULL DEFAULT 'planned',
  version INTEGER NOT NULL DEFAULT 1,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_sessions_status CHECK (status IN ('planned','completed','modified','cancelled')),
  CONSTRAINT fk_sessions_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_sessions_micro FOREIGN KEY (microcycle_id) REFERENCES microcycles(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_today ON planned_sessions (athlete_id, local_date, status);

CREATE TABLE IF NOT EXISTS daily_checkins (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  local_date DATE NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_checkins_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT uq_checkin_day UNIQUE (athlete_id, local_date)
);

CREATE TABLE IF NOT EXISTS completed_sessions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  planned_session_id VARCHAR(64),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_min NUMERIC(8,2) NOT NULL,
  session_rpe NUMERIC(4,2) NOT NULL,
  session_load NUMERIC(12,2) NOT NULL,
  completion_status VARCHAR(16) NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_completed_status CHECK (completion_status IN ('completed','modified','stopped','not_started')),
  CONSTRAINT fk_completed_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_completed_planned FOREIGN KEY (planned_session_id) REFERENCES planned_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_completed_recent ON completed_sessions (athlete_id, completed_at);

CREATE TABLE IF NOT EXISTS adaptation_decisions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  decision_level VARCHAR(16) NOT NULL,
  action VARCHAR(64) NOT NULL,
  safety_state VARCHAR(8) NOT NULL,
  trigger_text TEXT NOT NULL,
  input_snapshot_json JSONB NOT NULL,
  previous_plan_json JSONB,
  decision_json JSONB NOT NULL,
  revised_plan_json JSONB,
  rationale TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,
  human_override BOOLEAN NOT NULL DEFAULT FALSE,
  engine_version VARCHAR(191) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_adaptation_level CHECK (decision_level IN ('acute','tactical','strategic')),
  CONSTRAINT ck_adaptation_safety CHECK (safety_state IN ('GREEN','YELLOW','ORANGE','RED')),
  CONSTRAINT fk_adaptation_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

CREATE INDEX IF NOT EXISTS idx_adaptation_recent ON adaptation_decisions (athlete_id, created_at);

CREATE TABLE IF NOT EXISTS training_plan_revisions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  affected_entity_type VARCHAR(64) NOT NULL,
  affected_entity_id VARCHAR(64) NOT NULL,
  prior_version INTEGER NOT NULL,
  new_version INTEGER NOT NULL,
  adaptation_decision_id VARCHAR(64) NOT NULL,
  revision_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_revision_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_revision_decision FOREIGN KEY (adaptation_decision_id) REFERENCES adaptation_decisions(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  athlete_id VARCHAR(64),
  actor_subject VARCHAR(191) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  entity_type VARCHAR(96) NOT NULL,
  entity_id VARCHAR(191),
  details_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_athlete_time ON audit_log (athlete_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_log (event_type, created_at);
