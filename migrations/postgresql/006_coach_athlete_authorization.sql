CREATE TABLE IF NOT EXISTS app_principals (
  auth_subject VARCHAR(191) PRIMARY KEY,
  role VARCHAR(16) NOT NULL,
  athlete_id VARCHAR(64),
  email VARCHAR(320),
  display_name VARCHAR(191),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_app_principals_role CHECK (role IN ('athlete','coach')),
  CONSTRAINT fk_app_principals_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT uq_app_principals_athlete UNIQUE (athlete_id),
  CONSTRAINT ck_app_principals_role_target CHECK (
    (role='athlete' AND athlete_id IS NOT NULL)
    OR (role='coach' AND athlete_id IS NULL)
  )
);

INSERT INTO app_principals (auth_subject, role, athlete_id, email, display_name, active)
SELECT auth_subject, 'athlete', id, email, display_name, active
FROM athletes
ON CONFLICT (auth_subject) DO NOTHING;

CREATE TABLE IF NOT EXISTS coach_athlete_assignments (
  id VARCHAR(64) PRIMARY KEY,
  coach_subject VARCHAR(191) NOT NULL,
  athlete_id VARCHAR(64) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TIMESTAMPTZ,
  assigned_by_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coach_assignments_principal FOREIGN KEY (coach_subject) REFERENCES app_principals(auth_subject),
  CONSTRAINT fk_coach_assignments_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id),
  CONSTRAINT ck_coach_assignments_period CHECK (
    (active=TRUE AND effective_to IS NULL)
    OR (active=FALSE AND effective_to IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_athlete_active
  ON coach_athlete_assignments (coach_subject, athlete_id)
  WHERE active=TRUE AND effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_coach_assignments_subject
  ON coach_athlete_assignments (coach_subject, active, athlete_id);

CREATE INDEX IF NOT EXISTS idx_coach_assignments_athlete
  ON coach_athlete_assignments (athlete_id, active, coach_subject);
