import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GameDialog, { OpponentLeftDialog, GameEndDialog } from '../../components/GameDialog.jsx';
import DominoTile from './DominoTile.jsx';
import {
  applyAction,
  canDraw,
  chooseBotAction,
  createRound,
  layoutChain,
  legalPlacements,
  nextRound,
  tileLabel,
  viewFor,
} from './dominoEngine.js';
import './styles.css';

const SEAT_COLORS = ['#d3f36b', '#ff8068', '#7cc6ff', '#ffd166'];
const HUMAN_AVATARS = ['😎', '🙂', '🤠', '😄'];
const BOTS = [
  { name: 'Zé Malandro', avatar: '🦊' },
  { name: 'Dona Lúcia', avatar: '🐢' },
  { name: 'Seu Jorge', avatar: '🦉' },
];
const TARGETS = [
  { value: 1, label: 'Rodada única' },
  { value: 50, label: '50 pontos' },
  { value: 100, label: '100 pontos' },
];

function buildPlayers({ mode, seats, myName, guestName }) {
  const humans = mode === 'solo' ? 1 : mode === 'online' ? 2 : seats;
  const list = [];
  for (let i = 0; i < seats; i++) {
    if (i < humans) {
      let name = `Jogador ${i + 1}`;
      if (mode === 'solo') name = myName;
      if (mode === 'online') name = i === 0 ? myName : guestName || 'Convidado';
      list.push({ name, kind: 'human', avatar: HUMAN_AVATARS[i], color: SEAT_COLORS[i] });
    } else {
      const bot = BOTS[(i - humans) % BOTS.length];
      list.push({ name: bot.name, kind: 'bot', avatar: bot.avatar, color: SEAT_COLORS[i] });
    }
  }
  return list;
}

function Confetti() {
  return (
    <div className="dom-confetti" aria-hidden="true">
      {Array.from({ length: 32 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            '--d': `${(i % 10) * 80}ms`,
            '--r': `${(i * 47) % 360}deg`,
            '--x': `${((i * 53) % 90) - 45}px`,
            '--c': SEAT_COLORS[i % 4],
          }}
        />
      ))}
    </div>
  );
}

