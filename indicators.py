import pandas as pd
from typing import Optional, Dict, Any

class Indicators:
    @staticmethod
    def calculate_ema(series: pd.Series, length: int) -> pd.Series:
        """
        Calcula a Média Móvel Exponencial (EMA) idêntica ao ta.ema do TradingView.
        Fórmula: alpha = 2 / (length + 1)
        """
        return series.ewm(span=length, adjust=False).mean()

    @staticmethod
    def crossover(series_a: pd.Series, series_b: pd.Series) -> pd.Series:
        """
        ta.crossover do Pine Script:
        Verdadeiro se series_a cruzou acima de series_b no candle avaliado.
        (a[t-1] <= b[t-1] and a[t] > b[t])
        """
        prev_a = series_a.shift(1)
        prev_b = series_b.shift(1)
        return (prev_a <= prev_b) & (series_a > series_b)

    @staticmethod
    def crossunder(series_a: pd.Series, series_b: pd.Series) -> pd.Series:
        """
        ta.crossunder do Pine Script:
        Verdadeiro se series_a cruzou abaixo de series_b no candle avaliado.
        (a[t-1] >= b[t-1] and a[t] < b[t])
        """
        prev_a = series_a.shift(1)
        prev_b = series_b.shift(1)
        return (prev_a >= prev_b) & (series_a < series_b)

    @staticmethod
    def calculate_sma(series: pd.Series, length: int) -> pd.Series:
        """
        Calcula a Média Móvel Simples (SMA) idêntica ao ta.sma do TradingView.
        """
        return series.rolling(window=length).mean()

    @classmethod
    def apply_strategy(cls, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calcula as EMAs 10 (Verde), 20 (Dourada) e 200 (Roxa) e aplica as condições
        de Compra e Venda definidas no rompimento.
        """
        df = df.copy()
        df["ema9"] = cls.calculate_ema(df["close"], 9)
        df["ema10"] = cls.calculate_ema(df["close"], 10)
        df["ema20"] = cls.calculate_ema(df["close"], 20)
        df["ema200"] = cls.calculate_ema(df["close"], 200)

        # Cruzamentos com a EMA 200 (Roxa)
        df["cross_up_10_200"] = cls.crossover(df["ema10"], df["ema200"])
        df["cross_up_20_200"] = cls.crossover(df["ema20"], df["ema200"])
        
        df["cross_down_10_200"] = cls.crossunder(df["ema10"], df["ema200"])
        df["cross_down_20_200"] = cls.crossunder(df["ema20"], df["ema200"])

        # Condição de Compra:
        # A 10 e a 20 devem estar acima da 200, e pelo menos uma delas acabou de cruzar para cima
        df["compra"] = (
            (df["ema10"] > df["ema200"]) & 
            (df["ema20"] > df["ema200"]) & 
            (df["cross_up_10_200"] | df["cross_up_20_200"])
        )

        # Condição de Venda:
        # A 10 e a 20 devem estar abaixo da 200, e pelo menos uma delas acabou de cruzar para baixo
        df["venda"] = (
            (df["ema10"] < df["ema200"]) & 
            (df["ema20"] < df["ema200"]) & 
            (df["cross_down_10_200"] | df["cross_down_20_200"])
        )

        return df

    @classmethod
    def check_latest_signal(cls, df: pd.DataFrame, wait_candle_close: bool = True) -> Dict[str, Any]:
        """
        Avalia o sinal no DataFrame para a estratégia Triple EMA (10/20/200).
        """
        if df is None or len(df) < 205:
            return {"has_signal": False, "signal_type": None, "reason": "Histórico insuficiente"}

        df_analisado = cls.apply_strategy(df)

        # Escolhe o candle a ser auditado
        idx = -2 if wait_candle_close else -1
        candle = df_analisado.iloc[idx]
        candle_atual = df_analisado.iloc[-1]

        signal_type = None
        has_signal = False
        message = ""

        if candle["compra"]:
            has_signal = True
            signal_type = "COMPRA"
            message = "Médias de 10 e 20 romperam a de 200 para CIMA!"
        elif candle["venda"]:
            has_signal = True
            signal_type = "VENDA"
            message = "Médias de 10 e 20 romperam a de 200 para BAIXO!"

        return {
            "strategy": "triple_ema",
            "has_signal": has_signal,
            "signal_type": signal_type,
            "message": message,
            "candle_timestamp": int(candle["timestamp"]),
            "candle_datetime": str(candle["datetime"]),
            "price_close": float(candle["close"]),
            "price_current": float(candle_atual["close"]),
            "ema9": float(candle["ema9"]),
            "ema10": float(candle["ema10"]),
            "ema20": float(candle["ema20"]),
            "ema200": float(candle["ema200"]),
            "is_closed_candle": wait_candle_close
        }

    @classmethod
    def apply_strategy_ema20_volume(cls, df: pd.DataFrame, ma_length: int = 20, vol_length: int = 20) -> pd.DataFrame:
        """
        Estratégia do Cliente: 'Rompimento de Média de 20 com Volume'
        - maPreco = ta.ema(close, 20)
        - maVolume = ta.sma(volume, 20)
        - rompeuParaCima = ta.crossover(close, maPreco)
        - rompeuParaBaixo = ta.crossunder(close, maPreco)
        - volumeConfirmado = volume > maVolume
        - sinalCompra = rompeuParaCima and volumeConfirmado
        - sinalVenda = rompeuParaBaixo and volumeConfirmado
        """
        df = df.copy()
        df["ema20"] = cls.calculate_ema(df["close"], ma_length)
        df["ma_volume"] = cls.calculate_sma(df["volume"], vol_length)

        df["rompeu_cima"] = cls.crossover(df["close"], df["ema20"])
        df["rompeu_baixo"] = cls.crossunder(df["close"], df["ema20"])
        df["volume_confirmado"] = df["volume"] > df["ma_volume"]

        df["compra"] = df["rompeu_cima"] & df["volume_confirmado"]
        df["venda"] = df["rompeu_baixo"] & df["volume_confirmado"]

        return df

    @classmethod
    def check_latest_signal_ema20_volume(cls, df: pd.DataFrame, wait_candle_close: bool = True, ma_length: int = 20, vol_length: int = 20) -> Dict[str, Any]:
        """
        Avalia o sinal de Rompimento da EMA 20 com Volume Confirmado (Pine Script do Cliente).
        """
        if df is None or len(df) < max(ma_length, vol_length) + 5:
            return {"has_signal": False, "signal_type": None, "reason": "Histórico insuficiente"}

        df_analisado = cls.apply_strategy_ema20_volume(df, ma_length, vol_length)

        idx = -2 if wait_candle_close else -1
        candle = df_analisado.iloc[idx]
        candle_atual = df_analisado.iloc[-1]

        signal_type = None
        has_signal = False
        message = ""

        vol_val = float(candle["volume"]) if pd.notnull(candle["volume"]) else 0.0
        ma_vol_val = float(candle["ma_volume"]) if pd.notnull(candle["ma_volume"]) else 0.0
        vol_confirmado = bool(candle["volume_confirmado"]) if pd.notnull(candle["volume_confirmado"]) else False

        if candle["compra"]:
            has_signal = True
            signal_type = "COMPRA"
            message = "Preço rompeu MME 20 para CIMA com Volume Confirmado!"
        elif candle["venda"]:
            has_signal = True
            signal_type = "VENDA"
            message = "Preço rompeu MME 20 para BAIXO com Volume Confirmado!"

        return {
            "strategy": "ema20_volume",
            "has_signal": has_signal,
            "signal_type": signal_type,
            "message": message,
            "candle_timestamp": int(candle["timestamp"]),
            "candle_datetime": str(candle["datetime"]),
            "price_close": float(candle["close"]),
            "price_current": float(candle_atual["close"]),
            "ema20": float(candle["ema20"]) if pd.notnull(candle["ema20"]) else 0.0,
            "volume": vol_val,
            "ma_volume": ma_vol_val,
            "volume_confirmado": vol_confirmado,
            "volume_ratio": round((vol_val / ma_vol_val) * 100, 1) if ma_vol_val > 0 else 100.0,
            "is_closed_candle": wait_candle_close
        }


