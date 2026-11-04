# Código do jogo (src/)

Padrões para escrever ou editar o código do Fiapo.

## Motor

- **Three.js r165** (módulos ES, carregado por import map no `index.html`, cópia local em `vendor/`).
- Não existe engine-reference para Three.js em `docs/engine-reference/`: confira a API na
  versão que está em `vendor/` antes de usar algo novo; não chute assinaturas.
- Os agentes especialistas de Godot, Unity e Unreal **não se aplicam** a este projeto.
  Para código use `gameplay-programmer`/`engine-programmer`, para shaders `technical-artist`,
  para interface `ui-programmer`.

## Padrões

- Nomes e comentários em português, como no resto do código.
- Valores de jogo (dano, velocidade, alturas de pulo, tempos) ficam em constantes nomeadas no
  topo do módulo ou em `src/dificuldade.js`, nunca soltos no meio da lógica.
- Sem alocação por quadro em laços quentes (reaproveite vetores e quaternions).
- Depois de mudar módulos, rode `python3 ferramentas/versionar.py` (versiona os imports para
  furar o cache do GitHub Pages).
- Testes são bots no navegador com Playwright (relógio virtual); descreva no commit o que foi
  medido e nunca invente números.
