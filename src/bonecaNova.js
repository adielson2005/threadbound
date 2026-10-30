import * as THREE from 'three';

// Boneca redesenhada (Meshy, 28/10/2026), vestida no esqueleto e nas animações da boneca antiga.
//
// O modelo novo veio sem ossos e com 1,1 milhão de triângulos. Fora do jogo ele foi reduzido para
// 50 mil e ganhou pesos de ossos calculados por região (ver docs/PROGRESSO.md): cabeça, cabelo,
// braços, pernas, tronco e saia, com as mesmas juntas do esqueleto Mixamo da boneca antiga, só que
// nas posições do corpo novo. Tudo isso vem pronto em boneca_nova.bin/.json (posições já em
// unidades do FBX antigo, mesma altura e centro).
//
// Aqui o esqueleto antigo é "ajustado" ao corpo novo: cada junta vai para a posição nova e cada
// osso gira o mínimo para apontar para o filho novo. As animações gravam a rotação de cada osso em
// relação ao pai, então, presa a ossos que apontam ao longo do corpo novo, a malha nova se move como
// a antiga se movia. O que muda é só a posição das juntas: as trilhas de posição das animações são
// ajustadas para isso (adaptarTrilhas).

const PASTA = new URL('../assets/boneca/', import.meta.url).href;
const M = n => 'mixamorig' + n;

// osso -> filho para onde ele aponta (o quadril não gira: é a referência das animações)
const APONTA = {
  Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  ...Object.fromEntries(['Left', 'Right'].flatMap(l => [
    [`${l}Shoulder`, `${l}Arm`], [`${l}Arm`, `${l}ForeArm`], [`${l}ForeArm`, `${l}Hand`], [`${l}Hand`, `${l}HandMiddle1`],
    [`${l}UpLeg`, `${l}Leg`], [`${l}Leg`, `${l}Foot`], [`${l}Foot`, `${l}ToeBase`], [`${l}ToeBase`, `${l}Toe_End`],
  ])),
};

