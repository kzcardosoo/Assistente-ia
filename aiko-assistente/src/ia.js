'use strict';
// Cliente de IA. Todos os provedores usam o formato de chat compatível com a OpenAI,
// então um único código atende APIs gratuitas (Gemini, Groq, OpenRouter) e IAs locais
// (Ollama, LM Studio) que funcionam sem internet.

const PROVEDORES = {
  gemini: {
    nome: 'Google Gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    precisaChave: true,
    modelo: 'gemini-2.5-flash',
    site: 'https://aistudio.google.com/apikey',
  },
  groq: {
    nome: 'Groq',
    base: 'https://api.groq.com/openai/v1',
    precisaChave: true,
    modelo: 'llama-3.3-70b-versatile',
    site: 'https://console.groq.com/keys',
  },
  openrouter: {
    nome: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    precisaChave: true,
    modelo: 'meta-llama/llama-3.3-70b-instruct:free',
    site: 'https://openrouter.ai/keys',
  },
  ollama: {
    nome: 'Ollama (local, off-line)',
    base: 'http://localhost:11434/v1',
    precisaChave: false,
    local: true,
    modelo: 'qwen2.5:7b',
    site: 'https://ollama.com/download',
  },
  lmstudio: {
    nome: 'LM Studio (local, off-line)',
    base: 'http://localhost:1234/v1',
    precisaChave: false,
    local: true,
    modelo: '',
    site: 'https://lmstudio.ai',
  },
  personalizado: {
    nome: 'Outro (compatível com OpenAI)',
    base: '',
    precisaChave: false,
    modelo: '',
    site: '',
  },
};

const EMOCOES = ['feliz', 'triste', 'brava', 'surpresa', 'relaxada', 'neutra', 'envergonhada'];
const TIPOS_ACAO = ['pesquisar', 'abrir_site', 'youtube', 'abrir_programa', 'dancar', 'acenar'];

let historico = [];
const semModoJson = new Set(); // provedores/modelos que recusaram response_format

function provedor(cfg) {
  const p = { ...(PROVEDORES[cfg.ia.provedor] || PROVEDORES.personalizado) };
  if (cfg.ia.provedor === 'personalizado' || (cfg.ia.url_personalizada && p.local)) {
    if (cfg.ia.url_personalizada) p.base = cfg.ia.url_personalizada.replace(/\/+$/, '');
  }
  return p;
}

function configurada(cfg) {
  const p = provedor(cfg);
  if (!p.base) return false;
  if (p.precisaChave && !cfg.ia.chave) return false;
  return true;
}

function listaAcoesPermitidas(cfg) {
  const linhas = [];
  if (cfg.acoes.abrir_sites) {
    linhas.push('{"tipo":"pesquisar","termo":"..."}  -> pesquisa no Google');
    linhas.push('{"tipo":"youtube","termo":"..."}  -> pesquisa no YouTube (músicas, vídeos)');
    linhas.push('{"tipo":"abrir_site","url":"https://..."}  ou  {"tipo":"abrir_site","nome":"<site favorito>"}');
  }
  if (cfg.acoes.abrir_programas && Object.keys(cfg.programas || {}).length) {
    linhas.push('{"tipo":"abrir_programa","nome":"<um dos programas da lista>"}');
  }
  if (cfg.vida.dancar) linhas.push('{"tipo":"dancar"}  -> quando pedirem para dançar');
  linhas.push('{"tipo":"acenar"}  -> para cumprimentar ou se despedir');
  return linhas;
}

function promptSistema(cfg) {
  const agora = new Date();
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const usuario = cfg.nome_usuario ? cfg.nome_usuario : 'a pessoa que usa o computador';
  const programas = Object.keys(cfg.programas || {});
  const sites = Object.keys(cfg.sites_favoritos || {});
  return [
    `Você é ${cfg.nome}, uma assistente virtual com corpo de personagem de anime que vive na área de trabalho do computador de ${usuario}.`,
    `Sua personalidade: ${cfg.personalidade}.`,
    `Hoje é ${data}, ${hora}.`,
    cfg.interesses?.length ? `Gostos e interesses de ${usuario}: ${cfg.interesses.join(', ')}. Use isso para personalizar sugestões e pesquisas.` : '',
    sites.length && cfg.acoes.abrir_sites ? `Sites favoritos (abra pelo nome): ${sites.join(', ')}.` : '',
    programas.length && cfg.acoes.abrir_programas ? `Programas que você pode abrir: ${programas.join(', ')}. Nunca invente programas fora dessa lista.` : '',
    '',
    'Regras da conversa:',
    '- Sua fala será convertida em voz: responda em português do Brasil, de forma curta (1 a 3 frases), natural e simpática.',
    '- Não use emojis, markdown, listas, asteriscos nem links na fala.',
    '- Se pedirem algo que exige uma ação, faça a ação e comente brevemente.',
    '',
    'Responda SEMPRE e SOMENTE com um objeto JSON neste formato:',
    '{"fala": "o que você vai dizer", "emocao": "' + EMOCOES.join('|') + '", "acoes": []}',
    'Ações disponíveis (coloque dentro de "acoes", ou deixe a lista vazia):',
    ...listaAcoesPermitidas(cfg).map((l) => '  ' + l),
  ].filter((l) => l !== '').join('\n');
}

