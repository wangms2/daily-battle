-- Players counted anonymously (DESIGN.md §18a): a random id per device, and
-- the days it played and what. Days are the player's local date, YYYY-MM-DD.

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  -- The earliest day it played: its first ping, or an earlier day in its save.
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL,
  -- The account it's signed into, if any, so one person on two devices counts once.
  account_key TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX players_account ON players (account_key);

CREATE TABLE player_days (
  id TEXT NOT NULL,
  day TEXT NOT NULL,
  -- daily-<format>, lessons-<format>, trainer-<format>, or versus.
  activity TEXT NOT NULL,
  PRIMARY KEY (id, day, activity)
);
CREATE INDEX player_days_day ON player_days (day);
