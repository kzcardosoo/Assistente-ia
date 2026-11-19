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
# IA local: Ollama para Windows (versão fixa, testada com o app)
OLLAMA_URL="https://github.com/ollama/ollama/releases/download/v0.40.16/ollama-windows-amd64.zip"
# Modelo de palavra de ativação em português (Vosk)
VOSK_URL="https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip"
# Whisper "base" multilíngue já compactado em int8 (projeto Rhasspy) + tokenizador oficial.
# (O "small" é só um pouco mais preciso em português, mas deixaria o zip 3x maior e a fala 2x mais lenta.)
WHISPER_URL="https://huggingface.co/rhasspy/faster-whisper-base-int8/resolve/main"
TOKENIZER_URL="https://huggingface.co/Systran/faster-whisper-base/resolve/main/tokenizer.json"

mkdir -p "$CACHE" "$SAIDA"

baixar() { # baixar URL DESTINO (só baixa se ainda não tiver no cache)
  if [ ! -s "$2" ]; then
    echo "    baixando $(basename "$2")..."
    curl -fL --retry 3 -o "$2.parcial" "$1"
    mv "$2.parcial" "$2"
  fi
}

echo "[1/7] Python portátil para Windows"
baixar "$PY_URL" "$CACHE/python-win.tar.gz"
rm -rf python/runtime "$CACHE/py"
mkdir -p "$CACHE/py"
tar xzf "$CACHE/python-win.tar.gz" -C "$CACHE/py"
mv "$CACHE/py/python" python/runtime
rm -rf python/runtime/{tcl,include,libs,Scripts} \
       python/runtime/Lib/{test,idlelib,tkinter,turtledemo,ensurepip} \
       python/runtime/DLLs/{_tkinter.pyd,tcl86t.dll,tk86t.dll}

echo "[2/7] Bibliotecas de voz (versão Windows)"
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

echo "[3/7] Modelos de voz (Vosk + Whisper)"
baixar "$VOSK_URL" "$CACHE/vosk-pt.zip"
rm -rf python/modelos/vosk-model-small-pt-0.3
unzip -q "$CACHE/vosk-pt.zip" -d python/modelos
rm -rf python/modelos/whisper-*
mkdir -p python/modelos/whisper-base
for f in config.json model.bin vocabulary.txt; do
  baixar "$WHISPER_URL/$f" "$CACHE/whisper-base-$f"
  cp "$CACHE/whisper-base-$f" "python/modelos/whisper-base/$f"
done
baixar "$TOKENIZER_URL" "$CACHE/whisper-base-tokenizer.json"
cp "$CACHE/whisper-base-tokenizer.json" python/modelos/whisper-base/tokenizer.json

echo "[4/7] IA local (Ollama para Windows, só a parte de processador + Vulkan)"
# O pacote completo do Ollama tem 1,6 GB por causa das bibliotecas NVIDIA (CUDA). Sem elas,
# ele roda no processador e, com Vulkan, em placas de vídeo integradas/AMD/Intel.
# O modelo de IA (gemma3:1b, ~0,8 GB) é baixado pelo app na primeira vez que abre.
baixar "$OLLAMA_URL" "$CACHE/ollama-windows-amd64.zip"
rm -rf ollama
mkdir -p ollama
unzip -q "$CACHE/ollama-windows-amd64.zip" -d ollama \
  -x 'lib/ollama/cuda_v*/*' 'lib/ollama/rocm*' 'lib/ollama/*quantize*'

echo "[5/7] App para Windows (Electron)"
[ -d node_modules ] || npm install --no-audit --no-fund
node scripts/copiar-addons.js
rm -rf "$SAIDA/win-unpacked"
npx electron-builder --win dir --x64 --config.directories.output="$SAIDA"

echo "[6/7] Pasta final"
PASTA="$SAIDA/Emy"
rm -rf "$PASTA"
mv "$SAIDA/win-unpacked" "$PASTA"
cp scripts/COMO-USAR.txt "$PASTA/COMO USAR.txt"
rm -f "$PASTA/resources/python/empacotar_voz.bat" "$PASTA/resources/python/baixar_modelos.py"

echo "[7/7] Compactando"
( cd "$SAIDA" && rm -f Emy-portatil-windows.zip && zip -q -r -9 Emy-portatil-windows.zip Emy )
echo
echo "Pronto: $SAIDA/Emy-portatil-windows.zip"
ls -lh "$SAIDA/Emy-portatil-windows.zip"
