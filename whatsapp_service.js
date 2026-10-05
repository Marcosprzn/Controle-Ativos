const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = 3001;
const AUTH_DIR = path.join(__dirname, 'baileys_auth');

let sock = null;
let currentQR = null;
let connectionStatus = 'initializing'; // 'waiting_scan', 'connected', 'disconnected', 'initializing'
let connectedPhone = null;

// Cache em memória para responder a solicitações de reenvio criptográfico (resolve "Aguardando mensagem")
const sentMessagesStore = new Map();

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Bybit Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    generateHighQualityLinkPreview: false,
    getMessage: async (key) => {
      if (sentMessagesStore.has(key.id)) {
        return sentMessagesStore.get(key.id);
      }
      return { conversation: '' };
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'waiting_scan';
      try {
        currentQR = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      } catch (err) {
        console.error('[Baileys] Erro ao gerar imagem do QR code:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      connectionStatus = 'disconnected';
      connectedPhone = null;
      console.log(`[Baileys] Conexão encerrada (código: ${statusCode}). LoggedOut: ${isLoggedOut}`);

      if (isLoggedOut) {
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        setTimeout(startWhatsApp, 3000);
      } else {
        setTimeout(startWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      currentQR = null;
      const jid = sock.user?.id || '';
      connectedPhone = jid.split(':')[0] || jid.split('@')[0];
      console.log(`[Baileys] ✅ Conectado com sucesso ao WhatsApp! Número: +${connectedPhone}`);
    }
  });
}

// Endpoints da API HTTP
app.get('/status', (req, res) => {
  res.json({
    connected: connectionStatus === 'connected',
    status: connectionStatus,
    phone: connectedPhone,
    qr: currentQR
  });
});

app.post('/send', async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).json({ success: false, error: 'Campos number e message são obrigatórios' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ success: false, error: 'WhatsApp ainda não está conectado via QR Code' });
  }

  try {
    let cleanNumber = String(number).replace(/\D/g, '');
    if (cleanNumber.length === 10 || cleanNumber.length === 11) {
      cleanNumber = '55' + cleanNumber;
    }

    // No Brasil, verifica se a conta usa o nono dígito ou o formato legado
    const candidates = [cleanNumber];
    if (cleanNumber.startsWith('55') && cleanNumber.length === 13) {
      // 55 81 991798590 -> sem o 9: 55 81 91798590
      const semNove = '55' + cleanNumber.substring(2, 4) + cleanNumber.substring(5);
      candidates.push(semNove);
    } else if (cleanNumber.startsWith('55') && cleanNumber.length === 12) {
      // 55 81 91798590 -> com o 9: 55 81 991798590
      const comNove = '55' + cleanNumber.substring(2, 4) + '9' + cleanNumber.substring(4);
      candidates.push(comNove);
    }

    let targetJid = null;
    try {
      const waCheck = await sock.onWhatsApp(...candidates);
      const valid = waCheck?.find(c => c.exists);
      if (valid && valid.jid) {
        targetJid = valid.jid;
        console.log(`[Baileys] JID verificado no WhatsApp: ${targetJid}`);
      }
    } catch (e) {
      console.warn('[Baileys] Erro ao consultar onWhatsApp:', e.message);
    }

    if (!targetJid) {
      targetJid = `${cleanNumber}@s.whatsapp.net`;
    }

    const sent = await sock.sendMessage(targetJid, { text: message });
    if (sent?.key?.id && sent?.message) {
      sentMessagesStore.set(sent.key.id, sent.message);
      if (sentMessagesStore.size > 200) {
        const firstKey = sentMessagesStore.keys().next().value;
        sentMessagesStore.delete(firstKey);
      }
    }
    console.log(`[Baileys] 📨 Mensagem entregue com sucesso para ${targetJid}`);
    return res.json({ success: true, destination: targetJid });
  } catch (err) {
    console.error('[Baileys] ❌ Falha ao enviar mensagem:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
    }
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQR = null;
    setTimeout(startWhatsApp, 1500);
    return res.json({ success: true, message: 'Sessão desconectada com sucesso' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Baileys Server] Microserviço WhatsApp ativo na porta ${PORT}`);
  startWhatsApp();
});
