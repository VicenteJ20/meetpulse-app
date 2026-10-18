-- Quién habló: 'me' (micrófono) o 'team' (audio del sistema). NULL en reuniones anteriores.
ALTER TABLE transcripts ADD COLUMN speaker TEXT;
