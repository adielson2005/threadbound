"""Pesos dos ossos da boneca nova (malha leve de 50 mil triângulos) no esqueleto Mixamo da antiga.

Entrada (pasta D): boneca-nova/modelo-leve/boneca_nova.obj e boneca_nova_cor_2048.jpg (a malha
simplificada do modelo do Meshy) e rig/juntas.json (posição das juntas, altura da boneca = 1).
Saída: rig/saida/boneca_nova.bin e .json, copiados para assets/boneca/.
Regiões: cabelo (pela cor escura), pernas, braços (distância aos ossos), tronco/pescoço/cabeça e
saia (cadeia da coluna por altura, ombros e coxas misturados), depois suavizado pela malha.
Uso: python3 pesos.py D
"""
import json, sys, numpy as np
from PIL import Image
D = sys.argv[1]
P=[];U=[];N=[];I=[]
for l in open(D+'/boneca-nova/modelo-leve/boneca_nova.obj'):
    a=l.split()
    if not a: continue
    if a[0]=='v': P.append([float(x) for x in a[1:4]])
    elif a[0]=='vt': U.append([float(x) for x in a[1:3]])
    elif a[0]=='vn': N.append([float(x) for x in a[1:4]])
    elif a[0]=='f': I.append([int(x.split('/')[0])-1 for x in a[1:4]])
P=np.array(P);U=np.array(U);N=np.array(N);I=np.array(I)
mn=P.min(0);mx=P.max(0);H=mx[1]-mn[1]
Q=(P-[(mn[0]+mx[0])/2, mn[1], (mn[2]+mx[2])/2])/H
n=len(Q); x,y,z=Q[:,0],Q[:,1],Q[:,2]
JJ=json.load(open(D+'/rig/juntas.json')); CAB=JJ.pop('Cabelo')
CAB['R']=[[-a,b,c] for a,b,c in CAB['L']]
J={k:np.array(v,float) for k,v in JJ.items()}
for k in list(J):
    if k.startswith('Left'): J['Right'+k[4:]]=J[k]*[-1,1,1]
# cor de cada vértice
img=np.asarray(Image.open(D+'/boneca-nova/modelo-leve/boneca_nova_cor_2048.jpg').convert('RGB')).astype(float)
h,w,_=img.shape
px=np.clip((U[:,0]%1)*w,0,w-1).astype(int); py=np.clip((1-U[:,1]%1)*h,0,h-1).astype(int)
C=img[py,px]; lum=C@[0.299,0.587,0.114]
r,g,b=C[:,0],C[:,1],C[:,2]
escuro = lum<60
pele = (r>g+12)&(g>b-5)&(lum>45)&(lum<170)&(r-b>25)

ossos=['Hips','Spine','Spine1','Spine2','Neck','Head']+[l+o for l in ('Left','Right') for o in ('Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase')]
ossos+=[f'Cabelo{c}{i}' for c in 'CLR' for i in (1,2,3)]
ix={o:i for i,o in enumerate(ossos)}
W=np.zeros((n,len(ossos)))
def sstep(a,b,v):
    t=np.clip((v-a)/(b-a),0,1); return t*t*(3-2*t)
def seg(p,a,b):
    ab=b-a; t=np.clip(((p-a)@ab)/(ab@ab),0,1); return np.linalg.norm(p-(a+t[:,None]*ab),axis=1),t
lado=np.where(x>=0,'Left','Right')

# ---- cabelo (abaixo do queixo): segue cabeça em cima e peito embaixo
cab = escuro & (y>0.2) & (y<0.80) & ((z<0.03)|(np.abs(x)>0.085))
cab &= ~((y>0.72)&(z>0.04)&(np.abs(x)<0.085))
# ---- pernas
dperna={}
for L in ('Left','Right'):
    ds=[seg(Q,J[L+a],J[L+b])[0] for a,b in (('UpLeg','Leg'),('Leg','Foot'),('Foot','ToeBase'),('ToeBase','Toe_End'))]
    dperna[L]=np.min(ds,axis=0)
