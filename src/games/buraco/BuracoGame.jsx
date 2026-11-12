import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GameDialog, { OpponentLeftDialog, GameEndDialog } from '../../components/GameDialog.jsx';
import { Card } from './BuracoCard.jsx';
import {
  applyAction,
  canTakePile,
  cardLabel,
  chooseBotAction,
  createRound,
  isCanasta,
  isClean,
  nextRound,
  sortCards,
  teamOf,
  viewFor,
} from './buracoEngine.js';
import './styles.css';

const TEAM_COLORS = ['#d3f36b', '#ff8068'];
const HUMAN_AVATARS = ['😎', '🙂', '🤠', '😄'];
const BOT_AVATARS = ['🦊', '🐢', '🦉', '🐙'];
const BOT_NAMES = ['Zé Malandro', 'Dona Lúcia', 'Seu Jorge', 'Tia Neusa'];

const FORMATS = [
  { id: '1xia', label: '1 x IA', n: 2 },
  { id: '1x1', label: '1 x 1', n: 2 },
  { id: '2x2', label: '2 x 2', n: 4 },
];
const TARGETS = [
  { value: 1, label: 'Rodada única' },
  { value: 1500, label: '1500 pontos' },
  { value: 3000, label: '3000 pontos' },
];

function buildPlayers({ format, mode, myName, guestName }) {
  const n = format === '2x2' ? 4 : 2;
  const humans = mode === 'solo' ? 1 : mode === 'online' ? 2 : n;
  const list = [];
  let botIdx = 0;
  for (let seat = 0; seat < n; seat++) {
    const team = n === 4 ? seat % 2 : seat;
    if (seat < humans) {
      let name = `Jogador ${seat + 1}`;
      if (mode === 'solo') name = myName;
      if (mode === 'online') name = seat === 0 ? myName : guestName || 'Convidado';
      list.push({ name, kind: 'human', avatar: HUMAN_AVATARS[seat], color: TEAM_COLORS[team] });
    } else {
      list.push({ name: BOT_NAMES[botIdx], kind: 'bot', avatar: BOT_AVATARS[botIdx], color: TEAM_COLORS[team] });
      botIdx += 1;
    }
  }
  return list;
}

function Confetti() {
  return (
    <div className="bur-confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            '--d': `${(i % 10) * 80}ms`,
            '--r': `${(i * 47) % 360}deg`,
            '--x': `${((i * 53) % 90) - 45}px`,
            '--c': i % 3 === 0 ? '#ffd166' : TEAM_COLORS[i % 2],
          }}
        />
      ))}
    </div>
  );
}

/**
 * Animação FLIP universal: toda carta tem data-cid. A cada render, cartas que mudaram de lugar
 * (mão → mesa, monte → mão, mão → lixo...) deslizam da posição anterior até a nova.
 * Cartas novas (sem posição anterior) saem do monte/lixo/morto/assento conforme o último evento.
 */
