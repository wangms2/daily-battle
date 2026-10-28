-- Stats for the admin page (DESIGN.md §18a): versus games, their players and
-- battles, and accounts with their progress. Times are Unix milliseconds.

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  format TEXT NOT NULL,
  pool_mode TEXT NOT NULL,
  lives INTEGER NOT NULL,
  timer TEXT NOT NULL,
  rival TEXT NOT NULL,
  players INTEGER NOT NULL,
  rounds INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  -- Null while playing, or if everyone left before the end.
  ended_at INTEGER,
  -- Names of the players placed first, joined with ", ".
  winners TEXT
);
CREATE INDEX games_started ON games (started_at);

CREATE TABLE game_players (
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  team_size INTEGER NOT NULL,
  place INTEGER,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  -- From the start of the build to locking a team; null if the timer filled it.
  build_ms INTEGER,
  auto_team INTEGER NOT NULL,
  left_early INTEGER NOT NULL,
  PRIMARY KEY (game_id, name)
);

CREATE TABLE battles (
  game_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  match TEXT NOT NULL,
  p1 TEXT NOT NULL,
  p2 TEXT NOT NULL,
  -- A name, or null for a tie.
  winner TEXT,
  reason TEXT NOT NULL,
  turns INTEGER NOT NULL,
  -- From the battle's start; null if it ended in the swap (a forfeit).
  duration_ms INTEGER,
  ended_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, match)
);

CREATE TABLE accounts (
  -- The name as matched (lowercase); `name` as shown.
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Null for accounts made before stats were kept.
  created_at INTEGER,
  last_seen_at INTEGER NOT NULL,
  sign_ins INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX accounts_seen ON accounts (last_seen_at);

-- Each account's progress in each game, read from its save when it syncs.
CREATE TABLE account_games (
  key TEXT NOT NULL,
  format TEXT NOT NULL,
  days_played INTEGER NOT NULL,
  -- The player's local date, YYYY-MM-DD.
  last_day TEXT,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  clears INTEGER NOT NULL,
  first_try_wins INTEGER NOT NULL,
  -- In the difficulty they play.
  streak INTEGER NOT NULL,
  best_streak INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  coach INTEGER NOT NULL,
  lessons INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, format)
);
