# Progresso do "Prompt Mestre" — onde parei

Última atualização: 25/10/2026. Repositório: https://github.com/adielson2005/threadbound
(trabalho no branch `claude/elegant-clarke-dh6h2t`, PR #1 para a `main`).
Ponto de restauração anterior a tudo isto: tag `restauro-antes-reconstrucao`.

## Resumo para retomar

**Todas as fases foram implementadas e testadas no navegador do PC (Chromium sem GPU) e em
emulação de celular.** O que falta depende de um aparelho de verdade: medir FPS num Android modesto
(FASE 12) e ajustar a partir do que aparecer lá. A lista exata está no fim deste arquivo.

## Situação de cada fase

| Fase | Situação | O que foi feito / o que falta |
|---|---|---|
| 1. Engine | ✅ feito | Three.js 0.165 mantido: roda no navegador, inclusive no celular; as limitações eram de conteúdo, não da engine. |
| 2. Mapa | ✅ feito | Arquipélago gerado por código (`ilha.js`, `casas.js`) para cada capítulo (`capitulo.js`). Cap. 1: ilha principal de ~230 m, morro em terraços, florestas variadas, vila com 5 casas onde dá para entrar e uma praça com poço, varal, barris, caixotes e carroça, enseada de areia com cais, farol, ruínas, pomar e **duas áreas secretas** (a Gruta dos Recados, escondida no morro da floresta, e o mirante no alto do farol, por uma escada em espiral), cada uma com uma carta. |
| 3. Renderização / FPS | ✅ feito | Frustum culling, setores de vegetação com nível leve, instancing, lotes estáticos, distância de desenho, qualidade adaptativa e resolução dinâmica. **Novos:** occlusion culling na CPU (`oclusao.js`: setores e blocos de terreno escondidos pelo relevo; −11% a −24% de chamadas de desenho onde o morro esconde algo, ~0,2 ms por quadro) e texturas **KTX2** da boneca e da cachoeira (`texturas.js`, geradas por `ferramentas/gerar-ktx2.sh`; ~4× menos memória de vídeo). **Falta:** medir FPS num Android modesto. |
| 4. Boneca | ✅ feito (pela escolha do usuário) | Mantida a boneca original, com animações melhoradas: corrida sem deslizar os pés, inclinação ao acelerar e nas curvas, cabeça que olha o que está perto. **Novos:** gestos de quem espera parada (olhar em volta, trocar o peso de perna, espreguiçar), andar devagar (segurar X), virada com velocidade limitada e passinhos no lugar. Corrigido um acúmulo de rotação nos ossos que a animação parada não anima. A boneca refeita por código segue em `?boneca=costurada`. |
| 5. Hitboxes | ✅ feito | Cápsula da Brisa; hitbox elipsoide do corpo dos Retalhos (investida, golpes e empurrão); golpes, investidas, "acalmar" e a visão dos Retalhos exigem linha de visão livre; Retalhos andam em passos curtos e não entram em paredes. Testado de 6 a 90 m/s contra as paredes e em 400 quedas a 40 m/s. |
| 6. Dia/noite e chuva | ✅ feito | Ciclo de dia e noite, sol e lua refeitos, chuva na GPU com som, trovão e relâmpago (tecla Y). Cada capítulo tem clima e tom de céu próprios (garoa sem fim no Recife). Temporizador de jogabilidade removido. |
| 7. Interface | ✅ feito | HUD artesanal. **Novos (celular):** fala, dica e aviso de interação nunca ficam por baixo dos botões de toque (retrato e paisagem), engrenagem com 44 px, dicas que falam dos botões de toque, correr arrastando o bastão além da borda. |
| 8. Menu e imagem | ✅ feito | Menu com a capa original (`assets/menu/capa.jpg`), Continuar (abre o último capítulo jogado), Novo jogo com confirmação, **Capítulos** (cada um abre quando o anterior termina), Configurações, Gráficos e Créditos. Não há "Sair": o navegador não deixa o jogo fechar a aba. |
| 9. História | ✅ feito (4 capítulos jogáveis) | `docs/ROTEIRO.md` e `src/historia.js`. Cap. 2 — O Recife das Vozes (sinos de boia, cascos com diários de bordo, Tomé e o diário dele); Cap. 3 — O Jardim Submerso (flores de pedra, vila velha com cartas, o jardim de Aurélia, Ilma); Cap. 4 — A Costura Final (chão de retalhos, nós da costura com as vozes dos moradores, Aurélia de névoa, o desfecho). Tela de fim com "Próximo capítulo". |
| 10–11. GitHub | ✅ feito | Um commit por etapa, todos enviados (sem force push). |
| 12. Testes | 🔄 quase tudo | Testado no navegador do PC: os 4 capítulos **jogados do começo ao fim** pela lógica do jogo (fragmentos, guardiões, cristais, os 3 objetivos, o final, a carta, a tela de fim e o desbloqueio), colisões, escada do farol, cartas secretas, KTX2 contra os originais, occlusion culling sem esconder nada visível, gestos da boneca, menu e painéis, layout de toque em emulação de Pixel 5 (retrato e paisagem), sessão longa de memória e console sem erros. **Falta:** um Android de verdade (FPS e toque real). |

## Android e 60 fps no celular

- **APK:** `android/` (Activity em Java com WebView em tela cheia, imersiva, tela sempre ligada,
  deitada) e `ferramentas/gerar-apk.sh` (aapt, javac, dx, zipalign, apksigner). Gera
  `build/Threadbound.apk` (~34 MB, Android 7+, assinatura v2/v3). O conteúdo do APK foi testado no
  Chromium em emulação de celular com a internet bloqueada: nenhum pedido externo, nenhum erro.
- **Offline:** three.js, three-mesh-bvh, meshoptimizer, o transcodificador Basis e as fontes ficam em
  `vendor/` (2,7 MB): o jogo não depende mais de CDN nem do Google Fonts.
- **Boneca 7,8× menor:** `boneca.fbx` de 49,9 MB para 6,4 MB, sem as imagens embutidas que o jogo não
  usava (`ferramentas/fbx-sem-imagens.py`); malha, esqueleto e animações idênticos.
- **Perfil `celular`** (`graficos.js`): meta de 60 fps no ajuste automático (antes 45), física a 60
  passos/s, resolução até 1× do CSS, FXAA no lugar do MSAA, sombra até 1024, texturas até o Medium,
  menos distância e vegetação leve mais perto.
- **Falta:** medir num aparelho de verdade (este ambiente não tem emulador Android nem GPU).

## Visual estilo jogo mobile

- `src/estilo.js`: aplicado de uma vez nos shaders padrão do three.js (Lambert, Standard e Physical),
  então vale para todo o jogo sem passada extra de pós-processamento: luz em faixas suaves (cel
  shading), sombra fria e luz quente, brilho de borda e "vibrance" (realça cores apagadas sem estourar
  as já saturadas). `?estilo=0` desliga.
- Contorno escuro de desenho animado na Brisa (casco invertido com o mesmo esqueleto: um desenho a
  mais, nada de pós-processamento).
- No celular a sombra fixa do mapa passou a existir também no Low (2048, filtro simples): ela é
  calculada uma vez só, então custa só a leitura da textura.
- Céu do dia um pouco mais vivo e sol mais quente.

## Ciclo de gráficos, realismo e otimização mobile (27/10/2026)

Referências usadas como princípios (sem copiar nada): Ugly Witch (cenário bonito com custo
controlado), The First Tree (campo natural, composição, escala) e Sky (atmosfera e profundidade).
Medido no Chromium sem GPU, perfil celular, 6 vistas fixas (mesmo lugar e hora em todas as versões).

**Análise (antes):**
- Visuais: (1) gramado liso e borrado, sem textura nem volume; (2) atmosfera chapada, pouca
  separação entre perto e longe, céu quase sem nuvens, ilhotas sumindo no horizonte no celular;
  (3) copas de árvore tampando a tela quando a câmera entra na floresta.
- Técnicos: (1) 17% da CPU em `getProgramInfoLog` e shaders compilando no meio do jogo
  (travadinhas); (2) 260–570 mil triângulos por quadro, com o mar (42 mil), a praia de baixo (25
  mil) e a Brisa desenhada duas vezes pelo contorno (75 mil); (3) até 182 chamadas de desenho numa
  vista aérea, 67 delas só da vila.

**Feito:**
- Shaders: a conferência síncrona de erros foi desligada (`?debug` religa) e todos os materiais,
  inclusive os escondidos e os fora da câmera, são compilados no carregamento por um quadro de
  aquecimento pelo mesmo caminho do jogo. Resultado: 63 programas prontos ao começar e nenhum
  compilado durante o jogo (antes: 53 + 5 no meio do passeio).
- Geometria: contorno da Brisa numa malha simplificada (25%); no celular, mar com 72×128 em vez de
  110×192 e praia de baixo com 46×120 em vez de 70×180; a vila inteira num lote por material.
  Vista aérea: 182 → 157 chamadas e 260 mil → 209 mil triângulos (um quadro).
- Folhagem perto da câmera some com pontilhado (dither) entre 1,4 e 4,2 m: a floresta e o pôr do sol
  ficam visíveis em vez de uma parede de folhas.
- Névoa por altura (todos os materiais com neblina): uma bruma azulada embaixo das ilhas, que
  flutuam sobre um mar de névoa.
- Chão: textura de grama gerada no carregamento (folhinhas perto da câmera, moitas e capim seco x
  viçoso em escalas grandes), só no chão verde e plano; tufos de capim dobrados num gerador próprio
  (posições de fragmentos, âncoras, casas e inimigos idênticas: os saves continuam valendo).
- Celular: vista até 210 m (neblina 55–195 m) para as ilhotas aparecerem no horizonte; mais nuvens
  no céu do dia.

**Testes:** Capítulos 1 e 4 do começo ao fim no perfil celular (25/25 fragmentos, final e
desbloqueio); layout de toque em retrato e paisagem; sessão de 4 minutos: heap estável em ~193 MB
(antes ~223 MB), programas fixos em 63 e geometrias paradas em ~365 (antes subiam de 131 para 269
durante o passeio: agora tudo sobe para a GPU no carregamento, sem envio no meio do jogo); console
sem erros.

**Limites:** FPS e tempo de quadro de verdade só num celular (aqui não há GPU nem emulador Android).
O efeito de pontilhado aparece como uma trama fina nas folhas que estão saindo da frente da câmera.

## Ciclo 2 de gráficos (27/10/2026)

- Pólen de dia e vaga-lumes piscando à noite, em todos os níveis (`src/particulas.js`): animados
  na GPU, a CPU só atualiza quatro valores por quadro; 120 pontos no celular, uma chamada de
  desenho; somem na chuva e ficam desligados quando o pólen do High está ativo.
- Areia clara com ondulações de vento (no shader do chão, sem textura nova), só na areia clara.
- Pinheiros mais claros (liam como manchas quase pretas); reboco cinza-azulado da vila trocado por
  um tom quente; o frio das sombras ficou mais fraco (deixava cinzas azulados).
- Testes: Capítulos 1 e 2 do começo ao fim no perfil celular (25/25), 66 programas de shader todos
  compilados no carregamento, chamadas e triângulos iguais aos do ciclo anterior, console sem erros.

## Correção de bugs gráficos: manchas brancas, exposição e sombras (28/10/2026)

Evidência: captura do jogo num celular (40 fps) com manchas brancas nas copas, grama ao sol quase
estourada e pontilhado escuro perto da câmera; o pedido citava também uma floresta escura (essa
segunda captura não chegou, então foi reproduzida aqui: a vista "horizonte", fim de tarde na mata).

Causas confirmadas e correções:

- Manchas brancas: ampliando a captura, o branco fica nos cantos dos cartões de folha (quadrados
  recortados pela transparência da textura) e não nas folhas: a textura chegou à GPU sem a
  transparência, com os pixels transparentes brancos. Ela era desenhada num canvas e enviada como
  canvas, caminho em que alguns celulares perdem o alfa (aqui, no PC, o canvas chega certo, por isso
  não aparecia nos testes). Agora todo canvas com transparência vai como pixels crus (DataTexture),
  com o alfa exatamente como desenhado e a cor vazando para os pixels transparentes em volta
  (src/canvasTextura.js). Vale para o atlas da vegetação e para as outras 11 texturas transparentes
  feitas em canvas (brilhos, espuma, respingos, sombra redonda dos personagens, reflexos de lente,
  pólen), que no mesmo aparelho virariam quadrados. Canvas opaco continua como antes.
- Pontilhado escuro perto da câmera (corrigido na rodada anterior): no celular e no PC fraco a
  folhagem colada na câmera e a "janela" até a Brisa somem com corte seco.
- Exposição: o Low e o Medium não tinham tone mapping. Com o sol a 3,1, a grama clara ao sol passava
  do branco e era cortada. Medido nas 6 vistas de referência (perfil celular), pixels estourados:
  praia 62,9%, morro 21,2%, vila 7,2%, aérea 5,0%. Agora: tone mapping Neutral (Khronos) sem a curva
  de pé (o original também afunda os escuros e deixava a mata mais preta: 24% de quase preto no
  horizonte em vez de 15%), que só comprime acima de ~76% do branco. Resultado: 0% estourado em todas
  as vistas, com o brilho médio igual (vila 160 → 159, floresta 100 → 105).
- Mata escura: na sombra das copas sobrava só a luz do céu, ~1/3 da luz cheia. Luz do céu
  1,55 → 1,8 e sol 3,1 → 3,0 (Low/Medium): quase preto no horizonte (fim de tarde) 15,1% → 12,8%,
  floresta 0,6% → 0,3%; o que continua escuro ali é o miolo dos pinheiros e troncos contra o sol do fim
  da tarde, não manchas no chão.
- Brilho do sol: sem o corte no branco a mancha larga em volta do sol (que era o próprio estouro)
  diminuiu; o reflexo de lente ficou mais forte no Low/Medium (1,2 → 2,2) para compensar.
- Sombras: a área do mapa de sombra (calculado uma vez para o arquipélago) agora cobre só as ilhas,
  do mar ao alto das árvores, projetadas na direção da luz; antes era uma esfera em volta da caixa do
  mapa inteiro, com a base de rocha embaixo d'água. A faixa de profundidade caiu de 1–710 m para
  128–476 m (mais precisão, menos risco de acne). O tamanho do pixel de sombra quase não mudou
  (~22 cm: a largura do arquipélago manda), então a borda da sombra no chão continua com degraus
  suaves. Melhorar isso pede um mapa maior (4× a memória de vídeo) ou recalcular a sombra em volta
  da Brisa ao andar (trancos): não feito sem poder medir num celular.

Medido (tempo de quadro por vista, desenho direto na tela, perfil celular, antes → depois): vila
797 → 808 ms, aérea 604 → 641, floresta 841 → 907, horizonte 1240 → 1262 (+1 a +8%, o ruído aqui é
de ±5%): o tone mapping custa umas poucas contas por pixel em cada material. No celular de verdade a
imagem passa pelo FXAA e o tone mapping roda uma vez só, na imagem pronta (OutputPass).

Testes: as 6 vistas de referência e 2 contra o sol comparadas antes/depois (mesma posição, hora e
perfil); texturas transparentes convertidas comparadas sem o tone mapping (iguais às originais);
nenhum shader compilado durante o jogo; Capítulo 1 do começo ao fim (2 execuções: uma parou num
guardião que o teste não acalmou a tempo, a outra concluiu 25/25); console sem erros. Não foi
possível testar num celular: a perda da transparência no envio de canvas não acontece aqui.

## Site: three.js dava 404 no GitHub Pages (28/10/2026)

O console do site mostrou a causa real: `vendor/three/build/three.module.js` dava 404. A regra
`build/` do .gitignore (feita para a pasta do APK) valia para qualquer pasta "build", então
vendor/three/build/ e vendor/three-mesh-bvh/build/ nunca entraram no repositório (aqui elas existiam,
por isso os testes passavam). A regra agora é `/build/` (só a da raiz) e os dois arquivos foram
adicionados. Testado com uma cópia limpa só com os arquivos do commit (git archive), servida numa
subpasta como a do site: carrega sem nenhum 404. O favicon ganhou um ícone vazio (sem o 404 dele).

## Site (GitHub Pages) não carregava depois das atualizações (28/10/2026)

As publicações do Pages davam certo e o jogo carrega numa subpasta igual à do site (testado
localmente em /threadbound/, sem erros). A causa provável é o cache: o Pages manda o navegador guardar
cada arquivo por 10 minutos, e depois de uma atualização ele misturava módulos novos com antigos (um
módulo novo importando algo que o antigo ainda não exporta); o carregamento quebrava antes do jogo
começar e a tela ficava parada em "Costurando a ilha…", sem mensagem.

- ferramentas/versionar.py: cada módulo de src/ ganha "?v=<hash do conteúdo>" pelo mapa de
  importação do index.html (vale também para os imports entre os módulos). Arquivo novo = endereço
  novo; o que não mudou continua vindo do cache. Rodar antes de cada commit que mexe em src/ (o
  gerar-apk.sh já roda; o APK ignora o "?v=").
- Se algo não carregar, a tela mostra o erro e um botão "Recarregar" em vez de ficar parada.
- Testado: os 36 módulos chegam com a versão, nenhum carregado duas vezes; com um arquivo bloqueado
  de propósito, aparece o aviso. O site em si não abre deste ambiente (a rede bloqueia o github.io).

## Correção no celular: manchas brancas nas copas e pontilhado (27/10/2026)

Relatado num celular (captura do jogador): blocos brancos nas copas das árvores e uma mancha de
pontos escuros perto da câmera.

- Manchas brancas: o atlas da vegetação era enviado como canvas com fundo transparente, e a cor
  dos pixels transparentes fica a critério do navegador (em muitos celulares, branco; no PC, preto,
  por isso não aparecia nos testes). Os mipmaps misturavam esse branco com as folhas e o recorte
  deixava passar blocos brancos a média distância. Agora os pixels vão direto para a GPU e a cor das
  folhas vaza para o transparente ao redor (o alfa fica igual): a cor é a mesma em qualquer aparelho.
- Pontilhado: no celular e no PC fraco a imagem é desenhada em resolução menor e ampliada com FXAA,
  e o grão fino virava uma mancha de pontos. Nesses perfis a folhagem colada na câmera e a "janela"
  até a Brisa somem com corte seco, sem a faixa pontilhada; nos outros perfis o grão continua.
- Não deu para reproduzir num celular aqui (o renderizador deste ambiente guarda preto nos pixels
  transparentes); conferido que as folhas ficaram iguais e que nada compila durante o jogo
  (perfis celular e normal).

## Ciclo 7: otimização para todos os aparelhos e camadas de rocha (27/10/2026)

Medido antes (tempo de quadro por grupo, desenhando a mesma vista várias vezes e escondendo um grupo
por vez; renderizador por software deste ambiente): a vegetação era o mais caro (floresta 267 de
590 ms, horizonte 567 de 805 ms), depois terreno, mar e céu.

- Tentado e desfeito: pré-passada de profundidade na vegetação (a folha de trás deixaria de receber
  luz). Aqui ficou mais lento (floresta 590 → 659 ms, horizonte 805 → 1060 ms), porque os vértices
  da vegetação passam duas vezes. Sem medir ganho, não ficou.
- Menos trabalho por pixel, sem mudar a imagem: o terreno só lê a textura de detalhe nos lados que
  pesam (no chão plano, uma leitura em vez de três) e nenhuma depois de 45 m, onde ela já não
  aparecia; o mar pula o micro-relevo depois de 280 m (já pesava zero) e a distância exata até a
  praia longe dela (um atan e três senos a menos por pixel no mar todo); o céu só calcula o disco e
  a coroa do sol perto do sol; as nuvens leem o ruído de uma textura (uma leitura por oitava, em vez
  de quatro senos). Neste ambiente o tempo medido não mudou além do ruído (±5%): o renderizador por
  software não ganha com isso. Numa GPU a conta é menor, mas não consegui medir aqui.
- Inimigos: olhos e fios viraram geometrias únicas compartilhadas e o balanço dos fios foi para a
  GPU (o mesmo movimento). Cada Retalho custa 3 desenhos em vez de 8, e a CPU não atualiza mais 5
  objetos por Retalho a cada quadro. Malhas dos 13 Retalhos: 104 → 39; geometrias na memória
  371 → 282. Medido (2 quadros): vila 216 → 194 chamadas.
- Camadas de rocha nas falésias e barrancos: faixas horizontais que ondulam, visíveis também de
  longe (a falésia de longe era uma parede lisa).
- Testes: perfis celular, fraco e normal carregam sem erros e sem compilar shader durante o jogo;
  Capítulo 1 do começo ao fim; inimigo comparado de perto, igual.

## Ciclo 6: espuma nas falésias e otimização geral (27/10/2026)

Medido antes de mexer (perfil celular, um quadro): a Brisa tinha 38 mil triângulos (mais 17 mil
do contorno), a cachoeira 57 mil, e o controle de resolução trocava o tamanho da tela até uma vez
por segundo quando o fps oscilava perto da meta.

- Espuma no pé das falésias, em todas as ilhas: no carregamento, raios rente à água (do centro de
  cada ilha para fora) acham onde a falésia encontra o mar e viram uma textura de distância até a
  costa (512×512, 256 KB). O shader do mar lê essa textura: faixa branca batendo na rocha, uma
  segunda faixa chegando e a água um pouco mais clara perto da costa. Anda com as ondas.
- Rocha molhada: a falésia fica escura e esverdeada (limo) até onde a onda alcança, com a borda
  de cima irregular (no shader do terreno, duas contas por pixel).
- Brisa com nível de detalhe: com a câmera a mais de ~4,5 m ela usa metade dos triângulos. São só
  outros índices sobre os mesmos vértices e pesos dos ossos (animação idêntica, nada novo vai para
  a GPU na troca); bem de perto volta a malha completa.
- Cachoeira com nível do meio (~35% dos triângulos, a partir de ~18 m): a completa só bem de perto.
- Resolução dinâmica com folga: desce depois de 2 s lentos seguidos (na hora se a queda é grande)
  e sobe só depois de 4 s seguidos com folga, em vez de trocar todo segundo (cada troca realoca a
  tela na GPU, um tranco no celular).
- Medido depois (2 quadros, perfil celular), triângulos: vila 414 mil → 376 mil, vista aérea
  402 → 353 mil, floresta 350 → 312 mil, praia 275 → 237 mil, horizonte (com a cachoeira)
  403 → 291 mil (−28%). Chamadas de desenho iguais. Nenhum shader compilado durante o jogo.
  Capítulo 1 do começo ao fim, console sem erros. O fps real num celular continua sem medição
  aqui (sem GPU).

## Ciclo 5: a ilha desce até o mar e encontra a praia (27/10/2026)

- O mar sobe até logo abaixo da borda mais baixa das ilhas (calculado por capítulo, em ilha.js):
  a ilha não flutua mais, ela sai do mar com falésias que descem até dentro d'água (a base de
  rocha afunilada ficou embaixo d'água; o pé da falésia abre um pouco para fora, como falésia de
  mar). Fragmentos, casas, âncoras e a posição de tudo no jogo continuam no mesmo lugar.
