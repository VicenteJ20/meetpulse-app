-- El chat pasó de buscador JSON a asistente conversacional; los mensajes anteriores no se conservan.
DELETE FROM assistant_messages WHERE kind = 'chat';
