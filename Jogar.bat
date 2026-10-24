@echo off
rem O jogo carrega modelos e animacoes por HTTP, entao precisa de um servidor local.
rem Abrir o index.html direto (duplo clique) nao funciona.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale em https://www.python.org/downloads/ e tente de novo.
  pause
  exit /b 1
)
echo Abrindo o jogo em http://localhost:8080  (feche esta janela para parar o servidor)
start "" http://localhost:8080
python -m http.server 8080
