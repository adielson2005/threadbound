#!/usr/bin/env python3
"""Reorganiza as ilhas de UV da boneca nova com margem entre elas e refaz as texturas.

O Meshy encaixa as ilhas da textura coladas umas nas outras (o cabelo, escuro, encosta direto no
vestido lilás e na pele). Quando a textura é reduzida para longe (mipmaps; no celular a boneca
ocupa poucos pixels), a cor da ilha vizinha vaza para a borda: pontinhos claros nas mechas do
cabelo e riscos escuros de cabelo nos braços. Preencher o fundo não basta, porque não há fundo
entre elas.

Aqui cada ilha (1.137 na malha leve) é só movida e reduzida por igual (nunca girada: o normal map,
que é no espaço da textura, continua valendo sem conversão) para um mapa novo com MARGEM pixels de
folga em volta. As texturas são copiadas ilha por ilha para o lugar novo e a folga recebe a cor da
própria ilha (preencher_bordas.push_pull). As UVs novas substituem as de boneca_nova.bin.

Rodar depois de pesos.py (que escreve o .bin com as UVs originais):
  python3 reempacotar_uv.py malha.obj cor_4096.png normal_4096.png rugosidade_2048.png pasta_saida boneca_nova.bin
"""
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from preencher_bordas import push_pull  # noqa: E402

N = 4096       # mapa novo (cor e normal); a rugosidade sai em 2048 com as mesmas UVs
MARGEM = 8     # folga em volta de cada ilha, em pixels do mapa de 4096 (4 no de 2048, 2 no de 1024)


def ler_obj(caminho):
    U, F = [], []
    for l in open(caminho):
        a = l.split()
        if not a:
            continue
        if a[0] == 'vt':
            U.append((float(a[1]), float(a[2])))
        elif a[0] == 'f':
            F.append([int(x.split('/')[1]) - 1 for x in a[1:4]])
    return np.array(U, dtype=np.float64), np.array(F)


def ilhas(U, F):
    pai = np.arange(len(U))
    def raiz(x):
        r = x
        while pai[r] != r:
            r = pai[r]
        while pai[x] != r:
            pai[x], x = r, pai[x]
        return r
    for a, b, c in F:
        ra = raiz(a)
        pai[raiz(b)] = ra
        pai[raiz(c)] = ra
    r = np.array([raiz(i) for i in range(len(U))])
    grupos = {}
    for t, (a, _, _) in enumerate(F):
        grupos.setdefault(r[a], []).append(t)
    return [np.array(v) for v in grupos.values()]


def empacotar(caixas, escala):
    """caixas: [(w, h)] em px de origem. Prateleiras, das mais altas para as mais baixas.
    Devolve as posições (x, y) do canto de cada caixa no mapa novo, ou None se não couber."""
    ordem = sorted(range(len(caixas)), key=lambda i: -caixas[i][1])
    pos = [None] * len(caixas)
    x = y = altura = 0
    for i in ordem:
        w = math.ceil(caixas[i][0] * escala) + 2 * MARGEM
        h = math.ceil(caixas[i][1] * escala) + 2 * MARGEM
        if x + w > N:
            x, y = 0, y + altura
            altura = 0
        if w > N or y + h > N:
            return None
        pos[i] = (x, y)
        x += w
        altura = max(altura, h)
    return pos


