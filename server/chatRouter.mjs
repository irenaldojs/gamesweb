// Keep routing independent from transport so private delivery can be verified in isolation.
export function routeChat({ ws, payload, clients, rooms, friendIds }) {
  const fail = message => ws.send(JSON.stringify({ type: 'CHAT_ERROR', payload: { message, draft: typeof payload.message === 'string' ? payload.message : '', channel: payload.channel, roomId: payload.roomId, recipientId: payload.recipientId } }));
  if (!ws.data.playerId) return fail('Conecte-se para conversar.');
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message || message.length > 2000) return fail('Envie uma mensagem de até 2000 caracteres.');
  const channel = payload.channel ?? 'global';
  let recipients, roomId, recipientId;
  if (channel === 'global') recipients = [...clients.values()];
  else if (channel === 'room') {
    const room = rooms.get(ws.data.roomId);
    if (!room || payload.roomId !== room.id || ![room.host, room.guest].includes(ws)) return fail('Você não está nesta partida.');
    const opponent = ws === room.host ? room.guest : room.host;
    if (!opponent || opponent.readyState !== 1) return fail('O adversário não está conectado.');
    roomId = room.id;
    recipients = [ws, opponent];
  } else if (channel === 'direct') {
    recipientId = payload.recipientId;
    if (!friendIds.includes(recipientId)) return fail('Selecione um amigo para conversar.');
    const friend = clients.get(recipientId);
    if (!friend || friend.readyState !== 1) return fail('Seu amigo está offline. Tente novamente quando ele conectar.');
    recipients = [ws, friend];
  } else return fail('Conversa inválida.');
  const envelope = JSON.stringify({ type: 'CHAT_MESSAGE', payload: {
    id: crypto.randomUUID(), channel, roomId, recipientId,
    senderId: ws.data.playerId, senderName: ws.data.username, message, timestamp: Date.now(),
  } });
  for (const client of new Set(recipients)) if (client.readyState === 1) client.send(envelope);
}
