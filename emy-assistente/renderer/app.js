// Liga tudo na janela da personagem: corpo 3D, voz, balão de fala, música,
// cliques/arrastar e os eventos que chegam do processo principal.
import { Personagem } from './personagem.js';
import { Fala } from './fala.js';
import { DetectorMusica } from './musica.js';

const api = window.emy;
const $ = (s) => document.querySelector(s);
const canvas = $('#tela');
const balao = $('#balao');
const balaoTexto = $('#balao-texto');
const aviso = $('#aviso');
const caixaTexto = $('#caixa-texto');
const entrada = $('#entrada');

const personagem = new Personagem(canvas);
let cfg = null;
let modeloUrl = null;

// ------------------------------------------------------------------ estado
const flags = {
  arrastada: false, caindo: false, dormindo: false, andando: 0, saltitar: false,
  musica: false, dancaAte: 0, pensando: false, ouvindo: false, semDancar: false,
};
let dancandoInformado = false;

function atualizarEstado() {
  const dancando = cfg?.vida?.dancar !== false && ((flags.musica && !flags.semDancar) || performance.now() < flags.dancaAte);
  if (dancando !== dancandoInformado) {
    dancandoInformado = dancando;
    api.dancando(dancando);
  }
  let estado = 'parada';
  let direcao = 0;
  if (flags.arrastada) estado = 'arrastada';
  else if (flags.caindo) estado = 'caindo';
  else if (flags.dormindo) estado = 'dormindo';
  else if (flags.andando) { estado = 'andando'; direcao = flags.andando; }
  else if (dancando) estado = 'dancando';
  else if (flags.pensando) estado = 'pensando';
  else if (flags.ouvindo) estado = 'ouvindo';
  const saltitar = estado === 'andando' && flags.saltitar;
  if (estado !== personagem.estado || direcao !== (personagem.animador?.direcao ?? 0) || saltitar !== !!personagem.animador?.saltitar) {
    personagem.definirEstado(estado, direcao, { saltitar });
  }
  canvas.classList.toggle('ouvindo', flags.ouvindo);
}

// ------------------------------------------------------------------ balão de fala
let timerBalao = null;
let timerDigitar = null;

function duracaoPara(texto) {
  return Math.max(3000, Math.min(16000, 2200 + texto.length * 70));
}

function mostrarBalao(texto, { ms, classe = '', digitar = true } = {}) {
  clearTimeout(timerBalao);
  clearInterval(timerDigitar);
  balao.className = 'interativo' + (classe ? ' ' + classe : '');
  if (digitar && texto) {
    let i = 0;
    balaoTexto.textContent = '';
    timerDigitar = setInterval(() => {
      i += 2;
      balaoTexto.textContent = texto.slice(0, i);
      if (i >= texto.length) clearInterval(timerDigitar);
    }, 35);
  } else {
    balaoTexto.textContent = texto;
  }
  posicionarBalao();
  if (ms !== 0) timerBalao = setTimeout(esconderBalao, ms ?? duracaoPara(texto));
}

function esconderBalao() {
  clearTimeout(timerBalao);
  clearInterval(timerDigitar);
  balao.classList.add('oculto');
}

function posicionarBalao() {
  if (balao.classList.contains('oculto')) return;
  const cabeca = personagem.posicaoCabeca();
  const largura = balao.offsetWidth || 200;
  const x = cabeca ? cabeca.x : window.innerWidth / 2;
  const y = cabeca ? cabeca.y : window.innerHeight * 0.3;
  const meio = Math.max(largura / 2 + 6, Math.min(window.innerWidth - largura / 2 - 6, x));
  balao.style.left = meio + 'px';
  balao.style.bottom = Math.min(window.innerHeight - balao.offsetHeight - 6, window.innerHeight - y + 16) + 'px';
}

balao.addEventListener('click', esconderBalao);

// ------------------------------------------------------------------ voz
const fala = new Fala({
  aoIniciar: () => {
    api.falaInicio();
    musica.pausar(true);
    clearTimeout(timerBalao);
  },
  aoTerminar: () => {
    api.falaFim();
    setTimeout(() => musica.pausar(false), 800);
    if (!balao.classList.contains('oculto') && !balao.classList.contains('pensando')) {
      clearTimeout(timerBalao);
      timerBalao = setTimeout(esconderBalao, 2200);
    }
  },
});
personagem.fonteBoca = () => fala.boca();

// ------------------------------------------------------------------ música
const musica = new DetectorMusica({
  aoComecar: () => { flags.musica = true; atualizarEstado(); },
  aoParar: () => { flags.musica = false; flags.semDancar = false; atualizarEstado(); },
});

