const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, isJidBroadcast } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = 3001;
const AUTH_DIR = path.join(__dirname, 'baileys_auth');
const CONFIG_FILE = path.join(__dirname, 'whatsapp_config.json');

// Intercepta e auto-corrige sessões desincronizadas do libsignal ("Bad MAC")
const cleanedSessions = new Set();
function cleanCorruptedSession(identifier) {
  if (!identifier || cleanedSessions.has(identifier)) return;
  cleanedSessions.add(identifier);
  setTimeout(() => cleanedSessions.delete(identifier), 30000);

  try {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      let count = 0;
      for (const file of files) {
        if (file.includes(identifier) && (file.startsWith('session-') || file.startsWith('sender-key-') || file.startsWith('identity-key-'))) {
          try {
            fs.unlinkSync(path.join(AUTH_DIR, file));
            count++;
          } catch (e) {}
        }
      }
      if (count > 0) {
        console.log(`[Baileys Crypto] 🔄 Chaves desincronizadas recicladas para ${identifier} (${count} arquivos).`);
      }
    }
  } catch (e) {}
}

const originalConsoleError = console.error;
console.error = function (...args) {
  const fullText = args.map(a => (typeof a === 'object' && a?.stack ? a.stack : String(a))).join(' ');

  if (fullText.includes('Bad MAC') || fullText.includes('Failed to decrypt message with any known session')) {
    const match = fullText.match(/(\d{7,16})/);
    if (match) {
      cleanCorruptedSession(match[1]);
    }
    // Suprime o stack trace barulhento do libsignal no terminal
    return;
  }

  originalConsoleError.apply(console, args);
};

let sock = null;
let currentQR = null;
let connectionStatus = 'initializing'; // 'waiting_scan', 'connected', 'disconnected', 'initializing'
let connectedPhone = null;

// Cache em memória para responder a solicitações de reenvio criptográfico (resolve "Aguardando mensagem")
const sentMessagesStore = new Map();

// Cache de grupos participantes
let groupsCache = null;
let lastGroupsFetch = 0;

// Configuração persistente
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (data && data.target_group) {
        return { target_group: String(data.target_group).trim() };
      }
    }
  } catch (err) {
    console.error('[Config] Erro ao ler whatsapp_config.json:', err.message);
  }
  return { target_group: 'Bybit' };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Config] Erro ao salvar whatsapp_config.json:', err.message);
    return false;
  }
}

let appConfig = loadConfig();

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
    shouldIgnoreJid: (jid) => isJidBroadcast(jid) || jid.endsWith('@newsletter'),
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
      groupsCache = null;
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
      
      // Pré-carrega grupos em background
      setTimeout(async () => {
        try {
          const grps = await getParticipatingGroups(true);
          console.log(`[Baileys] 📋 ${grps.length} grupo(s) detectado(s) na conta.`);
          const target = await findGroupByName(appConfig.target_group);
          if (target) {
            console.log(`[Baileys] 🎯 Grupo alvo "${target.name}" ENCONTRADO! (JID: ${target.jid})`);
          } else {
            console.log(`[Baileys] ⚠️ Grupo alvo "${appConfig.target_group}" ainda não encontrado entre os grupos.`);
          }
        } catch (e) {
          console.warn('[Baileys] Aviso ao inicializar busca de grupos:', e.message);
        }
      }, 2000);
    }
  });
}

