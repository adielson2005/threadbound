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
