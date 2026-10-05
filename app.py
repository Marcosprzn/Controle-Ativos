import os
import sys
import time
import json
import webbrowser
import threading
import requests
import subprocess
from datetime import datetime
import pandas as pd
from flask import Flask, render_template, jsonify, request

from config import Config
from bybit_client import BybitClient
from indicators import Indicators
from notifier import WhatsAppNotifier

# Inicia o serviço Baileys Node.js automaticamente como singleton
_baileys_process = None
_baileys_lock = threading.Lock()

def ensure_baileys_running():
    global _baileys_process
    with _baileys_lock:
        try:
            r = requests.get("http://127.0.0.1:3001/status", timeout=1)
            if r.status_code == 200:
                return True
        except Exception:
            pass

        if _baileys_process is None or _baileys_process.poll() is not None:
            try:
                print("⚡ [Baileys] Inicializando microserviço Node.js (whatsapp_service.js)...")
                _baileys_process = subprocess.Popen(
                    ["node", "whatsapp_service.js"],
                    cwd=os.path.dirname(os.path.abspath(__file__)),
                    shell=True
                )
                time.sleep(2)
                return True
            except Exception as e:
                print(f"❌ [Baileys] Erro ao iniciar subprocesso Node.js: {e}")
                return False
        return True

# Garante suporte UTF-8 no Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

app = Flask(__name__)

# Instâncias globais
bybit = BybitClient(category=Config.CATEGORY)
notifier = WhatsAppNotifier()
STATE_FILE = "last_signals.json"
TIMEFRAMES_FILE = "monitored_timeframes.json"
SYMBOLS_FILE = "monitored_symbols.json"

# Estado em memória para alertas e estratégia
active_strategy = Config.DEFAULT_STRATEGY  # "ema20_volume" ou "triple_ema"

# Timeframes monitorados pelo bot (Padrão: apenas 30m e 1h / 60m ativos, conforme solicitado)
active_timeframes = ["30", "60"]
if os.path.exists(TIMEFRAMES_FILE):
    try:
        with open(TIMEFRAMES_FILE, "r", encoding="utf-8") as f:
            saved_tfs = json.load(f)
            if isinstance(saved_tfs, list) and len(saved_tfs) > 0:
                active_timeframes = [str(t) for t in saved_tfs if str(t) in Config.TIMEFRAMES]
    except Exception:
        active_timeframes = ["30", "60"]
else:
    try:
        with open(TIMEFRAMES_FILE, "w", encoding="utf-8") as f:
            json.dump(active_timeframes, f, indent=2)
    except Exception:
        pass

def save_timeframes_state():
    try:
        with open(TIMEFRAMES_FILE, "w", encoding="utf-8") as f:
            json.dump(active_timeframes, f, indent=2)
    except Exception as e:
        print(f"[Aviso] Falha ao salvar timeframes: {e}")

# Ativos disponíveis e ativos ativamente monitorados pelo bot para alertas WhatsApp
all_symbols = list(Config.SYMBOLS)
active_symbols = list(Config.SYMBOLS)

if os.path.exists(SYMBOLS_FILE):
    try:
        with open(SYMBOLS_FILE, "r", encoding="utf-8") as f:
            saved_syms = json.load(f)
            if isinstance(saved_syms, dict):
                saved_all = saved_syms.get("all_symbols", [])
                saved_active = saved_syms.get("active_symbols", [])
                if isinstance(saved_all, list) and len(saved_all) > 0:
                    all_symbols = [str(s).upper().strip() for s in saved_all if str(s).strip()]
                if isinstance(saved_active, list):
                    active_symbols = [str(s).upper().strip() for s in saved_active if str(s).upper().strip() in all_symbols]
            elif isinstance(saved_syms, list) and len(saved_syms) > 0:
                all_symbols = [str(s).upper().strip() for s in saved_syms if str(s).strip()]
                active_symbols = list(all_symbols)
    except Exception:
        all_symbols = list(Config.SYMBOLS)
        active_symbols = list(Config.SYMBOLS)
else:
    try:
        with open(SYMBOLS_FILE, "w", encoding="utf-8") as f:
            json.dump({"all_symbols": all_symbols, "active_symbols": active_symbols}, f, indent=2)
    except Exception:
        pass

