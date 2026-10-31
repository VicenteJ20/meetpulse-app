-- Summary passages (ids ending in ":s<n>") are indexed next to transcript passages (":w<n>").
-- Whenever a meeting's summary changes or disappears, its summary passages are dropped and rebuilt on the next search.
CREATE TRIGGER assistant_summary_insert AFTER INSERT ON summary_processes BEGIN
 DELETE FROM assistant_chunks WHERE meeting_id=new.meeting_id AND id GLOB '*:s[0-9]*';
END;
CREATE TRIGGER assistant_summary_update AFTER UPDATE OF result, status ON summary_processes BEGIN
 DELETE FROM assistant_chunks WHERE meeting_id=new.meeting_id AND id GLOB '*:s[0-9]*';
END;
CREATE TRIGGER assistant_summary_delete AFTER DELETE ON summary_processes BEGIN
 DELETE FROM assistant_chunks WHERE meeting_id=old.meeting_id AND id GLOB '*:s[0-9]*';
END;
