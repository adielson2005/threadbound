import * as THREE from 'three';
import { CAPITULO_ATUAL } from './capitulo.js';

// Animais da ilha, modelados aqui em código (formas arredondadas e poucas peças, como o Nuvem em
// pegaso.js). Só enfeite e vida: não atrapalham a passagem nem lutam.
//  - gaivotas: planam em círculos lá no alto, batendo as asas de vez em quando (Caps. 1 e 2);
//  - galinhas: ciscam na praça (abaixam a cabeça para bicar) e saem correndo se a Brisa chega perto;
//  - gato: senta na praça, o rabo balança, a cabeça segue a Brisa; às vezes muda de lugar;
//  - coelhos: pulam pela campina e fogem aos saltos da Brisa;
//  - borboletas: voam em volta do Pomar batendo as asas (Cap. 1);
//  - peixes de pano: nadam no ar em volta da praça do Recife, ondulando o corpo (Cap. 2).
// Celular: nenhuma sombra (a sombra do mapa é fixa), poucos objetos, e longe da câmera o animal
// não é desenhado (distancia.js) nem pensa (LONGE).

const LONGE = 70;            // além disso (da Brisa) o animal não anda nem anima
const FOGE_GALINHA = 3.2, FOGE_COELHO = 6; // distância em que fogem da Brisa (m)
const VEL = { galinha: 0.8, galinhaFuga: 3.2, gato: 0.9, coelhoPulo: 2.6, coelhoFuga: 6.5 };

const _v = new THREE.Vector3();
let rnd = (() => { let s = 98765; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

function mat(cor, extra = {}) { return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, metalness: 0, ...extra }); }
function esfera(r, m, sx = 1, sy = 1, sz = 1, seg = 12) { const e = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0)), m); e.scale.set(sx, sy, sz); return e; }
function cone(r, h, m, seg = 8) { return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); }
function cilindro(r0, r1, h, m, seg = 6) { return new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); }
function sem(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } }); return o; }

