"""Pesos dos ossos do vilão (Meshy, release "vilão1": rapaz de jaqueta verde, 10 mil triângulos, sem
ossos) no esqueleto Mixamo da Brisa, para usar as mesmas animações (bonecaNova.js veste a malha).

Entrada: malha.json (posições, normais e uv do FBX, exportados pelo FBXLoader do three.js, sem índice)
e juntas.json (posição das juntas com a altura do vilão = 1, mãos e pés do lado esquerdo; o direito é
espelhado). As juntas dos membros são refinadas pelo centro dos vértices em volta.
Regiões: pernas e braços (distância aos ossos), tronco/pescoço/cabeça pela cadeia da coluna por
altura, ombros misturados; depois suavizado pela malha.
Saída: vilao.bin e vilao.json no formato de boneca_nova (sem cadeias de cabelo).
Uso: python3 pesos.py malha.json pasta_de_saida
"""
import json, sys, os, numpy as np
D = json.load(open(sys.argv[1])); OUT = sys.argv[2]
P = np.array(D['pos'], float).reshape(-1, 3); N = np.array(D['nor'], float).reshape(-1, 3); U = np.array(D['uv'], float).reshape(-1, 2)
# a malha vem sem índice (3 vértices por triângulo): junta as cópias iguais (posição, normal e uv)
chave = np.round(np.hstack([P * 1e3, N * 1e3, U * 1e5])).astype(np.int64)
_, primeiro, I = np.unique(chave, axis=0, return_index=True, return_inverse=True)
I = I.ravel().reshape(-1, 3); P, N, U = P[primeiro], N[primeiro], U[primeiro]
mn = P.min(0); mx = P.max(0); H = mx[1] - mn[1]
Q = (P - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]) / H
n = len(Q); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
J = {k: np.array(v, float) for k, v in json.load(open(os.path.join(os.path.dirname(__file__), 'juntas.json'))).items()}
for k in list(J):
    if k.startswith('Left'): J['Right' + k[4:]] = J[k] * [-1, 1, 1]
# refina x/z do cotovelo, do pulso e do joelho pelo centro dos vértices numa fatia em volta (mesma altura)
for k in list(J):
    if k[4:] not in ('ForeArm', 'Hand', 'Leg') and k[5:] not in ('ForeArm', 'Hand', 'Leg'): continue
    m = (np.abs(y - J[k][1]) < 0.02) & (np.hypot(x - J[k][0], z - J[k][2]) < 0.07) & (np.sign(x) == np.sign(J[k][0]))
    if m.sum() > 8: J[k][0], J[k][2] = Q[m, 0].mean(), Q[m, 2].mean()