dlado=np.where(x>=0,dperna['Left'],dperna['Right'])
perna = ~cab & (((y<0.13)&(dlado<0.07)) | ((y<0.44)&(dlado<0.045)&pele))
# ---- braços
def dbraco(L):
    m=J[L+'Hand']+(J[L+'HandMiddle1']-J[L+'Hand'])*2.4
    d1,t1=seg(Q,J[L+'Arm'],J[L+'ForeArm']); d2,_=seg(Q,J[L+'ForeArm'],J[L+'Hand']); d3,_=seg(Q,J[L+'Hand'],m)
    return d1,t1,d2,d3
braco=np.zeros(n,bool); tbr=np.zeros(n); db={}
for L in ('Left','Right'):
    d1,t1,d2,d3=dbraco(L); db[L]=(d1,d2,d3)
    sel=(lado==L)&~cab&(np.abs(x)>0.075)&((d1<0.06)|(d2<0.04)|(d3<0.045))
    braco|=sel; tbr=np.where(sel,t1,tbr)
for i in np.where(braco)[0]:
    L=lado[i]; d=np.array(db[L])[:,i]+0.004
    ww=d**-4; ww/=ww.sum()
    W[i,ix[L+'Arm']]+=ww[0]; W[i,ix[L+'ForeArm']]+=ww[1]; W[i,ix[L+'Hand']]+=ww[2]
    # raiz do braço: um pouco de ombro
    raiz=0.5*(1-sstep(0.0,0.3,tbr[i]))*(d[0]<d[1])
    W[i]*= (1-raiz); W[i,ix[L+'Shoulder']]+=raiz
for i in np.where(perna)[0]:
    L=lado[i]; p=Q[i:i+1]
    ds=np.array([seg(p,J[L+a],J[L+b])[0][0] for a,b in (('UpLeg','Leg'),('Leg','Foot'),('Foot','ToeBase'),('ToeBase','Toe_End'))])+0.004
    ww=ds**-4; ww[2]+=ww[3]*0; ww/=ww.sum()
    W[i,ix[L+'UpLeg']]+=ww[0]; W[i,ix[L+'Leg']]+=ww[1]; W[i,ix[L+'Foot']]+=ww[2]; W[i,ix[L+'ToeBase']]+=ww[3]
# ---- tronco, pescoço, cabeça e saia: cadeia da coluna por altura
resto=~(braco|perna|cab)
picos=[(0.0,'Hips'),(0.475,'Hips'),(0.5375,'Spine'),(0.5925,'Spine1'),(0.6575,'Spine2'),(0.7175,'Neck'),(0.745,'Head'),(2,'Head')]
def cadeia(yy):
    out=np.zeros((len(yy),len(ossos)))
    for (y0,o0),(y1,o1) in zip(picos,picos[1:]):
        m=(yy>=y0)&(yy<y1); t=(yy[m]-y0)/(y1-y0)
        out[m,ix[o0]]+=1-t; out[m,ix[o1]]+=t
    return out
yy=y.copy()
queixo=(y>0.70)&(z>0.04)&~cab
yy[queixo]=np.maximum(yy[queixo],0.745)
W[resto]=cadeia(yy[resto])
# ombros: tronco de lado, na altura do ombro
a=sstep(0.06,0.11,np.abs(x))*sstep(0.6,0.66,y)*resto
for L in ('Left','Right'):
    m=(lado==L)&(a>0)
    W[m]*= (1-a[m])[:,None]; W[m,ix[L+'Shoulder']]+=a[m]*0.6; W[m,ix[L+'Arm']]+=a[m]*0.4
# saia: as coxas puxam a barra
saia=resto&(y<0.46)
for L in ('Left','Right'):
    m=saia&(lado==L)
    d=dperna[L][m]
    k=0.55*sstep(0.44,0.31,y[m])*np.clip(1-d/0.13,0,1)*sstep(0.0,0.035,np.abs(x[m]))
    W[m]*= (1-k)[:,None]; W[m,ix[L+'UpLeg']]+=k
