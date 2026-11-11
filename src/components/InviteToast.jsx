import React, { useEffect, useState } from 'react';

const GAME_NAMES = {
  pong: 'Pong Arcade',
  chess: 'Xadrez Clássico',
  damas: 'Jogo de Damas',
};

export default function InviteToast({ invite, onAccept, onDecline }) {
  const [timeLeft, setTimeLeft] = useState(20);

  useEffect(() => {
    if (!invite) return;
    setTimeLeft(20);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDecline(invite);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [invite]);

  if (!invite) return null;

  const gameTitle = GAME_NAMES[invite.gameId] || invite.gameId;

  return (
    <div className="invite-toast-container" role="alert" aria-live="assertive">
      <div className="invite-toast-card">
        <div className="invite-toast-header">
          <span className="invite-icon">⚔️</span>
          <div>
            <div className="invite-kicker">CONVITE DE PARTIDA</div>
            <div className="invite-title">
              <strong>{invite.fromUsername || 'Um jogador'}</strong> convidou você!
            </div>
          </div>
          <span className="invite-timer">{timeLeft}s</span>
        </div>

        <div className="invite-game-banner">
          Modalidade: <strong>{gameTitle}</strong>
        </div>

        <div className="invite-toast-actions">
          <button
            type="button"
            className="primary-button invite-btn-accept"
            onClick={() => onAccept(invite)}
          >
            ✓ Aceitar
          </button>
          <button
            type="button"
            className="secondary-button invite-btn-decline"
            onClick={() => onDecline(invite)}
          >
            ✕ Recusar
          </button>
        </div>
      </div>
    </div>
  );
}
