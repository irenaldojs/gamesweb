// Motor do Buraco — lógica pura, sem React.
//
// Regras implementadas (Buraco fechado, versão brasileira):
//  - 2 baralhos + 4 coringas (108 cartas). Cada jogador recebe 11 cartas; cada dupla/jogador tem um "morto" de 11.
//  - Jogos são SEQUÊNCIAS do mesmo naipe (mín. 3). Ás vale 1 ou 14. Curinga = coringa ou 2; no máx. 1 por jogo.
//    O 2 do mesmo naipe na posição natural (entre A e 3) não conta como curinga.
//  - Turno: comprar do monte OU pegar o lixo inteiro (só se a carta do topo puder ser baixada na hora),
//    baixar/encaixar jogos (opcional) e descartar 1 carta.
//  - Canastra: jogo com 7+ cartas. Limpa (sem curinga) = 200, suja = 100.
//  - Ficar sem cartas → pega o morto (uma vez por lado). Para bater: morto já pego + ao menos 1 canastra.
//  - Pontuação da rodada: cartas baixadas + canastras + 100 (bateu) − cartas na mão − 100 (não pegou o morto).

export const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const rankLabel = (r) => RANK_LABELS[r] || String(r);
export const isRedSuit = (s) => s === 1 || s === 2;
export const cardLabel = (c) => (c.joker ? 'Coringa' : `${rankLabel(c.rank)}${SUITS[c.suit]}`);

export function makeDeck() {
  const cards = [];
  for (let d = 0; d < 2; d++) {
    for (let s = 0; s < 4; s++) {
      for (let r = 1; r <= 13; r++) cards.push({ id: `c${d}${s}${r}`, rank: r, suit: s });
    }
  }
  for (let j = 0; j < 4; j++) cards.push({ id: `jk${j}`, rank: 0, suit: -1, joker: true });
  return cards;
}

