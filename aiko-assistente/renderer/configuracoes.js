// Tela de configurações: lê, mostra e salva todas as opções da assistente.
const api = window.cfgApi;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let dados = null;
let cfg = null;

const pegar = (obj, caminho) => caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function definir(obj, caminho, valor) {
  const partes = caminho.split('.');
  let o = obj;
  for (const k of partes.slice(0, -1)) o = o[k] ?? (o[k] = {});
  o[partes[partes.length - 1]] = valor;
}

// ------------------------------------------------------------------ abas
function abrirAba(nome) {
  if (!$('#aba-' + nome)) return;
  $$('#abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  $$('.aba').forEach((s) => s.classList.toggle('ativa', s.id === 'aba-' + nome));
}
$$('#abas button').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

// ------------------------------------------------------------------ campos simples
function preencher() {
  for (const el of $$('[data-campo]')) {
    const v = pegar(cfg, el.dataset.campo);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.dataset.tipo === 'lista') el.value = (v || []).join(', ');
    else if (el.dataset.tipo === 'microfone') {
      if (v && ![...el.options].some((o) => o.value === v)) el.add(new Option(v, v));
      el.value = v || '';
    } else el.value = v ?? '';
  }
  mostrarValores();
  $('#titulo-nome').textContent = cfg.nome || 'Aiko';
  preencherProgramas();
  preencherSites();
  atualizarProvedor(false);
}

function coletar() {
  const novo = structuredClone(cfg);
  for (const el of $$('[data-campo]')) {
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.tipo === 'lista') v = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (el.dataset.tipo === 'numero') v = Number(el.value);
    else if (el.dataset.tipo === 'microfone') v = el.value || null;
    else v = el.value.trim();
    definir(novo, el.dataset.campo, v);
  }
  novo.programas = lerProgramas();
  novo.sites_favoritos = lerSites();
  return novo;
}

function mostrarValores() {
  for (const el of $$('[data-mostra]')) {
    const campo = $(`[data-campo="${el.dataset.mostra}"]`);
    if (campo) el.textContent = campo.value + (el.dataset.sufixo || '');
  }
}
document.addEventListener('input', mostrarValores);

// ------------------------------------------------------------------ IA
function atualizarProvedor(trocouAgora) {
  const sel = $('#provedor');
  const p = dados.provedores[sel.value] || {};
  const campoModelo = $('#modelo-ia');
  if (trocouAgora) {
    campoModelo.value = p.modelo || '';
    $('#lista-modelos').innerHTML = '';
  }
  $('#bloco-chave').style.display = p.precisaChave || sel.value === 'personalizado' ? '' : 'none';
  $('#bloco-url').style.display = sel.value === 'personalizado' || p.local ? '' : 'none';
  $('#bloco-url input').placeholder = p.base || 'http://localhost:1234/v1';
  const dicas = {
    gemini: 'Ex.: gemini-2.5-flash. Clique em "Buscar modelos" depois de colar a chave para ver a lista atual.',
    groq: 'Ex.: llama-3.3-70b-versatile. Muito rápido.',
    openrouter: 'Use modelos terminados em ":free" para não pagar nada.',
    ollama: 'Instale o Ollama e baixe um modelo, ex.: "ollama pull qwen2.5:7b". Funciona sem internet.',
    lmstudio: 'Abra o LM Studio, carregue um modelo e ligue o servidor local.',
    personalizado: 'Qualquer serviço compatível com a API da OpenAI.',
  };
  $('#dica-modelo').textContent = dicas[sel.value] || '';
}

$('#provedor').addEventListener('change', () => atualizarProvedor(true));
$('#link-chave').addEventListener('click', (e) => {
  e.preventDefault();
  const p = dados.provedores[$('#provedor').value];
  if (p?.site) api.abrirLink(p.site);
});
$('#btn-ver-chave').addEventListener('click', () => {
  const c = $('#chave');
  c.type = c.type === 'password' ? 'text' : 'password';
});

async function comBotao(botao, fn) {
  botao.disabled = true;
  try { return await fn(); } finally { botao.disabled = false; }
}

$('#btn-listar-modelos').addEventListener('click', (e) => comBotao(e.target, async () => {
  const lista = await api.listarModelos(coletar());
  const dl = $('#lista-modelos');
  dl.innerHTML = '';
  lista.forEach((m) => dl.append(new Option(m, m)));
  $('#dica-modelo').textContent = lista.length
    ? `${lista.length} modelos encontrados. Clique no campo para escolher.`
    : 'Não encontrei modelos. Confira a chave/endereço (ou se o Ollama está aberto).';
}));

$('#btn-testar-ia').addEventListener('click', (e) => comBotao(e.target, async () => {
  const res = $('#res-ia');
  res.className = 'resultado';
  res.textContent = 'Testando...';
  const r = await api.testarIA(coletar());
  res.className = 'resultado ' + (r.ok ? 'ok' : 'erro');
  res.textContent = r.mensagem;
}));

// ------------------------------------------------------------------ voz e microfone
$('#btn-testar-voz').addEventListener('click', () => api.testarVoz(coletar().voz));

$('#btn-microfones').addEventListener('click', (e) => comBotao(e.target, async () => {
  const sel = $('#microfone');
  const atual = sel.value;
  const lista = await api.listarMicrofones();
  sel.innerHTML = '<option value="">Padrão do sistema</option>';
  lista.forEach((m) => sel.add(new Option(m.nome, m.nome)));
  if (atual && ![...sel.options].some((o) => o.value === atual)) sel.add(new Option(atual, atual));
  sel.value = atual;
}));

