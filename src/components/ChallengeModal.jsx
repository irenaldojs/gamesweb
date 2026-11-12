import React, { useState } from 'react';

const GAMES = [
  { id: 'chess', title: 'Xadrez Clássico', icon: '♔', desc: 'Batalha tática no tabuleiro 8x8' },
  { id: 'damas', title: 'Jogo de Damas', icon: '👑', desc: 'Saltos e capturas em cadeia' },
];

export default function ChallengeModal({ targetPlayer, onClose, onSendChallenge }) {
  const [selectedGame, setSelectedGame] = useState('chess');

  if (!targetPlayer) return null;

  return (
    <div className="game-modal-backdrop" onClick={onClose}>
      <div className="game-dialog challenge-dialog" onClick={(e) => e.stopPropagation()}>
        <span className="lobby-mark">CONVITE DIRETO</span>
        <h2>Desafiar Jogador</h2>
        <p>
          Convide <strong>{targetPlayer.name || targetPlayer.username}</strong> para uma partida em tempo real.
        </p>

        <div className="challenge-game-options">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`challenge-game-card ${selectedGame === g.id ? 'active' : ''}`}
              onClick={() => setSelectedGame(g.id)}
            >
              <span className="challenge-game-icon">{g.icon}</span>
              <div className="challenge-game-info">
                <strong>{g.title}</strong>
                <span>{g.desc}</span>
              </div>
              <span className="challenge-radio">
                {selectedGame === g.id ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>

        <div className="lobby-actions" style={{ marginTop: '20px' }}>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onSendChallenge(targetPlayer.id || targetPlayer.playerId, selectedGame);
              onClose();
            }}
          >
            Enviar Desafio
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
