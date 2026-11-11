import React from 'react';

// Posições dos pontos numa grade 3x3 (1..9, esquerda→direita, cima→baixo)
const PIPS = {
  0: [],
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const PIPS_6_H = [1, 2, 3, 7, 8, 9];

function Half({ value, orient }) {
  const cells = value === 6 && orient === 'h' ? PIPS_6_H : PIPS[value] || [];
  return (
    <span className={`dom-half pip-${value}`}>
      {cells.map((cell) => (
        <i
          key={cell}
          style={{ gridRow: Math.floor((cell - 1) / 3) + 1, gridColumn: ((cell - 1) % 3) + 1 }}
        />
      ))}
    </span>
  );
}

/**
 * Peça de dominó.
 * orient: 'h' (horizontal 2x1) | 'v' (vertical 1x2). first = metade esquerda/topo.
 * O tamanho vem da variável CSS --u definida no elemento pai (ou via prop `u`).
 */
export default function DominoTile({
  a,
  b,
  orient = 'v',
  faceDown = false,
  u,
  className = '',
  style,
  innerRef,
  ...rest
}) {
  const merged = u ? { '--u': `${u}px`, ...style } : style;
  if (faceDown) {
    return (
      <span ref={innerRef} className={`dom dom-${orient} dom-back ${className}`} style={merged} {...rest}>
        <span className="dom-back-mark" />
      </span>
    );
  }
  return (
    <span ref={innerRef} className={`dom dom-${orient} ${a === b ? 'is-double' : ''} ${className}`} style={merged} {...rest}>
      <Half value={a} orient={orient} />
      <span className="dom-sep" />
      <Half value={b} orient={orient} />
    </span>
  );
}

/** Arte do card no catálogo do Hub */
export function DominoArt() {
  return (
    <div className="dom-art" aria-hidden="true">
      <DominoTile a={6} b={4} orient="h" u={30} className="dom-art-tile t1" />
      <DominoTile a={4} b={4} orient="v" u={30} className="dom-art-tile t2" />
      <DominoTile a={4} b={1} orient="h" u={30} className="dom-art-tile t3" />
      <DominoTile a={1} b={3} orient="v" u={30} className="dom-art-tile t4" />
      <DominoTile a={3} b={5} orient="h" u={30} className="dom-art-tile t5" />
    </div>
  );
}
