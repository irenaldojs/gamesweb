export class HubGameSDK extends EventTarget {
  constructor(serverUrl) {
    super();
    this.serverUrl = serverUrl;
    this.ws = null;
    this.player = null;
    this.role = null;
    this.roomId = null;
    this.inQueue = false;
  }

  connect(userData) {
    this.disconnect();
    const playerId = typeof userData === 'string' ? userData : userData.id || userData.playerId;
    const username = typeof userData === 'string' ? arguments[1] : userData.name || userData.username;
    this.player = { playerId, username, ...userData };

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.serverUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (userData.googleId) {
          this._send('AUTH_GOOGLE', userData);
        } else {
          this._send('AUTH', { playerId, username });
        }
      };

      ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          if (type === 'ROOM_CREATED') {
            this.roomId = payload.roomId;
            this.role = 'host';
            this.inQueue = false;
          }
          if (type === 'ROOM_JOINED') {
            this.roomId = payload.roomId;
            this.role = 'guest';
            this.inQueue = false;
          }
          if (type === 'QUEUE_STATUS') {
            this.inQueue = payload.inQueue;
          }
          if (type === 'AUTH_OK') {
            this.player = payload.profile;
            resolve(payload.profile);
          }
          this.dispatchEvent(new CustomEvent(type, { detail: payload }));
        } catch (error) {
          reject(error);
        }
      };

      ws.onerror = () => reject(new Error('Não foi possível conectar ao servidor.'));
    });
  }

  loginWithGoogle(googleData) {
    this._send('AUTH_GOOGLE', googleData);
  }

  disconnect() {
    this.leaveRoom();
    if (this.inQueue) this.leaveQueue();
    if (!this.ws) return;
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }

  // Fila de Matchmaking
  joinQueue(gameId) {
    this.inQueue = true;
    this._send('QUEUE_JOIN', { gameId });
  }

  leaveQueue(gameId) {
    this.inQueue = false;
    this._send('QUEUE_LEAVE', { gameId });
  }

  // Convite Direto (Chat / Amigos)
  sendInvite(toPlayerId, gameId) {
    this._send('INVITE_SEND', { toPlayerId, gameId });
  }

  acceptInvite(inviteId, fromPlayerId, gameId) {
    this._send('INVITE_ACCEPT', { inviteId, fromPlayerId, gameId });
  }

  declineInvite(inviteId, fromPlayerId) {
    this._send('INVITE_DECLINE', { inviteId, fromPlayerId });
  }

  // Amigos
  getFriends() {
    this._send('FRIENDS_GET', {});
  }

  addFriend(friendId) {
    this._send('FRIEND_ADD', { friendId });
  }

  removeFriend(friendId) {
    this._send('FRIEND_REMOVE', { friendId });
  }

  // Ranking
  getRankings() {
    this._send('RANK_GET', {});
  }

  // Salas & Chat
  createRoom(gameId) {
    this._send('ROOM_CREATE', { gameId });
  }

  joinRoom(roomId) {
    this._send('ROOM_JOIN', { roomId });
  }

  leaveRoom() {
    if (this.roomId) {
      this._send('ROOM_LEAVE', { roomId: this.roomId });
      this.roomId = null;
      this.role = null;
    }
  }

  sendChatMessage(message) {
    this._send('CHAT_GLOBAL_MSG', { message });
  }

  sendGameInput(data) {
    if (this.role !== 'solo') this._send('GAME_SYNC_INPUT', data);
  }

  reportMatchEnd(winnerId) {
    if (this.role !== 'solo') this._send('GAME_MATCH_END', { winnerId });
  }

  _send(type, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}
