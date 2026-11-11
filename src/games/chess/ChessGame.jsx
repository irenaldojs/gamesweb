import React, { useEffect, useRef, useState, useMemo } from 'react';
import GameDialog, { OpponentLeftDialog, GameEndDialog } from '../../components/GameDialog.jsx';
import './styles.css';

// Peças Unicode
const PIECE_ICONS = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

const PIECE_NAMES = {
  K: 'Rei', Q: 'Dama', R: 'Torre', B: 'Bispo', N: 'Cavalo', P: 'Peão'
};

const PIECE_VALUES = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000
};

// Posição Inicial
function createInitialBoard() {
  return [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'],
  ];
}

// Helpers do Tabuleiro
function cloneBoard(board) {
  return board.map(row => [...row]);
}

function getPieceColor(piece) {
  return piece ? piece[0] : null;
}

function getPieceType(piece) {
  return piece ? piece[1] : null;
}

// Movimentos brutos da peça (sem validar xeque)
function getPseudoLegalMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const type = getPieceType(piece);
  const enemyColor = color === 'w' ? 'b' : 'w';
  const moves = [];

  const addIfValid = (nr, nc) => {
    if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
    const dest = board[nr][nc];
    if (!dest) {
      moves.push([nr, nc]);
      return true; // continue explorando
    }
    if (getPieceColor(dest) === enemyColor) {
      moves.push([nr, nc]);
    }
    return false; // bloqueado por peça
  };

  if (type === 'P') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    // Avanço de 1 casa
    if (r + dir >= 0 && r + dir <= 7 && !board[r + dir][c]) {
      moves.push([r + dir, c]);
      // Avanço de 2 casas
      if (r === startRow && !board[r + dir * 2][c]) {
        moves.push([r + dir * 2, c]);
      }
    }
    // Capturas diagonais
    [-1, 1].forEach(dc => {
      const nc = c + dc;
      const nr = r + dir;
      if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
        const dest = board[nr][nc];
        if (dest && getPieceColor(dest) === enemyColor) {
          moves.push([nr, nc]);
        }
      }
    });
  } else if (type === 'N') {
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    knightOffsets.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
  } else if (type === 'B' || type === 'R' || type === 'Q') {
    const directions = [];
    if (type === 'B' || type === 'Q') {
      directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (type === 'R' || type === 'Q') {
      directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    directions.forEach(([dr, dc]) => {
      let step = 1;
      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (!addIfValid(nr, nc)) break;
        if (board[nr][nc]) break;
        step++;
      }
    });
  } else if (type === 'K') {
    const kingOffsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    kingOffsets.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
  }

  return moves;
}

// Localiza o Rei da cor
function findKing(board, color) {
  const target = `${color}K`;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === target) return [r, c];
    }
  }
  return null;
}

// Verifica se o Rei de uma cor está em xeque
function isKingInCheck(board, color) {
  const kingPos = findKing(board, color);
  if (!kingPos) return true; // Rei capturado
  const [kr, kc] = kingPos;
  const enemyColor = color === 'w' ? 'b' : 'w';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceColor(piece) === enemyColor) {
        const moves = getPseudoLegalMoves(board, r, c);
        if (moves.some(([mr, mc]) => mr === kr && mc === kc)) {
          return true;
        }
      }
    }
  }
  return false;
}

// Movimentos legais (filtrando os que deixam o rei em xeque)
function getLegalMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const pseudoMoves = getPseudoLegalMoves(board, r, c);

  return pseudoMoves.filter(([tr, tc]) => {
    const nextBoard = cloneBoard(board);
    nextBoard[tr][tc] = nextBoard[r][c];
    nextBoard[r][c] = null;
    return !isKingInCheck(nextBoard, color);
  });
}

// Verifica se a cor tem algum lance legal restante
function hasAnyLegalMove(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceColor(piece) === color) {
        const moves = getLegalMoves(board, r, c);
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
}

// IA Simples / Heurística para o modo Solo
function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const type = getPieceType(piece);
      const val = PIECE_VALUES[type] || 0;
      // Bônus pelo controle de centro
      const centerDist = Math.abs(3.5 - r) + Math.abs(3.5 - c);
      const posBonus = (7 - centerDist) * 5;
      if (getPieceColor(piece) === 'b') {
        score += val + posBonus;
      } else {
        score -= val + posBonus;
      }
    }
  }
  return score;
}

