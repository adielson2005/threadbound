import * as THREE from 'three';
import { criarPegaso } from './pegaso.js';

// Mapa das ilhas (como o mapa do mundo de um jogo de plataforma): o mar, as quatro ilhas de cada
// capítulo ligadas por uma trilha de linha dourada, e o Nuvem (o pônei alado) voando de ilha em
// ilha. ◀ ▶ (ou tocar na ilha) escolhe; Enter/Espaço (ou "Embarcar") voa para o capítulo.
// Abre no fim de cada capítulo (depois da fuga com o Nuvem) e pelo menu Capítulos.
// Cena própria, desenhada com o mesmo renderer do jogo (nenhum contexto WebGL a mais).

const ILHAS = [
  { n: 1, nome: 'A Vila de Maré Alta', resumo: 'A ilha costurada no céu', pos: [-9, 0, 2], cor: '#7fbf5a' },
  { n: 2, nome: 'O Recife das Vozes', resumo: 'Destroços sob a tempestade parada', pos: [-2.5, 0, -3], cor: '#5f7d8c' },
  { n: 3, nome: 'O Jardim Submerso', resumo: 'O fundo do mar antigo', pos: [4, 0, 2.5], cor: '#d9c08a' },
  { n: 4, nome: 'A Costura no Céu', resumo: 'O olho da tempestade', pos: [10, 3.2, -2.5], cor: '#c9a7f2' },
];

const mat = (cor, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, flatShading: true, ...extra });

