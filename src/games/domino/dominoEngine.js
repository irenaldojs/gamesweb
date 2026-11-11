// Motor do Dominó (duplo-seis) — lógica pura, sem React.
// Regras:
//  - 28 peças. 2 jogadores: 7 peças cada + monte (compra). 3 jogadores: 7 cada + monte.
//  - 4 jogadores: 6 cada, 4 peças "dormem" (sem compra). Quem não joga, passa.
//  - Rodada 1: quem tem o maior duplo abre com ele. Depois: o vencedor da rodada anterior abre.
//  - Bateu (mão vazia): ganha a soma dos pontos das mãos dos outros.
//  - Jogo trancado: vence quem tem menos pontos na mão; ganha a diferença para os demais.

export const MAX_PLAYERS = 4;

export function makeSet() {
  const tiles = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) tiles.push({ id: `${a}-${b}`, a, b });
  }
  return tiles;
}

export function shuffle(list, rng = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const tilePips = (t) => t.a + t.b;
export const handPips = (hand) => hand.reduce((s, t) => s + (t.hidden ? 0 : t.a + t.b), 0);
export const tileLabel = (t) => `${t.a}|${t.b}`;

function sortHand(hand) {
  return [...hand].sort((x, y) => x.a - y.a || x.b - y.b);
}

/**
 * players: [{ name, kind: 'human' | 'bot', avatar, color }]
 * prev: estado anterior (para manter placar) ou null
 */
export function createRound({ players, target, scores, round, starter = null, rng = Math.random }) {
  const n = players.length;
  const deck = shuffle(makeSet(), rng);
  const perHand = n === 4 ? 6 : 7;
  const hands = [];
  for (let i = 0; i < n; i++) hands.push(sortHand(deck.splice(0, perHand)));
  const stock = deck; // 14 (2 jog.), 7 (3 jog.), 4 (4 jog. — "dorme")

  let turn = starter ?? 0;
  let mustOpen = null;

  if (starter === null) {
    // Rodada 1: maior duplo abre
    let found = null;
    for (let d = 6; d >= 0 && !found; d--) {
      for (let s = 0; s < n; s++) {
        if (hands[s].some((t) => t.a === d && t.b === d)) {
          found = { seat: s, id: `${d}-${d}` };
          break;
        }
      }
    }
    if (!found) {
      // Sem duplos nas mãos: maior peça
      let best = null;
      hands.forEach((h, s) => h.forEach((t) => {
        const score = t.a + t.b + Math.max(t.a, t.b) / 10;
        if (!best || score > best.score) best = { seat: s, id: t.id, score };
      }));
      found = best;
    }
    turn = found.seat;
    mustOpen = found.id;
  }

  return {
    players: players.map((p) => ({ ...p })),
    n,
    target,
    round,
    scores: scores ? [...scores] : Array(n).fill(0),
    hands,
    stock,
    chain: [],
    centerIdx: 0,
    left: null,
    right: null,
    turn,
    starter: turn,
    mustOpen,
    passes: 0,
    missing: Array.from({ length: n }, () => []),
    phase: 'playing', // 'playing' | 'round_over' | 'match_over'
    result: null,
    last: { type: 'start', seat: turn, seq: 0 },
    log: [],
    seq: 0,
  };
}

export const canDraw = (state) => state.n < 4 && state.stock.length > 0;

/** Todas as jogadas legais de um jogador: [{ tileId, side: 'start'|'left'|'right' }] */
export function legalPlacements(state, seat) {
  const hand = state.hands[seat] || [];
  const out = [];
  if (state.chain.length === 0) {
    for (const t of hand) {
      if (t.hidden) continue;
      if (state.mustOpen && t.id !== state.mustOpen) continue;
      out.push({ tileId: t.id, side: 'start' });
    }
    return out;
  }
  for (const t of hand) {
    if (t.hidden) continue;
    const matchesLeft = t.a === state.left || t.b === state.left;
    const matchesRight = t.a === state.right || t.b === state.right;
    if (matchesLeft) out.push({ tileId: t.id, side: 'left' });
    if (matchesRight) out.push({ tileId: t.id, side: 'right' });
  }
  return out;
}

function pushLog(state, text) {
  state.log = [text, ...state.log].slice(0, 14);
}

function nextSeat(state, seat) {
  return (seat + 1) % state.n;
}

function finishRound(state, winner, reason) {
  const totals = state.hands.map(handPips);
  let points = 0;
  let w = winner;

  if (reason === 'out') {
    points = totals.reduce((s, v, i) => (i === w ? s : s + v), 0);
  } else {
    // trancado
    const min = Math.min(...totals);
    const winners = totals.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0);
    if (winners.length > 1) {
      w = -1;
      points = 0;
    } else {
      w = winners[0];
      points = totals.reduce((s, v, i) => (i === w ? s : s + (v - min)), 0);
    }
  }

  if (w >= 0) state.scores[w] += points;
  state.result = { winner: w, reason: w === -1 ? 'tie' : reason, points, totals };

  const matchWinner = state.scores.findIndex((sc) => sc >= state.target);
  if (w >= 0 && state.scores[w] >= state.target) {
    state.phase = 'match_over';
    state.result.matchWinner = w;
  } else if (matchWinner >= 0) {
    state.phase = 'match_over';
    state.result.matchWinner = matchWinner;
  } else {
    state.phase = 'round_over';
  }
}