function extrairJSON(texto) {
  let t = String(texto || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini >= 0 && fim > ini) {
    try { return JSON.parse(t.slice(ini, fim + 1)); } catch { /* cai para texto puro */ }
  }
  return { fala: t, emocao: 'neutra', acoes: [] };
}

function normalizarResposta(obj) {
  const fala = String(obj.fala ?? obj.resposta ?? obj.texto ?? '').trim();
  const emocao = EMOCOES.includes(obj.emocao) ? obj.emocao : 'neutra';
  let acoes = Array.isArray(obj.acoes) ? obj.acoes : (obj.acao ? [obj.acao] : []);
  acoes = acoes.filter((a) => a && typeof a === 'object' && TIPOS_ACAO.includes(a.tipo)).slice(0, 4);
  return { fala, emocao, acoes };
}

class ErroIA extends Error {
  constructor(tipo, mensagem, detalhe) {
    super(mensagem);
    this.tipo = tipo;
    this.detalhe = detalhe;
  }
}

async function chamar(cfg, mensagens, { json = true, timeoutMs } = {}) {
  const p = provedor(cfg);
  if (!p.base) throw new ErroIA('sem_url', 'URL da IA não configurada');
  if (p.precisaChave && !cfg.ia.chave) throw new ErroIA('sem_chave', 'Chave da API não configurada');

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.ia.chave) headers.Authorization = 'Bearer ' + cfg.ia.chave;
  if (cfg.ia.provedor === 'openrouter') headers['X-Title'] = 'Aiko Assistente';

  const corpoBase = {
    model: cfg.ia.modelo || p.modelo,
    temperature: Number(cfg.ia.temperatura ?? 0.8),
    messages: mensagens,
  };
  const chaveModelo = p.base + '|' + corpoBase.model;
  const tentativas = json && !semModoJson.has(chaveModelo)
    ? [{ ...corpoBase, response_format: { type: 'json_object' } }, corpoBase]
    : [corpoBase];

  let ultimoErro;
  for (const corpo of tentativas) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), timeoutMs || (p.local ? 180000 : 60000));
    let r;
    try {
      r = await fetch(p.base + '/chat/completions', {
        method: 'POST', headers, body: JSON.stringify(corpo), signal: controle.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new ErroIA('timeout', 'A IA demorou demais para responder');
      throw new ErroIA(p.local ? 'local_offline' : 'rede', 'Não foi possível conectar à IA', e.cause?.code || e.message);
    }
    clearTimeout(timer);
    if (r.ok) {
      const dados = await r.json();
      const conteudo = dados?.choices?.[0]?.message?.content;
      if (conteudo == null) throw new ErroIA('vazio', 'A IA não mandou resposta');
      return conteudo;
    }
    const texto = await r.text().catch(() => '');
    ultimoErro = new ErroIA('http', `IA respondeu ${r.status}`, { status: r.status, texto: texto.slice(0, 500) });
    // 400/422: talvez o provedor não aceite response_format -> tenta de novo sem ele
    if (![400, 422].includes(r.status)) break;
    if (corpo.response_format) semModoJson.add(chaveModelo);
  }
  throw ultimoErro;
}

function lembrar(mensagem, cfg) {
  historico.push(mensagem);
  const max = Math.max(2, Number(cfg.ia.memoria_mensagens) || 16);
  while (historico.length > max) historico.shift();
}

async function perguntar(texto, cfg) {
  const msgs = [{ role: 'system', content: promptSistema(cfg) }, ...historico, { role: 'user', content: texto }];
  const bruto = await chamar(cfg, msgs);
  const resp = normalizarResposta(extrairJSON(bruto));
  lembrar({ role: 'user', content: texto }, cfg);
  lembrar({ role: 'assistant', content: JSON.stringify(resp) }, cfg);
  return resp;
}

