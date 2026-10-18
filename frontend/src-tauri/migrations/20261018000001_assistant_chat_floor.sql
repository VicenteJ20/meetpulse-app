-- "Nuevo chat": los mensajes de chat con rowid <= chat_floor quedan fuera de la conversación y de su contexto.
ALTER TABLE assistant_sessions ADD COLUMN chat_floor INTEGER NOT NULL DEFAULT 0;
