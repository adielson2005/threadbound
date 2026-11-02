# Fiapo — Game Design Document

> Documento central de planejamento: o que o jogo é, as regras, as mecânicas, o fluxo da
> progressão, o desenho das fases e a dificuldade. A história completa está em `ROTEIRO.md`; o
> histórico técnico, em `PROGRESSO.md`. Este documento descreve o jogo como ele está e o que vem.

## 1. Visão

**Fiapo** é um jogo de aventura e ação em 3D para navegador e celular (APK). Brisa, uma boneca de
pano feita com os retalhos dos moradores de uma vila que virou névoa, atravessa ilhas costuradas no
céu para reacender os Fios de Maré e descobrir quem os está cortando.

- **Gênero:** aventura de plataforma em terceira pessoa com luta corpo a corpo.
- **Sessão:** 20–40 min por capítulo; salva sozinho nos pontos de controle.
- **Público:** quem gosta de exploração com história (estilo aventura de plataforma) e de lutas
  curtas e legíveis. Dificuldade escolhida no começo.
- **Plataformas:** navegador de PC (teclado/mouse ou controle) e celular (toque), mesmo código.

### Pilares

1. **Leveza e movimento:** andar, correr, pular, planar e voar nas correntes de vento é gostoso por
   si só. Cada ilha é um pequeno quebra-cabeça de travessia.
2. **Luta que se lê:** todo ataque inimigo avisa antes (brilho e guarda); quem presta atenção
   defende na hora certa, esquiva e contra-ataca. Nada de golpe surpresa.
3. **Uma ilha que conta a história:** cartas, lembranças, a casa de cada morador. Ninguém é mau à
   toa: os Retalhos estão assustados; o vilão tem razão de estar com raiva.
4. **Guiar sem encher a tela:** depois do tutorial, o jogo mostra só o objetivo e um farol de luz
   no próximo destino; o resto se aprende vendo.

## 2. Regras do jogo

| Regra | Como funciona |
|---|---|
| **Fôlego (vida)** | 7 / 5 / 4 / 3 conforme a dificuldade. Golpe inimigo tira 1. Queda alta tira 1 a partir de 5 m e mais 1 a cada degrau (8, 11, 15 e 20 m); abaixo de 20 m nunca tira o último. |
| **Cair da ilha** | Não mata: o vento a traz de volta ao último chão seguro e tira 1 fôlego, nunca o último. |
| **Derrota** | Fôlego zero: tela de "Tentar de novo"; volta ao último ponto salvo com o fôlego cheio. O progresso (fragmentos, âncoras, cartas) fica. |
| **Pontos de controle** | Ao reacender cada âncora, ao vencer o Ravi e no começo. Salvos no navegador (Continuar). |
| **Fragmentos de Luz** | Espalhados pela ilha; cada um devolve 1 fôlego. Cada âncora pede um número deles para reacender. |
| **Âncoras** | Só reacendem sem guardiões (Retalhos por perto) e sem cristais de névoa presos nelas. |
| **Coração da Ilha** | Fecha o capítulo. No Cap. 1, antes dele, a luta com o Ravi. |
| **Dificuldade** | Escolhida depois de "Novo jogo"; vale para o Continuar. Muda fôlego, vida e ritmo do vilão, quanto o poder enche e a janela da defesa perfeita (seção 6). |

## 3. Mecânicas

### Movimento

| Ação | Controle (PC / toque) | Detalhes |
|---|---|---|
| Andar | WASD / bastão | 2,7 m/s; tronco reto. |
| Correr | Shift / bastão até a borda | 4,6 m/s; não gasta nada. |
| Corrida super rápida | Shift duas vezes e segurar / ⚡ | 7,2 m/s; gasta a barra de fôlego da corrida (5 s); cansada, volta à corrida normal. |
| Pular | Espaço / ▲ | Com tolerância de borda (coyote) e de toque antecipado (buffer); soltar cedo encurta. |
| Pulo duplo (cambalhota) | Espaço no ar | Sobe de novo e sai para a frente a 8,2 m/s: vai bem mais longe que o pulo simples (5,4 → 7,1 m). |
| Planar | Segurar Espaço caindo | Queda lenta; atravessa vãos grandes. |
| Subir bordas | Pular contra uma borda e empurrar | Brisa se puxa para cima. |
| Corrente de vento | Entrar no redemoinho | Arco calculado até a outra ponta; a cambalhota no voo dá impulso (18,8 → 24 m). |
| Moitas e algas | Atravessar | Não travam: deixam a Brisa até 55% mais lenta e soltam folhas. Pedras, árvores, paredes e corais são sólidos. |

