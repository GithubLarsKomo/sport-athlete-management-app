CREATE TABLE IF NOT EXISTS athletes (
  id VARCHAR(64) PRIMARY KEY,
  auth_subject VARCHAR(191) NOT NULL UNIQUE,
  email VARCHAR(320) NULL,
  display_name VARCHAR(191) NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Berlin',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athlete_profiles (
  athlete_id VARCHAR(64) NOT NULL,
  profile_version INT NOT NULL,
  valid_from DATETIME(6) NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (athlete_id, profile_version),
  CONSTRAINT fk_profiles_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goals (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  goal_type ENUM('outcome','performance','process') NOT NULL,
  description TEXT NOT NULL,
  target_value DECIMAL(18,6) NULL,
  target_unit VARCHAR(64) NULL,
  target_date DATE NULL,
  priority INT NOT NULL DEFAULT 1,
  status ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_goals_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  INDEX idx_goals_athlete_status (athlete_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS competitions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  competition_date DATE NOT NULL,
  priority ENUM('A','B','C') NOT NULL,
  discipline VARCHAR(191) NULL,
  notes TEXT NULL,
  CONSTRAINT fk_competitions_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  INDEX idx_competitions_athlete_date (athlete_id, competition_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seasons (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('planned','active','completed') NOT NULL DEFAULT 'planned',
  payload_json JSON NOT NULL,
  CONSTRAINT fk_seasons_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  INDEX idx_seasons_active (athlete_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mesocycles (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  season_id VARCHAR(64) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  primary_adaptation VARCHAR(191) NOT NULL,
  payload_json JSON NOT NULL,
  CONSTRAINT fk_mesocycles_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_mesocycles_season FOREIGN KEY (season_id) REFERENCES seasons(id),
  INDEX idx_mesocycles_dates (athlete_id, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS microcycles (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  mesocycle_id VARCHAR(64) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  focus VARCHAR(191) NOT NULL,
  payload_json JSON NOT NULL,
  CONSTRAINT fk_microcycles_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_microcycles_meso FOREIGN KEY (mesocycle_id) REFERENCES mesocycles(id),
  INDEX idx_microcycles_dates (athlete_id, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planned_sessions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  microcycle_id VARCHAR(64) NULL,
  local_date DATE NOT NULL,
  planned_start DATETIME(6) NOT NULL,
  session_type VARCHAR(64) NOT NULL,
  objective TEXT NOT NULL,
  planned_duration_min DECIMAL(8,2) NOT NULL,
  planned_rpe DECIMAL(4,2) NULL,
  status ENUM('planned','completed','modified','cancelled') NOT NULL DEFAULT 'planned',
  version INT NOT NULL DEFAULT 1,
  payload_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_sessions_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_sessions_micro FOREIGN KEY (microcycle_id) REFERENCES microcycles(id),
  INDEX idx_sessions_today (athlete_id, local_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_checkins (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  local_date DATE NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_checkins_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  UNIQUE KEY uq_checkin_day (athlete_id, local_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS completed_sessions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  planned_session_id VARCHAR(64) NULL,
  started_at DATETIME(6) NOT NULL,
  completed_at DATETIME(6) NOT NULL,
  duration_min DECIMAL(8,2) NOT NULL,
  session_rpe DECIMAL(4,2) NOT NULL,
  session_load DECIMAL(12,2) NOT NULL,
  completion_status ENUM('completed','modified','stopped','not_started') NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_completed_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_completed_planned FOREIGN KEY (planned_session_id) REFERENCES planned_sessions(id),
  INDEX idx_completed_recent (athlete_id, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS adaptation_decisions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  decision_level ENUM('acute','tactical','strategic') NOT NULL,
  action VARCHAR(64) NOT NULL,
  safety_state ENUM('GREEN','YELLOW','ORANGE','RED') NOT NULL,
  trigger_text TEXT NOT NULL,
  input_snapshot_json JSON NOT NULL,
  previous_plan_json JSON NULL,
  decision_json JSON NOT NULL,
  revised_plan_json JSON NULL,
  rationale TEXT NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  human_override BOOLEAN NOT NULL DEFAULT FALSE,
  engine_version VARCHAR(191) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_adaptation_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  INDEX idx_adaptation_recent (athlete_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_plan_revisions (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  affected_entity_type VARCHAR(64) NOT NULL,
  affected_entity_id VARCHAR(64) NOT NULL,
  prior_version INT NOT NULL,
  new_version INT NOT NULL,
  adaptation_decision_id VARCHAR(64) NOT NULL,
  revision_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_revision_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT fk_revision_decision FOREIGN KEY (adaptation_decision_id) REFERENCES adaptation_decisions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  athlete_id VARCHAR(64) NULL,
  actor_subject VARCHAR(191) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  entity_type VARCHAR(96) NOT NULL,
  entity_id VARCHAR(191) NULL,
  details_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_audit_athlete_time (athlete_id, created_at),
  INDEX idx_audit_event_time (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
