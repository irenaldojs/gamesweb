import React, { useEffect } from 'react';

export default function GameDetailsModal({ game, onClose, onPlay }) {
  useEffect(() => {
    if (!game) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [game, onClose]);

  if (!game) return null;

  return (
    <div className="game-details-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="game-details-modal" role="dialog" aria-modal="true" aria-labelledby="game-details-title">
        <button type="button" className="game-details-close" onClick={onClose} aria-label="Fechar detalhes">×</button>
        <div className="game-details-art" aria-hidden="true">{game.renderArt()}</div>
        <div className="game-details-content">
          <span className="badge">{game.category}</span>
          <h2 id="game-details-title">{game.title}</h2>
          <p className="game-details-description">{game.description}</p>
          <div className="game-details-facts">
            <div><span>Jogadores</span><strong>{game.players}</strong></div>
            <div><span>Sobre o jogo</span><strong>{game.meta}</strong></div>
          </div>
          <button type="button" className="primary-button game-details-play" onClick={onPlay}>Jogar <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </div>
  );
}
