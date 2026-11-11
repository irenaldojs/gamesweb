# Documentação de Inicialização e Setup do Projeto: GameHub

## Arquitetura atual

A interface atual usa React e Vite como uma SPA. O catálogo, o jogo Pong e o chat global permanecem na mesma página; a navegação entre hub e jogo é controlada pelo React, sem abrir outra aba. O servidor Bun continua responsável pelo WebSocket.

### Executar

Instale as dependências:

```bash
bun install
```

Inicie o servidor WebSocket em um terminal:

```bash
bun run server
```

Inicie a aplicação React em outro terminal:

```bash
bun run dev
```

Acesse `http://localhost:5173`. O WebSocket usa `ws://localhost:3000` por padrão. Para apontar para outro servidor, defina `VITE_WS_URL` antes de iniciar o Vite.

### Estrutura atual

```text
game-hub/
├── index.html
├── package.json
├── server.ts
├── src/
│   ├── App.jsx
│   ├── HubSDK.js
│   ├── PongGame.jsx
│   ├── main.jsx
│   └── styles.css
└── public/
```

As seções seguintes descrevem a implementação inicial em JavaScript sem framework e são mantidas somente como referência histórica. Para executar e desenvolver a versão atual, use os comandos acima.

---

## Referência histórica: implementação original

O conteúdo abaixo documenta a arquitetura inicial antes da migração para React.

---

## 1. Visão Geral da Arquitetura

O sistema é baseado em uma arquitetura de servidor central leve para sinalização e estado simples, enquanto a física e a renderização dos jogos ocorrem diretamente no cliente (navegador).

```
+-----------------------------------------------------------------------+
|                              HUB ENGINE                               |
|  +---------------------+  +--------------------+  +----------------+  |
|  | Global Chat & Social |  | Matchmaking / Inv  |  | Rank & Profile |  |
|  +---------------------+  +--------------------+  +----------------+  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |                      GAME SDK ADAPTER                           |  |
|  +-----------------------------------------------------------------+  |
|                                  |                                    |
|  +-------------------------------+---------------------------------+  |
|  |                      GAME SANDBOX (IFRAME/CANVAS)               |  |
|  |                      Exemplo: PONG (Local / Net)                 |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
                                   | (WebSocket)
                                   v
+-----------------------------------------------------------------------+
|                           HUB SERVER (Bun)                            |
|  [ Auth / Connection ] -> [ Room Manager ] -> [ State Relay & Rank ]  |
+-----------------------------------------------------------------------+
```

---

## 2. Stack Tecnológica e Dependências

Para manter o ecossistema performático, simples e sem acoplamento complexo:

