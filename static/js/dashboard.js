// Dashboard Controller & TradingView Lightweight Charts Integration
// Suporte Multi-Ativos (BTC, HBAR, LINK, SUI, AAVE, ONDO, DOGE, ENA)
// Suporte a múltiplas estratégias: 'ema20_volume' (Cliente) e 'triple_ema' (Original)

let chart = null;
let candleSeries = null;
let volumeSeries = null;
let maVolumeSeries = null;
let ema10Series = null;
let ema20Series = null;
let ema200Series = null;

let currentSymbol = "BTCUSDT";
let currentStrategy = "ema20_volume";
let currentTf = "30"; // Padrão 30m (conforme solicitado: 30m e 1h monitorados)
let currentCategory = "linear";
let currentFastEma = "10";
let currentTzOffsetHours = -2; // Padrão Bybit (-2h / 15h)
let activeTimeframes = ["30", "60"]; // 30m e 1h monitorados ativamente por padrão
let allSymbols = ["BTCUSDT", "ETHUSDT", "HBARUSDT", "LINKUSDT", "SUIUSDT", "AAVEUSDT", "ONDOUSDT", "DOGEUSDT", "ENAUSDT"];
let activeSymbols = ["BTCUSDT", "ETHUSDT", "HBARUSDT", "LINKUSDT", "SUIUSDT", "AAVEUSDT", "ONDOUSDT", "DOGEUSDT", "ENAUSDT"];

document.addEventListener("DOMContentLoaded", () => {
  initChart();
  updateLegendsAndControls();
  loadInitialStrategy();
  loadSymbols();
  loadChartData(currentTf);
  loadStatus();
  loadHistory();
  checkWhatsAppStatus();

  // Polling automático a cada 12 segundos para status e cards
  setInterval(() => {
    loadStatus();
  }, 12000);

  // Polling do WhatsApp a cada 10 segundos
  setInterval(() => {
    checkWhatsAppStatus();
  }, 10000);

  // Polling do gráfico a cada 20 segundos
  setInterval(() => {
    loadChartData(currentTf, false);
  }, 20000);

  setupEventListeners();
});

async function loadInitialStrategy() {
  try {
    const res = await fetch("/api/strategy");
    const data = await res.json();
    if (data && data.active_strategy) {
      currentStrategy = data.active_strategy;
      syncStrategyUI();
    }
  } catch (e) {
    console.warn("Usando estratégia padrão local:", currentStrategy);
  }
}

function syncStrategyUI() {
  document.querySelectorAll(".strategy-tab").forEach(tab => {
    if (tab.getAttribute("data-strat") === currentStrategy) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });
  updateLegendsAndControls();
}

async function loadSymbols() {
  try {
    const res = await fetch("/api/symbols");
    const data = await res.json();
    if (data && data.all_symbols) {
      allSymbols = data.all_symbols;
      activeSymbols = data.active_symbols || allSymbols;
      renderSymbolButtons();
      renderSymbolsModalList();
    }
  } catch (err) {
    console.error("Erro ao carregar lista de ativos:", err);
  }
}

