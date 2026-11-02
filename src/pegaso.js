import * as THREE from 'three';

// Nuvem, o pônei alado de Aurélia: modelado aqui em código (sem arquivo), com formas arredondadas.
// Corpo branco-perolado, crina e rabo em mechas de cores de retalho, asas de penas que batem,
// cascos dourados, olhos grandes com brilho. Ele busca a Brisa no fim de cada capítulo e a leva
// pelo mapa das ilhas (mapaMundi.js).
// Anima sozinho: bater de asas, balanço do corpo, pernas dobradas no voo ou trotando no chão.

const COR = {
  corpo: '#fbf4fa', sombra: '#e6d8ee', casco: '#e2b048', olho: '#2a1d3a', focinho: '#f3d9e6',
  crina: ['#c9a7f2', '#f2a7c8', '#a7d8f2', '#f2d7a7'],
  asa: '#ffffff', asaPonta: '#d9c4f5',
};

function material(cor, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0, ...extra });
}

// mecha da crina ou do rabo: tubo que afina e cai em curva
function mecha(pontos, raio, cor) {
  const curva = new THREE.CatmullRomCurve3(pontos.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curva, 12, raio, 6, false);
  // afina até a ponta
  const pos = geo.attributes.position, n = 12 + 1, anel = 6 + 1;
  const centro = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    curva.getPointAt(i / (n - 1), centro);
    const k = 1 - (i / (n - 1)) * 0.85;
    for (let j = 0; j < anel; j++) {
      const idx = i * anel + j;
      v.fromBufferAttribute(pos, idx).sub(centro).multiplyScalar(k).add(centro);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material(cor, { roughness: 0.7 }));
}

// asa: penas em leque (cada pena é uma elipse achatada), presas num osso que gira para bater
function asa(lado) {
  const g = new THREE.Group();
  const formaPena = new THREE.Shape();
  formaPena.absellipse(0, 0, 0.09, 0.42, 0, Math.PI * 2);
  const geoPena = new THREE.ShapeGeometry(formaPena, 10);
  const matBase = material(COR.asa, { side: THREE.DoubleSide, roughness: 0.6 });
  const matPonta = material(COR.asaPonta, { side: THREE.DoubleSide, roughness: 0.6 });
  for (let k = 0; k < 7; k++) {
    const pena = new THREE.Mesh(geoPena, k > 4 ? matPonta : matBase);
    const t = k / 6;
    // de perto do corpo para a ponta: as penas abrem em leque para trás
    pena.position.set(lado * (0.12 + t * 0.62), 0.02 - t * 0.02, -0.05 - t * 0.22);
    pena.rotation.set(-Math.PI / 2 + 0.15, 0, lado * (0.25 + t * 1.05));
    pena.scale.setScalar(0.8 + t * 0.45);
    g.add(pena);
  }
  // a "mão" da asa (a borda de cima), arredondada
  const borda = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.6, 4, 8), matBase);
  borda.rotation.z = Math.PI / 2; borda.position.set(lado * 0.38, 0.03, 0.02);
  g.add(borda);
  return g;
}

