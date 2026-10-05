import sys
import urllib.parse
import requests
from datetime import datetime
from config import Config

# Garante suporte a emojis no console do Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


class WhatsAppNotifier:
    def __init__(self):
        self.provider = Config.WHATSAPP_PROVIDER

    def format_alert_message(self, signal_data: dict, symbol: str, timeframe_display: str, category: str = "linear") -> str:
        """
        Formata uma mensagem profissional e visualmente organizada para o WhatsApp.
        """
        tipo = signal_data.get("signal_type", "SINAL")
        emoji_header = "🟢 🚀" if tipo == "COMPRA" else "🔴 ⚠️"
        direcao = "COMPRA (LONG)" if tipo == "COMPRA" else "VENDA (SHORT)"
        strategy = signal_data.get("strategy", "triple_ema")
        market_label = "🔥 Futuros Perpétuos" if category == "linear" else "💎 À Vista (Spot)"

        preco_close = signal_data.get("price_close", 0.0)
        preco_current = signal_data.get("price_current", 0.0)
        motivo = signal_data.get("message", "")
        data_hora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

        if strategy == "ema20_volume":
            ema20 = signal_data.get("ema20", 0.0)
            vol = signal_data.get("volume", 0.0)
            ma_vol = signal_data.get("ma_volume", 0.0)
            ratio = signal_data.get("volume_ratio", 100.0)

            msg = (
                f"{emoji_header} *ALERTA DE ROMPIMENTO: {direcao}* {emoji_header}\n"
                f"📊 *Estratégia:* Rompimento MME 20 + Volume\n\n"
                f"🪙 *Ativo:* {symbol} ({market_label})\n"
                f"⏱️ *Tempo Gráfico:* {timeframe_display}\n"
                f"💵 *Preço do Rompimento:* $ {preco_close:,.2f}\n"
                f"📊 *Preço Atual:* $ {preco_current:,.2f}\n\n"
                f"📈 *Parâmetros do Rompimento:*\n"
                f" 🔵 *MME 20 (Preço):*      $ {ema20:,.2f}\n"
                f" 📊 *Volume Candle:*      {vol:,.2f} BTC\n"
                f" 📉 *Média 20 do Volume:* {ma_vol:,.2f} BTC ({ratio:.1f}%)\n"
                f" ✅ *Volume Confirmado:*  Sim (> Média 20)\n\n"
                f"⚡ *Gatilho:* {motivo}\n"
                f"⏰ *Horário:* {data_hora}\n\n"
                f"🤖 _Bot Bybit Rompimento MME 20 + Volume_"
            )
            return msg
        else:
            ema10 = signal_data.get("ema10", 0.0)
            ema20 = signal_data.get("ema20", 0.0)
            ema200 = signal_data.get("ema200", 0.0)

            msg = (
                f"{emoji_header} *ALERTA DE ROMPIMENTO: {direcao}* {emoji_header}\n"
                f"📊 *Estratégia:* Triple EMA (10, 20, 200)\n\n"
                f"🪙 *Ativo:* {symbol} ({market_label})\n"
                f"⏱️ *Tempo Gráfico:* {timeframe_display}\n"
                f"💵 *Preço do Rompimento:* $ {preco_close:,.2f}\n"
                f"📊 *Preço Atual:* $ {preco_current:,.2f}\n\n"
                f"📈 *Médias Exponenciais:*\n"
                f" 🟢 *EMA 10 (Verde):*   $ {ema10:,.2f}\n"
                f" 🟡 *EMA 20 (Dourada):* $ {ema20:,.2f}\n"
                f" 🟣 *EMA 200 (Roxa):*    $ {ema200:,.2f}\n\n"
                f"⚡ *Gatilho:* {motivo}\n"
                f"⏰ *Horário:* {data_hora}\n\n"
                f"🤖 _Bot Bybit Triple EMA Alert_"
            )
            return msg

    def send_message(self, message: str) -> bool:
        """
        Envia a mensagem de acordo com o provedor configurado no .env.
        """
        if self.provider == "console":
            print("\n" + "=" * 55)
            print("[SIMULAÇÃO WHATSAPP - MODO CONSOLE]")
            print(message)
            print("=" * 55 + "\n")
            return True

        elif self.provider == "baileys":
            return self._send_baileys(message)

        elif self.provider == "callmebot":
            return self._send_callmebot(message)

        elif self.provider in ("evolution", "zapi", "webhook"):
            return self._send_webhook(message)

        else:
            print(f"[Notifier] Provedor desconhecido: '{self.provider}'. Exibindo no console.")
            print(message)
            return False

    def _send_baileys(self, message: str) -> bool:
        """
        Envia mensagem via Baileys (Node.js nativo na porta 3001).
        """
        phone = self.clean_phone_number(Config.CALLMEBOT_PHONE)
        url = "http://127.0.0.1:3001/send"
        try:
            res = requests.post(url, json={"number": phone, "message": message}, timeout=10)
            data = res.json()
            if res.status_code == 200 and data.get("success"):
                print(f"[Baileys] ✅ Mensagem enviada via WhatsApp para {phone}!")
                return True
            else:
                err_msg = data.get("error", "WhatsApp não conectado no QR Code")
                print(f"[Baileys] ⚠️ Falha no envio: {err_msg}")
                return False
        except Exception as e:
            print(f"[Baileys] ❌ Erro de conexão com serviço Baileys: {e}")
            return False

    @staticmethod
    def clean_phone_number(raw_phone: str) -> str:
        """Limpa e formata o número com DDI (ex: 81991798590 -> +5581991798590)"""
        digits = "".join(filter(str.isdigit, raw_phone))
        if len(digits) in (10, 11):  # DDD + Número (ex: 81 99179-8590)
            digits = "55" + digits
        return f"+{digits}" if not raw_phone.startswith("+") else f"+{digits}"

    def _send_callmebot(self, message: str) -> bool:
        """
        Envia mensagem via CallMeBot (API gratuita para WhatsApp).
        """
        phone = self.clean_phone_number(Config.CALLMEBOT_PHONE)
        apikey = Config.CALLMEBOT_API_KEY

        if not phone or not apikey or "sua_api_key" in apikey:
            print("[CallMeBot] AVISO: CALLMEBOT_API_KEY ainda não configurada no .env!")
            print(f"[CallMeBot] O número de destino configurado é: {phone}")
            print("[CallMeBot] Mensagem não enviada ao WhatsApp. Exibindo no console:\n")
            print(message)
            return False

        encoded_text = urllib.parse.quote_plus(message)
        url = f"https://api.callmebot.com/whatsapp.php?phone={phone}&text={encoded_text}&apikey={apikey}"

        try:
            response = requests.get(url, timeout=15)
            if response.status_code == 200 and ("Message queued" in response.text or "success" in response.text.lower()):
                print(f"[CallMeBot] ✅ Mensagem enviada com sucesso para {phone}!")
                return True
            else:
                print(f"[CallMeBot] Resposta recebida ({response.status_code}): {response.text}")
                return response.status_code == 200
        except Exception as e:
            print(f"[CallMeBot] ❌ Erro ao enviar mensagem: {e}")
            return False

    def _send_webhook(self, message: str) -> bool:
        """
        Envia mensagem para Evolution API ou Webhook HTTP POST.
        """
        url = Config.EVOLUTION_API_URL
        api_key = Config.EVOLUTION_API_KEY
        phone = Config.DESTINATION_PHONE

        if not url:
            print("[Webhook] URL de webhook não configurada.")
            return False

        headers = {
            "Content-Type": "application/json",
            "apikey": api_key
        }
        payload = {
            "number": phone,
            "text": message
        }

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            if response.status_code in (200, 201):
                print(f"[Webhook] ✅ Mensagem enviada com sucesso via {self.provider}!")
                return True
            else:
                print(f"[Webhook] ❌ Falha no envio ({response.status_code}): {response.text}")
                return False
        except Exception as e:
            print(f"[Webhook] ❌ Erro ao conectar ao Webhook: {e}")
            return False

if __name__ == "__main__":
    import sys
    notifier = WhatsAppNotifier()
    print("[Teste Notifier] Enviando mensagem de teste...")
    teste_msg = (
        "🟢 🚀 *TESTE DE ALERTA: BOT BYBIT* 🚀 🟢\n\n"
        "🪙 *Ativo:* BTCUSDT\n"
        "⏱️ *Timeframe:* 5m\n"
        "💵 *Preço Simulado:* $ 84,300.00\n\n"
        "⚡ *Status:* Sistema de notificação configurado e funcionando perfeitamente!\n"
        f"⏰ *Horário:* {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
    )
    notifier.send_message(teste_msg)
