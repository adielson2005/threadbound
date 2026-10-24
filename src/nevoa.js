import * as THREE from 'three';

// Névoa com o sprite de spray (assets/efeitos/nevoa.png):
//  - spray: nuvens que nascem na base de cada cachoeira, sobem, crescem e somem, em ciclo;
//  - bruma do mar: faixas baixas sobre a água em volta das ilhas.
// Tudo é empurrado pelo vento do mar (agua.ventoAtual). No Low fica só uma parte dos sprites.

const PASTA = new URL('../assets/efeitos/', import.meta.url).href;

export function criarNevoa({ cena, agua }) {
  const grupo = new THREE.Group(); grupo.name = 'nevoa';
  cena.add(grupo);
  const textura = new THREE.TextureLoader().load(PASTA + 'nevoa.png');
  textura.colorSpace = THREE.SRGBColorSpace;
  const base = new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, fog: true });

  let brilho = 1, proporcao = 1;
  const corLuz = new THREE.Color(1, 1, 1); // luz do momento do dia (pôr do sol dourado, luar azulado)
  const sprites = [];
  function novo(dados) {
    const s = new THREE.Sprite(base.clone());
    s.material.rotation = Math.random() * Math.PI * 2;
    s.userData = { giro: (Math.random() - 0.5) * 0.15, ...dados };
    grupo.add(s); sprites.push(s);
    return s;
  }

  // bruma do mar: espalhada num anel em volta do centro, rente à água
  const c = agua.centro;
  // (a borda de baixo do sprite fica acima da água: um sprite atravessando o mar seria cortado
  // numa linha reta pela superfície)
  for (let i = 0; i < 26; i++) {
    const ang = Math.random() * Math.PI * 2, r = 25 + Math.random() * 160;
    const tam = 26 + Math.random() * 30;
    novo({
      tipo: 'bruma', x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r,
      y: agua.nivel + tam * 0.45 * 0.5 + 1.5 + Math.random() * 3, tam, opac: 0.22 + Math.random() * 0.18,
      fase: Math.random() * 10,
    });
  }

  // spray de uma cachoeira: n sprites defasados no mesmo ciclo
  function adicionarSpray(pos, raio, n = 6) {
    for (let i = 0; i < n; i++) {
      novo({ tipo: 'spray', origem: pos.clone(), raio, ciclo: 3.5 + Math.random() * 1.5, t: (i / n) * 4, desvio: new THREE.Vector2(Math.random() - 0.5, Math.random() - 0.5) });
    }
  }

  const deriva = new THREE.Vector2();
  function atualizar(dt, t) {
    const v = agua.ventoAtual;
    deriva.copy(v.direcao).multiplyScalar(0.6 + v.forca * 3.2); // m/s
    sprites.forEach((s, i) => {
      const u = s.userData;
      s.visible = i % Math.round(1 / proporcao) === 0;
      if (!s.visible) return;
      s.material.rotation += u.giro * dt;
      if (u.tipo === 'bruma') {
        u.x += deriva.x * dt * 0.5; u.z += deriva.y * dt * 0.5;
        // dá a volta: o que sai do anel do lado do vento volta pelo outro lado
        const dx = u.x - c.x, dz = u.z - c.z, r = Math.hypot(dx, dz);
        if (r > 190) { u.x = c.x - dx * 0.9; u.z = c.z - dz * 0.9; }
        s.position.set(u.x, u.y + Math.sin(t * 0.2 + u.fase) * 0.8, u.z);
        s.scale.set(u.tam, u.tam * 0.45, 1);
        s.material.opacity = u.opac * (0.75 + 0.25 * Math.sin(t * 0.3 + u.fase));
      } else {
        u.t += dt;
        const k = (u.t % u.ciclo) / u.ciclo; // 0..1 dentro do ciclo
        const sobe = k * u.raio * 1.6;
        const largura = u.raio * (0.9 + k * 1.8);
        s.position.set(
          u.origem.x + u.desvio.x * u.raio + deriva.x * k * u.ciclo * 0.6,
          u.origem.y + sobe * 0.6 + largura * 0.8, // base do sprite na origem, nunca dentro da água
          u.origem.z + u.desvio.y * u.raio + deriva.y * k * u.ciclo * 0.6,
        );
        s.scale.set(largura * 2, largura * 1.6, 1);
        s.material.opacity = Math.sin(k * Math.PI) * 0.6;
      }
      s.material.color.copy(corLuz).multiplyScalar(brilho);
    });
  }

  // High: tone mapping escurece; Low: menos sprites (overdraw de transparência pesa)
  function aplicarNivel(nivel) {
    brilho = nivel.efeitos ? 1.9 : 1;
    proporcao = nivel.materialSimples ? 0.5 : 1;
  }

  function definirLuz(c) { corLuz.copy(c); }

  return { grupo, adicionarSpray, atualizar, aplicarNivel, definirLuz };
}
