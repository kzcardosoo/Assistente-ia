@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ================================================
echo   Instalador da Assistente Virtual (Windows)
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)

echo [1/4] Instalando dependencias do app (pode demorar alguns minutos)...
call npm install
if errorlevel 1 (
  echo [ERRO] Falha no npm install.
  pause
  exit /b 1
)

set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY (
  where python >nul 2>nul && set PY=python
)
if not defined PY (
  echo.
  echo [AVISO] Python nao encontrado. O app funciona, mas sem ouvir o microfone
  echo         e com a voz do Windows. Para a voz realista e a escuta, instale o
  echo         Python 3.11 ou 3.12 em https://python.org marcando "Add Python to PATH"
  echo         e rode este instalador de novo.
  pause
  exit /b 0
)

echo [2/4] Criando ambiente Python em python\.venv ...
if not exist "python\.venv\Scripts\python.exe" (
  %PY% -m venv python\.venv
)
if not exist "python\.venv\Scripts\python.exe" (
  echo [ERRO] Nao consegui criar o ambiente Python.
  pause
  exit /b 1
)

echo [3/4] Instalando bibliotecas de voz (Vosk, Whisper, Edge TTS)...
python\.venv\Scripts\python.exe -m pip install --upgrade pip
python\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
if errorlevel 1 (
  echo [AVISO] Algumas bibliotecas de voz falharam. Veja as mensagens acima.
)

echo [4/4] Baixando o modelo de palavra de ativacao (Vosk, ~30 MB)...
python\.venv\Scripts\python.exe python\baixar_modelos.py

echo.
set /p KOKORO="Quer instalar tambem a voz 100%% off-line (Kokoro, ~1 GB)? [s/N] "
if /i "%KOKORO%"=="s" (
  python\.venv\Scripts\python.exe -m pip install -r python\requirements-voz-offline.txt
  echo Lembre de instalar o espeak-ng: https://github.com/espeak-ng/espeak-ng/releases
)

echo.
echo ================================================
echo   Pronto! Coloque seu modelo .vrm na pasta "modelos"
echo   e rode iniciar.bat para abrir a assistente.
echo ================================================
pause