# cabelo solto: três cadeias de ossos (centro, esquerda, direita) que balançam no jogo; a parte
# de cima (couro cabeludo) fica na cabeça. Mistura entre cadeias por x e entre ossos por altura.
solto = escuro & (y>0.2) & (y<0.80) & ((z<0.03)|(np.abs(x)>0.085))
solto &= ~((y>0.72)&(z>0.04)&(np.abs(x)<0.085))  # sobrancelhas, cílios, olhos
cab = solto
hc=np.where(cab)[0]
W[hc]=0
s_=np.clip(x[hc]/0.10,-1,1)
pc={'C':1-np.abs(s_),'L':np.maximum(s_,0),'R':np.maximum(-s_,0)}
alt=[(0.80,'Head'),(0.75,1),(0.65,2),(0.52,3),(-1,3)]
for (y0,o0),(y1,o1) in zip(alt,alt[1:]):
    m=(y[hc]<=y0)&(y[hc]>y1); t=(y0-y[hc][m])/(y0-y1)
    for c,wc in pc.items():
        for o,wo in ((o0,1-t),(o1,t)):
            nome='Head' if o=='Head' else f'Cabelo{c}{o}'
            W[hc[m],ix[nome]]+=wc[m]*wo

# ---- mesmo peso para cópias do mesmo ponto (costuras de UV) e suavização pela malha
chave=np.round(Q*1e5).astype(np.int64)
_,sold=np.unique(chave,axis=0,return_inverse=True); sold=sold.ravel(); ns=sold.max()+1
def soldar(W):
    S=np.zeros((ns,W.shape[1])); np.add.at(S,sold,W); c=np.bincount(sold,minlength=ns)[:,None]; return S/c
Ws=soldar(W)
A=np.concatenate([sold[I[:,[0,1]]],sold[I[:,[1,2]]],sold[I[:,[2,0]]]])
A=np.concatenate([A,A[:,::-1]])
fixo=np.zeros(ns,bool)  # pernas e mãos não precisam (e não podem misturar os lados)
for it in range(3):
    S=np.zeros_like(Ws); np.add.at(S,A[:,0],Ws[A[:,1]]); c=np.bincount(A[:,0],minlength=ns)[:,None]
    viz=S/np.maximum(c,1)
    Ws=np.where(c>0,0.5*Ws+0.5*viz,Ws)
W=Ws[sold]
# a suavização espalhava um pouco do peso dos ossos do cabelo para o vestido e a pele encostados
# nele (costas, gola, nuca): ao balançar, o cabelo puxava esses pedaços, que furavam as mechas
# como lascas lilás. Só o cabelo de verdade (a maioria das cópias de cada ponto é cabelo) fica
# com peso dos ossos de cabelo; o resto volta para o corpo
ehCab=np.zeros(ns); np.add.at(ehCab,sold,cab.astype(float)); ehCab=ehCab/np.bincount(sold,minlength=ns)
osCab=np.array([o.startswith('Cabelo') for o in ossos])
corpo=ehCab[sold]<0.5
W[np.ix_(corpo,osCab)]=0
vazio=corpo&(W.sum(1)<1e-6); W[vazio,ix['Spine2']]=1
print('vértices de corpo sem peso de cabelo:',int(corpo.sum()))
# top 4, normaliza, quantiza
ordem=np.argsort(-W,axis=1)[:,:4]
wv=np.take_along_axis(W,ordem,1); wv/=wv.sum(1,keepdims=True)
q=np.floor(wv*255+0.5).astype(int); q[:,0]+=255-q.sum(1)
print('cabelo',cab.sum(),'pernas',perna.sum(),'braços',braco.sum(),'resto',resto.sum(),'de',n)
# espaço do FBX da boneca antiga (mesma altura e centro)
Hold=169.52399358089622; off=np.array([0.49950, -1.22612, -2.38153])
pos=(Q*Hold+off).astype(np.float32)
jun={('mixamorig'+k):(np.array(v)*Hold+off).round(4).tolist() for k,v in J.items()}
cabelo={c:(np.array(v)*Hold+off).round(4).tolist() for c,v in CAB.items()}
idx=I.astype(np.uint16)
out=D+'/rig/saida'
import os; os.makedirs(out,exist_ok=True)
with open(out+'/boneca_nova.bin','wb') as f:
    for arr in (pos, N.astype(np.float32), U.astype(np.float32), ordem.astype(np.uint8), q.astype(np.uint8), idx):
        f.write(np.ascontiguousarray(arr).tobytes())
json.dump({'vertices':n,'indices':int(idx.size),'ossos':[o if o.startswith('Cabelo') else 'mixamorig'+o for o in ossos],'juntas':jun,'cabelo':cabelo},open(out+'/boneca_nova.json','w'),indent=0)
np.save(out+'/classe.npy',np.select([cab,perna,braco],[1,2,3],0))
print(os.path.getsize(out+'/boneca_nova.bin'))
