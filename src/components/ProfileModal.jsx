import React, { useEffect, useRef } from 'react';

export default function ProfileModal({ isOpen, profile, isGuest, onClose, onAnonymous, onLogin }) {
  const cardRef = useRef(null);
  useEffect(() => {
    if (isOpen) cardRef.current?.querySelector('button')?.focus();
  }, [isOpen]);
  if (!isOpen) return null;
  function handleKeyDown(event) {
    event.stopPropagation();
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') {
      const buttons = cardRef.current.querySelectorAll('button');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  return <div className="game-modal-backdrop account-modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown}>
    <section ref={cardRef} className="game-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={event => event.stopPropagation()}>
      <div className="profile-modal-heading"><h2 id="profile-title">Seu perfil</h2><button type="button" className="chat-close-btn" onClick={onClose} aria-label="Fechar perfil">✕</button></div>
      <div className="profile-row">
        <div className="profile-user-group">
          <div className="user-avatar-circle">{profile.avatar_url || profile.avatarUrl ? <img src={profile.avatar_url || profile.avatarUrl} alt="" /> : <span>{(profile.name || 'P')[0].toUpperCase()}</span>}</div>
          <div><div className="user-info">{profile.name}</div><div className="rank-info">{isGuest ? 'Jogando como visitante' : 'Conta conectada'}</div></div>
        </div>
      </div>
      <p>Vitórias: {profile.wins ?? 0} · Derrotas: {profile.losses ?? 0}</p>
      <div className="lobby-actions">
        <button type="button" className="secondary-button" onClick={onAnonymous}>{isGuest ? 'Continuar anonimamente' : 'Jogar anonimamente'}</button>
        <button type="button" className="primary-button" onClick={onLogin}>{isGuest ? 'Entrar com uma conta' : 'Trocar conta'}</button>
      </div>
    </section>
  </div>;
}