// ---------- as ilhas em miniatura (cada capítulo com a sua cara) ----------
function base(raio, altura, corTopo, corRocha) {
  const g = new THREE.Group();
  const rocha = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio * 0.55, altura, 9), mat(corRocha));
  rocha.position.y = -altura / 2 + 0.15; g.add(rocha);
  const topo = new THREE.Mesh(new THREE.CylinderGeometry(raio * 1.02, raio, 0.3, 9), mat(corTopo));
  topo.position.y = 0.15; g.add(topo);
  return g;
}
function casinha(x, z, corTelhado) {
  const g = new THREE.Group();
  const parede = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.36), mat('#f2e6d0')); parede.position.y = 0.46; g.add(parede);
  const telhado = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 4), mat(corTelhado)); telhado.position.y = 0.75; telhado.rotation.y = Math.PI / 4; g.add(telhado);
  g.position.set(x, 0, z); return g;
}
function arvore(x, z, cor = '#4f8f3a') {
  const g = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), mat('#7a5232')); tronco.position.y = 0.45; g.add(tronco);
  const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mat(cor)); copa.position.y = 0.75; g.add(copa);
  g.position.set(x, 0, z); return g;
}
function ilhaVila() {
  const g = base(2.0, 1.6, '#7fbf5a', '#8a7a68');
  g.add(casinha(-0.6, 0.3, '#d9a08a'), casinha(0.1, 0.7, '#c9a07e'), casinha(-0.2, -0.4, '#a9b0bd'));
  for (const [x, z] of [[1.0, -0.6], [1.3, 0.2], [0.8, 0.9], [-1.2, -0.5]]) g.add(arvore(x, z));
  // farol listrado e o Coração no morro
  for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.12 - k * 0.01, 0.13 - k * 0.01, 0.22, 10), mat(k % 2 ? '#d9584a' : '#f6efe4')); f.position.set(1.45, 0.42 + k * 0.22, -1.1); g.add(f); }
  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe9a0' })); luz.position.set(1.45, 1.38, -1.1); g.add(luz);
  const coracao = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: '#ff9ab8' })); coracao.position.set(-0.6, 1.0, -1.0); coracao.userData.gira = true; g.add(coracao);
  return g;
}
function ilhaRecife() {
  const g = base(1.7, 1.4, '#6d8794', '#4c5a63');
  // rochas e corais coloridos, um casco de barco encalhado e a nuvem de tempestade em cima
  for (let k = 0; k < 6; k++) { const a = k * 1.1, r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + (k % 3) * 0.08, 0), mat('#55646d')); r.position.set(Math.cos(a) * 1.1, 0.4, Math.sin(a) * 1.0); g.add(r); }
  for (const [x, z, c] of [[0.3, 0.6, '#f28a7a'], [-0.7, 0.2, '#f2b36a'], [0.8, -0.3, '#b48fd6'], [-0.2, -0.8, '#f28a7a']]) { const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 5), mat(c)); c1.position.set(x, 0.5, z); g.add(c1); }
  const casco = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.3, 10, 1, true, 0, Math.PI), mat('#7a5232', { side: THREE.DoubleSide }));
  casco.rotation.set(0, 0.5, Math.PI / 2 + 0.3); casco.position.set(-0.1, 0.55, 0); g.add(casco);
  const nuvem = new THREE.Group();
  for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.4 + (k % 2) * 0.15, 10, 8), mat('#6b6f80', { flatShading: false })); b.position.set((k - 2) * 0.42, 0, (k % 2) * 0.2); nuvem.add(b); }
  nuvem.position.y = 2.6; nuvem.userData.balanca = true; g.add(nuvem);
  return g;
}
function ilhaJardim() {
  const g = base(1.9, 1.5, '#d9c08a', '#a8906a');
  // flores de pedra, colunas e corais petrificados
  for (let k = 0; k < 5; k++) {
    const a = k * 1.25, x = Math.cos(a) * 0.9, z = Math.sin(a) * 0.9;
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6), mat('#9a9488')); haste.position.set(x, 0.55, z); g.add(haste);
    const flor = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), mat(['#f2a7c8', '#c9a7f2', '#f2d7a7'][k % 3])); flor.position.set(x, 0.85, z); g.add(flor);
  }
  for (const [x, z] of [[-0.3, -0.2], [0.35, 0.25]]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8), mat('#e8e0d0')); col.position.set(x, 0.7, z); g.add(col); }
  const arco = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 14, Math.PI), mat('#e8e0d0')); arco.position.set(0.02, 1.1, 0.02); arco.rotation.y = 0.8; g.add(arco);
  return g;
}
function ilhaCostura() {
  const g = new THREE.Group();
  // ilha flutuante (cone de pedra virado) com agulha gigante, carretéis e um fio dourado
  const rocha = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.2, 8), mat('#8a7fa0')); rocha.rotation.x = Math.PI; rocha.position.y = -1.0; g.add(rocha);
  const topo = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.5, 0.25, 8), mat('#c9a7f2')); topo.position.y = 0.12; g.add(topo);
  const agulha = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 2.0, 8), mat('#dfe6f2', { metalness: 0.8, roughness: 0.25, flatShading: false }));
  agulha.position.set(0.2, 1.2, 0); agulha.rotation.z = -0.35; g.add(agulha);
  for (const [x, z, c] of [[-0.6, 0.4, '#f2a7c8'], [0.7, -0.5, '#a7d8f2']]) {
    const carretel = new THREE.Group();
    const meio = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12), mat(c)); carretel.add(meio);
    for (const y of [-0.17, 0.17]) { const aba = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12), mat('#c9a989')); aba.position.y = y; carretel.add(aba); }
    carretel.position.set(x, 0.45, z); g.add(carretel);
  }
  const fio = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.2, 2.15, 0], [1.0, 2.6, 0.4], [1.6, 1.5, 0.2], [1.2, 0.4, -0.3]].map(p => new THREE.Vector3(...p))), 24, 0.025, 5), new THREE.MeshBasicMaterial({ color: '#f2c76b' }));
  g.add(fio);
  g.userData.flutua = true;
  return g;
}
const MODELOS = [ilhaVila, ilhaRecife, ilhaJardim, ilhaCostura];