def save_symbols_state():
    try:
        with open(SYMBOLS_FILE, "w", encoding="utf-8") as f:
            json.dump({"all_symbols": all_symbols, "active_symbols": active_symbols}, f, indent=2)
    except Exception as e:
        print(f"[Aviso] Falha ao salvar símbolos: {e}")

last_alerts = {}
if os.path.exists(STATE_FILE):
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            last_alerts = json.load(f)
    except Exception:
        last_alerts = {}

def save_alerts_state():
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(last_alerts, f, indent=2)
    except Exception as e:
        print(f"[Aviso] Falha ao salvar estado de alertas: {e}")

# Thread de monitoramento contínuo em background
def background_monitor_worker():
    """Worker que roda em background monitorando APENAS os timeframes e ativos selecionados pelo usuário."""
    print(f"🤖 [Worker Background] Monitor iniciado. Ativos: {', '.join(active_symbols)} | Timeframes: {', '.join(active_timeframes)}")
    cat = "linear"

    while True:
        try:
            # Filtra apenas os timeframes e ativos ativamente selecionados para monitoramento
            monitored_tfs = [tf for tf in Config.TIMEFRAMES if tf in active_timeframes]
            monitored_syms = [s for s in all_symbols if s in active_symbols]
            
            for symbol in monitored_syms:
                for tf in monitored_tfs:  # Apenas os ativos (ex: 30m e 1h)
                    tf_display = Config.get_timeframe_display(tf)
                    df = bybit.get_dataframe(symbol, tf, limit=300, category=cat)
                    if df is None or len(df) < 25:
                        time.sleep(0.15)
                        continue

                    # 1. Estratégia do Cliente: Rompimento MME 20 + Volume
                    try:
                        res_vol = Indicators.check_latest_signal_ema20_volume(df, wait_candle_close=Config.WAIT_CANDLE_CLOSE)
                        if res_vol and res_vol.get("has_signal"):
                            candle_ts = str(res_vol["candle_timestamp"])
                            state_key = f"{symbol}_{cat}_{tf}_ema20_volume"

                            if last_alerts.get(state_key) != candle_ts:
                                print(f"✨ [Worker] Rompimento MME 20+Vol em {symbol} [{tf_display}]! Disparando WhatsApp...")
                                msg = notifier.format_alert_message(res_vol, symbol, tf_display, category=cat)
                                if notifier.send_message(msg):
                                    last_alerts[state_key] = candle_ts
                                    save_alerts_state()
                    except Exception as e_vol:
                        print(f"[Worker] Erro checando EMA20+Vol em {symbol} {tf_display}: {e_vol}")

                    # 2. Estratégia Original: Triple EMA (10, 20, 200)
                    if len(df) >= 205:
                        try:
                            res_triple = Indicators.check_latest_signal(df, wait_candle_close=Config.WAIT_CANDLE_CLOSE)
                            if res_triple and res_triple.get("has_signal"):
                                candle_ts = str(res_triple["candle_timestamp"])
                                state_key = f"{symbol}_{cat}_{tf}_triple_ema"

                                if last_alerts.get(state_key) != candle_ts:
                                    print(f"✨ [Worker] Rompimento Triple EMA em {symbol} [{tf_display}]! Disparando WhatsApp...")
                                    msg = notifier.format_alert_message(res_triple, symbol, tf_display, category=cat)
                                    if notifier.send_message(msg):
                                        last_alerts[state_key] = candle_ts
                                        save_alerts_state()
                        except Exception as e_triple:
                            print(f"[Worker] Erro checando Triple EMA em {symbol} {tf_display}: {e_triple}")

                    # Espaçamento suave para evitar rate limits
                    time.sleep(0.2)

        except Exception as e:
            print(f"[Worker Background] Erro no ciclo de monitoramento multi-ativo: {e}")

        time.sleep(Config.CHECK_INTERVAL_SECONDS)

