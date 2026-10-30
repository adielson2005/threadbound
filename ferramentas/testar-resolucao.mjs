// Testa o ajuste de resolução (src/resolucao.js) com sequências de fps de celulares imaginários:
// cada resolução tem um fps "verdadeiro" (mais pixels, menos fps) com um pouco de oscilação.
// Compara com a regra antiga (que estava em jogo.js). Uso: node ferramentas/testar-resolucao.mjs
import { readFileSync } from 'node:fs';

// src/ não é um pacote "module" do Node: carrega o arquivo como módulo ES pelo texto
const fonte = readFileSync(new URL('../src/resolucao.js', import.meta.url), 'utf8');
const { criarAjusteResolucao, ajustarResolucao } = await import('data:text/javascript,' + encodeURIComponent(fonte));

function criarAntiga(inicial) { return { atual: inicial, lento: 0, folga: 0, trocas: 0 }; }
function ajustarAntiga(R, fps, { min, max, meta }) {
  let r = R.atual;
  R.lento = fps < meta ? R.lento + 1 : 0;
  R.folga = fps > Math.max(58, meta + 1) ? R.folga + 1 : 0;
  if (R.lento >= 2 || fps < meta * 0.75) { r -= 0.08; R.lento = 0; }
  else if (R.folga >= 4) { r += 0.04; R.folga = 0; }
  r = Math.min(max, Math.max(min, r));
  if (Math.abs(r - R.atual) > 0.01) R.trocas++;
  R.atual = r;
}

// fps de um aparelho que aguenta 60 até "limite" de resolução e cai com o quadrado acima disso,
// com oscilação de ±2 fps (sorteio com semente fixa, para o resultado se repetir)
let semente = 7;
const sorteio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const aparelho = limite => r => Math.min(60, 60 * (limite / r) ** 2) - 1 + (sorteio() * 4 - 2);

const cfg = { min: 1, max: 1.75, meta: 58 };
for (const [nome, limite] of [['celular fraco', 1.05], ['celular médio', 1.4], ['celular bom', 2.2]]) {
  const fps = aparelho(limite);
  const nova = criarAjusteResolucao(1.25), velha = criarAntiga(1.5);
  let somaN = 0, somaV = 0;
  for (let t = 0; t < 300; t++) {
    const fN = fps(nova.atual); ajustarResolucao(nova, fN, cfg); somaN += fN;
    const fV = fps(velha.atual); ajustarAntiga(velha, fV, { ...cfg, max: 2 }); somaV += fV;
  }
  console.log(`${nome.padEnd(14)} 5 min | nova: ${String(nova.trocas).padStart(3)} trocas, termina em ${nova.atual.toFixed(2)}, fps médio ${(somaN / 300).toFixed(1)}` +
    ` | antiga: ${String(velha.trocas).padStart(3)} trocas, termina em ${velha.atual.toFixed(2)}, fps médio ${(somaV / 300).toFixed(1)}`);
}