* **Runtime & Package Manager**: [Bun](https://bun.sh/) (v1.x+) — Utilizado para executar o servidor WebSocket nativo e gerenciar dependências.
* **Comunicação em Tempo Real**: `WebSockets` nativos do Bun (`Bun.serve`), descartando dependências de bibliotecas de terceiros como `express` ou `ws` no backend inicial.
* **Cliente / Interface Web**: JavaScript (ES Modules), HTML5 Canvas e CSS3 puro. Permite que cada jogo seja criado de forma isolada do hub.

---

## 3. Estrutura de Diretórios Sugerida

Organize o repositório do projeto seguindo esta estrutura simples:

```text
game-hub/
├── package.json
├── server.ts                 # Backend (Bun WebSocket + Chat + Salas + Rank)
└── public/
    ├── index.html            # Interface do Hub + Canvas do Pong
    ├── HubSDK.js             # SDK cliente para comunicação com o Servidor
    └── games/                # (Opcional) Jogos futuros isolados
```

---

## 4. Passo a Passo de Implementação

### Passo 1: Inicializar o Projeto com Bun
No terminal, crie a pasta do projeto e inicialize o manifesto:

```bash
mkdir game-hub
cd game-hub
bun init -y
```

---

### Passo 2: Criar o Servidor backend (`server.ts`)
Crie o arquivo `server.ts` na raiz do projeto com o seguinte código:

```typescript
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
```

---

### Passo 3: Criar a Abstração do SDK (`public/HubSDK.js`)
Crie a pasta `public/` e dentro dela adicione o arquivo `HubSDK.js`:

```javascript
export class HubGameSDK extends EventTarget {
  constructor(serverUrl) {
    super();
    this.serverUrl = serverUrl;
    this.ws = null;
    this.player = null;
    this.role = null; // 'host' | 'guest' | 'solo'
    this.roomId = null;
  }

  connect(playerId, username) {
    return new Promise((resolve, reject) => {
      this.player = { playerId, username };
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        this._send("AUTH", { playerId, username });
      };

      this.ws.onmessage = (event) => {
        const { type, payload } = JSON.parse(event.data);
        
        if (type === "AUTH_OK") {
          resolve(payload.profile);
        }
        if (type === "ROOM_CREATED") {
          this.roomId = payload.roomId;
          this.role = "host";
        }
        if (type === "ROOM_JOINED") {
          this.roomId = payload.roomId;
          this.role = "guest";
        }

        this.dispatchEvent(new CustomEvent(type, { detail: payload }));
      };

      this.ws.onerror = (err) => reject(err);
    });
  }

  createRoom(gameId) {
    this._send("ROOM_CREATE", { gameId });
  }

  joinRoom(roomId) {
    this._send("ROOM_JOIN", { roomId });
  }

  sendChatMessage(message) {
    this._send("CHAT_GLOBAL_MSG", { message });
  }

  sendGameInput(data) {
    if (this.role === "solo") return;
    this._send("GAME_SYNC_INPUT", data);
  }

  reportMatchEnd(winnerId) {
    if (this.role === "solo") return;
    this._send("GAME_MATCH_END", { winnerId });
  }

  _send(type, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}
```

---

### Passo 4: Criar a Interface do Hub e o Jogo Pong (`public/index.html`)
Adicione o arquivo `public/index.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Hub de Jogos Web - Pong Test</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
    body { display: flex; height: 100vh; background-color: #121212; color: #fff; overflow: hidden; }
    
    #sidebar { width: 300px; background: #1e1e1e; border-right: 1px solid #333; display: flex; flex-direction: column; }
    #main-content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }

    .panel { padding: 15px; border-bottom: 1px solid #333; }
    #chat-box { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .chat-msg { background: #2a2a2a; padding: 8px 12px; border-radius: 4px; font-size: 0.9rem; }
    
    input, button { padding: 8px 12px; margin-top: 5px; border-radius: 4px; border: none; }
    input { background: #2a2a2a; color: #fff; width: 100%; }
    button { background: #007acc; color: white; cursor: pointer; font-weight: bold; width: 100%; }
    button:hover { background: #005999; }

    canvas { background: #000; border: 2px solid #fff; display: none; }
    #lobby-menu { display: flex; flex-direction: column; gap: 10px; width: 300px; text-align: center; }
  </style>
</head>
<body>

  <div id="sidebar">
    <div class="panel">
      <h3>Perfil & Status</h3>
      <div id="user-info">Desconectado</div>
      <div id="rank-info" style="margin-top: 5px; font-size: 0.85rem; color: #aaa;">V: 0 | D: 0</div>
    </div>

    <div class="panel">
      <h3>Entrar em Sala</h3>
      <input type="text" id="room-code-input" placeholder="Código da Sala (RM-XXXX)">
      <button id="btn-join-room">Entrar</button>
    </div>

    <div id="chat-box"></div>

    <div class="panel">
      <input type="text" id="chat-input" placeholder="Mensagem no Chat...">
      <button id="btn-send-chat">Enviar</button>
    </div>
  </div>

  <div id="main-content">
    <div id="lobby-menu">
      <h2>PONG MULTIPLAYER</h2>
      <button id="btn-play-solo">Jogar Solo (vs IA)</button>
      <button id="btn-create-multi">Criar Sala Multijogador</button>
      <div id="room-status" style="color: #ffca28; font-size: 0.9rem;"></div>
    </div>

    <canvas id="pongCanvas" width="800" height="400"></canvas>
  </div>

  <script type="module">
    import { HubGameSDK } from './HubSDK.js';

    const sdk = new HubGameSDK('ws://localhost:3000');
    
    const myId = 'usr_' + Math.floor(Math.random() * 1000);
    const myName = 'Player_' + myId.split('_')[1];

    const canvas = document.getElementById('pongCanvas');
    const ctx = canvas.getContext('2d');
    const lobbyMenu = document.getElementById('lobby-menu');
    const roomStatus = document.getElementById('room-status');

    const PADDLE_HEIGHT = 80, PADDLE_WIDTH = 10;
    let playerY = 160, opponentY = 160;
    let ballX = 400, ballY = 200, ballDX = 4, ballDY = 4;
    let playerScore = 0, opponentScore = 0;
    let gameLoopId = null;

    sdk.connect(myId, myName).then(profile => {
      document.getElementById('user-info').innerText = `${profile.name} (${profile.id})`;
      updateRankDisplay(profile.wins, profile.losses);
    });

    function updateRankDisplay(w, l) {
      document.getElementById('rank-info').innerText = `Vitórias: ${w} | Derrotas: ${l}`;
    }

    document.getElementById('btn-send-chat').onclick = () => {
      const input = document.getElementById('chat-input');
      if (input.value.trim()) {
        sdk.sendChatMessage(input.value.trim());
        input.value = '';
      }
    };

    document.getElementById('btn-create-multi').onclick = () => {
      sdk.createRoom('pong');
    };

    document.getElementById('btn-join-room').onclick = () => {
      const code = document.getElementById('room-code-input').value.trim();
      if (code) sdk.joinRoom(code);
    };

    document.getElementById('btn-play-solo').onclick = () => {
      sdk.role = 'solo';
      startPong();
    };

    sdk.addEventListener('CHAT_GLOBAL_MSG', (e) => {
      const { senderName, message } = e.detail;
      const box = document.getElementById('chat-box');
      box.innerHTML += `<div class="chat-msg"><strong>${senderName}:</strong> ${message}</div>`;
      box.scrollTop = box.scrollHeight;
    });

    sdk.addEventListener('ROOM_CREATED', (e) => {
      roomStatus.innerText = `Sala criada! Código: ${e.detail.roomId}. Aguardando oponente...`;
    });

    sdk.addEventListener('GAME_START', () => {
      roomStatus.innerText = "Jogador conectado! Iniciando...";
      setTimeout(() => startPong(), 1000);
    });

    sdk.addEventListener('GAME_SYNC_RELAY', (e) => {
      const data = e.detail.data;
      if (data.y !== undefined) opponentY = data.y;
      if (sdk.role === 'guest' && data.ballX !== undefined) {
        ballX = data.ballX;
        ballY = data.ballY;
        playerScore = data.opponentScore;
        opponentScore = data.playerScore;
      }
    });

    sdk.addEventListener('RANK_UPDATED', (e) => {
      const myRank = e.detail.ranks.find(r => r.id === myId);
      if (myRank) updateRankDisplay(myRank.wins, myRank.losses);
    });

    window.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      playerY = e.clientY - rect.top - PADDLE_HEIGHT / 2;
      
      if (sdk.role !== 'solo') {
        sdk.sendGameInput({ y: playerY });
      }
    });

    function startPong() {
      lobbyMenu.style.display = 'none';
      canvas.style.display = 'block';
      if (gameLoopId) clearInterval(gameLoopId);
      gameLoopId = setInterval(updatePong, 1000 / 60);
    }

    function updatePong() {
      if (sdk.role === 'host' || sdk.role === 'solo') {
        ballX += ballDX;
        ballY += ballDY;

        if (ballY <= 0 || ballY >= canvas.height) ballDY *= -1;

        if (ballX <= 20 && ballY >= playerY && ballY <= playerY + PADDLE_HEIGHT) {
          ballDX *= -1;
        }

        if (ballX >= canvas.width - 20 && ballY >= opponentY && ballY <= opponentY + PADDLE_HEIGHT) {
          ballDX *= -1;
        }

        if (ballX <= 0) {
          opponentScore++;
          resetBall();
        } else if (ballX >= canvas.width) {
          playerScore++;
          resetBall();
        }

        if (sdk.role === 'solo') {
          opponentY += (ballY - (opponentY + PADDLE_HEIGHT / 2)) * 0.1;
        }

        if (sdk.role === 'host') {
          sdk.sendGameInput({ ballX, ballY, playerScore, opponentScore });
        }
      }

      if (playerScore >= 5 || opponentScore >= 5) {
        clearInterval(gameLoopId);
        const winnerId = playerScore >= 5 ? myId : 'opponent';
        if (sdk.role !== 'solo') {
          sdk.reportMatchEnd(winnerId);
        }
        alert(playerScore >= 5 ? "Você Venceu!" : "Você Perdeu!");
        location.reload();
      }

      renderPong();
    }

    function resetBall() {
      ballX = canvas.width / 2;
      ballY = canvas.height / 2;
      ballDX *= -1;
    }

    function renderPong() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";

      ctx.fillRect(10, playerY, PADDLE_WIDTH, PADDLE_HEIGHT);
      ctx.fillRect(canvas.width - 20, opponentY, PADDLE_WIDTH, PADDLE_HEIGHT);
      ctx.fillRect(ballX, ballY, 8, 8);

      ctx.font = "20px monospace";
      ctx.fillText(`${playerScore} | ${opponentScore}`, canvas.width / 2 - 25, 30);
    }
  </script>
</body>
</html>
```

---

## 5. Como Executar a Aplicação

1. **Iniciar o Servidor WebSocket**:
   ```bash
   bun --hot server.ts
   ```
2. **Servir o Frontend**:
   Você pode subir os arquivos estáticos da pasta `public` utilizando o utilitário nativo de serviços do Bun ou qualquer outro servidor estático:
   ```bash
   bun x serve public
   ```
3. **Testar**:
   Abra `http://localhost:3000` em duas janelas/navegadores diferentes para testar a comunicação em tempo real, o chat e o modo multiplayer do Pong.