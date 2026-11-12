import React, { useEffect, useRef, useState, useMemo } from 'react';
import GameDialog, { OpponentLeftDialog, GameEndDialog } from '../../components/GameDialog.jsx';
import './styles.css';
import { SquareEffects, MovingPiece, BoardSeat, BoardFooter } from '../board/BoardPresentation.jsx';

// Cria o tabuleiro 8x8 inicial de Damas
function createInitialBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) board[r][c] = 'b'; // Peças pretas
        else if (r > 4) board[r][c] = 'w'; // Peças brancas
      }
    }
  }
  return board;
}

function cloneBoard(board) {
  return board.map(row => [...row]);
}

function getPieceOwner(piece) {
  if (!piece) return null;
  return piece.toLowerCase(); // 'w' ou 'b'
}

function isDama(piece) {
  return piece === 'W' || piece === 'B';
}

// Obtém todas as capturas possíveis para uma peça específica
function getPieceCaptures(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const owner = getPieceOwner(piece);
  const enemy = owner === 'w' ? 'b' : 'w';
  const dama = isDama(piece);
  const captures = [];

  const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  if (!dama) {
    // Peça comum: salta 1 casa sobre inimigo
    directions.forEach(([dr, dc]) => {
      const midR = r + dr;
      const midC = c + dc;
      const destR = r + dr * 2;
      const destC = c + dc * 2;

      if (destR >= 0 && destR < 8 && destC >= 0 && destC < 8) {
        const midPiece = board[midR][midC];
        const destPiece = board[destR][destC];
        if (midPiece && getPieceOwner(midPiece) === enemy && !destPiece) {
          captures.push({
            to: [destR, destC],
            captured: [midR, midC],
          });
        }
      }
    });
  } else {
    // Dama: longo alcance pelas diagonais
    directions.forEach(([dr, dc]) => {
      let step = 1;
      let enemyPos = null;

      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;

        const currentPiece = board[nr][nc];
        if (!enemyPos) {
          if (currentPiece) {
            if (getPieceOwner(currentPiece) === owner) {
              break; // Bloqueado por peça amiga
            } else {
              enemyPos = [nr, nc]; // Encontrou inimigo
            }
          }
        } else {
          // Já encontrou inimigo, procura casas vazias após ele
          if (currentPiece) {
            break; // Bloqueado por outra peça após o inimigo
          } else {
            captures.push({
              to: [nr, nc],
              captured: enemyPos,
            });
          }
        }
        step++;
      }
    });
  }

  return captures;
}

// Obtém movimentos simples (não capturas) para uma peça
function getPieceSimpleMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const owner = getPieceOwner(piece);
  const dama = isDama(piece);
  const moves = [];

  const directions = dama
    ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    : owner === 'w'
    ? [[-1, -1], [-1, 1]] // Brancas sobem
    : [[1, -1], [1, 1]];  // Pretas descem

  if (!dama) {
    directions.forEach(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !board[nr][nc]) {
        moves.push({ to: [nr, nc], captured: null });
      }
    });
  } else {
    // Dama pode andar quantas casas vazias quiser
    directions.forEach(([dr, dc]) => {
      let step = 1;
      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
        if (board[nr][nc]) break;
        moves.push({ to: [nr, nc], captured: null });
        step++;
      }
    });
  }

  return moves;
}

// Verifica se existem capturas obrigatórias para o jogador da vez no tabuleiro inteiro
function getAllCapturesForPlayer(board, player) {
  const allCaptures = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceOwner(piece) === player) {
        const caps = getPieceCaptures(board, r, c);
        if (caps.length > 0) {
          allCaptures.push({ from: [r, c], moves: caps });
        }
      }
    }
  }
  return allCaptures;
}

// Verifica se o jogador tem algum lance legal
function hasAnyValidMoves(board, player) {
  const captures = getAllCapturesForPlayer(board, player);
  if (captures.length > 0) return true;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceOwner(piece) === player) {
        const moves = getPieceSimpleMoves(board, r, c);
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
}

