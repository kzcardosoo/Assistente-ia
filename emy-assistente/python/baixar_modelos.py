#!/usr/bin/env python3
"""Baixa o modelo Vosk em português (palavra de ativação off-line) para python/modelos/."""
import os
import shutil
import sys
import tempfile
import urllib.request
import zipfile

MODELO = 'vosk-model-small-pt-0.3'
URL = f'https://alphacephei.com/vosk/models/{MODELO}.zip'
PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelos')


def progresso(blocos, tamanho_bloco, total):
    if total > 0:
        feito = min(100, blocos * tamanho_bloco * 100 // total)
        print(f'\r  baixando... {feito}%', end='', flush=True)


def main():
    destino = os.path.join(PASTA, MODELO)
    if os.path.isdir(destino):
        print(f'Modelo Vosk já instalado em {destino}')
        return 0
    os.makedirs(PASTA, exist_ok=True)
    print(f'Baixando {URL}')
    with tempfile.TemporaryDirectory() as tmp:
        arquivo = os.path.join(tmp, 'modelo.zip')
        try:
            urllib.request.urlretrieve(URL, arquivo, progresso)
        except Exception as e:  # noqa: BLE001
            print(f'\nNão consegui baixar o modelo: {e}')
            print('Baixe manualmente em https://alphacephei.com/vosk/models e descompacte em', PASTA)
            return 1
        print('\n  descompactando...')
        with zipfile.ZipFile(arquivo) as z:
            for nome in z.namelist():  # proteção contra caminhos maliciosos no zip
                if nome.startswith('/') or '..' in nome.replace('\\', '/').split('/'):
                    print('Arquivo zip inválido')
                    return 1
            z.extractall(tmp)
        shutil.move(os.path.join(tmp, MODELO), destino)
    print(f'Pronto! Modelo instalado em {destino}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