- Cap. 1: a enseada desce numa rampa de areia até uma praia na beira d'água, com a mesma textura
  da praia (as duas areias se cruzam sem emenda). A rampa começa na borda real da ilha ponto a
  ponto, cobrindo a quina da falésia. A forma (praia + rampa) fica em praiaForma.js, usada pela
  malha da praia e pelo cais.
- O cais sai da areia da praia e entra no mar; o barco fica na água.
- Caps. 2 a 4: uma praia encostada no pé da falésia, onde a borda é mais baixa e longe das correntes
  de vento.
- Água rasa: dá para andar no raso; só água acima da cintura (ou cair das falésias) devolve ao
  último chão seguro. Entrando andando não custa fôlego; caindo de cima, sim, como antes. O "chão
  seguro" não é mais salvo debaixo d'água.
- A bruma do mar fica só no mar, fora das ilhas e rente à água (passando na altura da vila, ela
  deixava tudo enevoado). As nuvens baixas do High não ficam mais entre a ilha e o mar (não há
  mais espaço).
- Areia vista de longe: vai para a cor média da textura (o ladrilho aparecia em bolinhas).
- Mudança de layout no Cap. 1: o cais deixou de ficar na borda da ilha, e a análise do terreno
  (que o contava) põe os inimigos e os 5 fragmentos das rochas flutuantes em outros lugares. O
  save guarda os fragmentos pelo número, então a contagem continua certa. Os outros capítulos
  não mudam.
