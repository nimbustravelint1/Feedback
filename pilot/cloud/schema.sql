CREATE TABLE pilot_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  group_code TEXT NOT NULL,
  city TEXT NOT NULL,
  city_key TEXT NOT NULL,
  guide TEXT NOT NULL,
  guide_key TEXT NOT NULL,
  UNIQUE (group_code, city_key, guide_key)
);
--> statement-breakpoint
CREATE TABLE pilot_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL REFERENCES pilot_segments(token),
  submission_id TEXT NOT NULL,
  language TEXT NOT NULL,
  ratings_json TEXT NOT NULL,
  comment TEXT NOT NULL,
  UNIQUE (token, submission_id)
);