### Luta

| Ação | Controle (PC / toque) | Detalhes |
|---|---|---|
| Combo de socos | J / punho | Até 5 golpes; o último empurra forte. Mira suave no inimigo mais perto (o vilão tem prioridade). |
| Chute giratório | K / pé | Dano 2, empurra longe. |
| Defender | Segurar Q / escudo | Bloqueia de frente e deixa o atacante tonto. |
| Defesa perfeita | Levantar a guarda bem na hora | Atordoa mais, câmera lenta, abre o contra-ataque e enche o poder. |
| Esquiva | L / ⟲ | Rolamento; os primeiros 0,3 s ninguém acerta (esquiva perfeita = contra-ataque). |
| Contra-ataque | Golpear logo depois de uma defesa/esquiva perfeita | O próximo golpe vale o dobro. |
| Armas | F pega / solta | Galho, Agulha de Prata e Lâmina da Tesoura (combo de corte: J, J, J; K = giro de 360°). Cada uma tem usos. |
| Explosão de Fios (poder) | V / ✦ | Barra dourada enche acertando, defendendo e esquivando na hora; cheia, uma onda empurra e atordoa todos em volta, com câmera lenta. |
| Acalmar Retalho / dissolver cristal | E | Perto do alvo, sem parede no meio. |

### Inimigos

- **Retalhos:** pedaços de roupa animados pela névoa. Patrulham perto de casa, perseguem quando
  veem a Brisa (sem parede no meio), avisam e dão uma investida. Acalmados com E ou com golpes.
- **Ravi, o Corta-Fios (Cap. 1):** rodeia de guarda, avança com aviso (brilho vermelho), investe
  em linha reta (contra uma parede fica tonto), esquiva quando ela ataca perto, tem postura que
  quebra com golpes seguidos. Poderes: Lâminas de Névoa (de longe, brilho roxo antes) e, na 2ª fase,
  Passo de Névoa (reaparece atrás dela) e salto com pouso que derruba.

## 4. Fluxo da progressão

1. **Abertura → menu → Novo jogo → dificuldade → tutorial** (6 passos de 10–20 s cada: andar,
   correr, pular, golpear, esquivar, defender; dá para pular).
2. **Despertar na praça:** as falas apresentam o mistério (o fio foi cortado). Objetivo: explorar
   e achar Fragmentos de Luz.
3. **Primeira âncora** (a mais perto, marcada pelo farol de luz): ensina guardiões, cristais e o
   custo em fragmentos. Ravi aparece ao longe depois dela.
4. **Segunda âncora:** emboscada do Ravi (luta curta, ele recua com um terço da vida a menos).
   Ensina a luta de verdade antes do chefe.
5. **Terceira âncora:** a ilha para de tremer; o farol aponta o Coração.
6. **Chefe no Coração:** a luta inteira com o Ravi (duas fases). Vencido, vira névoa.
7. **Coração e carta de Aurélia:** fim do capítulo; o farol mostra o Recife das Vozes (Cap. 2).
8. **Fuga com o Nuvem:** o pônei alado de Aurélia desce, Brisa monta e os dois decolam da ilha
   (cena curta, sem HUD).
9. **Mapa das ilhas:** as quatro ilhas no mar, ligadas por uma trilha de linha dourada; o Nuvem
   voa sozinho para a próxima ilha liberada. ◀ ▶ (ou tocar numa ilha) escolhe; "Embarcar" abre o
   capítulo. Ilhas trancadas ficam escuras. O mapa também abre pelo menu ("Mapa das ilhas").

Opcional em todo o capítulo: cartas nas casas (5), lembranças nos fragmentos lilases, a Gruta dos
Recados e o mirante do farol (escada em espiral). Recompensa: história e fôlego.

## 5. Level design

### Princípios

- **Ler de longe, aprender de perto:** o destino aparece primeiro (farol de luz, silhueta das
  ilhotas, o morro do Coração), o caminho se descobre andando.
- **Ensinar → testar → combinar:** o pulo duplo aparece sozinho antes de ser exigido num vão; a
  corrente de vento aparece primeiro curta e segura; a luta com o Ravi vem depois da emboscada.