- Testes (perfil celular): Capítulo 1 do começo ao fim em 2 de 3 execuções (a outra parou num
  guardião que o teste não acalmou a tempo, a ~3 fps); andar da areia para o mar (fica no raso,
  volta da água funda sem perder fôlego); capítulos 2 a 4 abrem sem erro; nenhum shader compilado
  durante o jogo; console sem erros. Medido (2 quadros): vila 212 chamadas / 414 mil triângulos,
  horizonte 138 / 403 mil (o mar agora aparece em mais vistas), memória igual (273 MB).

## Ciclo 4 de gráficos (27/10/2026)

- Contra o sol, o ar se acende em dourado: a neblina e a bruma ganharam o mesmo brilho do céu do
  lado do sol (antes morros e mar distantes ficavam azul-acinzentados na frente do horizonte
  dourado). Um valor comum a todos os materiais, atualizado uma vez por quadro, e duas contas por pixel.
- Folhas contra o sol acendem em verde-dourado (luz atravessando a folha), só nas partes verdes.
- Casas com reboco caiado (textura desenhada no jogo, sem normal map, com uns trechos de tijolo à
  mostra) no lugar da pedra cinza com musgo, que deixava as paredes com cara de sujas.
- Pontilhado da folhagem: a faixa em que as copas coladas na câmera somem ficou curta (2,4–3,4 m
  em vez de 1,4–4,2 m) e o pontilhado virou um grão fino espalhado (antes, bolinhas em fileira). A
  "janela" até a Brisa não apaga mais o capim do chão (riscava linhas pontilhadas na encosta).