function useCardFlip(rootRef, game) {
  const prev = useRef(new Map());

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = new Map();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const L = game && game.last && game.last.seq === game.seq ? game.last : null;
    const zone = (sel) => root.querySelector(sel)?.getBoundingClientRect() || null;
    const around = (zr, r, scale = 1) => (zr ? {
      left: zr.left + zr.width / 2 - (r.width * scale) / 2,
      top: zr.top + zr.height / 2 - (r.height * scale) / 2,
      width: r.width * scale,
      height: r.height * scale,
    } : null);

    root.querySelectorAll('[data-cid]').forEach((el) => {
      const id = el.dataset.cid;
      const r = el.getBoundingClientRect();
      next.set(id, r);
      if (reduce || !el.animate || r.width === 0) return;

      let from = prev.current.get(id) || null;
      if (!from && L) {
        if (L.drawnId === id) from = around(zone('[data-zone="stock"]'), r);
        else if (L.type === 'takePile' && L.ids.includes(id)) from = around(zone('[data-zone="discard"]'), r);
        else if (L.potIds && L.potIds.includes(id)) from = around(zone(`[data-zone="pot-${L.potTeam}"]`), r);
        else if (['meld', 'extend', 'discard'].includes(L.type) && L.ids.includes(id)) {
          from = around(zone(`[data-seat="${L.seat}"]`), r, 0.7);
        }
      }
      if (!from) return;
      const dx = from.left - r.left;
      const dy = from.top - r.top;
      const sx = from.width / r.width;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && Math.abs(sx - 1) < 0.05) return;
      el.animate(
        [
          { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx})`, zIndex: 60 },
          { transformOrigin: 'top left', transform: 'none', zIndex: 60 },
        ],
        { duration: 540, easing: 'cubic-bezier(0.22, 0.8, 0.25, 1)' },
      );
    });
    prev.current = next;
  });
}

function MiniHand({ count }) {
  const shown = Math.min(count, 12);
  return (
    <div className="bur-mini-hand" aria-label={`${count} cartas`}>
      {Array.from({ length: shown }, (_, i) => (
        <Card key={i} faceDown className="bur-mini deal" style={{ '--i': i }} />
      ))}
    </div>
  );
}

function MeldView({ meld, mine, canExtend, shaking, onClick }) {
  const canasta = isCanasta(meld);
  const clean = isClean(meld);
  return (
    <div
      className={`bur-meld ${mine ? 'mine' : ''} ${canasta ? 'canasta' : ''} ${canasta && clean ? 'clean' : ''} ${canExtend ? 'can-extend' : ''} ${shaking ? 'shake' : ''}`}
      data-meld={meld.id}
      onClick={() => onClick && onClick(meld)}
      role={mine ? 'button' : undefined}
    >
      {canasta && (
        <span className="bur-meld-tag">{clean ? 'CANASTRA LIMPA' : 'CANASTRA SUJA'}</span>
      )}
      {meld.items.map((it) => (
        <span key={it.card.id} className="bc-slot" data-cid={it.card.id}>
          <Card card={it.card} wild={it.wild} />
        </span>
      ))}
    </div>
  );
}

export default function BuracoGame({ sdk, playerId, connected, active, onExitToHub, onFindOpponent, onInviteFriend }) {
  const [screen, setScreen] = useState('lobby'); // 'lobby' | 'game' | 'opponent_left'
  const [mode, setMode] = useState(null); // 'solo' | 'local' | 'online'
  const [role, setRole] = useState(sdk.role);
  const [format, setFormat] = useState('1xia');
  const [target, setTarget] = useState(1500);
  const [game, setGame] = useState(null);
  const [selected, setSelected] = useState([]);
  const [sortMode, setSortMode] = useState('suit');
  const [shake, setShake] = useState(null);
  const [curtain, setCurtain] = useState(false);
  const [status, setStatus] = useState('');
  const [opponentLeftInfo, setOpponentLeftInfo] = useState(null);

  const gameRef = useRef(null);
  const modeRef = useRef(null);
  const reportedRef = useRef(false);
  const guestInfoRef = useRef(null);
  const busyRef = useRef(false);
  const tableRef = useRef(null);

  const myName = sdk.player?.name || sdk.player?.username || 'Você';
  const latest = useRef({});
  latest.current = { screen, mode, role, format, target, myName, playerId, active };

  useCardFlip(tableRef, game);

  /* ----------------------------- Núcleo do jogo ----------------------------- */

  const commit = useCallback((next) => {
    gameRef.current = next;
    setGame(next);
    const isOnlineHost = modeRef.current === 'online' && sdk.role === 'host';
    if (isOnlineHost) {
      sdk.sendGameInput({ action: 'STATE', state: viewFor(next, 1) });
      if (next.status === 'match_over' && !reportedRef.current) {
        reportedRef.current = true;
        const winner = next.result.matchWinner;
        if (winner === 0) sdk.reportMatchEnd(latest.current.playerId);
        else if (winner === 1 && guestInfoRef.current?.playerId) sdk.reportMatchEnd(guestInfoRef.current.playerId);
      }
    }
  }, [sdk]);

  const doAction = useCallback((seat, action) => {
    const cur = gameRef.current;
    if (!cur) return false;
    const next = applyAction(cur, seat, action);
    if (!next) return false;
    commit(next);
    return true;
  }, [commit]);

  const startMatch = useCallback((m) => {
    const cfg = latest.current;
    let fmt = cfg.format;
    if (fmt === '1xia' && m !== 'solo') fmt = '1x1';
    const players = buildPlayers({ format: fmt, mode: m, myName: cfg.myName, guestName: guestInfoRef.current?.name });
    const st = createRound({ players, target: cfg.target, round: 1 });
    reportedRef.current = false;
    modeRef.current = m;
    setMode(m);
    if (m !== 'online') {
      sdk.role = 'solo';
      setRole('solo');
    }
    setSelected([]);
    setStatus('');
    setCurtain(m === 'local');
    setOpponentLeftInfo(null);
    setScreen('game');
    commit(st);
  }, [commit, sdk]);

  const backToLobby = useCallback((msg = '') => {
    if (sdk.roomId) sdk.leaveRoom();
    sdk.role = null;
    setRole(null);
    modeRef.current = null;
    gameRef.current = null;
    setGame(null);
    setMode(null);
    setSelected([]);
    setCurtain(false);
    setScreen('lobby');
    setStatus(msg);
  }, [sdk]);

  /* ------------------------------ Listeners SDK ----------------------------- */

  useEffect(() => {
    const onRoomCreated = () => {
      setRole('host');
      sdk.role = 'host';
      setStatus('Preparando a partida online...');
    };
    const onRoomJoined = () => {
      setRole('guest');
      sdk.role = 'guest';
      setStatus('Adversário encontrado.');
    };
    const onGameStart = () => {
      setStatus('Jogador encontrado! Embaralhando as cartas...');
      if (sdk.role === 'guest') {
        modeRef.current = 'online';
        setMode('online');
        sdk.sendGameInput({ action: 'HELLO', name: latest.current.myName });
      }
    };
    const onGameSync = (e) => {
      const data = e.detail.data;
      if (!data) return;
      if (data.action === 'HELLO' && sdk.role === 'host' && latest.current.screen === 'lobby') {
        guestInfoRef.current = { playerId: e.detail.senderId, name: data.name };
        startMatch('online');
        return;
      }
      if (data.action === 'REQ' && sdk.role === 'host') {
        doAction(1, data.req);
        return;
      }
      if (data.action === 'STATE' && sdk.role === 'guest') {
        busyRef.current = false;
        modeRef.current = 'online';
        setMode('online');
        gameRef.current = data.state;
        setGame(data.state);
        setSelected([]);
        setScreen((s) => (s === 'opponent_left' ? s : 'game'));
      }
    };
    const onPlayerLeft = (e) => {
      const { username, reason } = e.detail || {};
      const cur = latest.current;
      if (cur.screen === 'lobby') {
        setStatus(`${username || 'O jogador'} saiu da sala.`);
        return;
      }
      if (modeRef.current !== 'online') return;
      const g = gameRef.current;
      const wasPlaying = Boolean(g) && g.status !== 'match_over';
      setOpponentLeftInfo({ opponentName: username, wonByForfeit: wasPlaying, reason: reason || 'disconnected' });
      setScreen('opponent_left');
      if (wasPlaying && !reportedRef.current) {
        reportedRef.current = true;
        sdk.reportMatchEnd(cur.playerId);
      }
    };

    sdk.addEventListener('ROOM_CREATED', onRoomCreated);
    sdk.addEventListener('ROOM_JOINED', onRoomJoined);
    sdk.addEventListener('GAME_START', onGameStart);
    sdk.addEventListener('GAME_SYNC_RELAY', onGameSync);
    sdk.addEventListener('PLAYER_LEFT', onPlayerLeft);
    return () => {
      sdk.removeEventListener('ROOM_CREATED', onRoomCreated);
      sdk.removeEventListener('ROOM_JOINED', onRoomJoined);
      sdk.removeEventListener('GAME_START', onGameStart);
      sdk.removeEventListener('GAME_SYNC_RELAY', onGameSync);
      sdk.removeEventListener('PLAYER_LEFT', onPlayerLeft);
    };
  }, [sdk, startMatch, doAction]);

  useEffect(() => {
    if (!active && latest.current.screen !== 'lobby') backToLobby('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /* ------------------------------- Derivados ------------------------------- */

  const isGuest = mode === 'online' && role === 'guest';
  const isAuthority = !isGuest;
  const viewSeat = !game ? 0 : mode === 'local' ? game.turn : isGuest ? 1 : 0;
  const playing = game?.status === 'playing';
  const myTeam = game ? teamOf(game, viewSeat) : 0;
  const myTurn = Boolean(game) && playing && game.turn === viewSeat && !curtain
    && game.players[viewSeat].kind === 'human';
  const hand = game ? game.hands[viewSeat] : [];
  const sortedHand = useMemo(() => sortCards(hand, sortMode), [hand, sortMode]);
  const selCards = useMemo(() => hand.filter((c) => selected.includes(c.id)), [hand, selected]);

  const initialHandIds = useMemo(
    () => new Set((game?.hands[viewSeat] || []).map((c) => c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game?.round, viewSeat, screen],
  );

  const canDrawStock = myTurn && game.phase === 'draw' && game.stock.length > 0;
  const canPile = useMemo(
    () => myTurn && game.phase === 'draw' && canTakePile(game, viewSeat),
    [game, myTurn, viewSeat],
  );
  const canMeld = useMemo(() => (
    myTurn && game.phase === 'play' && selCards.length >= 3
      && applyAction(game, viewSeat, { type: 'meld', ids: selected }) !== null
  ), [game, myTurn, selCards, selected, viewSeat]);
  const canDiscard = useMemo(() => (
    myTurn && game.phase === 'play' && selCards.length === 1
      && applyAction(game, viewSeat, { type: 'discard', id: selected[0] }) !== null
  ), [game, myTurn, selCards, selected, viewSeat]);
  const extendTargets = useMemo(() => {
    const set = new Set();
    if (!myTurn || game.phase !== 'play' || selCards.length === 0) return set;
    game.melds[myTeam].forEach((m) => {
      if (applyAction(game, viewSeat, { type: 'extend', meldId: m.id, ids: selected }) !== null) set.add(m.id);
    });
    return set;
  }, [game, myTurn, selCards, selected, viewSeat, myTeam]);

  // Limpa a seleção quando o jogo muda
  useEffect(() => { setSelected([]); }, [game?.seq, game?.round]);

  // Local: cortina para passar o aparelho
  useEffect(() => {
    if (mode === 'local' && game?.status === 'playing') setCurtain(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.turn, game?.round, mode]);

  // Piloto: bots jogam; monte vazio encerra a rodada (apenas quem é autoridade)
  useEffect(() => {
    if (screen !== 'game' || !game || game.status !== 'playing' || !isAuthority) return undefined;
    const seat = game.turn;
    let action = null;
    let delay = 0;
    if (game.players[seat].kind === 'bot') {
      action = chooseBotAction(game, seat);
      const base = { draw: 950, takePile: 1150, meld: 1050, extend: 850, discard: 950 }[action.type] || 900;
      delay = base + Math.random() * 350;
      if (game.last.type === 'start') delay += 700;
    } else if (game.phase === 'draw' && game.stock.length === 0 && !canTakePile(game, seat)) {
      action = { type: 'draw' };
      delay = 1400;
    } else {
      return undefined;
    }
    const t = setTimeout(() => {
      const cur = gameRef.current;
      if (!cur || cur.seq !== game.seq || cur.status !== 'playing') return;
      doAction(seat, action);
    }, delay);
    return () => clearTimeout(t);
  }, [game?.seq, game?.status, screen, isAuthority, doAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animação de impacto nos jogos/pilhas alterados (efeito complementar ao FLIP)
  useLayoutEffect(() => {
    const root = tableRef.current;
    if (!root || !game || game.last.seq !== game.seq) return;
    const L = game.last;
    const pulse = (el, scale = 1.05) => {
      if (!el || !el.animate) return;
      el.animate(
        [{ transform: 'scale(1)' }, { transform: `scale(${scale})`, filter: 'brightness(1.25)' }, { transform: 'scale(1)' }],
        { duration: 480, easing: 'ease-out', delay: 380 },
      );
    };
    if (L.meldId) pulse(root.querySelector(`[data-meld="${L.meldId}"]`), 1.06);
    if (L.type === 'discard') pulse(root.querySelector('[data-zone="discard"]'), 1.08);
    if (L.type === 'draw') pulse(root.querySelector('[data-zone="stock"]'), 0.94);
  }, [game?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ Ações humanas ------------------------------ */

  function send(action) {
    if (isGuest) {
      if (busyRef.current) return;
      busyRef.current = true;
      setTimeout(() => { busyRef.current = false; }, 1200);
      sdk.sendGameInput({ action: 'REQ', req: action });
    } else {
      doAction(viewSeat, action);
    }
  }

  function flash(key) {
    setShake(key);
    setTimeout(() => setShake(null), 450);
  }

  function onCard(card) {
    if (!myTurn || game.phase !== 'play') return;
    setSelected((cur) => (cur.includes(card.id) ? cur.filter((id) => id !== card.id) : [...cur, card.id]));
  }

  function onStock() {
    if (canDrawStock) send({ type: 'draw' });
    else if (myTurn && game.phase === 'draw') flash('stock');
  }

  function onPile() {
    if (!myTurn) return;
    if (game.phase === 'draw') {
      if (canPile) send({ type: 'takePile' });
      else flash('discard');
    } else if (canDiscard) {
      send({ type: 'discard', id: selected[0] });
    } else {
      flash('discard');
    }
  }

  function onMeld(meld) {
    if (!myTurn || game.phase !== 'play' || selCards.length === 0) return;
    if (extendTargets.has(meld.id)) send({ type: 'extend', meldId: meld.id, ids: selected });
    else flash(meld.id);
  }

  function onNextRound() {
    if (!isAuthority || !gameRef.current || gameRef.current.status !== 'round_over') return;
    commit(nextRound(gameRef.current));
  }

  /* ------------------------------- Renderização ------------------------------- */

  const opponents = game ? Array.from({ length: game.n - 1 }, (_, i) => (viewSeat + 1 + i) % game.n) : [];
  const result = game?.result;
  const teamLabel = (t) => {
    if (!game) return '';
    if (game.n === 4) {
      const names = game.players.filter((_, s) => teamOf(game, s) === t).map((p) => p.name);
      return names.join(' + ');
    }
    return game.players[t].name;
  };

  function renderSeat(seat) {
    const pl = game.players[seat];
    const isTurn = playing && game.turn === seat;
    const partner = game.n === 4 && teamOf(game, seat) === myTeam;
    const L = game.last;
    const labels = { draw: 'Comprou', takePile: 'Pegou o lixo!', meld: 'Baixou jogo', extend: 'Encaixou', discard: 'Descartou' };
    const bubble = L.seat === seat && labels[L.type] ? L : null;
    return (
      <div key={seat} className={`bur-seat ${isTurn ? 'active' : ''}`} data-seat={seat} style={{ '--seat': pl.color }}>
        <div className="bur-seat-head">
          <span className="bur-avatar" style={{ background: pl.color }}>{pl.avatar}</span>
          <span className="bur-seat-text">
            <strong>{pl.name}</strong>
            <small>{partner ? 'Parceiro' : game.n === 4 ? 'Adversário' : pl.kind === 'bot' ? 'IA' : 'Adversário'}</small>
          </span>
          <span className="bur-count">{game.hands[seat].length}</span>
        </div>
        <MiniHand key={`${game.round}-${seat}`} count={game.hands[seat].length} />
        {bubble && <span key={bubble.seq} className="bur-bubble">{labels[bubble.type]}</span>}
      </div>
    );
  }

  const hint = (() => {
    if (!game) return '';
    if (game.status !== 'playing') return 'Rodada encerrada';
    if (curtain) return 'Passe o aparelho';
    if (!myTurn) {
      const cur = game.players[game.turn];
      return cur.kind === 'bot' ? `${cur.name} está pensando...` : `Vez de ${cur.name}`;
    }
    if (game.phase === 'draw') {
      return canPile ? 'Compre do monte ou pegue o lixo' : 'Compre uma carta do monte';
    }
    if (game.mustUse) {
      const c = hand.find((x) => x.id === game.mustUse);
      return `Use ${c ? cardLabel(c) : 'a carta do lixo'} em um jogo`;
    }
    if (selCards.length === 0) return 'Selecione cartas: 3+ em sequência baixam um jogo, 1 descarta';
    if (canMeld) return 'Jogo válido! Toque em "Baixar jogo"';
    if (extendTargets.size) return 'Toque em um jogo brilhante para encaixar';
    if (canDiscard) return 'Descarte a carta no lixo';
    return 'Esta seleção não forma um jogo';
  })();

  const topDiscards = game ? game.discard.slice(-3) : [];
  const curPlayer = game ? game.players[game.turn] : null;
  const myMelds = game ? game.melds[myTeam] : [];
  const oppMelds = game ? game.melds[1 - myTeam] : [];
  const lobbyWaiting = role === 'host' || role === 'guest';
  const fmt = FORMATS.find((f) => f.id === format);

  return (
    <div className="bur-view">
      <div className="bur-layout">
        <div className="bur-table-wrap">
          <div className="bur-table" ref={tableRef}>
            {/* Oponentes */}
            <div className="bur-opponents">
              {game ? opponents.map(renderSeat) : <div className="bur-empty-title">Mesa de Buraco</div>}
            </div>

            {/* Centro: pilhas + jogos */}
            <div className="bur-board">
              {game ? (
                <>
                  <div className="bur-piles">
                    <div className="bur-pile-block">
                      <span className="bur-pile-label">Monte</span>
                      <button
                        type="button"
                        className={`bur-stock ${canDrawStock ? 'ready' : ''} ${shake === 'stock' ? 'shake' : ''}`}
                        data-zone="stock"
                        onClick={onStock}
                        aria-label="Comprar do monte"
                      >
                        {game.stock.length > 0 ? (
                          <>
                            <Card faceDown />
                            <Card faceDown />
                            <Card faceDown />
                          </>
                        ) : <span className="bur-pile-empty" />}
                        <b className="bur-pile-count">{game.stock.length}</b>
                      </button>
                    </div>

                    <div className="bur-pile-block">
                      <span className="bur-pile-label">Lixo</span>
                      <button
                        type="button"
                        className={`bur-discard ${canPile || (myTurn && game.phase === 'play' && canDiscard) ? 'ready' : ''} ${shake === 'discard' ? 'shake' : ''}`}
                        data-zone="discard"
                        onClick={onPile}
                        aria-label="Lixo"
                      >
                        {topDiscards.length === 0 && <span className="bur-pile-empty" />}
                        {topDiscards.map((c, i) => (
                          <span
                            key={c.id}
                            className="bc-slot bur-discard-card"
                            data-cid={c.id}
                            style={{ '--k': i - (topDiscards.length - 1), '--rot': `${((c.rank * 7 + (c.suit + 2) * 5) % 13) - 6}deg` }}
                          >
                            <Card card={c} />
                          </span>
                        ))}
                        {game.discard.length > 0 && <b className="bur-pile-count">{game.discard.length}</b>}
                      </button>
                    </div>

                    <div className="bur-pots">
                      {[0, 1].map((t) => (
                        <div
                          key={t}
                          className={`bur-pot ${game.potTaken[t] ? 'taken' : ''} ${t === myTeam ? 'mine' : ''}`}
                          data-zone={`pot-${t}`}
                          style={{ '--seat': TEAM_COLORS[t] }}
                          title={`Morto ${t === myTeam ? 'da sua dupla' : 'adversário'}`}
                        >
                          <span className="bur-pot-stack">
                            <Card faceDown className="pot" />
                            <Card faceDown className="pot" />
                          </span>
                          <small>{game.potTaken[t] ? 'Morto pego' : t === myTeam ? 'Nosso morto' : 'Morto deles'}</small>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bur-melds-col">
                    <div className="bur-melds-zone theirs" style={{ '--seat': TEAM_COLORS[1 - myTeam] }}>
                      <span className="bur-zone-label">Jogos deles</span>
                      <div className="bur-meld-list">
                        {oppMelds.length === 0 && <span className="bur-zone-empty">Nenhum jogo baixado</span>}
                        {oppMelds.map((m) => <MeldView key={m.id} meld={m} mine={false} />)}
                      </div>
                    </div>
                    <div className="bur-melds-zone mine" style={{ '--seat': TEAM_COLORS[myTeam] }}>
                      <span className="bur-zone-label">Nossos jogos</span>
                      <div className="bur-meld-list">
                        {myMelds.length === 0 && <span className="bur-zone-empty">Baixe sequências do mesmo naipe (mín. 3)</span>}
                        {myMelds.map((m) => (
                          <MeldView
                            key={m.id}
                            meld={m}
                            mine
                            canExtend={extendTargets.has(m.id)}
                            shaking={shake === m.id}
                            onClick={onMeld}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bur-empty-art" aria-hidden="true">
                  <Card card={{ id: 'e1', rank: 1, suit: 0 }} className="e1" />
                  <Card card={{ id: 'e2', rank: 13, suit: 1 }} className="e2" />
                  <Card card={{ id: 'e3', rank: 0, suit: -1, joker: true }} className="e3" />
                </div>
              )}
            </div>

            {game && game.last.toast && game.last.seq === game.seq && (
              <div key={`toast-${game.seq}`} className="bur-toast">{game.last.toast}</div>
            )}
            {game && game.status === 'playing' && game.last.type === 'start' && (
              <div key={`start-${game.round}`} className="bur-toast">
                Rodada {game.round} — {game.players[game.turn].name} começa
              </div>
            )}

            {/* Fim de rodada */}
            {game && game.status === 'round_over' && result && (
              <div className="bur-banner" role="status">
                <Confetti />
                <div className="bur-banner-card">
                  <span className="bur-banner-mark">{result.reason === 'out' ? 'BATEU!' : 'MONTE ESGOTADO'}</span>
                  <h3>
                    {result.winnerTeam === null
                      ? 'Rodada empatada'
                      : `${teamLabel(result.winnerTeam)} ${result.reason === 'out' && result.outTeam === result.winnerTeam ? 'bateu' : 'vence a rodada'}`}
                  </h3>
                  <div className="bur-result-table">
                    <div className="bur-result-row head">
                      <span />
                      {[0, 1].map((t) => (
                        <b key={t} style={{ color: TEAM_COLORS[t] }}>{game.n === 4 ? `Dupla ${t === 0 ? 'A' : 'B'}` : game.players[t].name}</b>
                      ))}
                    </div>
                    {[
                      ['Cartas baixadas', 'meldPts', 1],
                      ['Canastras', 'canasta', 1],
                      ['Bateu', 'outBonus', 1],
                      ['Cartas na mão', 'handPts', -1],
                      ['Morto não pego', 'potPenalty', -1],
                    ].map(([label, key, sign]) => (
                      <div key={key} className="bur-result-row">
                        <span>{label}</span>
                        {[0, 1].map((t) => (
                          <em key={t}>{result.teams[t][key] ? `${sign < 0 ? '−' : '+'}${result.teams[t][key]}` : '–'}</em>
                        ))}
                      </div>
                    ))}
                    <div className="bur-result-row total">
                      <span>Total da rodada</span>
                      {[0, 1].map((t) => <b key={t}>{result.teams[t].total}</b>)}
                    </div>
                  </div>
                  {isAuthority ? (
                    <button type="button" className="primary-button" onClick={onNextRound}>Próxima rodada</button>
                  ) : (
                    <p className="bur-banner-wait">Aguardando o anfitrião iniciar a próxima rodada...</p>
                  )}
                </div>
              </div>
            )}

            {/* Minha mão */}
            {game && (
              <div className={`bur-dock ${myTurn ? 'my-turn' : ''}`} data-seat={viewSeat} style={{ '--seat': game.players[viewSeat].color }}>
                <div className="bur-dock-head">
                  <span className="bur-avatar" style={{ background: game.players[viewSeat].color }}>{game.players[viewSeat].avatar}</span>
                  <span className="bur-seat-text">
                    <strong>{game.players[viewSeat].name}{mode === 'local' ? '' : ' (você)'}</strong>
                    <small>{hand.length} cartas</small>
                  </span>
                  <span className={`bur-hint ${myTurn ? 'on' : ''}`}>{hint}</span>
                </div>

                <div className="bur-hand" key={`${game.round}-${viewSeat}`}>
                  {sortedHand.map((c, i) => {
                    const isSel = selected.includes(c.id);
                    const initial = initialHandIds.has(c.id);
                    return (
                      <span key={c.id} className="bc-slot" data-cid={c.id}>
                        <Card
                          card={c}
                          className={`${initial ? 'deal' : ''} ${isSel ? 'sel' : ''} ${myTurn && game.phase === 'play' ? 'clickable' : ''} ${game.mustUse === c.id ? 'must' : ''}`}
                          style={{ '--i': Math.min(i, 12) }}
                          onClick={() => onCard(c)}
                        />
                      </span>
                    );
                  })}
                </div>

                <div className="bur-actions">
                  <button type="button" className="primary-button" disabled={!canMeld} onClick={() => send({ type: 'meld', ids: selected })}>
                    Baixar jogo
                  </button>
                  <button type="button" className="secondary-button" disabled={!canDiscard} onClick={() => send({ type: 'discard', id: selected[0] })}>
                    Descartar
                  </button>
                  <button type="button" className="secondary-button" disabled={selected.length === 0} onClick={() => setSelected([])}>
                    Limpar
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setSortMode((m) => (m === 'suit' ? 'rank' : 'suit'))}>
                    Ordem: {sortMode === 'suit' ? 'Naipe' : 'Valor'}
                  </button>
                </div>

                {curtain && (
                  <div className="bur-curtain">
                    <p>Vez de <strong>{game.players[game.turn].name}</strong></p>
                    <small>Passe o aparelho e toque para ver suas cartas</small>
                    <button type="button" className="primary-button" onClick={() => setCurtain(false)}>Mostrar minha mão</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Painel lateral */}
        <div className="bur-info-panel">
          {game && (
            <>
              <div className="bur-card">
                <div className="panel-heading">Turno Atual</div>
                <div className="bur-turn-row">
                  <span className="bur-turn-pill" style={{ background: curPlayer.color }}>{curPlayer.avatar} {curPlayer.name}</span>
                  <span className="bur-muted">
                    {playing ? (myTurn ? 'Sua vez' : curPlayer.kind === 'bot' ? 'IA pensando...' : 'Aguardando') : 'Fim da rodada'}
                  </span>
                </div>

                <div className="bur-scoreboard">
                  {[0, 1].map((t) => {
                    const pct = game.target === 1 ? 0 : Math.max(0, Math.min(100, (game.scores[t] / game.target) * 100));
                    const melds = game.melds[t];
                    const clean = melds.filter((m) => isCanasta(m) && isClean(m)).length;
                    const dirty = melds.filter((m) => isCanasta(m) && !isClean(m)).length;
                    return (
                      <div key={t} className={`bur-score-row ${t === myTeam ? 'mine' : ''}`}>
                        <div className="bur-score-top">
                          <span>{t === myTeam ? 'Nós' : 'Eles'} · {teamLabel(t)}</span>
                          <b>{game.scores[t]}</b>
                        </div>
                        <div className="bur-bar"><span style={{ width: `${pct}%`, background: TEAM_COLORS[t] }} /></div>
                        <div className="bur-score-meta">
                          <span>{melds.length} jogo{melds.length === 1 ? '' : 's'}</span>
                          <span title="Canastras limpas">🟡 {clean}</span>
                          <span title="Canastras sujas">⚪ {dirty}</span>
                          <span>{game.potTaken[t] ? 'morto ✓' : 'morto –'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bur-round-chip">
                  Rodada {game.round} · {game.target === 1 ? 'rodada única' : `meta ${game.target} pts`}
                </div>
              </div>

              <div className="bur-card">
                <div className="panel-heading">Histórico</div>
                <div className="bur-history">
                  {game.log.length === 0 && <span className="bur-muted">Nenhuma jogada ainda.</span>}
                  {game.log.map((line, i) => <div key={`${game.seq}-${i}`} className="bur-history-item">{line}</div>)}
                </div>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  if (confirm('Deseja sair da partida de Buraco?')) {
                    backToLobby(mode === 'online' ? 'Você abandonou a partida.' : '');
                  }
                }}
              >
                Sair da Partida
              </button>
            </>
          )}
        </div>
      </div>

      {/* Modais padrão do Hub */}
      {screen === 'opponent_left' && (
        <OpponentLeftDialog
          opponentName={opponentLeftInfo?.opponentName}
          wonByForfeit={opponentLeftInfo?.wonByForfeit}
          reason={opponentLeftInfo?.reason}
          onPlayAgain={() => {
            setOpponentLeftInfo(null);
            backToLobby('Use a fila rápida ou convide um amigo na biblioteca para jogar online.');
          }}
          onExitToHub={onExitToHub}
          status={status}
        />
      )}

      {screen === 'game' && game?.status === 'match_over' && (
        <GameEndDialog
          kicker="05 / CLÁSSICO"
          title="Fim de Jogo"
          message={result.matchWinner === null ? 'A partida terminou empatada!' : `${teamLabel(result.matchWinner)} venceu a partida com ${game.scores[result.matchWinner]} pontos!`}
          status={status}
          onPlayAgain={() => backToLobby(mode === 'online' ? 'Use a fila rápida ou convide um amigo na biblioteca para jogar online.' : '')}
          onExitToHub={onExitToHub}
        >
          <div className="bur-final">
            {[0, 1]
              .map((t) => ({ t, score: game.scores[t] }))
              .sort((a, b) => b.score - a.score)
              .map(({ t, score }, rank) => (
                <div key={t} className="bur-final-row">
                  <span>{result.matchWinner === null ? '—' : rank === 0 ? '🏆' : `${rank + 1}º`}</span>
                  <span className="bur-dot" style={{ background: TEAM_COLORS[t] }} />
                  <span className="bur-final-name">{teamLabel(t)}</span>
                  <b>{score}</b>
                </div>
              ))}
          </div>
        </GameEndDialog>
      )}

      {screen === 'lobby' && (
        <GameDialog
          kicker="05 / CLÁSSICO"
          title="Buraco"
          message={
            lobbyWaiting
              ? 'Preparando a partida com seu adversário.'
              : 'Escolha o formato e monte a mesa: contra a IA, com amigos no mesmo aparelho ou online.'
          }
          status={status}
          onBackToHub={onExitToHub}
        >
          {!lobbyWaiting && (
            <div className="bur-setup">
              <div className="bur-setup-row">
                <span className="panel-heading">Formato</span>
                <div className="bur-chips">
                  {FORMATS.map((f) => (
                    <button key={f.id} type="button" className={`bur-chip wide ${format === f.id ? 'on' : ''}`} onClick={() => setFormat(f.id)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bur-setup-row">
                <span className="panel-heading">Fim da partida</span>
                <div className="bur-chips">
                  {TARGETS.map((t) => (
                    <button key={t.value} type="button" className={`bur-chip wide ${target === t.value ? 'on' : ''}`} onClick={() => setTarget(t.value)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="bur-setup-hint">
                {format === '1xia' && 'Você contra a IA, cada um com seu morto.'}
                {format === '1x1' && 'Duelo de 2 jogadores: online (fila ou convite) ou no mesmo aparelho.'}
                {format === '2x2' && 'Duplas de 4 jogadores. Online: você + IA parceira contra o adversário + IA parceira.'}
              </p>
              <details className="bur-rules">
                <summary>Regras rápidas</summary>
                <ul>
                  <li>Jogos são sequências do mesmo naipe (mín. 3). Coringas e 2 são curingas: no máx. 1 por jogo.</li>
                  <li>No turno: compre do monte ou pegue o lixo (só se der para usar a carta do topo), baixe jogos e descarte.</li>
                  <li>Canastra = 7+ cartas: limpa vale 200, suja 100. Sem cartas na mão você pega o morto.</li>
                  <li>Para bater: morto já pego e ao menos 1 canastra. Bater vale +100; não pegar o morto custa −100.</li>
                </ul>
              </details>
            </div>
          )}

          <div className="lobby-actions bur-lobby-actions">
            {lobbyWaiting ? (
              <button type="button" className="secondary-button" onClick={() => backToLobby('')}>Cancelar partida</button>
            ) : (
              <>
                {format === '1xia' && (
                  <button type="button" className="primary-button" onClick={() => startMatch('solo')}>Jogar contra a IA</button>
                )}
                {format === '2x2' && (
                  <button type="button" className="primary-button" onClick={() => startMatch('solo')}>Jogar com IA parceira</button>
                )}
                {format === '1x1' && (
                  <button type="button" className="primary-button" onClick={() => onFindOpponent?.('buraco')}>Buscar jogador</button>
                )}
                {format !== '1xia' && (
                  <>
                    {format === '2x2' && (
                      <button type="button" className="secondary-button" onClick={() => onFindOpponent?.('buraco')}>Buscar jogador</button>
                    )}
                    <button type="button" className="secondary-button" onClick={() => onInviteFriend?.('buraco')}>Convidar amigo</button>
                    <button type="button" className="secondary-button" onClick={() => startMatch('local')}>Mesa local ({fmt.n})</button>
                  </>
                )}
              </>
            )}
          </div>
        </GameDialog>
      )}
    </div>
  );
}