function mostrarStatusVoz() {
  const v = dados.voz || {};
  const el = $('#status-voz');
  if (!v.disponivel) {
    el.innerHTML = `<div class="erro">Módulo de voz desligado.</div><div>${v.erro || 'Rode o instalador (instalar.bat) para instalar o Python e as bibliotecas de voz.'}</div>` +
      '<div>Enquanto isso, você pode conversar por texto (botão direito nela &gt; Escrever mensagem).</div>';
    return;
  }
  const r = v.recursos || {};
  const item = (ok, texto, falta) => `<div class="${ok ? 'ok' : 'erro'}">${ok ? '✔' : '✘'} ${texto}${!ok && falta ? ' — ' + falta : ''}</div>`;
  el.innerHTML = [
    item(r.microfone, 'Microfone', r.erros?.microfone),
    item(r.ativacao, 'Palavra de ativação (Vosk)', r.erros?.ativacao || 'rode instalar.bat para baixar o modelo'),
    item(!!r.transcricao, 'Transcrição' + (r.transcricao ? ` (${r.transcricao})` : ''), r.erros?.transcricao),
    item(r.tts?.edge, 'Voz Edge TTS', 'pip install edge-tts'),
    item(r.tts?.kokoro, 'Voz off-line Kokoro (opcional)', 'pip install kokoro soundfile'),
  ].join('');
}

// ------------------------------------------------------------------ modelo VRM
$('#btn-vrm').addEventListener('click', async () => {
  const nome = await api.escolherVrm();
  if (!nome) return;
  cfg = coletar();
  cfg.modelo_vrm = nome;
  await api.salvar(cfg);
  $('#modelo-atual').textContent = nome;
  avisar('Modelo trocado!');
});

// ------------------------------------------------------------------ programas e sites
function linhaPrograma(nome = '', prog = {}) {
  const tr = document.createElement('tr');
  const p = typeof prog === 'string' ? { caminho: prog, args: [] } : prog;
  tr.innerHTML = '<td><input class="p-nome"></td><td><input class="p-caminho"></td><td><input class="p-args"></td>' +
    '<td><button type="button" title="Remover">✕</button></td>';
  tr.querySelector('.p-nome').value = nome;
  tr.querySelector('.p-caminho').value = p.caminho || '';
  tr.querySelector('.p-args').value = (p.args || []).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
  tr.querySelector('button').addEventListener('click', () => tr.remove());
  $('#tabela-programas tbody').append(tr);
  return tr;
}

function separarArgs(texto) {
  return (texto.match(/"[^"]*"|\S+/g) || []).map((a) => a.replace(/^"|"$/g, ''));
}

function preencherProgramas() {
  $('#tabela-programas tbody').innerHTML = '';
  Object.entries(cfg.programas || {}).forEach(([n, p]) => linhaPrograma(n, p));
}

function lerProgramas() {
  const saida = {};
  for (const tr of $$('#tabela-programas tbody tr')) {
    const nome = tr.querySelector('.p-nome').value.trim().toLowerCase();
    const caminho = tr.querySelector('.p-caminho').value.trim();
    if (nome && caminho) saida[nome] = { caminho, args: separarArgs(tr.querySelector('.p-args').value) };
  }
  return saida;
}

$('#btn-add-programa').addEventListener('click', async () => {
  const r = await api.escolherPrograma();
  if (!r) return;
  linhaPrograma(r.nome.toLowerCase(), { caminho: r.caminho, args: [] }).querySelector('.p-nome').focus();
});

function linhaSite(nome = '', url = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><input class="s-nome"></td><td><input class="s-url" placeholder="https://"></td>' +
    '<td><button type="button" title="Remover">✕</button></td>';
  tr.querySelector('.s-nome').value = nome;
  tr.querySelector('.s-url').value = url;
  tr.querySelector('button').addEventListener('click', () => tr.remove());
  $('#tabela-sites tbody').append(tr);
  return tr;
}

function preencherSites() {
  $('#tabela-sites tbody').innerHTML = '';
  Object.entries(cfg.sites_favoritos || {}).forEach(([n, u]) => linhaSite(n, u));
}

function lerSites() {
  const saida = {};
  for (const tr of $$('#tabela-sites tbody tr')) {
    const nome = tr.querySelector('.s-nome').value.trim().toLowerCase();
    let url = tr.querySelector('.s-url').value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (nome && url) saida[nome] = url;
  }
  return saida;
}

$('#btn-add-site').addEventListener('click', () => linhaSite().querySelector('.s-nome').focus());

// ------------------------------------------------------------------ outros
$$('[data-link]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); api.abrirLink(a.dataset.link); }));
$$('[data-pasta]').forEach((b) => b.addEventListener('click', () => api.abrirPasta(b.dataset.pasta)));

let timerAviso;
function avisar(texto) {
  const el = $('#status-salvar');
  el.textContent = texto;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { el.textContent = ''; }, 3000);
}

async function salvar() {
  const r = await api.salvar(coletar());
  if (r?.ok) {
    cfg = r.cfg;
    $('#titulo-nome').textContent = cfg.nome || 'Aiko';
    avisar('Salvo!');
  }
}
$('#btn-salvar').addEventListener('click', salvar);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar(); }
});

// ------------------------------------------------------------------ início
(async () => {
  dados = await api.ler();
  cfg = dados.cfg;
  const sel = $('#provedor');
  for (const [id, p] of Object.entries(dados.provedores)) sel.add(new Option(p.nome, id));
  preencher();
  $('#modelo-atual').textContent = dados.modeloAtual || 'nenhum (coloque um .vrm na pasta modelos)';
  if (dados.plataforma !== 'win32') $('#aviso-musica').textContent = '(a detecção de música funciona só no Windows)';
  mostrarStatusVoz();
  if (location.hash) abrirAba(location.hash.slice(1));
})();
