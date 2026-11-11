import React from 'react';
import PongGame from './pong/PongGame.jsx';
import ChessGame from './chess/ChessGame.jsx';
import DamasGame from './damas/DamasGame.jsx';
import DominoGame from './domino/DominoGame.jsx';
import { DominoArt } from './domino/DominoTile.jsx';

export const GAMES_CATALOG = [
  {
    id: 'pong',
    number: '001',
    title: 'Pong',
    category: 'Arcade',
    players: '1–2 jogadores',
    description: 'Reflexos rápidos. Disputa direta. Uma mesa clássica, pronta para jogar.',
    meta: 'Partidas de 5 pontos',
    renderArt: () => (
      <span className="court">
        <span className="court-paddle left" />
        <span className="court-paddle right" />
        <span className="court-ball" />
      </span>
    ),
    component: PongGame,
  },
  {
    id: 'chess',
    number: '002',
    title: 'Xadrez Clássico',
    category: 'Estratégia',
    players: '1–2 jogadores',
    description: 'Batalha tática no tabuleiro 8x8. Jogue solo contra a IA ou dispute em tempo real pela fila rápida ou por convite.',
    meta: 'Partidas com ranking',
    renderArt: () => (
      <div className="chess-art-board" aria-hidden="true">
        <div className="chess-art-square light">♜</div>
        <div className="chess-art-square dark">♞</div>
        <div className="chess-art-square light">♝</div>
        <div className="chess-art-square dark">♛</div>
        <div className="chess-art-square dark">♟</div>
        <div className="chess-art-square light">♟</div>
        <div className="chess-art-square dark">♟</div>
        <div className="chess-art-square light">♟</div>
        <div className="chess-art-square light"></div>
        <div className="chess-art-square dark"></div>
        <div className="chess-art-square light"></div>
        <div className="chess-art-square dark"></div>
        <div className="chess-art-square dark">♙</div>
        <div className="chess-art-square light">♙</div>
        <div className="chess-art-square dark">♘</div>
        <div className="chess-art-square light">♔</div>
      </div>
    ),
    component: ChessGame,
  },
  {
    id: 'damas',
    number: '003',
    title: 'Jogo de Damas',
    category: 'Clássico',
    players: '1–2 jogadores',
    description: 'Saltos estratégicos e capturas em cadeia. Coroe suas damas e domine o tabuleiro.',
    meta: 'Partidas clássicas de 12 peças',
    renderArt: () => (
      <div className="damas-art-board" aria-hidden="true">
        <div className="damas-art-square light" />
        <div className="damas-art-square dark">
          <div className="damas-art-piece black" />
        </div>
        <div className="damas-art-square light" />
        <div className="damas-art-square dark">
          <div className="damas-art-piece black">👑</div>
        </div>

        <div className="damas-art-square dark">
          <div className="damas-art-piece black" />
        </div>
        <div className="damas-art-square light" />
        <div className="damas-art-square dark" />
        <div className="damas-art-square light" />

        <div className="damas-art-square light" />
        <div className="damas-art-square dark">
          <div className="damas-art-piece white" />
        </div>
        <div className="damas-art-square light" />
        <div className="damas-art-square dark" />

        <div className="damas-art-square dark">
          <div className="damas-art-piece white">👑</div>
        </div>
        <div className="damas-art-square light" />
        <div className="damas-art-square dark">
          <div className="damas-art-piece white" />
        </div>
        <div className="damas-art-square light" />
      </div>
    ),
    component: DamasGame,
  },
  {
    id: 'domino',
    number: '004',
    title: 'Dominó',
    category: 'Clássico',
    players: '1–4 jogadores',
    description: 'Encaixe as peças, bloqueie os adversários e bata primeiro! Jogue contra a IA, com amigos no mesmo aparelho ou online.',
    meta: 'Duplo-seis · até 4 na mesa',
    renderArt: () => <DominoArt />,
    component: DominoGame,
  },
];
