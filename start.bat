@echo off
REM ==========================================================================
REM start.bat - Inicia a IDE Agentica usando o Node 22 LTS local (.node-lts)
REM Necessario porque better-sqlite3 precisa compilar contra um Node estavel.
REM ==========================================================================
setlocal
cd /d "%~dp0"

set "NODE_DIR=%~dp0.node-lts"
if not exist "%NODE_DIR%\node.exe" (
  echo [ERRO] Node LTS local nao encontrado em .node-lts
  echo Rode setup.bat primeiro para preparar o ambiente.
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
echo Iniciando IDE Agentica com Node:
"%NODE_DIR%\node.exe" --version
"%NODE_DIR%\node.exe" server.js
endlocal