function findBestAIMove(board) {
  const allMoves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceColor(piece) === 'b') {
        const moves = getLegalMoves(board, r, c);
        moves.forEach(([tr, tc]) => {
          allMoves.push({ from: [r, c], to: [tr, tc], piece });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  let bestMove = allMoves[0];
  let bestScore = -Infinity;

  allMoves.forEach(m => {
    const [fr, fc] = m.from;
    const [tr, tc] = m.to;
    const nextBoard = cloneBoard(board);
    const captured = nextBoard[tr][tc];
    nextBoard[tr][tc] = nextBoard[fr][fc];
    nextBoard[fr][fc] = null;
    // Promoção automática para Dama
    if (m.piece === 'bP' && tr === 7) {
      nextBoard[tr][tc] = 'bQ';
    }

    let score = evaluateBoard(nextBoard);
    if (captured) {
      score += (PIECE_VALUES[getPieceType(captured)] || 0) * 2;
    }
    // Adiciona leve ruído randômico para variedade
    score += Math.random() * 8;

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  });

  return bestMove;
}

export default function ChessGame({ sdk, playerId, connected, active, onExitToHub }) {
  const [board, setBoard] = useState(createInitialBoard);
  const [turn, setTurn] = useState('w'); // 'w' (Brancas) ou 'b' (Pretas)
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [capturedWhite, setCapturedWhite] = useState([]); // Peças brancas capturadas pelas pretas
  const [capturedBlack, setCapturedBlack] = useState([]); // Peças pretas capturadas pelas brancas
  const [moveHistory, setMoveHistory] = useState([]);
  const [phase, setPhase] = useState('lobby'); // 'lobby', 'playing', 'gameover'
  const [gameResult, setGameResult] = useState('');
  const [role, setRole] = useState(sdk.role);
  const [status, setStatus] = useState('');
  const [multiplayerReady, setMultiplayerReady] = useState(false);
  const [opponentLeftInfo, setOpponentLeftInfo] = useState(null);

  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  const phaseRef = useRef(phase);
  const reportedRef = useRef(false);

  useEffect(() => {
    boardRef.current = board;
    turnRef.current = turn;
    phaseRef.current = phase;
  }, [board, turn, phase]);

  // Checa se o Rei atual está em xeque
  const isWhiteInCheck = useMemo(() => isKingInCheck(board, 'w'), [board]);
  const isBlackInCheck = useMemo(() => isKingInCheck(board, 'b'), [board]);

  // Listener WebSocket para partidas multijogador
  useEffect(() => {
    const onRoomCreated = (event) => {
      setRole('host');
      sdk.role = 'host';
      setMultiplayerReady(false);
      setStatus(`Sala ${event.detail.roomId} criada. Aguardando outro jogador...`);
    };

    const onRoomJoined = (event) => {
      setRole('guest');
      sdk.role = 'guest';
      setMultiplayerReady(true);
      setStatus(`Você entrou na sala ${event.detail.roomId}.`);
    };

    const onGameStart = () => {
      setMultiplayerReady(true);
      setStatus('Partida iniciada! O anfitrião joga com as Brancas.');
      resetGame();
      setPhase('playing');
    };

    const onGameSync = (event) => {
      const data = event.detail.data;
      if (!data) return;

      if (data.action === 'START_REQUESTED' && sdk.role === 'host') {
        resetGame();
        setPhase('playing');
        sdk.sendGameInput({ action: 'START_CONFIRMED' });
        return;
      }

      if (data.action === 'START_CONFIRMED' && sdk.role === 'guest') {
        resetGame();
        setPhase('playing');
        return;
      }

      if (data.action === 'MOVE') {
        setBoard(data.board);
        setTurn(data.nextTurn);
        setLastMove(data.lastMove);
        setCapturedWhite(data.capturedWhite);
        setCapturedBlack(data.capturedBlack);
        setMoveHistory(data.moveHistory);

        if (data.isGameOver) {
          setPhase('gameover');
          setGameResult(data.gameResult);
          if (data.winnerId && !reportedRef.current) {
            reportedRef.current = true;
            sdk.reportMatchEnd(data.winnerId);
          }
        }
      }
    };

    const onPlayerLeft = (event) => {
      const { username, reason } = event.detail || {};
      const wasPlaying = phaseRef.current === 'playing';
      setOpponentLeftInfo({
        opponentName: username,
        wonByForfeit: wasPlaying,
        reason: reason || 'disconnected',
      });
      setPhase('opponent_left');
      if (wasPlaying && !reportedRef.current && sdk.role !== 'solo') {
        reportedRef.current = true;
        sdk.reportMatchEnd(playerId);
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
  }, [sdk]);

  // Reset ao ficar inativo
  useEffect(() => {
    if (!active && phase !== 'lobby') {
      setPhase('lobby');
    }
  }, [active]);

  // IA Solo: executa quando for a vez das Pretas no modo solo
  useEffect(() => {
    if (phase !== 'playing' || role !== 'solo' || turn !== 'b') return;

    const timer = setTimeout(() => {
      const bestMove = findBestAIMove(boardRef.current);
      if (bestMove) {
        executeMove(bestMove.from[0], bestMove.from[1], bestMove.to[0], bestMove.to[1]);
      } else {
        // Sem lances: xeque-mate ou afogamento
        if (isKingInCheck(boardRef.current, 'b')) {
          endGame('Vitória das Brancas por Xeque-Mate!', playerId);
        } else {
          endGame('Empate por Afogamento (Stalemate)!', null);
        }
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [phase, role, turn]);

  function resetGame() {
    setBoard(createInitialBoard());
    setTurn('w');
    setSelectedSquare(null);
    setValidMoves([]);
    setLastMove(null);
    setCapturedWhite([]);
    setCapturedBlack([]);
    setMoveHistory([]);
    setGameResult('');
    reportedRef.current = false;
  }

  function startSolo() {
    sdk.role = 'solo';
    setRole('solo');
    resetGame();
    setPhase('playing');
    setStatus('');
  }

  function startMultiplayer() {
    if (role === 'guest') {
      sdk.sendGameInput({ action: 'START_REQUESTED' });
      setStatus('Pedido de início enviado ao anfitrião.');
      return;
    }
    resetGame();
    setPhase('playing');
    sdk.sendGameInput({ action: 'START_CONFIRMED' });
  }

  function endGame(resultMessage, winnerId) {
    setPhase('gameover');
    setGameResult(resultMessage);
    if (winnerId && role !== 'solo' && !reportedRef.current) {
      reportedRef.current = true;
      sdk.reportMatchEnd(winnerId);
    }
  }

  // Verifica se o jogador local pode mover as peças desta cor
  function canMoveColor(pieceColor) {
    if (phase !== 'playing') return false;
    if (role === 'solo') return pieceColor === 'w'; // Solo = jogador joga de brancas
    if (role === 'host') return pieceColor === 'w'; // Host = brancas
    if (role === 'guest') return pieceColor === 'b'; // Guest = pretas
    return false;
  }

  function handleSquareClick(r, c) {
    if (phase !== 'playing') return;

    const piece = board[r][c];
    const pieceColor = getPieceColor(piece);

    // Se já havia uma casa selecionada e o clique foi em um movimento válido
    if (selectedSquare) {
      const [sr, sc] = selectedSquare;
      const isDestination = validMoves.some(([mr, mc]) => mr === r && mc === c);

      if (isDestination) {
        executeMove(sr, sc, r, c);
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }
    }

    // Se clicou em uma peça da sua cor e no seu turno
    if (piece && pieceColor === turn && canMoveColor(pieceColor)) {
      setSelectedSquare([r, c]);
      setValidMoves(getLegalMoves(board, r, c));
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  }

  function executeMove(fromR, fromC, toR, toC) {
    const currentBoard = cloneBoard(boardRef.current);
    const piece = currentBoard[fromR][fromC];
    const captured = currentBoard[toR][toC];
    const color = getPieceColor(piece);
    const nextTurn = color === 'w' ? 'b' : 'w';

    // Move a peça
    currentBoard[toR][toC] = piece;
    currentBoard[fromR][fromC] = null;

    // Promoção de Peão para Dama
    if (piece === 'wP' && toR === 0) currentBoard[toR][toC] = 'wQ';
    if (piece === 'bP' && toR === 7) currentBoard[toR][toC] = 'bQ';

    // Atualiza capturas
    const newCapturedWhite = [...capturedWhite];
    const newCapturedBlack = [...capturedBlack];
    if (captured) {
      if (getPieceColor(captured) === 'w') {
        newCapturedWhite.push(captured);
      } else {
        newCapturedBlack.push(captured);
      }
    }

    // Notação do lance
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const fromNotation = `${files[fromC]}${8 - fromR}`;
    const toNotation = `${files[toC]}${8 - toR}`;
    const notation = `${PIECE_ICONS[piece]} ${fromNotation} → ${toNotation}${captured ? ' ⚔' : ''}`;
    const newHistory = [notation, ...moveHistory];

    const newLastMove = { from: [fromR, fromC], to: [toR, toC] };

    // Checa fim de jogo para o próximo jogador
    const enemyHasMoves = hasAnyLegalMove(currentBoard, nextTurn);
    let isGameOver = false;
    let finalResult = '';
    let winnerId = null;

    if (!enemyHasMoves) {
      isGameOver = true;
      if (isKingInCheck(currentBoard, nextTurn)) {
        const winnerColor = color === 'w' ? 'Brancas' : 'Pretas';
        finalResult = `Xeque-Mate! Vitória das ${winnerColor}!`;
        winnerId = (color === 'w' && role === 'host') || (color === 'b' && role === 'guest')
          ? playerId
          : 'opponent';
      } else {
        finalResult = 'Empate por Afogamento (Stalemate)!';
      }
    }

    // Aplica estado local
    setBoard(currentBoard);
    setTurn(nextTurn);
    setLastMove(newLastMove);
    setCapturedWhite(newCapturedWhite);
    setCapturedBlack(newCapturedBlack);
    setMoveHistory(newHistory);

    // Se estiver em modo multiplayer, envia sincronização pelo SDK
    if (role !== 'solo') {
      sdk.sendGameInput({
        action: 'MOVE',
        board: currentBoard,
        nextTurn,
        lastMove: newLastMove,
        capturedWhite: newCapturedWhite,
        capturedBlack: newCapturedBlack,
        moveHistory: newHistory,
        isGameOver,
        gameResult: finalResult,
        winnerId
      });
    }

    if (isGameOver) {
      endGame(finalResult, winnerId);
    }
  }

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  return (
    <div className="chess-view">
      <div className="chess-heading">
        <div>
          <div className="section-kicker">Estratégia / 002</div>
          <h1 className="section-heading">Xadrez Clássico</h1>
        </div>
      </div>

      <div className="chess-layout">
        {/* Tabuleiro */}
        <div className="chess-board-wrapper">
          <div className="chess-board">
            {board.map((row, r) =>
              row.map((piece, c) => {
                const isLight = (r + c) % 2 === 0;
                const isSelected = selectedSquare && selectedSquare[0] === r && selectedSquare[1] === c;
                const isPossibleMove = validMoves.some(([mr, mc]) => mr === r && mc === c);
                const isLastMoveSquare = lastMove && (
                  (lastMove.from[0] === r && lastMove.from[1] === c) ||
                  (lastMove.to[0] === r && lastMove.to[1] === c)
                );
                const isKingCheckSquare =
                  (piece === 'wK' && isWhiteInCheck) ||
                  (piece === 'bK' && isBlackInCheck);

                return (
                  <div
                    key={`${r}-${c}`}
                    className={`chess-square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${isLastMoveSquare ? 'last-move' : ''} ${isKingCheckSquare ? 'in-check' : ''}`}
                    onClick={() => handleSquareClick(r, c)}
                  >
                    {/* Coordenadas */}
                    {c === 0 && <span className="coord-rank">{8 - r}</span>}
                    {r === 7 && <span className="coord-file">{files[c]}</span>}

                    {/* Marcador de movimento válido */}
                    {isPossibleMove && !piece && <span className="chess-move-dot" />}
                    {isPossibleMove && piece && <span className="chess-capture-ring" />}

                    {/* Peça */}
                    {piece && (
                      <span className={`chess-piece ${getPieceColor(piece) === 'w' ? 'piece-white' : 'piece-black'}`}>
                        {PIECE_ICONS[piece]}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel lateral de status e informações */}
        <div className="chess-info-panel">
          <div className="chess-status-card">
            <div className="panel-heading">Turno Atual</div>
            <div className="turn-indicator">
              <span className={`turn-pill ${turn === 'w' ? 'white' : 'black'}`}>
                {turn === 'w' ? '♔ Brancas' : '♚ Pretas'}
              </span>
              <span className="role-badge">
                {role === 'solo'
                  ? (turn === 'w' ? 'Sua vez' : 'IA pensando...')
                  : (role === 'host'
                      ? (turn === 'w' ? 'Sua vez' : 'Vez do oponente')
                      : (turn === 'b' ? 'Sua vez' : 'Vez do oponente'))}
              </span>
            </div>

            {(isWhiteInCheck || isBlackInCheck) && (
              <div style={{ marginTop: '10px', color: '#ff8068', fontWeight: 600, fontSize: '0.84rem' }}>
                ⚠️ {isWhiteInCheck ? 'Rei Branco em Xeque!' : 'Rei Preto em Xeque!'}
              </div>
            )}

            {/* Peças Capturadas */}
            <div className="captured-box">
              <div className="captured-row">
                <span className="captured-label">Pretas:</span>
                <span className="captured-list">
                  {capturedBlack.length === 0 ? '—' : capturedBlack.map((p, idx) => (
                    <span key={idx} style={{ color: '#164b3a' }}>{PIECE_ICONS[p]}</span>
                  ))}
                </span>
              </div>
              <div className="captured-row">
                <span className="captured-label">Brancas:</span>
                <span className="captured-list">
                  {capturedWhite.length === 0 ? '—' : capturedWhite.map((p, idx) => (
                    <span key={idx} style={{ color: '#555' }}>{PIECE_ICONS[p]}</span>
                  ))}
                </span>
              </div>
            </div>
          </div>

          {/* Histórico de Lances */}
          <div className="chess-history-card">
            <div className="panel-heading">Histórico de Lances</div>
            <div className="history-list">
              {moveHistory.length === 0 && <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Nenhum lance feito ainda.</span>}
              {moveHistory.map((mv, idx) => (
                <div key={idx} className="history-item">
                  <span>#{moveHistory.length - idx}</span>
                  <span>{mv}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ações de Partida */}
          {phase === 'playing' && (
            <div className="chess-controls">
              <button
                className="secondary-button"
                onClick={() => {
                  if (confirm('Deseja desistir da partida atual?')) {
                    endGame('Você desistiu da partida.', role === 'solo' ? null : 'opponent');
                  }
                }}
              >
                Desistir da Partida
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modais Padrão do Hub: Oponente Saiu / Fim de Jogo / Lobby */}
      {phase === 'opponent_left' && (
        <OpponentLeftDialog
          opponentName={opponentLeftInfo?.opponentName}
          wonByForfeit={opponentLeftInfo?.wonByForfeit}
          reason={opponentLeftInfo?.reason}
          onPlayAgain={() => {
            setOpponentLeftInfo(null);
            sdk.role = null;
            setRole(null);
            setPhase('lobby');
            setStatus('Crie ou entre em uma sala para jogar novamente.');
          }}
          onExitToHub={onExitToHub}
          status={status}
        />
      )}

      {phase === 'gameover' && (
        <GameEndDialog
          kicker="02 / ESTRATÉGIA"
          title="Fim de Jogo"
          message={gameResult}
          status={status}
          onPlayAgain={role === 'solo' ? startSolo : () => {
            sdk.role = null;
            setRole(null);
            setPhase('lobby');
            setStatus('Crie ou entre em uma sala para jogar novamente.');
          }}
          onExitToHub={onExitToHub}
        />
      )}

      {phase === 'lobby' && (
        <GameDialog
          kicker="02 / ESTRATÉGIA"
          title="Xadrez Clássico"
          message={
            role === 'host' || role === 'guest'
              ? 'A partida começa quando ambos estiverem na sala.'
              : 'Escolha seu modo de jogo para entrar no tabuleiro.'
          }
          status={status}
          primaryAction={
            role === 'host' || role === 'guest' ? {
              label: 'Iniciar',
              onClick: startMultiplayer,
              disabled: !multiplayerReady,
            } : {
              label: 'Jogar Solo (vs IA)',
              onClick: startSolo,
            }
          }
          secondaryAction={
            role !== 'host' && role !== 'guest' ? {
              label: 'Criar sala',
              onClick: () => sdk.createRoom('chess'),
              disabled: !connected,
            } : null
          }
        />
      )}
    </div>
  );
}
