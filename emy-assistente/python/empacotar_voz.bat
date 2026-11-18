@echo off
REM Gera python\dist\voz\voz.exe com o PyInstaller, para o instalador do app
REM funcionar em computadores sem Python. Rode depois do instalar.bat.
cd /d "%~dp0"
.venv\Scripts\python.exe -m pip install pyinstaller
.venv\Scripts\python.exe -m PyInstaller --noconfirm --onedir --name voz ^
  --collect-all vosk --collect-all faster_whisper --collect-all ctranslate2 ^
  --collect-all edge_tts --collect-all sounddevice voz.py
echo.
echo Pronto: python\dist\voz\voz.exe. Agora rode "npm run dist" na pasta do app.
pause