- Gruta dos Recados: a borda da casca não fica mais solta no ar (era uma lâmina cinza fina vista de
  lado), musgo no alto, pedra mais quente e pedras roladas na boca da entrada. No celular a troca
  para o material simples agora mantém as cores por vértice.
- Areia: ondulações mais marcadas e manchas grandes mais douradas ou mais claras.
- Medido (2 quadros, perfil celular): chamadas e triângulos iguais aos de antes (ex.: vila 199→208
  chamadas, floresta 132→126; a diferença vem dos destroços que giram em volta da ilha);
  programas 66→68, todos compilados no carregamento (nenhum durante o jogo). Capítulo 1 do
  começo ao fim, console sem erros; capítulos 2 a 4 abrem sem erro.

## Ciclo 3 de gráficos (27/10/2026)

- "Janela" na folhagem: folhas e galhos no caminho entre a câmera e a Brisa somem com pontilhado
  (no shader da vegetação, poucas contas por pixel): ela não fica mais escondida atrás de árvores.
- O mar visto do alto voltou: a bruma baixa ficou mais rala (máx. 50%, começando 25 m abaixo do
  topo) e a água some aos poucos até o limite do desenho (antes uma faixa estreita formava um disco
  de borda redonda no mar, no celular).
- Testes: Capítulo 3 do começo ao fim no perfil celular (2 de 3 execuções concluíram; a que falhou
  não mostrou a etapa e não se repetiu, provavelmente o teste a ~3 fps), nenhum shader compilado
  durante o jogo, console sem erros.

## Sessão longa de memória

4 minutos andando em círculos pela ilha, com chuva, no Chromium sem GPU (medido com
`performance.memory` e `renderer.info`):

| Tempo | Heap JS | Geometrias na GPU | Texturas | Programas de shader | Objetos na cena |
|---|---|---|---|---|---|
| 0 s | 263,5 MB (antes da 1ª coleta) | 131 | 23 | 48 | 1018 |
| 20 s | 222,4 MB | 192 | 25 | 51 | 1022 |
| 120 s | 222,8 MB | 231 | 29 | 52 | 1018 |
| 240 s | 222,8 MB | 269 | 29 | 53 | 1018 |

