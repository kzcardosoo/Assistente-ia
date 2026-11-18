'use strict';
// Processo principal: janela transparente da personagem, bandeja, configurações,
// IA, ações no computador, passeio pela tela, comentários e módulo de voz.
const {
  app, BrowserWindow, ipcMain, screen, Menu, Tray, dialog, shell, protocol, net,
  session, desktopCapturer, powerMonitor, globalShortcut, nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const config = require('./src/config');
const ia = require('./src/ia');
const acoes = require('./src/acoes');
const frases = require('./src/frases');
const { Voz } = require('./src/voz');

const RAIZ = __dirname;
const RECURSOS = app.isPackaged ? process.resourcesPath : __dirname;
const ATALHO_OUVIR = 'CommandOrControl+Alt+A';
const LARGURA_BASE = 420;
const ALTURA_BASE = 640;

if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');

protocol.registerSchemesAsPrivileged([{
  scheme: 'aiko',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

let win = null;          // janela da personagem
let janelaConfig = null; // janela de configurações
let tray = null;
let voz = null;

const estado = {
  falando: false, ouvindo: false, pensando: false, dancando: false, dormindo: false,
  arrastando: false, modoTexto: false, mouseSobre: false, modeloPronto: false,
};

const log = (...a) => console.log('[aiko]', ...a);
const dirModelosUsuario = () => path.join(app.getPath('userData'), 'modelos');

// ------------------------------------------------------------------ utilidades
function enviar(canal, dados) {
  if (win && !win.isDestroyed()) win.webContents.send(canal, dados);
}

function ocupada() {
  return estado.falando || estado.ouvindo || estado.pensando || estado.dancando ||
    estado.dormindo || estado.arrastando || estado.modoTexto;
}

function tamanhoJanela(cfg) {
  const s = Math.min(2, Math.max(0.5, Number(cfg.tamanho) || 1));
  return { width: Math.round(LARGURA_BASE * s), height: Math.round(ALTURA_BASE * s) };
}

function areaDaJanela() {
  const b = win.getBounds();
  return screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
}

function chao() {
  const b = win.getBounds();
  const a = areaDaJanela();
  return a.y + a.height - b.height;
}

let tamanhoAtual = { width: LARGURA_BASE, height: ALTURA_BASE };
function mover(x, y) {
  if (!win || win.isDestroyed()) return;
  // setBounds com tamanho fixo evita a janela "crescer" em telas com escala (bug do Windows)
  win.setBounds({ x: Math.round(x), y: Math.round(y), ...tamanhoAtual });
}

// ------------------------------------------------------------------ protocolo aiko://
// Serve os arquivos do app (aiko://app/...), modelos e animações (aiko://app/__recursos/...)
// e o modelo escolhido pela pessoa (aiko://app/__usuario/...), tudo na mesma origem.
function registrarProtocolo() {
  protocol.handle('aiko', (req) => {
    const u = new URL(req.url);
    if (u.hostname !== 'app') return new Response('não encontrado', { status: 404 });
    let caminho = decodeURIComponent(u.pathname);
    let base = RAIZ;
    if (caminho.startsWith('/__recursos/')) { base = RECURSOS; caminho = caminho.slice('/__recursos'.length); }
    else if (caminho.startsWith('/__usuario/')) { base = dirModelosUsuario(); caminho = caminho.slice('/__usuario'.length); }
    const alvo = path.normalize(path.join(base, caminho));
    if (alvo !== base && !alvo.startsWith(path.normalize(base) + path.sep)) {
      return new Response('proibido', { status: 403 });
    }
    return net.fetch(pathToFileURL(alvo).toString()).catch(() => {
      log('arquivo não encontrado:', alvo);
      return new Response('não encontrado', { status: 404 });
    });
  });
}

function urlDoModelo(cfg) {
  if (cfg.modelo_vrm) {
    const p = path.join(dirModelosUsuario(), cfg.modelo_vrm);
    if (fs.existsSync(p)) return 'aiko://app/__usuario/' + encodeURIComponent(cfg.modelo_vrm);
  }
  const pasta = path.join(RECURSOS, 'modelos');
  try {
    const arquivos = fs.readdirSync(pasta).filter((n) => n.toLowerCase().endsWith('.vrm'));
    const escolhido = arquivos.find((n) => n.toLowerCase() === 'aiko.vrm') || arquivos[0];
    if (escolhido) return 'aiko://app/__recursos/modelos/' + encodeURIComponent(escolhido);
  } catch { /* sem pasta */ }
  return null;
}

function listarAnimacoes() {
  const pasta = path.join(RECURSOS, 'animacoes');
  try {
    return fs.readdirSync(pasta)
      .filter((n) => n.toLowerCase().endsWith('.vrma'))
      .map((n) => ({ nome: n, url: 'aiko://app/__recursos/animacoes/' + encodeURIComponent(n) }));
  } catch { return []; }
}

// Configuração enviada para a janela da personagem (sem a chave da API).
function configPublica(cfg = config.ler()) {
  const c = structuredClone(cfg);
  delete c.ia.chave;
  c.modeloUrl = urlDoModelo(cfg);
  c.animacoes = listarAnimacoes();
  c.plataforma = process.platform;
  c.vozDisponivel = !!(voz && voz.disponivel);
  return c;
}

// ------------------------------------------------------------------ janela da personagem
function criarPersonagem() {
  const cfg = config.ler();
  tamanhoAtual = tamanhoJanela(cfg);
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    ...tamanhoAtual,
    x: area.x + area.width - tamanhoAtual.width - 40,
    y: area.y + area.height - tamanhoAtual.height,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#00000000',
    show: false,
    title: cfg.nome,
    webPreferences: {
      preload: path.join(RAIZ, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadURL('aiko://app/renderer/index.html');
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => { win = null; });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') log('[tela]', e.message);
  });
}

// Cliques atravessam a janela, exceto quando o mouse está sobre a personagem.
function aplicarCliques() {
  if (!win || win.isDestroyed()) return;
  const capturar = estado.mouseSobre || estado.arrastando || estado.modoTexto;
  win.setIgnoreMouseEvents(!capturar, { forward: true });
}

// Posição do cursor (mesmo fora da janela): usada para o olhar e para saber se o mouse
// está em cima dela. Funciona igual no Windows, macOS e Linux.
let ultimoCursor = '';
function iniciarCursor() {
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const msg = { x: p.x - b.x, y: p.y - b.y };
    const chave = msg.x + ',' + msg.y;
    if (chave === ultimoCursor) return;
    ultimoCursor = chave;
    enviar('cursor', msg);
  }, 33);
}

// ------------------------------------------------------------------ arrastar, cair e andar
let arraste = null;
let movimento = null; // { tipo: 'andar', alvoX } | { tipo: 'cair', vy }

function iniciarArraste() {
  if (!win) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  pararAndar();
  movimento = null;
  arraste = { dx: p.x - b.x, dy: p.y - b.y, inicio: p, moveu: false, t0: Date.now() };
  estado.arrastando = true;
  aplicarCliques();
  arraste.timer = setInterval(() => {
    if (!arraste) return;
    const q = screen.getCursorScreenPoint();
    if (!arraste.moveu && Math.hypot(q.x - arraste.inicio.x, q.y - arraste.inicio.y) > 5) {
      arraste.moveu = true;
      enviar('arrastada', true);
    }
    if (arraste.moveu) mover(q.x - arraste.dx, q.y - arraste.dy);
    if (Date.now() - arraste.t0 > 60000) finalizarArraste();
  }, 16);
}

function finalizarArraste() {
  if (!arraste) return false;
  clearInterval(arraste.timer);
  const moveu = arraste.moveu;
  arraste = null;
  estado.arrastando = false;
  aplicarCliques();
  if (moveu) {
    enviar('arrastada', false);
    if (config.ler().vida.gravidade) cair();
  }
  return moveu;
}

function cair() {
  if (!win) return;
  pararAndar();
  if (win.getBounds().y < chao() - 2) {
    movimento = { tipo: 'cair', vy: 0 };
    enviar('cair', true);
  }
}

function pararAndar() {
  if (movimento && movimento.tipo === 'andar') {
    movimento = null;
    enviar('parar-andar');
  }
}

function passear(forcar = false) {
  if (!win || !win.isVisible() || movimento || arraste) return;
  const cfg = config.ler();
  if (!forcar && (!cfg.vida.andar || ocupada())) return;
  const b = win.getBounds();
  if (Math.abs(b.y - chao()) > 3) { if (forcar) cair(); return; } // só anda se estiver no "chão"
  const a = areaDaJanela();
  const min = a.x - b.width * 0.2;
  const max = a.x + a.width - b.width * 0.8;
  let alvoX = b.x;
  for (let i = 0; i < 10 && Math.abs(alvoX - b.x) < 150; i++) alvoX = min + Math.random() * (max - min);
  movimento = { tipo: 'andar', alvoX };
  enviar('andar', { direcao: Math.sign(alvoX - b.x) || 1 });
}

function iniciarMovimento() {
  setInterval(() => {
    if (!movimento || !win || win.isDestroyed() || estado.arrastando) return;
    const b = win.getBounds();
    const escala = tamanhoAtual.height / ALTURA_BASE;
    if (movimento.tipo === 'cair') {
      movimento.vy = Math.min(movimento.vy + 1.2 * escala, 38);
      let y = b.y + movimento.vy;
      const limite = chao();
      if (y >= limite) {
        y = limite;
        movimento = null;
        enviar('cair', false);
      }
      mover(b.x, y);
    } else if (movimento.tipo === 'andar') {
      const vel = 1.5 * escala;
      const dx = movimento.alvoX - b.x;
      if (Math.abs(dx) <= vel) {
        mover(movimento.alvoX, b.y);
        movimento = null;
        enviar('parar-andar');
      } else {
        mover(b.x + Math.sign(dx) * vel, b.y);
      }
    }
  }, 16);
}

let timerPasseio = null;
function agendarPasseio() {
  clearTimeout(timerPasseio);
  const cfg = config.ler();
  const base = Math.max(5, Number(cfg.vida.intervalo_andar_seg) || 25) * 1000;
  timerPasseio = setTimeout(() => { passear(); agendarPasseio(); }, base * (0.6 + Math.random() * 0.8));
}

// ------------------------------------------------------------------ conversa
let idConversa = 0;

function limparParaFala(texto) {
  return String(texto || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>~]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function falar(texto, cfg = config.ler()) {
  const limpo = limparParaFala(texto);
  if (!cfg.voz.ativa || !limpo) return;
  pararAndar();
  if (voz && voz.disponivel && voz.recursos?.tts?.[cfg.voz.motor] !== false) {
    voz.enviar({ tipo: 'falar', texto: limpo, id: ++idConversa });
  } else {
    enviar('falar-navegador', { texto: limpo, volume: cfg.voz.volume, velocidade: cfg.voz.velocidade, tom: cfg.voz.tom });
  }
}

async function responder(resp, cfg) {
  enviar('resposta', { fala: resp.fala, emocao: resp.emocao });
  falar(resp.fala, cfg);
  for (const acao of resp.acoes || []) {
    const r = await acoes.executar(acao, cfg);
    log('ação', acao.tipo, r.descricao || (r.ok ? 'ok' : 'não executada'));
    if (r.ok && r.renderer) enviar('acao', r.renderer);
  }
}

async function processar(texto) {
  texto = String(texto || '').trim();
  const cfg = config.ler();
  if (!texto) {
    enviar('resposta', { fala: frases.naoOuvi(), emocao: 'neutra', curto: true });
    return;
  }
  log('usuário:', texto);
  pararAndar();
  const meuId = ++idConversa;
  let resp;
  if (!ia.configurada(cfg)) {
    resp = acoes.comandoLocal(texto, cfg) || { fala: ia.mensagemDeErro({ tipo: 'sem_chave' }, cfg), emocao: 'triste', acoes: [] };
  } else {
    estado.pensando = true;
    enviar('pensando', true);
    try {
      resp = await ia.perguntar(texto, cfg);
    } catch (e) {
      log('erro da IA:', e.message, e.detalhe ? JSON.stringify(e.detalhe) : '');
      resp = acoes.comandoLocal(texto, cfg) || { fala: ia.mensagemDeErro(e, cfg), emocao: 'triste', acoes: [] };
    } finally {
      estado.pensando = false;
      enviar('pensando', false);
    }
  }
  if (meuId !== idConversa) return; // chegou outra pergunta no meio do caminho
  log(`${cfg.nome}:`, resp.fala, resp.acoes.length ? JSON.stringify(resp.acoes) : '');
  await responder(resp, cfg);
}

function iniciarEscuta() {
  const cfg = config.ler();
  if (!voz || !voz.disponivel || !voz.recursos?.microfone) {
    enviar('resposta', { fala: frases.semMicrofone(), emocao: 'triste', curto: true });
    abrirModoTexto();
    return;
  }
  if (estado.dormindo) { estado.dormindo = false; enviar('dormir', false); }
  if (estado.falando) enviar('interromper');
  pararAndar();
  voz.enviar({ tipo: 'ouvir' });
  if (!cfg.escuta.clique_para_ouvir) log('escuta iniciada pelo atalho/menu');
}

function abrirModoTexto() {
  if (!win) return;
  if (!win.isVisible()) win.showInactive();
  estado.modoTexto = true;
  aplicarCliques();
  win.focus();
  enviar('modo-texto', true);
}

// ------------------------------------------------------------------ módulo de voz (Python)
function iniciarVoz() {
  voz = new Voz({ raiz: RAIZ, recursos: RECURSOS, dadosUsuario: app.getPath('userData') });
  voz.on('log', (l) => console.log(l.startsWith('[voz]') ? l : '[voz] ' + l));
  voz.on('pronto', (r) => { log('módulo de voz pronto:', JSON.stringify(r)); enviar('config', configPublica()); });
  voz.on('recursos', (r) => log('recursos de voz:', JSON.stringify(r)));
  voz.on('indisponivel', (erro) => { log(erro); enviar('config', configPublica()); });
  voz.on('estado', (m) => {
    estado.ouvindo = m.valor === 'ouvindo' || m.valor === 'transcrevendo';
    enviar('estado-escuta', m.valor);
  });
  voz.on('ativacao', () => {
    if (estado.dormindo) { estado.dormindo = false; enviar('dormir', false); }
    if (estado.falando) enviar('interromper');
  });
  voz.on('texto', (m) => { estado.ouvindo = false; processar(m.texto); });
  voz.on('erro', (m) => {
    log('erro de voz:', m.origem, m.mensagem);
    if (m.origem === 'microfone') {
      enviar('resposta', { fala: frases.semMicrofone(), emocao: 'triste', curto: true });
      abrirModoTexto();
    }
  });
  voz.on('audio', (m) => {
    fs.readFile(m.caminho, (err, dados) => {
      if (err) return log('áudio não encontrado:', m.caminho);
      const mime = m.caminho.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
      enviar('tocar-audio', { dados, mime, volume: config.ler().voz.volume });
      fs.unlink(m.caminho, () => {});
    });
  });
  voz.on('erro_tts', (m) => {
    log('voz falhou, usando a voz do sistema:', m.mensagem);
    const cfg = config.ler();
    enviar('falar-navegador', { texto: m.texto, volume: cfg.voz.volume, velocidade: cfg.voz.velocidade, tom: cfg.voz.tom });
  });
  voz.iniciar(config.ler());
}

// ------------------------------------------------------------------ comentários e sono
let timerComentario = null;
function agendarComentario() {
  clearTimeout(timerComentario);
  const cfg = config.ler();
  if (!cfg.comentarios.ativo) return;
  const base = Math.max(1, Number(cfg.comentarios.intervalo_min) || 15) * 60000;
  timerComentario = setTimeout(async () => {
    await comentar();
    agendarComentario();
  }, base * (0.8 + Math.random() * 0.4));
}

async function comentar(forcar = false) {
  const cfg = config.ler();
  if (!forcar && (cfg.nao_perturbe || ocupada() || powerMonitor.getSystemIdleTime() > 300)) return;
  if (!ia.configurada(cfg)) return;
  const contexto = estado.dancando ? 'Está tocando música no computador agora e você está dançando.' : '';
  try {
    const resp = await ia.comentar(cfg, contexto);
    if (!forcar && ocupada()) return;
    log('comentário:', resp.fala);
    await responder(resp, cfg);
  } catch (e) {
    log('comentário falhou:', e.message);
  }
}

function iniciarSono() {
  setInterval(() => {
    if (!win || !estado.modeloPronto) return;
    const cfg = config.ler();
    const ocioso = powerMonitor.getSystemIdleTime();
    const limite = Number(cfg.vida.dormir_ocioso_min) * 60;
    if (!estado.dormindo && limite > 0 && ocioso >= limite && !estado.falando && !estado.ouvindo && !estado.dancando) {
      estado.dormindo = true;
      pararAndar();
      enviar('dormir', true);
    } else if (estado.dormindo && ocioso < 3) {
      estado.dormindo = false;
      enviar('dormir', false);
      if (cfg.vida.saudacao && !cfg.nao_perturbe) {
        const f = frases.voltou(cfg);
        enviar('resposta', { fala: f, emocao: 'feliz' });
        enviar('acao', 'acenar');
        falar(f, cfg);
      }
    }
  }, 3000);
}

// ------------------------------------------------------------------ menu e bandeja
function montarMenu() {
  const cfg = config.ler();
  const visivel = win && win.isVisible();
  return Menu.buildFromTemplate([
    { label: 'Ouvir agora', accelerator: ATALHO_OUVIR, click: iniciarEscuta },
    { label: 'Escrever mensagem', click: abrirModoTexto },
    { label: 'Comentar algo', click: () => comentar(true) },
    { type: 'separator' },
    { label: 'Dançar', click: () => enviar('acao', 'dancar') },
    { label: 'Acenar', click: () => enviar('acao', 'acenar') },
    { label: 'Passear', click: () => passear(true) },
    { type: 'separator' },
    {
      label: 'Não perturbe', type: 'checkbox', checked: !!cfg.nao_perturbe,
      click: (item) => config.atualizar((c) => { c.nao_perturbe = item.checked; }),
    },
    { label: visivel ? 'Esconder' : 'Mostrar', click: alternarVisibilidade },
    { label: 'Configurações...', click: abrirConfiguracoes },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
}

function alternarVisibilidade() {
  if (!win) return;
  if (win.isVisible()) win.hide(); else win.showInactive();
  atualizarBandeja();
}

function iconeApp() {
  return nativeImage.createFromPath(path.join(RAIZ, 'assets', 'icone.png'));
}

function criarBandeja() {
  const icone = iconeApp();
  tray = new Tray(icone.isEmpty() ? icone : icone.resize({ width: 16, height: 16 }));
  tray.setToolTip(config.ler().nome);
  tray.on('click', alternarVisibilidade);
  atualizarBandeja();
}

function atualizarBandeja() {
  if (tray) tray.setContextMenu(montarMenu());
}

// ------------------------------------------------------------------ configurações
function abrirConfiguracoes(aba) {
  if (janelaConfig && !janelaConfig.isDestroyed()) {
    janelaConfig.show();
    janelaConfig.focus();
    return;
  }
  janelaConfig = new BrowserWindow({
    width: 820, height: 760, minWidth: 640, minHeight: 520,
    title: 'Configurações', icon: iconeApp(), autoHideMenuBar: true, show: false,
    backgroundColor: '#1e1b2e',
    webPreferences: { preload: path.join(RAIZ, 'preload-config.js'), contextIsolation: true, sandbox: true },
  });
  janelaConfig.loadURL('aiko://app/renderer/configuracoes.html' + (typeof aba === 'string' ? '#' + aba : ''));
  janelaConfig.once('ready-to-show', () => janelaConfig.show());
  janelaConfig.on('closed', () => { janelaConfig = null; });
}

function aplicarConfig(cfg) {
  if (win && !win.isDestroyed()) {
    const novo = tamanhoJanela(cfg);
    if (novo.width !== tamanhoAtual.width || novo.height !== tamanhoAtual.height) {
      const b = win.getBounds();
      const x = b.x + (b.width - novo.width) / 2;
      const y = b.y + b.height - novo.height;
      tamanhoAtual = novo;
      mover(x, y);
    }
  }
  enviar('config', configPublica(cfg));
  if (voz) voz.configurar(cfg);
  agendarComentario();
  agendarPasseio();
  try { app.setLoginItemSettings({ openAtLogin: !!cfg.iniciar_com_sistema }); } catch { /* não suportado */ }
  if (tray) tray.setToolTip(cfg.nome);
  atualizarBandeja();
}

// ------------------------------------------------------------------ IPC: personagem
function registrarIPC() {
  ipcMain.handle('renderer-pronto', () => configPublica());
  ipcMain.on('modelo-carregado', (_e, ok) => {
    estado.modeloPronto = true;
    const cfg = config.ler();
    if (cfg.primeira_execucao) {
      config.atualizar((c) => { c.primeira_execucao = false; });
      enviar('resposta', { fala: frases.primeiraVez(cfg), emocao: 'feliz', ms: 12000 });
      enviar('acao', 'acenar');
      if (!ia.configurada(cfg)) setTimeout(() => abrirConfiguracoes('ia'), 2500);
    } else if (ok && cfg.vida.saudacao && !cfg.nao_perturbe) {
      const f = frases.saudacao(cfg);
      setTimeout(() => {
        enviar('resposta', { fala: f, emocao: 'feliz' });
        enviar('acao', 'acenar');
        falar(f, cfg);
      }, 800);
    }
  });
  ipcMain.on('mouse-sobre', (_e, sobre) => { estado.mouseSobre = !!sobre; aplicarCliques(); });
  ipcMain.on('arrastar-inicio', iniciarArraste);
  ipcMain.handle('arrastar-fim', () => finalizarArraste());
  ipcMain.on('clique', () => {
    const cfg = config.ler();
    if (cfg.escuta.clique_para_ouvir) iniciarEscuta();
    else enviar('acao', 'reagir');
  });
  ipcMain.on('menu', () => { if (win) montarMenu().popup({ window: win }); });
  ipcMain.on('mensagem-texto', (_e, texto) => processar(texto));
  ipcMain.on('fechar-texto', () => { estado.modoTexto = false; aplicarCliques(); });
  ipcMain.on('fala-inicio', () => {
    estado.falando = true;
    pararAndar();
    if (voz) voz.enviar({ tipo: 'fala_inicio' });
  });
  ipcMain.on('fala-fim', () => {
    estado.falando = false;
    if (voz) voz.enviar({ tipo: 'fim_fala' });
  });
  ipcMain.on('dancando', (_e, v) => {
    estado.dancando = !!v;
    if (v) pararAndar();
  });
  ipcMain.on('log', (_e, msg) => log('[tela]', msg));
}

// ------------------------------------------------------------------ IPC: configurações
function registrarIPCConfig() {
  ipcMain.handle('cfg-ler', () => ({
    cfg: config.ler(),
    provedores: ia.PROVEDORES,
    voz: voz ? { disponivel: voz.disponivel, recursos: voz.recursos, erro: voz.erro } : { disponivel: false },
    modeloAtual: urlDoModelo(config.ler()) ? decodeURIComponent(urlDoModelo(config.ler()).split('/').pop()) : '',
    plataforma: process.platform,
    pastaDados: app.getPath('userData'),
  }));
  ipcMain.handle('cfg-salvar', (_e, novo) => {
    const cfg = config.salvar(novo);
    ia.limparHistorico();
    return { ok: true, cfg };
  });
  ipcMain.handle('cfg-testar-ia', (_e, cfgTemp) => ia.testar(cfgTemp));
  ipcMain.handle('cfg-listar-modelos', (_e, cfgTemp) => ia.listarModelos(cfgTemp));
  ipcMain.handle('cfg-listar-microfones', () => (voz ? voz.listarMicrofones() : []));
  ipcMain.handle('cfg-testar-voz', (_e, vozTemp) => {
    const cfg = config.ler();
    cfg.voz = { ...cfg.voz, ...vozTemp, ativa: true };
    if (voz) voz.configurar(cfg);
    const frase = `Oi! Eu sou a ${cfg.nome}. Essa é a minha voz!`;
    enviar('resposta', { fala: frase, emocao: 'feliz' });
    falar(frase, cfg);
    return true;
  });
  ipcMain.handle('cfg-escolher-vrm', async () => {
    const r = await dialog.showOpenDialog(janelaConfig, {
      title: 'Escolha o modelo da personagem', filters: [{ name: 'Modelo VRM', extensions: ['vrm'] }], properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    fs.mkdirSync(dirModelosUsuario(), { recursive: true });
    const nome = path.basename(r.filePaths[0]);
    fs.copyFileSync(r.filePaths[0], path.join(dirModelosUsuario(), nome));
    return nome;
  });
  ipcMain.handle('cfg-escolher-programa', async () => {
    const filtros = process.platform === 'win32'
      ? [{ name: 'Programas e atalhos', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url'] }, { name: 'Todos', extensions: ['*'] }]
      : [{ name: 'Todos', extensions: ['*'] }];
    const r = await dialog.showOpenDialog(janelaConfig, {
      title: 'Escolha o programa', filters: filtros,
      properties: process.platform === 'darwin' ? ['openFile', 'treatPackageAsDirectory'] : ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { caminho: r.filePaths[0], nome: path.parse(r.filePaths[0]).name };
  });
  ipcMain.handle('cfg-abrir-link', (_e, url) => acoes.abrirUrl(url));
  ipcMain.handle('cfg-abrir-pasta', (_e, qual) => {
    const pastas = { modelos: path.join(RECURSOS, 'modelos'), animacoes: path.join(RECURSOS, 'animacoes'), dados: app.getPath('userData') };
    if (pastas[qual]) return shell.openPath(pastas[qual]);
    return false;
  });
}

// ------------------------------------------------------------------ inicialização
function capturaDeAudio() {
  // Permite capturar o áudio do sistema (loopback) para saber se há música tocando.
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((fontes) => {
      if (!fontes.length || process.platform !== 'win32') return callback({});
      callback({ video: fontes[0], audio: 'loopback' });
    }).catch(() => callback({}));
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) win.showInactive();
    abrirConfiguracoes();
  });

  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    registrarProtocolo();
    capturaDeAudio();
    registrarIPC();
    registrarIPCConfig();
    criarPersonagem();
    criarBandeja();
    iniciarCursor();
    iniciarMovimento();
    iniciarSono();
    iniciarVoz();
    agendarComentario();
    agendarPasseio();
    config.eventos.on('mudou', aplicarConfig);
    try { globalShortcut.register(ATALHO_OUVIR, iniciarEscuta); } catch { /* atalho em uso */ }
    screen.on('display-removed', () => {
      if (!win) return;
      const a = screen.getPrimaryDisplay().workArea;
      mover(a.x + a.width - tamanhoAtual.width - 40, a.y + a.height - tamanhoAtual.height);
    });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (voz) voz.parar();
  });
}

// Ganchos para testes automatizados (só existem com AIKO_TESTE=1).
if (process.env.AIKO_TESTE === '1') {
  global.__aiko = { processar, estado, passear, comentar, abrirConfiguracoes, abrirModoTexto, enviar, iniciarEscuta, cair, mover };
}
