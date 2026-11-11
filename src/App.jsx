import React, { useEffect, useRef, useState } from 'react';
import { HubGameSDK } from './HubSDK.js';
import PongGame from './PongGame.jsx';

function getPlayer() {
  let playerId = localStorage.getItem('hub-player-id');
  if (!playerId) {
    playerId = `usr_${crypto.randomUUID()}`;
    localStorage.setItem('hub-player-id', playerId);
  }

  let playerName = localStorage.getItem('hub-player-name');
  if (!playerName) {
    playerName = `Player_${playerId.slice(-4)}`;
    localStorage.setItem('hub-player-name', playerName);
  }

  return { playerId, playerName };
}

export default function App() {
  const [player] = useState(getPlayer);
  const [sdk] = useState(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}/ws`;
    return new HubGameSDK(serverUrl);
  });
  const [profile, setProfile] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [activeGame, setActiveGame] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const chatBoxRef = useRef(null);

  useEffect(() => {
    const handleChat = (event) => {
      setMessages((current) => [...current.slice(-99), event.detail]);
    };
    const handleRank = (event) => {
      const updatedProfile = event.detail.ranks.find((rank) => rank.id === player.playerId);
      if (updatedProfile) setProfile(updatedProfile);
    };
    const handleRoomJoined = () => setActiveGame('pong');

    sdk.addEventListener('CHAT_GLOBAL_MSG', handleChat);
    sdk.addEventListener('RANK_UPDATED', handleRank);
    sdk.addEventListener('ROOM_JOINED', handleRoomJoined);
    sdk.connect(player.playerId, player.playerName)
      .then(setProfile)
      .catch(() => setConnectionError('Servidor indisponível'));

    return () => {
      sdk.removeEventListener('CHAT_GLOBAL_MSG', handleChat);
      sdk.removeEventListener('RANK_UPDATED', handleRank);
      sdk.removeEventListener('ROOM_JOINED', handleRoomJoined);
      sdk.disconnect();
    };
  }, [player, sdk]);

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  function sendChat(event) {
    event.preventDefault();
    const message = chatMessage.trim();
    if (!message || !profile) return;
    sdk.sendChatMessage(message);
    setChatMessage('');
  }

  function joinRoom(event) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code || !profile) return;
    setActiveGame('pong');
    sdk.joinRoom(code);
  }

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => setActiveGame(null)} aria-label="Voltar para a biblioteca">
          <span className="brand-mark">GH</span> GameHub
        </button>
        <div className="topbar-meta">
          <span className={`online-dot ${profile ? '' : 'offline'}`} />
          <span>{profile ? 'Servidor online' : connectionError || 'Conectando...'}</span>
        </div>
        {activeGame && (
          <button className="nav-button" onClick={() => setActiveGame(null)}>← Biblioteca</button>
        )}
      </header>

      <div className="app-shell">
        <main className="main-content">
          <section className={activeGame ? 'view hidden' : 'view'} aria-hidden={Boolean(activeGame)}>
            <div className="section-kicker">Biblioteca de jogos / 01</div>
                       <div className="game-list">
              <button className="game-card" onClick={() => setActiveGame('pong')}>
                <span className="game-art" aria-hidden="true">
                  <span className="game-art-label">GameHub Original / 001</span>
                  <span className="court">
                    <span className="court-paddle left" />
                    <span className="court-paddle right" />
                    <span className="court-ball" />
                  </span>
                </span>
                <span className="game-info">
                  <span className="game-overline"><span className="badge">Arcade</span><span>1–2 jogadores</span></span>
                  <span className="game-title">Pong</span>
                  <span className="game-description">Reflexos rápidos. Disputa direta. Uma mesa clássica, pronta para jogar.</span>
                  <span className="game-footer">
                    <span className="game-meta">Partidas de 5 pontos</span>
                    <span className="play-button">Jogar agora <span aria-hidden="true">→</span></span>
                  </span>
                </span>
              </button>
            </div>
          </section>

          <section className={activeGame === 'pong' ? 'view' : 'view hidden'} aria-hidden={activeGame !== 'pong'}>
            <PongGame sdk={sdk} playerId={player.playerId} connected={Boolean(profile)} active={activeGame === 'pong'} />
          </section>
        </main>

        <aside className="sidebar">
          <section className="profile-panel">
            <div className="panel-heading">Seu perfil</div>
            <div className="user-info">{profile?.name || 'Conectando...'}</div>
            <div className="rank-info">Vitórias: {profile?.wins ?? 0} <span>·</span> Derrotas: {profile?.losses ?? 0}</div>
          </section>

          <form className="join-panel" onSubmit={joinRoom}>
            <label className="panel-heading" htmlFor="room-code-input">Entrar em uma sala</label>
            <input
              id="room-code-input"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder="Código da sala"
              disabled={!profile}
            />
            <button className="subtle-button" disabled={!profile || !roomCode.trim()}>Entrar na partida</button>
          </form>

          <div className="chat-heading"><span>Chat global</span><span className="chat-live">AO VIVO</span></div>
          <div className="chat-box" ref={chatBoxRef} aria-live="polite">
            {messages.length === 0 && <p className="chat-empty">A conversa começa aqui.</p>}
            {messages.map((message, index) => (
              <div className="chat-msg" key={`${message.timestamp}-${message.senderId}-${index}`}>
                <strong>{message.senderName}</strong><span>{message.message}</span>
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input
              value={chatMessage}
              onChange={(event) => setChatMessage(event.target.value)}
              placeholder="Escreva uma mensagem..."
              aria-label="Mensagem no chat global"
              disabled={!profile}
            />
            <button disabled={!profile || !chatMessage.trim()}>Enviar</button>
          </form>
        </aside>
      </div>
    </>
  );
}