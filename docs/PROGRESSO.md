# Progresso do "Prompt Mestre" — onde parei

Última atualização: 24/10/2026. Repositório: https://github.com/adielson2005/threadbound (branch `main`).
Ponto de restauração anterior a tudo isto: tag `restauro-antes-reconstrucao`.

## Resumo para retomar

**Parei depois da FASE 8 (menu) e da FASE 9 (história).**
O próximo passo exato é a **FASE 5 (hitboxes e colisões)** e depois os **testes da FASE 12 num celular Android de verdade**.
A ordem completa do que falta está no fim deste arquivo.

## Situação de cada fase

| Fase | Situação | O que foi feito / o que falta |
|---|---|---|
| 1. Engine | ✅ feito | Three.js 0.165 mantido: roda no navegador, inclusive no celular, e as limitações eram de conteúdo, não da engine. Diagnóstico de desempenho feito antes (chamadas de desenho, grama, materiais). |
| 2. Mapa | ✅ feito (base) | Arquipélago gerado por código (`src/ilha.js`, `src/casas.js`): ilha principal de ~230 m, morro em terraços, trilhas, florestas variadas (pinheiro, frondosa, bétula, arbusto, flores, pedras), vila com 5 casas abandonadas onde dá para entrar, farol, ruínas, pomar, falésias em camadas e base de rocha. O mapa antigo segue em `?mapa=antigo`. **Falta:** áreas secretas, praia de areia na própria ilha principal e mais pontos de interesse. |
| 3. Renderização / FPS | ✅ feito (parcial) | Frustum culling, setores de vegetação com nível leve para longe, instancing (destroços, grama), lotes de peças estáticas, distância de desenho, qualidade adaptativa e resolução dinâmica nos 3 modos, perfil de PC sem placa de vídeo. **Falta:** occlusion culling, texturas comprimidas (KTX2) e medir FPS num Android modesto. |
| 4. Boneca | 🔄 pela escolha do usuário | O usuário pediu para **manter a boneca original** e só melhorar as animações. Feito: a corrida rápida não desliza os pés, o tronco inclina ao acelerar e nas curvas, e a cabeça olha fragmentos, âncoras e Retalhos por perto. Uma boneca refeita por código ficou guardada em `?boneca=costurada` (não é o padrão). **Falta:** variações da animação parada, uma tecla para andar devagar e transições de virada. |
| 5. Hitboxes | ⏳ **próxima** | Hoje: cápsula única da protagonista (`fisica.js`), esfera e raycast nos Retalhos, malha de colisão com BVH. **Falta:** revisar a hitbox dos inimigos, testar atravessamentos rápidos e paredes das casas. |
| 6. Dia/noite e chuva | ✅ feito | Ciclo de dia e noite; sol (disco com coroa) e lua (fases, mares e crateras) refeitos; chuva com gotas na GPU, som gerado, trovão e relâmpago (tecla Y). Temporizador de jogabilidade removido. |
| 7. Interface | ✅ feito (base) | HUD artesanal, sem cronômetro, com pausa avisando na tela. **Falta:** testar o layout de toque num celular real. |
| 8. Menu e imagem | ✅ feito | Menu com capa original renderizada no próprio jogo (`assets/menu/capa.jpg`), Continuar (salvamento automático), Novo jogo com confirmação, Capítulos, Configurações (volume, sensibilidade, tamanho do texto, tremor da tela, controles), Gráficos e Créditos. Não há "Sair": o navegador não permite fechar a aba pelo jogo. |
| 9. História | ✅ feito (Cap. 1 jogável) | Roteiro novo em `docs/ROTEIRO.md`: Brisa e a Vila de Maré Alta, 4 capítulos. No jogo: diálogos, introdução, cartas nas casas, carta final e gancho para o Cap. 2. **Falta:** construir os mapas dos Capítulos 2 a 4. |
| 10–11. GitHub | ✅ feito | Um commit por etapa, todos enviados (sem force push). |
| 12. Testes | 🔄 parcial | Testado no navegador do PC: carregamento, ilha, colisão, âncoras, correntes de vento, cartas, chuva, céu, menu, salvar/continuar, os 3 modos gráficos e o console sem erros. **Falta:** Android real, longa sessão de memória e um capítulo jogado do início ao fim. |

## Próximos passos, em ordem

1. FASE 5: revisar a hitbox dos Retalhos (esfera → cápsula alinhada ao corpo) e testar atravessamento em alta velocidade e nas paredes das casas.
2. FASE 12: abrir https://adielson2005.github.io/threadbound/ num Android modesto, anotar FPS e corrigir o layout de toque.
3. FASE 3: texturas KTX2 (precisa da ferramenta `toktx` instalada) e occlusion culling simples por setor.
4. FASE 2: áreas secretas (gruta sob a vila, mirante no farol), praia na ilha principal e mais detalhes na vila.
5. FASE 4: animações da boneca original (parada com variações, andar devagar, virada).
6. FASE 9: mapa do Capítulo 2 (O Recife das Vozes), usando `ilha.js` como base.
