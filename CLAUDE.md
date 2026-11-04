# Fiapo — Claude Code Game Studios

Jogo 3D para navegador e Android (APK), feito com Three.js. Desenvolvido com o
[Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)
(licença MIT, em `.claude/LICENSE-CCGS`): 49 agentes e 74 comandos que funcionam como um estúdio.

## Tecnologia

- **Motor**: Three.js r165 (motor próprio, sem Godot/Unity/Unreal)
- **Linguagem**: JavaScript (módulos ES), sem etapa de build no navegador
- **Colisão**: three-mesh-bvh (cápsula do personagem)
- **Publicação**: GitHub Pages (web) e `ferramentas/gerar-apk.sh` → `build/Fiapo.apk` (Android)
- **Controle de versão**: Git; mudanças entram na `main` por pull request

> Os agentes especialistas de Godot, Unity e Unreal não se aplicam. Use os agentes gerais
> (game-designer, level-designer, gameplay-programmer, technical-artist, ui-programmer,
> art-director, qa-lead...).

## Documentos do jogo

- `docs/GDD.md` — Game Design Document (regras, mecânicas, progressão). É o registro de design.
- `docs/ROTEIRO.md` — história e falas.
- `docs/PROGRESSO.md` — o que já foi feito.
- `docs/arte/` — capa e ícone.

Ao mudar uma mecânica, atualize o `docs/GDD.md` no mesmo commit.

## Configuração

`project.yaml` na raiz é a configuração principal (motor, plataforma, `modes.rigor: minimal`).

## Regras de coordenação

@.claude/docs/coordination-rules.md

## Forma de trabalho

**Colaboração guiada pelo usuário:** pergunta → opções → decisão → rascunho → aprovação.

- Antes de escrever em um arquivo, mostre o que vai mudar e peça aprovação
  (exceto anotações de sessão e memória dos agentes; veja `.claude/rules/agent-memory.md`).
- Mudanças em vários arquivos precisam de aprovação do conjunto.
- Nada de commit sem pedido do usuário.
- Pergunta ignorada não é resposta: repita a pergunta e espere.

Veja `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` para o protocolo completo.

## Segurança

- Nunca exponha senhas, tokens ou chaves. Nunca faça commit de `build/assinatura.keystore`,
  `build/assinatura.senha` ou de `*.apk` (o APK fica fora do git contra pirataria).
- Nunca use force push, `git reset --hard` ou `rm -rf` (as regras em `.claude/settings.json` bloqueiam).
- Não sobrescreva alterações de outras pessoas e não mexa na `main` sem necessidade.

## Padrões de código

Veja `src/CLAUDE.md`.

## Contexto

`production/session-state/active.md` é o ponto de salvamento da sessão: leia primeiro depois
de uma compactação, queda ou `/clear`. Referência completa: `.claude/docs/context-management.md`.

> **Primeira vez?** Rode `/adopt` para o estúdio analisar o projeto que já existe.
