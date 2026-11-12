import React from 'react';
import { SUITS, isRedSuit, rankLabel } from './trancaEngine.js';

const FACE_GLYPH = { 11: '♞', 12: '♛', 13: '♚' };

/**
 * Carta de baralho. O tamanho vem da variável CSS --cw (largura) do elemento pai.
 * Aceita cartas ocultas ({hidden:true}) ou faceDown para exibir o verso.
 */
export function Card({ card, faceDown = false, wild = false, className = '', style, innerRef, ...rest }) {
  if (faceDown || !card || card.hidden) {
    return (
      <span ref={innerRef} className={`bc bc-back ${className}`} style={style} {...rest}>
        <span className="bc-back-mark" />
      </span>
    );
  }

  if (card.joker) {
    return (
      <span
        ref={innerRef}
        className={`bc bc-joker ${wild ? 'is-wild' : ''} ${className}`}
        style={style}
        data-joker="1"
        aria-label="Coringa"
        {...rest}
      >
        <span className="bc-corner"><b>★</b><i>JK</i></span>
        <span className="bc-center">★</span>
        <span className="bc-corner br"><b>★</b><i>JK</i></span>
      </span>
    );
  }

  const red = isRedSuit(card.suit);
  const label = rankLabel(card.rank);
  const suit = SUITS[card.suit];
  const face = card.rank >= 11;
  return (
    <span
      ref={innerRef}
      className={`bc ${red ? 'red' : 'black'} ${face ? 'bc-face' : ''} ${wild ? 'is-wild' : ''} ${className}`}
      style={style}
      data-rank={card.rank}
      data-suit={card.suit}
      aria-label={`${label} de ${suit}`}
      {...rest}
    >
      <span className="bc-corner"><b>{label}</b><i>{suit}</i></span>
      <span className="bc-center">{face ? <>{FACE_GLYPH[card.rank]}<em>{suit}</em></> : suit}</span>
      <span className="bc-corner br"><b>{label}</b><i>{suit}</i></span>
    </span>
  );
}

/** Arte do card no catálogo do Hub */
export function BuracoArt() {
  const cards = [
    { id: 'a1', rank: 1, suit: 0 },
    { id: 'a2', rank: 12, suit: 1 },
    { id: 'a3', rank: 0, suit: -1, joker: true },
    { id: 'a4', rank: 7, suit: 2 },
    { id: 'a5', rank: 13, suit: 3 },
  ];
  return (
    <div className="bur-art" aria-hidden="true">
      {cards.map((c, i) => (
        <Card key={c.id} card={c} className="bur-art-card" style={{ '--i': i }} />
      ))}
    </div>
  );
}