Heap, texturas e objetos ficam estáveis. As geometrias sobem enquanto ela passa por lugares novos
(cada nível de detalhe vai para a GPU na primeira vez que aparece) e param de subir nos últimos 40 s:
não é vazamento, mas num celular com pouca memória vale observar.

## Próximos passos, em ordem

1. FASE 12: abrir https://adielson2005.github.io/threadbound/ num Android modesto (depois do merge do
   PR na `main`), anotar FPS em cada capítulo e ajustar o perfil `fraco` (resolução, sombra, alcance).
2. Jogar cada capítulo à mão do começo ao fim e ajustar a dificuldade (luz necessária, guardiões).
3. Ideias para depois: mais segredos nos Capítulos 2–4, uma cena final animada no Capítulo 4.

## Boneca redesenhada no jogo (28/10/2026)

A Brisa agora usa o modelo novo do Meshy (vestido lilás de bolinhas, laço rosa, cabelo longo). O
modelo veio sem esqueleto e com 1,13 milhão de triângulos (FBX de 65 MB):

- Malha reduzida para 50 mil triângulos, com orçamento por região (rosto 12 mil, cabeça e cabelo
  14 mil, corpo 24 mil), e texturas em 4096/2048/1024 (JPG/PNG e KTX2). O mapa de metal era vazio
  e não é usado (metal 0).
- Esqueleto: o mesmo Mixamo da boneca antiga, com as juntas levadas às posições do corpo novo
  (ferramentas/boneca_nova/juntas.json) e cada osso girado o mínimo para apontar ao longo dele
  (src/bonecaNova.js). Assim todas as animações (andar, correr, combate, pulo, parada, morte)
  continuam valendo; as trilhas de posição seguem as juntas novas e o balanço do quadril cresce na
  proporção das pernas, que na boneca nova são mais longas.
- Pesos dos ossos calculados por região (ferramentas/boneca_nova/pesos.py): cabelo pela cor escura
  (cabeça em cima, peito embaixo), pernas e braços pela distância aos ossos, tronco, pescoço e
  cabeça pela altura na coluna, saia no quadril com as coxas puxando a barra; depois suavizados
  pela malha e iguais nas cópias do mesmo ponto (costuras de UV não abrem).
- Dados: assets/boneca/boneca_nova.bin (2,1 MB) e .json. O FBX antigo continua sendo carregado
  pelo esqueleto e pelas animações; a malha dele é descartada.

Limitações: os pesos são automáticos, não pintados à mão. Em movimentos amplos (chute giratório,
corrida) a saia e as mechas de cabelo da frente podem atravessar as pernas e os braços. Um rig feito
no Mixamo/Meshy pode substituir os pesos depois sem mudar o resto.

### Boneca antiga removida e cabelo que balança

- A boneca antiga saiu do jogo: as texturas dela (~50 MB), o corpo costurado por código
  (costura.js, `?boneca=costurada`), o conserto das pernas do auto-rig antigo (reparos.js) e
  `?boneca=antiga`. Do FBX ficam só o esqueleto e as animações
  (ferramentas/fbx-so-esqueleto.py: 6,4 → 4,0 MB; ossos e animações conferidos iguais ao original).
- Cabelo: três cadeias de três ossos novos presas à cabeça (centro e lados), com os pesos do cabelo
  solto passados para elas (pesos.py). No jogo cada junta é uma partícula com inércia, mola de
  volta à pose de repouso, um pouco de gravidade, comprimento fixo, ângulo máximo de ~63° e sem
  entrar no tronco (bonecaNova.js, criarCabelo), atualizada depois da animação e da postura.
  Medido na ponta da mecha do meio: parada fica no lugar; correndo vai ~30 cm para trás e sobe;
  ao parar balança e volta em ~1 s.
- Limitação: a colisão é só com o tronco (cápsula); as mechas do lado podem passar pelos braços.

## Cabelo sem atravessar os braços; física e colisões revisadas (28/10/2026)

Medido com testes automáticos no navegador (SwiftShader, sem placa de vídeo; não num celular).

- Cabelo × braços (bonecaNova.js): além do tronco, o corpo virou cápsulas presas aos ossos
  (cabeça, braços, antebraços, mãos). A colisão é pelo segmento inteiro de cada mecha (não só pelas
  juntas), com a espessura da mecha (4 cm), 3 iterações, e o lado certo vem da pose de repouso:
  um soco rápido que pula a mecha de um quadro para o outro faz a mecha voltar por cima do braço,
  não para dentro dele. Vértices do cabelo dentro de braço/antebraço (amostra de 5.443, média por
  quadro): andar 133–219 → 0–20, correr 62–110 → 0–47, soco 121–140 → 0, chute 208–254 → 0–4.
  Parada continua em ~110–200: é o cabelo encostado na manga logo abaixo do ombro (a medida conta
  até 6 cm do osso; nas imagens não atravessa).
- Personagem (fisica.js), num robô que anda 224 trajetos retos de 4 s pelo mapa com a própria
  moverComColisao (53 mil quadros):
  - Causa da maior penetração: o "grudar no chão" (descendo rampas, um raio puxa a personagem para
    o chão) não conferia colisão e encaixava a cápsula dentro de pedras e quinas no morro. Agora
    ela é colada e empurrada para fora; se ainda ficar dentro, não cola. Mais iterações (3 → 6) e,
    se mesmo assim a cápsula não sair de dentro, o passo é desfeito. Penetração máxima 23,4 cm →
    0,3 cm; quadros com mais de 5 cm 915 → 0; média 2,4 mm → 0,01 mm. Pisca chão/ar igual (260 →
    284 em 53 mil quadros).
  - Degraus: a cápsula parava em qualquer quina acima de ~13 cm (a beira de plataformas, a base
    das casas). Agora sobe degraus de até 36 cm andando no chão, terminando apoiada em cima (se do
    outro lado não há espaço, como a base de uma casa colada na parede, não sobe nem fica
    sobe-desce). 66 subidas no robô, até 17 cm (são os degraus que o mapa tem).
  - Nenhuma queda através do chão (o teste antigo acusava 28, mas comparava com a altura calculada
    do terreno, que nas encostas íngremes fica até 1 m acima da malha de colisão).
- Câmera (jogo.js): cinco raios (meio e quatro cantos) em vez de um, e distância mínima 0,8 →
  0,25 m. Encostada numa parede com a câmera do lado dela, o obstáculo fica a ~35 cm e a câmera
  parava dentro da parede; perto assim agora a boneca some (a câmera estaria dentro da cabeça).
  Em 120 posições/direções aleatórias na vila: câmera dentro de algo 3 → 0.

## Manchas brancas nas folhas: causa e correção (28/10/2026)

- Causa (medida, não suposta): o brilho especular do material PBR da vegetação (Medium e High).
  As normais dos cartões de folha são "de volume" (apontam para fora da copa, para a luz tratar a
  copa como um volume) e os cartões têm as duas faces; vistos de lado ou pelo verso, o ângulo entre
  a normal e o olhar chega a 90° e o especular (Fresnel e o termo de visibilidade do GGX) estoura em
  branco. Teste na vista da floresta, trocando só o material das folhas: aspereza no máximo 16% de
  pixels brancos, só a face da frente 11%, sem tone mapping 22%, sem especular 0,00%. No Low/celular
  o material é Lambert (sem especular) e não havia mancha (0% nas 6 vistas). Não era a
  transparência: sem textura nenhuma os cartões continuavam brancos.
