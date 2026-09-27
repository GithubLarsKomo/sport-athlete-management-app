ALTER TABLE activity_journal_entries
  ADD COLUMN IF NOT EXISTS expectation_match VARCHAR(16) NULL,
  ADD COLUMN IF NOT EXISTS authored_by_subject VARCHAR(191) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_activity_journal_expectation_match'
  ) THEN
    ALTER TABLE activity_journal_entries
      ADD CONSTRAINT ck_activity_journal_expectation_match
      CHECK (expectation_match IS NULL OR expectation_match IN ('easier','as_expected','harder'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS coach_session_notes (
  id VARCHAR(64) PRIMARY KEY,
  athlete_id VARCHAR(64) NOT NULL,
  completed_session_id VARCHAR(64) NOT NULL,
  authored_by_subject VARCHAR(191) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coach_note_athlete FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE,
  CONSTRAINT fk_coach_note_completed FOREIGN KEY (completed_session_id) REFERENCES completed_sessions(id) ON DELETE CASCADE,
  CONSTRAINT uq_coach_note_author UNIQUE (completed_session_id, authored_by_subject),
  CONSTRAINT ck_coach_note_not_blank CHECK (length(btrim(note)) > 0),
  CONSTRAINT ck_coach_note_length CHECK (length(note) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_coach_session_notes_completed
  ON coach_session_notes (completed_session_id, updated_at DESC);