function renderSymbolButtons() {
  const container = document.getElementById("symbol-selector");
  if (!container) return;

  container.innerHTML = "";
  allSymbols.forEach(sym => {
    const base = sym.replace("USDT", "").replace("PERP", "").replace("USDC", "");
    const isCurrent = (sym === currentSymbol);
    const isMon = activeSymbols.includes(sym);

    const btn = document.createElement("button");
    btn.className = `symbol-btn ${isCurrent ? 'active' : ''} ${isMon ? '' : 'sym-dimmed'}`;
    btn.setAttribute("data-symbol", sym);
    btn.title = `${sym} - ${isMon ? 'Monitorando WhatsApp 🟢' : 'Pausado no WhatsApp ⚪'}`;
    btn.innerHTML = `<span>${base}</span><span class="sym-dot">${isMon ? '🟢' : '⚪'}</span>`;

    btn.addEventListener("click", () => {
      if (currentSymbol === sym) return;
      currentSymbol = sym;
      document.querySelectorAll(".symbol-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast(`Visualizando ativo: ${currentSymbol}`);
      loadChartData(currentTf, true);
      loadStatus();
      loadHistory();
      renderSymbolsModalList();
    });

    container.appendChild(btn);
  });
}

function renderSymbolsModalList() {
  const listEl = document.getElementById("symbols-modal-list");
  const countEl = document.getElementById("modal-symbols-count");
  if (countEl) countEl.textContent = allSymbols.length;
  if (!listEl) return;

  if (allSymbols.length === 0) {
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhum ativo cadastrado.</div>';
    return;
  }

  let html = "";
  allSymbols.forEach(sym => {
    const isCurrent = (sym === currentSymbol);
    const isMon = activeSymbols.includes(sym);

    html += `
      <div class="symbol-list-item">
        <div class="sym-item-left">
          <span style="font-size: 1.1rem;">🪙</span>
          <div>
            <div class="sym-tag">${sym} ${isCurrent ? '<span style="font-size: 0.7rem; color: var(--accent-cyan); font-weight: 600;">(Na tela)</span>' : ''}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">
              ${isMon ? '🟢 Alertas WhatsApp Ativos' : '⚪ Monitoramento Pausado'}
            </div>
          </div>
        </div>
        <div class="sym-item-actions">
          <button class="btn-tf-toggle ${isMon ? 'active' : 'paused'}" data-sym-toggle="${sym}" title="Clique para alternar envio de alertas deste ativo no WhatsApp">
            ${isMon ? '🟢 Ativo' : '⚪ Pausado'}
          </button>
          ${!isCurrent ? `<button class="btn-sym-view" data-sym-view="${sym}" title="Visualizar este ativo no gráfico">👁️ Ver</button>` : ''}
          <button class="btn-sym-delete" data-sym-delete="${sym}" title="Remover ativo da lista" ${allSymbols.length <= 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
            🗑️
          </button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;

  // Listeners para botões de toggle no modal
  listEl.querySelectorAll("[data-sym-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const sym = btn.getAttribute("data-sym-toggle");
      toggleSymbolMonitoring(sym);
    });
  });

  // Listeners para visualizar ativo
  listEl.querySelectorAll("[data-sym-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const sym = btn.getAttribute("data-sym-view");
      currentSymbol = sym;
      const modal = document.getElementById("symbols-modal");
      if (modal) modal.classList.remove("active");
      renderSymbolButtons();
      showToast(`Visualizando ativo: ${currentSymbol}`);
      loadChartData(currentTf, true);
      loadStatus();
      loadHistory();
    });
  });

  // Listeners para remover ativo
  listEl.querySelectorAll("[data-sym-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const sym = btn.getAttribute("data-sym-delete");
      if (confirm(`Deseja realmente remover o par ${sym} do bot?`)) {
        removeSymbol(sym);
      }
    });
  });
}

async function toggleSymbolMonitoring(sym) {
  try {
    const res = await fetch("/api/symbols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", symbol: sym })
    });
    const data = await res.json();
    if (data.success) {
      allSymbols = data.all_symbols;
      activeSymbols = data.active_symbols;
      renderSymbolButtons();
      renderSymbolsModalList();
      const isMon = activeSymbols.includes(sym);
      showToast(isMon ? `✅ Alertas de WhatsApp ATIVADOS para ${sym}!` : `⚪ Alertas de WhatsApp PAUSADOS para ${sym}.`);
      loadStatus();
    } else {
      showToast(`❌ ${data.error || 'Erro ao alterar status do ativo'}`);
    }
  } catch (err) {
    console.error("Erro ao alternar monitoramento do ativo:", err);
    showToast("❌ Erro de comunicação com o servidor");
  }
}

async function addNewSymbol(symInput) {
  if (!symInput || !symInput.trim()) {
    showToast("⚠️ Digite o símbolo do ativo (ex: SOLUSDT ou SOL)");
    return;
  }

  const clean = symInput.trim().toUpperCase();
  showToast(`🔍 Validando par ${clean} na Bybit...`);
  try {
    const res = await fetch("/api/symbols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", symbol: clean })
    });
    const data = await res.json();
    if (data.success) {
      allSymbols = data.all_symbols;
      activeSymbols = data.active_symbols;
      currentSymbol = data.symbol;
      renderSymbolButtons();
      renderSymbolsModalList();
      showToast(`🚀 Ativo ${data.symbol} adicionado com sucesso!`);
      loadChartData(currentTf, true);
      loadStatus();
      loadHistory();
      const input = document.getElementById("input-new-symbol");
      if (input) input.value = "";
    } else {
      showToast(`❌ ${data.error || 'Erro ao adicionar ativo'}`);
    }
  } catch (err) {
    console.error("Erro ao adicionar ativo:", err);
    showToast("❌ Falha ao adicionar ativo");
  }
}

async function removeSymbol(sym) {
  try {
    const res = await fetch("/api/symbols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", symbol: sym })
    });
    const data = await res.json();
    if (data.success) {
      allSymbols = data.all_symbols;
      activeSymbols = data.active_symbols;
      if (currentSymbol === sym && allSymbols.length > 0) {
        currentSymbol = allSymbols[0];
        loadChartData(currentTf, true);
        loadStatus();
        loadHistory();
      }
      renderSymbolButtons();
      renderSymbolsModalList();
      showToast(`🗑️ Ativo ${sym} removido do monitoramento.`);
    } else {
      showToast(`❌ ${data.error || 'Erro ao remover ativo'}`);
    }
  } catch (err) {
    console.error("Erro ao remover ativo:", err);
    showToast("❌ Falha ao remover ativo");
  }
}

function getDecimals(price) {
  if (!price || isNaN(price)) return 2;
  if (price < 0.1) return 5;
  if (price < 1) return 4;
  if (price < 10) return 3;
  return 2;
}

function formatPrice(val, decimals = null) {
  if (val === undefined || val === null || isNaN(val)) return "--,---.--";
  const dec = decimals !== null ? decimals : getDecimals(val);
  return val.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function initChart() {
  const container = document.getElementById("chart-container");
  container.innerHTML = '<div class="chart-loading" id="chart-loader"><span>Carregando dados da Bybit...</span></div>';

  chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: 480,
    layout: {
      background: { color: "#0d121c" },
      textColor: "#94a3b8",
      fontFamily: "'Outfit', sans-serif"
    },
    grid: {
      vertLines: { color: "rgba(255, 255, 255, 0.04)" },
      horzLines: { color: "rgba(255, 255, 255, 0.04)" }
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: "rgba(255, 255, 255, 0.2)",
        width: 1,
        style: LightweightCharts.LineStyle.Dashed
      },
      horzLine: {
        color: "rgba(255, 255, 255, 0.2)",
        width: 1,
        style: LightweightCharts.LineStyle.Dashed
      }
    },
    rightPriceScale: {
      borderColor: "rgba(255, 255, 255, 0.08)",
      scaleMargins: {
        top: 0.1,
        bottom: 0.25
      }
    },
    timeScale: {
      borderColor: "rgba(255, 255, 255, 0.08)",
      timeVisible: true,
      secondsVisible: false
    }
  });

  // Série de Candlesticks
  candleSeries = chart.addCandlestickSeries({
    upColor: "#10b981",
    downColor: "#ef4444",
    borderUpColor: "#10b981",
    borderDownColor: "#ef4444",
    wickUpColor: "#10b981",
    wickDownColor: "#ef4444"
  });

  // Série de Volume no painel inferior do gráfico
  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "volume_scale"
  });

  chart.priceScale("volume_scale").applyOptions({
    scaleMargins: {
      top: 0.8,
      bottom: 0
    }
  });

  // Linha da Média Simples de Volume (SMA 20)
  maVolumeSeries = chart.addLineSeries({
    color: "#f59e0b",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    priceScaleId: "volume_scale",
    title: "Média 20 Vol",
    crosshairMarkerVisible: false
  });

  // Linhas das Médias de Preço
  // 🟢 EMA 10 (Verde)
  ema10Series = chart.addLineSeries({
    color: "#10b981",
    lineWidth: 2,
    title: "EMA 10",
    crosshairMarkerVisible: true
  });

  // 🔵 / 🟡 EMA 20 (Azul na estratégia do cliente, Dourada na Triple EMA)
  ema20Series = chart.addLineSeries({
    color: "#3b82f6",
    lineWidth: 2,
    title: "MME 20",
    crosshairMarkerVisible: true
  });

  // 🟣 EMA 200 (Roxa)
  ema200Series = chart.addLineSeries({
    color: "#a855f7",
    lineWidth: 3,
    title: "EMA 200",
    crosshairMarkerVisible: true
  });

  // Redimensionamento responsivo
  window.addEventListener("resize", () => {
    chart.applyOptions({ width: container.clientWidth });
  });
}

function updateLegendsAndControls() {
  const legendBox = document.getElementById("chart-legends");
  const emaSelector = document.getElementById("ema-selector");

  if (currentStrategy === "ema20_volume") {
    if (emaSelector) emaSelector.style.display = "none";
    if (legendBox) {
      legendBox.innerHTML = `
        <div class="legend-item">
          <span class="legend-line e-blue"></span>
          <span>MME 20 (Azul) - Preço</span>
        </div>
        <div class="legend-item">
          <span class="legend-line vol-hist"></span>
          <span>Volume</span>
        </div>
        <div class="legend-item">
          <span class="legend-line e20"></span>
          <span>SMA 20 (Volume)</span>
        </div>
      `;
    }
  } else {
    if (emaSelector) emaSelector.style.display = "flex";
    if (legendBox) {
      legendBox.innerHTML = `
        <div class="legend-item">
          <span class="legend-line e10"></span>
          <span>EMA ${currentFastEma} (Verde)</span>
        </div>
        <div class="legend-item">
          <span class="legend-line e20"></span>
          <span>EMA 20 (Dourada)</span>
        </div>
        <div class="legend-item">
          <span class="legend-line e200"></span>
          <span>EMA 200 (Roxa)</span>
        </div>
      `;
    }
  }
}

async function loadChartData(tf, showLoader = true) {
  const loader = document.getElementById("chart-loader");
  if (showLoader && loader) loader.style.display = "flex";

  try {
    const res = await fetch(`/api/chart-data?symbol=${currentSymbol}&tf=${tf}&category=${currentCategory}&strategy=${currentStrategy}`);
    const data = await res.json();

    if (data && data.candles && data.candles.length > 0) {
      const offsetSec = currentTzOffsetHours * 3600;
      
      // Ajusta timestamps das velas com base no fuso horário
      const adjustedCandles = data.candles.map(c => ({ ...c, time: c.time + offsetSec }));
      candleSeries.setData(adjustedCandles);

      if (data.strategy === "ema20_volume") {
        // Exibe MME 20 (Azul) e o Histograma de Volume + SMA de Volume
        ema20Series.applyOptions({ color: "#3b82f6", title: "MME 20" });
        ema20Series.setData(data.ema20.map(e => ({ ...e, time: e.time + offsetSec })));
        
        ema10Series.setData([]);
        ema200Series.setData([]);

        if (data.volumes) {
          volumeSeries.setData(data.volumes.map(v => ({ ...v, time: v.time + offsetSec })));
        }
        if (data.ma_volume) {
          maVolumeSeries.setData(data.ma_volume.map(m => ({ ...m, time: m.time + offsetSec })));
        }
      } else {
        // Triple EMA: 10/9 (Verde), 20 (Dourada), 200 (Roxa)
        const fastEmaRaw = (currentFastEma === "9" && data.ema9) ? data.ema9 : data.ema10;
        ema10Series.applyOptions({ title: `EMA ${currentFastEma}` });
        ema10Series.setData(fastEmaRaw.map(e => ({ ...e, time: e.time + offsetSec })));
        
        ema20Series.applyOptions({ color: "#f59e0b", title: "EMA 20" });
        ema20Series.setData(data.ema20.map(e => ({ ...e, time: e.time + offsetSec })));
        
        ema200Series.setData(data.ema200.map(e => ({ ...e, time: e.time + offsetSec })));

        volumeSeries.setData([]);
        maVolumeSeries.setData([]);
      }

      if (showLoader) {
        chart.timeScale().fitContent();
      }
    }
  } catch (err) {
    console.error("Erro ao carregar dados do gráfico:", err);
  } finally {
    if (loader) loader.style.display = "none";
  }
}

async function loadStatus() {
  try {
    const res = await fetch(`/api/status?symbol=${currentSymbol}&category=${currentCategory}&strategy=${currentStrategy}`);
    const data = await res.json();

    if (!data || !data.timeframes) return;

    // Atualiza timeframes ativos caso retornados pela API
    if (data.active_timeframes && Array.isArray(data.active_timeframes)) {
      activeTimeframes = data.active_timeframes;
      updateTimeframeMonitorUI();
    }

    // Sincroniza ativos monitorados caso retornados pela API
    if (data.monitored_symbols && Array.isArray(data.monitored_symbols)) {
      activeSymbols = data.monitored_symbols;
    }
    if (data.all_symbols && Array.isArray(data.all_symbols)) {
      allSymbols = data.all_symbols;
    }

    // Atualiza título do símbolo no card
    const symbolTitle = document.getElementById("card-symbol-title");
    if (symbolTitle) symbolTitle.textContent = currentSymbol;

    const baseAsset = currentSymbol.replace("USDT", "");

    // Atualiza cards superiores com base no timeframe ativo ou primeiro da lista
    const activeItem = data.timeframes.find(t => t.timeframe === currentTf) || data.timeframes[0];
    if (activeItem) {
      const dec = getDecimals(activeItem.price_current);
      document.getElementById("card-btc-price").textContent = `$ ${formatPrice(activeItem.price_current, dec)}`;
      
      const trendBadge = document.getElementById("trend-badge");

      if (data.strategy === "ema20_volume") {
        // Configuração dos Cards para Rompimento MME 20 + Volume
        document.getElementById("card-title-2").textContent = "🔵 MME 20 (Preço)";
        document.getElementById("card-badge-2").textContent = "ta.ema 20";
        document.getElementById("card-val-2").style.color = "var(--accent-blue)";
        document.getElementById("card-val-2").textContent = `$ ${formatPrice(activeItem.ema20, dec)}`;
        document.getElementById("card-sub-2").textContent = activeItem.price_current > activeItem.ema20 ? "Preço Acima da Média" : "Preço Abaixo da Média";

        document.getElementById("card-title-3").textContent = "📊 Volume Candle";
        document.getElementById("card-badge-3").textContent = `${activeItem.timeframe_display}`;
        document.getElementById("card-val-3").style.color = "var(--accent-gold)";
        document.getElementById("card-val-3").textContent = `${(activeItem.volume || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${baseAsset}`;
        document.getElementById("card-sub-3").textContent = "Volume financeiro negociado";

        document.getElementById("card-title-4").textContent = "📈 Média 20 Volume";
        document.getElementById("card-val-4").style.color = "var(--accent-purple)";
        document.getElementById("card-val-4").textContent = `${(activeItem.ma_volume || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${baseAsset}`;

        if (activeItem.volume_confirmado) {
          document.getElementById("card-badge-4").className = "badge badge-vol-ok";
          document.getElementById("card-badge-4").textContent = "Volume Confirmado ✅";
          document.getElementById("card-sub-4").textContent = `Superou a média em +${Math.round(activeItem.volume_ratio - 100)}%`;
        } else {
          document.getElementById("card-badge-4").className = "badge badge-vol-wait";
          document.getElementById("card-badge-4").textContent = "Abaixo da Média ⏳";
          document.getElementById("card-sub-4").textContent = `${activeItem.volume_ratio}% da média de volume`;
        }

        if (activeItem.has_signal) {
          if (activeItem.signal_type === "COMPRA") {
            trendBadge.className = "badge badge-buy";
            trendBadge.textContent = "ROMPIMENTO COMPRA 🚀";
          } else {
            trendBadge.className = "badge badge-sell";
            trendBadge.textContent = "ROMPIMENTO VENDA ⚠️";
          }
        } else {
          trendBadge.className = "badge badge-neutral";
          trendBadge.textContent = activeItem.price_current > activeItem.ema20 ? "ACIMA DA MME 20" : "ABAIXO DA MME 20";
        }

      } else {
        // Configuração dos Cards para Triple EMA
        const fastVal = (currentFastEma === "9" && activeItem.ema9) ? activeItem.ema9 : activeItem.ema10;
        
        document.getElementById("card-title-2").textContent = `🟢 EMA ${currentFastEma} (Verde)`;
        document.getElementById("card-badge-2").textContent = "Curto Prazo";
        document.getElementById("card-val-2").style.color = "var(--accent-green)";
        document.getElementById("card-val-2").textContent = `$ ${formatPrice(fastVal, dec)}`;
        document.getElementById("card-sub-2").textContent = "Média Rápida";

        document.getElementById("card-title-3").textContent = "🟡 EMA 20 (Dourada)";
        document.getElementById("card-badge-3").textContent = "Médio Prazo";
        document.getElementById("card-val-3").style.color = "var(--accent-gold)";
        document.getElementById("card-val-3").textContent = `$ ${formatPrice(activeItem.ema20, dec)}`;
        document.getElementById("card-sub-3").textContent = "Média Intermediária";

        document.getElementById("card-title-4").textContent = "🟣 EMA 200 (Roxa)";
        document.getElementById("card-badge-4").className = "badge badge-neutral";
        document.getElementById("card-badge-4").textContent = "Base Tendência";
        document.getElementById("card-val-4").style.color = "var(--accent-purple)";
        document.getElementById("card-val-4").textContent = `$ ${formatPrice(activeItem.ema200, dec)}`;
        document.getElementById("card-sub-4").textContent = "Linha Guia de Rompimento";

        if (fastVal > activeItem.ema200 && activeItem.ema20 > activeItem.ema200) {
          trendBadge.className = "badge badge-buy";
          trendBadge.textContent = "ALTA";
        } else if (fastVal < activeItem.ema200 && activeItem.ema20 < activeItem.ema200) {
          trendBadge.className = "badge badge-sell";
          trendBadge.textContent = "BAIXA";
        } else {
          trendBadge.className = "badge badge-neutral";
          trendBadge.textContent = "LATERAL";
        }
      }

      document.getElementById("card-last-update").textContent = `Atualizado às ${new Date().toLocaleTimeString()} (${currentSymbol} • ${currentCategory.toUpperCase()})`;
    }

    // Renderiza tabela multi-timeframe
    renderStatusTable(data.timeframes, data.strategy, currentSymbol);

  } catch (err) {
    console.error("Erro ao atualizar status:", err);
  }
}

function updateTimeframeMonitorUI() {
  // 1. Atualiza pílulas da barra rápida de monitoramento WhatsApp
  document.querySelectorAll(".mon-pill").forEach(pill => {
    const tf = pill.getAttribute("data-mon-tf");
    const isMon = activeTimeframes.includes(tf);
    const dotSpan = pill.querySelector(".dot");
    if (isMon) {
      pill.className = "mon-pill active";
      pill.title = `Alertas WhatsApp ATIVOS em ${tf === '60' ? '1h' : tf + 'm'}. Clique para pausar.`;
      if (dotSpan) dotSpan.textContent = "🟢";
    } else {
      pill.className = "mon-pill paused";
      pill.title = `Alertas WhatsApp PAUSADOS em ${tf === '60' ? '1h' : tf + 'm'}. Clique para ativar.`;
      if (dotSpan) dotSpan.textContent = "⚪";
    }
  });

  // 2. Atualiza botões de timeframe do gráfico (deixando os não monitorados apagados)
  document.querySelectorAll(".tf-btn").forEach(btn => {
    const tf = btn.getAttribute("data-tf");
    const isMon = activeTimeframes.includes(tf);
    if (isMon) {
      btn.classList.remove("tf-dimmed");
      btn.title = `Gráfico ${tf === '60' ? '1h' : tf + 'm'} (Monitorando WhatsApp 🟢)`;
    } else {
      btn.classList.add("tf-dimmed");
      btn.title = `Gráfico ${tf === '60' ? '1h' : tf + 'm'} (Pausado no WhatsApp ⚪)`;
    }
  });
}

function selectTimeframe(tf) {
  currentTf = tf;
  document.querySelectorAll(".tf-btn").forEach(b => {
    if (b.getAttribute("data-tf") === tf) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });
  loadChartData(currentTf, true);
  loadStatus();
}

async function toggleTimeframeMonitoring(tf) {
  tf = String(tf);
  let newActive = [...activeTimeframes];
  if (newActive.includes(tf)) {
    newActive = newActive.filter(t => t !== tf);
  } else {
    newActive.push(tf);
  }

  activeTimeframes = newActive;
  updateTimeframeMonitorUI();

  try {
    const res = await fetch("/api/timeframes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_timeframes: newActive })
    });
    const data = await res.json();
    if (data.success) {
      activeTimeframes = data.active_timeframes;
      updateTimeframeMonitorUI();
      const isNowMon = activeTimeframes.includes(tf);
      const tfName = tf === "60" ? "1h" : tf + "m";
      showToast(isNowMon ? `✅ Gráfico ${tfName} ATIVADO no monitoramento WhatsApp!` : `⚪ Gráfico ${tfName} PAUSADO (não enviará WhatsApp).`);
      loadStatus();
    }
  } catch (err) {
    console.error("Erro ao alterar monitoramento de timeframe:", err);
    showToast("❌ Erro ao salvar configuração de monitoramento");
  }
}

function renderStatusTable(timeframes, strategy, symbol) {
  const thead = document.getElementById("table-head");
  const tbody = document.getElementById("table-body");
  const baseAsset = (symbol || currentSymbol).replace("USDT", "");

  if (strategy === "ema20_volume") {
    thead.innerHTML = `
      <tr>
        <th>Tempo</th>
        <th>Alertas WhatsApp</th>
        <th>Preço Atual</th>
        <th>Preço Rompimento</th>
        <th style="color: var(--accent-blue);">🔵 MME 20 (Preço)</th>
        <th style="color: var(--accent-gold);">📊 Volume Candle</th>
        <th style="color: var(--accent-purple);">📉 Média 20 Vol</th>
        <th>Volume Confirmado?</th>
        <th>Sinal</th>
      </tr>
    `;

    let html = "";
    timeframes.forEach(item => {
      const dec = getDecimals(item.price_current);
      let volBadge = "";
      if (item.volume_confirmado) {
        volBadge = `<span class="badge badge-vol-ok">✅ Sim (${item.volume_ratio}%)</span>`;
      } else {
        volBadge = `<span class="badge badge-vol-wait">⏳ Baixo (${item.volume_ratio}%)</span>`;
      }

      let sinalBadge = '<span class="badge badge-neutral">Neutro</span>';
      if (item.has_signal) {
        if (item.signal_type === "COMPRA") {
          sinalBadge = '<span class="badge badge-buy">🚀 COMPRA (MME 20 + Vol)</span>';
        } else {
          sinalBadge = '<span class="badge badge-sell">⚠️ VENDA (MME 20 + Vol)</span>';
        }
      }

      const isMon = item.is_monitored !== undefined ? item.is_monitored : activeTimeframes.includes(item.timeframe);
      const rowClass = isMon ? "" : "row-paused";
      const monBadge = isMon
        ? `<button class="btn-tf-toggle active" data-tf="${item.timeframe}" title="Monitorando ativamente. Clique para pausar alertas WhatsApp deste gráfico.">🟢 Monitorando</button>`
        : `<button class="btn-tf-toggle paused" data-tf="${item.timeframe}" title="Pausado (Sem alertas WhatsApp). Clique para ativar monitoramento.">⚪ Pausado</button>`;

      html += `
        <tr class="${rowClass}" data-tf="${item.timeframe}" title="Clique na linha para visualizar o gráfico de ${item.timeframe_display}">
          <td><strong>${item.timeframe_display}</strong></td>
          <td>${monBadge}</td>
          <td>$ ${formatPrice(item.price_current, dec)}</td>
          <td>$ ${item.price_close ? formatPrice(item.price_close, dec) : '-'}</td>
          <td style="color: var(--accent-blue); font-weight: 600;">$ ${formatPrice(item.ema20, dec)}</td>
          <td style="color: var(--accent-gold); font-weight: 600;">${(item.volume || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${baseAsset}</td>
          <td style="color: var(--accent-purple); font-weight: 600;">${(item.ma_volume || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${baseAsset}</td>
          <td>${volBadge}</td>
          <td>${sinalBadge}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;

  } else {
    // Tabela Triple EMA
    thead.innerHTML = `
      <tr>
        <th>Tempo</th>
        <th>Alertas WhatsApp</th>
        <th>Preço Atual</th>
        <th style="color: var(--accent-green);">🟢 EMA 10</th>
        <th style="color: var(--accent-gold);">🟡 EMA 20</th>
        <th style="color: var(--accent-purple);">🟣 EMA 200</th>
        <th>Tendência</th>
        <th>Sinal</th>
      </tr>
    `;

    let html = "";
    timeframes.forEach(item => {
      const dec = getDecimals(item.price_current);
      let tendBadge = "";
      if (item.ema10 > item.ema200 && item.ema20 > item.ema200) {
        tendBadge = '<span class="badge badge-buy">ALTA (10,20 &gt; 200)</span>';
      } else if (item.ema10 < item.ema200 && item.ema20 < item.ema200) {
        tendBadge = '<span class="badge badge-sell">BAIXA (10,20 &lt; 200)</span>';
      } else {
        tendBadge = '<span class="badge badge-neutral">MISTA / TRANSIÇÃO</span>';
      }

      let sinalBadge = '<span class="badge badge-neutral">Neutro</span>';
      if (item.has_signal) {
        if (item.signal_type === "COMPRA") {
          sinalBadge = '<span class="badge badge-buy">🚀 COMPRA (10/20 &gt; 200)</span>';
        } else {
          sinalBadge = '<span class="badge badge-sell">⚠️ VENDA (10/20 &lt; 200)</span>';
        }
      }

      const isMon = item.is_monitored !== undefined ? item.is_monitored : activeTimeframes.includes(item.timeframe);
      const rowClass = isMon ? "" : "row-paused";
      const monBadge = isMon
        ? `<button class="btn-tf-toggle active" data-tf="${item.timeframe}" title="Monitorando ativamente. Clique para pausar alertas WhatsApp deste gráfico.">🟢 Monitorando</button>`
        : `<button class="btn-tf-toggle paused" data-tf="${item.timeframe}" title="Pausado (Sem alertas WhatsApp). Clique para ativar monitoramento.">⚪ Pausado</button>`;

      html += `
        <tr class="${rowClass}" data-tf="${item.timeframe}" title="Clique na linha para visualizar o gráfico de ${item.timeframe_display}">
          <td><strong>${item.timeframe_display}</strong></td>
          <td>${monBadge}</td>
          <td>$ ${formatPrice(item.price_current, dec)}</td>
          <td style="color: var(--accent-green); font-weight: 600;">$ ${formatPrice(item.ema10, dec)}</td>
          <td style="color: var(--accent-gold); font-weight: 600;">$ ${formatPrice(item.ema20, dec)}</td>
          <td style="color: var(--accent-purple); font-weight: 600;">$ ${formatPrice(item.ema200, dec)}</td>
          <td>${tendBadge}</td>
          <td>${sinalBadge}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  // Adiciona listeners para os botões de toggle de monitoramento
  tbody.querySelectorAll(".btn-tf-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tf = btn.getAttribute("data-tf");
      toggleTimeframeMonitoring(tf);
    });
  });

  // Clique na linha troca o gráfico para aquele timeframe
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.style.cursor = "pointer";
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".btn-tf-toggle")) return;
      const tf = tr.getAttribute("data-tf");
      if (tf) selectTimeframe(tf);
    });
  });
}

async function loadHistory() {
  const container = document.getElementById("alerts-container");
  try {
    const res = await fetch(`/api/history?symbol=${currentSymbol}&strategy=${currentStrategy}`);
    const data = await res.json();

    if (!data.history || data.history.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum rompimento recente no período auditado para ' + currentSymbol + '.</div>';
      return;
    }

    let html = "";
    data.history.forEach(item => {
      const isBuy = item.type === "COMPRA";
      const itemClass = isBuy ? "buy" : "sell";
      const icon = isBuy ? "🚀" : "⚠️";
      const title = isBuy ? "COMPRA (LONG)" : "VENDA (SHORT)";
      const itemSymbol = item.symbol || currentSymbol;
      const dec = getDecimals(item.price);

      let metricsHtml = "";
      if (item.strategy === "ema20_volume") {
        metricsHtml = `
          <span>Preço: $ ${formatPrice(item.price, dec)}</span>
          <span>🔵 MME 20: $ ${formatPrice(item.ema20, dec)}</span>
          <span>📊 Vol: ${(item.volume || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })}</span>
        `;
      } else {
        metricsHtml = `
          <span>Preço: $ ${formatPrice(item.price, dec)}</span>
          <span>🟢 10: $ ${formatPrice(item.ema10, dec)}</span>
          <span>🟣 200: $ ${formatPrice(item.ema200, dec)}</span>
        `;
      }

      html += `
        <div class="alert-item ${itemClass}">
          <div class="alert-header">
            <div class="alert-type">
              <span>${icon}</span>
              <span>${title} [${itemSymbol} • ${item.timeframe}]</span>
            </div>
            <div class="alert-time">${item.datetime}</div>
          </div>
          <div class="alert-desc">${item.message}</div>
          <div class="alert-values">
            ${metricsHtml}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
  }
}

function setupEventListeners() {
  // Modal de Gerenciamento de Ativos Monitorados
  const btnOpenSyms = document.getElementById("btn-open-symbols-modal");
  const symsModal = document.getElementById("symbols-modal");
  const btnCloseSyms = document.getElementById("btn-close-symbols-modal");
  const btnAddSym = document.getElementById("btn-submit-add-symbol");
  const inputSym = document.getElementById("input-new-symbol");

  if (btnOpenSyms && symsModal) {
    btnOpenSyms.addEventListener("click", () => {
      renderSymbolsModalList();
      symsModal.classList.add("active");
    });
  }

  if (btnCloseSyms && symsModal) {
    btnCloseSyms.addEventListener("click", () => {
      symsModal.classList.remove("active");
    });
  }

  if (symsModal) {
    symsModal.addEventListener("click", (e) => {
      if (e.target === symsModal) {
        symsModal.classList.remove("active");
      }
    });
  }

  if (btnAddSym && inputSym) {
    btnAddSym.addEventListener("click", () => {
      addNewSymbol(inputSym.value);
    });
    inputSym.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addNewSymbol(inputSym.value);
      }
    });
  }

  // Chips rápidos de ativos no modal
  document.querySelectorAll(".chip-btn").forEach(chip => {
    chip.addEventListener("click", () => {
      const sym = chip.getAttribute("data-sym");
      addNewSymbol(sym);
    });
  });

  // Seletor de Estratégias (Tabs)
  const stratTabs = document.querySelectorAll(".strategy-tab");
  stratTabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      stratTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentStrategy = tab.getAttribute("data-strat");
      
      // Sincroniza estratégia ativa no backend para os alertas do WhatsApp
      try {
        await fetch("/api/strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy: currentStrategy })
        });
      } catch (e) {
        console.error("Erro ao sincronizar estratégia com o backend:", e);
      }

      updateLegendsAndControls();
      loadChartData(currentTf, true);
      loadStatus();
      loadHistory();

      showToast(`Estratégia ativada: ${currentStrategy === "ema20_volume" ? "Rompimento MME 20 + Volume" : "Triple EMA (10, 20, 200)"}`);
    });
  });

  // Pílulas de monitoramento rápido de timeframes (WhatsApp)
  const monPills = document.querySelectorAll(".mon-pill");
  monPills.forEach(pill => {
    pill.addEventListener("click", () => {
      const tf = pill.getAttribute("data-mon-tf");
      toggleTimeframeMonitoring(tf);
    });
  });

  // Botões de Timeframe do Gráfico
  const tfButtons = document.querySelectorAll(".tf-btn");
  tfButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tfButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTf = btn.getAttribute("data-tf");
      loadChartData(currentTf, true);
      loadStatus();
    });
  });

  // Botões de Mercado (Futuros vs Spot)
  const marketButtons = document.querySelectorAll(".market-btn");
  marketButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      marketButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = btn.getAttribute("data-cat");
      showToast(`Mercado alterado para: ${currentCategory === 'linear' ? '🔥 Futuros Perpétuos' : '💎 À Vista (Spot)'}`);
      loadChartData(currentTf, true);
      loadStatus();
    });
  });

  // Botões de Fuso Horário (UTC, Bybit -2h, Brasília -3h)
  const tzButtons = document.querySelectorAll(".tz-btn");
  tzButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tzButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTzOffsetHours = parseInt(btn.getAttribute("data-offset"), 10);
      showToast(`Fuso horário ajustado: ${btn.textContent.trim()}`);
      loadChartData(currentTf, false);
    });
  });

  // Botões de Média Rápida (EMA 10 vs EMA 9 para Triple EMA)
  const emaButtons = document.querySelectorAll(".ema-btn");
  emaButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      emaButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFastEma = btn.getAttribute("data-ema");
      updateLegendsAndControls();
      showToast(`Média rápida alterada para: EMA ${currentFastEma}`);
      loadChartData(currentTf, false);
      loadStatus();
    });
  });

  // Botão Atualizar
  document.getElementById("btn-refresh").addEventListener("click", () => {
    loadChartData(currentTf, true);
    loadStatus();
    showToast(`Dados atualizados para ${currentSymbol}!`);
  });

  // Botão Atualizar Histórico
  document.getElementById("btn-refresh-history").addEventListener("click", () => {
    loadHistory();
    showToast(`Histórico de rompimentos atualizado para ${currentSymbol}!`);
  });

  // Botão Testar WhatsApp
  document.getElementById("btn-test-whatsapp").addEventListener("click", async () => {
    showToast("Disparando teste para o WhatsApp (+5581991798590)...");
    try {
      const res = await fetch("/api/test-whatsapp", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("✅ Mensagem de teste enviada para " + data.phone + "!");
      } else {
        showToast(`⚠️ Alerta exibido no console (${data.provider})`);
      }
    } catch (err) {
      showToast("❌ Erro ao disparar teste de WhatsApp");
    }
  });

  // Modal WhatsApp
  const waModal = document.getElementById("wa-modal");
  const btnOpenModal = document.getElementById("btn-whatsapp-modal");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnDisconnect = document.getElementById("btn-disconnect-wa");

  if (btnOpenModal) {
    btnOpenModal.addEventListener("click", () => {
      waModal.classList.add("active");
      checkWhatsAppStatus();
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", () => {
      waModal.classList.remove("active");
    });
  }

  if (waModal) {
    waModal.addEventListener("click", (e) => {
      if (e.target === waModal) {
        waModal.classList.remove("active");
      }
    });
  }

  if (btnDisconnect) {
    btnDisconnect.addEventListener("click", async () => {
      if (confirm("Deseja realmente desconectar esta sessão do WhatsApp?")) {
        showToast("Desconectando sessão...");
        try {
          const res = await fetch("/api/whatsapp/disconnect", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            showToast("Sessão desconectada. Gerando novo QR Code...");
            checkWhatsAppStatus();
          }
        } catch (err) {
          showToast("Erro ao desconectar sessão.");
        }
      }
    });
  }
}