- **Sem becos sem saída:** toda borda alta tem um caminho de volta; cair da ilha só custa 1
  fôlego e devolve ao chão seguro.
- **Recompensar a curiosidade:** áreas secretas (gruta, mirante) ficam fora do caminho principal,
  com uma carta especial.
- **Colisão honesta:** tudo o que parece sólido (pedra, parede, árvore, móvel, poste) é sólido;
  plantas macias se atravessam devagar. Nada de prender a personagem em detalhe.

### Capítulo 1 — A Vila de Maré Alta (mapa)

| Área | Papel | Conteúdo |
|---|---|---|
| Praça e oficina | Início, tutorial | Agulha de Prata, Lâmina da Tesoura, casas com cartas. |
| Campina e floresta | Exploração, fragmentos | Pinheiros, moitas (macias), pedras (sólidas), Retalhos patrulhando. |
| Ilhota do Farol | Âncora 1 / área secreta | Escada em espiral até o mirante (parapeito sólido com abertura). |
| Ilhota das Ruínas | Âncora 2 | Colunas, arco, muros caídos; boa para a emboscada (cobertura). |
| Ilhota do Pomar | Âncora 3 | Fileiras de árvores; correntes de vento de ida e volta. |
| Morro do Coração | Chefe e fim | Clareira aberta para a luta; Lâmina da Tesoura no caminho. |
| Gruta dos Recados | Secreta | Escondida no morro da floresta. |

### Capítulos 2–4

Recife das Vozes (sinos de boia, cascos de barco, garoa), Jardim Submerso (flores de pedra, corais
petrificados) e a Costura no Céu (nós da costura). Estrutura igual (três objetivos + o final), cada
um com mecânica própria (ver `ROTEIRO.md`). Próximo passo de design: um chefe por capítulo com o
mesmo sistema de luta do Ravi.

## 6. Dificuldade

| | Fio de Seda | Ponto Corrido | Nó de Marinheiro | Maré Negra |
|---|---|---|---|---|
| Nível | Muito fácil | Normal | Difícil | Muito difícil |
| Fôlegos | 7 | 5 | 4 | 3 |
| Vida do Ravi | 60% | 100% (26) | 125% | 150% |
| Ritmo dos golpes dele | 0,8× | 1× | 1,15× | 1,3× |
| Pausa entre ataques | 1,5× | 1× | 0,8× | 0,65× |
| Aviso antes do golpe | 1,6× | 1× | 0,8× | 0,65× |
| Barra do poder | 1,6× | 1× | 0,85× | 0,7× |
| Defesa perfeita | 0,34 s | 0,22 s | 0,17 s | 0,13 s |

Curva dentro do capítulo: Retalhos sozinhos → Retalhos guardando âncoras → emboscada → chefe com
duas fases. Equilíbrio medido com um jogador automático (ver `PROGRESSO.md`).

## 7. Interface e orientação

- **Durante o jogo:** fôlego, barra da corrida, barra do poder, objetivo (uma linha; detalhes da
  âncora só perto dela), aviso "E — …" quando há o que fazer, falas curtas.
- **Farol do objetivo:** coluna de luz dourada sobre a âncora apagada mais perto e, depois, sobre
  o Coração; some ao chegar perto e durante as lutas.
- **Sem dicas de controle** depois do tutorial; os controles completos ficam em Configurações.

## 8. Áudio

Tudo sintetizado na hora (`src/som.js`): golpes, impactos (com o peso do dano), metal da defesa,
sino da defesa perfeita, esquiva, poder, poderes do Ravi, passos, folhas, batidas em sólidos,
coleta, âncora, vitória, interface; música de combate que esquenta na 2ª fase; chuva e trovões.

## 9. Desempenho (alvo)

60 fps no celular médio e no PC com placa integrada: resolução ajustada sozinha pelo fps, sombra
do mapa calculada uma vez, sombra de verdade só da Brisa, vegetação com níveis de detalhe,
oclusão do que o relevo esconde, laços por quadro sem criar objetos novos.

## 10. Próximos passos

1. Chefe para os capítulos 2–4 (Tomé possuído pela névoa, a Maré Negra, Aurélia).
2. Uma habilidade nova por capítulo (ex.: gancho de linha no Cap. 2 para cruzar os cascos).
3. Medir o desempenho num celular de verdade e ajustar os limites do modo Celular.