async function atualizarMusica() {
  const querDancar = cfg.vida.dancar && cfg.plataforma === 'win32';
  if (querDancar && !musica.ativo) {
    const ok = await musica.iniciar(cfg.vida.sensibilidade_musica);
    if (!ok) api.log('Detecção de música indisponível neste sistema.');
  } else if (!querDancar && musica.ativo) {
    musica.parar();
  }
  musica.sensibilidade = cfg.vida.sensibilidade_musica;
}

// ------------------------------------------------------------------ quadro a quadro
personagem.aoQuadro = () => {
  personagem.animador?.definirRitmo(musica.ritmo());
  if (flags.dancaAte && performance.now() > flags.dancaAte) { flags.dancaAte = 0; atualizarEstado(); }
  posicionarBalao();
};

// ------------------------------------------------------------------ mouse
let ultimoSobre = false;
function estaSobre(x, y) {
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
  const el = document.elementFromPoint(x, y);
  if (el && el.closest('.interativo:not(.oculto)')) return true;
  return personagem.pixelVisivel(x, y);
}

let pressionado = false;
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  pressionado = true;
  api.arrastarInicio();
});
window.addEventListener('mouseup', async (e) => {
  if (e.button !== 0 || !pressionado) return;
  pressionado = false;
  const moveu = await api.arrastarFim();
  if (!moveu) api.clique();
});
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.menu();
});
aviso.addEventListener('click', () => api.menu());

// Soltar um arquivo .vrm em cima dela troca o corpo (e adiciona à galeria)
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const arquivos = [...(e.dataTransfer?.files || [])].filter((f) => f.name.toLowerCase().endsWith('.vrm'));
  if (arquivos.length) api.soltarModelos(arquivos);
});

// ------------------------------------------------------------------ caixa de texto
function abrirTexto() {
  caixaTexto.classList.remove('oculto');
  entrada.value = '';
  setTimeout(() => entrada.focus(), 50);
}
function fecharTexto() {
  if (caixaTexto.classList.contains('oculto')) return;
  caixaTexto.classList.add('oculto');
  entrada.blur();
  api.fecharTexto();
}
caixaTexto.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = entrada.value.trim();
  fecharTexto();
  if (t) api.enviarTexto(t);
});
entrada.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharTexto(); });
entrada.addEventListener('blur', () => setTimeout(() => { if (!entrada.value.trim()) fecharTexto(); }, 150));

// ------------------------------------------------------------------ sono
let timerZzz = null;
function dormir(v) {
  flags.dormindo = v;
  clearInterval(timerZzz);
  if (v) {
    mostrarBalao('Zzz...', { classe: 'sono', ms: 3000, digitar: false });
    timerZzz = setInterval(() => mostrarBalao('Zzz...', { classe: 'sono', ms: 3000, digitar: false }), 9000);
  } else if (balao.classList.contains('sono')) {
    esconderBalao();
  }
  atualizarEstado();
}

// ------------------------------------------------------------------ eventos do processo principal
api.on('cursor', ({ x, y }) => {
  personagem.moverCursor(x, y);
  const sobre = estaSobre(x, y);
  if (sobre !== ultimoSobre) {
    ultimoSobre = sobre;
    api.mouseSobre(sobre);
  }
});

// A resposta da IA chega aos poucos: o balão vai mostrando o que ela já disse
let textoParcial = '';
api.on('resposta-parcial', ({ texto }) => {
  flags.pensando = false;
  atualizarEstado();
  textoParcial = texto;
  clearTimeout(timerBalao);
  clearInterval(timerDigitar);
  balao.className = 'interativo';
  balaoTexto.textContent = texto;
  posicionarBalao();
});

api.on('resposta', (r) => {
  flags.pensando = false;
  atualizarEstado();
  const jaMostrado = textoParcial && r.fala && r.fala.startsWith(textoParcial.slice(0, 20));
  textoParcial = '';
  if (r.fala) mostrarBalao(r.fala, { ms: r.ms, digitar: !jaMostrado });
  personagem.emocao(r.emocao || 'neutra', r.curto ? 2500 : 5000);
});

api.on('pensando', (v) => {
  flags.pensando = v;
  if (v) mostrarBalao('', { classe: 'pensando', ms: 0, digitar: false });
  else if (balao.classList.contains('pensando')) esconderBalao();
  atualizarEstado();
});

