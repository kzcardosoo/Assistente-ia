'use strict';
// Ações que a assistente pode executar no computador. Tudo passa por aqui e só
// acontece se estiver liberado nas configurações. Programas só abrem se estiverem
// na lista cadastrada pela própria pessoa.
const { shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function acharNaLista(nome, mapa) {
  const alvo = normalizar(nome);
  if (!alvo) return null;
  const chaves = Object.keys(mapa || {});
  let achou = chaves.find((k) => normalizar(k) === alvo);
  if (!achou) achou = chaves.find((k) => alvo.includes(normalizar(k)) || normalizar(k).includes(alvo));
  return achou ? { nome: achou, valor: mapa[achou] } : null;
}

function urlSegura(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

async function abrirUrl(url) {
  const segura = urlSegura(url);
  if (!segura) return false;
  await shell.openExternal(segura);
  return true;
}

async function abrirPrograma(item) {
  const prog = typeof item === 'string' ? { caminho: item, args: [] } : item || {};
  const caminho = String(prog.caminho || '').trim();
  const args = Array.isArray(prog.args) ? prog.args.map(String) : [];
  if (!caminho) return false;
  // Caminho completo sem argumentos: openPath entende .exe, atalhos .lnk, .app e pastas.
  if (path.isAbsolute(caminho) && args.length === 0) {
    const erro = await shell.openPath(caminho);
    return !erro;
  }
  return new Promise((resolve) => {
    try {
      const p = spawn(caminho, args, { detached: true, stdio: 'ignore', windowsHide: false });
      p.once('error', () => resolve(false));
      p.once('spawn', () => { p.unref(); resolve(true); });
    } catch { resolve(false); }
  });
}

// Executa uma ação vinda da IA. Retorna { ok, descricao, renderer? }.
async function executar(acao, cfg) {
  const tipo = acao?.tipo;
  try {
    switch (tipo) {
      case 'pesquisar': {
        if (!cfg.acoes.abrir_sites || !acao.termo) return { ok: false };
        await abrirUrl('https://www.google.com/search?q=' + encodeURIComponent(acao.termo));
        return { ok: true, descricao: 'pesquisou ' + acao.termo };
      }
      case 'youtube': {
        if (!cfg.acoes.abrir_sites || !acao.termo) return { ok: false };
        await abrirUrl('https://www.youtube.com/results?search_query=' + encodeURIComponent(acao.termo));
        return { ok: true, descricao: 'abriu o YouTube: ' + acao.termo };
      }
      case 'abrir_site': {
        if (!cfg.acoes.abrir_sites) return { ok: false };
        let url = acao.url;
        const fav = acharNaLista(acao.nome || acao.url, cfg.sites_favoritos);
        if (fav && (!url || !urlSegura(url))) url = fav.valor;
        if (url && !/^https?:\/\//i.test(url) && /^[\w-]+(\.[\w-]+)+/.test(url)) url = 'https://' + url;
        const ok = await abrirUrl(url);
        return { ok, descricao: ok ? 'abriu ' + url : 'url inválida' };
      }
      case 'abrir_programa': {
        if (!cfg.acoes.abrir_programas) return { ok: false };
        const prog = acharNaLista(acao.nome, cfg.programas);
        if (!prog) return { ok: false, descricao: 'programa fora da lista: ' + acao.nome };
        const ok = await abrirPrograma(prog.valor);
        return { ok, descricao: (ok ? 'abriu ' : 'falhou ao abrir ') + prog.nome };
      }
      case 'dancar':
        return cfg.vida.dancar ? { ok: true, renderer: 'dancar' } : { ok: false };
      case 'acenar':
        return { ok: true, renderer: 'acenar' };
      default:
        return { ok: false };
    }
  } catch (e) {
    return { ok: false, descricao: e.message };
  }
}

// Comandos simples entendidos sem IA (usados quando a IA não está configurada ou falhou).
function comandoLocal(texto, cfg) {
  const t = normalizar(texto);
  let m = t.match(/^(?:por favor )?(?:abr[ea]|abrir|inici[ae]|iniciar|execut[ae]|executar|liga|ligar)\s+(?:o |a |os |as )?(.+)$/);
  if (m) {
    const alvo = m[1].replace(/ (pra|para) mim$/, '');
    const prog = cfg.acoes.abrir_programas && acharNaLista(alvo, cfg.programas);
    if (prog) return { fala: `Abrindo ${prog.nome}!`, emocao: 'feliz', acoes: [{ tipo: 'abrir_programa', nome: prog.nome }] };
    const site = cfg.acoes.abrir_sites && acharNaLista(alvo, cfg.sites_favoritos);
    if (site) return { fala: `Abrindo ${site.nome}!`, emocao: 'feliz', acoes: [{ tipo: 'abrir_site', nome: site.nome }] };
  }
  m = t.match(/^(?:pesquis[ae]|pesquisar|procur[ae]|procurar|busc[ae]|buscar)\s+(?:por |sobre )?(.+)$/);
  if (m && cfg.acoes.abrir_sites) return { fala: 'Pesquisando agora!', emocao: 'feliz', acoes: [{ tipo: 'pesquisar', termo: m[1] }] };
  m = t.match(/^(?:toca|tocar|coloca|bota)\s+(.+)$/);
  if (m && cfg.acoes.abrir_sites) return { fala: 'Vou procurar no YouTube!', emocao: 'feliz', acoes: [{ tipo: 'youtube', termo: m[1] }] };
  if (/\bdanc(a|ar|e)\b/.test(t) && cfg.vida.dancar) return { fala: 'Bora dançar!', emocao: 'feliz', acoes: [{ tipo: 'dancar' }] };
  return null;
}

module.exports = { executar, comandoLocal, normalizar, acharNaLista, abrirUrl, abrirPrograma };
