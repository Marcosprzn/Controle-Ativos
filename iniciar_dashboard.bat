@echo off
title Bybit Bot - Dashboard & WhatsApp Baileys
chcp 65001 > nul
cls

echo =========================================================================
echo  INICIANDO O BOT BYBIT COM DASHBOARD E WHATSAPP BAILEYS (QR CODE)...
echo =========================================================================
echo.
echo 1. Microservico Baileys (Node.js) ativo para conexao direta do WhatsApp
echo 2. Servidor Flask em http://127.0.0.1:5000 (abrindo navegador automaticamente)
echo.

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" > nul
    )
)

python app.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O sistema foi encerrado com erro.
    echo Caso seja a primeira vez, execute o script: instalar_requisitos.bat
    echo.
)
pause