/** Peça colocada na mesa — voa da mão/assento até a posição final ao entrar. */
function BoardTile({ p, u, left, top, isLast, lastSeat, getFromRect }) {
  const ref = useRef(null);
  const [fly, setFly] = useState(null);

  useLayoutEffect(() => {
    if (!isLast || !ref.current) return;
    const from = getFromRect(lastSeat);
    if (!from) return;
    const to = ref.current.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    setFly({ '--fx': `${dx}px`, '--fy': `${dy}px`, '--fr': `${dx > 0 ? 24 : -24}deg` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className={`board-tile ${isLast ? 'last' : ''} ${fly ? 'fly' : ''} ${p.double ? 'double' : ''}`}
      style={{ left, top, '--u': `${u}px`, ...(fly || {}) }}
    >
      <DominoTile a={p.first} b={p.second} orient={p.orient} />
    </div>
  );
}

function MiniHand({ hand, reveal }) {
  return (
    <div className="dom-mini-hand" aria-label={`${hand.length} peças`}>
      {hand.map((t, i) => (
        <DominoTile
          key={t.id}
          a={t.a}
          b={t.b}
          orient="v"
          u={reveal && !t.hidden ? 15 : 11}
          faceDown={!reveal || t.hidden}
          className="dom-mini deal"
          style={{ '--i': Math.min(i, 8) }}
        />
      ))}
    </div>
  );
}

export default function DominoGame({ sdk, playerId, connected, active, onExitToHub, onFindOpponent, onInviteFriend }) {
  const [screen, setScreen] = useState('lobby'); // 'lobby' | 'game' | 'opponent_left'
  const [mode, setMode] = useState(null); // 'solo' | 'local' | 'online'
  const [role, setRole] = useState(sdk.role);
  const [seats, setSeats] = useState(2);
  const [target, setTarget] = useState(50);
  const [game, setGame] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [shakeId, setShakeId] = useState(null);
  const [curtain, setCurtain] = useState(false);
  const [status, setStatus] = useState('');
  const [opponentLeftInfo, setOpponentLeftInfo] = useState(null);
  const [boardW, setBoardW] = useState(0);

  const gameRef = useRef(null);
  const modeRef = useRef(null);
  const reportedRef = useRef(false);
  const guestInfoRef = useRef(null);
  const handRectRef = useRef(null);
  const busyRef = useRef(false);
  const boardWrapRef = useRef(null);
  const dockRef = useRef(null);

  const myName = sdk.player?.name || sdk.player?.username || 'Você';

  // Valores mais recentes para os listeners do SDK (evita closures velhas)
  const latest = useRef({});
  latest.current = { screen, mode, role, seats, target, myName, playerId, active };

  /* ----------------------------- Núcleo do jogo ----------------------------- */

  const commit = useCallback((next) => {
    gameRef.current = next;
    setGame(next);
    const isOnlineHost = modeRef.current === 'online' && sdk.role === 'host';
    if (isOnlineHost) {
      sdk.sendGameInput({ action: 'STATE', state: viewFor(next, 1) });
      if (next.phase === 'match_over' && !reportedRef.current) {
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
    const players = buildPlayers({
      mode: m,
      seats: Math.max(2, cfg.seats),
      myName: cfg.myName,
      guestName: guestInfoRef.current?.name,
    });
    const st = createRound({ players, target: cfg.target, round: 1 });
    reportedRef.current = false;
    modeRef.current = m;
    setMode(m);
    if (m !== 'online') {
      sdk.role = 'solo';
      setRole('solo');
    }
    setSelectedId(null);
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
    setSelectedId(null);
    setCurtain(false);
    setScreen('lobby');
    setStatus(msg);
  }, [sdk]);

  /* ------------------------------ Listeners SDK ----------------------------- */

  useEffect(() => {
    const onRoomCreated = (e) => {
      setRole('host');
      sdk.role = 'host';
      setStatus('Preparando a partida online...');
    };

    const onRoomJoined = (e) => {
      setRole('guest');
      sdk.role = 'guest';
      setStatus('Adversário encontrado.');
    };

    const onGameStart = () => {
      setStatus('Jogador encontrado! Distribuindo as peças...');
      if (sdk.role === 'guest') {
        modeRef.current = 'online';
        setMode('online');
        sdk.sendGameInput({ action: 'HELLO', name: latest.current.myName });
      }
    };

    const onGameSync = (e) => {
      const data = e.detail.data;
      if (!data) return;

      // Anfitrião: convidado chegou → monta a mesa
      if (data.action === 'HELLO' && sdk.role === 'host' && latest.current.screen === 'lobby') {
        guestInfoRef.current = { playerId: e.detail.senderId, name: data.name };
        startMatch('online');
        return;
      }

      // Anfitrião: jogada do convidado (assento 1)
      if (data.action === 'REQ' && sdk.role === 'host') {
        doAction(1, data.req);
        return;
      }

      // Convidado: recebe o estado completo
      if (data.action === 'STATE' && sdk.role === 'guest') {
        busyRef.current = false;
        modeRef.current = 'online';
        setMode('online');
        gameRef.current = data.state;
        setGame(data.state);
        setSelectedId(null);
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
      const wasPlaying = Boolean(g) && g.phase !== 'match_over';
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

  /* ----------------------------- Medidas do tabuleiro ----------------------------- */

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBoardW(el.clientWidth));
    ro.observe(el);
    setBoardW(el.clientWidth);
    return () => ro.disconnect();
  }, [screen]);

  /* ------------------------------- Derivados ------------------------------- */

  const isGuest = mode === 'online' && role === 'guest';
  const isAuthority = !isGuest;
  const viewSeat = !game ? 0 : mode === 'local' ? game.turn : isGuest ? 1 : 0;
  const playing = game?.phase === 'playing';
  const myTurn = Boolean(game) && playing && game.turn === viewSeat && !curtain
    && game.players[viewSeat].kind === 'human';
  const legal = useMemo(
    () => (myTurn ? legalPlacements(game, viewSeat) : []),
    [game, viewSeat, myTurn],
  );
  const playableIds = useMemo(() => new Set(legal.map((m) => m.tileId)), [legal]);
  const mustDraw = myTurn && legal.length === 0 && game && canDraw(game);
  const selectedOptions = selectedId ? legal.filter((m) => m.tileId === selectedId) : [];

  const initialHandIds = useMemo(
    () => new Set((game?.hands[viewSeat] || []).map((t) => t.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game?.round, viewSeat, screen],
  );

  // Curtain no modo local (passar o aparelho)
  useEffect(() => {
    if (mode === 'local' && game?.phase === 'playing') setCurtain(true);
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.turn, game?.round, mode]);

  // Piloto: bots jogam e jogadores sem jogada passam automaticamente (só quem é autoridade)
  useEffect(() => {
    if (screen !== 'game' || !game || game.phase !== 'playing' || !isAuthority) return undefined;
    const seat = game.turn;
    let action = null;
    let delay = 0;
    if (game.players[seat].kind === 'bot') {
      action = chooseBotAction(game, seat);
      delay = (action.type === 'play' ? 1050 : 800) + Math.random() * 450;
      if (game.last.type === 'start') delay += 700;
    } else if (legalPlacements(game, seat).length === 0 && !canDraw(game)) {
      action = { type: 'pass' };
      delay = 1300;
    } else {
      return undefined;
    }
    const t = setTimeout(() => {
      const cur = gameRef.current;
      if (!cur || cur.seq !== game.seq || cur.phase !== 'playing') return;
      doAction(seat, action);
    }, delay);
    return () => clearTimeout(t);
  }, [game?.seq, game?.phase, screen, isAuthority, doAction]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function playTile(tileId, side) {
    setSelectedId(null);
    send({ type: 'play', tileId, side });
  }

  function onHandTile(tile, el) {
    if (!myTurn) return;
    const opts = legal.filter((m) => m.tileId === tile.id);
    if (opts.length === 0) {
      setShakeId(tile.id);
      setTimeout(() => setShakeId(null), 450);
      return;
    }
    handRectRef.current = { rect: el.getBoundingClientRect(), seat: viewSeat, t: Date.now() };
    if (opts.length === 1) playTile(tile.id, opts[0].side);
    else setSelectedId((cur) => (cur === tile.id ? null : tile.id));
  }

  function onDraw() {
    if (!mustDraw) return;
    send({ type: 'draw' });
  }

  function onNextRound() {
    if (!isAuthority || !gameRef.current || gameRef.current.phase !== 'round_over') return;
    commit(nextRound(gameRef.current));
  }

  const getFromRect = useCallback((seat) => {
    const h = handRectRef.current;
    if (h && h.seat === seat && Date.now() - h.t < 4000) return h.rect;
    const el = document.querySelector(`.dom-view [data-seat="${seat}"]`) || dockRef.current;
    return el ? el.getBoundingClientRect() : null;
  }, []);

  /* --------------------------------- Layout --------------------------------- */

  const wide = boardW || 640;
  const H = wide < 540 ? 6 : 8;
  const u = Math.max(14, Math.min(38, Math.floor(wide / (2 * H + 4))));
  const layout = useMemo(
    () => (game ? layoutChain(game.chain, game.centerIdx, H) : null),
    [game?.chain, game?.centerIdx, H], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const emptyBoard = !game || game.chain.length === 0;
  const boxH = layout ? (layout.bbox.maxY - layout.bbox.minY) * u + u * 1.4 : 0;
  const boardH = emptyBoard ? u * 6 : Math.max(u * 6, boxH);
  const ox = wide / 2;
  const oy = emptyBoard ? boardH / 2 : -layout.bbox.minY * u + u * 0.7 + Math.max(0, (boardH - boxH) / 2);
  const px = (p) => ({
    left: ox + p.x * u - (p.orient === 'h' ? u : u / 2),
    top: oy + p.y * u - (p.orient === 'h' ? u / 2 : u),
  });

  const result = game?.result;
  const winnerName = result && result.winner >= 0 ? game.players[result.winner].name : null;
  const opponents = game
    ? Array.from({ length: game.n - 1 }, (_, i) => (viewSeat + 1 + i) % game.n)
    : [];

  /* ------------------------------- Renderização ------------------------------- */

  const lobbyWaiting = role === 'host' || role === 'guest';

  function renderSeat(seat) {
    const pl = game.players[seat];
    const isTurn = playing && game.turn === seat;
    const reveal = game.phase !== 'playing';
    const bubble = game.last.seat === seat && (game.last.type === 'pass' || game.last.type === 'draw')
      ? game.last
      : null;
    return (
      <div key={seat} className={`dom-seat ${isTurn ? 'active' : ''}`} data-seat={seat} style={{ '--seat': pl.color }}>
        <div className="dom-seat-head">
          <span className="dom-avatar" style={{ background: pl.color }}>{pl.avatar}</span>
          <span className="dom-seat-text">
            <strong>{pl.name}</strong>
            <small>{pl.kind === 'bot' ? 'IA' : 'Humano'} · {game.scores[seat]} pts</small>
          </span>
          <span className="dom-count">{game.hands[seat].length}</span>
        </div>
        <MiniHand key={`${game.round}-${seat}`} hand={game.hands[seat]} reveal={reveal} />
        {bubble && (
          <span key={bubble.seq} className={`dom-bubble ${bubble.type}`}>
            {bubble.type === 'pass' ? 'Passou!' : 'Comprou'}
          </span>
        )}
      </div>
    );
  }

  const hint = (() => {
    if (!game) return '';
    if (game.phase !== 'playing') return 'Rodada encerrada';
    if (curtain) return 'Passe o aparelho';
    if (!myTurn) {
      const cur = game.players[game.turn];
      return cur.kind === 'bot' ? `${cur.name} está pensando...` : `Vez de ${cur.name}`;
    }
    if (legal.length) {
      if (game.mustOpen && game.chain.length === 0) return `Abra a mesa com o ${tileLabel({ a: game.mustOpen[0], b: game.mustOpen[2] })}`;
      if (selectedOptions.length > 1) return 'Escolha em qual ponta encaixar';
      return 'Sua vez — escolha uma peça brilhante';
    }
    return canDraw(game) ? 'Sem jogadas — compre uma peça do monte' : 'Sem jogadas — passando a vez...';
  })();

  const myHand = game ? game.hands[viewSeat] : [];
  const curPlayer = game ? game.players[game.turn] : null;

  return (
    <div className="dom-view">
      <div className="dom-layout">
        <div className="dom-table-wrap">
          <div className="dom-table">
        {game && (
          <div className="dom-round-chip">
            Rodada {game.round} · {game.target === 1 ? 'rodada única' : `meta ${game.target} pts`}
          </div>
        )}
            {/* Oponentes */}
            <div className="dom-opponents">
              {game ? opponents.map(renderSeat) : (
                <div className="dom-empty-title">Mesa de Dominó</div>
              )}
            </div>

            {/* Tabuleiro */}
            <div className="dom-board-wrap" ref={boardWrapRef}>
              <div className="dom-board" key={game ? `board-${game.round}` : 'board-empty'} style={{ height: boardH }}>
                {!game && (
                  <div className="dom-empty-art" aria-hidden="true">
                    <DominoTile a={6} b={6} orient="v" u={34} className="e1" />
                    <DominoTile a={6} b={2} orient="h" u={34} className="e2" />
                    <DominoTile a={2} b={5} orient="h" u={34} className="e3" />
                  </div>
                )}

                {game && layout && layout.placements.map((p) => {
                  const chainTile = game.chain[game.chain.findIndex((c) => c.id === p.id)];
                  const isLast = game.last.type === 'play' && game.last.tileId === p.id;
                  return (
                    <BoardTile
                      key={p.id}
                      p={p}
                      u={u}
                      {...px(p)}
                      isLast={isLast}
                      lastSeat={isLast ? (chainTile?.seat ?? game.last.seat) : 0}
                      getFromRect={getFromRect}
                    />
                  );
                })}

                {game && layout && !emptyBoard && ['left', 'right'].map((side) => {
                  const g = layout.ghosts[side];
                  const usable = selectedOptions.some((m) => m.side === side);
                  const val = side === 'left' ? game.left : game.right;
                  return (
                    <button
                      key={side}
                      type="button"
                      className={`board-ghost ${g.orient} ${usable ? 'usable' : ''}`}
                      style={{ ...px(g), '--u': `${u}px` }}
                      disabled={!usable}
                      onClick={() => usable && playTile(selectedId, side)}
                      aria-label={`Encaixar na ponta ${side === 'left' ? 'esquerda' : 'direita'} (${val})`}
                    >
                      <span>{val}</span>
                    </button>
                  );
                })}
              </div>

              {game && game.phase === 'playing' && game.round >= 1 && game.last.type === 'start' && (
                <div key={`toast-${game.round}`} className="dom-toast">
                  Rodada {game.round} — {game.players[game.turn].name} abre
                </div>
              )}

              {game && game.phase === 'round_over' && result && (
                <div className="dom-banner" role="status">
                  <Confetti />
                  <span className="dom-banner-mark">
                    {result.reason === 'out' ? 'BATEU' : result.reason === 'blocked' ? 'JOGO TRANCADO' : 'EMPATE'}
                  </span>
                  <h3>
                    {result.reason === 'tie'
                      ? 'Ninguém pontua'
                      : result.reason === 'out'
                        ? `${winnerName} bateu!`
                        : `${winnerName} vence o trancado`}
                  </h3>
                  {result.winner >= 0 && <p className="dom-banner-points">+{result.points} pontos</p>}
                  {isAuthority ? (
                    <button type="button" className="primary-button" onClick={onNextRound}>Próxima rodada</button>
                  ) : (
                    <p className="dom-banner-wait">Aguardando o anfitrião iniciar a próxima rodada...</p>
                  )}
                </div>
              )}
            </div>

            {/* Minha mão */}
            {game && (
              <div
                className={`dom-dock ${myTurn ? 'my-turn' : ''}`}
                data-seat={viewSeat}
                ref={dockRef}
                style={{ '--seat': game.players[viewSeat].color }}
              >
                <div className="dom-dock-head">
                  <span className="dom-avatar" style={{ background: game.players[viewSeat].color }}>
                    {game.players[viewSeat].avatar}
                  </span>
                  <span className="dom-seat-text">
                    <strong>{game.players[viewSeat].name}{mode === 'local' ? '' : ' (você)'}</strong>
                    <small>{game.scores[viewSeat]} pts · {myHand.length} peças</small>
                  </span>
                  <span className={`dom-hint ${myTurn ? 'on' : ''}`}>{hint}</span>
                </div>

                <div className="dom-dock-body">
                  <div className="dom-hand" key={`${game.round}-${viewSeat}`}>
                    {myHand.map((t, i) => {
                      const playable = myTurn && playableIds.has(t.id);
                      const isSel = selectedId === t.id;
                      const fresh = !initialHandIds.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`dom-hand-tile deal ${playable ? 'playable' : ''} ${isSel ? 'selected' : ''} ${myTurn && !playable ? 'dim' : ''} ${shakeId === t.id ? 'shake' : ''}`}
                          style={{ '--i': fresh ? 0 : Math.min(i, 8) }}
                          onClick={(e) => onHandTile(t, e.currentTarget)}
                          aria-label={`Peça ${t.a} e ${t.b}`}
                        >
                          <DominoTile a={t.a} b={t.b} orient="v" />
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className={`dom-stock ${mustDraw ? 'ready' : ''}`}
                    disabled={!mustDraw}
                    onClick={onDraw}
                    title={game.n === 4 ? 'No jogo de 4 não há compra: as peças restantes "dormem"' : 'Comprar peça'}
                  >
                    <span className="dom-stock-stack">
                      <DominoTile faceDown orient="v" u={20} />
                      <DominoTile faceDown orient="v" u={20} />
                      <DominoTile faceDown orient="v" u={20} />
                    </span>
                    <span className="dom-stock-label">
                      {game.n === 4 ? 'Dorme' : 'Monte'}
                      <b>{game.stock.length}</b>
                    </span>
                  </button>
                </div>

                {curtain && (
                  <div className="dom-curtain">
                    <p>Vez de <strong>{game.players[game.turn].name}</strong></p>
                    <small>Passe o aparelho e toque para ver suas peças</small>
                    <button type="button" className="primary-button" onClick={() => setCurtain(false)}>
                      Mostrar minha mão
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Painel lateral */}
        <div className="dom-info-panel">
          {game && (
            <>
              <div className="dom-status-card">
                <div className="panel-heading">Turno Atual</div>
                <div className="turn-indicator">
                  <span className="dom-turn-pill" style={{ background: curPlayer.color }}>
                    {curPlayer.avatar} {curPlayer.name}
                  </span>
                  <span className="role-badge">
                    {playing ? (myTurn ? 'Sua vez' : curPlayer.kind === 'bot' ? 'IA pensando...' : 'Aguardando') : 'Fim da rodada'}
                  </span>
                </div>

                <div className="dom-scoreboard">
                  {game.players.map((pl, i) => {
                    const pct = game.target === 1 ? 0 : Math.min(100, (game.scores[i] / game.target) * 100);
                    return (
                      <div key={i} className={`dom-score-row ${game.turn === i && playing ? 'on' : ''}`}>
                        <span className="dom-avatar sm" style={{ background: pl.color }}>{pl.avatar}</span>
                        <div className="dom-score-main">
                          <div className="dom-score-top">
                            <span>{pl.name}</span>
                            <b>{game.scores[i]}</b>
                          </div>
                          <div className="dom-bar"><span style={{ width: `${pct}%`, background: pl.color }} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="dom-ends">
                  <span>Pontas</span>
                  <b>{game.left ?? '–'}</b>
                  <i>◄ ►</i>
                  <b>{game.right ?? '–'}</b>
                </div>
              </div>

              <div className="chess-history-card">
                <div className="panel-heading">Histórico</div>
                <div className="history-list">
                  {game.log.length === 0 && (
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Nenhuma jogada ainda.</span>
                  )}
                  {game.log.map((line, i) => (
                    <div key={`${game.seq}-${i}`} className="history-item"><span>{line}</span></div>
                  ))}
                </div>
              </div>

              <div className="chess-controls">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (confirm('Deseja sair da partida de Dominó?')) {
                      backToLobby(mode === 'online' ? 'Você abandonou a partida.' : '');
                    }
                  }}
                >
                  Sair da Partida
                </button>
              </div>
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

      {screen === 'game' && game?.phase === 'match_over' && (
        <GameEndDialog
          kicker="04 / CLÁSSICO"
          title="Fim de Jogo"
          message={`${game.players[result.matchWinner].name} venceu a partida com ${game.scores[result.matchWinner]} pontos!`}
          status={status}
          onPlayAgain={() => backToLobby(mode === 'online' ? 'Use a fila rápida ou convide um amigo na biblioteca para jogar online.' : '')}
          onExitToHub={onExitToHub}
        >
          <div className="dom-final">
            {game.players
              .map((pl, i) => ({ pl, i, score: game.scores[i] }))
              .sort((a, b) => b.score - a.score)
              .map(({ pl, i, score }, rank) => (
                <div key={i} className="dom-final-row">
                  <span>{rank === 0 ? '🏆' : `${rank + 1}º`}</span>
                  <span className="dom-avatar sm" style={{ background: pl.color }}>{pl.avatar}</span>
                  <span className="dom-final-name">{pl.name}</span>
                  <b>{score}</b>
                </div>
              ))}
          </div>
        </GameEndDialog>
      )}

      {screen === 'lobby' && (
        <GameDialog
          kicker="04 / CLÁSSICO"
          title="Dominó"
          message={
            lobbyWaiting
              ? 'Preparando a partida com seu adversário.'
              : 'Monte a mesa: jogue contra a IA, com amigos no mesmo aparelho ou online.'
          }
          status={status}
        >
          {!lobbyWaiting && (
            <div className="dom-setup">
              <div className="dom-setup-row">
                <span className="panel-heading">Jogadores na mesa</span>
                <div className="dom-chips">
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`dom-chip ${seats === n ? 'on' : ''}`}
                      onClick={() => setSeats(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dom-setup-row">
                <span className="panel-heading">Fim da partida</span>
                <div className="dom-chips">
                  {TARGETS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`dom-chip wide ${target === t.value ? 'on' : ''}`}
                      onClick={() => setTarget(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="dom-setup-hint">
                vs IA: você + {seats - 1} bot{seats > 2 ? 's' : ''} · Local: {seats} pessoas no mesmo aparelho ·
                Online: 2 pessoas{seats > 2 ? ` + ${seats - 2} bot${seats > 3 ? 's' : ''}` : ''}
              </p>
              <details className="dom-rules">
                <summary>Regras rápidas</summary>
                <ul>
                  <li>Encaixe peças com a mesma numeração nas pontas da mesa.</li>
                  <li>Sem jogada? Compre do monte (2–3 jogadores) ou passe. Com 4 jogadores não há compra.</li>
                  <li>Bateu (mão vazia): ganha os pontos das mãos dos outros. Trancado: vence quem tem menos pontos.</li>
                </ul>
              </details>
            </div>
          )}

          <div className="lobby-actions dom-lobby-actions">
            {lobbyWaiting ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => backToLobby('')}
              >
                Cancelar partida
              </button>
            ) : (
              <>
                <button type="button" className="primary-button" onClick={() => startMatch('solo')}>
                  Jogar vs IA
                </button>
                <button type="button" className="secondary-button" onClick={() => startMatch('local')}>
                  Mesa local ({seats})
                </button>
                <button type="button" className="secondary-button" onClick={() => onFindOpponent?.('domino')}>
                  Buscar jogador
                </button>
                <button type="button" className="secondary-button" onClick={() => onInviteFriend?.('domino')}>
                  Convidar amigo
                </button>
              </>
            )}
          </div>
        </GameDialog>
      )}
    </div>
  );
}
