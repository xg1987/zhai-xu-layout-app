-- Private practitioner case material. No public endpoint or report-time use.
-- Import the user-provided text separately; never commit identifiable case data.
CREATE TABLE fengshui_case_batches (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('user_supplied_notes')),
  received_at TEXT NOT NULL,
  case_count INTEGER NOT NULL CHECK (case_count >= 0),
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE fengshui_case_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES fengshui_case_batches(id),
  person_label TEXT NOT NULL,
  occurrence INTEGER NOT NULL DEFAULT 1 CHECK (occurrence > 0),
  source_text TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'reviewed', 'rejected')),
  UNIQUE (batch_id, person_label, occurrence)
);
CREATE INDEX fengshui_case_records_batch ON fengshui_case_records(batch_id);

CREATE TABLE fengshui_case_items (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES fengshui_case_records(id),
  item_order INTEGER NOT NULL CHECK (item_order > 0),
  source_text TEXT NOT NULL,
  direction_code TEXT CHECK (direction_code IN ('N','NE','E','SE','S','SW','W','NW','C')),
  category TEXT NOT NULL CHECK (category IN (
    'missing_corner','water_arrangement','fire_arrangement','room_assignment',
    'door_window','plant_furnishing','wealth_romance_study','outdoor',
    'general_arrangement','health_separate','unclear'
  )),
  location_text TEXT NOT NULL DEFAULT '',
  action_text TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review','reviewed','rejected')),
  report_enabled INTEGER NOT NULL DEFAULT 0 CHECK (report_enabled IN (0,1)),
  UNIQUE (case_id, item_order),
  CHECK (report_enabled = 0 OR review_status = 'reviewed')
);
CREATE INDEX fengshui_case_items_lookup
  ON fengshui_case_items(category,direction_code,review_status,report_enabled);

-- A spoken item may mention several directions or actions; keep all searchable.
CREATE TABLE fengshui_case_item_directions (
  case_item_id TEXT NOT NULL REFERENCES fengshui_case_items(id),
  direction_code TEXT NOT NULL CHECK (direction_code IN ('N','NE','E','SE','S','SW','W','NW','C')),
  PRIMARY KEY (case_item_id,direction_code)
);
CREATE INDEX fengshui_case_item_directions_lookup
  ON fengshui_case_item_directions(direction_code,case_item_id);

CREATE TABLE fengshui_case_item_categories (
  case_item_id TEXT NOT NULL REFERENCES fengshui_case_items(id),
  category TEXT NOT NULL CHECK (category IN (
    'missing_corner','water_arrangement','fire_arrangement','room_assignment',
    'door_window','plant_furnishing','wealth_romance_study','outdoor',
    'general_arrangement','health_separate','unclear'
  )),
  PRIMARY KEY (case_item_id,category)
);
CREATE INDEX fengshui_case_item_categories_lookup
  ON fengshui_case_item_categories(category,case_item_id);

CREATE TABLE fengshui_case_pattern_candidates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  condition_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review','approved','rejected')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  CHECK (enabled = 0 OR review_status = 'approved')
);
CREATE TABLE fengshui_case_pattern_examples (
  pattern_id TEXT NOT NULL REFERENCES fengshui_case_pattern_candidates(id),
  case_item_id TEXT NOT NULL REFERENCES fengshui_case_items(id),
  PRIMARY KEY (pattern_id, case_item_id)
);
