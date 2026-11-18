#!/usr/bin/env bash
# Monta a versão PORTÁTIL para Windows: um zip com tudo dentro (app, Python, bibliotecas e
# modelos de voz). Quem recebe só descompacta e abre o Emy.exe: não instala nada e não
# precisa de administrador.
#
# Roda em Linux ou macOS (ou no Git Bash/WSL do Windows) com: bash, curl, unzip, zip,
# node/npm e python3 com pip. Os downloads ficam guardados em .cache-portatil/.
#
# Uso: bash scripts/montar-portatil.sh      (ou: npm run portatil)
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ="$PWD"
CACHE="${CACHE:-$RAIZ/.cache-portatil}"
SAIDA="${SAIDA:-$RAIZ/dist}"
PY="${PYTHON:-python3}"

# Python portátil para Windows (python-build-standalone, o mesmo usado pelo "uv")
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.12.16%2B20261110-x86_64-pc-windows-msvc-install_only_stripped.tar.gz"
# Modelo de palavra de ativação em português (Vosk)
VOSK_URL="https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip"
# Whisper "small" multilíngue já compactado em int8 (projeto Rhasspy) + tokenizador oficial
WHISPER_URL="https://huggingface.co/rhasspy/faster-whisper-small-int8/resolve/main"
TOKENIZER_URL="https://huggingface.co/Systran/faster-whisper-small/resolve/main/tokenizer.json"

mkdir -p "$CACHE" "$SAIDA"

baixar() { # baixar URL DESTINO (só baixa se ainda não tiver no cache)
  if [ ! -s "$2" ]; then
    echo "    baixando $(basename "$2")..."
    curl -fL --retry 3 -o "$2.parcial" "$1"
    mv "$2.parcial" "$2"
  fi
}

echo "[1/6] Python portátil para Windows"
baixar "$PY_URL" "$CACHE/python-win.tar.gz"
rm -rf python/runtime "$CACHE/py"
mkdir -p "$CACHE/py"
tar xzf "$CACHE/python-win.tar.gz" -C "$CACHE/py"
mv "$CACHE/py/python" python/runtime
rm -rf python/runtime/{tcl,include,libs,Scripts} \
       python/runtime/Lib/{test,idlelib,tkinter,turtledemo,ensurepip} \
       python/runtime/DLLs/{_tkinter.pyd,tcl86t.dll,tk86t.dll}

echo "[2/6] Bibliotecas de voz (versão Windows)"
"$PY" -m pip install --quiet --upgrade --target python/runtime/Lib/site-packages \
  --platform win_amd64 --python-version 3.12 --implementation cp --only-binary=:all: \
  -r python/requirements.txt
# msvcp140.dll e companhia: nem todo Windows tem o "Visual C++ Redistributable"
"$PY" -m pip download --quiet --no-deps --platform win_amd64 --python-version 3.12 \
  --only-binary=:all: msvc-runtime -d "$CACHE/msvc"
unzip -q -o -j "$(ls "$CACHE"/msvc/msvc_runtime-*.whl | tail -1)" \
  '*/data/msvcp140*.dll' '*/data/vcomp140.dll' '*/data/concrt140.dll' -x '*/Scripts/*' -d python/runtime
# remove o que não é usado pelo app
rm -rf python/runtime/Lib/site-packages/pip python/runtime/Lib/site-packages/pip-*
find python/runtime -type d \( -name tests -o -name __pycache__ \) -prune -exec rm -rf {} +

echo "[3/6] Modelos de voz (Vosk + Whisper)"
baixar "$VOSK_URL" "$CACHE/vosk-pt.zip"
rm -rf python/modelos/vosk-model-small-pt-0.3
unzip -q "$CACHE/vosk-pt.zip" -d python/modelos
mkdir -p python/modelos/whisper-small
for f in config.json model.bin vocabulary.txt; do
  baixar "$WHISPER_URL/$f" "$CACHE/whisper-small-$f"
  cp "$CACHE/whisper-small-$f" "python/modelos/whisper-small/$f"
done
baixar "$TOKENIZER_URL" "$CACHE/whisper-small-tokenizer.json"
cp "$CACHE/whisper-small-tokenizer.json" python/modelos/whisper-small/tokenizer.json

echo "[4/6] App para Windows (Electron)"
[ -d node_modules ] || npm install --no-audit --no-fund
node scripts/copiar-addons.js
rm -rf "$SAIDA/win-unpacked"
npx electron-builder --win dir --x64 --config.directories.output="$SAIDA"

echo "[5/6] Pasta final"
PASTA="$SAIDA/Emy"
rm -rf "$PASTA"
mv "$SAIDA/win-unpacked" "$PASTA"
cp scripts/COMO-USAR.txt "$PASTA/COMO USAR.txt"
rm -f "$PASTA/resources/python/empacotar_voz.bat" "$PASTA/resources/python/baixar_modelos.py"

echo "[6/6] Compactando"
( cd "$SAIDA" && rm -f Emy-portatil-windows.zip && zip -q -r -9 Emy-portatil-windows.zip Emy )
echo
echo "Pronto: $SAIDA/Emy-portatil-windows.zip"
ls -lh "$SAIDA/Emy-portatil-windows.zip"
