import React, { useEffect, useRef, useState } from 'react';
import GameDialog, { OpponentLeftDialog, GameEndDialog } from '../../components/GameDialog.jsx';
import './styles.css';

const WIDTH = 800;
const HEIGHT = 400;
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const BALL_RADIUS = 7;
const COURT_LEFT = 12;
const COURT_RIGHT = WIDTH - 12;
const COURT_TOP = 12;
const COURT_BOTTOM = HEIGHT - 12;
const LEFT_PADDLE_X = 24;
const RIGHT_PADDLE_X = WIDTH - 24 - PADDLE_WIDTH;

function createGameState() {
  return {
    playerY: HEIGHT / 2 - PADDLE_HEIGHT / 2,
    opponentY: HEIGHT / 2 - PADDLE_HEIGHT / 2,
    ballX: WIDTH / 2,
    ballY: HEIGHT / 2,
    ballDX: 4,
    ballDY: 4,
    playerScore: 0,
    opponentScore: 0,
    pointId: 0,
    opponentId: null,
  };
}

export default function PongGame({ sdk, playerId, connected, active, onExitToHub, onFindOpponent, onInviteFriend }) {
  const [role, setRole] = useState(sdk.role);
  const [phase, setPhase] = useState('ready');
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [pointMessage, setPointMessage] = useState('');
  const [multiplayerReady, setMultiplayerReady] = useState(false);
  const [opponentLeftInfo, setOpponentLeftInfo] = useState(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(createGameState());
  const reportedRef = useRef(false);
  const phaseRef = useRef(phase);
  const beginCountdownRef = useRef(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function beginCountdown() {
    gameRef.current = createGameState();
    reportedRef.current = false;
    setPointMessage('');
    setResult('');
    setCountdown(3);
    setPhase('countdown');
  }

  beginCountdownRef.current = beginCountdown;

  useEffect(() => {
    const onRoomCreated = (event) => {
      setRole('host');
      setMultiplayerReady(false);
      setStatus('Preparando a partida online...');
    };
    const onRoomJoined = (event) => {
      setRole('guest');
      setMultiplayerReady(true);
      setStatus('Adversário encontrado.');
    };
    const onGameStart = () => {
      setMultiplayerReady(true);
      setStatus('Oponente conectado. Inicie quando estiver pronto.');
      gameRef.current = createGameState();
      setPhase('ready');
    };
    const onGameSync = (event) => {
      const data = event.detail.data;
      const game = gameRef.current;
      if (sdk.role === 'host' && data.startRequested) {
        beginCountdownRef.current?.();
        return;
      }
      if (sdk.role === 'host' && data.resumeRequested) {
        setPhase('playing');
        return;
      }

      if (data.y !== undefined) game.opponentY = data.y;
      if (sdk.role === 'host' && event.detail.senderId) game.opponentId = event.detail.senderId;
      if (sdk.role === 'guest' && data.ballX !== undefined) {
        game.ballX = data.ballX;
        game.ballY = data.ballY;
        game.playerScore = data.playerScore;
        game.opponentScore = data.opponentScore;
        if (data.phase === 'countdown') {
          setCountdown(data.countdown);
          setPhase('countdown');
        } else if (data.phase === 'playing') {
          setStatus('');
          setPhase('playing');
        } else if ((data.phase === 'point' || data.phase === 'finished') && game.pointId !== data.pointId) {
          game.pointId = data.pointId;
          setPointMessage(data.pointWinner === 'guest' ? 'Ponto para você!' : 'Ponto para o oponente');
          if (data.phase === 'finished') {
            reportedRef.current = true;
            const guestWon = data.pointWinner === 'guest';
            setResult(guestWon ? 'Você venceu!' : 'O oponente venceu');
          }
          setPhase(data.phase);
        }
      }
    };

    const onPlayerLeft = (event) => {
      const { username, reason } = event.detail || {};
      const wasPlaying = phaseRef.current === 'playing' || phaseRef.current === 'countdown' || phaseRef.current === 'point';
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
    if (!active && phase !== 'ready') setPhase('ready');
  }, [active]);

  useEffect(() => {
    if (phase !== 'countdown' || !active || role === 'guest') return undefined;
    const game = gameRef.current;
    sdk.sendGameInput({
      phase: countdown === 0 ? 'playing' : 'countdown',
      countdown,
      ballX: game.ballX,
      ballY: game.ballY,
      playerScore: game.playerScore,
      opponentScore: game.opponentScore,
    });
    if (countdown === 0) {
      setPhase('playing');
      return undefined;
    }

    const timerId = window.setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => window.clearTimeout(timerId);
  }, [active, countdown, phase, role, sdk]);

  useEffect(() => {
    if (!active || (phase !== 'playing' && phase !== 'countdown')) return undefined;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    let frameId;
    let previousTime = 0;

    function render() {
      const game = gameRef.current;
      context.fillStyle = '#164b3a';
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = 'rgba(255,255,255,0.035)';
      for (let stripe = 0; stripe < 8; stripe += 1) {
        if (stripe % 2 === 0) context.fillRect(stripe * 100, 0, 100, HEIGHT);
      }
      context.strokeStyle = 'rgba(245,255,240,0.65)';
      context.lineWidth = 2;
      context.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
      context.setLineDash([8, 10]);
      context.beginPath();
      context.moveTo(WIDTH / 2, 12);
      context.lineTo(WIDTH / 2, HEIGHT - 12);
      context.stroke();
      context.setLineDash([]);

      const leftPaddleY = sdk.role === 'guest' ? game.opponentY : game.playerY;
      const rightPaddleY = sdk.role === 'guest' ? game.playerY : game.opponentY;
      context.fillStyle = '#d3f36b';
      context.fillRect(LEFT_PADDLE_X, leftPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
      context.fillStyle = '#ff8068';
      context.fillRect(RIGHT_PADDLE_X, rightPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(game.ballX, game.ballY, BALL_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.font = '500 25px "DM Mono", monospace';
      context.textAlign = 'center';
      const localScore = sdk.role === 'guest' ? game.opponentScore : game.playerScore;
      const opponentScore = sdk.role === 'guest' ? game.playerScore : game.opponentScore;
      context.fillText(`${localScore}     ${opponentScore}`, WIDTH / 2, 52);
    }

    function tick(time) {
      const game = gameRef.current;
      const delta = previousTime ? Math.min((time - previousTime) / (1000 / 60), 2) : 1;
      previousTime = time;

      if (phase === 'playing' && (sdk.role === 'host' || sdk.role === 'solo')) {
        game.ballX += game.ballDX * delta;
        game.ballY += game.ballDY * delta;

        if (game.ballY - BALL_RADIUS <= COURT_TOP) {
          game.ballY = COURT_TOP + BALL_RADIUS;
          game.ballDY = Math.abs(game.ballDY);
        } else if (game.ballY + BALL_RADIUS >= COURT_BOTTOM) {
          game.ballY = COURT_BOTTOM - BALL_RADIUS;
          game.ballDY = -Math.abs(game.ballDY);
        }

        const overlapsLeftPaddle = game.ballY + BALL_RADIUS >= game.playerY
          && game.ballY - BALL_RADIUS <= game.playerY + PADDLE_HEIGHT;
        const overlapsRightPaddle = game.ballY + BALL_RADIUS >= game.opponentY
          && game.ballY - BALL_RADIUS <= game.opponentY + PADDLE_HEIGHT;

        if (game.ballDX < 0
          && game.ballX - BALL_RADIUS <= LEFT_PADDLE_X + PADDLE_WIDTH
          && game.ballX + BALL_RADIUS >= LEFT_PADDLE_X
          && overlapsLeftPaddle) {
          game.ballX = LEFT_PADDLE_X + PADDLE_WIDTH + BALL_RADIUS;
          game.ballDX = Math.abs(game.ballDX);
        } else if (game.ballDX > 0
          && game.ballX + BALL_RADIUS >= RIGHT_PADDLE_X
          && game.ballX - BALL_RADIUS <= RIGHT_PADDLE_X + PADDLE_WIDTH
          && overlapsRightPaddle) {
          game.ballX = RIGHT_PADDLE_X - BALL_RADIUS;
          game.ballDX = -Math.abs(game.ballDX);
        }

        if (sdk.role === 'solo') {
          const target = game.ballY - PADDLE_HEIGHT / 2;
          game.opponentY += (target - game.opponentY) * 0.08 * delta;
        }

        let pointWinner = null;
        if (game.ballX - BALL_RADIUS <= COURT_LEFT) {
          game.opponentScore += 1;
          pointWinner = 'guest';
        } else if (game.ballX + BALL_RADIUS >= COURT_RIGHT) {
          game.playerScore += 1;
          pointWinner = 'host';
        }

        if (pointWinner) {
          game.pointId += 1;
          resetBall(game);
          const matchFinished = game.playerScore >= 5 || game.opponentScore >= 5;
          const localPlayerWon = sdk.role === 'solo'
            ? pointWinner === 'host'
            : pointWinner === 'host';
          const nextPhase = matchFinished ? 'finished' : 'point';
          game.phase = nextPhase;
          setPointMessage(pointWinner === 'host' ? 'Ponto para você!' : 'Ponto para o oponente');

          if (matchFinished) {
            reportedRef.current = true;
            setResult(localPlayerWon ? 'Você venceu!' : 'O oponente venceu');
            if (sdk.role !== 'solo') {
              const winnerId = pointWinner === 'host' ? playerId : game.opponentId;
              if (winnerId) sdk.reportMatchEnd(winnerId);
            }
          }

          sdk.sendGameInput({
            ballX: game.ballX,
            ballY: game.ballY,
            playerScore: game.playerScore,
            opponentScore: game.opponentScore,
            phase: nextPhase,
            pointId: game.pointId,
            pointWinner,
          });
          setPhase(nextPhase);
        } else if (sdk.role !== 'solo') {
          sdk.sendGameInput({
            ballX: game.ballX,
            ballY: game.ballY,
            playerScore: game.playerScore,
            opponentScore: game.opponentScore,
            phase: 'playing',
          });
        }
      }

      render();
      if (phase === 'countdown' || (phase === 'playing' && !reportedRef.current)) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    render();
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [active, phase, playerId, sdk]);

  function resetBall(game) {
    game.ballX = WIDTH / 2;
    game.ballY = HEIGHT / 2;
    game.ballDX = -game.ballDX;
    game.ballDY = game.ballDY > 0 ? 4 : -4;
  }

  function startSolo() {
    sdk.role = 'solo';
    setRole('solo');
    setStatus('');
    beginCountdown();
  }

  function startMultiplayer() {
    if (sdk.role === 'guest') {
      sdk.sendGameInput({ startRequested: true });
      setStatus('Pedido de início enviado ao anfitrião.');
      return;
    }
    beginCountdown();
  }

  function continueAfterPoint() {
    if (sdk.role === 'guest') {
      sdk.sendGameInput({ resumeRequested: true });
      setStatus('Aguardando o anfitrião retomar a partida...');
      return;
    }
    setPhase('playing');
    setStatus('');
  }

  function movePaddle(event) {
    const canvas = canvasRef.current;
    if (!canvas || phase !== 'playing') return;
    const bounds = canvas.getBoundingClientRect();
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT - PADDLE_HEIGHT / 2;
    gameRef.current.playerY = Math.max(12, Math.min(HEIGHT - PADDLE_HEIGHT - 12, y));
    if (sdk.role !== 'solo') sdk.sendGameInput({ y: gameRef.current.playerY });
  }

  return (
    <div className="pong-view">
      <div className="arena">
        <canvas
          className={`pong-canvas ${phase !== 'ready' ? 'visible' : ''}`}
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerMove={movePaddle}
          aria-label="Mesa de Pong. Mova o cursor para controlar sua raquete."
        />
        {phase === 'playing' && <div className="game-hint">Mova o cursor para controlar a raquete</div>}

        {phase === 'opponent_left' && (
          <OpponentLeftDialog
            opponentName={opponentLeftInfo?.opponentName}
            wonByForfeit={opponentLeftInfo?.wonByForfeit}
            reason={opponentLeftInfo?.reason}
            onPlayAgain={() => {
              setOpponentLeftInfo(null);
              sdk.role = null;
              setRole(null);
              setPhase('ready');
              setStatus('Use a fila rápida ou convide um amigo na biblioteca para jogar online.');
            }}
            onExitToHub={onExitToHub}
            status={status}
          />
        )}

        {phase === 'finished' && (
          <GameEndDialog
            kicker="01 / ARCADE"
            title={result}
            message={`Placar final: ${sdk.role === 'guest' ? gameRef.current.opponentScore : gameRef.current.playerScore}–${sdk.role === 'guest' ? gameRef.current.playerScore : gameRef.current.opponentScore}`}
            onPlayAgain={sdk.role === 'solo' ? startSolo : () => {
              sdk.role = null;
              setRole(null);
              setPhase('ready');
              setStatus('Use a fila rápida ou convide um amigo na biblioteca para jogar online.');
            }}
            onExitToHub={onExitToHub}
            status={status}
          />
        )}

        {phase === 'point' && (
          <GameDialog
            kicker="01 / ARCADE"
            title={pointMessage}
            message={`Placar: ${sdk.role === 'guest' ? gameRef.current.opponentScore : gameRef.current.playerScore}–${sdk.role === 'guest' ? gameRef.current.playerScore : gameRef.current.opponentScore}`}
            primaryAction={{
              label: 'Continuar sem contagem',
              onClick: continueAfterPoint,
            }}
          />
        )}

        {phase === 'countdown' && (
          <GameDialog kicker="01 / ARCADE" title="Prepare-se">
            <div className="countdown-number">{countdown}</div>
          </GameDialog>
        )}

        {phase === 'ready' && (
          <GameDialog
            kicker="01 / ARCADE"
            title={role === 'host' || role === 'guest' ? 'Partida pronta?' : 'Antes de começar'}
            message={role === 'host' || role === 'guest' ? 'A contagem começa quando alguém iniciar.' : 'Prepare-se para entrar na quadra.'}
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
            additionalActions={role === 'host' || role === 'guest' ? [] : [
              { label: 'Buscar jogador', onClick: () => onFindOpponent?.('pong') },
              { label: 'Convidar amigo', onClick: () => onInviteFriend?.('pong') },
            ]}
          />
        )}
      </div>
    </div>
  );
}