- Correção (ilha.js): o especular das folhas e da casca fica, mas com teto por canal (0,25) e na
  cor da própria folha. Zerar de todo também apagava o brilho normal das copas (floresta e morro
  ficavam 3–6% mais escuros).
- Pixels brancos (>= 245 nos três canais), mesmas 6 vistas, versão atual antes → depois:
  Medium floresta 1,42% → 0,00%, morro 2,16% → 0,09%, horizonte 1,88% → 0,05%, aérea 0,29% → 0,00%;
  High floresta 2,80% → 0,26%, morro 4,01% → 0,68%, horizonte 1,94% → 0,27%, aérea 0,70% → 0,00%.
  O branco que sobra no High não é folha: o brilho da agulha na vila, as colunas de mármore, a
  beira de algumas pedras e a roupa da boneca.
- Brilho médio no Medium quase igual (floresta 111 → 106, morro 157 → 155, aérea 130 → 131); parte
  da queda é o próprio branco que saiu.

## Brilho da roupa e do High, física dos objetos e a boneca que sumia (29/10/2026)

Medido no navegador do PC (SwiftShader, sem placa de vídeo); falta um celular.

- Roupa da boneca (boneca.js): no High o vestido lilás aparecia branco e brilhando. Somavam-se o
  brilho de tecido branco e forte (sheen 0,45), o especular cheio, o reflexo do céu (0,8) e a luz
  de contorno branca, e o bloom espalhava em halo. Agora: sheen 0,18 na cor do vestido, especular de
  tecido (0,35), reflexo do céu 0,25–0,3 e contorno na cor da própria superfície (0,14–0,16).
- Brilho do mapa no High (altos.js): o High usava tone mapping ACES, que leva as cores claras para o
  branco (metade da saturação do Medium nas mesmas vistas). Agora usa o Neutral do Low/Medium, com
  exposição 0,66. Mesmas 6 vistas, antes → depois: saturação vila 23 → 36, praia 16 → 34, morro
  34 → 43; brilho médio morro 188 → 157, aérea 150 → 141 (o Medium dá 155 e 131). A vila ainda tem
  5,7% de pixels no máximo (areia ao sol e o brilho da agulha).
- Objetos soltos (objetos.js, combate.js): galho e agulha eram colocados direto no chão, sempre na
  horizontal (mesmo no morro), 6 cm acima dele e balançando; soltos da mão apareciam no chão.
  Agora são corpos rígidos (três pontos, Verlet, contra a malha de colisão): gravidade, quique,
  atrito e atrito estático, rolam e dormem parados; a Brisa os chuta ao passar e soco/chute os
  joga. Medido: assentados no começo encostam no chão (folga 0) e se inclinam com a encosta
  (4,8–9,2°); solto de 1,5 m girando, quica 1 vez e para deitado em 1,35 s; chutado anda 1,3 m;
  numa encosta de 24° desliza 14 cm e para (sem o atrito estático escorregava 4,7 m sem parar);
  pegar e soltar no jogo: cai da mão e para deitado (0,1°). Custo ~0,04 ms por objeto acordado.
- A boneca sumia (jogo.js): na correção anterior da câmera, com uma parede ou tronco logo atrás
  dela, a câmera chegava perto e a boneca era escondida a menos de 0,55 m. Agora, com obstáculo a
  menos de 1,6 m, a câmera sobe por cima dela (olha de cima) e a boneca só some se a câmera ainda
  ficar a menos de 0,3 m (encurralada entre paredes): em 160 posições aleatórias na vila, a câmera
  subiu em 50 e a boneca sumiu em 4.
- Recorte por oclusão (oclusao.js) conferido: nenhum bloco do chão ou setor de vegetação escondido
  estando visível (0 de 56, com tempo para o rodízio de conferência).

## Boneca sem riscos nem brilho, visual realista, sem o círculo em volta dela (29/10/2026)

Medido no navegador do PC (SwiftShader) no perfil de celular, que é o do jogador.

- Riscos escuros no rosto, braços e vestido (a "textura feia"): era o contorno de desenho animado
  (uma cópia da malha inflada 2,7 cm, desenhada por dentro em marrom). Feito para a boneca antiga,
  mais simples; na boneca nova ele atravessava o rosto, os braços e as dobras do vestido. Saiu.
- Boneca clara/brilhosa ao abrir o mapa: a textura do modelo é clara (tem luz pintada nela) e, com
  o sol do jogo, o vestido lilás e a pele estouravam para quase branco; somava-se a luz em faixas do
  estilo de desenho (que clareia os meios-tons). A cor da textura agora é multiplicada por 0,8
  (boneca.js, TOM_BONECA). No celular a cor da boneca vem em 2048 em vez de 1024 (rosto nítido de
  perto; ~2 MB de vídeo em KTX2).
- Realismo (estilo.js): saíram a luz em faixas (cel shading) e o brilho de borda branco; a luz do
  sol cai contínua, como no mundo real. A correção de cor ficou leve (realce de cor 0,5 → 0,15,
  quente/frio bem mais fraco). O visual antigo continua em ?estilo=desenho. Para compensar a
  claridade que as faixas davam aos meios-tons, a luz do céu no Low/Medium subiu de 1,8 para 2,1.
  Mesmas 6 vistas (celular), antes → depois: brilho médio vila 160 → 147, morro 150 → 147, floresta
  104 → 99; quase preto no fim de tarde 10,8% → 10,6%; saturação um pouco maior (morro 48 → 52).
- Círculo transparente em volta da boneca: era a "janela" na folhagem (ilha.js), que apagava a
  vegetação entre a câmera e a Brisa num cilindro que alargava até 1,5 m em volta dela, cortando
  arbustos e árvores por onde ela passava. Saiu. A folhagem colada na câmera (a menos de ~3 m)
  continua sumindo, senão as copas tampam a tela na floresta.

## Celular: nitidez, brilhos e a sombra que cortava objetos (29/10/2026)

Reproduzido emulando um Pixel 5 (tela 1080×2340, densidade 2,75, Android) no navegador do PC.

- Imagem borrada/serrilhada (a "textura feia"): no perfil celular a resolução ia de 0,75 a 1 pixel
  de CSS, ou seja ~300–390 pixels de largura ampliados quase 3× numa tela de 1080. Agora começa em
  1,5 e o ajuste automático (fps) vai de 1 a 2 (nunca acima da densidade da tela); se o fps não
  segura, o orçamento ainda pode descer mais, como antes.
- Brilho em volta da Brisa ao entrar no mapa: ~16 brilhos aditivos a até 13 m de onde ela nasce
  (as luzinhas mágicas douradas, a lanterna da oficina, que aparecia como uma coluna de luz sobre
  a mesa, e a marca de luz dos objetos), todos na força total em pleno sol. Agora o brilho depende
  da hora (dia.js): de dia 15–30% da força, à noite inteiro.