export function shuffle(list, rng = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardValue(c) {
  if (c.hidden) return 0;
  if (c.joker) return 50;
  if (c.rank === 2) return 20;
  if (c.rank === 1) return 15;
  if (c.rank >= 8) return 10;
  return 5;
}

export const isWild = (c) => Boolean(c.joker) || c.rank === 2;
export const teamOf = (state, seat) => (state.n === 4 ? seat % 2 : seat);
export const meldCards = (m) => m.items.map((i) => i.card);
export const isCanasta = (m) => m.items.length >= 7;
export const isClean = (m) => m.items.every((i) => !i.wild);

/**
 * Tenta organizar `cards` numa sequência válida.
 * Retorna { suit, items:[{card, rank, wild}] } (ordem crescente) ou null.
 */
export function arrangeSequence(cards) {
  const n = cards.length;
  if (n < 3 || n > 14) return null;
  const jokers = cards.filter((c) => c.joker);
  const twos = cards.filter((c) => !c.joker && c.rank === 2);
  const others = cards.filter((c) => !c.joker && c.rank !== 2);
  const suitSet = new Set(others.map((c) => c.suit));
  if (suitSet.size > 1) return null;
  const suits = suitSet.size === 1 ? [...suitSet] : [0, 1, 2, 3];

  for (const S of suits) {
    const eligible = twos.find((t) => t.suit === S);
    const options = eligible ? [eligible, null] : [null]; // tenta o 2 natural primeiro
    for (const natTwo of options) {
      const wilds = [...jokers, ...twos.filter((t) => t !== natTwo)];
      if (wilds.length > 1) continue;
      const nat = natTwo ? [...others, natTwo] : others;
      if (nat.length < 2) continue;

      for (const aceHigh of [false, true]) {
        const ranks = nat.map((c) => (c.rank === 1 ? (aceHigh ? 14 : 1) : c.rank));
        if (new Set(ranks).size !== ranks.length) continue;
        const order = ranks.map((r, i) => ({ r, c: nat[i] })).sort((a, b) => a.r - b.r);
        const min = order[0].r;
        const max = order[order.length - 1].r;
        const gaps = max - min + 1 - nat.length;
        if (gaps > wilds.length) continue;

        const items = order.map((o) => ({ card: o.c, rank: o.r, wild: false }));
        if (wilds.length === 1) {
          const w = wilds[0];
          if (gaps === 1) {
            let miss = -1;
            for (let r = min; r <= max; r++) if (!ranks.includes(r)) { miss = r; break; }
            const at = items.findIndex((it) => it.rank > miss);
            items.splice(at < 0 ? items.length : at, 0, { card: w, rank: miss, wild: true });
          } else if (min > 1) {
            items.unshift({ card: w, rank: min - 1, wild: true });
          } else if (max < 14) {
            items.push({ card: w, rank: max + 1, wild: true });
          } else {
            continue;
          }
        }
        return { suit: S, items };
      }
    }
  }
  return null;
}

/* --------------------------------- Estado --------------------------------- */

export function createRound({ players, target, scores, round, rng = Math.random }) {
  const n = players.length;
  const deck = shuffle(makeDeck(), rng);
  const hands = [];
  for (let i = 0; i < n; i++) hands.push(deck.splice(0, 11));
  const pots = [deck.splice(0, 11), deck.splice(0, 11)];
  const discard = [deck.pop()];
  const turn = (round - 1) % n;

  return {
    n,
    players: players.map((p) => ({ ...p })),
    target,
    round,
    scores: scores ? [...scores] : [0, 0],
    hands,
    stock: deck,
    discard,
    pots,
    potTaken: [false, false],
    melds: [[], []],
    turn,
    starter: turn,
    phase: 'draw', // fase do turno: 'draw' | 'play'
    mustUse: null,
    status: 'playing', // 'playing' | 'round_over' | 'match_over'
    result: null,
    last: { type: 'start', seat: turn, seq: 0 },
    log: [],
    seq: 0,
    meldCounter: 0,
  };
}

function pushLog(state, text) {
  state.log = [text, ...state.log].slice(0, 16);
}

const hasCanasta = (state, team) => state.melds[team].some(isCanasta);

/** Depois de uma ação, deixar a mão com `handCount` cartas é legal? */
function leavesLegalHand(state, team, handCount, extraCanasta = false) {
  if (!state.potTaken[team]) return true;
  if (hasCanasta(state, team) || extraCanasta) return true;
  return handCount >= 2;
}

/** Opções para usar a carta do topo do lixo imediatamente. */
export function pileUsage(state, seat) {
  const top = state.discard[state.discard.length - 1];
  if (!top) return [];
  const team = teamOf(state, seat);
  const hand = state.hands[seat];
  const handAfterBase = hand.length + state.discard.length;
  const out = [];

  for (const m of state.melds[team]) {
    const arr = arrangeSequence([...meldCards(m), top]);
    if (arr && leavesLegalHand(state, team, handAfterBase - 1, arr.items.length >= 7)) {
      out.push({ kind: 'extend', meldId: m.id });
    }
  }
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      const arr = arrangeSequence([top, hand[i], hand[j]]);
      if (arr && leavesLegalHand(state, team, handAfterBase - 3)) {
        out.push({ kind: 'new', ids: [hand[i].id, hand[j].id] });
      }
    }
  }
  return out;
}

export const canTakePile = (state, seat) => state.discard.length > 0 && pileUsage(state, seat).length > 0;

function takePot(state, seat, team) {
  const ids = state.pots[team].map((c) => c.id);
  state.hands[seat] = [...state.pots[team]];
  state.pots[team] = [];
  state.potTaken[team] = true;
  state.last.potIds = ids;
  state.last.potTeam = team;
  state.last.toast = `${state.players[seat].name} pegou o morto!`;
  pushLog(state, `${state.players[seat].name} pegou o morto`);
}

function finishRound(state, outTeam, reason) {
  const teams = [0, 1].map((t) => {
    let meldPts = 0;
    let canasta = 0;
    state.melds[t].forEach((m) => {
      meldPts += m.items.reduce((s, i) => s + cardValue(i.card), 0);
      if (isCanasta(m)) canasta += isClean(m) ? 200 : 100;
    });
    let handPts = 0;
    state.hands.forEach((h, seat) => {
      if (teamOf(state, seat) === t) handPts += h.reduce((s, c) => s + cardValue(c), 0);
    });
    const outBonus = outTeam === t ? 100 : 0;
    const potPenalty = state.potTaken[t] ? 0 : 100;
    return { meldPts, canasta, outBonus, handPts, potPenalty, total: meldPts + canasta + outBonus - handPts - potPenalty };
  });

  teams.forEach((r, t) => { state.scores[t] += r.total; });
  const roundWinner = teams[0].total === teams[1].total ? null : teams[0].total > teams[1].total ? 0 : 1;

  let matchWinner = null;
  const reached = [0, 1].filter((t) => state.scores[t] >= state.target);
  if (state.target === 1) {
    matchWinner = roundWinner;
  } else if (reached.length) {
    if (state.scores[0] !== state.scores[1]) matchWinner = state.scores[0] > state.scores[1] ? 0 : 1;
  }

  state.result = {
    reason, // 'out' | 'stock'
    outTeam,
    teams,
    winnerTeam: outTeam ?? roundWinner,
    matchWinner,
  };
  state.status = state.target === 1 || matchWinner !== null ? 'match_over' : 'round_over';
  pushLog(state, reason === 'out' ? 'Rodada encerrada: bateu!' : 'Rodada encerrada: monte esgotado');
}

