-- Chat and coach use their own model. Existing installs start from the analysis model, then the two can diverge.
ALTER TABLE settings ADD COLUMN chatProvider TEXT;
ALTER TABLE settings ADD COLUMN chatModel TEXT;
UPDATE settings
SET chatProvider = provider,
    chatModel = model
WHERE chatProvider IS NULL OR chatProvider = '';