async function comentar(cfg, contexto) {
  const pedido = [
    '[EVENTO INTERNO, não é uma mensagem da pessoa]',
    `Agora são ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
    contexto,
    'Faça um comentário espontâneo e curto (1 ou 2 frases), de acordo com sua personalidade.',
    'Pode ser uma curiosidade ligada aos interesses da pessoa, um lembrete gentil (beber água, alongar, descansar os olhos),',
    'uma reação ao momento do dia, ou só puxar assunto. Não repita comentários anteriores.',
    cfg.comentarios.pode_abrir_abas
      ? 'Se fizer sentido, você pode sugerir algo e incluir UMA ação "pesquisar" ou "youtube" ligada aos interesses.'
      : 'Não inclua ações de abrir sites ou programas.',
  ].join(' ');
  const msgs = [{ role: 'system', content: promptSistema(cfg) }, ...historico, { role: 'user', content: pedido }];
  const resp = normalizarResposta(extrairJSON(await chamar(cfg, msgs)));
  lembrar({ role: 'assistant', content: JSON.stringify(resp) }, cfg);
  if (!cfg.comentarios.pode_abrir_abas) {
    resp.acoes = resp.acoes.filter((a) => ['dancar', 'acenar'].includes(a.tipo));
  } else {
    resp.acoes = resp.acoes.filter((a) => ['pesquisar', 'youtube', 'dancar', 'acenar'].includes(a.tipo)).slice(0, 1);
  }
  return resp;
}

function mensagemDeErro(e, cfg) {
  const p = provedor(cfg);
  switch (e?.tipo) {
    case 'sem_chave':
    case 'sem_url':
      return 'Ainda não tenho uma IA conectada. Clica com o botão direito em mim e abre as Configurações, na aba IA.';
    case 'local_offline':
      return cfg.ia.provedor === 'ollama'
        ? 'Não encontrei o Ollama rodando. Abre o Ollama e tenta de novo, tá?'
        : `Não consegui falar com a IA local em ${p.base}. Ela está aberta?`;
    case 'rede':
      return 'Parece que estou sem internet para falar com a IA agora.';
    case 'timeout':
      return 'A IA demorou demais para responder. Tenta de novo?';
    case 'http': {
      const s = e.detalhe?.status;
      if (s === 401 || s === 403) return 'A chave da IA foi recusada. Confere ela nas Configurações?';
      if (s === 429) return 'Chegamos no limite gratuito da IA por enquanto. Tenta daqui a pouquinho!';
      if (s === 404 && cfg.ia.provedor === 'ollama') {
        return `Não achei o modelo ${cfg.ia.modelo} no Ollama. Rode no terminal: ollama pull ${cfg.ia.modelo}.`;
      }
      if (s === 404) return 'O modelo de IA escolhido não foi encontrado. Confere o nome do modelo nas Configurações.';
      return `Tive um probleminha com a IA, código ${s}.`;
    }
    default:
      return 'Tive um probleminha para pensar agora. Tenta de novo?';
  }
}

async function testar(cfg) {
  try {
    const bruto = await chamar(cfg, [
      { role: 'system', content: 'Responda apenas com JSON: {"fala": "..."}' },
      { role: 'user', content: 'Diga oi em uma frase curta, em português.' },
    ], { timeoutMs: 120000 });
    const r = normalizarResposta(extrairJSON(bruto));
    return { ok: true, mensagem: 'Conectado! Resposta: ' + (r.fala || bruto).slice(0, 160) };
  } catch (e) {
    const extra = e.detalhe?.texto ? ' — ' + e.detalhe.texto.slice(0, 200) : (typeof e.detalhe === 'string' ? ' — ' + e.detalhe : '');
    return { ok: false, mensagem: mensagemDeErro(e, cfg) + extra };
  }
}

async function listarModelos(cfg) {
  const p = provedor(cfg);
  if (!p.base) return [];
  try {
    if (cfg.ia.provedor === 'ollama') {
      const r = await fetch(p.base.replace(/\/v1$/, '') + '/api/tags', { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      return (d.models || []).map((m) => m.name);
    }
    const headers = cfg.ia.chave ? { Authorization: 'Bearer ' + cfg.ia.chave } : {};
    const r = await fetch(p.base + '/models', { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const d = await r.json();
    let lista = (d.data || d.models || []).map((m) => (m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
    if (cfg.ia.provedor === 'openrouter') lista = lista.filter((n) => n.endsWith(':free'));
    return lista.sort();
  } catch {
    return [];
  }
}

function limparHistorico() { historico = []; }

module.exports = {
  PROVEDORES, perguntar, comentar, testar, listarModelos, configurada, mensagemDeErro,
  limparHistorico, extrairJSON, normalizarResposta, promptSistema,
};
