# Space Shooter 3D

Jogo arcade 3D procedural para navegador desktop, criado com TypeScript, Three.js e Vite.

## Jogar com a compilação incluída

Com Node.js instalado, execute `node server.mjs` e abra `http://127.0.0.1:4173/` no navegador. A pasta `dist/` já contém a versão compilada.

## Executar

```bash
npm install
npm run dev
```

## Controles

| Entrada | Ação |
| --- | --- |
| Movimento do mouse | Pilotar livremente em 3D |
| Botão esquerdo | Acelerar |
| Botão direito | Frear |
| Botão central + movimento | Orbitar a câmera |
| Espaço | Disparar continuamente |
| Escape | Pausar / continuar |

Em telas de toque, arraste para pilotar, mantenha um dedo na área de jogo para acelerar e dois dedos para frear. O laser dispara automaticamente durante a partida. A área de jogo bloqueia seleção de texto e gestos de rolagem enquanto recebe os toques.

Os parâmetros de voo, combate, progressão, geração e efeitos ficam em `src/config.ts`. A semente inicial é `CONFIG.seed`.

A câmera acompanha gradualmente a orientação da nave. Cada inimigo patrulha uma região própria, detecta a nave a 105 unidades e abandona a perseguição a 170 unidades; esses limites podem ser ajustados em `CONFIG.enemy`. Os lasers convergem a 85 unidades para facilitar a mira na faixa usual de combate.

O título provisório é **Space Shooter 3D**. As decisões P1–P12 da especificação original foram tratadas como valores iniciais: inclinação visual automática, cursor livre, velocidade mínima positiva, vida máxima de 200, inimigos introduzidos progressivamente, laser reiniciado no nível 1 e somente efeitos sonoros. O visual segue arcade neon.
