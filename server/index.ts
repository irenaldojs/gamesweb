import { resolve, sep } from "node:path";
import { routeChat } from "./chatRouter.mjs";
import { serve, ServerWebSocket } from "bun";
import {
  getOrCreateUser,
  recordMatchResult,
  getLeaderboard,
  getUserFriends,
  addFriendship,
  removeFriendship,
} from "./db";

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

interface QueueEntry {
  playerId: string;
  username: string;
  ws: ServerWebSocket<ClientData>;
}

const clients = new Map<string, ServerWebSocket<ClientData>>();
const rooms = new Map<string, Room>();

// Filas de Matchmaking por jogo ('pong', 'chess', 'damas')
const matchmakingQueues = new Map<string, QueueEntry[]>();

function getQueue(gameId: string): QueueEntry[] {
  if (!matchmakingQueues.has(gameId)) {
    matchmakingQueues.set(gameId, []);
  }
  return matchmakingQueues.get(gameId)!;
}

function removeFromAllQueues(playerId: string) {
  for (const [gameId, queue] of matchmakingQueues.entries()) {
    const filtered = queue.filter(entry => entry.playerId !== playerId);
    matchmakingQueues.set(gameId, filtered);
  }
}

const server = serve<ClientData>({
  port: 3000,
  fetch(req, server) {
    const success = server.upgrade(req, { data: {} });
    if (success) return undefined;
    return new Response("Servidor GameHub Ativo (Bun + SQLite)", { status: 200 });
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
          // Autenticação Padrão / Visitante
          case "AUTH": {
            const user = getOrCreateUser({
              id: payload.playerId,
              name: payload.username || `Player_${payload.playerId?.slice(-4)}`,
            });
            ws.data.playerId = user.id;
            ws.data.username = user.name;
            clients.set(user.id, ws);

            ws.send(JSON.stringify({ type: "AUTH_OK", payload: { profile: user } }));
            ws.send(JSON.stringify({ type: "RANK_UPDATED", payload: { ranks: getLeaderboard() } }));
            ws.send(JSON.stringify({ type: "FRIENDS_UPDATED", payload: { friends: getUserFriends(user.id) } }));
            break;
          }

          // Autenticação Facilitada com Google
          case "AUTH_GOOGLE": {
            const user = getOrCreateUser({
              googleId: payload.googleId,
              email: payload.email,
              name: payload.name,
              avatarUrl: payload.avatarUrl,
            });
            ws.data.playerId = user.id;
            ws.data.username = user.name;
            clients.set(user.id, ws);

            ws.send(JSON.stringify({ type: "AUTH_OK", payload: { profile: user } }));
            ws.send(JSON.stringify({ type: "RANK_UPDATED", payload: { ranks: getLeaderboard() } }));
            ws.send(JSON.stringify({ type: "FRIENDS_UPDATED", payload: { friends: getUserFriends(user.id) } }));
            break;
          }

          // Obter Ranking
          case "RANK_GET": {
            ws.send(JSON.stringify({ type: "RANK_UPDATED", payload: { ranks: getLeaderboard() } }));
            break;
          }

          // Obter Amigos
          case "FRIENDS_GET": {
            if (!ws.data.playerId) return;
            ws.send(JSON.stringify({ type: "FRIENDS_UPDATED", payload: { friends: getUserFriends(ws.data.playerId) } }));
            break;
          }

          // Adicionar Amigo
          case "FRIEND_ADD": {
            if (!ws.data.playerId || !payload.friendId) return;
            const success = addFriendship(ws.data.playerId, payload.friendId);
            if (success) {
              ws.send(JSON.stringify({ type: "FRIENDS_UPDATED", payload: { friends: getUserFriends(ws.data.playerId) } }));
              const friendWs = clients.get(payload.friendId);
              if (friendWs && friendWs.readyState === 1) {
                friendWs.send(JSON.stringify({ type: "FRIENDS_UPDATED", payload: { friends: getUserFriends(payload.friendId) } }));
              }
            }
            break;
          }

          // Remover Amigo
          case "FRIEND_REMOVE": {
            if (!ws.data.playerId || !payload.friendId) return;
            removeFriendship(ws.data.playerId, payload.friendId);
            ws.send(JSON.stringify({ type: "FRIENDS_UPDATED", payload: { friends: getUserFriends(ws.data.playerId) } }));
            const friendWs = clients.get(payload.friendId);
            if (friendWs && friendWs.readyState === 1) {
              friendWs.send(JSON.stringify({ type: "FRIENDS_UPDATED", payload: { friends: getUserFriends(payload.friendId) } }));
            }
            break;
          }

          case "CHAT_GLOBAL_MSG":
          case "CHAT_SEND": {
            routeChat({ ws, payload: type === 'CHAT_GLOBAL_MSG' ? { ...payload, channel: 'global' } : payload,
              clients, rooms, friendIds: ws.data.playerId ? getUserFriends(ws.data.playerId).map((friend: any) => friend.id) : [] });
            break;
          }

          // Fila de Busca de Jogos (Matchmaking)
          case "QUEUE_JOIN": {
            if (!ws.data.playerId) return;
            const gameId = payload.gameId;
            removeFromAllQueues(ws.data.playerId);

            const queue = getQueue(gameId);
            queue.push({
              playerId: ws.data.playerId,
              username: ws.data.username || "Jogador",
              ws,
            });

            ws.send(JSON.stringify({
              type: "QUEUE_STATUS",
              payload: { inQueue: true, gameId, position: queue.length }
            }));

            // Se atingiu 2 jogadores, cria a partida instantaneamente!
            if (queue.length >= 2) {
              const p1 = queue.shift()!;
              const p2 = queue.shift()!;

              const roomId = `RM-${Math.floor(1000 + Math.random() * 9000)}`;
              rooms.set(roomId, {
                id: roomId,
                gameId,
                host: p1.ws,
                guest: p2.ws,
                status: "playing",
              });

              p1.ws.data.roomId = roomId;
              p2.ws.data.roomId = roomId;

              p1.ws.send(JSON.stringify({
                type: "ROOM_CREATED",
                payload: { roomId, role: "host", gameId }
              }));
              p2.ws.send(JSON.stringify({
                type: "ROOM_JOINED",
                payload: { roomId, role: "guest", gameId }
              }));

              const startPayload = JSON.stringify({
                type: "GAME_START",
                payload: { roomId, gameId }
              });
              p1.ws.send(startPayload);
              p2.ws.send(startPayload);
            }
            break;
          }

          case "QUEUE_LEAVE": {
            if (ws.data.playerId) {
              removeFromAllQueues(ws.data.playerId);
              ws.send(JSON.stringify({
                type: "QUEUE_STATUS",
                payload: { inQueue: false }
              }));
            }
            break;
          }

          // Convite de Partida Direto (Chat ou Lista de Amigos)
          case "INVITE_SEND": {
            if (!ws.data.playerId || !payload.toPlayerId) return;
            const targetWs = clients.get(payload.toPlayerId);
            if (targetWs && targetWs.readyState === 1) {
              const inviteId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
              targetWs.send(JSON.stringify({
                type: "INVITE_RECEIVED",
                payload: {
                  inviteId,
                  fromPlayerId: ws.data.playerId,
                  fromUsername: ws.data.username,
                  gameId: payload.gameId,
                }
              }));
              ws.send(JSON.stringify({
                type: "INVITE_SENT_OK",
                payload: { toPlayerId: payload.toPlayerId, inviteId }
              }));
            } else {
              ws.send(JSON.stringify({
                type: "INVITE_ERROR",
                payload: { message: "O jogador não está online no momento." }
              }));
            }
            break;
          }

          case "INVITE_ACCEPT": {
            if (!ws.data.playerId || !payload.fromPlayerId) return;
            const hostWs = clients.get(payload.fromPlayerId);
            if (hostWs && hostWs.readyState === 1) {
              const roomId = `RM-${Math.floor(1000 + Math.random() * 9000)}`;
              rooms.set(roomId, {
                id: roomId,
                gameId: payload.gameId,
                host: hostWs,
                guest: ws,
                status: "playing",
              });

              hostWs.data.roomId = roomId;
              ws.data.roomId = roomId;

              hostWs.send(JSON.stringify({
                type: "ROOM_CREATED",
                payload: { roomId, role: "host", gameId: payload.gameId }
              }));
              ws.send(JSON.stringify({
                type: "ROOM_JOINED",
                payload: { roomId, role: "guest", gameId: payload.gameId }
              }));

              const startPayload = JSON.stringify({
                type: "GAME_START",
                payload: { roomId, gameId: payload.gameId }
              });
              hostWs.send(startPayload);
              ws.send(startPayload);
            }
            break;
          }

          case "INVITE_DECLINE": {
            if (payload.fromPlayerId) {
              const hostWs = clients.get(payload.fromPlayerId);
              if (hostWs && hostWs.readyState === 1) {
                hostWs.send(JSON.stringify({
                  type: "INVITE_DECLINED",
                  payload: {
                    byUsername: ws.data.username || "O jogador",
                  }
                }));
              }
            }
            break;
          }

          // Saída de sala
          case "ROOM_LEAVE": {
            const roomId = ws.data.roomId;
            if (roomId && rooms.has(roomId)) {
              const room = rooms.get(roomId)!;
              const target = ws === room.host ? room.guest : room.host;
              if (target && target.readyState === 1) {
                target.send(JSON.stringify({
                  type: "PLAYER_LEFT",
                  payload: {
                    roomId: room.id,
                    playerId: ws.data.playerId,
                    username: ws.data.username,
                    reason: "left"
                  }
                }));
              }
              rooms.delete(roomId);
            }
            ws.data.roomId = undefined;
            break;
          }

          // Sincronização in-game
          case "GAME_SYNC_INPUT": {
            const room = rooms.get(ws.data.roomId || "");
            if (room) {
              const target = ws === room.host ? room.guest : room.host;
              if (target && target.readyState === 1) {
                target.send(JSON.stringify({ type: "GAME_SYNC_RELAY", payload: { senderId: ws.data.playerId, data: payload } }));
              }
            }
            break;
          }

          // Fim de Partida e Atualização do SQLite
          case "GAME_MATCH_END": {
            const room = rooms.get(ws.data.roomId || "");
            if (room) {
              const winnerId = payload.winnerId;
              const loserWs = ws.data.playerId === winnerId
                ? (ws === room.host ? room.guest : room.host)
                : ws;
              const loserId = loserWs?.data?.playerId;

              // Salva no banco de dados SQLite
              recordMatchResult(room.gameId, winnerId, loserId);

              // Dispara ranking atualizado para todos
              const updatedRanks = getLeaderboard();
              const rankUpdateMsg = JSON.stringify({ type: "RANK_UPDATED", payload: { ranks: updatedRanks } });
              
              for (const client of clients.values()) {
                if (client.readyState === 1) {
                  client.send(rankUpdateMsg);
                }
              }

              for (const member of [room.host, room.guest]) {
                member?.send(JSON.stringify({ type: 'ROOM_CLOSED', payload: { roomId: room.id } }));
              }
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
      if (ws.data.playerId) {
        removeFromAllQueues(ws.data.playerId);
      }

      const roomId = ws.data.roomId;
      if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId)!;
        const target = ws === room.host ? room.guest : room.host;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({
            type: "PLAYER_LEFT",
            payload: {
              roomId: room.id,
              playerId: ws.data.playerId,
              username: ws.data.username,
              reason: "disconnected"
            }
          }));
        }
        rooms.delete(roomId);
      }
      if (ws.data.playerId) clients.delete(ws.data.playerId);
    }
  }
});

console.log(`🚀 Servidor GameHub com SQLite rodando em ws://localhost:${server.port}`);
