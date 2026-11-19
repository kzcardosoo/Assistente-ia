#!/usr/bin/env python3
"""Gera modelos/emy.vrm a partir do modelo de exemplo VRM1_Constraint_Twist_Sample (pixiv Inc.).

A licença do modelo original (https://vrm.dev/licenses/1.0/) permite modificar e redistribuir
sem exigir crédito. Este script recolore cabelo (rosa), blusa (lilás), short (magenta) e olhos
(violeta), troca o nome para "Emy" e, se receber um PNG, usa como miniatura da galeria.

Uso: python criar-emy.py VRM1_Constraint_Twist_Sample.vrm emy.vrm [miniatura.png]
Modelo original: https://github.com/pixiv/three-vrm (packages/three-vrm/examples/models)
Precisa de: pip install numpy pillow
"""
import io, json, struct, sys, colorsys
import numpy as np
from PIL import Image

ent, sai = sys.argv[1], sys.argv[2]
b = open(ent, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n])
bin_ini = 20 + n + 8
binario = b[bin_ini:bin_ini + struct.unpack('<I', b[20 + n:24 + n])[0]]

def ler_img(i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    o = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(binario[o:o + bv['byteLength']])).convert('RGBA')

def hsv(arr):
    rgb = arr[..., :3] / 255.0
    mx, mn = rgb.max(-1), rgb.min(-1)
    v = mx; d = mx - mn; s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return s, v

def cabelo(img):  # castanho -> rosa chiclete brilhante
    a = np.asarray(img).astype(np.float32); s, v = hsv(a)
    lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]) / 255.0
    t = np.clip(lum * 1.55 + 0.08, 0, 1)[..., None]
    escuro = np.array([0.62, 0.12, 0.42]); claro = np.array([1.0, 0.72, 0.88])
    rgb = escuro * (1 - t) + claro * t
    a[..., :3] = np.clip(rgb * 255, 0, 255); return Image.fromarray(a.astype(np.uint8), 'RGBA')

def tingir(img, escuro, claro, ganho=1.0, base=0.0):
    a = np.asarray(img).astype(np.float32)
    lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]) / 255.0
    t = np.clip(lum * ganho + base, 0, 1)[..., None]
    rgb = np.array(escuro) * (1 - t) + np.array(claro) * t
    a[..., :3] = np.clip(rgb * 255, 0, 255); return Image.fromarray(a.astype(np.uint8), 'RGBA')

def olhos(img):  # íris castanha -> violeta
    a = np.asarray(img).astype(np.float32)
    out = a.copy()
    rgb = a[..., :3] / 255.0
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    t = np.clip(lum * 1.6, 0, 1)[..., None]
    novo = np.array([0.25, 0.05, 0.45]) * (1 - t) + np.array([0.95, 0.6, 1.0]) * t
    sat = (rgb.max(-1) - rgb.min(-1))[..., None]
    mistura = np.clip(sat * 4, 0, 1)  # só onde há cor (a íris), mantém branco/preto
    out[..., :3] = np.clip((novo * mistura + rgb * (1 - mistura)) * 255, 0, 255)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')

def png(img):
    f = io.BytesIO(); img.save(f, 'PNG', optimize=True); return f.getvalue()

nome_img = {i: im.get('name', '') for i, im in enumerate(j['images'])}
trocas = {}
import re
for i, nome in nome_img.items():
    if not re.fullmatch(r'[A-Za-z]+_\d+', nome):  # só texturas de cor (ignora _nml, _spe...)
        continue
    if nome.startswith('Hair'):
        trocas[i] = png(cabelo(ler_img(i)))
    elif nome.startswith('Tops'):
        trocas[i] = png(tingir(ler_img(i), [0.30, 0.16, 0.55], [0.86, 0.74, 1.0], 1.05))
    elif nome.startswith('Bottoms'):
        trocas[i] = png(tingir(ler_img(i), [0.55, 0.05, 0.33], [1.0, 0.45, 0.72], 2.6, 0.12))
    elif nome.startswith('EyeIris'):
        trocas[i] = png(olhos(ler_img(i)))
if len(sys.argv) > 3:  # miniatura nova (PNG renderizado do app)
    trocas[j['extensions']['VRMC_vrm']['meta']['thumbnailImage']] = open(sys.argv[3], 'rb').read()
print('imagens trocadas:', {nome_img[i]: len(v) for i, v in trocas.items()})

# reconstrói o bloco binário com as imagens novas
img_por_bv = {im['bufferView']: i for i, im in enumerate(j['images']) if 'bufferView' in im}
novo = bytearray()
for k, bv in enumerate(j['bufferViews']):
    o = bv.get('byteOffset', 0)
    dados = trocas.get(img_por_bv.get(k), binario[o:o + bv['byteLength']]) if k in img_por_bv else binario[o:o + bv['byteLength']]
    while len(novo) % 4: novo.append(0)
    bv['byteOffset'] = len(novo); bv['byteLength'] = len(dados); novo += dados
while len(novo) % 4: novo.append(0)
j['buffers'][0]['byteLength'] = len(novo)

meta = j['extensions']['VRMC_vrm']['meta']
meta['name'] = 'Emy'
meta['version'] = '1.0 (Emy)'
meta['copyrightInformation'] = '(c) 2022 pixiv Inc. Modelo VRM1_Constraint_Twist_Sample recolorido para a Emy.'

txt = json.dumps(j, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
while len(txt) % 4: txt += b' '
total = 12 + 8 + len(txt) + 8 + len(novo)
with open(sai, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(txt), 0x4E4F534A)); f.write(txt)
    f.write(struct.pack('<II', len(novo), 0x004E4942)); f.write(novo)
print('ok', sai, total)