let isCheckingWA = false;
async function checkWhatsAppStatus() {
  if (isCheckingWA) return;
  isCheckingWA = true;

  try {
    const res = await fetch("/api/whatsapp/status");
    const data = await res.json();

    const badgeDot = document.getElementById("wa-badge-status");
    const btnLabel = document.getElementById("wa-btn-label");
    const scanView = document.getElementById("wa-scan-view");
    const connectedView = document.getElementById("wa-connected-view");
    const qrImg = document.getElementById("qr-code-img");
    const qrLoader = document.getElementById("qr-loader");
    const connectedNumber = document.getElementById("wa-connected-number");

    if (data.connected) {
      if (badgeDot) badgeDot.className = "status-indicator-dot connected";
      if (btnLabel) btnLabel.textContent = "WhatsApp Conectado";
      if (scanView) scanView.style.display = "none";
      if (connectedView) connectedView.style.display = "flex";
      if (connectedNumber) connectedNumber.textContent = `+${data.phone || 'Conectado'}`;
    } else {
      if (badgeDot) badgeDot.className = "status-indicator-dot";
      if (btnLabel) btnLabel.textContent = "Conectar WhatsApp";
      if (scanView) scanView.style.display = "flex";
      if (connectedView) connectedView.style.display = "none";

      if (data.qr) {
        if (qrLoader) qrLoader.style.display = "none";
        if (qrImg) {
          qrImg.src = data.qr;
          qrImg.style.display = "block";
        }
      } else {
        if (qrLoader) {
          qrLoader.style.display = "flex";
          qrLoader.innerHTML = '<span class="status-pulse" style="width: 14px; height: 14px;"></span><span>Gerando QR Code...</span>';
        }
        if (qrImg) qrImg.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Erro ao verificar status do WhatsApp:", err);
  } finally {
    isCheckingWA = false;
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}
