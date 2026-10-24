# Threadbound

Jogo 3D de navegador (Three.js). Numi, uma boneca de pano costurada com a última Linha Viva,
desperta numa oficina esquecida e precisa reacender as três Âncoras de Fio e o Coração do Fio
antes que a ilha caia nas nuvens.

## Como jogar

O jogo carrega modelos por HTTP, então precisa de um servidor local (abrir o `index.html` direto não funciona).

- **Windows:** dê dois cliques em `Jogar.bat` (precisa do [Python](https://www.python.org/downloads/)).
- **Qualquer sistema:** na pasta do projeto, rode `python -m http.server 8080` e abra <http://localhost:8080>.

## Controles

| Tecla | Ação |
|---|---|
| W A S D | andar |
| Mouse | girar a câmera |
| Shift | correr |
| Espaço | pular · no ar: cambalhota · segurar: planar |
| J / K | soco / chute |
| Q | defender |
| F | pegar / soltar objeto |
| E | interagir (purificar, restaurar âncoras) |
| R | voltar ao ponto seguro |
| T | avançar dia / noite |
| G | gráficos · P pausa |

## Gráficos

Três modos (Low, Medium, High). O jogo detecta o PC (inclusive sem placa de vídeo) e, em qualquer
modo, ajusta resolução e efeitos sozinho para continuar fluido.
Para testar outro perfil: `?perfil=semPlaca`, `?perfil=fraco` ou `?perfil=normal` no endereço.
