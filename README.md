# Space Shooter 3D

Jogo arcade 3D procedural para navegador desktop e celular, criado com TypeScript, Three.js e Vite.

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
| Escape ou botão Ⅱ | Pausar / continuar |

Em telas de toque, arraste para pilotar, mantenha um dedo na área de jogo para acelerar e dois dedos para frear. O laser dispara automaticamente durante a partida. O botão Ⅱ permite pausar e acessar a opção de abortar a missão. A área de jogo bloqueia seleção de texto e gestos de rolagem enquanto recebe os toques.

Os parâmetros de voo, combate, progressão, geração e efeitos ficam em `src/config.ts`. A semente inicial é `CONFIG.seed`.

A câmera acompanha gradualmente a orientação da nave. Cada inimigo patrulha uma região própria, detecta a nave a 105 unidades e abandona a perseguição a 170 unidades; esses limites podem ser ajustados em `CONFIG.enemy`. Os lasers convergem a 85 unidades para facilitar a mira na faixa usual de combate.

## Coordenadas e universo estável

O jogo conserva a posição global da nave em `src/spatial.ts` mesmo quando recentraliza a cena para manter a precisão visual. A interface mostra essa posição com três sigilos vetoriais fixos: espiral tripla vermelha, nó entrelaçado verde e runa triangular azul. Eles usam uma base inclinada e reversível; nenhum sigilo corresponde isoladamente ao eixo vertical interno. A leitura na interface é arredondada à unidade, enquanto o cálculo conserva frações.

`src/regions.ts` determina atributos regionais contínuos e locais de asteroides e névoas a partir da coordenada global e de `CONFIG.seed`. `World` carrega apenas as células próximas; ao revisitar uma região na mesma partida, os locais e formatos são reproduzidos. Asteroides destruídos permanecem destruídos até a próxima missão. As névoas podem aparecer ovais ou achatadas. Estrelas e galáxias distantes continuam como fundo visual.

`spatialRelation` fornece direção e distância para futuras tags de chefões e jogadores. `AnchorRegistry` guarda pontos globais nomeados, com identificadores para naves-mãe, estações e pares de portais. Esses objetos e tags ainda não são instanciados no jogo. Os atributos regionais estão prontos para receber as regras dos biomas.

O título provisório é **Space Shooter 3D**. As decisões P1–P12 da especificação original foram tratadas como valores iniciais: inclinação visual automática, cursor livre, velocidade mínima positiva, vida máxima de 200 para a nave Caos, inimigos introduzidos progressivamente e laser reiniciado no nível 1. O visual segue arcade neon.

## Trilha sonora

Durante a partida, o jogo reproduz `src/assets/neon-urgency.mp3` em loop. A gravação enviada como referência é a trilha principal; a síntese procedural anterior não é reproduzida. Velocidade, fase, vida, disparos e inimigos próximos ajustam discretamente o volume e o brilho da faixa, sem mudar seu ritmo ou afinação. A música pausa junto com o jogo e recomeça do início em uma nova missão. O botão ♪ silencia ou reativa música e efeitos sonoros juntos.

## Pontuação e hangar

Interceptadores valem 100 pontos, caças 175 e bombardeiros 300, multiplicados pelo número da fase no momento da destruição. Asteroides valem 25 pontos e power-ups coletados valem 50 pontos, sem multiplicador de fase. Ao fim de cada partida, o high-score é atualizado e cada 1.000 pontos completos da partida geram 1 ponto de entropia. Compras, seleção, high-score e pontos de entropia são salvos no armazenamento local do navegador, no mesmo domínio da hospedagem.

