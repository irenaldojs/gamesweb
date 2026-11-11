import { serve, ServerWebSocket } from "bun";

interface PlayerProfile {
  id: string;
  name: string;
  wins: number;
  losses: number;
}

interface ClientData {
  playerId?: string;
  username?: string;
  roomId?: string;
}

interface Room {
  id: string;
  gameId: string;
  host: ServerWebSocket<ClientData>;
  guest?: ServerWebSocket<ClientData>;
  status: "waiting" | "playing";
}

const clients = new Map<string, ServerWebSocket<ClientData>>();
const ranks = new Map<string, PlayerProfile>();
const rooms = new Map<string, Room>();

function getOrCreateRank(playerId: string, name: string): PlayerProfile {
  if (!ranks.has(playerId)) {
    ranks.set(playerId, { id: playerId, name, wins: 0, losses: 0 });
  }
  return ranks.get(playerId)!;
}

const server = serve<ClientData>({
  port: 3000,
  fetch(req, server) {
    const success = server.upgrade(req, { data: {} });
    if (success) return undefined;
    return new Response("Servidor Hub WebSockets Ativo", { status: 200 });
  },
  websocket: {
    open(ws) {
      console.log("[WS] Conexão estabelecida");
    },
    message(ws, rawMessage) {
      try {
        const msg = JSON.parse(rawMessage.toString());
        const { type, payload } = msg;

        switch (type) {
          case "AUTH": {
            ws.data.playerId = payload.playerId;
            ws.data.username = payload.username;
            clients.set(payload.playerId, ws);
            const profile = getOrCreateRank(payload.playerId, payload.username);
            ws.send(JSON.stringify({ type: "AUTH_OK", payload: { profile } }));
            break;
          }
          case "CHAT_GLOBAL_MSG": {
            if (!ws.data.playerId) return;
            const broadcastMsg = JSON.stringify({
              type: "CHAT_GLOBAL_MSG",
              payload: {
                senderId: ws.data.playerId,
                senderName: ws.data.username,
                message: payload.message,
                timestamp: Date.now()
              }
            });
            for (const client of clients.values()) {
              client.send(broadcastMsg);
            }
            break;
          }
          case "ROOM_CREATE": {
            const roomId = `RM-${Math.floor(1000 + Math.random() * 9000)}`;
            rooms.set(roomId, { id: roomId, gameId: payload.gameId, host: ws, status: "waiting" });
            ws.data.roomId = roomId;
            ws.send(JSON.stringify({ type: "ROOM_CREATED", payload: { roomId, role: "host" } }));
            break;
          }
          case "ROOM_JOIN": {
            const room = rooms.get(payload.roomId);
            if (room && room.status === "waiting") {
              room.guest = ws;
              room.status = "playing";
              ws.data.roomId = room.id;
              ws.send(JSON.stringify({ type: "ROOM_JOINED", payload: { roomId: room.id, role: "guest" } }));

              const startPayload = JSON.stringify({ type: "GAME_START", payload: { roomId: room.id, gameId: room.gameId } });
              room.host.send(startPayload);
              room.guest.send(startPayload);
            }
            break;
          }
          case "GAME_SYNC_INPUT": {
            const room = rooms.get(ws.data.roomId || "");
            if (room) {
              const target = ws === room.host ? room.guest : room.host;
              if (target) {
                target.send(JSON.stringify({ type: "GAME_SYNC_RELAY", payload: { senderId: ws.data.playerId, data: payload } }));
              }
            }
            break;
          }
          case "GAME_MATCH_END": {
            const room = rooms.get(ws.data.roomId || "");
            if (room) {
              const winnerProfile = ranks.get(payload.winnerId);
              if (winnerProfile) winnerProfile.wins++;

              const rankUpdateMsg = JSON.stringify({ type: "RANK_UPDATED", payload: { ranks: Array.from(ranks.values()) } });
              room.host.send(rankUpdateMsg);
              if (room.guest) room.guest.send(rankUpdateMsg);
              rooms.delete(room.id);
            }
            break;
          }
        }
      } catch (err) {
        console.error("Erro no processamento da mensagem:", err);
      }
    },
    close(ws) {
      if (ws.data.playerId) clients.delete(ws.data.playerId);
      if (ws.data.roomId) rooms.delete(ws.data.roomId);
    }
  }
});

console.log(`🚀 Servidor rodando em ws://localhost:${server.port}`);