// Helper: Lista todos os grupos participantes
async function getParticipatingGroups(forceRefresh = false) {
  if (!sock || connectionStatus !== 'connected') {
    return groupsCache || [];
  }
  const now = Date.now();
  if (!forceRefresh && groupsCache && (now - lastGroupsFetch < 15000)) {
    return groupsCache;
  }
  try {
    const raw = await sock.groupFetchAllParticipating();
    const list = Object.values(raw).map(g => ({
      jid: g.id,
      name: (g.subject || '').trim(),
      participantsCount: Array.isArray(g.participants) ? g.participants.length : 0
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    groupsCache = list;
    lastGroupsFetch = now;
    return list;
  } catch (err) {
    console.warn('[Baileys] Erro ao buscar grupos participantes:', err.message);
    return groupsCache || [];
  }
}

// Helper: Localiza grupo pelo nome (exato ou parcial)
async function findGroupByName(targetName) {
  if (!targetName || !targetName.trim()) return null;
  const cleanTarget = targetName.trim().toLowerCase();

  let groups = await getParticipatingGroups(false);

  // 1. Busca exata (case insensitive)
  let found = groups.find(g => g.name.toLowerCase() === cleanTarget);
  if (found) return found;

  // 2. Busca por substring
  found = groups.find(g => g.name.toLowerCase().includes(cleanTarget));
  if (found) return found;

  // Se não achou no cache, força atualização da rede WhatsApp
  groups = await getParticipatingGroups(true);
  found = groups.find(g => g.name.toLowerCase() === cleanTarget);
  if (found) return found;

  found = groups.find(g => g.name.toLowerCase().includes(cleanTarget));
  return found || null;
}

// Endpoints da API HTTP
app.get('/status', async (req, res) => {
  let targetGroupInfo = null;
  let groupFound = false;

  if (connectionStatus === 'connected' && sock) {
    const found = await findGroupByName(appConfig.target_group);
    if (found) {
      groupFound = true;
      targetGroupInfo = found;
    }
  }

  res.json({
    connected: connectionStatus === 'connected',
    status: connectionStatus,
    phone: connectedPhone,
    qr: currentQR,
    target_group: appConfig.target_group,
    group_found: groupFound,
    group_info: targetGroupInfo
  });
});

app.get('/config', async (req, res) => {
  let found = null;
  let allGroups = [];
  if (connectionStatus === 'connected' && sock) {
    allGroups = await getParticipatingGroups(false);
    found = await findGroupByName(appConfig.target_group);
  }
  res.json({
    success: true,
    target_group: appConfig.target_group,
    group_found: !!found,
    group_info: found,
    available_groups: allGroups
  });
});

app.post('/config', async (req, res) => {
  const { target_group } = req.body;
  if (!target_group || !String(target_group).trim()) {
    return res.status(400).json({ success: false, error: 'O nome do grupo não pode ser vazio' });
  }

  appConfig.target_group = String(target_group).trim();
  saveConfig(appConfig);
  console.log(`[Config] 👥 Grupo WhatsApp de destino alterado para: "${appConfig.target_group}"`);

  let found = null;
  let allGroups = [];
  if (connectionStatus === 'connected' && sock) {
    allGroups = await getParticipatingGroups(true);
    found = await findGroupByName(appConfig.target_group);
  }

  return res.json({
    success: true,
    target_group: appConfig.target_group,
    group_found: !!found,
    group_info: found,
    available_groups: allGroups
  });
});

app.get('/groups', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ success: false, error: 'WhatsApp não está conectado', groups: [] });
  }
  const groups = await getParticipatingGroups(true);
  return res.json({ success: true, groups });
});

app.post('/send', async (req, res) => {
  const { number, group_name, message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: 'O campo message é obrigatório' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ success: false, error: 'WhatsApp ainda não está conectado via QR Code' });
  }

  try {
    let targetJid = null;
    let destinationLabel = '';

    // Prioridade total para envio em grupo conforme solicitação do usuário
    const targetGroup = group_name || (!number ? appConfig.target_group : null);

    if (targetGroup) {
      const foundGroup = await findGroupByName(targetGroup);
      if (!foundGroup) {
        const available = await getParticipatingGroups(false);
        const groupNames = available.map(g => `"${g.name}"`).join(', ');
        return res.status(404).json({
          success: false,
          error: `Grupo "${targetGroup}" não foi encontrado no WhatsApp. Grupos disponíveis na sua conta: ${groupNames || 'nenhum grupo encontrado'}`
        });
      }
      targetJid = foundGroup.jid;
      destinationLabel = `Grupo "${foundGroup.name}" (${foundGroup.jid})`;
    } else {
      // Fallback legado para envio em número individual
      let cleanNumber = String(number).replace(/\D/g, '');
      if (cleanNumber.length === 10 || cleanNumber.length === 11) {
        cleanNumber = '55' + cleanNumber;
      }
      const candidates = [cleanNumber];
      if (cleanNumber.startsWith('55') && cleanNumber.length === 13) {
        const semNove = '55' + cleanNumber.substring(2, 4) + cleanNumber.substring(5);
        candidates.push(semNove);
      } else if (cleanNumber.startsWith('55') && cleanNumber.length === 12) {
        const comNove = '55' + cleanNumber.substring(2, 4) + '9' + cleanNumber.substring(4);
        candidates.push(comNove);
      }
      try {
        const waCheck = await sock.onWhatsApp(...candidates);
        const valid = waCheck?.find(c => c.exists);
        if (valid && valid.jid) {
          targetJid = valid.jid;
        }
      } catch (e) {
        console.warn('[Baileys] Erro ao consultar onWhatsApp:', e.message);
      }
      if (!targetJid) {
        targetJid = `${cleanNumber}@s.whatsapp.net`;
      }
      destinationLabel = `Contato ${targetJid}`;
    }

    const sent = await sock.sendMessage(targetJid, { text: message });
    if (sent?.key?.id && sent?.message) {
      sentMessagesStore.set(sent.key.id, sent.message);
      if (sentMessagesStore.size > 200) {
        const firstKey = sentMessagesStore.keys().next().value;
        sentMessagesStore.delete(firstKey);
      }
    }
    console.log(`[Baileys] 📨 Mensagem entregue com sucesso para ${destinationLabel}`);
    return res.json({ success: true, destination: targetJid, label: destinationLabel });
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
    groupsCache = null;
    setTimeout(startWhatsApp, 1500);
    return res.json({ success: true, message: 'Sessão desconectada com sucesso' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Baileys Server] Microserviço WhatsApp ativo na porta ${PORT}`);
  console.log(`[Baileys Server] Grupo alvo padrão: "${appConfig.target_group}"`);
  startWhatsApp();
});
