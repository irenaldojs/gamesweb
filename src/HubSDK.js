export class HubGameSDK extends EventTarget {
  constructor(serverUrl) {
    super();
    this.serverUrl = serverUrl;
    this.ws = null;
    this.player = null;
    this.role = null;
    this.roomId = null;
  }

  connect(playerId, username) {
    this.disconnect();
    this.player = { playerId, username };

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.serverUrl);
      this.ws = ws;

      ws.onopen = () => this._send('AUTH', { playerId, username });
      ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          if (type === 'ROOM_CREATED') {
            this.roomId = payload.roomId;
            this.role = 'host';
          }
          if (type === 'ROOM_JOINED') {
            this.roomId = payload.roomId;
            this.role = 'guest';
          }
          if (type === 'AUTH_OK') resolve(payload.profile);
          this.dispatchEvent(new CustomEvent(type, { detail: payload }));
        } catch (error) {
          reject(error);
        }
      };
      ws.onerror = () => reject(new Error('Não foi possível conectar ao servidor.'));
    });
  }

  disconnect() {
    if (!this.ws) return;
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }

  createRoom(gameId) {
    this._send('ROOM_CREATE', { gameId });
  }

  joinRoom(roomId) {
    this._send('ROOM_JOIN', { roomId });
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