api.on('estado-escuta', (v) => {
  if (v === 'ouvindo' || v === 'chamado') {
    fala.interromper();
    flags.ouvindo = true;
    if (v === 'chamado') personagem.emocao('feliz', 2000);
    mostrarBalao(v === 'chamado' ? 'Sim? Pode falar' : 'Estou ouvindo', { classe: 'pensando', ms: 0, digitar: false });
  } else if (v === 'transcrevendo') {
    mostrarBalao('Hmm', { classe: 'pensando', ms: 0, digitar: false });
  } else {
    flags.ouvindo = false;
    if (balao.classList.contains('pensando') && !flags.pensando) esconderBalao();
  }
  atualizarEstado();
});

api.on('tocar-audio', ({ dados, mime, volume }) => fala.tocar(dados, mime, volume));
api.on('falar-navegador', (o) => fala.falarNavegador(o.texto, o));
api.on('interromper', () => fala.interromper());

api.on('acao', (a) => {
  if (a === 'dancar') { flags.semDancar = false; flags.dancaAte = performance.now() + 15000; atualizarEstado(); }
  else if (a === 'parar_danca') { flags.dancaAte = 0; flags.semDancar = true; atualizarEstado(); }
  else if (a === 'acenar') personagem.gesto('acenar');
  else if (a === 'reagir') { personagem.gesto('reagir'); personagem.emocao('feliz', 1500); }
});

api.on('andar', ({ direcao, saltitar }) => { flags.andando = direcao || 1; flags.saltitar = !!saltitar; atualizarEstado(); });
api.on('parar-andar', () => { flags.andando = 0; atualizarEstado(); });
api.on('arrastada', (v) => { flags.arrastada = v; atualizarEstado(); });
api.on('cair', (v) => {
  flags.caindo = v;
  atualizarEstado();
  if (!v) personagem.gesto('aterrissar');
});
api.on('dormir', dormir);
api.on('modo-texto', (v) => (v ? abrirTexto() : fecharTexto()));
api.on('config', (c) => aplicarConfig(c));

// Download da IA local (só na primeira vez)
api.on('ia-local', (r) => {
  if (r.estado === 'baixando') {
    mostrarBalao(`Baixando minha inteligência (só na primeira vez)... ${r.progresso}%`, { ms: 0, digitar: false });
  } else if (r.estado === 'erro' && r.erro) {
    mostrarBalao('Minha IA local deu erro: ' + r.erro, { ms: 9000, digitar: false });
  }
});

// ------------------------------------------------------------------ configuração e modelo
function mostrarAviso(erro) {
  aviso.innerHTML = erro
    ? `<b>Não consegui carregar meu corpo.</b><br>${erro}<br><br>Clique aqui e use <b>Trocar personagem</b> para escolher outro modelo.`
    : '<b>Cadê meu corpo?</b><br>Arraste um arquivo <b>.vrm</b> para cá ou adicione um em ' +
      '<b>Configurações &gt; Personagem</b>.<br><br>Clique aqui para abrir o menu.';
  aviso.classList.remove('oculto');
}

async function carregarModelo(url, animacoes, ajuste) {
  modeloUrl = url;
  if (!url) {
    mostrarAviso();
    api.modeloCarregado(false);
    return;
  }
  try {
    await personagem.carregar(url, animacoes, ajuste);
    aviso.classList.add('oculto');
    atualizarEstado();
    api.modeloCarregado(true);
  } catch (e) {
    console.error(e);
    mostrarAviso(String(e.message || e).slice(0, 200));
    api.modeloCarregado(false);
  }
}

async function aplicarConfig(novo) {
  const antigo = cfg;
  cfg = novo;
  personagem.fps = Math.max(15, Math.min(60, Number(cfg.vida.fps) || 30));
  personagem.olharMouse = cfg.vida.olhar_mouse !== false;
  atualizarMusica();
  atualizarEstado();
  const animAntes = JSON.stringify(antigo?.animacoes || []);
  if (!antigo || cfg.modeloUrl !== modeloUrl || JSON.stringify(cfg.animacoes) !== animAntes) {
    const trocou = !!antigo && !!modeloUrl && cfg.modeloUrl !== modeloUrl;
    await carregarModelo(cfg.modeloUrl, cfg.animacoes, cfg.ajusteModelo);
    if (trocou && personagem.vrm) { personagem.gesto('acenar'); personagem.emocao('feliz', 2500); }
  } else {
    personagem.ajustar(cfg.ajusteModelo || {});
  }
}

aplicarConfig(await api.pronto());

// Ganchos para testes automatizados
window.__emy = { personagem, fala, musica, flags, mostrarBalao, atualizarEstado };
