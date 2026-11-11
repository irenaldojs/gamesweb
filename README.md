# GameHub

Plataforma web de jogos multiplayer em tempo real. Os jogos rodam no navegador via Canvas, e a comunicação entre jogadores é feita por WebSocket através de um servidor central leve em Bun.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE (React + Vite)                │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ App.jsx  │  │  HubGameSDK  │  │  Games (Canvas)   │  │
│  │ (Shell)  │──│  (WebSocket) │──│  └── PongGame.jsx  │  │
│  └──────────┘  └──────┬───────┘  └───────────────────┘  │
│                       │ ws://                            │
└───────────────────────┼─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│              SERVIDOR (Bun WebSocket)                    │
│                       │                                  │
│  ┌────────────┐  ┌────┴─────┐  ┌──────────────────────┐ │
│  │ Auth       │  │ Room     │  │ Chat Global + Rank   │ │
│  │ Connection │──│ Manager  │──│ State Relay           │ │
│  └────────────┘  └──────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Princípios:**
- A física e renderização rodam **100% no cliente**
- O servidor faz apenas **relay de estado** entre jogadores, autenticação e ranking
- Cada jogo é um componente React isolado que recebe o `sdk` como prop
- O `HubGameSDK` abstrai toda a comunicação WebSocket

---

## Estrutura do Projeto

```text
gamesweb/
├── index.html                         # Entry point HTML (Vite)
├── package.json                       # Dependências e scripts
├── vite.config.js                     # Config Vite + proxy WS
├── README.md                          # Este arquivo
│
├── server/
│   └── index.ts                       # Servidor WebSocket (Bun)
│                                      #   - Autenticação de players
│                                      #   - Gerenciamento de salas
│                                      #   - Chat global (broadcast)
│                                      #   - Relay de inputs entre jogadores
│                                      #   - Ranking (vitórias/derrotas)
│
└── src/
    ├── main.jsx                       # Bootstrap React → <App />
    ├── App.jsx                        # App shell: topbar, sidebar,
    │                                  #   perfil, chat global (sidebar no hub,
    │                                  #   overlay flutuante in-game),
    │                                  #   biblioteca de jogos e roteamento
    ├── styles.css                     # Estilos globais do hub
    │
    ├── sdk/
    │   └── HubSDK.js                  # SDK cliente (classe HubGameSDK)
    │                                  #   - Conexão/desconexão WS
    │                                  #   - Criar/entrar em salas
    │                                  #   - Enviar inputs de jogo
    │                                  #   - Chat e ranking
    │                                  #   - EventTarget para eventos do servidor
    │
    ├── games/
    │   ├── gamesRegistry.jsx          # Catálogo centralizado de jogos
    │   ├── pong/
    │   │   ├── PongGame.jsx           # Jogo Pong completo (solo vs IA / multi)
    │   │   └── styles.css
    │   ├── chess/
    │   │   ├── ChessGame.jsx          # Jogo Xadrez Clássico completo (solo vs IA / multi)
    │   │   └── styles.css
    │   ├── damas/
    │   │   ├── DamasGame.jsx          # Jogo de Damas completo (solo vs IA / multi)
    │   │   └── styles.css
    │   └── domino/
    │       ├── DominoGame.jsx         # Dominó (2–4 jogadores: IA, mesa local ou online)
    │       ├── DominoTile.jsx         # Peça visual + arte do card
    │       ├── dominoEngine.js        # Regras, IA dos bots e layout da mesa (lógica pura)
    │       └── styles.css
```

---

## Como Executar

