import React, { useEffect, useRef, useState } from 'react';
import { HubGameSDK } from './sdk/HubSDK.js';
import { GAMES_CATALOG } from './games/gamesRegistry.jsx';
import chessArt from './assets/games/chess.webp';
import damasArt from './assets/games/damas.webp';
import dominoArt from './assets/games/domino.webp';
import buracoArt from './assets/games/buraco.webp';

const catalogArt = { chess: chessArt, damas: damasArt, domino: dominoArt, buraco: buracoArt, tranca: buracoArt };
import GoogleLoginModal from './components/GoogleLoginModal.jsx';
import InviteToast from './components/InviteToast.jsx';
import MatchmakingModal from './components/MatchmakingModal.jsx';
import ChallengeModal from './components/ChallengeModal.jsx';
import GameDetailsModal from './components/GameDetailsModal.jsx';
import FriendInviteModal from './components/FriendInviteModal.jsx';

function getStoredUser() {
  const stored = localStorage.getItem('hub-user-session');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // continua para fallback
    }
  }

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

  return { id: playerId, name: playerName };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [sdk] = useState(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}/ws`;
    return new HubGameSDK(serverUrl);
  });

  const [profile, setProfile] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [activeGame, setActiveGame] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false);
  const [unreadChats, setUnreadChats] = useState({});
  const unreadCount = Object.values(unreadChats).reduce((sum, count) => sum + count, 0);
  const [chatTarget, setChatTarget] = useState('global');
  const [openChatTargets, setOpenChatTargets] = useState(['global']);
  const chatTargetRef = useRef(chatTarget);
  const [currentRoom, setCurrentRoom] = useState(null);


  // Abas e Dados da Comunidade (SQLite)
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'chat' | 'ranking'
  const [friends, setFriends] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [friendInput, setFriendInput] = useState('');
  const conversationMessages = messages.filter(message => message.conversation === chatTarget);
  const selectedFriend = friends.find(friend => `friend:${friend.id}` === chatTarget);
  const chatTitle = chatTarget === 'global' ? 'Global do servidor' : chatTarget.startsWith('room:') ? 'Adversário da partida' : selectedFriend?.name || 'Amigo';

  // Modais e Interações
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [matchmakingGameId, setMatchmakingGameId] = useState(null);
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [inviteGameId, setInviteGameId] = useState(null);
  const [bannerAlert, setBannerAlert] = useState('');

  const profileTriggerRef = useRef(null);
  const chatBoxOverlayRef = useRef(null);
  const chatInputOverlayRef = useRef(null);
  const activeGameRef = useRef(activeGame);
  const isChatOverlayOpenRef = useRef(isChatOverlayOpen);

  useEffect(() => {
    activeGameRef.current = activeGame;
  }, [activeGame]);

  useEffect(() => {
    isChatOverlayOpenRef.current = isChatOverlayOpen;
    if (isChatOverlayOpen) {
      setUnreadChats(current => ({ ...current, [chatTarget]: 0 }));
      const timer = setTimeout(() => chatInputOverlayRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [isChatOverlayOpen, chatTarget]);

  useEffect(() => { chatTargetRef.current = chatTarget; }, [chatTarget]);
  useEffect(() => {
    if ((chatTarget.startsWith('room:') && chatTarget !== `room:${currentRoom}`) ||
        (chatTarget.startsWith('friend:') && !friends.some(friend => `friend:${friend.id}` === chatTarget))) setChatTarget('global');
  }, [currentRoom, friends, chatTarget]);

  // Conexão WebSocket e Listeners
  useEffect(() => {
    const handleChat = (event) => {
      const message = event.detail;
      const myId = sdk.player?.id || sdk.player?.playerId;
      const conversation = message.channel === 'room' ? `room:${message.roomId}` : message.channel === 'direct' ? `friend:${message.senderId === myId ? message.recipientId : message.senderId}` : 'global';
      setMessages(current => [...current.slice(-499), { ...message, conversation }]);
      if (message.senderId !== myId && (!isChatOverlayOpenRef.current || chatTargetRef.current !== conversation)) {
        setUnreadChats(current => ({ ...current, [conversation]: (current[conversation] || 0) + 1 }));
      }
    };
    const handleChatError = event => {
      showTemporaryAlert(event.detail.message);
      const error = event.detail;
      const target = error.channel === 'room' ? `room:${error.roomId}` : error.channel === 'direct' ? `friend:${error.recipientId}` : 'global';
      if (chatTargetRef.current === target) setChatMessage(current => current || error.draft || '');
    };
    const handleRoomCreated = event => setCurrentRoom(event.detail.roomId);
    const handleRoomClosed = () => setCurrentRoom(null);

    const handleRank = (event) => {
      const list = event.detail.ranks || [];
      setRanks(list);
      const updatedProfile = list.find((r) => r.id === (currentUser.id || currentUser.playerId));
      if (updatedProfile) {
        setProfile((prev) => ({ ...prev, ...updatedProfile }));
      }
    };

    const handleFriends = (event) => {
      setFriends(event.detail.friends || []);
    };

    const handleRoomJoined = (event) => {
      setCurrentRoom(event.detail.roomId);
      setMatchmakingGameId(null);
      const targetGame = event.detail?.gameId || 'chess';
      setActiveGame(targetGame);
    };

    const handleGameStart = (event) => {
      setCurrentRoom(event.detail.roomId);
      setMatchmakingGameId(null);
      if (event.detail?.gameId) {
        setActiveGame(event.detail.gameId);
      }
    };

    const handleInviteReceived = (event) => {
      setIncomingInvite(event.detail);
    };

    const handleInviteDeclined = (event) => {
      showTemporaryAlert(`${event.detail?.byUsername || 'O jogador'} recusou o desafio.`);
    };

    const handleInviteError = (event) => {
      showTemporaryAlert(event.detail?.message || 'Não foi possível convidar.');
    };

    sdk.addEventListener('CHAT_MESSAGE', handleChat);
    sdk.addEventListener('CHAT_ERROR', handleChatError);
    sdk.addEventListener('ROOM_CREATED', handleRoomCreated);
    sdk.addEventListener('ROOM_CLOSED', handleRoomClosed);
    sdk.addEventListener('PLAYER_LEFT', handleRoomClosed);
    sdk.addEventListener('RANK_UPDATED', handleRank);
    sdk.addEventListener('FRIENDS_UPDATED', handleFriends);
    sdk.addEventListener('ROOM_JOINED', handleRoomJoined);
    sdk.addEventListener('GAME_START', handleGameStart);
    sdk.addEventListener('INVITE_RECEIVED', handleInviteReceived);
    sdk.addEventListener('INVITE_DECLINED', handleInviteDeclined);
    sdk.addEventListener('INVITE_ERROR', handleInviteError);

    setMessages([]);
    setFriends([]);
    setUnreadChats({});
    setChatTarget('global');
    setCurrentRoom(null);
    sdk.connect(currentUser)
      .then(setProfile)
      .catch(() => setConnectionError('Servidor indisponível'));

    return () => {
      sdk.removeEventListener('CHAT_MESSAGE', handleChat);
    sdk.removeEventListener('CHAT_ERROR', handleChatError);
    sdk.removeEventListener('ROOM_CREATED', handleRoomCreated);
    sdk.removeEventListener('ROOM_CLOSED', handleRoomClosed);
    sdk.removeEventListener('PLAYER_LEFT', handleRoomClosed);
      sdk.removeEventListener('RANK_UPDATED', handleRank);
      sdk.removeEventListener('FRIENDS_UPDATED', handleFriends);
      sdk.removeEventListener('ROOM_JOINED', handleRoomJoined);
      sdk.removeEventListener('GAME_START', handleGameStart);
      sdk.removeEventListener('INVITE_RECEIVED', handleInviteReceived);
      sdk.removeEventListener('INVITE_DECLINED', handleInviteDeclined);
      sdk.removeEventListener('INVITE_ERROR', handleInviteError);
      sdk.disconnect();
    };
  }, [currentUser, sdk]);

  useEffect(() => {
    if (chatBoxOverlayRef.current) chatBoxOverlayRef.current.scrollTop = chatBoxOverlayRef.current.scrollHeight;
  }, [messages, isChatOverlayOpen, chatTarget]);

  // Teclas de atalho para chat in-game
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isUserPanelOpen) {
        e.preventDefault();
        setIsUserPanelOpen(false);
        setIsChatOverlayOpen(false);
        profileTriggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGame, isUserPanelOpen]);

  function showTemporaryAlert(msg) {
    setBannerAlert(msg);
    setTimeout(() => setBannerAlert(''), 4000);
  }

  function handleGoogleLogin(userData) {
    exitToHub();
    localStorage.setItem('hub-user-session', JSON.stringify(userData));
    setProfile(null);
    setCurrentUser(userData);
  }

  function playAnonymously() {
    if (currentUser.googleId) {
      exitToHub();
      localStorage.removeItem('hub-user-session');
      const guest = getStoredUser();
      setProfile(null);
      setCurrentUser(guest);
    }
    setIsUserPanelOpen(false);
    setIsChatOverlayOpen(false);
    profileTriggerRef.current?.focus();
  }

  function sendChat(event) {
    event.preventDefault();
    const message = chatMessage.trim();
    if (!message || !profile) return;
    const conversation = chatTarget === 'global' ? { channel: 'global' } : chatTarget.startsWith('room:') ? { channel: 'room', roomId: currentRoom } : { channel: 'direct', recipientId: selectedFriend?.id };
    if (sdk.sendChatMessage(message, conversation)) setChatMessage('');
    else showTemporaryAlert('Sem conexão com o servidor. Sua mensagem não foi enviada.');
  }

  function exitToHub() {
    sdk.leaveRoom();
    setCurrentRoom(null);
    if (matchmakingGameId) {
      sdk.leaveQueue(matchmakingGameId);
      setMatchmakingGameId(null);
    }
    setActiveGame(null);
    setIsChatOverlayOpen(false);
  }

  // Fila de Matchmaking
  function startMatchmaking(gameId) {
    setMatchmakingGameId(gameId);
    sdk.joinQueue(gameId);
  }

  function cancelMatchmaking() {
    if (matchmakingGameId) {
      sdk.leaveQueue(matchmakingGameId);
      setMatchmakingGameId(null);
    }
  }

  // Desafios / Convites
  function openChallenge(player) {
    if (player.id === profile?.id || player.senderId === profile?.id) return;
    setChallengeTarget({
      id: player.id || player.senderId,
      name: player.name || player.senderName,
    });
  }

  function sendChallenge(targetPlayerId, gameId) {
    sdk.sendInvite(targetPlayerId, gameId);
    showTemporaryAlert('Convite de partida enviado! Aguardando resposta...');
  }

  function inviteFriendToGame(targetPlayerId, gameId) {
    sendChallenge(targetPlayerId, gameId);
    setInviteGameId(null);
  }

  function acceptInvite(invite) {
    setIncomingInvite(null);
    sdk.acceptInvite(invite.inviteId, invite.fromPlayerId, invite.gameId);
  }

  function declineInvite(invite) {
    setIncomingInvite(null);
    sdk.declineInvite(invite.inviteId, invite.fromPlayerId);
  }

  // Gestão de Amigos
  function addFriend(e) {
    e.preventDefault();
    const target = friendInput.trim();
    if (!target) return;
    sdk.addFriend(target);
    setFriendInput('');
    showTemporaryAlert(`Solicitação para "${target}" processada.`);
  }

  function removeFriend(friendId) {
    sdk.removeFriend(friendId);
  }

  function openFriendChat(friend) {
    const target = `friend:${friend.id}`;
    setOpenChatTargets(current => current.includes(target) ? current : [...current, target]);
    setChatTarget(target);
    setChatMessage('');
    setActiveTab('chat');
    setIsChatOverlayOpen(true);
  }

  function closeFriendChat(target) {
    setOpenChatTargets(current => current.filter(item => item !== target));
    if (chatTarget === target) setChatTarget('global');
  }

  return (
    <>
      <header className={`topbar ${activeGame ? 'topbar-ingame' : ''}`}>
        <button
          className="brand"
          onClick={exitToHub}
          aria-label="Voltar para a biblioteca"
        >
          <span className="brand-mark">GH</span> GameHub
        </button>
        <div className="topbar-meta">
          <span className={`online-dot ${profile ? '' : 'offline'}`} />
          <span>{profile ? 'Servidor online (SQLite)' : connectionError || 'Conectando...'}</span>
        </div>
        <div className="topbar-actions">
          <button type="button" ref={profileTriggerRef} className="topbar-profile-button" aria-label="Abrir opções do usuário" aria-haspopup="dialog" aria-controls="user-panel" aria-expanded={isUserPanelOpen} onClick={() => { setIsUserPanelOpen(value => { const nextOpen = !value; setIsChatOverlayOpen(nextOpen && activeTab === 'chat'); return nextOpen; }); }} title="Opções do usuário">
            {(profile?.avatar_url || currentUser.avatarUrl) ? <img src={profile?.avatar_url || currentUser.avatarUrl} alt="" /> : <span aria-hidden="true">{(profile?.name || currentUser.name || 'P')[0].toUpperCase()}</span>}
          </button>
          {activeGame && (<button
              className="nav-button"
              onClick={exitToHub}
            >
              ← Biblioteca
            </button>)}
        </div>
      </header>

      {/* Banner de alerta transitório */}
      {bannerAlert && (
        <div style={{
          position: 'fixed',
          top: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1200,
          background: 'var(--green-dark)',
          color: '#ffffff',
          padding: '8px 18px',
          borderRadius: '20px',
          fontSize: '0.84rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          fontWeight: 600,
        }}>
          ℹ️ {bannerAlert}
        </div>
      )}

      <div className={activeGame ? 'app-shell ingame-mode' : 'app-shell'}>
        <main className="main-content">
          <section className={activeGame ? 'view hidden' : 'view'} aria-hidden={Boolean(activeGame)}>
            <div className="game-list">
              {GAMES_CATALOG.map((game) => (
                <button key={game.id} type="button" className="game-card" onClick={() => setSelectedGame(game)} aria-label={`Ver detalhes de ${game.title}`}>
                  <div className="game-art" aria-hidden="true"><img className="game-card-image" src={catalogArt[game.id]} alt="" /></div>
                  <span className="game-card-title">{game.title}</span>
                </button>
              ))}
            </div>
          </section>

          {GAMES_CATALOG.map((game) => {
            const GameComponent = game.component;
            const isThisGameActive = activeGame === game.id;
            return (
              <section
                key={game.id}
                className={isThisGameActive ? 'view' : 'view hidden'}
                aria-hidden={!isThisGameActive}
              >
                <GameComponent
                  sdk={sdk}
                  playerId={playerIdentifier(profile || currentUser)}
                  connected={Boolean(profile)}
                  active={isThisGameActive}
                  onExitToHub={exitToHub}
                  onFindOpponent={startMatchmaking}
                  onInviteFriend={gameId => setInviteGameId(gameId)}
                />
              </section>
            );
          })}
        </main>

        {isUserPanelOpen && (
          <div className="user-panel-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setIsUserPanelOpen(false); setIsChatOverlayOpen(false); } }}>
          <aside className="user-panel" id="user-panel" role="dialog" aria-modal="true" aria-label="Opções do usuário">
            <div className="user-panel-account">
              <div className="user-panel-identity">
                <div className="user-avatar-circle">{(profile?.avatar_url || profile?.avatarUrl || currentUser.avatarUrl) ? <img src={profile?.avatar_url || profile?.avatarUrl || currentUser.avatarUrl} alt="" /> : <span>{(profile?.name || currentUser.name || 'P')[0].toUpperCase()}</span>}</div>
                <div><strong>{profile?.name || currentUser.name}</strong><span>{currentUser.googleId ? 'Conta conectada' : 'Jogando como visitante'}</span></div>
              </div>
              <div className="user-panel-account-actions">
                {!currentUser.googleId ? (
                  <button type="button" className="primary-button" onClick={() => { setIsUserPanelOpen(false); setIsChatOverlayOpen(false); setIsGoogleModalOpen(true); }}>Entrar na conta</button>
                ) : <>
                  <button type="button" className="secondary-button" onClick={() => { setIsUserPanelOpen(false); setIsChatOverlayOpen(false); setIsGoogleModalOpen(true); }}>Trocar conta</button>
                  <button type="button" className="user-logout-button" onClick={playAnonymously}>Sair da conta</button>
                </>}
              </div>
            </div>
            <div className="sidebar-tabs user-panel-tabs">
              <button
                type="button"
                className={`sidebar-tab-btn ${activeTab === 'friends' ? 'active' : ''}`}
                onClick={() => { setActiveTab('friends'); setIsChatOverlayOpen(false); }}
              >
                👥 Amigos ({friends.length})
              </button>
              <button type="button" className={`sidebar-tab-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => { setActiveTab('chat'); setChatTarget('global'); setIsChatOverlayOpen(true); }}>
                💬 Chat {unreadCount > 0 && <span className="chat-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
              <button
                type="button"
                className={`sidebar-tab-btn ${activeTab === 'ranking' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('ranking');
                  setIsChatOverlayOpen(false);
                  sdk.getRankings();
                }}
              >
                🏆 Ranking
              </button>
            </div>

            {/* CONTEÚDO DA ABA AMIGOS */}
            {activeTab === 'friends' && (
              <div className="friends-panel">
                <form className="friends-add-form" onSubmit={addFriend}>
                  <input
                    placeholder="ID ou nome do amigo..."
                    value={friendInput}
                    onChange={(e) => setFriendInput(e.target.value)}
                  />
                  <button className="subtle-button" disabled={!friendInput.trim()}>
                    + Adicionar
                  </button>
                </form>

                <div className="friends-list">
                  {friends.length === 0 && (
                    <p className="chat-empty" style={{ textAlign: 'center', marginTop: '20px' }}>
                      Nenhum amigo ainda. Desafie alguém no chat para adicioná-lo!
                    </p>
                  )}
                  {friends.map((f) => (
                    <div key={f.id} className="friend-item-card">
                      <div className="friend-info-left">
                        <span className="friend-status-dot online" />
                        <div className="friend-name-col">
                          <strong>{f.name}</strong>
                          <span>{f.wins}V / {f.losses}D</span>
                        </div>
                      </div>
                      <div className="friend-action-group">
                        <button type="button" className="friend-challenge-btn" onClick={() => openFriendChat(f)}>💬 Conversar</button>
                        <button
                          type="button"
                          className="friend-challenge-btn"
                          onClick={() => openChallenge(f)}
                        >
                          ⚔️ Convidar
                        </button>
                        <button
                          type="button"
                          className="friend-remove-btn"
                          onClick={() => removeFriend(f.id)}
                          title="Remover amigo"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <section className="user-panel-chat">
                <div className="conversation-tabs" role="tablist" aria-label="Conversas abertas">
                  <button type="button" role="tab" aria-selected={chatTarget === 'global'} className={`conversation-tab ${chatTarget === 'global' ? 'active' : ''}`} onClick={() => { setChatTarget('global'); setChatMessage(''); }}>
                    <span>🌐 Global</span>{unreadChats.global > 0 && <i>{unreadChats.global}</i>}
                  </button>
                  {openChatTargets.filter(target => target !== 'global').map(target => {
                    const friend = friends.find(item => `friend:${item.id}` === target);
                    if (!friend) return null;
                    return <div role="presentation" className={`conversation-tab-wrap ${chatTarget === target ? 'active' : ''}`} key={target}>
                      <button type="button" role="tab" aria-selected={chatTarget === target} className="conversation-tab" onClick={() => { setChatTarget(target); setChatMessage(''); }}>
                        <span>{friend.name}</span>{unreadChats[target] > 0 && <i>{unreadChats[target]}</i>}
                      </button>
                      <button type="button" className="conversation-tab-close" aria-label={`Fechar conversa com ${friend.name}`} onClick={() => closeFriendChat(target)}>×</button>
                    </div>;
                  })}
                </div>
                <div className="chat-box" ref={chatBoxOverlayRef} aria-live="polite">
                  {conversationMessages.length === 0 && <p className="chat-empty">A conversa começa aqui.</p>}
                  {conversationMessages.map((message, index) => (
                    <div className="chat-msg" key={`${message.timestamp}-${message.senderId}-${index}`}>
                      <div className="chat-msg-header"><strong>{message.senderName}</strong>
                        {chatTarget === 'global' && message.senderId !== (profile?.id || currentUser.id) && <button type="button" className="chat-challenge-btn" onClick={() => openChallenge(message)}>⚔️ Desafiar</button>}
                      </div><span>{message.message}</span>
                    </div>
                  ))}
                </div>
                <form className="chat-form" onSubmit={sendChat}>
                  <input ref={chatInputOverlayRef} value={chatMessage} maxLength={2000} onChange={event => setChatMessage(event.target.value)} placeholder="Escreva uma mensagem..." aria-label={`Mensagem para ${chatTitle}`} disabled={!profile} />
                  <button type="submit" className="chat-send-button" disabled={!profile || !chatMessage.trim()} aria-label="Enviar mensagem" title="Enviar mensagem">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.7 2.3 14.2 21c-.3.8-1.4.8-1.7 0l-3.2-7.3-7.3-3.2c-.8-.3-.8-1.4 0-1.7l18.7-7.5c.7-.3 1.3.3 1 1ZM9.8 12.2l3.2 1.4 5.1-9.1-9.1 5.1.8 2.6Z" /></svg>
                  </button>
                </form>
              </section>
            )}

            {/* CONTEÚDO DA ABA RANKING (SQLite Leaderboard) */}
            {activeTab === 'ranking' && (
              <div className="ranking-panel">
                <table className="ranking-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Jogador</th>
                      <th>V</th>
                      <th>D</th>
                      <th>Win%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranks.map((r, index) => {
                      const isMe = r.id === (profile?.id || currentUser.id);
                      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}º`;
                      return (
                        <tr key={r.id} className={isMe ? 'current-user-row' : ''}>
                          <td className="rank-pos">{medal}</td>
                          <td>
                            <div className="rank-user-cell">
                              <span>{r.name}</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--green)', fontWeight: 700 }}>{r.wins}</td>
                          <td style={{ color: 'var(--muted)' }}>{r.losses}</td>
                          <td>{r.win_rate ?? 0}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}


          </aside>
          </div>
        )}
      </div>

      <GameDetailsModal
        game={selectedGame}
        artwork={catalogArt[selectedGame?.id]}
        onClose={() => setSelectedGame(null)}
        onPlay={() => { setActiveGame(selectedGame.id); setSelectedGame(null); }}
      />

      {/* Modal de Login com Google */}
      <GoogleLoginModal
        isOpen={isGoogleModalOpen}
        onClose={() => { setIsGoogleModalOpen(false); profileTriggerRef.current?.focus(); }}
        onLogin={handleGoogleLogin}
      />

      {/* Toast Flutuante de Convite de Partida Recebido */}
      <InviteToast
        invite={incomingInvite}
        onAccept={acceptInvite}
        onDecline={declineInvite}
      />

      {/* Modal de Fila de Busca de Partida (Matchmaking) */}
      {matchmakingGameId && (
        <MatchmakingModal
          gameId={matchmakingGameId}
          onCancel={cancelMatchmaking}
        />
      )}

      {/* Modal para Escolher Jogo ao Desafiar um Jogador */}
      <ChallengeModal
        targetPlayer={challengeTarget}
        onClose={() => setChallengeTarget(null)}
        onSendChallenge={sendChallenge}
      />
      <FriendInviteModal
        gameId={inviteGameId}
        friends={friends}
        onClose={() => setInviteGameId(null)}
        onInvite={inviteFriendToGame}
      />
    </>
  );
}

function playerIdentifier(u) {
  return u?.id || u?.playerId || '';
}
