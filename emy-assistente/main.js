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
const { OllamaEmbutido } = require('./src/ollama');
const intencoes = require('./src/intencoes');
const { Modelos } = require('./src/modelos');

const RAIZ = __dirname;
const RECURSOS = app.isPackaged ? process.resourcesPath : __dirname;
const ATALHO_OUVIR = 'CommandOrControl+Alt+A';
const LARGURA_BASE = 420;
const ALTURA_BASE = 640;

if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');

protocol.registerSchemesAsPrivileged([{
  scheme: 'emy',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

let win = null;          // janela da personagem
let janelaConfig = null; // janela de configurações
let tray = null;
let voz = null;
let ollama = null;      // IA local que vem junto com o app

const estado = {
  falando: false, ouvindo: false, pensando: false, dancando: false, dormindo: false,
  arrastando: false, modoTexto: false, mouseSobre: false, modeloPronto: false,
};

// Registro (log): aparece no terminal e fica salvo em emy.log na pasta de dados do app,
// para dar para entender problemas que só acontecem no computador de quem usa.
let arquivoLog = null;
function registrar(linha) {
  const texto = `${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${linha}`;
  console.log(texto);
  try {
    if (!arquivoLog) {
      arquivoLog = path.join(app.getPath('userData'), 'emy.log');
      fs.mkdirSync(path.dirname(arquivoLog), { recursive: true });
      if (fs.existsSync(arquivoLog) && fs.statSync(arquivoLog).size > 2 * 1024 * 1024) fs.renameSync(arquivoLog, arquivoLog + '.1');
    }
    fs.appendFileSync(arquivoLog, texto + '\n');
  } catch { /* sem disco: só no terminal */ }
}
const log = (...a) => registrar('[emy] ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const dirModelosUsuario = () => path.join(app.getPath('userData'), 'modelos');
let bibliotecaModelos = null;
const modelos = () => (bibliotecaModelos ||= new Modelos({ pastaApp: path.join(RECURSOS, 'modelos'), pastaUsuario: dirModelosUsuario() }));

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

// ------------------------------------------------------------------ protocolo emy://
// Serve os arquivos do app (emy://app/...), modelos e animações (emy://app/__recursos/...)
// e o modelo escolhido pela pessoa (emy://app/__usuario/...), tudo na mesma origem.
function registrarProtocolo() {
  protocol.handle('emy', (req) => {
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

// ------------------------------------------------------------------ modelos (troca de personagem)
function usarModelo(id) {
  if (!modelos().caminho(id)) return false;
  config.atualizar((c) => { c.modelo_vrm = id; });
  return true;
}

function adicionarModelos(caminhos, { usarPrimeiro = false } = {}) {
  const r = modelos().adicionar(caminhos);
  if (r.erros.length) log('modelos recusados:', r.erros.join(' | '));
  if (usarPrimeiro && r.adicionados[0]) usarModelo(r.adicionados[0]);
  else atualizarBandeja();
  return r;
}

async function escolherEAdicionarModelos(janela, usarPrimeiro) {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Adicionar modelos da personagem',
    filters: [{ name: 'Modelo VRM', extensions: ['vrm'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (r.canceled || !r.filePaths.length) return { adicionados: [], erros: [] };
  return adicionarModelos(r.filePaths, { usarPrimeiro });
}

function ajusteDoModelo(cfg, id) {
  return { bracos: 0, ...(cfg.ajustes_modelos?.[id] || {}) };
}

function listarAnimacoes() {
  const pasta = path.join(RECURSOS, 'animacoes');
  try {
    return fs.readdirSync(pasta)
      .filter((n) => n.toLowerCase().endsWith('.vrma'))
      .map((n) => ({ nome: n, url: 'emy://app/__recursos/animacoes/' + encodeURIComponent(n) }));
  } catch { return []; }
}

// Configuração enviada para a janela da personagem (sem a chave da API).
function configPublica(cfg = config.ler()) {
  const c = structuredClone(cfg);
  delete c.ia.chave;
  c.modeloId = modelos().ativo(cfg);
  c.modeloUrl = c.modeloId ? modelos().url(c.modeloId) : null;
  c.ajusteModelo = ajusteDoModelo(cfg, c.modeloId);
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
  win.loadURL('emy://app/renderer/index.html');
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
  // às vezes vai saltitando (mais rápido); primeiro vira para o lado, depois acelera
  const saltitar = Math.random() < 0.25;
  movimento = { tipo: 'andar', alvoX, x: b.x, vel: 0, max: saltitar ? 2.4 : 1.5, espera: 18 };
  enviar('andar', { direcao: Math.sign(alvoX - b.x) || 1, saltitar });
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
      const m = movimento;
      if (m.espera > 0) { m.espera -= 1; return; } // tempo de virar o corpo
      const max = m.max * escala;
      const dx = m.alvoX - m.x;
      const distanciaFreio = (m.vel * m.vel) / (2 * 0.05 * escala) + 2;
      // acelera no começo e freia perto do destino
      m.vel = Math.abs(dx) <= distanciaFreio ? Math.max(0.3 * escala, m.vel - 0.05 * escala) : Math.min(max, m.vel + 0.05 * escala);
      if (Math.abs(dx) <= m.vel) {
        mover(m.alvoX, b.y);
        movimento = null;
        enviar('parar-andar');
      } else {
        m.x += Math.sign(dx) * m.vel;
        mover(m.x, b.y);
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
let falaAtual = 0; // só toca o áudio da conversa mais recente

function limparParaFala(texto) {
  return String(texto || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>~]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fala um trecho. Vários trechos da mesma conversa entram na fila e tocam em sequência.
function falar(texto, cfg = config.ler(), id = ++idConversa) {
  const limpo = limparParaFala(texto);
  if (!cfg.voz.ativa || !limpo) return;
  pararAndar();
  falaAtual = id;
  if (voz && voz.disponivel && voz.recursos?.tts?.[cfg.voz.motor] !== false) {
    voz.enviar({ tipo: 'falar', texto: limpo, id });
  } else {
    enviar('falar-navegador', { texto: limpo, id, volume: cfg.voz.volume, velocidade: cfg.voz.velocidade, tom: cfg.voz.tom });
  }
}

// Cala o que ela estava falando (nova pergunta chegou)
function calar(id) {
  falaAtual = id;
  enviar('interromper');
  if (voz) voz.enviar({ tipo: 'cancelar_fala' });
}

async function executarAcoes(lista, cfg) {
  for (const acao of lista || []) {
    if (acao.tipo === 'nao_perturbe') { config.atualizar((c) => { c.nao_perturbe = !!acao.valor; }); continue; }
    if (acao.tipo === 'parar_danca') { enviar('acao', 'parar_danca'); continue; }
    const r = await acoes.executar(acao, cfg);
    log('ação', acao.tipo, r.descricao || (r.ok ? 'ok' : 'não executada'));
    if (r.ok && r.renderer) enviar('acao', r.renderer);
  }
}

async function responder(resp, cfg, id = ++idConversa) {
  enviar('resposta', { fala: resp.fala, emocao: resp.emocao });
  falar(resp.fala, cfg, id);
  await executarAcoes(resp.acoes, cfg);
}

function estadoIALocal(cfg) {
  if (!ia.PROVEDORES[cfg.ia.provedor]?.embutido) return null;
  if (!ollama || !ollama.existe) return { fala: 'A IA local não veio nesta versão do app. Escolha outra IA nas Configurações.', emocao: 'triste' };
  if (ollama.estado === 'baixando') return { fala: `Ainda estou baixando minha inteligência (${ollama.progresso}%). Já já eu converso com você!`, emocao: 'relaxada' };
  if (ollama.estado === 'erro') {
    iniciarIALocal(cfg);
    return { fala: 'Minha IA local teve um probleminha e estou reiniciando ela. Tenta de novo em alguns segundos.', emocao: 'triste' };
  }
  return null;
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
  calar(meuId);

  // 1) Comandos diretos (abrir, pesquisar, tocar, horas...): resposta na hora, sem IA
  const local = intencoes.interpretar(texto, cfg);
  if (local) {
    log(`${cfg.nome} (comando):`, local.fala, JSON.stringify(local.acoes));
    await responder(local, cfg, meuId);
    return;
  }

  // 2) Conversa com a IA
  let resp;
  let falouDuranteFluxo = false;
  const aviso = estadoIALocal(cfg);
  if (!ia.configurada(cfg)) {
    resp = { fala: ia.mensagemDeErro({ tipo: 'sem_chave' }, cfg), emocao: 'triste', acoes: [] };
  } else if (aviso) {
    resp = { ...aviso, acoes: [] };
  } else {
    estado.pensando = true;
    enviar('pensando', true);
    const inicio = Date.now();
    let parcial = '';
    try {
      resp = await ia.perguntar(texto, cfg, {
        aoFrase: (frase) => {
          if (meuId !== idConversa) return;
          if (!falouDuranteFluxo) {
            log(`primeira frase em ${Date.now() - inicio} ms`);
            estado.pensando = false;
            enviar('pensando', false);
          }
          falouDuranteFluxo = true;
          parcial = (parcial + ' ' + frase).trim();
          enviar('resposta-parcial', { texto: parcial });
          falar(frase, cfg, meuId);
        },
      });
      log(`resposta completa em ${Date.now() - inicio} ms`);
    } catch (e) {
      log('erro da IA:', e.message, e.detalhe ? JSON.stringify(e.detalhe) : '');
      resp = { fala: ia.mensagemDeErro(e, cfg), emocao: 'triste', acoes: [] };
      falouDuranteFluxo = false;
    } finally {
      estado.pensando = false;
      enviar('pensando', false);
    }
  }
  if (meuId !== idConversa) return; // chegou outra pergunta no meio do caminho
  log(`${cfg.nome}:`, resp.fala, resp.acoes?.length ? JSON.stringify(resp.acoes) : '');
  enviar('resposta', { fala: resp.fala, emocao: resp.emocao });
  if (!falouDuranteFluxo) falar(resp.fala, cfg, meuId);
  await executarAcoes(resp.acoes, cfg);
}

// ------------------------------------------------------------------ IA local (Ollama embutido)
function iniciarIALocal(cfg = config.ler()) {
  if (!ollama || !ollama.existe || !ia.PROVEDORES[cfg.ia.provedor]?.embutido) return;
  const modelo = cfg.ia.modelo || ia.PROVEDORES.emy.modelo;
  if (ollama.estado === 'pronto' && ollama.modeloPronto === modelo) return;
  log('preparando IA local:', modelo);
  ollama.preparar(modelo, { usarPlacaDeVideo: cfg.ia.placa_de_video !== false }).then(() => log('IA local pronta')).catch(() => {});
}

function criarIALocal() {
  ollama = new OllamaEmbutido({
    raiz: RAIZ, recursos: RECURSOS, dadosUsuario: app.getPath('userData'), porta: ia.PORTA_EMBUTIDA,
    log: (...a) => registrar(a.join(' ')),
  });
  let baixou = false;
  ollama.on('estado', (r) => {
    if (r.estado === 'baixando') baixou = true;
    enviar('ia-local', { ...r, baixou });
    if (janelaConfig && !janelaConfig.isDestroyed()) janelaConfig.webContents.send('ia-local', r);
    if (r.estado === 'pronto' && baixou) {
      baixou = false;
      const cfg = config.ler();
      responder({ fala: 'Pronto! Minha inteligência está instalada. Agora é só falar comigo!', emocao: 'feliz', acoes: [{ tipo: 'acenar' }] }, cfg);
    }
  });
  // Quem estava sem nenhuma IA configurada (ou vindo da versão antiga) passa a usar a IA local
  const cfg = config.ler();
  if (ollama.existe && ((cfg.versao_config || 0) < 3 || !ia.configurada(cfg))) {
    config.atualizar((c) => {
      if (!ia.configurada(c) || (c.versao_config || 0) < 3) { c.ia.provedor = 'emy'; c.ia.modelo = ia.PROVEDORES.emy.modelo; }
      c.versao_config = 3;
    });
  }
  iniciarIALocal();
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
  voz.on('log', (l) => registrar(l.startsWith('[voz]') ? l : '[voz] ' + l));
  voz.on('pronto', (r) => { log('módulo de voz pronto:', JSON.stringify(r)); enviar('config', configPublica()); });
  voz.on('recursos', (r) => log('recursos de voz:', JSON.stringify(r)));
  voz.on('indisponivel', (erro) => { log(erro); enviar('config', configPublica()); });
  let chamadoAgora = false;
  voz.on('chamado', () => { chamadoAgora = true; }); // chamou só pelo nome: ela responde "Sim?" e ouve
  voz.on('estado', (m) => {
    estado.ouvindo = m.valor === 'ouvindo' || m.valor === 'transcrevendo';
    enviar('estado-escuta', m.valor === 'ouvindo' && chamadoAgora ? 'chamado' : m.valor);
    if (m.valor === 'ouvindo') chamadoAgora = false;
  });
  voz.on('ativacao', () => {
    if (estado.dormindo) { estado.dormindo = false; enviar('dormir', false); }
    if (estado.falando) enviar('interromper');
  });
  voz.on('texto', (m) => { estado.ouvindo = false; processar(m.texto); });
  voz.on('nivel', (m) => { if (janelaConfig && !janelaConfig.isDestroyed()) janelaConfig.webContents.send('nivel-mic', m); });
  voz.on('erro', (m) => {
    log('erro de voz:', m.origem, m.mensagem);
    if (m.origem === 'microfone') {
      enviar('resposta', { fala: frases.semMicrofone(), emocao: 'triste', curto: true });
      abrirModoTexto();
    } else if (m.origem === 'microfone_mudo') {
      enviar('resposta', { fala: m.mensagem, emocao: 'triste', ms: 15000 });
    }
  });
  voz.on('audio', (m) => {
    if (m.id != null && m.id !== falaAtual) { fs.unlink(m.caminho, () => {}); return; } // fala antiga: descarta
    fs.readFile(m.caminho, (err, dados) => {
      if (err) return log('áudio não encontrado:', m.caminho);
      const mime = m.caminho.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
      enviar('tocar-audio', { dados, mime, id: m.id, volume: config.ler().voz.volume });
      fs.unlink(m.caminho, () => {});
    });
  });
  voz.on('erro_tts', (m) => {
    log('voz falhou, usando a voz do sistema:', m.mensagem);
    if (m.id != null && m.id !== falaAtual) return;
    const cfg = config.ler();
    enviar('falar-navegador', { texto: m.texto, id: m.id, volume: cfg.voz.volume, velocidade: cfg.voz.velocidade, tom: cfg.voz.tom });
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
  const ativo = modelos().ativo(cfg);
  const lista = modelos().listar().filter((m) => !m.erro);
  const submenuModelos = [
    ...lista.map((m) => ({ label: m.titulo, type: 'radio', checked: m.id === ativo, click: () => usarModelo(m.id) })),
    ...(lista.length ? [{ type: 'separator' }] : []),
    { label: 'Adicionar modelos...', click: () => escolherEAdicionarModelos(null, true) },
    { label: 'Gerenciar modelos...', click: () => abrirConfiguracoes('personagem') },
  ];
  return Menu.buildFromTemplate([
    { label: 'Ouvir agora', accelerator: ATALHO_OUVIR, click: iniciarEscuta },
    { label: 'Escrever mensagem', click: abrirModoTexto },
    { label: 'Comentar algo', click: () => comentar(true) },
    { type: 'separator' },
    { label: 'Dançar', click: () => enviar('acao', 'dancar') },
    { label: 'Acenar', click: () => enviar('acao', 'acenar') },
    { label: 'Passear', click: () => passear(true) },
    { type: 'separator' },
    { label: 'Trocar personagem', submenu: submenuModelos },
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
  janelaConfig.loadURL('emy://app/renderer/configuracoes.html' + (typeof aba === 'string' ? '#' + aba : ''));
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
  if (ollama && ia.PROVEDORES[cfg.ia.provedor]?.embutido) {
    const gpu = cfg.ia.placa_de_video !== false;
    if (ollama.gpu !== undefined && ollama.gpu !== gpu && ollama.estado === 'pronto') {
      ollama.gpu = gpu;
      ollama.estado = 'parado';
      ollama.reiniciar({ usarPlacaDeVideo: gpu }).then(() => iniciarIALocal(cfg)).catch(() => {});
    } else {
      ollama.gpu = gpu;
      iniciarIALocal(cfg);
    }
  }
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
  ipcMain.on('soltar-modelos', (_e, caminhos) => {
    const r = adicionarModelos(caminhos, { usarPrimeiro: true });
    if (r.erros.length && !r.adicionados.length) {
      enviar('resposta', { fala: 'Esse arquivo não é um modelo VRM que eu consiga usar.', emocao: 'triste', curto: true });
    }
  });
}

// ------------------------------------------------------------------ IPC: configurações
function registrarIPCConfig() {
  ipcMain.handle('cfg-ler', () => ({
    cfg: config.ler(),
    provedores: ia.PROVEDORES,
    voz: voz ? { disponivel: voz.disponivel, recursos: voz.recursos, erro: voz.erro } : { disponivel: false },
    plataforma: process.platform,
    pastaDados: app.getPath('userData'),
  }));
  ipcMain.handle('cfg-salvar', (_e, novo) => {
    const cfg = config.salvar(novo);
    ia.limparHistorico();
    return { ok: true, cfg };
  });
  ipcMain.handle('cfg-testar-ia', async (_e, cfgTemp) => {
    if (ia.PROVEDORES[cfgTemp.ia.provedor]?.embutido) {
      const aviso = estadoIALocal(cfgTemp);
      if (aviso) return { ok: false, mensagem: aviso.fala };
      if (ollama.estado !== 'pronto') return { ok: false, mensagem: 'A IA local ainda está iniciando. Espere alguns segundos.' };
    }
    return ia.testar(cfgTemp);
  });
  ipcMain.handle('cfg-ia-local', () => (ollama ? ollama.resumo() : { estado: 'ausente', existe: false }));
  ipcMain.handle('cfg-ia-local-preparar', (_e, modelo) => {
    const cfg = config.ler();
    if (modelo) cfg.ia.modelo = modelo;
    cfg.ia.provedor = 'emy';
    iniciarIALocal(cfg);
    return ollama ? ollama.resumo() : null;
  });
  ipcMain.handle('cfg-testar-microfone', () => (voz ? voz.testarMicrofone() : { ok: false, erro: 'Módulo de voz desligado' }));
  ipcMain.handle('cfg-abrir-log', () => (arquivoLog ? shell.openPath(arquivoLog) : false));
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
  const estadoModelos = (extra = {}) => {
    const cfg = config.ler();
    const ativo = modelos().ativo(cfg);
    return { lista: modelos().listar(), ativo, ajustes: cfg.ajustes_modelos || {}, ...extra };
  };
  ipcMain.handle('cfg-modelos-listar', () => estadoModelos());
  ipcMain.handle('cfg-modelos-adicionar', async (_e, caminhos) => {
    const r = Array.isArray(caminhos) && caminhos.length
      ? adicionarModelos(caminhos)
      : await escolherEAdicionarModelos(janelaConfig, false);
    return estadoModelos(r);
  });
  ipcMain.handle('cfg-modelos-usar', (_e, id) => estadoModelos({ ok: usarModelo(id) }));
  ipcMain.handle('cfg-modelos-remover', async (_e, id) => {
    const m = modelos().listar().find((x) => x.id === id);
    if (!m || !m.removivel) return estadoModelos({ ok: false });
    const r = await dialog.showMessageBox(janelaConfig, {
      type: 'question', buttons: ['Remover', 'Cancelar'], defaultId: 1, cancelId: 1,
      message: `Remover o modelo "${m.titulo}"?`, detail: 'O arquivo copiado para o app será apagado. O original não é afetado.',
    });
    if (r.response !== 0) return estadoModelos({ ok: false });
    const eraAtivo = modelos().ativo(config.ler()) === id;
    modelos().remover(id);
    config.atualizar((c) => {
      if (c.ajustes_modelos) delete c.ajustes_modelos[id];
      if (eraAtivo) c.modelo_vrm = '';
    });
    return estadoModelos({ ok: true });
  });
  ipcMain.handle('cfg-modelos-ajustar', (_e, id, ajuste) => {
    config.atualizar((c) => {
      c.ajustes_modelos = c.ajustes_modelos || {};
      c.ajustes_modelos[id] = { ...(c.ajustes_modelos[id] || {}), ...ajuste };
    });
    return true;
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
    log(`iniciando ${app.getName()} ${app.getVersion()} (${process.platform}, empacotado: ${app.isPackaged})`);
    iniciarVoz();
    criarIALocal();
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
    if (ollama) ollama.parar();
  });
}

// Ganchos para testes automatizados (só existem com EMY_TESTE=1).
if (process.env.EMY_TESTE === '1') {
  global.__emy = {
    processar, estado, passear, comentar, abrirConfiguracoes, abrirModoTexto, enviar, iniciarEscuta, cair, mover,
    adicionarModelos, usarModelo, montarMenu, modelos,
  };
}