// ---------------- modelos ----------------
function gaivota(M) {
  const g = new THREE.Group();
  const corpo = esfera(0.16, M.branco, 1, 0.85, 2.2); g.add(corpo);
  const cabeca = esfera(0.1, M.branco); cabeca.position.set(0, 0.06, 0.34); g.add(cabeca);
  const bico = cone(0.03, 0.12, M.laranja); bico.rotation.x = Math.PI / 2; bico.position.set(0, 0.04, 0.48); g.add(bico);
  const rabo = cone(0.09, 0.22, M.cinza, 4); rabo.rotation.x = -Math.PI / 2; rabo.scale.set(1.6, 1, 0.3); rabo.position.set(0, 0, -0.42); g.add(rabo);
  const asas = [-1, 1].map(lado => {
    const pivo = new THREE.Group(); pivo.position.set(lado * 0.1, 0.04, 0.02); g.add(pivo);
    const asa = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.22), M.branco); asa.position.x = lado * 0.32; pivo.add(asa);
    const ponta = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.021, 0.16), M.cinzaEscuro); ponta.position.x = lado * 0.7; ponta.position.z = -0.03; pivo.add(ponta);
    return { pivo, lado };
  });
  return { g: sem(g), asas };
}
function galinha(M, cor) {
  const g = new THREE.Group();
  const corpo = esfera(0.17, cor, 1, 0.95, 1.25); corpo.position.y = 0.26; g.add(corpo);
  const rabo = esfera(0.09, cor, 0.7, 1.3, 0.7); rabo.position.set(0, 0.36, -0.18); rabo.rotation.x = -0.5; g.add(rabo);
  const pescoco = new THREE.Group(); pescoco.position.set(0, 0.34, 0.14); g.add(pescoco);
  const cabeca = esfera(0.08, cor); cabeca.position.set(0, 0.1, 0.04); pescoco.add(cabeca);
  const crista = esfera(0.035, M.vermelho, 0.6, 1.2, 1.4); crista.position.set(0, 0.19, 0.04); pescoco.add(crista);
  const bico = cone(0.025, 0.07, M.amarelo); bico.rotation.x = Math.PI / 2; bico.position.set(0, 0.09, 0.13); pescoco.add(bico);
  for (const lado of [-1, 1]) { const olho = esfera(0.012, M.preto, 1, 1, 1, 6); olho.position.set(lado * 0.055, 0.12, 0.08); pescoco.add(olho); }
  const pernas = [-1, 1].map(lado => { const p = cilindro(0.012, 0.012, 0.16, M.amarelo, 4); p.position.set(lado * 0.06, 0.08, 0); g.add(p); return p; });
  return { g: sem(g), pescoco, pernas };
}
function gato(M) {
  const g = new THREE.Group();
  const corpo = esfera(0.14, M.laranja, 0.9, 1.15, 1.2); corpo.position.set(0, 0.17, -0.02); corpo.rotation.x = -0.35; g.add(corpo); // sentado: corpo inclinado
  const cabeca = new THREE.Group(); cabeca.position.set(0, 0.36, 0.08); g.add(cabeca);
  cabeca.add(esfera(0.1, M.laranja, 1.1, 0.95, 1));
  const focinho = esfera(0.045, M.creme, 1.2, 0.8, 0.9); focinho.position.set(0, -0.03, 0.08); cabeca.add(focinho);
  for (const lado of [-1, 1]) {
    const orelha = cone(0.04, 0.08, M.laranja, 4); orelha.position.set(lado * 0.06, 0.09, -0.01); orelha.rotation.z = -lado * 0.25; cabeca.add(orelha);
    const olho = esfera(0.016, M.verdeOlho, 1, 1.2, 0.6, 6); olho.position.set(lado * 0.04, 0.015, 0.088); cabeca.add(olho);
  }
  for (const lado of [-1, 1]) { const pata = esfera(0.035, M.creme, 1, 0.7, 1.4, 6); pata.position.set(lado * 0.05, 0.03, 0.12); g.add(pata); }
  const rabo = new THREE.Group(); rabo.position.set(0, 0.06, -0.16); g.add(rabo);
  const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, 0.02, -0.12), new THREE.Vector3(0.18, 0.1, -0.08), new THREE.Vector3(0.22, 0.24, 0)]);
  rabo.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 10, 0.022, 5, false), M.laranja));
  return { g: sem(g), cabeca, rabo };
}
function coelho(M) {
  const g = new THREE.Group();
  const corpo = esfera(0.13, M.cinzaClaro, 0.9, 0.85, 1.25); corpo.position.y = 0.13; g.add(corpo);
  const cabeca = esfera(0.075, M.cinzaClaro, 1, 1, 1.1); cabeca.position.set(0, 0.22, 0.13); g.add(cabeca);
  for (const lado of [-1, 1]) {
    const orelha = esfera(0.03, M.cinzaClaro, 0.7, 2.6, 0.5, 8); orelha.position.set(lado * 0.035, 0.34, 0.1); orelha.rotation.set(-0.25, 0, -lado * 0.18); g.add(orelha);
    const olho = esfera(0.013, M.preto, 1, 1, 1, 6); olho.position.set(lado * 0.05, 0.24, 0.19); g.add(olho);
  }
  const rabo = esfera(0.04, M.branco, 1, 1, 1, 8); rabo.position.set(0, 0.15, -0.16); g.add(rabo);
  return { g: sem(g), corpo };
}
function borboleta(M, cor) {
  const g = new THREE.Group();
  const corpo = cilindro(0.008, 0.008, 0.08, M.preto, 4); corpo.rotation.x = Math.PI / 2; g.add(corpo);
  const forma = new THREE.Shape(); forma.absellipse(0, 0, 0.05, 0.04, 0, Math.PI * 2);
  const geo = new THREE.ShapeGeometry(forma, 8).rotateX(-Math.PI / 2);
  const m = mat(cor, { side: THREE.DoubleSide, emissive: cor, emissiveIntensity: 0.15 });
  const asas = [-1, 1].map(lado => { const pivo = new THREE.Group(); g.add(pivo); const a = new THREE.Mesh(geo, m); a.position.x = lado * 0.05; pivo.add(a); return { pivo, lado }; });
  return { g: sem(g), asas };
}
function peixe(M, cores) {
  const g = new THREE.Group();
  // corpo de retalhos: três gomos de cores diferentes, costurados (uma faixa escura entre eles)
  const gomos = cores.map((c, k) => { const s = esfera(0.16 - k * 0.025, c, 0.55, 0.9, 0.8, 10); s.position.z = 0.14 - k * 0.15; g.add(s); return s; });
  const costura = cilindro(0.11, 0.11, 0.012, M.linha, 10); costura.rotation.x = Math.PI / 2; costura.position.z = 0.06; g.add(costura);
  const rabo = new THREE.Group(); rabo.position.z = -0.3; g.add(rabo);
  const barbatana = cone(0.12, 0.2, cores[0], 3); barbatana.rotation.x = Math.PI / 2; // a ponta encosta no corpo, a base abre em leque atrás barbatana.scale.set(0.25, 1, 1.2); barbatana.position.z = -0.08; rabo.add(barbatana);
  for (const lado of [-1, 1]) { const olho = esfera(0.022, M.botao, 1, 1, 0.5, 8); olho.position.set(lado * 0.075, 0.03, 0.24); g.add(olho); }
  return { g: sem(g), rabo, gomos };
}

