@echo off
title Instalador do Sistema - Bot Bybit e Dashboard
chcp 65001 > nul
cls

echo =========================================================================
echo       INSTALADOR AUTOMATICO - BOT DE ROMPIMENTO BYBIT & WHATSAPP
echo =========================================================================
echo.
echo Este script ira verificar e instalar todos os pre-requisitos necessarios:
echo  1. Python 3.10+ e bibliotecas (Flask, Pandas, Requests, etc.)
echo  2. Node.js e microservico WhatsApp (Baileys)
echo  3. Criacao dos arquivos de configuracao inicial (.env)
echo.
echo Pressione qualquer tecla para iniciar a verificacao...
pause > nul
echo.

:: 1. Verificando Python
echo [1/4] Verificando instalacao do Python...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Python nao foi encontrado no PATH do Windows!
    echo Tentando instalar automaticamente via Windows Package Manager (winget)...
    winget install Python.Python.3.11 -e --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Nao foi possivel instalar o Python automaticamente.
        echo Por favor, baixe e instale o Python manualmente em: https://www.python.org/downloads/
        echo IMPORTANTE: Na instalacao do Python, MARQUE a caixa "Add python.exe to PATH"!
        start https://www.python.org/downloads/
        pause
        exit /b 1
    )
    echo [OK] Python instalado com sucesso. Por favor, reinicie este script para carregar o PATH.
    pause
    exit /b 0
) else (
    for /f "tokens=*" %%i in ('python --version') do echo [OK] %%i detectado.
)

:: 2. Verificando Node.js
echo.
echo [2/4] Verificando instalacao do Node.js (necessario para o WhatsApp Baileys)...
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Node.js nao foi encontrado no PATH do Windows!
    echo Tentando instalar automaticamente via winget...
    winget install OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Nao foi possivel instalar o Node.js automaticamente.
        echo Baixe a versao LTS em: https://nodejs.org/
        start https://nodejs.org/
        pause
        exit /b 1
    )
    echo [OK] Node.js instalado com sucesso. Por favor, reinicie este script para carregar o PATH.
    pause
    exit /b 0
) else (
    for /f "tokens=*" %%i in ('node -v') do echo [OK] Node.js %%i detectado.
)

:: 3. Instalando dependencias do Python
echo.
echo [3/4] Instalando dependencias do Python (Flask, Pandas, Bybit Client)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Ocorreu uma falha ao instalar os pacotes Python.
    pause
    exit /b 1
)
echo [OK] Pacotes Python instalados com sucesso!

:: 4. Instalando dependencias do Node.js (Baileys)
echo.
echo [4/4] Instalando modulos do microservico WhatsApp (Baileys)...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Ocorreu uma falha ao executar npm install.
    pause
    exit /b 1
)
echo [OK] Dependencias do WhatsApp instaladas com sucesso!

:: 5. Criando arquivo .env se nao existir
if not exist ".env" (
    echo.
    echo Criando arquivo de configuracao .env a partir de .env.example...
    copy ".env.example" ".env" > nul
    echo [OK] Arquivo .env criado com sucesso!
)

:: 6. Criando arquivos de persistencia padrao se nao existirem
if not exist "monitored_timeframes.json" (
    echo ["30", "60"] > monitored_timeframes.json
)
if not exist "monitored_symbols.json" (
    echo {"all_symbols":["BTCUSDT","ETHUSDT","HBARUSDT","LINKUSDT","SUIUSDT","AAVEUSDT","ONDOUSDT","DOGEUSDT","ENAUSDT","SOLUSDT"],"active_symbols":["BTCUSDT","ETHUSDT","HBARUSDT","LINKUSDT","SUIUSDT","AAVEUSDT","ONDOUSDT","DOGEUSDT","ENAUSDT","SOLUSDT"]} > monitored_symbols.json
)

echo.
echo =========================================================================
echo       PARABENS! TUDO FOI INSTALADO E CONFIGURADO COM SUCESSO!
echo =========================================================================
echo.
echo Para abrir o sistema, basta dar dois cliques em:
echo   --> iniciar_dashboard.bat
echo.
echo O navegador abrira automaticamente em: http://127.0.0.1:5000
echo e voce podera conectar o WhatsApp escaneando o QR Code no painel.
echo.
pause