/**
 * Aplica uma ação ({type:'play',tileId,side} | {type:'draw'} | {type:'pass'}).
 * Retorna novo estado ou null se inválida.
 */
export function applyAction(prev, seat, action) {
  if (prev.phase !== 'playing' || prev.turn !== seat) return null;
  const state = structuredClone(prev);
  const name = state.players[seat].name;
  state.seq += 1;

  if (action.type === 'play') {
    const legal = legalPlacements(state, seat).find(
      (m) => m.tileId === action.tileId && m.side === action.side,
    );
    if (!legal) return null;
    const hand = state.hands[seat];
    const idx = hand.findIndex((t) => t.id === action.tileId);
    const tile = hand.splice(idx, 1)[0];
    const double = tile.a === tile.b;

    if (action.side === 'start') {
      state.chain = [{ id: tile.id, l: tile.a, r: tile.b, double, seat }];
      state.centerIdx = 0;
      state.left = tile.a;
      state.right = tile.b;
      state.mustOpen = null;
    } else if (action.side === 'left') {
      const outer = tile.a === state.left ? tile.b : tile.a;
      state.chain.unshift({ id: tile.id, l: outer, r: state.left, double, seat });
      state.centerIdx += 1;
      state.left = outer;
    } else {
      const outer = tile.a === state.right ? tile.b : tile.a;
      state.chain.push({ id: tile.id, l: state.right, r: outer, double, seat });
      state.right = outer;
    }

    state.passes = 0;
    state.last = { type: 'play', seat, tileId: tile.id, side: action.side, seq: state.seq };
    pushLog(state, `${name} jogou [${tileLabel(tile)}]${double ? ' (duplo)' : ''}`);

    if (hand.length === 0) {
      finishRound(state, seat, 'out');
      pushLog(state, `${name} bateu!`);
    } else {
      state.turn = nextSeat(state, seat);
    }
    return state;
  }

  if (action.type === 'draw') {
    if (!canDraw(state)) return null;
    if (legalPlacements(state, seat).length > 0) return null; // só compra sem jogada
    const tile = state.stock.pop();
    state.hands[seat].push(tile);
    state.last = { type: 'draw', seat, seq: state.seq };
    pushLog(state, `${name} comprou uma peça`);
    return state;
  }

  if (action.type === 'pass') {
    if (canDraw(state)) return null;
    if (legalPlacements(state, seat).length > 0) return null;
    state.passes += 1;
    [state.left, state.right].forEach((v) => {
      if (v !== null && !state.missing[seat].includes(v)) state.missing[seat].push(v);
    });
    state.last = { type: 'pass', seat, seq: state.seq };
    pushLog(state, `${name} passou`);
    if (state.passes >= state.n) {
      finishRound(state, -1, 'blocked');
      pushLog(state, 'Jogo trancado!');
    } else {
      state.turn = nextSeat(state, seat);
    }
    return state;
  }

  return null;
}

/** Inicia a próxima rodada mantendo placar e jogadores. */
export function nextRound(state, rng = Math.random) {
  const starter = state.result && state.result.winner >= 0 ? state.result.winner : state.starter;
  return createRound({
    players: state.players,
    target: state.target,
    scores: state.scores,
    round: state.round + 1,
    starter,
    rng,
  });
}

/** Visão sanitizada para um jogador remoto (esconde mãos alheias e o monte). */
export function viewFor(state, seat) {
  const s = structuredClone(state);
  const reveal = state.phase !== 'playing';
  s.hands = s.hands.map((h, i) => (
    i === seat || reveal ? h : h.map((_, k) => ({ id: `h${i}-${k}`, a: -1, b: -1, hidden: true }))
  ));
  s.stock = s.stock.map((_, k) => ({ id: `s${k}`, a: -1, b: -1, hidden: true }));
  return s;
}