// ---------------- comportamento ----------------
export function criarAnimais({ cena, mapa, terreno, distancia }) {
  const raiz = new THREE.Group(); raiz.name = 'animais'; cena.add(raiz);
  const M = {
    branco: mat('#f4f1ea'), cinza: mat('#b8bcc4'), cinzaEscuro: mat('#3e4048'), cinzaClaro: mat('#cfc6bb'),
    laranja: mat('#e2914a'), creme: mat('#f3e3c6'), amarelo: mat('#e7b53c'), vermelho: mat('#d23a2e'),
    preto: mat('#1d1a1c', { roughness: 0.3 }), verdeOlho: mat('#9fc54a', { roughness: 0.2 }), linha: mat('#3a2f45'),
    botao: mat('#2a1d3a', { roughness: 0.25 }), marrom: mat('#9a6a42'),
  };
  const lista = [];
  const alturaEm = (x, z) => mapa.alturaEm?.(x, z) ?? null;
  const livres = terreno.areas.flatMap(a => a.livres);
  const perto = (c, min, max) => livres.filter(q => { const d = Math.hypot(q.x - c.x, q.z - c.z); return d >= min && d <= max; });
  const sortear = arr => arr[Math.floor(rnd() * arr.length)];
  const pontos = mapa.pontos ?? {};
  const praca = pontos.vila ? new THREE.Vector3(pontos.vila.x, 0, pontos.vila.z) : terreno.nascimento.clone();
  const raioPraca = pontos.vila?.r ?? 12;
  const cap = CAPITULO_ATUAL;

  function adicionar(a, raio = 1) { raiz.add(a.g); distancia?.adicionar(a.g, raio); lista.push(a); return a; }
  // anda no chão de "de" até um ponto livre perto de "casa" (sem sair da área)
  function novoDestino(a, raio) {
    const cand = perto(a.casa, 0, raio);
    if (cand.length) a.destino.copy(sortear(cand));
  }
  function virarPara(a, x, z, dt, k = 6) {
    const alvo = Math.atan2(x - a.g.position.x, z - a.g.position.z);
    let d = alvo - a.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    a.g.rotation.y += d * Math.min(1, dt * k);
  }
  // (assenta no chão sempre: os pulinhos e o balanço somam por cima, sem acumular)
  function noChao(a) { const p = a.g.position, h = alturaEm(p.x, p.z); if (h !== null) p.y = h; }
  function andar(a, vel, dt) {
    const p = a.g.position, dx = a.destino.x - p.x, dz = a.destino.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { noChao(a); return true; }
    const passo = Math.min(d, vel * dt);
    p.x += dx / d * passo; p.z += dz / d * passo;
    noChao(a);
    virarPara(a, a.destino.x, a.destino.z, dt);
    return false;
  }
  // fuga: um ponto livre perto de casa, longe da Brisa
  function fugir(a, jog, raio) {
    const cand = perto(a.casa, 0, raio);
    let melhor = null, dm = -1;
    for (let k = 0; k < 12 && cand.length; k++) { const q = sortear(cand), d = Math.hypot(q.x - jog.x, q.z - jog.z); if (d > dm) { dm = d; melhor = q; } }
    if (melhor) a.destino.copy(melhor);
  }

  // ----- gaivotas (Caps. 1 e 2): círculos lá no alto -----
  if (cap <= 2) {
    const b = mapa.geo?.boundingBox, topo = b ? b.max.y : 30;
    const centros = [praca, ...(pontos.ilhotas ?? []).map(i => new THREE.Vector3(i.x, 0, i.z))];
    for (let k = 0; k < 6; k++) {
      const a = adicionar(gaivota(M), 3);
      const c = centros[k % centros.length];
      Object.assign(a, { tipo: 'gaivota', centro: c.clone(), raioVoo: 18 + rnd() * 22, altura: topo + 8 + rnd() * 18, vel: (0.25 + rnd() * 0.15) * (rnd() < 0.5 ? 1 : -1), ang: rnd() * 6.28, bater: 0, sempre: true });
      a.g.scale.setScalar(1.3);
    }
  }
  // ----- Cap. 1: galinhas e gato na praça, coelhos na campina, borboletas no Pomar -----
  if (cap === 1) {
    const naPraca = perto(praca, 3, raioPraca + 4);
    const corG = [M.branco, M.marrom, M.laranja, M.branco, M.creme];
    for (let k = 0; k < 5 && naPraca.length; k++) {
      const p = sortear(naPraca), a = adicionar(galinha(M, corG[k]));
      a.g.position.copy(p); a.g.rotation.y = rnd() * 6.28;
      Object.assign(a, { tipo: 'galinha', casa: p.clone(), destino: p.clone(), espera: rnd() * 3, bicar: 0, fase: rnd() * 6, fugindo: 0 });
    }
    for (let k = 0; k < 2 && naPraca.length; k++) {
      const p = sortear(naPraca), a = adicionar(gato(M));
      a.g.position.copy(p); a.g.rotation.y = rnd() * 6.28; a.g.scale.setScalar(1.15);
      Object.assign(a, { tipo: 'gato', casa: p.clone(), destino: p.clone(), espera: 6 + rnd() * 10, fase: rnd() * 6, andando: false });
    }
    const campina = (terreno.gramado ?? []).filter(q => { const d = Math.hypot(q.x - praca.x, q.z - praca.z); return d > raioPraca + 12 && d < raioPraca + 70; });
    for (let k = 0; k < 5 && campina.length; k++) {
      const p = sortear(campina), a = adicionar(coelho(M));
      a.g.position.copy(p); a.g.rotation.y = rnd() * 6.28;
      Object.assign(a, { tipo: 'coelho', casa: p.clone(), destino: p.clone(), espera: rnd() * 4, pulo: 0, fase: rnd() * 6, fugindo: 0 });
    }
    const pomar = (pontos.ilhotas ?? []).find(i => i.nome === 'pomar');
    if (pomar) {
      const cores = ['#f2c94c', '#9b6dd6', '#ffffff', '#f2994a', '#6fcf97', '#56ccf2'];
      for (let k = 0; k < 8; k++) {
        const a = adicionar(borboleta(M, cores[k % cores.length]));
        // sempre sobre o chão do Pomar (nunca em cima do vazio, na beira da ilhota)
        const chao = perto(new THREE.Vector3(pomar.x, 0, pomar.z), 0, 14);
        const base = chao.length ? sortear(chao).clone() : new THREE.Vector3(pomar.x, pomar.topo ?? 0, pomar.z);
        Object.assign(a, { tipo: 'borboleta', base, fase: rnd() * 6, fx: 0.3 + rnd() * 0.3, fz: 0.25 + rnd() * 0.3, r: 1.5 + rnd() * 2.5 });
      }
    }
  }
  // ----- Cap. 2: peixes de pano nadando no ar em volta da praça do Recife -----
  if (cap === 2) {
    const coresP = [['#e07a5f', '#f2cc8f', '#81b29a'], ['#3d5a80', '#98c1d9', '#ee6c4d'], ['#f4a261', '#2a9d8f', '#e9c46a'], ['#c77dff', '#ffd6a5', '#9bf6ff']];
    for (let k = 0; k < 7; k++) {
      const a = adicionar(peixe(M, coresP[k % coresP.length].map(c => mat(c))));
      const h = alturaEm(praca.x, praca.z) ?? 0;
      Object.assign(a, { tipo: 'peixe', centro: praca.clone().setY(h + 2.5 + rnd() * 3), raioNado: 6 + rnd() * 10, vel: (0.35 + rnd() * 0.25) * (rnd() < 0.5 ? 1 : -1), ang: rnd() * 6.28, fase: rnd() * 6 });
    }
  }

  function atualizar(dt, t, jog) {
    for (const a of lista) {
      if (!a.sempre && a.g.position.distanceToSquared(jog) > LONGE * LONGE) continue;
      const dJ = Math.hypot(a.g.position.x - jog.x, a.g.position.z - jog.z);
      if (a.tipo === 'gaivota') {
        // círculo largo, inclinando para dentro da curva; bate as asas em rajadas, depois plana
        a.ang += a.vel * dt;
        const x = a.centro.x + Math.cos(a.ang) * a.raioVoo, z = a.centro.z + Math.sin(a.ang) * a.raioVoo;
        a.g.position.set(x, a.altura + Math.sin(t * 0.4 + a.ang) * 1.5, z);
        a.g.rotation.set(0, Math.atan2(-Math.sin(a.ang) * Math.sign(a.vel), Math.cos(a.ang) * Math.sign(a.vel)), Math.sign(a.vel) * 0.35, 'YXZ');
        a.bater = (a.bater + dt) % 6;
        const bate = a.bater < 1.6 ? Math.sin(t * 11) * 0.7 : 0.12;
        for (const w of a.asas) w.pivo.rotation.z = w.lado * bate;
      } else if (a.tipo === 'galinha') {
        if (dJ < FOGE_GALINHA && !a.fugindo) { a.fugindo = 1.4; fugir(a, jog, 9); }
        if (a.fugindo > 0) {
          a.fugindo -= dt;
          andar(a, VEL.galinhaFuga, dt);
          for (const [k, p] of a.pernas.entries()) p.rotation.x = Math.sin(t * 22 + k * 3) * 0.7;
          a.pescoco.rotation.x = -0.3; a.g.position.y += Math.abs(Math.sin(t * 22)) * 0.05;
          if (a.fugindo <= 0) { a.fugindo = 0; a.espera = 1 + rnd() * 2; }
          continue;
        }
        if (a.espera > 0) {
          // parada: bica o chão de vez em quando
          a.espera -= dt; a.bicar = (a.bicar + dt) % 1.6;
          a.pescoco.rotation.x = a.bicar < 0.35 ? Math.sin(a.bicar / 0.35 * Math.PI) * 1.1 : Math.sin(t * 2 + a.fase) * 0.08;
          if (a.espera <= 0) novoDestino(a, 6);
        } else {
          const chegou = andar(a, VEL.galinha, dt);
          for (const [k, p] of a.pernas.entries()) p.rotation.x = Math.sin(t * 12 + k * 3) * 0.5;
          a.pescoco.rotation.x = Math.sin(t * 12) * 0.15;
          if (chegou) a.espera = 1.5 + rnd() * 3;
        }
      } else if (a.tipo === 'gato') {
        a.rabo.rotation.y = Math.sin(t * 1.4 + a.fase) * 0.5;
        if (a.andando) {
          a.g.rotation.x = 0;
          if (andar(a, VEL.gato, dt)) { a.andando = false; a.espera = 8 + rnd() * 14; }
        } else {
          // sentado: olha para a Brisa quando ela está perto (só a cabeça, até um limite)
          if (dJ < 8) {
            const alvo = Math.atan2(jog.x - a.g.position.x, jog.z - a.g.position.z) - a.g.rotation.y;
            const d = Math.max(-1, Math.min(1, Math.atan2(Math.sin(alvo), Math.cos(alvo))));
            a.cabeca.rotation.y += (d - a.cabeca.rotation.y) * Math.min(1, dt * 4);
          } else a.cabeca.rotation.y += (Math.sin(t * 0.3 + a.fase) * 0.4 - a.cabeca.rotation.y) * Math.min(1, dt * 2);
          if ((a.espera -= dt) <= 0) { a.andando = true; novoDestino(a, 8); }
        }
      } else if (a.tipo === 'coelho') {
        if (dJ < FOGE_COELHO && !a.fugindo) { a.fugindo = 2.2; fugir(a, jog, 16); }
        const vel = a.fugindo > 0 ? VEL.coelhoFuga : VEL.coelhoPulo;
        if (a.fugindo > 0 || a.espera <= 0) {
          // pulinhos: anda só no ar, o corpo estica no salto
          a.pulo = (a.pulo + dt * (a.fugindo > 0 ? 3.2 : 2.2)) % 1;
          const noAr = a.pulo < 0.55;
          if (noAr) { const chegou = andar(a, vel, dt); if (chegou && !a.fugindo) a.espera = 1 + rnd() * 4; } else noChao(a);
          a.g.position.y += noAr ? Math.sin(a.pulo / 0.55 * Math.PI) * 0.28 : 0;
          a.corpo.scale.z = 1.25 * (noAr ? 1.15 : 0.95);
          if (a.fugindo > 0 && (a.fugindo -= dt) <= 0) { a.fugindo = 0; a.espera = 2 + rnd() * 3; }
        } else {
          a.espera -= dt; a.corpo.scale.z = 1.25; noChao(a);
          if (a.espera <= 0) novoDestino(a, 10);
        }
      } else if (a.tipo === 'borboleta') {
        const s = t + a.fase;
        a.g.position.set(a.base.x + Math.sin(s * a.fx) * a.r, a.base.y + 1.2 + Math.sin(s * 1.3) * 0.5 + Math.sin(s * 0.37) * 0.8, a.base.z + Math.cos(s * a.fz) * a.r);
        _v.set(Math.cos(s * a.fx) * a.fx, 0, -Math.sin(s * a.fz) * a.fz);
        a.g.rotation.y = Math.atan2(_v.x, _v.z);
        const bate = Math.sin(t * 18 + a.fase) * 1.1;
        for (const w of a.asas) w.pivo.rotation.z = w.lado * bate;
      } else if (a.tipo === 'peixe') {
        a.ang += a.vel * dt;
        const x = a.centro.x + Math.cos(a.ang) * a.raioNado, z = a.centro.z + Math.sin(a.ang) * a.raioNado;
        a.g.position.set(x, a.centro.y + Math.sin(t * 0.8 + a.fase) * 0.6, z);
        a.g.rotation.y = Math.atan2(-Math.sin(a.ang) * Math.sign(a.vel), Math.cos(a.ang) * Math.sign(a.vel));
        // ondula: o rabo abana e os gomos acompanham, um atrás do outro
        a.rabo.rotation.y = Math.sin(t * 5 + a.fase) * 0.6;
        for (const [k, s] of a.gomos.entries()) s.position.x = Math.sin(t * 5 + a.fase - k * 0.9) * 0.03 * k;
      }
    }
  }

  return { raiz, atualizar, lista };
}