| Item | Entropia | Efeito |
| --- | ---: | --- |
| Tech / Caos | 0 | Selecionados desde o início |
| Espacial / GBL / Trovão | 10 cada | Cores estéticas |
| Brasil / Militar / Patricinha | 15 cada | Padrões de três cores |
| Neon rubro / clube / ouro / cobre / ultravioleta | 25 cada | Acabamentos com emissão de luz |
| Vespa | 80 | Velocidade máxima 75, giro 30% mais rápido |
| Flecha | 80 | Velocidade máxima 120, giro 30% mais lento |
| Tanque | 80 | Vida 200 + 200 extras, cura +50, dano e cadência pela metade, 5 escudos |
| Dominadora | 80 | Vida 75 + 50 extras, dano e cadência em dobro, laser até 25 |
| Suprema | 240 | Vida 150 + 150 extras, velocidade 110, giro +20%, dano e cadência ×1,5, laser até 30, 4 escudos |
| Rinoceronte | 360 | Atributos da Suprema, blindagem 10 e escudos com 6 segundos de proteção |
| Leopardo | 360 | Atributos da Suprema, blindagem 5, velocidade 120 e giro +40% |
| Harpia | 360 | Atributos da Suprema, blindagem 5, cadência ×2 e disparos simultâneos de quatro pontas |

No **Hangar**, os botões largos percorrem as naves e os estreitos percorrem as cores. A prévia 3D mostra a combinação sobre uma plataforma giratória. Nave e cor adquiridas são equipadas ao selecioná-las; itens ainda bloqueados exibem botões de compra.

Cada nave possui oito melhorias permanentes e independentes, com até cinco níveis por atributo. Os níveis custam 8, 16, 32, 64 e 128 pontos de entropia. Cada nível adiciona: +5 de velocidade máxima; +6% de manobrabilidade; +8% de vida normal e extra; +1 de blindagem; +10% de dano; +10% de cadência; +1 slot de escudo; ou +1 nível máximo de laser, conforme o atributo escolhido. Melhorias só podem ser compradas para naves já adquiridas. Todas as naves antigas começam com blindagem 0. Para blindagem X, o dano recebido cai X% (até 80%) e depois perde mais 1,5^X pontos, sem ficar negativo; blindagem 0 deixa o dano inalterado.

O power-up de escudo é ciano. Cada escudo absorve por completo uma ocorrência de dano e concede três segundos de invulnerabilidade, ou seis segundos na Rinoceronte, indicados por uma névoa ciano cintilante ao redor da nave. A partida retorna automaticamente ao menu inicial após a destruição da nave. Ao pausar, é possível abortar a missão com confirmação; a pontuação ainda entra no high-score e gera pontos de entropia normalmente.

O limite de escudos varia conforme a nave: 5 para Tanque, 4 para Suprema, Rinoceronte, Leopardo e Harpia, e 3 para as demais. A partir da fase 5 podem aparecer a lança-mina, que foge e deixa minas destrutíveis com laser; o martelo, que tenta se chocar com o jogador e tem quatro vezes a vida base; e a perseguidora, que acelera até 100 unidades por segundo. Eles valem 220, 400 e 260 pontos base, respectivamente, multiplicados pela fase. Naves inimigas desviam umas das outras e dos asteroides durante a patrulha e o combate. Pequenas galáxias difusas ficam bem distantes no fundo do universo, com paralaxe discreta e sem possibilidade de alcançá-las.

Os asteroides se movem lentamente em torno de posições globais reproduzíveis e giram de forma independente. Alguns têm o dobro da largura em um eixo; ao quebrar, se dividem em dois asteroides normais que se afastam lentamente em direções opostas. Cada quebra vale os mesmos 25 pontos fixos de asteroide.

## Recursos de teste — remover na versão final

Os cheats continuam disponíveis sem botões visíveis. No Hangar, toque ou clique **cinco vezes rapidamente no número de pontos de entropia** para abrir a entrada do código `ENTROPIA5000` (+5.000 pontos por uso). Com a partida pausada, toque ou clique **cinco vezes rapidamente no título PAUSADO** para usar `FASE+1`, `PROXIMAFASE` ou `FASE5` (qualquer fase posterior até 100). O contador de eliminações reais permanece intacto.

Toda a ativação está sinalizada por `DEV CHEATS` em `src/main.ts` e controlada por `DEV_CHEATS_ENABLED` em `src/devCheats.ts`. Para a versão final, altere a constante para `false` e remova o módulo e os blocos marcados.