export async function carregarBonecaNova(aoProgredir) {
  const [info, bin] = await Promise.all([
    fetch(PASTA + 'boneca_nova.json').then(r => r.json()),
    fetch(PASTA + 'boneca_nova.bin').then(r => r.arrayBuffer()),
  ]);
  aoProgredir?.({ loaded: 1, total: 1 });
  const n = info.vertices;
  let o = 0;
  const pega = (Tipo, k) => { const a = new Tipo(bin, o, k); o += k * Tipo.BYTES_PER_ELEMENT; return a; };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pega(Float32Array, n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(pega(Float32Array, n * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(pega(Float32Array, n * 2), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(pega(Uint8Array, n * 4), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(pega(Uint8Array, n * 4), 4, true));
  geo.setIndex(new THREE.BufferAttribute(pega(Uint16Array, info.indices), 1));
  return { info, geo };
}

// Veste a malha nova no esqueleto do FBX (ainda na origem, sem pai). Devolve as posições locais dos
// ossos antes e depois do ajuste e a razão entre as alturas do quadril.
export function vestirBonecaNova(fbx, { info, geo }) {
  fbx.updateMatrixWorld(true);
  const ossos = [];
  fbx.traverse(b => { if (b.isBone) ossos.push(b); });
  const antigas = new Map(ossos.map(b => [b.name, b.position.clone()]));
  const mundoAntigo = new Map(ossos.map(b => [b.name, b.getWorldPosition(new THREE.Vector3())]));
  const giroAntigo = new Map(ossos.map(b => [b.name, b.getWorldQuaternion(new THREE.Quaternion())]));
  const juntas = new Map(Object.entries(info.juntas).map(([k, v]) => [k, new THREE.Vector3(...v)]));

  // ossos sem junta própria (dedos, mechas da boneca antiga) encolhem junto com o pai
  const proporcao = (a, b) => juntas.get(M(b)).distanceTo(juntas.get(M(a))) / mundoAntigo.get(M(b)).distanceTo(mundoAntigo.get(M(a)));
  const escalaMao = { Left: proporcao('LeftHand', 'LeftHandMiddle1'), Right: proporcao('RightHand', 'RightHandMiddle1') };
  const escalaCabeca = proporcao('Head', 'HeadTop_End');

  const q = new THREE.Quaternion(), pai = new THREE.Quaternion();
  for (const b of ossos) { // pai antes do filho
    b.parent.updateMatrixWorld(true);
    const nome = b.name.replace('mixamorig', '');
    const alvo = juntas.get(b.name);
    if (alvo) b.position.copy(b.parent.worldToLocal(alvo.clone()));
    else b.position.multiplyScalar(nome.includes('Hand') ? escalaMao[nome.startsWith('Left') ? 'Left' : 'Right'] : escalaCabeca);
    const filho = APONTA[nome];
    if (alvo && filho && juntas.has(M(filho))) {
      const dirAntiga = mundoAntigo.get(M(filho)).clone().sub(mundoAntigo.get(b.name)).normalize();
      const dirNova = juntas.get(M(filho)).clone().sub(alvo).normalize();
      q.setFromUnitVectors(dirAntiga, dirNova).multiply(giroAntigo.get(b.name));
      b.parent.getWorldQuaternion(pai);
      b.quaternion.copy(pai.invert().multiply(q));
    }
    b.updateMatrixWorld(true);
  }
  fbx.updateMatrixWorld(true);

  // cabelo solto: três cadeias de ossos novos presas à cabeça (centro, esquerda, direita), que
  // balançam com a física de criarCabelo; no repouso têm a mesma orientação da cabeça
  const cabeca = ossos.find(b => b.name === M('Head'));
  const cadeias = Object.entries(info.cabelo).map(([lado, pontos]) => {
    let pai = cabeca;
    const cadeia = [];
    for (let i = 0; i < pontos.length - 1; i++) {
      const b = new THREE.Bone();
      b.name = `Cabelo${lado}${i + 1}`;
      pai.add(b);
      pai.updateMatrixWorld(true);
      b.position.copy(pai.worldToLocal(new THREE.Vector3(...pontos[i])));
      b.updateMatrixWorld(true);
      ossos.push(b); cadeia.push(b); pai = b;
    }
    const ponta = new THREE.Object3D(); // só marca onde termina o último osso
    pai.add(ponta);
    ponta.position.copy(pai.worldToLocal(new THREE.Vector3(...pontos.at(-1))));
    return { ossos: cadeia, ponta };
  });

  const porNome = new Map(ossos.map(b => [b.name, b]));
  const esqueleto = new THREE.Skeleton(info.ossos.map(nome => porNome.get(nome)));
  const malha = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial()); // material: aplicarQualidadeBoneca
  malha.name = 'boneca_nova';
  // as posições da malha (e as juntas) estão no espaço do mundo com o FBX na origem; a raiz do FBX
  // pode ter escala própria, então a malha leva a transformação inversa da raiz
  fbx.add(malha);
  fbx.matrixWorld.clone().invert().decompose(malha.position, malha.quaternion, malha.scale);
  malha.updateMatrixWorld(true);
  malha.bind(esqueleto, malha.matrixWorld);

  const hips = porNome.get(M('Hips'));
  // altura do quadril acima da ponta do pé, no esqueleto novo e no antigo
  const pe = M('LeftToe_End');
  const razaoQuadril = (hips.getWorldPosition(new THREE.Vector3()).y - juntas.get(pe).y) / (mundoAntigo.get(hips.name).y - mundoAntigo.get(pe).y);
  const novas = new Map(ossos.map(b => [b.name, b.position.clone()]));
  return { malha, antigas, novas, razaoQuadril, hips: hips.name, cadeias };
}

// Trilhas de posição das animações da boneca antiga -> juntas novas. Nos ossos comuns a posição é
// fixa (o comprimento do osso): passa a ser a nova. No quadril o balanço (subir e descer ao andar,
// agachar) cresce na proporção das pernas.
export function adaptarTrilhas(clipe, { antigas, novas, razaoQuadril, hips }) {
  for (const t of clipe.tracks) {
    const [nome, prop] = t.name.split('.');
    if (prop !== 'position' || !novas.has(nome)) continue;
    const a = antigas.get(nome), n = novas.get(nome), k = nome === hips ? razaoQuadril : 1;
    for (let i = 0; i < t.values.length; i += 3) {
      t.values[i] = n.x + (t.values[i] - a.x) * k;
      t.values[i + 1] = n.y + (t.values[i + 1] - a.y) * k;
      t.values[i + 2] = n.z + (t.values[i + 2] - a.z) * k;
    }
  }
}

// ---------- cabelo que balança ----------
// Cada junta das cadeias de cabelo é uma partícula (Verlet) no mundo: tem inércia (fica para trás
// quando a Brisa corre ou vira, e balança depois), é puxada de volta à pose de repouso (a que a
// cabeça leva) por uma mola e cai um pouco com a gravidade. O comprimento de cada osso é mantido.
// Colisão: o corpo vira um punhado de cápsulas presas aos ossos (tronco, cabeça, braços,
// antebraços e mãos). Cada pedaço da mecha (o segmento entre duas juntas, não só as juntas) é
// empurrado para fora delas. Um braço rápido (soco) pode pular a mecha de um quadro para o outro;
// por isso o lado certo é o da pose de repouso: se a mecha ficou do outro lado do braço, ela volta
// por cima dele em vez de ser empurrada para dentro. No fim cada osso gira para apontar para a
// partícula seguinte. Roda depois da animação e dos ajustes de postura.
const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3();
// pontos mais próximos entre os segmentos p1–q1 e p2–q2 (Ericson, Real-Time Collision Detection 5.1.9)
function maisProximos(p1, q1, p2, q2, c1, c2) {
  const d1 = _s.subVectors(q1, p1), d2 = _t.subVectors(q2, p2), r = _r.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-10 && e < 1e-10) { s = t = 0; }
  else if (a < 1e-10) { s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e < 1e-10) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-10 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s); c2.copy(p2).addScaledVector(d2, t);
  return s;
}

export function criarCabelo(cadeias, ossos, opcoes = {}) {
  // espessura: a mecha é uma cortina em volta da linha dos ossos, não uma linha (m)
  // (mais contido que antes: com 63° de ângulo e pouco amortecimento a mecha dava a volta por cima
  // do ombro e embolava na frente quando ela parava de correr)
  const { mola = 0.16, amortecimento = 0.8, gravidade = 2.5, anguloMax = 0.7, iteracoes = 4, espessura = 0.04 } = opcoes;
  const osso = n => ossos[M(n)];
  // cápsulas do corpo: [osso inicial, osso final, raio em m, encurta a ponta (fração)]
  const CAPSULAS = [
    ['Hips', 'Neck', 0.155, 0, false], ['Head', 'HeadTop_End', 0.13, 0.25, false],
    ...['Left', 'Right'].flatMap(l => [
      // (braço e antebraço um pouco mais grossos: balançando para trás na corrida, o braço entrava no
      // volume do cabelo, que é mais largo que a linha dos ossos)
      [`${l}Arm`, `${l}ForeArm`, 0.09], [`${l}ForeArm`, `${l}Hand`, 0.07], [`${l}Hand`, `${l}HandMiddle1`, 0.05],
    ]),
  // (tronco e cabeça já com a folga da pose de repouso; nos membros soma a espessura da mecha)
  ].map(([a, b, raio, corte = 0, grossa = true]) => ({ a: osso(a), b: osso(b), raio: raio + (grossa ? espessura : 0), corte, cabeca: a === 'Head', pa: new THREE.Vector3(), pb: new THREE.Vector3() }))
    .filter(c => c.a && c.b);
  const repouso = cadeias.map(c => c.ossos.map(b => b.quaternion.clone()));
  const pontos = c => [...c.ossos.slice(1), c.ponta];
  let estado = null;
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  const cH = new THREE.Vector3(), cC = new THREE.Vector3();
  const qMundo = new THREE.Quaternion(), qPai = new THREE.Quaternion(), giro = new THREE.Quaternion();

  function poseRepouso(ci) {
    cadeias[ci].ossos.forEach((o, k) => o.quaternion.copy(repouso[ci][k]));
    cadeias[ci].ossos[0].updateMatrixWorld(true);
    return pontos(cadeias[ci]).map(p => p.getWorldPosition(new THREE.Vector3()));
  }
  // empurra a junta p para fora das cápsulas do corpo, pela direção de agora (macio: metade da
  // profundidade por iteração). Antes era o segmento inteiro da mecha, e o lado vinha da pose de
  // repouso: com o braço passando rápido na corrida, a direção mais próxima entre dois segmentos
  // e o lado escolhido pulavam de um quadro para o outro e a mecha tremia (medido com passo fixo:
  // tremor na corrida 27 → 14 mm/quadro², cabelo dentro do braço 108 → 78 pontos; parada, 0 e 0)
  function colidir(anterior, p, primeiro) {
    for (const c of CAPSULAS) {
      if (primeiro && c.cabeca) continue; // o primeiro osso nasce dentro da cabeça
      maisProximos(p, p, c.pa, c.pb, cH, cC);
      _n.subVectors(cH, cC);
      const dist = _n.length(), prof = c.raio - dist;
      if (prof <= 0) continue;
      if (dist > 1e-6) _n.divideScalar(dist); else _n.subVectors(p, anterior).normalize();
      p.addScaledVector(_n, 0.5 * prof);
    }
  }
  return {
    reiniciar() { estado = null; },
    atualizar(dt) {
      if (!(dt > 0)) return;
      const passo = Math.min(dt, 1 / 30) * 60; // mesma resposta em 30 ou 60 quadros por segundo
      if (!estado) estado = cadeias.map(() => null);
      for (const c of CAPSULAS) {
        c.a.getWorldPosition(c.pa); c.b.getWorldPosition(c.pb);
        if (c.corte) c.pb.lerp(c.pa, c.corte);
      }
      cadeias.forEach((cadeia, ci) => {
        const alvo = poseRepouso(ci);
        const raiz = cadeia.ossos[0].getWorldPosition(new THREE.Vector3());
        const comprimentos = alvo.map((p, k) => p.distanceTo(k ? alvo[k - 1] : raiz));
        // a pose de repouso também sai de dentro do corpo: as mechas do lado, em repouso, encostam
        // nos braços (a animação os aproxima), e a mola puxava a mecha para dentro deles enquanto
        // a colisão empurrava para fora — um cabo de guerra que tremia a cada quadro
        {
          let ant = raiz;
          for (let k = 0; k < alvo.length; k++) {
            colidir(ant, alvo[k], k === 0);
            alvo[k].sub(ant).setLength(comprimentos[k]).add(ant);
            ant = alvo[k];
          }
        }
        let e = estado[ci];
        // primeira vez, ou um salto grande (teleporte, renascer): começa em repouso
        if (!e || e.atual[0].distanceTo(alvo[0]) > 1.5) e = estado[ci] = { atual: alvo.map(p => p.clone()), antes: alvo.map(p => p.clone()), livre: alvo.map(p => p.clone()), mostrado: alvo.map(p => p.clone()) };
        for (let k = 0; k < alvo.length; k++) {
          const p = e.atual[k], ant = e.antes[k];
          v.subVectors(p, ant).multiplyScalar(Math.pow(amortecimento, passo));
          ant.copy(p);
          p.add(v).addScaledVector(d.subVectors(alvo[k], p), 1 - Math.pow(1 - mola, passo));
          p.y -= gravidade * (dt * dt);
        }
        // comprimentos, ângulo máximo em relação ao repouso e colisão com o corpo, algumas
        // vezes (empurrar para fora de um braço pode encostar no tronco)
        for (let k = 0; k < alvo.length; k++) e.livre[k].copy(e.atual[k]);
        for (let it = 0; it < iteracoes; it++) {
          let anterior = raiz, alvoAnterior = raiz;
          for (let k = 0; k < alvo.length; k++) {
            const p = e.atual[k];
            const dirRepouso = a.subVectors(alvo[k], alvoAnterior).normalize();
            const dir = b.subVectors(p, anterior).normalize();
            const ang = dir.angleTo(dirRepouso);
            if (ang > anguloMax) {
              const eixo = d.crossVectors(dirRepouso, dir).normalize();
              if (eixo.lengthSq() > 0) dir.copy(dirRepouso).applyAxisAngle(eixo, anguloMax);
            }
            p.copy(anterior).addScaledVector(dir, comprimentos[k]);
            colidir(anterior, p, k === 0);
            p.sub(anterior).setLength(comprimentos[k]).add(anterior);
            anterior = p; alvoAnterior = alvo[k];
          }
        }
        // o que as restrições e a colisão mexeram não vira velocidade (choque sem quique): antes, cada
        // empurrão para fora do braço fazia a mecha quicar e voltar para dentro no quadro seguinte
        for (let k = 0; k < alvo.length; k++) e.antes[k].add(d.subVectors(e.atual[k], e.livre[k]).multiplyScalar(0.85));
        // o que aparece na tela segue a simulação com um filtro curto (meio quadro de atraso): tira o
        // vai-e-volta de um quadro só que sobrava com o braço passando pelo cabelo na corrida
        const filtro = 1 - Math.pow(0.45, passo);
        for (let k = 0; k < alvo.length; k++) e.mostrado[k].lerp(e.atual[k], filtro);
        // ossos apontando para as partículas (do primeiro ao último)
        let base = raiz;
        cadeia.ossos.forEach((o, k) => {
          const pontaRepouso = pontos(cadeia)[k].getWorldPosition(a);
          const origem = o.getWorldPosition(b);
          giro.setFromUnitVectors(d.subVectors(pontaRepouso, origem).normalize(), v.subVectors(e.mostrado[k], base).normalize());
          o.getWorldQuaternion(qMundo).premultiply(giro);
          o.parent.getWorldQuaternion(qPai);
          o.quaternion.copy(qPai.invert().multiply(qMundo));
          o.updateMatrixWorld(true);
          base = e.mostrado[k];
        });
      });
    },
    // (para os testes) distância de cada segmento de mecha a cada cápsula, menos o raio (m)
    folgas() {
      const out = [];
      for (const c of CAPSULAS) { c.a.getWorldPosition(c.pa); c.b.getWorldPosition(c.pb); if (c.corte) c.pb.lerp(c.pa, c.corte); }
      cadeias.forEach((cadeia, ci) => {
        let anterior = cadeia.ossos[0].getWorldPosition(new THREE.Vector3());
        for (const pt of pontos(cadeia)) {
          const p = pt.getWorldPosition(new THREE.Vector3());
          CAPSULAS.forEach((c, k) => { maisProximos(anterior, p, c.pa, c.pb, cH, cC); out.push([ci, k, cH.distanceTo(cC) - c.raio]); });
          anterior = p;
        }
      });
      return out;
    },
  };
}