export function criarPegaso() {
  const raiz = new THREE.Group(); raiz.name = 'pegaso';
  const corpoG = new THREE.Group(); raiz.add(corpoG);
  const mCorpo = material(COR.corpo), mSombra = material(COR.sombra), mCasco = material(COR.casco, { metalness: 0.6, roughness: 0.35 });

  // corpo: elipsoide alongado (de lado é um feijão)
  const tronco = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), mCorpo);
  tronco.scale.set(0.9, 0.85, 1.45); tronco.position.y = 1.0;
  corpoG.add(tronco);
  const barriga = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), mSombra);
  barriga.scale.set(0.85, 0.6, 1.25); barriga.position.set(0, 0.86, 0);
  corpoG.add(barriga);

  // pescoço e cabeça (grandes, como um pônei de desenho)
  const pescoco = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), mCorpo);
  pescoco.position.set(0, 1.42, 0.5); pescoco.rotation.x = 0.55;
  corpoG.add(pescoco);
  const cabecaG = new THREE.Group(); cabecaG.position.set(0, 1.78, 0.68); corpoG.add(cabecaG);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.27, 22, 16), mCorpo);
  cabeca.scale.set(0.95, 1, 1.05); cabecaG.add(cabeca);
  const focinho = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), material(COR.focinho));
  focinho.scale.set(1, 0.8, 1.1); focinho.position.set(0, -0.09, 0.22); cabecaG.add(focinho);
  for (const lado of [-1, 1]) {
    // olhos grandes, com o brilho
    const olho = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), material(COR.olho, { roughness: 0.2 }));
    olho.scale.set(0.8, 1.15, 0.6); olho.position.set(lado * 0.15, 0.05, 0.17); cabecaG.add(olho);
    const brilho = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    brilho.position.set(lado * 0.165, 0.09, 0.215); cabecaG.add(brilho);
    // narinas
    const narina = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), material('#c98aa8'));
    narina.position.set(lado * 0.06, -0.08, 0.39); cabecaG.add(narina);
    // orelhas
    const orelha = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), mCorpo);
    orelha.position.set(lado * 0.13, 0.27, -0.04); orelha.rotation.set(-0.2, 0, lado * -0.3); cabecaG.add(orelha);
  }
  // crina: mechas coloridas caindo do alto da cabeça pelo pescoço
  for (let k = 0; k < 6; k++) {
    const t = k / 5, cor = COR.crina[k % COR.crina.length];
    const y = 1.98 - t * 0.55, z = 0.62 - t * 0.42;
    corpoG.add(mecha([[0, y, z], [0.02, y - 0.1, z - 0.12], [0.06 * (k % 2 ? 1 : -1), y - 0.28, z - 0.2]], 0.055, cor));
  }
  // topete
  corpoG.add(mecha([[0, 2.02, 0.72], [0.02, 1.96, 0.88], [0, 1.86, 0.93]], 0.05, COR.crina[1]));
  // rabo: mechas longas que balançam
  const raboG = new THREE.Group(); raboG.position.set(0, 1.12, -0.6); corpoG.add(raboG);
  for (let k = 0; k < 4; k++) {
    const lado = (k - 1.5) * 0.05;
    raboG.add(mecha([[lado, 0, 0], [lado, -0.05, -0.22], [lado * 2, -0.35, -0.38], [lado * 2.5, -0.7, -0.42]], 0.06, COR.crina[k]));
  }
  // pernas: coxa + canela + casco dourado; o "joelho" é um grupo que dobra
  const pernas = [];
  for (const [x, z] of [[-0.2, 0.38], [0.2, 0.38], [-0.2, -0.38], [0.2, -0.38]]) {
    const coxa = new THREE.Group(); coxa.position.set(x, 0.85, z); corpoG.add(coxa);
    const alto = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.28, 4, 10), mCorpo); alto.position.y = -0.2; coxa.add(alto);
    const joelho = new THREE.Group(); joelho.position.y = -0.4; coxa.add(joelho);
    const baixo = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.24, 4, 10), mCorpo); baixo.position.y = -0.17; joelho.add(baixo);
    const casco = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.1, 12), mCasco); casco.position.y = -0.36; joelho.add(casco);
    pernas.push({ coxa, joelho, frente: z > 0, lado: x > 0 ? 1 : -1 });
  }
  // asas, presas nos ombros
  const asas = [-1, 1].map(lado => {
    const pivo = new THREE.Group(); pivo.position.set(lado * 0.3, 1.28, 0.18); corpoG.add(pivo);
    pivo.add(asa(lado));
    return { pivo, lado };
  });

  raiz.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  // modo: 'voando' (asas batendo, pernas recolhidas), 'pairando' (asas lentas) ou 'parado'
  let t = 0;
  function atualizar(dt, modo = 'voando', velocidade = 1) {
    t += dt;
    const bate = modo === 'voando' ? 9 * velocidade : modo === 'pairando' ? 5 : 1.5;
    const amp = modo === 'parado' ? 0.15 : modo === 'pairando' ? 0.6 : 0.9;
    for (const a of asas) {
      a.pivo.rotation.z = a.lado * (Math.sin(t * bate) * amp + (modo === 'parado' ? -0.9 : 0.15));
      a.pivo.rotation.y = a.lado * (modo === 'parado' ? -0.9 : 0.05);
    }
    // corpo sobe e desce com o bater das asas
    corpoG.position.y = modo === 'parado' ? 0 : Math.sin(t * bate - 0.6) * 0.06;
    corpoG.rotation.x = modo === 'voando' ? -0.08 : 0;
    cabecaG.rotation.x = Math.sin(t * 1.3) * 0.06;
    raboG.rotation.y = Math.sin(t * 2.1) * 0.35; raboG.rotation.x = 0.2 + Math.sin(t * 1.7) * 0.15;
    for (const p of pernas) {
      if (modo === 'parado') { p.coxa.rotation.x = 0; p.joelho.rotation.x = 0; continue; }
      // no voo as pernas vão recolhidas (dobradas para trás), balançando um pouco
      const s = Math.sin(t * 3 + (p.frente ? 0 : 1.5) + (p.lado > 0 ? 0.7 : 0)) * 0.15;
      p.coxa.rotation.x = (p.frente ? -0.7 : 0.6) + s;
      p.joelho.rotation.x = p.frente ? 1.3 : -0.4;
    }
  }
  atualizar(0, 'parado');
  return { raiz, atualizar, ALTURA_SELA: 1.38 };
}