/**
 * Ações: {type:'draw'} | {type:'takePile'} | {type:'meld', ids} |
 *        {type:'extend', meldId, ids} | {type:'discard', id}
 * Retorna novo estado ou null se inválida.
 */
export function applyAction(prev, seat, action) {
  if (prev.status !== 'playing' || prev.turn !== seat) return null;
  const st = structuredClone(prev);
  const team = teamOf(st, seat);
  const name = st.players[seat].name;
  const hand = st.hands[seat];
  st.seq += 1;

  const takeFromHand = (ids) => {
    const cards = [];
    for (const id of ids) {
      const idx = hand.findIndex((c) => c.id === id);
      if (idx < 0) return null;
      cards.push(hand[idx]);
    }
    return cards;
  };
  const afterHandChange = () => {
    // chamado após meld/extend
    if (st.hands[seat].length === 0) {
      if (!st.potTaken[team]) takePot(st, seat, team);
      else finishRound(st, team, 'out');
    }
  };

  if (action.type === 'draw') {
    if (st.phase !== 'draw') return null;
    if (st.stock.length === 0) {
      if (canTakePile(prev, seat)) return null;
      st.last = { type: 'stockEmpty', seat, seq: st.seq, toast: 'Monte esgotado!' };
      finishRound(st, null, 'stock');
      return st;
    }
    const card = st.stock.pop();
    hand.push(card);
    st.phase = 'play';
    st.last = { type: 'draw', seat, seq: st.seq, drawnId: card.id };
    pushLog(st, `${name} comprou do monte`);
    return st;
  }

  if (action.type === 'takePile') {
    if (st.phase !== 'draw' || !canTakePile(prev, seat)) return null;
    const top = st.discard[st.discard.length - 1];
    const ids = st.discard.map((c) => c.id);
    hand.push(...st.discard);
    st.discard = [];
    st.mustUse = top.id;
    st.phase = 'play';
    st.last = { type: 'takePile', seat, seq: st.seq, ids, toast: `${name} pegou o lixo (${ids.length} cartas)` };
    pushLog(st, `${name} pegou o lixo (${ids.length} cartas)`);
    return st;
  }

  if (action.type === 'meld') {
    if (st.phase !== 'play') return null;
    const ids = [...new Set(action.ids)];
    if (st.mustUse && !ids.includes(st.mustUse)) return null;
    const cards = takeFromHand(ids);
    if (!cards) return null;
    const arr = arrangeSequence(cards);
    if (!arr) return null;
    if (!leavesLegalHand(st, team, hand.length - ids.length, arr.items.length >= 7)) return null;

    st.hands[seat] = hand.filter((c) => !ids.includes(c.id));
    st.meldCounter += 1;
    const meld = { id: `m${st.meldCounter}`, suit: arr.suit, items: arr.items };
    st.melds[team].push(meld);
    if (ids.includes(st.mustUse)) st.mustUse = null;
    st.last = { type: 'meld', seat, seq: st.seq, ids, meldId: meld.id };
    pushLog(st, `${name} baixou ${arr.items.map((i) => cardLabel(i.card)).join(' ')}`);
    if (isCanasta(meld)) {
      const clean = isClean(meld);
      st.last.canasta = clean ? 'clean' : 'dirty';
      st.last.toast = clean ? 'Canastra limpa! +200' : 'Canastra suja! +100';
    }
    afterHandChange();
    return st;
  }

  if (action.type === 'extend') {
    if (st.phase !== 'play') return null;
    const meld = st.melds[team].find((m) => m.id === action.meldId);
    if (!meld) return null;
    const ids = [...new Set(action.ids)];
    if (st.mustUse && !ids.includes(st.mustUse)) return null;
    const cards = takeFromHand(ids);
    if (!cards || cards.length === 0) return null;
    const arr = arrangeSequence([...meldCards(meld), ...cards]);
    if (!arr) return null;
    const wasCanasta = isCanasta(meld);
    if (!leavesLegalHand(st, team, hand.length - ids.length, arr.items.length >= 7)) return null;

    st.hands[seat] = hand.filter((c) => !ids.includes(c.id));
    meld.items = arr.items;
    if (ids.includes(st.mustUse)) st.mustUse = null;
    st.last = { type: 'extend', seat, seq: st.seq, ids, meldId: meld.id };
    pushLog(st, `${name} encaixou ${cards.map(cardLabel).join(' ')}`);
    if (!wasCanasta && isCanasta(meld)) {
      const clean = isClean(meld);
      st.last.canasta = clean ? 'clean' : 'dirty';
      st.last.toast = clean ? 'Canastra limpa! +200' : 'Canastra suja! +100';
    }
    afterHandChange();
    return st;
  }

  if (action.type === 'discard') {
    if (st.phase !== 'play' || st.mustUse) return null;
    const idx = hand.findIndex((c) => c.id === action.id);
    if (idx < 0) return null;
    const handAfter = hand.length - 1;
    if (st.potTaken[team] && !hasCanasta(st, team) && handAfter === 0) return null;

    const [card] = hand.splice(idx, 1);
    st.discard.push(card);
    st.last = { type: 'discard', seat, seq: st.seq, ids: [card.id] };
    pushLog(st, `${name} descartou ${cardLabel(card)}`);

    if (handAfter === 0) {
      if (!st.potTaken[team]) {
        takePot(st, seat, team);
      } else {
        st.last.toast = `${name} bateu!`;
        finishRound(st, team, 'out');
        return st;
      }
    }
    st.turn = (st.turn + 1) % st.n;
    st.phase = 'draw';
    return st;
  }

  return null;
}

