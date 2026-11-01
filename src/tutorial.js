// Mini tutorial do começo (Novo jogo): seis passos curtos, um de cada vez, num cartão embaixo
// da tela. Cada passo termina quando a Brisa faz o que ele pede (andar, correr, pular, golpear,
// esquivar, defender); "Pular" (Esc / o botão) termina tudo. Depois dele, o jogo não mostra mais
// dicas de controles: só o objetivo, as falas e o que for preciso no momento.

const PASSOS = [
  { titulo: 'Andar', teclado: 'W A S D para andar · mova o mouse para olhar', toque: 'Arraste no lado esquerdo para andar · no direito, para olhar', feito: e => e.andou > 3 },
  { titulo: 'Correr', teclado: 'Segure Shift andando para correr', toque: 'Arraste o bastão até a borda para correr', feito: e => e.correu > 1 },
  { titulo: 'Pular', teclado: 'Espaço para pular · no ar, de novo para a cambalhota', toque: '▲ para pular · no ar, de novo para a cambalhota', feito: e => e.pulos > 0 },
  { titulo: 'Golpear', teclado: 'J para socar (repita para o combo) · K para chutar', toque: 'Toque no punho para socar e no pé para chutar', feito: e => e.golpes >= 2 },
  { titulo: 'Esquivar', teclado: 'L para rolar para o lado (com uma direção)', toque: 'Toque em ⟲ para rolar', feito: e => e.esquivas > 0 },
  { titulo: 'Defender', teclado: 'Segure Q para defender · bem na hora do golpe é defesa perfeita', toque: 'Segure o escudo para defender · bem na hora é defesa perfeita', feito: e => e.defesa > 0.6 },
];

export function criarTutorial({ toque, aoTerminar }) {
  const el = document.getElementById('tutorial');
  const titulo = el.querySelector('b'), texto = el.querySelector('span'), pontos = el.querySelector('.pontos');
  let i = -1, ativo = false, pronto = 0;
  const e = { andou: 0, correu: 0, pulos: 0, golpes: 0, esquivas: 0, defesa: 0 };
  const antes = { golpe: null, noChao: true, esquiva: null };
  pontos.innerHTML = PASSOS.map(() => '<i></i>').join('');

  function mostrar() {
    const p = PASSOS[i];
    titulo.textContent = p.titulo;
    texto.textContent = toque ? p.toque : p.teclado;
    pontos.querySelectorAll('i').forEach((x, k) => { x.className = k < i ? 'feito' : k === i ? 'atual' : ''; });
    el.classList.remove('certo');
    el.style.opacity = 1;
  }
  function iniciar() {
    ativo = true; i = 0; pronto = 0;
    Object.keys(e).forEach(k => { e[k] = 0; });
    mostrar();
  }
  function terminar() {
    if (!ativo) return;
    ativo = false;
    titulo.textContent = 'Pronto!'; texto.textContent = 'Agora é com você, Brisa.';
    pontos.querySelectorAll('i').forEach(x => { x.className = 'feito'; });
    el.classList.add('certo');
    setTimeout(() => { el.style.opacity = 0; }, 1600);
    aoTerminar?.();
  }

  // por quadro: o que a Brisa fez (jogador do jogo.js) conta para o passo atual
  function atualizar(dt, j) {
    if (!ativo) return;
    const v = Math.hypot(j.vel.x, j.vel.z);
    if (j.noChao) e.andou += v * dt;
    if (j.disparando && v > 3) e.correu += dt;
    if (antes.noChao && !j.noChao && j.vel.y > 1) e.pulos++;
    if (j.golpe && j.golpe !== antes.golpe) e.golpes++;
    if (j.esquiva && j.esquiva !== antes.esquiva) e.esquivas++;
    e.defesa = j.defendendo ? e.defesa + dt : e.defesa;
    antes.golpe = j.golpe; antes.noChao = j.noChao; antes.esquiva = j.esquiva;
    // passo cumprido: um instante de "certo" e vai para o próximo
    if (pronto > 0) {
      pronto -= dt;
      if (pronto <= 0) { i++; if (i >= PASSOS.length) terminar(); else mostrar(); }
      return;
    }
    if (PASSOS[i].feito(e)) { el.classList.add('certo'); pronto = 0.7; }
  }

  el.querySelector('button').addEventListener('click', terminar);
  return { iniciar, atualizar, pular: terminar, get ativo() { return ativo; } };
}
