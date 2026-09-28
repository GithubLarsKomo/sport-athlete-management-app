CREATE TABLE IF NOT EXISTS performance_test_protocols (
  id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  athlete_id VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  modality VARCHAR(16) NOT NULL,
  protocol_kind VARCHAR(24) NOT NULL,
  definition_json JSONB NOT NULL,
  created_by_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (athlete_id, id, version),
  CONSTRAINT fk_test_protocol_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  CONSTRAINT ck_test_protocol_version CHECK (version >= 1),
  CONSTRAINT ck_test_protocol_modality CHECK (modality IN ('rowerg','bike')),
  CONSTRAINT ck_test_protocol_kind CHECK (protocol_kind IN ('staged'))
);

CREATE INDEX IF NOT EXISTS idx_test_protocols_athlete
  ON performance_test_protocols (athlete_id, created_at DESC);

CREATE TABLE IF NOT EXISTS performance_tests (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  protocol_id VARCHAR(64) NOT NULL,
  protocol_version INTEGER NOT NULL,
  protocol_source VARCHAR(16) NOT NULL,
  protocol_snapshot_json JSONB NOT NULL,
  modality VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  performed_at TIMESTAMPTZ NULL,
  device VARCHAR(191) NULL,
  warm_up_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  environment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  termination_reason TEXT NULL,
  notes TEXT NULL,
  expected_targets_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NULL,
  interpretation_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  planned_by_subject VARCHAR(191) NOT NULL,
  performed_by_subject VARCHAR(191) NULL,
  retest_of_test_id VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_performance_test_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  CONSTRAINT fk_performance_test_retest FOREIGN KEY (retest_of_test_id) REFERENCES performance_tests(id) ON DELETE SET NULL,
  CONSTRAINT ck_performance_test_protocol_version CHECK (protocol_version >= 1),
  CONSTRAINT ck_performance_test_source CHECK (protocol_source IN ('built_in','custom')),
  CONSTRAINT ck_performance_test_modality CHECK (modality IN ('rowerg','bike')),
  CONSTRAINT ck_performance_test_status CHECK (status IN ('planned','performed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_performance_tests_athlete_time
  ON performance_tests (athlete_id, scheduled_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_tests_retest
  ON performance_tests (athlete_id, retest_of_test_id);