# Rotas Web
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/symbols", methods=["GET", "POST"])
def api_symbols():
    """Consulta ou altera os ativos cadastrados e ativos no monitoramento de alertas WhatsApp."""
    global all_symbols, active_symbols
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        action = data.get("action", "").lower().strip()

        # 1. Ativar/Pausar lista de ativos monitorados
        if action == "set_active":
            new_active = data.get("active_symbols")
            if isinstance(new_active, list):
                active_symbols = [str(s).upper().strip() for s in new_active if str(s).upper().strip() in all_symbols]
                save_symbols_state()
                print(f"🪙 [Config] Ativos monitorados atualizados: {active_symbols}")
                return jsonify({"success": True, "all_symbols": all_symbols, "active_symbols": active_symbols})
            return jsonify({"success": False, "error": "Formato inválido"}), 400

        # 2. Alternar (toggle) monitoramento de um ativo específico
        elif action == "toggle":
            sym = data.get("symbol", "").upper().strip()
            if not sym or sym not in all_symbols:
                return jsonify({"success": False, "error": f"Ativo '{sym}' não encontrado na lista"}), 404
            
            if sym in active_symbols:
                active_symbols.remove(sym)
            else:
                active_symbols.append(sym)
            save_symbols_state()
            print(f"🪙 [Config] Ativo {sym} agora {'ATIVADO' if sym in active_symbols else 'PAUSADO'} no monitoramento WhatsApp")
            return jsonify({
                "success": True,
                "symbol": sym,
                "is_monitored": sym in active_symbols,
                "all_symbols": all_symbols,
                "active_symbols": active_symbols
            })

        # 3. Adicionar um novo ativo à lista
        elif action == "add":
            raw_sym = data.get("symbol", "").upper().strip()
            if not raw_sym:
                return jsonify({"success": False, "error": "Nome do ativo não pode ser vazio"}), 400

            # Adiciona sufixo USDT caso o usuário digite apenas SOL, ADA, etc.
            if not (raw_sym.endswith("USDT") or raw_sym.endswith("PERP") or raw_sym.endswith("USDC")):
                sym = f"{raw_sym}USDT"
            else:
                sym = raw_sym

            if sym in all_symbols:
                return jsonify({"success": False, "error": f"O ativo '{sym}' já está cadastrado"}), 400

            # Valida na Bybit se o par existe
            try:
                test_df = bybit.get_dataframe(sym, "60", limit=10, category=Config.CATEGORY)
                if test_df is None or len(test_df) == 0:
                    return jsonify({"success": False, "error": f"O par '{sym}' não retornou dados da Bybit. Verifique a grafia."}), 400
            except Exception as e:
                return jsonify({"success": False, "error": f"Erro validando par na Bybit: {str(e)}"}), 400

            all_symbols.append(sym)
            if sym not in active_symbols:
                active_symbols.append(sym)
            save_symbols_state()
            print(f"➕ [Config] Novo ativo adicionado e ativado no monitoramento: {sym}")
            return jsonify({
                "success": True,
                "symbol": sym,
                "all_symbols": all_symbols,
                "active_symbols": active_symbols
            })

        # 4. Remover um ativo da lista
        elif action == "remove":
            sym = data.get("symbol", "").upper().strip()
            if not sym or sym not in all_symbols:
                return jsonify({"success": False, "error": f"Ativo '{sym}' não encontrado"}), 404

            if len(all_symbols) <= 1:
                return jsonify({"success": False, "error": "Você precisa manter pelo menos 1 ativo na lista"}), 400

            all_symbols.remove(sym)
            if sym in active_symbols:
                active_symbols.remove(sym)
            save_symbols_state()
            print(f"🗑️ [Config] Ativo removido: {sym}")
            return jsonify({
                "success": True,
                "symbol": sym,
                "all_symbols": all_symbols,
                "active_symbols": active_symbols
            })

        return jsonify({"success": False, "error": "Ação inválida"}), 400

    return jsonify({
        "all_symbols": all_symbols,
        "active_symbols": active_symbols,
        "symbols": all_symbols,
        "default": all_symbols[0] if all_symbols else "BTCUSDT"
    })

@app.route("/api/timeframes", methods=["GET", "POST"])
def api_timeframes():
    """Consulta ou altera os timeframes ativos no monitoramento de alertas WhatsApp."""
    global active_timeframes
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        new_tfs = data.get("active_timeframes")
        if isinstance(new_tfs, list):
            active_timeframes = [str(t) for t in new_tfs if str(t) in Config.TIMEFRAMES]
            save_timeframes_state()
            print(f"⏱️ [Config] Timeframes monitorados atualizados para: {active_timeframes}")
            return jsonify({"success": True, "active_timeframes": active_timeframes})
        return jsonify({"success": False, "error": "Formato inválido"}), 400

    return jsonify({
        "all_timeframes": Config.TIMEFRAMES,
        "active_timeframes": active_timeframes
    })

