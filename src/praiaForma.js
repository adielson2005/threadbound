// Forma da praia na beira do mar: uma ilha baixa de areia (contorno = círculo deformado por três
// senoides, a mesma função do shader do mar, para a água rasa e a espuma baterem na linha d'água)
// e, quando a ilha principal tem enseada, a rampa de areia que desce da borda dela até essa praia.
// Usada por praia.js (a malha) e por ilha.js (o cais sai da areia para o mar).
// Alturas em metros acima do nível do mar (negativas embaixo d'água).

const suave = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const HARMONICOS = [[0.09, 2, 0.7], [0.06, 3, 2.1], [0.04, 5, 4.0]]; // amplitude, frequência, fase

// forma: { cx, cz, R0, topo, rampa? }  rampa: { ang, s0, s1, hTop, meia } (hTop já acima do mar)
export function formaPraia(forma) {
  const { cx, cz, R0, topo } = forma, rampa = forma.rampa;
  const raio = ang => R0 * (1 + HARMONICOS.reduce((s, [a, k, f]) => s + a * Math.sin(k * ang + f), 0));
  const dunas = (x, z) => Math.sin(x * 0.13 + 1.3) * Math.sin(z * 0.11 + 0.4) * 0.5 + Math.sin(x * 0.051 - z * 0.047) * 0.6;
  // a ilha de areia: sobe em dunas suaves até o topo no meio e continua descendo debaixo d'água
  function circulo(x, z) {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), R = raio(Math.atan2(dz, dx)), t = d / R;
    if (t <= 1) {
      const sobe = 1 - suave(t, 0.2, 1);
      return topo * sobe + dunas(x, z) * sobe * 0.9 * (topo / 3) + (1 - t) * 0.25;
    }
    return -Math.min(8, (t - 1) * R * 0.14);
  }
  // a rampa: da borda da enseada (rente ao chão da ilha, cobrindo a quina da falésia) desce
  // em curva suave até a praia; abre em leque embaixo e cai depressa dos lados, como uma duna
  const dir = rampa ? [Math.cos(rampa.ang), Math.sin(rampa.ang)] : null;
  function naRampa(x, z) {
    if (!rampa) return -Infinity;
    const s = x * dir[0] + z * dir[1], t = -x * dir[1] + z * dir[0];
    // (bordaS/bordaH: onde fica a borda da ilha nesta faixa e a que altura; sem elas, uma linha reta)
    const sb = rampa.bordaS ? rampa.bordaS(t) : rampa.s0, hb = rampa.bordaH ? rampa.bordaH(t) : rampa.hTop;
    if (s < sb - 1.2) return -Infinity;
    const k = suave(s, sb - 1.2, rampa.s1), h0 = hb + 0.04;
    let h = h0 + (0.45 - h0) * (k * k * (3 - 2 * k) * 0.35 + k * 0.65);
    if (s > rampa.s1) h = 0.45 - (s - rampa.s1) * 0.22;
    const w = rampa.meia * (1 + 0.45 * k);
    h -= suave(Math.abs(t), w * 0.62, w) * (h + 5);
    return h;
  }
  const perfil = (x, z) => Math.max(circulo(x, z), naRampa(x, z));
  return { raio, perfil, circulo, naRampa, dir };
}
