'use strict';
// Cliente de IA. Todos os provedores usam o formato de chat compatível com a OpenAI,
// então um único código atende APIs gratuitas (Gemini, Groq, OpenRouter) e IAs locais
// (Ollama, LM Studio) que funcionam sem internet.

const PORTA_EMBUTIDA = 11435;

const PROVEDORES = {
  emy: {
    nome: 'IA da Emy (já vem no app, sem internet)',
    base: `http://127.0.0.1:${PORTA_EMBUTIDA}/v1`,
    precisaChave: false,
    local: true,
    embutido: true,
    modelo: 'gemma3:1b',
    site: '',
  },
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

function provedor(cfg) {
  const p = { ...(PROVEDORES[cfg.ia.provedor] || PROVEDORES.personalizado) };
  // A IA que vem no app tem endereço fixo: um endereço digitado antes (ex.: o do Gemini)
  // não pode mandar os pedidos para outro lugar.
  if (p.embutido) return p;
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

// Prompt curto para modelos pequenos que rodam no PC: só conversa (os comandos são
// resolvidos pelo app antes de chegar aqui), o que deixa a resposta mais rápida e certa.
function promptCompacto(cfg) {
  const agora = new Date();
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const usuario = cfg.nome_usuario || 'a pessoa';
  return [
    `Você é ${cfg.nome}, uma assistente virtual de anime que vive no computador de ${usuario}.`,
    `Personalidade: ${cfg.personalidade}.`,
    cfg.interesses?.length ? `${usuario} gosta de: ${cfg.interesses.join(', ')}.` : '',
    'Responda sempre em português do Brasil, com no máximo 2 frases curtas, naturais e corretas. Sem emojis, sem listas.',
    'Responda somente com JSON: {"fala": "sua resposta", "emocao": "feliz|triste|brava|surpresa|relaxada|neutra"}',
    // data e hora por último: o começo do texto fica igual entre perguntas e a IA reaproveita o que já leu
    `Agora: ${data}, ${hora}.`,
  ].filter(Boolean).join('\n');
}

function promptSistema(cfg) {
  if (provedor(cfg).embutido) return promptCompacto(cfg);
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

// Lê a resposta aos pedaços e vai entregando cada frase completa da "fala" assim que
// ela fica pronta, para a Emy começar a falar antes de a IA terminar de responder.
class LeitorDeFrases {
  constructor(aoFrase) {
    this.aoFrase = aoFrase;
    this.texto = '';
    this.entregue = 0;
    this.terminou = false;
  }

  // Valor (parcial) do campo "fala" dentro do JSON que ainda está chegando.
  falaParcial() {
    const t = this.texto.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
    const m = t.match(/"fala"\s*:\s*"/);
    if (!m) {
      // Modelo respondeu texto puro (sem JSON): a fala é o próprio texto
      const limpo = t.trim();
      if (limpo && !limpo.startsWith('{') && !limpo.startsWith('`') && limpo.length > 12) return { valor: limpo, fechado: false };
      return null;
    }
    let valor = '';
    for (let i = m.index + m[0].length; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') {
        const n = t[i + 1];
        if (n === undefined) break;
        if (n === 'u') {
          const hex = t.slice(i + 2, i + 6);
          if (hex.length < 4) break;
          valor += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          valor += { n: ' ', t: ' ', r: '', '"': '"', '\\': '\\', '/': '/' }[n] ?? n;
          i += 1;
        }
      } else if (c === '"') {
        return { valor, fechado: true };
      } else {
        valor += c;
      }
    }
    return { valor, fechado: false };
  }

  adicionar(pedaco) {
    this.texto += pedaco;
    const f = this.falaParcial();
    if (!f) return;
    const resto = f.valor.slice(this.entregue);
    // frase completa = termina em . ! ? … seguido de espaço (ou fim da fala)
    // (sticky: as frases precisam ser seguidas; um ponto no meio, como em "3.5", não corta a frase)
    const re = /(?:[^.!?…]|[.!?…](?=[^\s.!?…]))*[.!?…]+["')\]]*(\s+|$)/y;
    let m;
    let consumido = 0;
    while ((m = re.exec(resto))) {
      if (!m[0]) break;
      const fimDaFala = m.index + m[0].length >= resto.length;
      if (fimDaFala && !f.fechado && !/\s$/.test(m[0])) break; // pode ser "3.5" ainda chegando
      consumido = m.index + m[0].length;
      if (consumido >= resto.length) re.lastIndex = resto.length + 1;
      const frase = m[0].trim();
      if (frase.length > 1) this.aoFrase(frase);
    }
    this.entregue += consumido;
    if (f.fechado) this.finalizar(f.valor);
  }

  finalizar(valorFinal) {
    if (this.terminou) return;
    const f = valorFinal != null ? { valor: valorFinal } : this.falaParcial();
    if (!f) return;
    this.terminou = true;
    const resto = f.valor.slice(this.entregue).trim();
    this.entregue = f.valor.length;
    if (resto.length > 1) this.aoFrase(resto);
  }
}

async function lerFluxo(resposta, aoPedaco) {
  const leitor = resposta.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  let completo = '';
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let quebra;
    while ((quebra = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, quebra).trim();
      buffer = buffer.slice(quebra + 1);
      if (!linha.startsWith('data:')) continue;
      const dados = linha.slice(5).trim();
      if (dados === '[DONE]') return completo;
      try {
        const j = JSON.parse(dados);
        const pedaco = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
        if (pedaco) { completo += pedaco; aoPedaco(pedaco); }
      } catch { /* linha incompleta ou comentário */ }
    }
  }
  return completo;
}

const recusas = new Map(); // provedor|modelo -> recursos que o provedor não aceita

async function chamar(cfg, mensagens, { json = true, timeoutMs, aoPedaco, maxTokens = 400 } = {}) {
  const p = provedor(cfg);
  if (!p.base) throw new ErroIA('sem_url', 'URL da IA não configurada');
  if (p.precisaChave && !cfg.ia.chave) throw new ErroIA('sem_chave', 'Chave da API não configurada');

  const headers = { 'Content-Type': 'application/json' };
  // a chave só vai para quem precisa dela (nunca para a IA local)
  if (cfg.ia.chave && (p.precisaChave || cfg.ia.provedor === 'personalizado')) headers.Authorization = 'Bearer ' + cfg.ia.chave;
  if (cfg.ia.provedor === 'openrouter') headers['X-Title'] = 'Emy Assistente';

  const modelo = cfg.ia.modelo || p.modelo;
  const corpoBase = {
    model: modelo,
    temperature: Number(cfg.ia.temperatura ?? 0.8),
    max_tokens: maxTokens, // respostas curtas = respostas rápidas
    messages: mensagens,
  };
  const extras = {};
  if (json) extras.response_format = { type: 'json_object' };
  // Gemini 2.5 "pensa" antes de responder por padrão: desligar deixa bem mais rápido
  if (cfg.ia.provedor === 'gemini' && /2\.5-flash/.test(modelo)) extras.reasoning_effort = 'none';

  const chave = p.base + '|' + modelo;
  const recusado = recusas.get(chave) || new Set();
  const tentativas = [];
  const comExtras = Object.fromEntries(Object.entries(extras).filter(([k]) => !recusado.has(k)));
  if (aoPedaco && !recusado.has('stream')) tentativas.push({ corpo: { ...corpoBase, ...comExtras, stream: true }, fluxo: true });
  tentativas.push({ corpo: { ...corpoBase, ...comExtras }, fluxo: false });
  if (Object.keys(comExtras).length) tentativas.push({ corpo: corpoBase, fluxo: false, semExtras: true });

  let ultimoErro;
  for (const t of tentativas) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), timeoutMs || (p.local ? 180000 : 60000));
    let r;
    try {
      r = await fetch(p.base + '/chat/completions', {
        method: 'POST', headers, body: JSON.stringify(t.corpo), signal: controle.signal,
      });
      if (r.ok && t.fluxo) {
        const conteudo = await lerFluxo(r, aoPedaco);
        clearTimeout(timer);
        if (conteudo) return conteudo;
        recusado.add('stream'); recusas.set(chave, recusado);
        continue;
      }
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
      if (aoPedaco) aoPedaco(conteudo);
      return conteudo;
    }
    const texto = await r.text().catch(() => '');
    ultimoErro = new ErroIA('http', `IA respondeu ${r.status}`, { status: r.status, texto: texto.slice(0, 500) });
    // 400/422: o provedor não aceitou algum recurso (fluxo, JSON, sem "pensar"): tenta sem ele
    if (![400, 422].includes(r.status)) break;
    if (t.fluxo) recusado.add('stream');
    else if (!t.semExtras) Object.keys(comExtras).forEach((k) => recusado.add(k));
    recusas.set(chave, recusado);
  }
  throw ultimoErro;
}

