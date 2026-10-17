CREATE TABLE assistant_sessions (
 id TEXT PRIMARY KEY, meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
 title TEXT NOT NULL, folder_path TEXT, context TEXT NOT NULL DEFAULT '',
 memory TEXT NOT NULL DEFAULT '', preferences TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX assistant_session_meeting ON assistant_sessions(meeting_id);
CREATE TABLE assistant_fragments (
 session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
 id TEXT NOT NULL, text TEXT NOT NULL, start REAL NOT NULL, end REAL,
 PRIMARY KEY(session_id,id)
);
CREATE TABLE assistant_messages (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
 role TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]',
 scope TEXT NOT NULL DEFAULT 'current', dismissed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX assistant_messages_session ON assistant_messages(session_id,created_at);
CREATE TABLE assistant_chunks (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 text TEXT NOT NULL, start REAL NOT NULL, end REAL, embedding BLOB, revision TEXT
);
CREATE INDEX assistant_chunks_meeting ON assistant_chunks(meeting_id);
CREATE VIRTUAL TABLE assistant_fts USING fts5(id UNINDEXED, text, tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER assistant_chunk_insert AFTER INSERT ON assistant_chunks BEGIN
 INSERT INTO assistant_fts(id,text) VALUES(new.id,new.text);
END;
CREATE TRIGGER assistant_chunk_delete AFTER DELETE ON assistant_chunks BEGIN
 DELETE FROM assistant_fts WHERE id=old.id;
END;
CREATE TRIGGER assistant_transcript_insert AFTER INSERT ON transcripts BEGIN
 DELETE FROM assistant_chunks WHERE meeting_id=new.meeting_id;
END;
CREATE TRIGGER assistant_transcript_update AFTER UPDATE OF transcript ON transcripts BEGIN
 DELETE FROM assistant_chunks WHERE meeting_id=new.meeting_id;
END;
CREATE TRIGGER assistant_transcript_delete AFTER DELETE ON transcripts BEGIN
 DELETE FROM assistant_chunks WHERE meeting_id=old.meeting_id;
END;
-- Explicit cleanup also covers databases opened with foreign_keys disabled by older versions.
CREATE TRIGGER assistant_meeting_delete AFTER DELETE ON meetings BEGIN
 DELETE FROM assistant_chunks WHERE meeting_id=old.id;
 DELETE FROM assistant_messages WHERE session_id IN (SELECT id FROM assistant_sessions WHERE meeting_id=old.id);
 DELETE FROM assistant_fragments WHERE session_id IN (SELECT id FROM assistant_sessions WHERE meeting_id=old.id);
 DELETE FROM assistant_sessions WHERE meeting_id=old.id;
END;

CREATE TRIGGER assistant_session_bind AFTER UPDATE OF meeting_id ON assistant_sessions WHEN new.meeting_id IS NOT NULL BEGIN
 UPDATE assistant_messages SET sources=COALESCE((SELECT json_group_array(CASE WHEN json_extract(value,'$.sessionId')=new.id AND json_extract(value,'$.meetingId') IS NULL THEN json_set(value,'$.meetingId',new.meeting_id,'$.sessionId',NULL) ELSE json(value) END) FROM json_each(assistant_messages.sources)),'[]') WHERE session_id=new.id;
END;
CREATE TRIGGER assistant_remove_deleted_references AFTER DELETE ON meetings BEGIN
 DELETE FROM assistant_messages WHERE EXISTS(SELECT 1 FROM json_each(assistant_messages.sources) WHERE json_extract(value,'$.meetingId')=old.id);
END;
CREATE TRIGGER assistant_invalidate_changed_sources AFTER UPDATE OF transcript ON transcripts BEGIN
 DELETE FROM assistant_messages WHERE EXISTS(SELECT 1 FROM json_each(assistant_messages.sources) WHERE json_extract(value,'$.meetingId')=new.meeting_id);
END;

CREATE TRIGGER assistant_invalidate_removed_sources AFTER DELETE ON transcripts BEGIN
 DELETE FROM assistant_messages WHERE EXISTS(SELECT 1 FROM json_each(assistant_messages.sources) WHERE json_extract(value,'$.meetingId')=old.meeting_id);
END;