ossos = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'] + [l + o for l in ('Left', 'Right') for o in ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase')]
ix = {o: i for i, o in enumerate(ossos)}
W = np.zeros((n, len(ossos)))
def sstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def seg(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t
lado = np.where(x >= 0, 'Left', 'Right')

# ---- pernas: abaixo do cinto, perto dos ossos da perna do lado
PERNA = (('UpLeg', 'Leg'), ('Leg', 'Foot'), ('Foot', 'ToeBase'), ('ToeBase', 'Toe_End'))
dperna = {L: np.min([seg(Q, J[L + a], J[L + b])[0] for a, b in PERNA], axis=0) for L in ('Left', 'Right')}
dlado = np.where(x >= 0, dperna['Left'], dperna['Right'])
perna = (y < 0.49) & (dlado < 0.09)
# ---- braços: longe do tronco, perto dos ossos do braço
def dbraco(L):
    m = J[L + 'Hand'] + (J[L + 'HandMiddle1'] - J[L + 'Hand']) * 2.4
    d1, t1 = seg(Q, J[L + 'Arm'], J[L + 'ForeArm']); d2, _ = seg(Q, J[L + 'ForeArm'], J[L + 'Hand']); d3, _ = seg(Q, J[L + 'Hand'], m)
    return d1, t1, d2, d3
braco = np.zeros(n, bool); tbr = np.zeros(n); db = {}
for L in ('Left', 'Right'):
    d1, t1, d2, d3 = dbraco(L); db[L] = (d1, d2, d3)
    sel = (lado == L) & ~perna & (np.abs(x) > 0.105) & ((d1 < 0.07) | (d2 < 0.06) | (d3 < 0.06))
    braco |= sel; tbr = np.where(sel, t1, tbr)
for i in np.where(braco)[0]:
    L = lado[i]; d = np.array(db[L])[:, i] + 0.004
    ww = d ** -4; ww /= ww.sum()
    W[i, ix[L + 'Arm']] += ww[0]; W[i, ix[L + 'ForeArm']] += ww[1]; W[i, ix[L + 'Hand']] += ww[2]
    raiz = 0.5 * (1 - sstep(0.0, 0.3, tbr[i])) * (d[0] < d[1])
    W[i] *= (1 - raiz); W[i, ix[L + 'Shoulder']] += raiz
for i in np.where(perna)[0]:
    L = lado[i]; p = Q[i:i + 1]
    ds = np.array([seg(p, J[L + a], J[L + b])[0][0] for a, b in PERNA]) + 0.004
    ww = ds ** -4; ww /= ww.sum()
    for k, o in enumerate(('UpLeg', 'Leg', 'Foot', 'ToeBase')): W[i, ix[L + o]] += ww[k]
# ---- tronco, pescoço e cabeça: cadeia da coluna por altura
resto = ~(braco | perna)
picos = [(0.0, 'Hips'), (0.53, 'Hips'), (0.575, 'Spine'), (0.635, 'Spine1'), (0.695, 'Spine2'), (0.83, 'Neck'), (0.865, 'Head'), (2, 'Head')]
def cadeia(yy):
    out = np.zeros((len(yy), len(ossos)))
    for (y0, o0), (y1, o1) in zip(picos, picos[1:]):
        m = (yy >= y0) & (yy < y1); t = (yy[m] - y0) / (y1 - y0)
        out[m, ix[o0]] += 1 - t; out[m, ix[o1]] += t
    return out
W[resto] = cadeia(y[resto])
# ombros: tronco de lado, na altura do ombro
a = sstep(0.07, 0.12, np.abs(x)) * sstep(0.70, 0.76, y) * resto
for L in ('Left', 'Right'):
    m = (lado == L) & (a > 0)
    W[m] *= (1 - a[m])[:, None]; W[m, ix[L + 'Shoulder']] += a[m] * 0.6; W[m, ix[L + 'Arm']] += a[m] * 0.4
# barra da jaqueta e quadril: as coxas puxam um pouco
quadril = resto & (y < 0.53)
for L in ('Left', 'Right'):
    m = quadril & (lado == L)
    k = 0.5 * sstep(0.53, 0.47, y[m]) * np.clip(1 - dperna[L][m] / 0.12, 0, 1) * sstep(0.0, 0.03, np.abs(x[m]))
    W[m] *= (1 - k)[:, None]; W[m, ix[L + 'UpLeg']] += k

# ---- mesmo peso para cópias do mesmo ponto (costuras de UV) e suavização pela malha
chave = np.round(Q * 1e5).astype(np.int64)
_, sold = np.unique(chave, axis=0, return_inverse=True); sold = sold.ravel(); ns = sold.max() + 1
S = np.zeros((ns, W.shape[1])); np.add.at(S, sold, W); Ws = S / np.bincount(sold, minlength=ns)[:, None]
A = np.concatenate([sold[I[:, [0, 1]]], sold[I[:, [1, 2]]], sold[I[:, [2, 0]]]]); A = np.concatenate([A, A[:, ::-1]])
for it in range(3):
    S = np.zeros_like(Ws); np.add.at(S, A[:, 0], Ws[A[:, 1]]); c = np.bincount(A[:, 0], minlength=ns)[:, None]
    Ws = np.where(c > 0, 0.5 * Ws + 0.5 * S / np.maximum(c, 1), Ws)
W = Ws[sold]
# lados não se misturam (a suavização passava peso da perna esquerda para a direita no meio)
for L, outro in (('Left', 'Right'), ('Right', 'Left')):
    m = lado == L
    for o in ossos:
        if o.startswith(outro): W[m, ix[L + o[len(outro):]]] += W[m, ix[o]]; W[m, ix[o]] = 0
ordem = np.argsort(-W, axis=1)[:, :4]
wv = np.take_along_axis(W, ordem, 1); wv /= wv.sum(1, keepdims=True)
q = np.floor(wv * 255 + 0.5).astype(int); q[:, 0] += 255 - q.sum(1)
print('vértices', n, 'triângulos', len(I), 'pernas', perna.sum(), 'braços', braco.sum(), 'resto', resto.sum())
# mesmo espaço do FBX do esqueleto da boneca (mesma altura e centro): bonecaNova.js usa direto
Hold = 169.52399358089622; off = np.array([0.49950, -1.22612, -2.38153])
pos = (Q * Hold + off).astype(np.float32)
jun = {('mixamorig' + k): (np.array(v) * Hold + off).round(4).tolist() for k, v in J.items()}
os.makedirs(OUT, exist_ok=True)
with open(OUT + '/vilao.bin', 'wb') as f:
    for arr in (pos, N.astype(np.float32), U.astype(np.float32), ordem.astype(np.uint8), q.astype(np.uint8), I.astype(np.uint16)):
        f.write(np.ascontiguousarray(arr).tobytes())
json.dump({'vertices': n, 'indices': int(I.size), 'ossos': ['mixamorig' + o for o in ossos], 'juntas': jun, 'cabelo': {}}, open(OUT + '/vilao.json', 'w'), indent=0)
print('juntas refinadas', {k: [round(c, 3) for c in v] for k, v in J.items() if 'Left' in k})