export function nextRound(state, rng = Math.random) {
  return createRound({
    players: state.players,
    target: state.target,
    scores: state.scores,
    round: state.round + 1,
    rng,
  });
}

/** Visão sanitizada para um jogador remoto. */
export function viewFor(state, seat) {
  const s = structuredClone(state);
  const reveal = state.status !== 'playing';
  s.hands = s.hands.map((h, i) => (
    i === seat || reveal ? h : h.map((_, k) => ({ id: `h${i}-${k}`, hidden: true, rank: -1, suit: -1 }))
  ));
  s.stock = s.stock.map((_, k) => ({ id: `s${k}`, hidden: true, rank: -1, suit: -1 }));
  s.pots = s.pots.map((p, t) => p.map((_, k) => ({ id: `p${t}-${k}`, hidden: true, rank: -1, suit: -1 })));
  return s;
}

/* ------------------------------- Ordenação UI ------------------------------- */

export function sortCards(cards, mode = 'suit') {
  const wildOrder = (c) => (c.joker ? 2 : c.rank === 2 ? 1 : 0);
  return [...cards].sort((a, b) => {
    const wa = wildOrder(a);
    const wb = wildOrder(b);
    if (wa !== wb) return wa - wb;
    if (wa > 0) return a.suit - b.suit || a.id.localeCompare(b.id);
    if (mode === 'rank') return a.rank - b.rank || a.suit - b.suit;
    return a.suit - b.suit || a.rank - b.rank;
  });
}

/* ------------------------------------ IA ------------------------------------ */

function keepScore(state, seat, card, hand) {
  if (isWild(card)) return 100;
  const team = teamOf(state, seat);
  let s = 0;
  for (const o of hand) {
    if (o === card || o.joker || o.suit !== card.suit) continue;
    const a = card.rank;
    const b = o.rank;
    let d = Math.abs(a - b);
    if (a === 1 || b === 1) d = Math.min(d, Math.abs((a === 1 ? 14 : a) - (b === 1 ? 14 : b)));
    if (d === 1) s += 5;
    else if (d === 2) s += 3;
    else if (d === 0) s += 1;
  }
  for (const m of state.melds[team]) {
    if (arrangeSequence([...meldCards(m), card])) s += 40;
  }
  for (const m of state.melds[1 - team]) {
    if (arrangeSequence([...meldCards(m), card])) s += 8; // evita alimentar o adversário
  }
  s -= cardValue(card) / 6;
  return s;
}

