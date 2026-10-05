# 📄 RELATÓRIO DE ENTREGA: BOT DE MONITORAMENTO BYBIT & WHATSAPP

**Cliente:** Investidor / Trader Bybit  
**Ativo Monitorado:** Bitcoin (BTCUSDT)  
**Destinatário Exclusivo dos Alertas:** WhatsApp `+55 (81) 99179-8590`  
**Tecnologias:** Python + Flask + Node.js (Baileys) + TradingView Lightweight Charts  

---

## 1. Visão Geral da Solução Entregue

Desenvolvemos um sistema automatizado de monitoramento profissional para o mercado de criptomoedas conectado à **Bybit**, que analisa continuamente o preço do Bitcoin e detecta oportunidades de rompimento de tendência baseadas na estratégia de **Cruzamento Triplo de Médias Móveis Exponenciais (EMAs)**.

O sistema conta com um **Dashboard Web em tempo real** e **disparo automático de alertas no WhatsApp** sem intermediários pagos e sem necessidade de plataformas externas.

---

## 2. A Estratégia Técnica das 3 Médias

O algoritmo opera com base no indicador técnico de cruzamento triplo configurado com as cores e períodos solicitados:

* 🟢 **EMA 10 (Linha Verde):** Média rápida de curtíssimo prazo que reage com velocidade à volatilidade recente.
* 🟡 **EMA 20 (Linha Dourada):** Média intermediária que confirma a força e a consistência da aceleração do preço.
* 🟣 **EMA 200 (Linha Roxa):** Média institucional de longo prazo que define a tendência macro (suporte e resistência dinâmico).

### ⚡ Gatilhos de Sinal:
1. **Sinal de Compra (LONG):**
   * As médias de 10 (Verde) e 20 (Dourada) operam acima da de 200 (Roxa).
   * Pelo menos uma das médias rápidas acaba de cruzar para **CIMA** da média de 200.
   * *Significado:* Rompimento de alta com confirmação de fluxo comprador.

2. **Sinal de Venda (SHORT):**
   * As médias de 10 (Verde) e 20 (Dourada) operam abaixo da de 200 (Roxa).
   * Pelo menos uma das médias rápidas acaba de cruzar para **BAIXO** da média de 200.
   * *Significado:* Rompimento de baixa com confirmação de fluxo vendedor.

---

## 3. Monitoramento em 5 Tempos Gráficos Paralelos

Para maximizar as oportunidades e eliminar longos períodos de espera, o robô monitora simultaneamente 5 tempos gráficos distintos a cada ciclo:

| Tempo Gráfico | Perfil Operacional | Finalidade |
| :--- | :--- | :--- |
| **1 Minuto (1m)** | Alta frequência / Scalping | Sinais rápidos de tiro curto |
| **5 Minutos (5m)** | Scalping dinâmico | Equilíbrio entre velocidade e ruído |
| **10 Minutos (10m)** | Day trade intermediário | Sintetizado com precisão matemática |
| **30 Minutos (30m)** | Day trade estruturado | Movimentos mais amplos do dia |
| **60 Minutos (1h)** | Swing trade / Tendência | Rompimentos de maior relevância macro |

---

## 4. Recursos do Dashboard Web (Painel de Controle)

O sistema conta com uma interface gráfica escura e moderna para uso no computador:

* **Gráfico Interativo TradingView Oficial (Lightweight Charts):** Exibe as velas japonesas da Bybit com as 3 linhas coloridas (🟢 Verde, 🟡 Dourada e 🟣 Roxa) desenhadas sobre o preço.
* **Tabela Multi-Timeframe em Tempo Real:** Mostra cotação, valores de cada média e tendência atualizada automaticamente a cada 5 segundos.
* **Histórico de Rompimentos:** Lista os últimos sinais confirmados em cada tempo gráfico com preços e horários exatos.
* **Conexão WhatsApp Integrada (Baileys):** O WhatsApp é conectado diretamente através de um QR Code gerado no próprio painel, mantendo a sessão salva permanentemente.
* **Filtro Anti-Spam de Alertas:** Dispara apenas 1 notificação por vela confirmada, evitando alertas repetidos no celular.

---

## 5. Como Iniciar e Usar

1. Dê dois cliques no arquivo **`iniciar_dashboard.bat`**.
2. O sistema inicializa o robô, a conexão do WhatsApp e abre automaticamente o Dashboard no navegador no endereço `http://127.0.0.1:5000`.
3. Todas as notificações de compra e venda chegam instantaneamente no WhatsApp cadastrado: **(81) 99179-8590**.