export function criarMapaMundi({ renderer, aoEmbarcar, aoFechar }) {
  const cena = new THREE.Scene();
  cena.background = new THREE.Color('#9fd3f2');
  cena.fog = new THREE.Fog('#9fd3f2', 26, 60);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  cena.add(new THREE.HemisphereLight('#ffffff', '#6a8fa0', 1.6));
  const sol = new THREE.DirectionalLight('#fff0d4', 2.2); sol.position.set(6, 12, 8); cena.add(sol);

  // mar com ondinhas (vértices sobem e descem no shader)
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(140, 80, 70, 40).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { tempo: { value: 0 } },
    vertexShader: `uniform float tempo; varying float vOnda; varying vec2 vXZ;
      void main() { vec3 p = position; float o = sin(p.x * 0.6 + tempo * 1.2) * 0.12 + cos(p.z * 0.8 + tempo * 0.9) * 0.1; p.y += o; vOnda = o; vXZ = p.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying float vOnda; varying vec2 vXZ;
      void main() { vec3 fundo = vec3(0.16, 0.45, 0.66), claro = vec3(0.35, 0.72, 0.85);
        float k = smoothstep(-0.2, 0.22, vOnda); vec3 c = mix(fundo, claro, k);
        c += vec3(1.0) * smoothstep(0.17, 0.22, vOnda) * 0.25; // cristas
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  mar.position.y = -0.6; cena.add(mar);

  // ilhas
  const ilhas = ILHAS.map((d, i) => {
    const g = MODELOS[i](); g.position.set(...d.pos); cena.add(g);
    // anel de luz em volta: dourado (aberta), verde (concluída) ou cinza (trancada)
    const anel = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 6, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2c76b', transparent: true, opacity: 0.8 }));
    anel.position.set(d.pos[0], d.pos[1] > 1 ? d.pos[1] - 0.1 : -0.35, d.pos[2]); cena.add(anel);
    const mats = []; g.traverse(o => { if (o.isMesh) mats.push(o.material); });
    return { ...d, g, anel, mats, cores: mats.map(m => m.color?.clone()) };
  });

  // trilha de linha dourada entre as ilhas (pontinhos), com o voo do Nuvem por cima dela
  const pontos = ILHAS.map(d => new THREE.Vector3(d.pos[0], (d.pos[1] || 0) + 1.6, d.pos[2]));
  const trilha = new THREE.CatmullRomCurve3(pontos, false, 'catmullrom', 0.4);
  const geoPonto = new THREE.SphereGeometry(0.07, 6, 5);
  const pontinhos = new THREE.InstancedMesh(geoPonto, new THREE.MeshBasicMaterial({ color: '#fff2b0' }), 70);
  const m4 = new THREE.Matrix4(), q = new THREE.Vector3();
  for (let i = 0; i < 70; i++) { trilha.getPoint(i / 69, q); q.y -= 1.1; m4.makeTranslation(q.x, Math.max(q.y, -0.2), q.z); pontinhos.setMatrixAt(i, m4); }
  cena.add(pontinhos);
  // parâmetro da curva em cada ilha (para voar de uma até a outra pela trilha)
  const tIlha = ILHAS.map((_, i) => i / (ILHAS.length - 1));

  const nuvem = criarPegaso();
  nuvem.raiz.scale.setScalar(0.75);
  cena.add(nuvem.raiz);

  // ---------- tela (HTML por cima) ----------
  const el = document.getElementById('mapaMundi');
  const titulo = el.querySelector('.mm-nome'), resumo = el.querySelector('.mm-resumo'), estadoIlha = el.querySelector('.mm-estado');
  const botaoEmbarcar = el.querySelector('.mm-embarcar');
  let aberto = false, atual = 0, alvo = 0, voo = 1, de = 0, liberadas = [true, false, false, false], concluidas = [], tempo = 0;

  function mostrarIlha() {
    const d = ILHAS[alvo];
    titulo.textContent = `${d.n}. ${d.nome}`;
    resumo.textContent = d.resumo;
    estadoIlha.textContent = concluidas.includes(d.n) ? 'Concluída ✓' : liberadas[alvo] ? 'Aberta' : 'Trancada: termine a ilha anterior';
    botaoEmbarcar.disabled = !liberadas[alvo];
    botaoEmbarcar.textContent = liberadas[alvo] ? `Embarcar para a ilha ${d.n}` : 'Trancada';
    ilhas.forEach((ilha, i) => {
      const tranc = !liberadas[i];
      ilha.mats.forEach((m, k) => { if (m.color && ilha.cores[k]) m.color.copy(ilha.cores[k]).multiplyScalar(tranc ? 0.45 : 1); });
      ilha.anel.material.color.set(tranc ? '#7a7a88' : concluidas.includes(ilha.n) ? '#8fe38a' : '#f2c76b');
      ilha.anel.material.opacity = i === alvo ? 1 : 0.45;
    });
  }
  function irPara(i) {
    i = THREE.MathUtils.clamp(i, 0, ILHAS.length - 1);
    if (i === alvo && voo >= 1) return;
    de = atual; alvo = i; voo = 0;
    mostrarIlha();
  }
  function embarcar() { if (aberto && voo >= 1 && liberadas[alvo]) aoEmbarcar?.(ILHAS[alvo].n); }

  // abre o mapa: "de" é a ilha onde o Nuvem está; "para" (opcional) é para onde ele já sai voando
  function abrir({ de: ilhaDe = 1, para = null, concluidos = [], liberadas: lib = null } = {}) {
    concluidas = concluidos;
    liberadas = lib ?? ILHAS.map(d => d.n === 1 || concluidos.includes(d.n - 1) || concluidos.includes(d.n));
    atual = alvo = ilhaDe - 1; voo = 1; de = atual;
    el.style.display = 'flex'; requestAnimationFrame(() => { el.style.opacity = 1; });
    aberto = true;
    mostrarIlha();
    if (para && para !== ilhaDe) setTimeout(() => irPara(para - 1), 700);
    botaoEmbarcar.focus({ preventScroll: true, focusVisible: false });
  }
  function fechar() {
    aberto = false; el.style.opacity = 0;
    setTimeout(() => { if (!aberto) el.style.display = 'none'; }, 250);
  }

  const posNuvem = new THREE.Vector3(), olhar = new THREE.Vector3(), alvoCam = new THREE.Vector3(), _posCam = new THREE.Vector3();
  function atualizar(dt) {
    if (!aberto) return;
    tempo += dt;
    mar.material.uniforms.tempo.value = tempo;
    for (const ilha of ilhas) ilha.g.traverse(o => {
      if (o.userData.gira) o.rotation.y = tempo * 1.5;
      if (o.userData.balanca) o.position.x = Math.sin(tempo * 0.5) * 0.3;
    });
    ilhas[3].g.position.y = ILHAS[3].pos[1] + Math.sin(tempo * 0.8) * 0.15;
    // voo pela trilha, de uma ilha à outra (suave no começo e no fim)
    let t;
    if (voo < 1) {
      voo = Math.min(1, voo + dt / (0.9 + Math.abs(alvo - de) * 0.6));
      const k = voo * voo * (3 - 2 * voo);
      t = tIlha[de] + (tIlha[alvo] - tIlha[de]) * k;
      if (voo >= 1) atual = alvo;
    } else t = tIlha[atual];
    trilha.getPoint(t, posNuvem);
    trilha.getPoint(THREE.MathUtils.clamp(t + (alvo >= de ? 0.01 : -0.01), 0, 1), olhar);
    nuvem.raiz.position.copy(posNuvem);
    if (voo < 1) nuvem.raiz.lookAt(olhar.x, posNuvem.y, olhar.z);
    else nuvem.raiz.rotation.y += (Math.atan2(0, 1) - nuvem.raiz.rotation.y) * Math.min(1, dt * 3); // de frente para a câmera
    nuvem.atualizar(dt, voo < 1 ? 'voando' : 'pairando', 1.2);
    // câmera acompanha de cima e de frente
    // (o alvo um pouco para trás: as ilhas ficam no meio da tela, longe do título no alto)
    alvoCam.set(posNuvem.x * 0.8, 0.5, -2.2);
    camera.position.lerp(_posCam.set(alvoCam.x, 10.5, 14), Math.min(1, dt * 2));
    camera.lookAt(alvoCam);
  }
  function desenhar() {
    const t = renderer.getSize(new THREE.Vector2());
    if (camera.aspect !== t.x / t.y) { camera.aspect = t.x / t.y; camera.updateProjectionMatrix(); }
    renderer.setRenderTarget(null);
    renderer.render(cena, camera);
  }

  // controles: teclado, toque nas setas e nas ilhas
  addEventListener('keydown', e => {
    if (!aberto) return;
    if (['ArrowRight', 'KeyD'].includes(e.code)) { irPara(alvo + 1); e.preventDefault(); }
    else if (['ArrowLeft', 'KeyA'].includes(e.code)) { irPara(alvo - 1); e.preventDefault(); }
    else if (['Enter', 'Space'].includes(e.code) && !e.repeat) { embarcar(); e.preventDefault(); }
    else if (e.code === 'Escape') { aoFechar?.(); }
    e.stopImmediatePropagation();
  }, true);
  el.querySelector('.mm-esq').addEventListener('click', () => irPara(alvo - 1));
  el.querySelector('.mm-dir').addEventListener('click', () => irPara(alvo + 1));
  botaoEmbarcar.addEventListener('click', embarcar);
  el.querySelector('.mm-voltar').addEventListener('click', () => aoFechar?.());
  // tocar numa ilha
  const rc = new THREE.Raycaster(), ponteiro = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', e => {
    if (!aberto) return;
    const r = renderer.domElement.getBoundingClientRect();
    ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ponteiro, camera);
    const i = ilhas.findIndex(ilha => rc.intersectObject(ilha.g, true).length);
    if (i >= 0) irPara(i);
  });

  camera.position.set(-6, 10, 15);
  return { abrir, fechar, atualizar, desenhar, get aberto() { return aberto; } };
}
