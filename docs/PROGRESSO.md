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
