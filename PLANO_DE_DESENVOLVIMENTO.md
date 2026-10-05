# 📊 Plano de Desenvolvimento: Bot de Alertas Bybit (BTC) via WhatsApp

## 1. Visão Geral do Projeto

O objetivo é construir um robô autônomo e de alta confiabilidade que:
1. **Coleta dados de mercado da Bybit** (BTCUSDT - Spot ou Futuros) em tempo real via **API oficial v5** (sem necessidade de chaves de API para ler preços públicos).
2. **Calcula as Médias Móveis Exponenciais (EMA 9, 20 e 200)** em tempo de execução com histórico suficiente de velas (candlesticks).
3. **Identifica a lógica exata de rompimento do Pine Script:**
   - **Compra:** `EMA 9 > EMA 200` E `EMA 20 > EMA 200` E (`crossover(EMA 9, EMA 200)` OU `crossover(EMA 20, EMA 200)`).
   - **Venda:** `EMA 9 < EMA 200` E `EMA 20 < EMA 200` E (`crossunder(EMA 9, EMA 200)` OU `crossunder(EMA 20, EMA 200)`).
4. **Dispara alertas ricos no WhatsApp** com detalhes da operação (Preço, Timeframe, Horário, Indicadores, Tipo de Sinal).
5. **Anti-Spam / Trava de repetição:** Garante que o mesmo sinal não seja disparado repetidas vezes na mesma vela (candle).

---

## 2. Decisão Técnica: API Oficial Bybit vs Webscraping

Recomendamos **fortemente a API v5 oficial da Bybit** em vez de webscraping:
- **Estabilidade:** Webscraping quebra a qualquer mudança de interface ou bloqueio anti-bot (Cloudflare).
- **Sem custos e sem chaves obrigatórias:** A API de cotação pública (Klines) não requer autenticação nem chaves de API com saldo.
- **Precisão:** Entrega o timestamp exato do fechamento e abertura de cada vela.

---

## 3. Estrutura do Projeto Proposta

```text
Fin/
├── .env                  # Configurações (Símbolo, Timeframe, Credenciais WhatsApp)
├── .env.example          # Exemplo de configuração
├── requirements.txt      # Dependências (requests, pandas, pybit, etc.)
├── config.py             # Carregamento e validação de parâmetros
├── bybit_client.py       # Coleta de Klines via Bybit v5 API
├── indicators.py         # Cálculo de EMA 9, 20, 200 e detecção de crossover/crossunder
├── notifier.py           # Integração com WhatsApp (CallMeBot / Evolution API / Webhook)
├── main.py               # Loop de monitoramento contínuo e orquestrador
└── README.md             # Instruções de instalação e execução
```

---

## 4. Fases de Execução

1. **Fase 1: Configuração Base & Integração Bybit**
   - Criação do cliente de klines da Bybit v5 para obter as últimas 250+ velas.
2. **Fase 2: Motor de Indicadores e Lógica do Pine Script**
   - Cálculo das EMAs 9, 20 e 200 idêntico ao TradingView.
   - Detecção precisa do gatilho de cruzamento no fechamento do candle.
3. **Fase 3: Módulo de WhatsApp**
   - Implementação flexível: suporte a **CallMeBot** (gratuito e sem servidor) e adaptável a **Evolution API / Z-API / Twilio**.
4. **Fase 4: Loop Principal com Anti-Spam**
   - Verificação a cada fechamento de vela ou polling programado, garantindo 1 alerta por candle.
5. **Fase 5: Teste & Validação**
   - Execução de teste inicial com log e disparo de mensagem teste no WhatsApp.