- Círculo que cortava o que ela passava por perto: a sombra redonda sob os pés era desenhada com
  deslocamento de profundidade (polygonOffset −4) e aparecia por cima de degraus, pedras e pés de
  mesa vizinhos. Saiu o deslocamento; o disco fica 4 cm acima do chão e o que está na frente o
  cobre.
- Versão no menu de Gráficos (ferramentas/versionar.py): data e código da versão, para conferir se
  o navegador carregou a atualização ou mostra a guardada no cache.

## Cabelo da boneca: pontinhos brancos e o cabelo embolando (29/10/2026)

Investigado no perfil celular, pixel a pixel (cada pontinho rastreado até o ponto da textura e o
tipo de superfície de onde vem).

- Pontinhos/riscos claros nas mechas e riscos escuros nos braços — três causas somadas:
  1. As ilhas da textura do Meshy vêm coladas umas nas outras (o cabelo encosta direto no vestido
     e na pele): reduzida para longe (mipmaps; no celular a boneca ocupa poucos pixels), a cor da
     vizinha vazava para a borda. Agora as 1.137 ilhas foram reorganizadas com margem de 8 px (em
     4096) entre elas, só movidas e reduzidas por igual (sem girar: o normal map continua valendo),
     e a margem recebe a cor da própria ilha (ferramentas/boneca_nova/reempacotar_uv.py e
     preencher_bordas.py). Custo: a textura ficou com 77% da densidade original.
  2. A suavização dos pesos espalhava peso dos ossos do cabelo para o vestido e a pele encostados
     nele (307 vértices claros): ao balançar, o cabelo puxava esses pedaços, que furavam as mechas
     como lascas lilás. Agora só o cabelo de verdade tem peso dos ossos de cabelo (sobram 26
     vértices claros, cópias de borda de pontos de cabelo) (pesos.py).
  3. (Tentativa descartada: repintar os pixels claros das ilhas escuras estragava a franja, que
     divide ilha com a testa.)
- Cabelo embolando na frente do ombro ao parar de correr: a mecha podia girar até 63° com pouco
  amortecimento. Agora até 40°, amortecimento maior e volta mais firme (bonecaNova.js): ao parar,
  a mecha do lado fica atrás do ombro (antes ia até 13 cm à frente).

## Cabelo tremendo (29/10/2026)

Medido com passo fixo de 1/60 s (animação e física chamadas direto, sem depender do fps do
navegador): ponta de cada mecha no espaço da Brisa, aceleração média por quadro e % de quadros em
"zigue-zague" (vai e volta de um quadro para o outro).

- Antes: a mecha do meio estava estável; as do lado (encostadas nos braços) tremiam — parada, a
  direita em zigue-zague 58% dos quadros (157 mm/quadro²); correndo 12–15% (27 mm).
- Causas e correções (bonecaNova.js):
  1. a pose de repouso das mechas do lado fica dentro do braço (a animação aproxima os braços): a
     mola puxava para dentro e a colisão empurrava para fora a cada quadro. Agora o repouso também
     é empurrado para fora do corpo antes de servir de alvo;
  2. o empurrão da colisão virava velocidade (Verlet) e a mecha quicava de volta: agora o que as
     restrições mexem não vira velocidade (choque sem quique);
  3. a colisão por segmento, com o lado escolhido pela pose de repouso, mudava de direção de um
     quadro para o outro com o braço passando rápido: agora é por junta, pela direção de agora, e
     macia (metade por iteração, 4 iterações); o que aparece na tela tem um filtro curto.
- Depois: parada 0% (0,25 mm); andando ≤ 5%; correndo 5% (7 mm). Sem colisão nos braços seria
  5 mm, mas o cabelo atravessaria os braços. Contrapartida: correndo, um pouco mais de cabelo
  encosta dentro do braço (129 pontos da amostra por quadro, antes 108); parada 0, andando 65.

## Interface nova (menus, HUD, pausa, configurações)

- Visual trocado: o tema de linho/feltro com bordas tracejadas em toda superfície deu lugar a painéis
  escuros translúcidos (desfoque do fundo), bordas finas e acentos lilás e dourado; ícones desenhados
  (SVG) no lugar de emojis nos menus e nos botões de toque.
- Menu inicial: título grande, história com fio lateral, botão principal dourado e lista vertical
  de itens com ícone. No celular em pé o cartão fica embaixo; deitado, texto à esquerda e botões à
  direita (cabe sem rolar em 851×393).
- Janelas (capítulos, configurações, créditos, gráficos) com cabeçalho, botão fechar, corpo que rola e
  rodapé. Configurações com abas **Geral** e **Controles** (a lista de teclas saiu do meio das opções);
  interruptor no lugar da caixinha de marcar.
- Menu de pausa de verdade (P, Esc, Start ou o botão ⏸ no HUD, que substitui a engrenagem):
  Continuar, Configurações, Gráficos, Controles e Menu principal (recarrega; o progresso fica no último
  ponto salvo). Com um painel aberto, as teclas ficam com ele e Esc só fecha o painel.
- HUD menor no PC e menor ainda no celular (fôlego, fragmentos, relógio, objetivo, fala, dica e "E").
  No celular deitado o objetivo foi para a esquerda, longe dos botões de toque.
- Testado só no navegador (Playwright: 1280×720, Pixel 5 em pé e deitado), sem erros no console; não
  testado num celular de verdade.

## Interface no estilo de jogo (minimalista)

A versão anterior (painéis de vidro com degradês, ícones em cada item, botões dourados com brilho)
parecia um site gerado. Referência agora: os jogos de aventura que deixam o cenário em primeiro plano
(Zelda: Breath of the Wild, cuja ideia de interface é "melhor sem UI se não for necessária"; Unravel,
sem HUD durante as fases).

- Menus são listas de texto sobre a cena, sem caixas; um fio dourado entra na opção escolhida.
  ↑/↓ passam pelas opções (como num console), o mouse escolhe ao passar por cima e Enter confirma.
  Dicas de tecla no rodapé do menu inicial ("↑↓ Escolher · Enter Confirmar"; somem no toque).
- Telas por cima do jogo (configurações, capítulos, créditos, gráficos, pausa) escurecem a cena e
  ficam alinhadas à esquerda: título grande, linhas finas, "Esc Voltar" no rodapé (no toque, "‹ Voltar").
  Configurações em uma linha por opção (nome à esquerda, controle à direita), abas em texto.
- HUD sem caixas: carretéis, fragmentos e relógio com sombra no texto; objetivo com um fio dourado do
  lado; fala numa faixa escura simples com o nome em dourado; "E" num círculo.
- Botões de toque: círculos finos quase transparentes, ícones de traço.
- No menu inicial Enter/Espaço com uma opção marcada aperta essa opção (antes sempre começava o jogo),
  e as setas deixam de ser bloqueadas quando um controle do menu tem o foco (o volume anda com ← →).

### Animações da interface

- Telas (configurações, capítulos, créditos, gráficos, pausa) entram com o fundo esmaecendo e o
  conteúdo deslizando em cascata (título, abas, opções, rodapé); fecham esmaecendo em 0,16 s antes de
  sumir (`sumir`/`mostrar` em `jogo.js`; reabrir no meio do fechamento cancela o fechamento). O menu
  inicial some em 0,32 s ao começar o jogo.
