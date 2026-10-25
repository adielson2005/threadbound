# Threadbound

Jogo 3D de navegador (Three.js). **Brisa**, uma boneca feita com os retalhos das roupas dos moradores
da Vila de Maré Alta, acorda na praça vazia no dia em que os fios que prendem a ilha no céu começam a
se romper. A história tem **quatro capítulos jogáveis**: a Vila de Maré Alta, o Recife das Vozes, o
Jardim Submerso e a Costura Final. Cada um abre quando o anterior termina.

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
| X (segurar) | andar devagar |
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

No celular: bastão virtual no lado esquerdo (arrastar além da borda corre), câmera no lado direito e
botões de pular, interagir, socar, chutar, defender e pegar.

Outros parâmetros do endereço: `?capitulo=2` (abre um capítulo direto), `?ktx2=0` (texturas
originais em vez das comprimidas KTX2), `?oclusao=0` (desliga o occlusion culling) e
`?mapa=antigo` (o mapa antigo do Meshy).

As texturas KTX2 são geradas por `ferramentas/gerar-ktx2.sh` (precisa do `toktx`, do
[KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases)).
