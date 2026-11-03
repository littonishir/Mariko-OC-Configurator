CREATE TABLE IF NOT EXISTS device_samples (
    id INTEGER PRIMARY KEY,
    cpu_speedo INTEGER NOT NULL CHECK (cpu_speedo BETWEEN 1200 AND 2000),
    gpu_speedo INTEGER NOT NULL CHECK (gpu_speedo BETWEEN 1200 AND 2000),
    soc_speedo INTEGER NOT NULL CHECK (soc_speedo BETWEEN 1200 AND 2000),
    ram_id TEXT NOT NULL CHECK (length(ram_id) BETWEEN 1 AND 32),
    model TEXT NOT NULL CHECK (model IN ('regular', 'lite')),
    last_mode TEXT NOT NULL CHECK (last_mode IN ('handheld', 'plugged')),
    last_goal TEXT NOT NULL CHECK (last_goal IN ('balanced', 'performance')),
    last_app_version TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    submission_count INTEGER NOT NULL DEFAULT 1 CHECK (submission_count >= 1),
    UNIQUE (cpu_speedo, gpu_speedo, soc_speedo, ram_id, model)
);
CREATE INDEX IF NOT EXISTS device_samples_last_seen ON device_samples(last_seen_at);
CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expires ON admin_sessions(expires_at);