/** IA: escolhe a próxima ação de um bot. */
export function chooseBotAction(state, seat, rng = Math.random) {
  const moves = legalPlacements(state, seat);
  if (moves.length === 0) return canDraw(state) ? { type: 'draw' } : { type: 'pass' };

  const hand = state.hands[seat];
  let best = null;

  for (const m of moves) {
    const tile = hand.find((t) => t.id === m.tileId);
    let newLeft = state.left;
    let newRight = state.right;
    if (m.side === 'start') {
      newLeft = tile.a;
      newRight = tile.b;
    } else if (m.side === 'left') {
      newLeft = tile.a === state.left ? tile.b : tile.a;
    } else {
      newRight = tile.a === state.right ? tile.b : tile.a;
    }

    let score = tile.a + tile.b; // joga peças pesadas cedo
    if (tile.a === tile.b) score += 3;

    // Pontas que adversários não têm (já passaram nelas)
    for (let o = 0; o < state.n; o++) {
      if (o === seat) continue;
      const w = o === (seat + 1) % state.n ? 2.5 : 1.2;
      if (state.missing[o].includes(newLeft)) score += w;
      if (state.missing[o].includes(newRight)) score += w;
    }

    // Mantém opções futuras na mão
    const rest = hand.filter((t) => t.id !== tile.id);
    const fut = rest.filter((t) => t.a === newLeft || t.b === newLeft || t.a === newRight || t.b === newRight).length;
    score += fut * 1.3;
    if (rest.length > 0 && fut === 0) score -= 4;

    score += rng() * 1.5;
    if (!best || score > best.score) best = { ...m, score };
  }
  return { type: 'play', tileId: best.tileId, side: best.side };
}

/* ---------------------------------------------------------------------------
 * Layout em "cobra" do tabuleiro. Unidades em múltiplos de `u` (lado da peça).
 * Peça normal horizontal = 2x1; dupla fica atravessada (vertical) = 1x2.
 * Os braços esquerdo/direito crescem a partir do centro e fazem curvas
 * usando uma peça vertical no canto quando chegam ao limite H.
 * ------------------------------------------------------------------------ */
function walkArm(tiles, startEdge, hdir, vdir, H) {
  const out = [];
  let edge = startEdge;
  let dir = hdir;
  let row = 0;
  const Y = (r) => r * 2 * vdir;

  for (const t of tiles) {
    const w = t.double ? 1 : 2;
    const fits = dir === 1 ? edge + w <= H : edge - w >= -H;

    if (!fits) {
      // peça de canto (vertical), depois a linha inverte o sentido
      const cx = edge + dir * 0.5;
      const cy = Y(row) + vdir;
      const innerFirst = vdir === 1; // vertical: inner no topo se desce
      out.push({
        id: t.id, x: cx, y: cy, orient: 'v', corner: true, double: t.double,
        first: innerFirst ? t.inner : t.outer,
        second: innerFirst ? t.outer : t.inner,
      });
      row += 1;
      dir = -dir;
      continue;
    }

    if (t.double) {
      out.push({
        id: t.id, x: edge + dir * 0.5, y: Y(row), orient: 'v', double: true,
        first: t.inner, second: t.outer,
      });
      edge += dir;
    } else {
      out.push({
        id: t.id, x: edge + dir * 1, y: Y(row), orient: 'h', double: false,
        first: dir === 1 ? t.inner : t.outer,
        second: dir === 1 ? t.outer : t.inner,
      });
      edge += dir * 2;
    }
  }
  return out;
}

export function layoutChain(chain, centerIdx, H = 8) {
  if (!chain.length) return { placements: [], ghosts: null, bbox: { minX: -2, maxX: 2, minY: -1, maxY: 1 } };

  const c = chain[centerIdx];
  const cw = c.double ? 1 : 2;
  const center = {
    id: c.id, x: 0, y: 0, orient: c.double ? 'v' : 'h', double: c.double,
    first: c.l, second: c.r, center: true,
  };

  const rightTiles = chain.slice(centerIdx + 1).map((t) => ({ id: t.id, double: t.double, inner: t.l, outer: t.r }));
  const leftTiles = chain.slice(0, centerIdx).reverse().map((t) => ({ id: t.id, double: t.double, inner: t.r, outer: t.l }));
  const ghostTile = { id: '__ghost', double: false, inner: 0, outer: 0 };

  const rightAll = walkArm([...rightTiles, ghostTile], cw / 2, 1, 1, H);
  const leftAll = walkArm([...leftTiles, ghostTile], -cw / 2, -1, -1, H);
  const ghosts = { right: rightAll.pop(), left: leftAll.pop() };

  const placements = [...leftAll.reverse(), center, ...rightAll];

  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  [...placements, ghosts.left, ghosts.right].forEach((p) => {
    const hw = p.orient === 'h' ? 1 : 0.5;
    const hh = p.orient === 'h' ? 0.5 : 1;
    box.minX = Math.min(box.minX, p.x - hw);
    box.maxX = Math.max(box.maxX, p.x + hw);
    box.minY = Math.min(box.minY, p.y - hh);
    box.maxY = Math.max(box.maxY, p.y + hh);
  });

  return { placements, ghosts, bbox: box };
}
