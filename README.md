# Threadbound

Jogo 3D de navegador (Three.js). **Brisa**, uma boneca feita com os retalhos das roupas dos moradores
da Vila de Maré Alta, acorda na praça vazia no dia em que os fios que prendem a ilha no céu começam a
se romper. Ela precisa reacender as Âncoras de Maré nas ilhotas e o Coração da Ilha.

- **Jogar online:** https://adielson2005.github.io/threadbound/
- **Roteiro (4 capítulos):** [docs/ROTEIRO.md](docs/ROTEIRO.md)
- **Progresso do desenvolvimento:** [docs/PROGRESSO.md](docs/PROGRESSO.md)

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
| Y | chuva liga / desliga |
| G | gráficos · P pausa |

## Gráficos

Três modos (Low, Medium, High). O jogo detecta o PC (inclusive sem placa de vídeo) e, em qualquer
modo, ajusta resolução e efeitos sozinho para continuar fluido.
Para testar outro perfil: `?perfil=semPlaca`, `?perfil=fraco` ou `?perfil=normal` no endereço.