- Menu inicial, listas de capítulos e níveis de gráficos entram em cascata; aba nova sobe; o fio da
  aba escolhida cresce; objetivo novo desliza; botões de toque afundam ao apertar.
- Só opacidade e deslocamento (a placa de vídeo compõe sem redesenhar a página), nada de desfoque;
  durações de 0,16 a 0,6 s. Com "reduzir movimento" ligado no sistema, tudo fica instantâneo.
- Na pausa e com uma tela aberta, o HUD (fala, dicas, objetivo, botões de toque) sai de baixo das opções.
- Testado (Pixel 5 simulado): cada tela some de fato depois do esmaecer, reabrir no meio a mantém
  aberta, Esc fecha; sem erros no console.

### Menus sem travar, transições rápidas e seleção única

- Com a capa do menu inicial (ou do fim de capítulo) por cima, o jogo não é atualizado nem desenhado
  (antes desenhava a cena inteira escondida atrás da capa, disputando a máquina com a interface).
  Na pausa e com janelas por cima do jogo parado, desenha só os quadros do fundo escurecido e para;
  volta a desenhar ao mudar o tamanho da janela ou o nível de gráficos. Medido (navegador sem placa de
  vídeo): 0 quadros em 2 s no menu, 1 na pausa.
- Animações cerca de 55% mais curtas (entradas 0,1–0,2 s, cascata mais rápida, fechar em 0,08 s, a
  capa some em 0,15 s).
- Seleção: uma opção marcada por vez (a que tem o foco). O mouse marca ao passar por qualquer ponto da
  linha (antes só sobre o texto, e o marcador podia aparecer em duas opções); o dedo marca no toque,
  antes de soltar. Controle: direcional ou analógico passam pelas opções, A confirma, B volta.

## Abertura com a logo AA e tela de carregamento

- Ao abrir o jogo: logo "AA" animada (~2,6 s; toque ou tecla pula). As quatro pernas dos dois A
  crescem uma a uma; uma agulha puxa a linha dourada que é a barra dos dois A, passando por cima e por
  baixo das pernas como uma costura; o nó aparece na ponta e "apresenta" surge embaixo.
- Depois, se o jogo ainda estiver carregando, a tela de carregamento (carretel girando, barra e etapa:
  "Costurando a ilha…", "Preparando o mapa…", "Preparando os gráficos…"); quando o jogo avisa que está
  pronto (evento `jogo-pronto`), ela esmaece e o menu aparece. Em erro, as duas saem e a mensagem com
  "Recarregar" fica visível.
- Sem travar: tudo animado só com transform e opacidade (o navegador anima isso fora da linha
  principal, que fica ocupada montando o jogo); a barra anda por `transform: scaleX`. Antes do passo
  mais pesado (compilar os shaders) o carregamento espera um quadro para mostrar a etapa.

### Logo e carregamento mais minimalistas

- Logo refeita: monograma "AA" geométrico, os dois A como uma única linha contínua (um fio) em traço
  fino, pontas retas, base cortada reta, sem brilho; uma barra dourada fina serve aos dois. Aparece por
  uma cortina que corre para a direita, a barra se estende e "apresenta" surge (~2,6 s; pula com toque
  ou tecla). Só transform e opacidade.
- Carregamento: fundo liso, o nome do jogo, uma linha de progresso de 1 px em dourado e, embaixo, a
  etapa e a porcentagem em letras pequenas (antes: capa escurecida, carretel girando e barra grossa).

### Uma tela de cada vez na abertura

- O carregamento agora já fica, opaco, por baixo da logo desde o início; a logo esmaece por cima dele
  (antes as duas esmaeciam juntas e o menu aparecia por um instante entre elas).
- O carregamento fica no mínimo 3 s na tela; quando o jogo fica pronto, a barra completa (transição
  de 0,6 s), "Pronto" e 100% ficam 0,7 s, e só então ele esmaece. O menu entra animado nesse momento
  (as animações dele são reiniciadas; antes já tinham rodado escondidas).
- Medido (celular simulado, sem placa de vídeo): abertura → carregamento opaco o tempo todo → jogo
  pronto em ~18 s → carregamento some 0,7 s depois; nenhum quadro com o menu à mostra antes disso.

## Celular / APK: menos trabalho para a GPU e sem ficar trocando de resolução

Medido no perfil celular (Pixel 5 simulado, navegador sem placa de vídeo, então só números relativos):

- **Uma passada de desenho em vez de três.** O celular usava FXAA: a cena era desenhada numa textura à
  parte e depois filtrada na tela inteira (3 `render()` por quadro, 2 deles para texturas). Agora usa
  o antisserrilhado nativo (MSAA), que a GPU de celular resolve na própria memória do chip quase de
  graça: 1 `render()` por quadro, direto na tela (`graficos.js`, perfil celular).
- **Resolução sem "caça".** Cada troca de resolução recria a tela na GPU (travadinha). A regra antiga
  (−0,08 / +0,04, perto da meta) ficava subindo e descendo. `src/resolucao.js` anda em degraus de
  0,25, desce depois de 2 s lentos, sobe só depois de 8 s na meta e lembra o degrau que falhou (a
  espera para tentar de novo dobra a cada falha, até 10 min). Simulação de 5 min
  (`node ferramentas/testar-resolucao.mjs`): trocas 22 → 5 (celular fraco), 29 → 4 (médio),
  17 → 2 (bom), com o mesmo fps médio; no celular bom termina em 1,75 (antes 1,22), imagem mais nítida.
- **Faixa de resolução do celular**: começa em 1,25 (antes 1,5) e vai de 1 a 1,75 pixel por pixel de
  CSS (antes até 2): até ~1,0 milhão de pixels por quadro numa tela de 1080 × 2400 em vez de 1,4.
- Por quadro no Low: 57 chamadas de desenho e ~146 mil triângulos (boneca 25 mil, mar 18,5 mil):
  dentro do razoável para celular; não foi aí que mexi.
- O APK já estava com aceleração de hardware e pausa o jogo em segundo plano.
- Não testado num celular de verdade: o ganho real de fps precisa ser conferido no aparelho.

## Velocidade: andar por padrão, rápido só no sprint

- Sem o sprint a Brisa anda a 2,1 m/s com a animação de andar (antes ia a 5,8 m/s, sempre correndo).
  Rápido (até 8 m/s, animação de correr) só no sprint: Shift, X/RT no controle, ou o bastão arrastado
  além da borda no celular. X no teclado continua sendo o passeio (1 m/s); defendendo, 1,4 m/s.
- No ar (pulo, ou caindo há mais de 0,25 s) ela ainda alcança 5,8 m/s: os vãos do mapa foram medidos
  com saltos nessa velocidade e continuam alcançáveis pulando andando.
- A troca andar/correr da animação passou de 2 para 2,9 m/s, para o passo normal usar a de andar.
- Medido: andando 2,1 m/s ("andar"); sprint 6+ m/s ("correr"); soltar o sprint volta a 2,1; pulo
  andando chega a 5,8 m/s no ar e volta a 2,1 ao pousar.
