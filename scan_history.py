import sys
from datetime import datetime
from colorama import Fore, Style, init
from config import Config
from bybit_client import BybitClient
from indicators import Indicators

# Garante suporte UTF-8 no Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

init(autoreset=True)

def audit_history():
    print(f"\n{Fore.CYAN}===============================================================")
    print(f"📜 AUDITORIA HISTÓRICA: ÚLTIMOS SINAIS DETECTADOS (BYBIT)")
    print(f"🪙 Par: {Config.SYMBOL} | Limite: Últimas 300 velas")
    print(f"==============================================================={Style.RESET_ALL}\n")

    client = BybitClient(category=Config.CATEGORY)

    for tf in Config.TIMEFRAMES:
        tf_display = Config.get_timeframe_display(tf)
        print(f"{Fore.YELLOW}▶ Verificando histórico para o tempo gráfico {tf_display}...{Style.RESET_ALL}")
        
        df = client.get_dataframe(Config.SYMBOL, tf, limit=300)
        if df is None or len(df) < 205:
            print(f"  {Fore.RED}Dados insuficientes para {tf_display}{Style.RESET_ALL}\n")
            continue

        df_analisado = Indicators.apply_strategy(df)
        
        # Filtra onde houve compra ou venda
        sinais = df_analisado[df_analisado["compra"] | df_analisado["venda"]]

        if sinais.empty:
            print(f"  {Fore.WHITE}Nenhum rompimento nas últimas 300 velas deste tempo gráfico.{Style.RESET_ALL}\n")
        else:
            print(f"  {Fore.GREEN}Encontrados {len(sinais)} rompimento(s) recentes:{Style.RESET_ALL}")
            for _, row in sinais.tail(5).iterrows():
                tipo = "🚀 COMPRA" if row["compra"] else "⚠️ VENDA"
                dt_str = row["datetime"].strftime("%d/%m/%Y %H:%M")
                preco = row["close"]
                e10 = row["ema10"]
                e20 = row["ema20"]
                e200 = row["ema200"]
                print(f"   • [{dt_str}] {tipo} | Preço: ${preco:,.2f} | 🟢 EMA10: ${e10:,.2f} | 🟡 EMA20: ${e20:,.2f} | 🟣 EMA200: ${e200:,.2f}")
            print()

if __name__ == "__main__":
    audit_history()