@app.route("/api/strategy", methods=["GET", "POST"])
def api_strategy():
    """Consulta ou altera a estratégia de rompimento ativa."""
    global active_strategy
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        strat = data.get("strategy", "").lower().strip()
        if strat in ("ema20_volume", "triple_ema"):
            active_strategy = strat
            print(f"🔄 [Estratégia] Estratégia ativa alterada para: {active_strategy}")
            return jsonify({"success": True, "active_strategy": active_strategy})
        return jsonify({"success": False, "error": "Estratégia inválida"}), 400
    return jsonify({"active_strategy": active_strategy})

@app.route("/api/status")
def api_status():
    """Retorna o status em tempo real de todos os timeframes para o ativo selecionado."""
    symbol = request.args.get("symbol", Config.SYMBOL).upper().strip()
    category = request.args.get("category", Config.CATEGORY).lower().strip()
    strat = request.args.get("strategy", active_strategy).lower().strip()
    results = []
    min_len = 25 if strat == "ema20_volume" else 205

    for tf in Config.TIMEFRAMES:
        tf_display = Config.get_timeframe_display(tf)
        is_mon = (tf in active_timeframes)
        try:
            df = bybit.get_dataframe(symbol, tf, limit=1000, category=category)
            if df is None or len(df) < min_len:
                results.append({
                    "timeframe": tf,
                    "timeframe_display": tf_display,
                    "is_monitored": is_mon,
                    "price_current": 0.0,
                    "price_close": 0.0,
                    "ema20": 0.0,
                    "has_signal": False,
                    "signal_type": None,
                    "error": "Dados insuficientes"
                })
                continue

            if strat == "ema20_volume":
                res = Indicators.check_latest_signal_ema20_volume(df, wait_candle_close=Config.WAIT_CANDLE_CLOSE)
                results.append({
                    "timeframe": tf,
                    "timeframe_display": tf_display,
                    "is_monitored": is_mon,
                    "price_current": res["price_current"],
                    "price_close": res["price_close"],
                    "ema20": res["ema20"],
                    "volume": res["volume"],
                    "ma_volume": res["ma_volume"],
                    "volume_confirmado": res["volume_confirmado"],
                    "volume_ratio": res["volume_ratio"],
                    "has_signal": res["has_signal"],
                    "signal_type": res["signal_type"],
                    "message": res["message"],
                    "candle_datetime": res["candle_datetime"],
                    "strategy": "ema20_volume"
                })
            else:
                res = Indicators.check_latest_signal(df, wait_candle_close=Config.WAIT_CANDLE_CLOSE)
                results.append({
                    "timeframe": tf,
                    "timeframe_display": tf_display,
                    "is_monitored": is_mon,
                    "price_current": res["price_current"],
                    "price_close": res["price_close"],
                    "ema9": res["ema9"],
                    "ema10": res["ema10"],
                    "ema20": res["ema20"],
                    "ema200": res["ema200"],
                    "has_signal": res["has_signal"],
                    "signal_type": res["signal_type"],
                    "message": res["message"],
                    "candle_datetime": res["candle_datetime"],
                    "strategy": "triple_ema"
                })
        except Exception as e:
            results.append({
                "timeframe": tf,
                "timeframe_display": tf_display,
                "is_monitored": is_mon,
                "error": str(e)
            })

    return jsonify({
        "symbol": symbol,
        "category": category,
        "strategy": strat,
        "timeframes": results,
        "active_timeframes": active_timeframes,
        "monitored_symbols": active_symbols,
        "all_symbols": all_symbols,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

@app.route("/api/chart-data")
def api_chart_data():
    """Retorna velas e as médias/volume formatadas para o Lightweight Charts."""
    symbol = request.args.get("symbol", Config.SYMBOL).upper().strip()
    tf = request.args.get("tf", "5")
    category = request.args.get("category", Config.CATEGORY).lower().strip()
    strat = request.args.get("strategy", active_strategy).lower().strip()
    df = bybit.get_dataframe(symbol, tf, limit=1000, category=category)

    min_len = 25 if strat == "ema20_volume" else 205
    if df is None or len(df) < min_len:
        return jsonify({"candles": [], "volumes": [], "ma_volume": [], "ema9": [], "ema10": [], "ema20": [], "ema200": [], "strategy": strat, "symbol": symbol})

    candles = []
    volumes = []
    ema20_data = []

    if strat == "ema20_volume":
        df_analisado = Indicators.apply_strategy_ema20_volume(df)
        ma_vol_data = []

        for _, row in df_analisado.iterrows():
            time_sec = int(row["timestamp"] / 1000)
            candles.append({
                "time": time_sec,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"])
            })
            is_up = row["close"] >= row["open"]
            vol_val = float(row["volume"])
            volumes.append({
                "time": time_sec,
                "value": vol_val,
                "color": "rgba(16, 185, 129, 0.6)" if is_up else "rgba(239, 68, 68, 0.6)"
            })
            if not pd.isna(row["ema20"]):
                ema20_data.append({"time": time_sec, "value": float(row["ema20"])})
            if not pd.isna(row["ma_volume"]):
                ma_vol_data.append({"time": time_sec, "value": float(row["ma_volume"])})

        return jsonify({
            "candles": candles,
            "volumes": volumes,
            "ma_volume": ma_vol_data,
            "ema20": ema20_data,
            "strategy": "ema20_volume",
            "category": category
        })
    else:
        df_analisado = Indicators.apply_strategy(df)
        ema9_data = []
        ema10_data = []
        ema200_data = []

        for _, row in df_analisado.iterrows():
            time_sec = int(row["timestamp"] / 1000)
            candles.append({
                "time": time_sec,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"])
            })
            if not pd.isna(row["ema9"]):
                ema9_data.append({"time": time_sec, "value": float(row["ema9"])})
            if not pd.isna(row["ema10"]):
                ema10_data.append({"time": time_sec, "value": float(row["ema10"])})
            if not pd.isna(row["ema20"]):
                ema20_data.append({"time": time_sec, "value": float(row["ema20"])})
            if not pd.isna(row["ema200"]):
                ema200_data.append({"time": time_sec, "value": float(row["ema200"])})

        return jsonify({
            "candles": candles,
            "ema9": ema9_data,
            "ema10": ema10_data,
            "ema20": ema20_data,
            "ema200": ema200_data,
            "strategy": "triple_ema",
            "category": category
        })

@app.route("/api/history")
def api_history():
    """Retorna os últimos rompimentos confirmados nos gráficos."""
    strat = request.args.get("strategy", active_strategy).lower().strip()
    symbol = request.args.get("symbol", Config.SYMBOL).upper().strip()
    history = []
    min_len = 25 if strat == "ema20_volume" else 205

    for tf in Config.TIMEFRAMES:
        tf_display = Config.get_timeframe_display(tf)
        try:
            df = bybit.get_dataframe(symbol, tf, limit=300)
            if df is None or len(df) < min_len:
                continue

            if strat == "ema20_volume":
                df_analisado = Indicators.apply_strategy_ema20_volume(df)
                sinais = df_analisado[df_analisado["compra"] | df_analisado["venda"]]
                for _, row in sinais.tail(3).iterrows():
                    tipo = "COMPRA" if row["compra"] else "VENDA"
                    vol = float(row["volume"])
                    ma_vol = float(row["ma_volume"]) if pd.notnull(row["ma_volume"]) else 0.0
                    history.append({
                        "symbol": symbol,
                        "strategy": "ema20_volume",
                        "timeframe": tf_display,
                        "datetime": row["datetime"].strftime("%d/%m %H:%M"),
                        "type": tipo,
                        "price": float(row["close"]),
                        "ema20": float(row["ema20"]),
                        "volume": vol,
                        "ma_volume": ma_vol,
                        "message": f"Preço rompeu MME 20 para {'CIMA' if tipo == 'COMPRA' else 'BAIXO'} com Volume Confirmado ({vol:,.1f} > {ma_vol:,.1f})"
                    })
            else:
                df_analisado = Indicators.apply_strategy(df)
                sinais = df_analisado[df_analisado["compra"] | df_analisado["venda"]]
                for _, row in sinais.tail(3).iterrows():
                    tipo = "COMPRA" if row["compra"] else "VENDA"
                    history.append({
                        "symbol": symbol,
                        "strategy": "triple_ema",
                        "timeframe": tf_display,
                        "datetime": row["datetime"].strftime("%d/%m %H:%M"),
                        "type": tipo,
                        "price": float(row["close"]),
                        "ema10": float(row["ema10"]),
                        "ema20": float(row["ema20"]),
                        "ema200": float(row["ema200"]),
                        "message": "Médias 10 e 20 romperam a 200 para CIMA" if tipo == "COMPRA" else "Médias 10 e 20 romperam a 200 para BAIXO"
                    })
        except Exception:
            continue

    history.reverse()
    return jsonify({"history": history[:15], "strategy": strat})

@app.route("/api/whatsapp/status")
def api_whatsapp_status():
    """Retorna o status da conexão Baileys e o QR Code em base64 se disponível."""
    try:
        r = requests.get("http://127.0.0.1:3001/status", timeout=2)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({
            "connected": False,
            "status": "offline",
            "phone": None,
            "qr": None,
            "error": "Serviço WhatsApp offline."
        })

@app.route("/api/whatsapp/disconnect", methods=["POST"])
def api_whatsapp_disconnect():
    """Desconecta a sessão atual do Baileys para permitir novo QR Code."""
    try:
        r = requests.post("http://127.0.0.1:3001/disconnect", timeout=5)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/whatsapp/config", methods=["GET", "POST"])
def api_whatsapp_config():
    """Consulta ou atualiza o nome do grupo WhatsApp configurado para os alertas."""
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        new_group = data.get("target_group", "").strip()
        if not new_group:
            return jsonify({"success": False, "error": "Nome do grupo não pode ser vazio"}), 400

        # Salva localmente em whatsapp_config.json
        cfg_file = os.path.join(os.path.dirname(__file__), "whatsapp_config.json")
        try:
            with open(cfg_file, "w", encoding="utf-8") as f:
                json.dump({"target_group": new_group}, f, indent=2)
        except Exception as fe:
            print(f"[Config] Erro ao salvar arquivo local: {fe}")

        try:
            r = requests.post("http://127.0.0.1:3001/config", json={"target_group": new_group}, timeout=6)
            return jsonify(r.json())
        except Exception:
            return jsonify({
                "success": True,
                "target_group": new_group,
                "group_found": False,
                "warning": "Configuração salva localmente. Microserviço Baileys em atualização."
            })
    else:
        try:
            r = requests.get("http://127.0.0.1:3001/config", timeout=4)
            return jsonify(r.json())
        except Exception:
            group_name = notifier.get_target_group()
            return jsonify({
                "success": True,
                "target_group": group_name,
                "group_found": False,
                "available_groups": []
            })

@app.route("/api/whatsapp/groups")
def api_whatsapp_groups():
    """Lista todos os grupos do WhatsApp que o número conectado participa."""
    try:
        r = requests.get("http://127.0.0.1:3001/groups", timeout=6)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "groups": []})

