-- Gemini transcription credentials are independent from summary-provider credentials.
ALTER TABLE transcript_settings ADD COLUMN geminiApiKey TEXT;
