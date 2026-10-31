-- API key for Vercel AI Gateway. Stored locally, same as the other provider keys.
ALTER TABLE settings ADD COLUMN vercelGatewayApiKey TEXT;