@app.route("/api/test-whatsapp", methods=["POST"])
def api_test_whatsapp():
    """Dispara teste imediato para o grupo WhatsApp configurado."""
    group_name = notifier.get_target_group()
    teste_msg = (
        "🟢 🚀 *TESTE DE ALERTA: BOT BYBIT DASHBOARD* 🚀 🟢\n\n"
        f"🪙 *Ativo:* {Config.SYMBOL}\n"
        f"👥 *Grupo de Destino:* {group_name}\n"
        "⚡ *Status:* Sistema web e WhatsApp Baileys conectados ao grupo!\n"
        f"⏰ *Horário:* {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n\n"
        "🤖 _Bot Bybit Rompimento MME 20 + Volume_"
    )
    sucesso = notifier.send_message(teste_msg)
    return jsonify({
        "success": sucesso,
        "provider": Config.WHATSAPP_PROVIDER,
        "group": group_name
    })

def open_browser():
    """Abre o navegador automaticamente no localhost."""
    url = "http://127.0.0.1:5000"
    print(f"\n🌐 [Navegador] Abrindo o Dashboard em: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[Navegador] Aviso: Não foi possível abrir automaticamente o navegador: {e}")

if __name__ == "__main__":
    # Garante que o serviço Baileys em Node.js está rodando
    ensure_baileys_running()

    # Inicia a thread do monitor em background
    monitor_thread = threading.Thread(target=background_monitor_worker, daemon=True)
    monitor_thread.start()

    # Agenda a abertura automática do navegador em 1.5s
    threading.Timer(1.5, open_browser).start()

    print("\n" + "=" * 70)
    print("🚀 DASHBOARD BYBIT TRIPLE EMA (FLASK + BAILEYS) INICIADO!")
    print("🌐 Acesse no seu navegador: http://127.0.0.1:5000")
    print("📱 WhatsApp: Pareamento via QR Code nativo no Dashboard")
    print("=" * 70 + "\n")

    # Inicia o servidor Flask
    app.run(host="127.0.0.1", port=5000, debug=False)