export default function DamasGame({ sdk, playerId, connected, active, onExitToHub, onFindOpponent, onInviteFriend }) {
  const [board, setBoard] = useState(createInitialBoard);
  const [turn, setTurn] = useState('w'); // 'w' = Brancas, 'b' = Pretas
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [chainPiece, setChainPiece] = useState(null); // Peça no meio de uma captura em cadeia
  const [capturedWhite, setCapturedWhite] = useState(0); // Peças brancas comidas
  const [capturedBlack, setCapturedBlack] = useState(0); // Peças pretas comidas
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
  const chainPieceRef = useRef(chainPiece);
  const reportedRef = useRef(false);

  useEffect(() => {
    boardRef.current = board;
    turnRef.current = turn;
    phaseRef.current = phase;
    chainPieceRef.current = chainPiece;
  }, [board, turn, phase, chainPiece]);

  // Capturas obrigatórias ativas no tabuleiro
  const playerCaptures = useMemo(() => {
    if (phase !== 'playing') return [];
    return getAllCapturesForPlayer(board, turn);
  }, [board, turn, phase]);

  const hasMandatoryCaptures = playerCaptures.length > 0;

  // Listeners de WebSocket
  useEffect(() => {
    const onRoomCreated = (event) => {
      setRole('host');
      sdk.role = 'host';
      setMultiplayerReady(false);
      setStatus('Preparando a partida online...');
    };

    const onRoomJoined = (event) => {
      setRole('guest');
      sdk.role = 'guest';
      setMultiplayerReady(true);
      setStatus('Adversário encontrado.');
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
        setChainPiece(data.chainPiece || null);

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

  useEffect(() => {
    if (!active && phase !== 'lobby') {
      setPhase('lobby');
    }
  }, [active]);

  // IA do Modo Solo (Pretas)
  useEffect(() => {
    if (phase !== 'playing' || role !== 'solo' || turn !== 'b') return;

    const timer = setTimeout(() => {
      runAIMove();
    }, 850);

    return () => clearTimeout(timer);
  }, [phase, role, turn, chainPiece]);

  function runAIMove() {
    const currentBoard = boardRef.current;
    let movesToConsider = [];

    // Se estiver em cadeia de captura com uma peça específica
    if (chainPieceRef.current) {
      const [cr, cc] = chainPieceRef.current;
      const caps = getPieceCaptures(currentBoard, cr, cc);
      caps.forEach(m => movesToConsider.push({ from: [cr, cc], ...m }));
    } else {
      const captures = getAllCapturesForPlayer(currentBoard, 'b');
      if (captures.length > 0) {
        captures.forEach(c => {
          c.moves.forEach(m => movesToConsider.push({ from: c.from, ...m }));
        });
      } else {
        // Movimentos normais
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const piece = currentBoard[r][c];
            if (piece && getPieceOwner(piece) === 'b') {
              const simples = getPieceSimpleMoves(currentBoard, r, c);
              simples.forEach(m => movesToConsider.push({ from: [r, c], ...m }));
            }
          }
        }
      }
    }

    if (movesToConsider.length === 0) {
      endGame('Vitória das Brancas! O oponente não tem mais lances.', playerId);
      return;
    }

    // Heurística de IA: prioriza capturas, damas e posições centrais
    movesToConsider.sort((a, b) => {
      let scoreA = a.captured ? 20 : 0;
      let scoreB = b.captured ? 20 : 0;
      if (a.to[0] === 7) scoreA += 15; // Promove a dama
      if (b.to[0] === 7) scoreB += 15;
      scoreA += (3.5 - Math.abs(3.5 - a.to[1])) * 2;
      scoreB += (3.5 - Math.abs(3.5 - b.to[1])) * 2;
      return scoreB - scoreA + (Math.random() * 4 - 2);
    });

    const chosen = movesToConsider[0];
    applyMove(chosen.from[0], chosen.from[1], chosen.to[0], chosen.to[1], chosen.captured);
  }

  function resetGame() {
    setBoard(createInitialBoard());
    setTurn('w');
    setSelectedSquare(null);
    setValidMoves([]);
    setLastMove(null);
    setChainPiece(null);
    setCapturedWhite(0);
    setCapturedBlack(0);
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

  function canControl(player) {
    if (phase !== 'playing') return false;
    if (role === 'solo') return player === 'w';
    if (role === 'host') return player === 'w';
    if (role === 'guest') return player === 'b';
    return false;
  }

  function handleSquareClick(r, c) {
    if (phase !== 'playing' || !canControl(turn)) return;

    // Se estiver em cadeia de captura, só pode mover a peça da cadeia
    if (chainPiece && (chainPiece[0] !== r || chainPiece[1] !== c)) {
      const isChainTarget = validMoves.some(m => m.to[0] === r && m.to[1] === c);
      if (isChainTarget) {
        const move = validMoves.find(m => m.to[0] === r && m.to[1] === c);
        applyMove(chainPiece[0], chainPiece[1], r, c, move.captured);
      }
      return;
    }

    const piece = board[r][c];
    const pieceOwner = getPieceOwner(piece);

    // Se já havia uma casa selecionada e clicou num destino válido
    if (selectedSquare) {
      const [sr, sc] = selectedSquare;
      const move = validMoves.find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        applyMove(sr, sc, r, c, move.captured);
        return;
      }
    }

    // Se clicou em uma peça da sua cor
    if (piece && pieceOwner === turn) {
      if (hasMandatoryCaptures) {
        const hasCapture = playerCaptures.some(pc => pc.from[0] === r && pc.from[1] === c);
        if (!hasCapture) {
          // Captura obrigatória em outra peça
          return;
        }
        const pieceCaps = getPieceCaptures(board, r, c);
        setSelectedSquare([r, c]);
        setValidMoves(pieceCaps);
      } else {
        // Movimento normal
        const simple = getPieceSimpleMoves(board, r, c);
        setSelectedSquare([r, c]);
        setValidMoves(simple);
      }
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  }

  function applyMove(fromR, fromC, toR, toC, capturedPos) {
    const nextBoard = cloneBoard(boardRef.current);
    let piece = nextBoard[fromR][fromC];
    const originalPiece = piece;
    const capturedPiece = capturedPos ? nextBoard[capturedPos[0]][capturedPos[1]] : null;
    nextBoard[fromR][fromC] = null;

    let newCapturedWhite = capturedWhite;
    let newCapturedBlack = capturedBlack;

    // Remove peça capturada
    if (capturedPos) {
      const capPiece = nextBoard[capturedPos[0]][capturedPos[1]];
      nextBoard[capturedPos[0]][capturedPos[1]] = null;
      if (getPieceOwner(capPiece) === 'w') newCapturedWhite++;
      else newCapturedBlack++;
    }

    // Promoção a Dama
    let promoted = false;
    if (piece === 'w' && toR === 0) {
      piece = 'W';
      promoted = true;
    } else if (piece === 'b' && toR === 7) {
      piece = 'B';
      promoted = true;
    }
    nextBoard[toR][toC] = piece;

    // Notação do lance
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const fromNotation = `${files[fromC]}${8 - fromR}`;
    const toNotation = `${files[toC]}${8 - toR}`;
    const symbol = isDama(piece) ? '👑' : '●';
    const notation = `${symbol} ${fromNotation} → ${toNotation}${capturedPos ? ' ⚔' : ''}${promoted ? ' 👑' : ''}`;
    const newHistory = [notation, ...moveHistory];

    const newLastMove = { from: [fromR, fromC], to: [toR, toC], capturedPiece, capturedAt: capturedPos, promoted, originalPiece };

    // Verifica se há captura em cadeia para a mesma peça (se acabou de capturar e não acabou de ser promovida)
    let nextChainPiece = null;
    let nextTurn = turnRef.current;

    if (capturedPos && !promoted) {
      const chainCaps = getPieceCaptures(nextBoard, toR, toC);
      if (chainCaps.length > 0) {
        nextChainPiece = [toR, toC];
        setSelectedSquare([toR, toC]);
        setValidMoves(chainCaps);
      }
    }

    if (!nextChainPiece) {
      nextTurn = turnRef.current === 'w' ? 'b' : 'w';
      setSelectedSquare(null);
      setValidMoves([]);
    }

    // Checa se o próximo jogador tem movimentos
    let isGameOver = false;
    let finalResult = '';
    let winnerId = null;

    if (!nextChainPiece) {
      const enemyHasMoves = hasAnyValidMoves(nextBoard, nextTurn);
      if (!enemyHasMoves) {
        isGameOver = true;
        const winnerColor = turnRef.current === 'w' ? 'Brancas' : 'Pretas';
        finalResult = `Vitória das ${winnerColor}! O adversário ficou sem movimentos.`;
        winnerId = (turnRef.current === 'w' && role === 'host') || (turnRef.current === 'b' && role === 'guest')
          ? playerId
          : 'opponent';
      }
    }

    // Atualiza estado local
    setBoard(nextBoard);
    setTurn(nextTurn);
    setChainPiece(nextChainPiece);
    setLastMove(newLastMove);
    setCapturedWhite(newCapturedWhite);
    setCapturedBlack(newCapturedBlack);
    setMoveHistory(newHistory);

    // Envia sincronização via SDK no multiplayer
    if (role !== 'solo') {
      sdk.sendGameInput({
        action: 'MOVE',
        board: nextBoard,
        nextTurn,
        lastMove: newLastMove,
        chainPiece: nextChainPiece,
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
    <div className="damas-view board-game">
      <div className="damas-layout">
        {/* Tabuleiro */}
        <div className="damas-board-wrapper">
          <BoardSeat color={role === 'guest' ? 'w' : 'b'} turn={turn} role={role} phase={phase} />
          <div className="damas-board" aria-label="Tabuleiro de Jogo de Damas">
            {board.map((row, r) =>
              row.map((piece, c) => {
                const isPlayableSquare = (r + c) % 2 === 1;
                const isSelected = selectedSquare && selectedSquare[0] === r && selectedSquare[1] === c;
                const moveTarget = validMoves.find(m => m.to[0] === r && m.to[1] === c);
                const isLastMoveSquare = lastMove && (
                  (lastMove.from[0] === r && lastMove.from[1] === c) ||
                  (lastMove.to[0] === r && lastMove.to[1] === c)
                );

                return (
                  <button
                    type="button"
                    aria-label={`${files[c]}${8 - r}${piece ? ', ' + (isDama(piece) ? 'dama' : 'peça') + ' ' + (getPieceOwner(piece) === 'w' ? 'branca' : 'preta') : ', casa vazia'}`}
                    aria-pressed={Boolean(isSelected)}
                    key={`${r}-${c}`}
                    className={`damas-square ${isPlayableSquare ? 'dark' : 'light'} ${isSelected ? 'selected' : ''} ${isLastMoveSquare ? 'last-move' : ''}`}
                    onClick={() => handleSquareClick(r, c)}
                  >
                    <SquareEffects lastMove={lastMove} row={r} col={c} revision={moveHistory.length} game="damas" />
                    {/* Coordenadas */}
                    {c === 0 && <span className="coord-rank">{8 - r}</span>}
                    {r === 7 && <span className="coord-file">{files[c]}</span>}

                    {/* Marcador de movimento / captura */}
                    {moveTarget && !moveTarget.captured && <span className="damas-move-dot" />}
                    {moveTarget && moveTarget.captured && <span className="damas-capture-dot" />}

                    {/* Peça de Dama */}
                    {piece && (
                      <MovingPiece lastMove={lastMove} row={r} col={c} revision={moveHistory.length} promotionFrom={lastMove?.promoted ? <span className={`damas-piece ${getPieceOwner(piece) === 'w' ? 'piece-white' : 'piece-black'}`}><span className="damas-piece-ring" /></span> : null}>
                      <div className={`damas-piece ${getPieceOwner(piece) === 'w' ? 'piece-white' : 'piece-black'}`}>
                        <div className="damas-piece-ring" />
                        {isDama(piece) && <span className="damas-crown">♛</span>}
                      </div>
                      </MovingPiece>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <BoardSeat color={role === 'guest' ? 'b' : 'w'} turn={turn} role={role} phase={phase} />
          <BoardFooter message={phase !== 'playing' ? 'Sua próxima partida começa aqui' : chainPiece ? 'Continue a sequência de capturas' : hasMandatoryCaptures ? 'Há uma captura obrigatória' : selectedSquare ? 'Escolha uma casa destacada' : 'Selecione uma peça para jogar'} moves={moveHistory.length} />
        </div>

        {/* Painel lateral de status */}
        <div className="damas-info-panel">
          <div className="damas-status-card">
            <div className="panel-heading">Turno Atual</div>
            <div className="turn-indicator">
              <span className={`turn-pill ${turn === 'w' ? 'white' : 'black'}`}>
                {turn === 'w' ? '⚪ Brancas' : '⚫ Pretas'}
              </span>
              <span className="role-badge">
                {role === 'solo'
                  ? (turn === 'w' ? 'Sua vez' : 'IA pensando...')
                  : (role === 'host'
                      ? (turn === 'w' ? 'Sua vez' : 'Vez do oponente')
                      : (turn === 'b' ? 'Sua vez' : 'Vez do oponente'))}
              </span>
            </div>

            {hasMandatoryCaptures && (
              <div className="must-capture-banner">
                ⚔️ Captura obrigatória disponível!
              </div>
            )}

            {chainPiece && (
              <div className="must-capture-banner" style={{ background: '#e8f5e9', borderColor: '#c8e6c9', color: '#2e7d32' }}>
                ⚡ Sequência de captura múltipla!
              </div>
            )}

            {/* Placar de Peças Restantes */}
            <div className="damas-score-row">
              <div className="damas-score-badge">
                <span className="damas-mini-piece white" />
                <span>Brancas: {12 - capturedWhite}</span>
              </div>
              <div className="damas-score-badge">
                <span className="damas-mini-piece black" />
                <span>Pretas: {12 - capturedBlack}</span>
              </div>
            </div>
          </div>

          {/* Histórico de Lances */}
          <div className="chess-history-card">
            <div className="panel-heading">Histórico de lances <span className="board-history-count">{moveHistory.length}</span></div>
            <div className="history-list">
              {moveHistory.length === 0 && <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Nenhum lance feito ainda.</span>}
              {moveHistory.map((mv, idx) => (
                <div key={moveHistory.length - idx} className="history-item">
                  <span>#{moveHistory.length - idx}</span>
                  <span>{mv}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ações */}
          {phase === 'playing' && (
            <div className="chess-controls">
              <button
                className="secondary-button"
                onClick={() => {
                  if (confirm('Deseja desistir da partida de Damas?')) {
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
            setStatus('Use a fila rápida ou convide um amigo na biblioteca para jogar online.');
          }}
          onExitToHub={onExitToHub}
          status={status}
        />
      )}

      {phase === 'gameover' && (
        <GameEndDialog
          kicker="03 / CLÁSSICO"
          title="Fim de Jogo"
          message={gameResult}
          status={status}
          onPlayAgain={role === 'solo' ? startSolo : () => {
            sdk.role = null;
            setRole(null);
            setPhase('lobby');
            setStatus('Use a fila rápida ou convide um amigo na biblioteca para jogar online.');
          }}
          onExitToHub={onExitToHub}
        />
      )}

      {phase === 'lobby' && (
        <GameDialog
          kicker="03 / CLÁSSICO"
          title="Jogo de Damas"
          message={
            role === 'host' || role === 'guest'
              ? 'Preparando a partida com seu adversário.'
              : 'Escolha seu modo de jogo para entrar na mesa de Damas.'
          }
          status={status}
          onBackToHub={onExitToHub}
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
          additionalActions={role === 'host' || role === 'guest' ? [] : [
            { label: 'Buscar jogador', onClick: () => onFindOpponent?.('damas') },
            { label: 'Convidar amigo', onClick: () => onInviteFriend?.('damas') },
          ]}
        />
      )}
    </div>
  );
}