function lembrar(mensagem, cfg) {
  historico.push(mensagem);
  const max = Math.max(2, Number(cfg.ia.memoria_mensagens) || 16);
  while (historico.length > max) historico.shift();
}

// aoFrase(frase): chamada para cada frase da fala assim que ela fica pronta.
async function perguntar(texto, cfg, { aoFrase } = {}) {
  const pequeno = provedor(cfg).embutido;
  const memoria = pequeno ? historico.slice(-6) : historico; // modelos pequenos: memória curta = mais rápido
  const msgs = [{ role: 'system', content: promptSistema(cfg) }, ...memoria, { role: 'user', content: texto }];
  const leitor = aoFrase ? new LeitorDeFrases(aoFrase) : null;
  const bruto = await chamar(cfg, msgs, { aoPedaco: leitor ? (p) => leitor.adicionar(p) : undefined, maxTokens: pequeno ? 160 : 400 });
  const resp = normalizarResposta(extrairJSON(bruto));
  if (leitor) {
    if (leitor.entregue === 0 && !leitor.terminou) {
      // nada foi entregue durante o fluxo (ex.: o JSON veio todo de uma vez): fala tudo agora
      const l2 = new LeitorDeFrases(aoFrase);
      l2.texto = JSON.stringify({ fala: resp.fala });
      l2.adicionar('');
      l2.finalizar();
    } else {
      leitor.finalizar();
    }
  }
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
      if (p.embutido) return 'Minha IA local não está respondendo. Feche e abra o app de novo, por favor.';
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
    return { ok: true, mensagem: `Conectado a ${provedor(cfg).base} (${cfg.ia.modelo || provedor(cfg).modelo})! Resposta: ` + (r.fala || bruto).slice(0, 160) };
  } catch (e) {
    const extra = e.detalhe?.texto ? ' — ' + e.detalhe.texto.slice(0, 200) : (typeof e.detalhe === 'string' ? ' — ' + e.detalhe : '');
    return { ok: false, mensagem: mensagemDeErro(e, cfg) + ` [${provedor(cfg).base}]` + extra };
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
  PORTA_EMBUTIDA, LeitorDeFrases,
  PROVEDORES, perguntar, comentar, testar, listarModelos, configurada, mensagemDeErro,
  limparHistorico, extrairJSON, normalizarResposta, promptSistema,
};
