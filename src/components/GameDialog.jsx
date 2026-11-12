import React from 'react';

/**
 * Componente padrão do Hub para modais e diálogos de jogos.
 * Usado para: Lobby de salas, Fim de Partida, Notificação de Oponente Kitado e Voltar ao Hub.
 */
export default function GameDialog({
  kicker,
  title,
  message,
  status,
  primaryAction,
  secondaryAction,
  additionalActions = [],
  onBackToHub,
  children,
}) {
  const hasActions = Boolean(primaryAction || secondaryAction || additionalActions.length);

  return (
    <div className="game-modal-backdrop">
      <section className="game-dialog" role="dialog" aria-modal="true" aria-live="polite">
        {kicker && <span className="lobby-mark">{kicker}</span>}
        {title && <h2>{title}</h2>}
        {message && <p>{message}</p>}

        {children}

        {hasActions && (
          <div className={`lobby-actions ${additionalActions.length ? 'game-mode-actions' : ''}`}>
            {primaryAction && (
              <button
                type="button"
                className="primary-button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
              >
                {primaryAction.label}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                className="secondary-button"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled}
              >
                {secondaryAction.label}
              </button>
            )}
            {additionalActions.map(action => (
              <button key={action.label} type="button" className={action.className || 'secondary-button'} onClick={action.onClick} disabled={action.disabled}>
                {action.label}
              </button>
            ))}
          </div>
        )}

        {status && <div className="room-status" role="status">{status}</div>}
        {onBackToHub && (
          <div className="game-dialog-back">
            <button type="button" className="game-back-button" onClick={onBackToHub}>
              <span aria-hidden="true">←</span> Voltar ao Hub
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Diálogo padrão quando o oponente kita/desconecta da partida em andamento ou do lobby.
 */
export function OpponentLeftDialog({
  opponentName,
  wonByForfeit = false,
  reason = 'disconnected',
  onPlayAgain,
  onExitToHub,
  status,
}) {
  const title = wonByForfeit
    ? 'Vitória por Desistência!'
    : 'Oponente Saiu da Partida';

  const defaultMsg = wonByForfeit
    ? `O oponente ${opponentName || ''} ${reason === 'disconnected' ? 'desconectou' : 'abandonou a partida'}. Você venceu!`
    : `O oponente ${opponentName || ''} saiu da sala.`;

  return (
    <GameDialog
      kicker="OPONENTE SAIU"
      title={title}
      message={defaultMsg}
      status={status}
      primaryAction={onPlayAgain ? {
        label: 'Criar Nova Partida',
        onClick: onPlayAgain,
      } : null}
      secondaryAction={onExitToHub ? {
        label: 'Voltar ao Hub',
        onClick: onExitToHub,
      } : null}
    />
  );
}

/**
 * Diálogo padrão de Fim de Partida.
 */
export function GameEndDialog({
  kicker = 'FIM DE PARTIDA',
  title = 'Partida Encerrada',
  message,
  status,
  onPlayAgain,
  onExitToHub,
  playAgainLabel = 'Jogar Novamente',
  exitLabel = 'Voltar ao Hub',
  children,
}) {
  return (
    <GameDialog
      kicker={kicker}
      title={title}
      message={message}
      status={status}
      primaryAction={onPlayAgain ? {
        label: playAgainLabel,
        onClick: onPlayAgain,
      } : null}
      secondaryAction={onExitToHub ? {
        label: exitLabel,
        onClick: onExitToHub,
      } : null}
    >
      {children}
    </GameDialog>
  );
}
