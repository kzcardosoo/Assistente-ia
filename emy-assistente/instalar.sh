#!/usr/bin/env bash
# Instalador para Linux e macOS
set -e
cd "$(dirname "$0")"
echo "== Instalador da Assistente Virtual =="

command -v node >/dev/null || { echo "Instale o Node.js LTS: https://nodejs.org"; exit 1; }
echo "[1/4] Dependências do app..."
npm install

PY=$(command -v python3 || command -v python || true)
if [ -z "$PY" ]; then
  echo "Python não encontrado: o app funciona, mas sem microfone e com a voz do sistema."
  exit 0
fi
echo "[2/4] Ambiente Python..."
[ -x python/.venv/bin/python ] || "$PY" -m venv python/.venv
echo "[3/4] Bibliotecas de voz..."
python/.venv/bin/python -m pip install --upgrade pip
python/.venv/bin/python -m pip install -r python/requirements.txt || echo "Aviso: algumas bibliotecas falharam (no Linux, instale libportaudio2)."
echo "[4/4] Modelo de palavra de ativação..."
python/.venv/bin/python python/baixar_modelos.py || true

read -r -p "Instalar a voz 100% off-line (Kokoro, ~1 GB)? [s/N] " KOKORO
if [ "$KOKORO" = "s" ] || [ "$KOKORO" = "S" ]; then
  python/.venv/bin/python -m pip install -r python/requirements-voz-offline.txt
  echo "Instale também o espeak-ng (ex.: sudo apt install espeak-ng / brew install espeak-ng)."
fi
echo "Pronto! Coloque seu modelo .vrm em modelos/ e rode: npm start"
