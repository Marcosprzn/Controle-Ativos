import os
from dotenv import load_dotenv

# Carrega arquivo .env
load_dotenv()

class Config:
    SYMBOL = os.getenv("SYMBOL", "BTCUSDT").upper().strip()
    raw_symbols = os.getenv("SYMBOLS", "BTCUSDT,ETHUSDT,HBARUSDT,LINKUSDT,SUIUSDT,AAVEUSDT,ONDOUSDT,DOGEUSDT,ENAUSDT")
    SYMBOLS = [s.strip().upper() for s in raw_symbols.split(",") if s.strip()]

    # Categoria padrão (linear = Futuros Perpétuos)
    CATEGORY = os.getenv("BYBIT_CATEGORY", "linear").lower().strip()
    
    # Processa os timeframes (sem 1m: 5m, 10m, 30m, 60m)
    raw_timeframes = os.getenv("TIMEFRAMES", "5,10,30,60")
    TIMEFRAMES = [tf.strip() for tf in raw_timeframes.split(",") if tf.strip() and tf.strip() not in ("1", "1m")]
    
    # Estratégia ativa inicial: 'ema20_volume' ou 'triple_ema'
    DEFAULT_STRATEGY = os.getenv("STRATEGY", "ema20_volume").lower().strip()
    
    CHECK_INTERVAL_SECONDS = int(os.getenv("CHECK_INTERVAL_SECONDS", "15"))
    WAIT_CANDLE_CLOSE = os.getenv("WAIT_CANDLE_CLOSE", "True").lower() in ("true", "1", "yes")
    
    # Provedor WhatsApp: 'baileys', 'callmebot', 'evolution', 'zapi', 'webhook', 'console'
    WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "baileys").lower().strip()
    
    # Grupo WhatsApp de Destino (procura pelo nome do grupo)
    WHATSAPP_GROUP = os.getenv("WHATSAPP_GROUP", "Bybit").strip()

    # CallMeBot
    CALLMEBOT_PHONE = os.getenv("CALLMEBOT_PHONE", "").strip()
    CALLMEBOT_API_KEY = os.getenv("CALLMEBOT_API_KEY", "").strip()
    
    # Evolution API / Z-API / Webhook
    EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL", "").strip()
    EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY", "").strip()
    DESTINATION_PHONE = os.getenv("DESTINATION_PHONE", "").strip()

    @classmethod
    def get_timeframe_display(cls, tf: str) -> str:
        """Retorna formato legível como 1m, 5m, 10m, 1h"""
        if tf in ("60", "60m"):
            return "1h (60m)"
        elif tf.endswith("m") or tf.endswith("h") or tf.endswith("d"):
            return tf
        else:
            return f"{tf}m"
