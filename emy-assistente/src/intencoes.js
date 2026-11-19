'use strict';
// Comandos entendidos direto pelo app, sem passar pela IA: respondem na hora e não
// dependem do modelo acertar o formato. A IA fica só para conversar.
const { normalizar, acharNaLista } = require('./acoes');

const sortear = (l) => l[Math.floor(Math.random() * l.length)];

// Sites conhecidos que podem ser abertos pelo nome mesmo sem estar nos favoritos
const SITES_CONHECIDOS = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  netflix: 'https://www.netflix.com', instagram: 'https://www.instagram.com', facebook: 'https://www.facebook.com',
  twitter: 'https://x.com', x: 'https://x.com', tiktok: 'https://www.tiktok.com', twitch: 'https://www.twitch.tv',
  whatsapp: 'https://web.whatsapp.com', 'whatsapp web': 'https://web.whatsapp.com', spotify: 'https://open.spotify.com',
  github: 'https://github.com', wikipedia: 'https://pt.wikipedia.org', 'google drive': 'https://drive.google.com',
  'google maps': 'https://maps.google.com', maps: 'https://maps.google.com', 'prime video': 'https://www.primevideo.com',
  crunchyroll: 'https://www.crunchyroll.com', discord: 'https://discord.com/app', pinterest: 'https://www.pinterest.com',
  reddit: 'https://www.reddit.com', 'mercado livre': 'https://www.mercadolivre.com.br', shopee: 'https://shopee.com.br',
  amazon: 'https://www.amazon.com.br', outlook: 'https://outlook.live.com', chatgpt: 'https://chatgpt.com',
};

// Texto "espelho": mesma posição de cada letra, mas sem acento, em minúsculas e sem
// pontuação. Os comandos são reconhecidos no espelho e o termo é copiado do original
// (assim a pesquisa sai com acentos: "pão", "lo-fi", "google.com").
function espelho(texto) {
  const o = String(texto || '').trim();
  let n = '';
  for (const c of o.toLowerCase()) {
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    n += /^[a-z0-9]$/.test(base) ? base : ' ';
  }
  // (o "for of" percorre por caractere; se algum virar 2 unidades, cai no modo simples)
  if (n.length !== o.length) return { o: normalizar(o), n: normalizar(o) };
  return { o, n };
}

function cortar(t, re) {
  const m = re.exec(t.n);
  if (!m) return t;
  const ini = m.index;
  const fim = m.index + m[0].length;
  return { o: t.o.slice(0, ini) + t.o.slice(fim), n: t.n.slice(0, ini) + t.n.slice(fim) };
}

function aparar(t) {
  let a = 0;
  let b = t.n.length;
  while (a < b && t.n[a] === ' ') a++;
  while (b > a && t.n[b - 1] === ' ') b--;
  return { o: t.o.slice(a, b), n: t.n.slice(a, b) };
}

// Tira o nome dela, "por favor", "pra mim" etc.
function limpar(texto, cfg) {
  let t = aparar(espelho(texto));
  const nomes = [cfg.nome, cfg.escuta?.palavra_ativacao, ...(cfg.escuta?.variantes || [])].map(normalizar).filter(Boolean);
  for (const nome of nomes) t = aparar(cortar(t, new RegExp(`^(?:ei |oi |ola )?${nome}\\b`)));
  for (let i = 0; i < 3; i++) {
    t = aparar(cortar(t, /^(?:por favor|pfv|pf|eu|voce pode|vc pode|pode|consegue|da pra|quero que voce|quero que vc)\b/));
  }
  t = aparar(cortar(t, /\b(?:por favor|pra mim|para mim|pfv)\s*$/));
  return t;
}

// Grupo "alvo" da expressão: devolve o trecho original correspondente (com acentos)
function grupo(t, re) {
  const m = re.exec(t.n);
  if (!m || !m.indices?.groups?.alvo) return null;
  const [a, b] = m.indices.groups.alvo;
  return aparar({ o: t.o.slice(a, b), n: t.n.slice(a, b) });
}

function semArtigo(t) {
  return aparar(cortar(t, /^(?:o|a|os|as|um|uma|no|na|nos|nas|pro|pra|para o|para a)\b/));
}

const resposta = (fala, acoes = [], emocao = 'feliz') => ({ fala, emocao, acoes, local: true });
const VERBO_TOCAR = '(?:toca|tocar|toque|coloca|colocar|coloque|bota|botar|poe|por|quero ouvir|quero escutar)';