function newMeldCandidates(hand) {
  const cands = [];
  const jokers = hand.filter((c) => c.joker);
  const wildTwos = hand.filter((c) => !c.joker && c.rank === 2);

  for (let suit = 0; suit < 4; suit++) {
    const bySuit = hand.filter((c) => !c.joker && c.suit === suit);
    const byRank = new Map();
    bySuit.forEach((c) => {
      const keys = c.rank === 1 ? [1, 14] : [c.rank];
      keys.forEach((k) => { if (!byRank.has(k)) byRank.set(k, c); });
    });

    for (let lo = 1; lo <= 12; lo++) {
      for (let hi = lo + 2; hi <= 14; hi++) {
        const missing = [];
        const cards = [];
        for (let r = lo; r <= hi; r++) {
          const c = byRank.get(r);
          if (c) cards.push(c); else missing.push(r);
        }
        if (new Set(cards.map((c) => c.id)).size !== cards.length) continue;
        if (missing.length === 0) {
          cands.push({ ids: cards.map((c) => c.id), score: cards.length * 10 + (cards.length >= 7 ? 25 : 0) });
        } else if (missing.length === 1 && cards.length >= 3) {
          // curinga: coringa ou 2 de outro naipe
          const wild = jokers[0] || wildTwos.find((t) => t.suit !== suit);
          if (wild) {
            cands.push({
              ids: [...cards.map((c) => c.id), wild.id],
              score: (cards.length + 1) * 10 - 9 + (cards.length + 1 >= 7 ? 15 : 0),
              wild: true,
            });
          }
        }
      }
    }
  }
  return cands.sort((a, b) => b.score - a.score);
}

export function chooseBotAction(state, seat, rng = Math.random) {
  if (state.phase === 'draw') {
    if (state.stock.length === 0) return canTakePile(state, seat) ? { type: 'takePile' } : { type: 'draw' };
    if (canTakePile(state, seat)) {
      const wantsExtend = pileUsage(state, seat).some((u) => u.kind === 'extend');
      if (state.discard.length >= 3 || wantsExtend || rng() < 0.2) return { type: 'takePile' };
    }
    return { type: 'draw' };
  }

  const team = teamOf(state, seat);
  const hand = state.hands[seat];
  const valid = (a) => applyAction(state, seat, a) !== null;
  const usesMust = (ids) => !state.mustUse || ids.includes(state.mustUse);

  // 1) encaixes em jogos existentes (naturais primeiro)
  const extendList = [];
  for (const m of state.melds[team]) {
    for (const c of hand) {
      const arr = arrangeSequence([...meldCards(m), c]);
      if (!arr) continue;
      if (isWild(c) && !(arr.items.length === 7 && m.items.length === 6 && rng() < 0.5)) {
        // curinga só para fechar canastra suja (às vezes)
        if (!(state.mustUse === c.id)) continue;
      }
      const score = (arr.items.length >= 7 ? 30 : 0) + (isWild(c) ? -5 : 10) + (state.mustUse === c.id ? 100 : 0);
      extendList.push({ action: { type: 'extend', meldId: m.id, ids: [c.id] }, score });
    }
  }
  extendList.sort((a, b) => b.score - a.score);
  for (const e of extendList) {
    if (usesMust(e.action.ids) && valid(e.action)) return e.action;
  }

  // 2) novos jogos
  const melds = newMeldCandidates(hand);
  for (const c of melds) {
    if (c.wild && rng() < 0.4) continue;
    const action = { type: 'meld', ids: c.ids };
    if (usesMust(c.ids) && valid(action)) return action;
  }

  // 3) carta obrigatória do lixo: busca bruta
  if (state.mustUse) {
    const must = hand.find((c) => c.id === state.mustUse);
    if (must) {
      for (const m of state.melds[team]) {
        const a = { type: 'extend', meldId: m.id, ids: [must.id] };
        if (valid(a)) return a;
      }
      for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
          if (hand[i] === must || hand[j] === must) continue;
          const a = { type: 'meld', ids: [must.id, hand[i].id, hand[j].id] };
          if (valid(a)) return a;
        }
      }
    }
  }

  // 4) descarte
  const ranked = hand
    .map((c) => ({ c, s: keepScore(state, seat, c, hand) + rng() * 1.2 }))
    .sort((a, b) => a.s - b.s);
  for (const { c } of ranked) {
    const a = { type: 'discard', id: c.id };
    if (valid(a)) return a;
  }
  return { type: 'discard', id: hand[0].id }; // não deveria ocorrer
}
