import React from 'react';
import { GAMES_CATALOG } from '../games/gamesRegistry.jsx';

export default function FriendInviteModal({ gameId, friends, onClose, onInvite }) {
  if (!gameId) return null;
  const game = GAMES_CATALOG.find(item => item.id === gameId);

  return (
    <div className="game-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="game-dialog friend-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="friend-invite-title">
        <span className="lobby-mark">CONVITE DE PARTIDA</span>
        <h2 id="friend-invite-title">Convidar um amigo</h2>
        <p>Escolha quem convidar para {game?.title || 'esta partida'}.</p>
        {friends.length ? (
          <div className="friend-invite-list">
            {friends.map(friend => (
              <div className="friend-invite-row" key={friend.id}>
                <span><i className="friend-status-dot online" />{friend.name}</span>
                <button type="button" className="primary-button" onClick={() => onInvite(friend.id, gameId)}>Convidar</button>
              </div>
            ))}
          </div>
        ) : <p className="friend-invite-empty">Você ainda não tem amigos na lista. Adicione alguém pelo avatar e tente novamente.</p>}
        <button type="button" className="secondary-button friend-invite-cancel" onClick={onClose}>Fechar</button>
      </section>
    </div>
  );
}
