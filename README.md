# 🚀 Bot de Alertas Bybit: Rompimento de Médias & Volume (WhatsApp)

Bot profissional em Python e Node.js para monitoramento em tempo real de rompimentos na **Bybit** (Futuros Perpétuos e Spot), com **Dashboard Web interativo** e alertas automáticos no **WhatsApp**.

---

## ⚡ Estratégias Disponíveis no Painel

1. **Rompimento de MME 20 com Volume Financeiro**:
   - **Média Preço:** Média Móvel Exponencial de 20 períodos (`ta.ema(close, 20)`).
   - **Média Volume:** Média Móvel Simples de 20 períodos (`ta.sma(volume, 20)`).
   - **Compra (Long):** O preço rompe a MME 20 para cima e o volume da vela supera a média de volume (`volume > maVolume`).
   - **Venda (Short):** O preço rompe a MME 20 para baixo e o volume da vela supera a média de volume (`volume > maVolume`).

2. **Triple EMA (10, 20, 200)**:
   - 🟢 EMA 10 (Curto Prazo)
   - 🟡 EMA 20 (Médio Prazo)
   - 🟣 EMA 200 (Tendência Principal / Suporte & Resistência Dinâmico)
   - Disparo quando as médias rápidas cruzam a EMA 200 com alinhamento de tendência.

---

## 🪙 Gerenciador Dinâmico de Ativos e Timeframes

- **Seleção de Gráficos a Monitorar**: Escolha exatamente quais tempos gráficos deseja que o bot monitore para alertas no WhatsApp (ex: apenas 30m e 1h). Os tempos gráficos não monitorados ficam com visual meio apagado e não disparam alertas.
- **Gerenciador de Ativos**: Adicione qualquer par da Bybit (ex: `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `XRPUSDT`, etc.) diretamente pelo painel, ative/pause alertas individualmente por ativo ou remova pares que não queira mais acompanhar.
- **Persistência Automática**: As configurações de ativos e tempos gráficos ativos são salvas nos arquivos `monitored_symbols.json` e `monitored_timeframes.json`.

---

## 💻 Instalação Rápida no Computador do Cliente

### Passo 1: Instalar Requisitos (1 Clique)
Basta dar dois cliques no arquivo:
```text
instalar_requisitos.bat
```
O script verifica e instala automaticamente:
- Python 3.10+ e bibliotecas (`Flask`, `pandas`, `requests`, `python-dotenv`, etc.)
- Node.js LTS e dependências do WhatsApp Baileys (`@whiskeysockets/baileys`, `qrcode`, `express`)
- Criação dos arquivos `.env` e configurações padrão.

### Passo 2: Iniciar o Sistema
Dê dois cliques no arquivo:
```text
iniciar_dashboard.bat
```
O navegador abrirá automaticamente em `http://127.0.0.1:5000`.

---

## 📱 Conexão com WhatsApp (QR Code Nativo)

1. No Dashboard aberto em `http://127.0.0.1:5000`, clique em **"📱 WhatsApp (QR Code)"** no canto superior direito.
2. No celular:
   - Abra o WhatsApp.
   - Vá em **Aparelhos Conectados** > **Conectar um aparelho**.
   - Aponte a câmera para o QR Code exibido na tela.
3. Pronto! O sistema exibirá **🟢 Conectado** e os alertas serão enviados diretamente.

> 🔒 **Segurança & Privacidade:** As sessões do WhatsApp (`baileys_auth/`) e credenciais pessoais (`.env`) são locais e protegidas pelo `.gitignore`, nunca sendo enviadas ao repositório público.

---

## 📁 Estrutura dos Arquivos

```text
├── app.py                     # Servidor Flask e worker de monitoramento em segundo plano
├── whatsapp_service.js        # Microserviço Node.js com Baileys para WhatsApp
├── instalar_requisitos.bat    # Instalador automático para o computador do cliente
├── iniciar_dashboard.bat      # Inicializador em 1 clique
├── config.py                  # Leitura de variáveis e configurações
├── bybit_client.py            # Cliente de dados da API Bybit v5
├── indicators.py              # Cálculo de indicadores técnicos e sinais
├── notifier.py                # Módulo de envio de notificações WhatsApp
├── scan_history.py            # Auditoria de sinais recentes no histórico
├── templates/
│   └── index.html             # Painel web completo com TradingView Charts
├── static/
│   ├── css/style.css          # Estilização Dark Theme e Glassmorphism
│   └── js/dashboard.js        # Lógica interativa do painel, gráficos e modais
├── requirements.txt           # Pacotes Python
├── package.json               # Pacotes Node.js
├── .env.example               # Exemplo de configuração
└── .gitignore                 # Proteção de credenciais e sessões locais
```
