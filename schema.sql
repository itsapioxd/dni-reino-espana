
CREATE TABLE IF NOT EXISTS dnis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE NOT NULL,
  discord_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  fecha_nacimiento TEXT NOT NULL,
  fecha_expedicion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado TEXT NOT NULL DEFAULT 'ACTIVO'
);

CREATE INDEX IF NOT EXISTS idx_dnis_discord
ON dnis(discord_id);

CREATE INDEX IF NOT EXISTS idx_dnis_numero
ON dnis(numero);
