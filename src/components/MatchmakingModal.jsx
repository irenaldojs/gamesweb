import React, { useEffect, useState } from 'react';

const GAME_NAMES = {
  pong: 'Pong Arcade',
  chess: 'Xadrez Clássico',
  damas: 'Jogo de Damas',
};

export default function MatchmakingModal({ gameId, onCancel }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameId]);

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  const gameTitle = GAME_NAMES[gameId] || gameId;

  return (
    <div className="game-modal-backdrop">
      <div className="game-dialog matchmaking-dialog" role="dialog" aria-modal="true">
        <span className="lobby-mark">MATCHMAKING GLOBAL</span>
        <h2>Buscando Oponente...</h2>
        <p>Procurando jogadores disponíveis no servidor para <strong>{gameTitle}</strong>.</p>

        <div className="matchmaking-radar-container">
          <div className="radar-pulse ring-1" />
          <div className="radar-pulse ring-2" />
          <div className="radar-pulse ring-3" />
          <div className="radar-center-icon">🎮</div>
        </div>

        <div className="matchmaking-timer-badge">
          Tempo na fila: <strong>{minutes}:{seconds}</strong>
        </div>

        <button
          type="button"
          className="secondary-button"
          style={{ width: '100%', marginTop: '20px' }}
          onClick={onCancel}
        >
          Cancelar Busca
        </button>
      </div>
    </div>
  );
}
