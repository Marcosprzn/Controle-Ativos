import time
import threading
import requests
import pandas as pd
from typing import Optional, Dict, Tuple

class BybitClient:
    BASE_URL = "https://api.bybit.com/v5/market/kline"
    
    # Intervalos nativos suportados pela API v5 da Bybit
    BYBIT_NATIVE_INTERVALS = {"1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "M", "W"}

    # Tempo de vida do cache (TTL em segundos) por timeframe
    CACHE_TTL_MAP = {
        "1": 4,     # 4s para 1m
        "5": 8,     # 8s para 5m
        "10": 10,   # 10s para 10m
        "15": 12,   # 12s para 15m
        "30": 20,   # 20s para 30m
        "60": 30,   # 30s para 1h
    }
    DEFAULT_TTL = 10

    # Cache em memória e controle de concorrência
    _cache: Dict[Tuple[str, str, str], Tuple[float, pd.DataFrame]] = {}
    _cache_lock = threading.Lock()
    _rate_limit_until: float = 0.0
    _last_request_time: float = 0.0

    def __init__(self, category: str = "linear"):
        self.category = category
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FinBot/2.0",
            "Accept": "application/json"
        })

    def fetch_raw_klines(self, symbol: str, interval: str, limit: int = 1000, category: Optional[str] = None) -> Optional[list]:
        """Consulta a API pública da Bybit v5 para klines com proteção contra rate limit."""
        cat = category or self.category
        now = time.time()

        # Se estiver em período de cooldown devido a rate limit anterior, não faz requisição
        if now < self._rate_limit_until:
            wait_remaining = int(self._rate_limit_until - now)
            print(f"[BybitClient] ⏳ Aguardando liberação do Rate Limit da Bybit ({wait_remaining}s restantes)...")
            return None

        # Espaçamento mínimo entre requisições reais (150ms) para evitar bursts
        with self._cache_lock:
            elapsed = now - self._last_request_time
            if elapsed < 0.15:
                time.sleep(0.15 - elapsed)
            self._last_request_time = time.time()

        params = {
            "category": cat,
            "symbol": symbol,
            "interval": interval,
            "limit": min(limit, 1000)
        }
        try:
            response = self.session.get(self.BASE_URL, params=params, timeout=8)
            
            # Checa se a Bybit retornou HTTP 429
            if response.status_code == 429:
                self._rate_limit_until = time.time() + 15
                print("[BybitClient] ⚠️ HTTP 429 recebido! Ativando cooldown de 15 segundos.")
                return None

            response.raise_for_status()
            data = response.json()
            ret_code = data.get("retCode")

            if ret_code == 0 and "result" in data and "list" in data["result"]:
                return data["result"]["list"]
            elif ret_code == 10006 or "too many" in str(data.get("retMsg", "")).lower():
                self._rate_limit_until = time.time() + 15
                print(f"[BybitClient] ⚠️ Rate limit detectado: '{data.get('retMsg')}'. Cooldown de 15s ativado.")
                return None
            else:
                print(f"[BybitClient] Erro retornado pela API: {data.get('retMsg')}")
                return None
        except Exception as e:
            if "too many" in str(e).lower() or "429" in str(e):
                self._rate_limit_until = time.time() + 15
                print(f"[BybitClient] ⚠️ Rate limit na conexão: {e}. Cooldown ativado.")
            else:
                print(f"[BybitClient] Erro ao consultar Klines ({symbol}, tf={interval}, cat={cat}): {e}")
            return None

    def get_dataframe(self, symbol: str, interval: str, limit: int = 1000, category: Optional[str] = None) -> Optional[pd.DataFrame]:
        """
        Retorna DataFrame com as velas ordenadas da mais antiga para a mais recente.
        Utiliza cache TTL inteligente em memória para eliminar requisições redundantes.
        """
        cat = category or self.category
        clean_interval = str(interval).replace("m", "").replace("M", "")
        cache_key = (symbol, clean_interval, cat)
        now = time.time()
        ttl = self.CACHE_TTL_MAP.get(clean_interval, self.DEFAULT_TTL)

        # 1. Verifica se temos cache válido em memória
        with self._cache_lock:
            if cache_key in self._cache:
                cached_time, cached_df = self._cache[cache_key]
                # Se ainda estiver dentro do TTL, retorna imediatamente do cache
                if (now - cached_time) < ttl:
                    return cached_df.copy()

        # 2. Se for 10 minutos (que não é nativo da Bybit), sintetiza agrupando velas de 5m
        if clean_interval == "10":
            df = self._get_synthetic_10m(symbol, limit, category=cat)
        else:
            raw_list = self.fetch_raw_klines(symbol, clean_interval, limit=limit, category=cat)
            if not raw_list or len(raw_list) == 0:
                # Se falhou por rate limit ou erro de rede, mas temos cache antigo, devolve o cache antigo!
                with self._cache_lock:
                    if cache_key in self._cache:
                        return self._cache[cache_key][1].copy()
                return None
            df = self._format_dataframe(raw_list)

        if df is not None and not df.empty:
            with self._cache_lock:
                self._cache[cache_key] = (now, df)
            return df.copy()

        # Fallback para cache existente caso df seja None
        with self._cache_lock:
            if cache_key in self._cache:
                return self._cache[cache_key][1].copy()

        return None

    def _get_synthetic_10m(self, symbol: str, limit: int = 1000, category: Optional[str] = None) -> Optional[pd.DataFrame]:
        """Sintetiza velas de 10 minutos a partir de velas de 5 minutos (2 x 5m = 10m)."""
        # Utiliza o get_dataframe de 5m que já se beneficia do cache
        df_5m = self.get_dataframe(symbol, "5", limit=1000, category=category)
        if df_5m is None or len(df_5m) < 20:
            return None

        df_copy = df_5m.copy()
        df_copy.set_index("datetime", inplace=True)
        
        # Resample OHLCV de 10 minutos fechando no final do intervalo
        resampled = df_copy.resample("10min").agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
            "turnover": "sum",
            "timestamp": "first"
        }).dropna()

        resampled.reset_index(inplace=True)
        return resampled

    def _format_dataframe(self, raw_list: list) -> pd.DataFrame:
        """
        Estrutura dos klines retornados pela Bybit v5:
        [startTime, openPrice, highPrice, lowPrice, closePrice, volume, turnover]
        (Vem ordenado do mais recente para o mais antigo)
        """
        columns = ["timestamp", "open", "high", "low", "close", "volume", "turnover"]
        df = pd.DataFrame(raw_list, columns=columns)

        # Converter colunas para float
        numeric_cols = ["open", "high", "low", "close", "volume", "turnover"]
        for col in numeric_cols:
            df[col] = df[col].astype(float)

        df["timestamp"] = df["timestamp"].astype(int)
        df["datetime"] = pd.to_datetime(df["timestamp"], unit="ms")

        # Inverter para que o mais antigo fique no índice 0 e o mais recente no final
        df = df.iloc[::-1].reset_index(drop=True)
        return df
