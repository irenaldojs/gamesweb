import React, { useState } from 'react';

export default function GoogleLoginModal({ isOpen, onClose, onLogin }) {
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');

  if (!isOpen) return null;

  function handleQuickGoogleLogin(presetName, presetEmail, avatarSeed) {
    const googleId = `g_${Math.floor(10000000 + Math.random() * 90000000)}`;
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed || presetName}`;
    onLogin({
      googleId,
      name: presetName,
      email: presetEmail,
      avatarUrl,
    });
    onClose();
  }

  function handleCustomLogin(e) {
    e.preventDefault();
    if (!customName.trim()) return;
    const email = customEmail.trim() || `${customName.toLowerCase().replace(/\s+/g, '')}@gmail.com`;
    const googleId = `g_${Math.floor(10000000 + Math.random() * 90000000)}`;
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${customName}`;
    onLogin({
      googleId,
      name: customName.trim(),
      email,
      avatarUrl,
    });
    onClose();
  }

  return (
    <div className="game-modal-backdrop account-modal-backdrop" onClick={onClose} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Entrar com conta de demonstração" className="game-dialog google-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="google-modal-header">
          <div className="google-logo-wrapper">
            <svg viewBox="0 0 24 24" width="28" height="28">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          </div>
          <div>
            <span className="lobby-mark">CONTA DE DEMONSTRAÇÃO</span>
            <h2>Entrar com uma conta</h2>
          </div>
          <button className="chat-close-btn" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        <p style={{ margin: '8px 0 16px', color: 'var(--muted)', fontSize: '0.88rem' }}>
          Este projeto usa contas de demonstração. O acesso abaixo simula um login e não autentica uma conta Google real.
        </p>

        {/* Contas rápidas com 1 clique para facilitar testes */}
        <div className="google-quick-accounts">
          <div className="panel-heading" style={{ marginBottom: '8px' }}>Escolha ou simule sua conta Google:</div>
          <button
            type="button"
            className="google-account-pill"
            onClick={() => handleQuickGoogleLogin('Carlos Dev', 'carlos.dev@gmail.com', 'carlos')}
          >
            <span className="google-avatar-icon">👨‍💻</span>
            <div className="google-account-text">
              <strong>Carlos Dev</strong>
              <span>carlos.dev@gmail.com</span>
            </div>
            <span className="account-arrow">→</span>
          </button>

          <button
            type="button"
            className="google-account-pill"
            onClick={() => handleQuickGoogleLogin('Mariana Gamer', 'mari.gamer@gmail.com', 'mariana')}
          >
            <span className="google-avatar-icon">🎮</span>
            <div className="google-account-text">
              <strong>Mariana Gamer</strong>
              <span>mari.gamer@gmail.com</span>
            </div>
            <span className="account-arrow">→</span>
          </button>
        </div>

        {/* Ou informe seus dados Google personalizados */}
        <form onSubmit={handleCustomLogin} style={{ marginTop: '16px' }}>
          <div className="panel-heading" style={{ marginBottom: '8px' }}>Ou use seu nome / email:</div>
          <input
            type="text"
            placeholder="Seu Nome Completo"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            style={{ marginBottom: '8px' }}
          />
          <input
            type="email"
            placeholder="seu.email@gmail.com (opcional)"
            value={customEmail}
            onChange={(e) => setCustomEmail(e.target.value)}
            style={{ marginBottom: '12px' }}
          />
          <button
            type="submit"
            className="primary-button"
            style={{ width: '100%' }}
            disabled={!customName.trim()}
          >
            Entrar na conta de demonstração
          </button>
        </form>
      </div>
    </div>
  );
}
