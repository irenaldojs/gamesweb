import React, { useLayoutEffect, useRef } from 'react';
import './presentation.css';

// The destination square supplies its size, so movement remains accurate at every breakpoint.
export function MovingPiece({ lastMove, row, col, revision, capture, promotionFrom, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!lastMove || lastMove.to[0] !== row || lastMove.to[1] !== col ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const element = ref.current;
    const square = element.parentElement.getBoundingClientRect();
    const previousZIndex = element.parentElement.style.zIndex;
    element.parentElement.style.zIndex = '6';
    const animation = element.animate([
      { transform: `translate(${(lastMove.from[1] - col) * square.width}px, ${(lastMove.from[0] - row) * square.height}px) scale(1)` },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 520, easing: 'cubic-bezier(.25,.1,.25,1)' });
    animation.onfinish = () => { element.parentElement.style.zIndex = previousZIndex; };
    return () => { animation.cancel(); element.parentElement.style.zIndex = previousZIndex; };
  }, [lastMove, row, col, revision]);
  const landed = lastMove?.to[0] === row && lastMove?.to[1] === col;
  return <span ref={ref} className="board-moving-piece">
    {landed && promotionFrom ? <span key={revision} className="board-promotion-swap"><span className="board-promotion-before">{promotionFrom}</span><span className="board-promotion-after">{children}</span><span className="board-promotion-halo" aria-hidden="true">✦</span></span> : children}
  </span>;
}

const silhouettes = {
  P: <><circle cx="40" cy="19" r="9"/><path d="M33 30h14l-2 10 7 15H28l7-15z"/></>,
  R: <><path d="M23 13h9v9h5v-9h7v9h5v-9h9v19l-9 6 3 17H28l3-17-8-6z"/><path d="M29 30h22"/></>,
  N: <><path d="m26 54 6-13 13-9-12 1-8 6-7-8 13-15 2-8 10 7c17 3 19 21 14 39z"/><path d="m32 24 5-2M43 16l-2 9"/></>,
  B: <><path d="M40 9c-4 7-15 12-15 23 0 7 6 10 11 11l-9 12h26l-9-12c5-1 11-4 11-11 0-11-11-16-15-23z"/><path d="m43 20-8 13"/></>,
  Q: <><path d="m23 25 8 28h18l8-28-12 10-5-15-5 15z"/><circle cx="21" cy="21" r="4"/><circle cx="40" cy="15" r="4"/><circle cx="59" cy="21" r="4"/><path d="M30 44h20"/></>,
  K: <><path d="M40 7v17M33 14h14"/><path d="M28 53 25 37c-8-14 9-18 15-9 6-9 23-5 15 9l-3 16z"/><path d="M29 43h22"/></>,
};
export function ChessPiece({ piece }) {
  return <svg className={`board-chess-piece ${piece[0] === 'w' ? 'ivory' : 'obsidian'}`} viewBox="0 0 80 80" aria-hidden="true">
    <ellipse className="piece-shadow" cx="40" cy="70" rx="27" ry="5"/>
    <g className="piece-body" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
      {silhouettes[piece[1]]}
      <path d="M28 54h24l3 7H25zM23 62h34l4 8H19z"/>
      <path className="piece-highlight" d="M26 65h27"/>
    </g>
  </svg>;
}

export function BoardSeat({ color, turn, role, phase }) {
  const mine = color === (role === 'guest' ? 'b' : 'w');
  const playing = phase === 'playing';
  return <div className={`board-seat ${playing && turn === color ? 'is-active' : ''}`}>
    <span className={`board-seat-avatar ${color === 'w' ? 'ivory' : 'obsidian'}`}>{color === 'w' ? '♔' : '♚'}</span>
    <span><strong>{mine ? 'Você' : role === 'solo' ? 'Adversário · IA' : 'Adversário'}</strong><small>{color === 'w' ? 'Peças brancas' : 'Peças pretas'}</small></span>
    <span className="board-seat-status">{playing ? turn === color ? (role === 'solo' && !mine ? 'Pensando…' : 'Na vez') : 'Aguardando' : 'Mesa pronta'}<i /></span>
  </div>;
}

export function BoardFooter({ message, moves }) {
  return <div className="board-table-footer" role="status"><span>{message}</span><span>{moves} {moves === 1 ? 'lance' : 'lances'}</span></div>;
}

// These effects stay on the target square while the moving piece approaches it.
export function SquareEffects({ lastMove, row, col, revision, game }) {
  const capturedHere = lastMove?.capturedAt?.[0] === row && lastMove?.capturedAt?.[1] === col;
  const landed = lastMove?.to[0] === row && lastMove?.to[1] === col;
  return <React.Fragment key={revision}>
    {capturedHere && lastMove.capturedPiece && <span className="board-captured-ghost" aria-hidden="true">
      {game === 'chess' ? <ChessPiece piece={lastMove.capturedPiece} /> : <span className={`damas-piece ${lastMove.capturedPiece.toLowerCase() === 'w' ? 'piece-white' : 'piece-black'}`}><span className="damas-piece-ring" />{lastMove.capturedPiece === lastMove.capturedPiece.toUpperCase() && <span className="damas-crown">♛</span>}</span>}
    </span>}
    {landed && lastMove?.capturedPiece && <span className="board-capture-burst" aria-hidden="true" />}
    {landed && lastMove?.promoted && <span className="board-promotion-label" role="status">{game === 'chess' ? 'Promoção!' : 'Dama!'}</span>}
  </React.Fragment>;
}