### Pré-requisitos
- [Bun](https://bun.sh/) v1.x+

### Instalação
```bash
bun install
```

### Iniciar o servidor WebSocket
```bash
bun run server
# → ws://localhost:3000
```

### Iniciar o frontend (em outro terminal)
```bash
bun run dev
# → http://localhost:5173
```

O Vite faz proxy automático de `/ws` para `ws://127.0.0.1:3000`.

### Variáveis de ambiente
| Variável | Descrição | Padrão |
|---|---|---|
| `VITE_WS_URL` | URL do servidor WebSocket | `ws://<host>/ws` (via proxy) |

---

## Protocolo WebSocket

Todas as mensagens seguem o formato `{ type: string, payload: object }`.

### Cliente → Servidor

| Tipo | Payload | Descrição |
|---|---|---|
| `AUTH` | `{ playerId, username }` | Autenticação do jogador |
| `CHAT_GLOBAL_MSG` | `{ message }` | Mensagem no chat global |
| `ROOM_LEAVE` | `{ roomId }` | Sair voluntariamente da sala |
| `GAME_SYNC_INPUT` | `{ ...data }` | Input de jogo (relay para oponente) |
| `GAME_MATCH_END` | `{ winnerId }` | Reportar fim de partida |

### Servidor → Cliente

| Tipo | Payload | Descrição |
|---|---|---|
| `AUTH_OK` | `{ profile }` | Autenticação confirmada com perfil |
| `CHAT_GLOBAL_MSG` | `{ senderId, senderName, message, timestamp }` | Mensagem de chat (broadcast) |
| `ROOM_CREATED` | `{ roomId, role }` | Sala criada, você é `host` |
| `ROOM_JOINED` | `{ roomId, role }` | Entrou na sala como `guest` |
| `GAME_START` | `{ roomId, gameId }` | Partida iniciada (ambos recebem) |
| `GAME_SYNC_RELAY` | `{ senderId, data }` | Input do oponente repassado |
| `PLAYER_LEFT` | `{ roomId, playerId, username, reason }` | Oponente kitou/desconectou da sala |
| `RANK_UPDATED` | `{ ranks[] }` | Ranking atualizado após partida |

---

## HubGameSDK — API do Cliente

O `HubGameSDK` (em `src/sdk/HubSDK.js`) é a abstração que todo jogo usa para se comunicar com o servidor. Ele estende `EventTarget`.

### Propriedades
| Propriedade | Tipo | Descrição |
|---|---|---|
| `role` | `'host' \| 'guest' \| 'solo' \| null` | Papel do jogador na partida atual |
| `roomId` | `string \| null` | ID da sala atual |

### Métodos
| Método | Descrição |
|---|---|
| `connect(playerId, username)` | Conecta ao servidor e autentica. Retorna `Promise<Profile>` |
| `disconnect()` | Fecha a conexão WebSocket |
| `leaveRoom()` | Notifica o servidor e sai da sala atual |
| `sendChatMessage(message)` | Envia mensagem no chat global |
| `sendGameInput(data)` | Envia input de jogo para o oponente (ignorado no modo `solo`) |
| `reportMatchEnd(winnerId)` | Reporta o vencedor da partida (ignorado no modo `solo`) |

### Eventos (via `addEventListener`)
| Evento | `event.detail` | Quando |
|---|---|---|
| `AUTH_OK` | `{ profile }` | Autenticação confirmada |
| `ROOM_CREATED` | `{ roomId, role }` | Sala criada com sucesso |
| `ROOM_JOINED` | `{ roomId, role }` | Entrou em uma sala |
| `GAME_START` | `{ roomId, gameId }` | Partida pronta para iniciar |
| `GAME_SYNC_RELAY` | `{ senderId, data }` | Input do oponente recebido |
| `PLAYER_LEFT` | `{ roomId, playerId, username, reason }` | Oponente desconectou ou saiu da sala |
| `CHAT_GLOBAL_MSG` | `{ senderId, senderName, message, timestamp }` | Mensagem no chat |
| `RANK_UPDATED` | `{ ranks[] }` | Ranking atualizado |

---

## Como Adicionar um Novo Jogo

### 1. Criar o componente

Crie uma pasta em `src/games/<nome-do-jogo>/` com o componente principal:

```jsx
// src/games/snake/SnakeGame.jsx
export default function SnakeGame({ sdk, playerId, connected, active }) {
  // sdk      → instância do HubGameSDK (para comunicação)
  // playerId → ID único do jogador local
  // connected → boolean, se está conectado ao servidor
  // active   → boolean, se este jogo está visível na tela
  
  // Sua lógica de jogo aqui...
}
```

### 2. Props obrigatórias que o hub passa para todo jogo

| Prop | Tipo | Descrição |
|---|---|---|
| `sdk` | `HubGameSDK` | Instância do SDK para comunicação |
| `playerId` | `string` | ID do jogador local |
| `connected` | `boolean` | Se está conectado ao servidor |
| `active` | `boolean` | Se o jogo está sendo exibido |
| `onExitToHub` | `() => void` | Callback para retornar à tela inicial do Hub |

### 3. Responsabilidades do jogo

- **Renderização**: O jogo controla seu próprio Canvas/DOM
- **Física**: Calculada no cliente (host-authoritative no multiplayer)
- **Sincronização**: Usar `sdk.sendGameInput(data)` para enviar estado ao oponente
- **Receber estado**: Escutar `GAME_SYNC_RELAY` via `sdk.addEventListener`
- **Fim de partida**: Chamar `sdk.reportMatchEnd(winnerId)` quando acabar
- **Modo solo**: Setar `sdk.role = 'solo'` e implementar IA local

### 4. Registrar no App.jsx

```jsx
import SnakeGame from './games/snake/SnakeGame.jsx';

// Na biblioteca de jogos, adicionar um card
// Na seção de views, adicionar a section do jogo
```

### 5. Ciclo de vida típico de um jogo multiplayer

```
1. Jogadores entram na fila     → sdk.joinQueue('pong')
2. Ou enviam/aceitam um convite → sdk.sendInvite(...) / sdk.acceptInvite(...)
3. Servidor define host e guest → eventos ROOM_CREATED / ROOM_JOINED
4. Servidor notifica ambos      → evento GAME_START
5. Durante o jogo:
   - Host calcula física e envia → sdk.sendGameInput({ ballX, ballY, ... })
   - Guest recebe e renderiza   → evento GAME_SYNC_RELAY
   - Ambos enviam posição       → sdk.sendGameInput({ y: paddleY })
6. Fim de partida               → sdk.reportMatchEnd(winnerId)
7. Servidor atualiza ranking    → evento RANK_UPDATED
```

### 6. Componentes Padrão de Diálogo do Hub

Importe de `../../components/GameDialog.jsx` para reutilizar as janelas modais padronizadas do Hub:
- `<GameDialog>`: Modal genérico com layout, cabeçalho e ações (usado em lobbies, contagens e avisos).
- `<OpponentLeftDialog>`: Exibido quando o oponente desconecta ou kita da partida (evento `PLAYER_LEFT`), atribuindo vitória por W.O. e oferecendo opções de recomeçar ou voltar ao Hub.
- `<GameEndDialog>`: Diálogo de encerramento com botões padronizados de "Jogar Novamente" e "Voltar ao Hub".

---

## Scripts Disponíveis

| Script | Comando | Descrição |
|---|---|---|
| `dev` | `bun run dev` | Inicia o Vite dev server |
| `start` | `bun run start` | Alias para dev |
| `build` | `bun run build` | Build de produção |
| `preview` | `bun run preview` | Preview do build |
| `server` | `bun run server` | Inicia o servidor WebSocket |

---

## Stack

- **Runtime**: [Bun](https://bun.sh/) — servidor WebSocket nativo + package manager
- **Frontend**: React 19 + Vite 6
- **Comunicação**: WebSocket nativo (sem libs)
- **Renderização de jogos**: HTML5 Canvas 2D
- **Estilos**: CSS puro (Space Grotesk + DM Mono)
