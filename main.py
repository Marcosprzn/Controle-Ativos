import os
import sys
import time
import json
from datetime import datetime
from colorama import Fore, Style, init

from config import Config
from bybit_client import BybitClient
from indicators import Indicators
from notifier import WhatsAppNotifier

# Garante suporte UTF-8 no Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

init(autoreset=True)

STATE_FILE = "last_signals.json"

class BybitAlertBot:
    def __init__(self):
        self.symbol = Config.SYMBOL
        self.category = Config.CATEGORY
        self.timeframes = Config.TIMEFRAMES
        self.wait_close = Config.WAIT_CANDLE_CLOSE
        self.check_interval = Config.CHECK_INTERVAL_SECONDS
        
        self.client = BybitClient(category=self.category)
        self.notifier = WhatsAppNotifier()
        self.last_alerts = self._load_state()

    def _load_state(self) -> dict:
        """Carrega histórico de alertas para evitar duplicidades após reinicializações."""
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_state(self):
        """Salva histórico de alertas."""
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(self.last_alerts, f, indent=2)
        except Exception as e:
            print(f"[Aviso] Falha ao salvar estado: {e}")

    def run_check_cycle(self):
        """Executa um ciclo completo de checagem para todos os timeframes configurados."""
        agora_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        print(f"\n{Fore.CYAN}┌─────────────────────────────────────────────────────────────┐")
        print(f"│ 🔍 Ciclo de Monitoramento Bybit: {self.symbol} [{agora_str}]")
        print(f"└─────────────────────────────────────────────────────────────┘{Style.RESET_ALL}")
        
        # Cabeçalho da tabela de status
        print(f"{Fore.CYAN}{'Timeframe':<10} {'Preço Atual':<14} {Fore.GREEN}{'EMA 10 (Verde)':<16} {Fore.YELLOW}{'EMA 20 (Dourada)':<18} {Fore.MAGENTA}{'EMA 200 (Roxa)':<16} {Fore.WHITE}{'Tendência':<18} {'Sinal':<10}{Style.RESET_ALL}")
        print("-" * 105)

        for tf in self.timeframes:
            try:
                tf_display = Config.get_timeframe_display(tf)
                df = self.client.get_dataframe(self.symbol, tf, limit=300)
                
                if df is None or len(df) < 205:
                    print(f"{tf_display:<10} {Fore.RED}{'Sem dados suficientes na Bybit':<50}{Style.RESET_ALL}")
                    continue

                res = Indicators.check_latest_signal(df, wait_candle_close=self.wait_close)
                
                price_curr = res["price_current"]
                ema10 = res["ema10"]
                ema20 = res["ema20"]
                ema200 = res["ema200"]
                
                # Indicador visual de tendência
                if ema10 > ema200 and ema20 > ema200:
                    tendencia = f"{Fore.GREEN}ALTA (10,20>200){Style.RESET_ALL}"
                elif ema10 < ema200 and ema20 < ema200:
                    tendencia = f"{Fore.RED}BAIXA (10,20<200){Style.RESET_ALL}"
                else:
                    tendencia = f"{Fore.WHITE}LATERAL/MISTA{Style.RESET_ALL}"

                sinal_str = f"{Fore.WHITE}Nenhum{Style.RESET_ALL}"
                if res["has_signal"]:
                    if res["signal_type"] == "COMPRA":
                        sinal_str = f"{Fore.GREEN}🚀 COMPRA{Style.RESET_ALL}"
                    else:
                        sinal_str = f"{Fore.RED}⚠️ VENDA{Style.RESET_ALL}"

                # Formata linha com as cores das médias
                col_tf = f"{tf_display:<10}"
                col_price = f"${price_curr:<13,.2f}"
                col_e10 = f"{Fore.GREEN}${ema10:<15,.2f}{Style.RESET_ALL}"
                col_e20 = f"{Fore.YELLOW}${ema20:<17,.2f}{Style.RESET_ALL}"
                col_e200 = f"{Fore.MAGENTA}${ema200:<15,.2f}{Style.RESET_ALL}"
                col_tend = f"{tendencia:<28}"
                col_sinal = f"{sinal_str:<10}"

                print(f"{col_tf} {col_price} {col_e10} {col_e20} {col_e200} {col_tend} {col_sinal}")

                # Se houver sinal identificado pelo rompimento
                if res["has_signal"]:
                    candle_ts = str(res["candle_timestamp"])
                    state_key = f"{self.symbol}_{tf}"
                    
                    # Evitar alertas duplicados para o mesmo candle
                    if self.last_alerts.get(state_key) != candle_ts:
                        print(f"\n{Fore.GREEN}✨ [DISPARO DETECTADO] Rompimento no tempo gráfico {tf_display}! Enviando WhatsApp...{Style.RESET_ALL}")
                        
                        mensagem = self.notifier.format_alert_message(res, self.symbol, tf_display)
                        enviado = self.notifier.send_message(mensagem)
                        
                        if enviado:
                            self.last_alerts[state_key] = candle_ts
                            self._save_state()
                    else:
                        # Já foi alertado para esta vela específica
                        pass

            except Exception as e:
                print(f"{Fore.RED}❌ Erro ao processar timeframe {tf}: {e}{Style.RESET_ALL}")

    def start(self):
        """Inicia o loop contínuo de monitoramento."""
        print(f"{Fore.GREEN}=========================================================================")
        print(f"🚀 BOT BYBIT: ROMPIMENTO DE 3 MÉDIAS")
        print(f"   🟢 EMA 10 (Verde) | 🟡 EMA 20 (Dourada) | 🟣 EMA 200 (Roxa)")
        print(f"🪙 Ativo: {self.symbol} ({self.category.upper()})")
        print(f"⏱️ Timeframes: {', '.join([Config.get_timeframe_display(t) for t in self.timeframes])}")
        print(f"📱 Destinatário: {self.notifier.clean_phone_number(Config.CALLMEBOT_PHONE)} ({Config.WHATSAPP_PROVIDER.upper()})")
        print(f"⏳ Intervalo de checagem: {self.check_interval}s")
        print(f"========================================================================={Style.RESET_ALL}\n")

        try:
            while True:
                self.run_check_cycle()
                time.sleep(self.check_interval)
        except KeyboardInterrupt:
            print(f"\n{Fore.YELLOW}🛑 Bot interrompido pelo usuário. Até logo!{Style.RESET_ALL}")

if __name__ == "__main__":
    bot = BybitAlertBot()
    if len(sys.argv) > 1 and sys.argv[1] == "--scan-now":
        bot.run_check_cycle()
    else:
        bot.start()