function interpretar(texto, cfg) {
  const t = limpar(texto, cfg);
  const n = t.n;
  if (!n) return null;
  let g;

  // Horas e data
  if (/\b(que horas sao|que hora e|me diz as horas|horas sao|qual e a hora|qual a hora)\b/.test(n)) {
    const h = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return resposta(sortear([`Agora são ${h}.`, `São ${h}!`, `Deixa eu ver... ${h}.`]), [], 'neutra');
  }
  if (/\b(que dia e hoje|qual e a data|qual a data|que data e hoje|hoje e que dia)\b/.test(n)) {
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return resposta(`Hoje é ${d}.`, [], 'neutra');
  }

  // Dança
  if (/\b(para|pare|parar|chega) de danc/.test(n)) return resposta('Tá bom, parei!', [{ tipo: 'parar_danca' }], 'relaxada');
  if (/\bdanc(a|ar|e|inha)\b|\bbora danc|\bvamos danc/.test(n)) {
    return cfg.vida?.dancar !== false
      ? resposta(sortear(['Bora dançar!', 'Olha só meus passos!', 'Adoro dançar!']), [{ tipo: 'dancar' }])
      : resposta('A dança está desligada nas configurações.', [], 'triste');
  }

  // Silêncio / não perturbe
  if (/^(fica quieta|fique quieta|silencio|nao perturbe|modo nao perturbe|cala a boca|para de falar)$/.test(n)) {
    return resposta('Tá bom, vou ficar quietinha. É só me chamar!', [{ tipo: 'nao_perturbe', valor: true }], 'relaxada');
  }

  const sites = cfg.acoes?.abrir_sites !== false;

  // YouTube: "coloca X no youtube", "pesquisa X no youtube", "toca X"
  g = grupo(t, new RegExp(`^(?:${VERBO_TOCAR}|pesquisa|procura|busca|abre|mostra|quero ver)\\s+(?<alvo>.+?)\\s+no (?:youtube|yt)$`, 'd'))
    || grupo(t, new RegExp(`^${VERBO_TOCAR}\\s+(?:(?:uma|a|o|um)\\s+)?(?:(?:musica|cancao|som|video|playlist)\\s+)?(?:(?:de|do|da)\\s+)?(?<alvo>.+)$`, 'd'));
  if (g && sites) {
    const termo = aparar(cortar(semArtigo(g), /^(?:musica|cancao|video)\b/)).o;
    if (termo) return resposta(sortear([`Procurando ${termo} no YouTube!`, `Vou colocar ${termo}!`, `Abrindo ${termo} no YouTube.`]), [{ tipo: 'youtube', termo }]);
  }

  // Pesquisa no Google
  g = grupo(t, /^(?:pesquisa|pesquisar|pesquise|procura|procurar|procure|busca|buscar|busque|googla|googlar)\s+(?:no google\s+)?(?:(?:por|sobre)\s+)?(?<alvo>.+?)(?:\s+no google)?$/d);
  if (g && sites && g.o) {
    return resposta(sortear([`Pesquisando ${g.o}!`, `Já tô procurando ${g.o}.`, `Olha o que eu achei sobre ${g.o}!`]), [{ tipo: 'pesquisar', termo: g.o }]);
  }

  // Abrir programa ou site
  g = grupo(t, /^(?:abre|abrir|abra|inicia|iniciar|inicie|executa|executar|execute|liga|ligar|entra no|entra na|entrar no|vai no|vai na|vai pro|acessa|acessar|acesse)\s+(?<alvo>.+)$/d);
  if (g) {
    const alvo = semArtigo(g);
    if (cfg.acoes?.abrir_programas !== false) {
      const prog = acharNaLista(alvo.n, cfg.programas);
      if (prog) return resposta(sortear([`Abrindo ${prog.nome}!`, `Pronto, abrindo ${prog.nome}.`, `Já vou abrir ${prog.nome}!`]), [{ tipo: 'abrir_programa', nome: prog.nome }]);
    }
    if (sites) {
      const fav = acharNaLista(alvo.n, cfg.sites_favoritos);
      if (fav) return resposta(`Abrindo ${fav.nome}!`, [{ tipo: 'abrir_site', nome: fav.nome }]);
      const conhecido = SITES_CONHECIDOS[alvo.n] || SITES_CONHECIDOS[alvo.n.replace(/\s+/g, '')];
      if (conhecido) return resposta(`Abrindo ${alvo.o}!`, [{ tipo: 'abrir_site', url: conhecido }]);
      const dominio = alvo.o.toLowerCase().replace(/\s+ponto\s+/g, '.').replace(/\s+/g, '');
      if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(dominio)) return resposta('Abrindo o site!', [{ tipo: 'abrir_site', url: 'https://' + dominio }]);
    }
    return resposta(`Não achei "${alvo.o}" na minha lista. Cadastra em Configurações, Ações, que eu passo a abrir!`, [], 'triste');
  }
  return null;
}

module.exports = { interpretar, limpar, SITES_CONHECIDOS };