def main(obj, cor, normal, rug, saida, binario):
    U, F = ler_obj(obj)
    grupos = ilhas(U, F)
    px = np.stack([U[:, 0] * N, (1 - U[:, 1]) * N], axis=1)  # em pixels do mapa de origem (4096)
    caixas, mins = [], []
    for g in grupos:
        v = np.unique(F[g])
        mn, mx = px[v].min(0), px[v].max(0)
        caixas.append((mx[0] - mn[0] + 2, mx[1] - mn[1] + 2))
        mins.append(mn - 1)
    # a maior escala que cabe
    lo, hi = 0.3, 1.0
    for _ in range(30):
        m = (lo + hi) / 2
        if empacotar(caixas, m):
            lo = m
        else:
            hi = m
    escala = lo
    pos = empacotar(caixas, escala)
    print(f'{len(grupos)} ilhas, escala {escala:.3f} (densidade da textura em relação à original)')

    # UVs novas
    novo = px.copy()
    for g, mn, (x, y) in zip(grupos, mins, pos):
        v = np.unique(F[g])
        novo[v] = (px[v] - mn) * escala + (x + MARGEM, y + MARGEM)
    Unovo = np.stack([novo[:, 0] / N, 1 - novo[:, 1] / N], axis=1)

    def refazer(caminho, tam_saida, invalidos=None):
        img = Image.open(caminho).convert('RGB')
        k_in = img.size[0] / N          # pixels da imagem por pixel do mapa de origem
        k_out = tam_saida / N
        atlas = Image.new('RGB', (tam_saida, tam_saida))
        mascara = Image.new('L', (tam_saida, tam_saida), 0)
        ids = Image.new('I', (tam_saida, tam_saida), 0)
        d = ImageDraw.Draw(mascara)
        di = ImageDraw.Draw(ids)
        for numero, (g, mn, (x, y), (w, h)) in enumerate(zip(grupos, mins, pos, caixas)):
            caixa = [mn[0] * k_in, mn[1] * k_in, (mn[0] + w) * k_in, (mn[1] + h) * k_in]
            dst_w = max(1, round(w * escala * k_out)); dst_h = max(1, round(h * escala * k_out))
            pedaco = img.crop(tuple(round(c) for c in caixa)).resize((dst_w, dst_h), Image.LANCZOS)
            atlas.paste(pedaco, (round((x + MARGEM) * k_out), round((y + MARGEM) * k_out)))
            for t in g:
                d.polygon([tuple(novo[i] * k_out) for i in F[t]], fill=255)
                di.polygon([tuple(novo[i] * k_out) for i in F[t]], fill=numero + 1)
        m = np.asarray(mascara.filter(ImageFilter.MaxFilter(3))) > 0
        a = np.asarray(atlas).astype(np.float32)
        ilha = np.asarray(ids).astype(np.int64)
        if invalidos is None:
            invalidos = np.zeros(m.shape, bool)
        elif invalidos.shape != m.shape:
            invalidos = np.asarray(Image.fromarray(invalidos.astype(np.uint8) * 255).resize(m.shape[::-1], Image.NEAREST)) > 0
        valido = m & ~invalidos
        cheio = push_pull(a, valido.astype(np.float32))
        cheio[valido] = a[valido]
        return Image.fromarray(np.clip(cheio + 0.5, 0, 255).astype(np.uint8)), m.mean(), invalidos

    os.makedirs(saida, exist_ok=True)
    invalidos = None  # medidos na cor e repetidos no relevo e na aspereza
    for caminho, nome, tam in ((cor, 'cor.png', N), (normal, 'normal.png', N), (rug, 'rugosidade.png', 2048)):
        im, cob, inv = refazer(caminho, tam, invalidos)
        if invalidos is None:
            invalidos = inv
        if nome == 'rugosidade.png':
            im = im.convert('L')
        im.save(os.path.join(saida, nome))
        print(f'{nome}: {tam}x{tam}, ilhas {cob * 100:.1f}%')

    # UVs novas no .bin: posição (3 floats), normal (3) e uv (2) por vértice, nessa ordem
    dados = bytearray(open(binario, 'rb').read())
    n = len(U)
    ini = n * 6 * 4
    dados[ini:ini + n * 8] = Unovo.astype(np.float32).tobytes()
    open(binario, 'wb').write(dados)
    print(f'{binario}: {n} UVs trocadas')


if __name__ == '__main__':
    main(*sys.argv[1:7])
