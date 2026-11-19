'use strict';
// Biblioteca de modelos VRM: a personagem pode trocar de corpo a qualquer momento.
// Os modelos vêm de duas pastas:
//   - "app":     a pasta modelos/ que acompanha o programa (só leitura no instalador)
//   - "usuario": modelos adicionados pela pessoa (ficam na pasta de dados do app)
// O id de um modelo é "<origem>/<arquivo>", ex.: "usuario/minha-personagem.vrm".
const fs = require('fs');
const path = require('path');

const MAGICO_GLB = 0x46546c67;   // "glTF"
const BLOCO_JSON = 0x4e4f534a;   // "JSON"
const LIMITE_JSON = 64 * 1024 * 1024;
const LIMITE_MINIATURA = 3 * 1024 * 1024;

const cache = new Map(); // caminho -> { mtime, info }

// Lê só o cabeçalho do arquivo (rápido mesmo em modelos de 50 MB).
function lerInfo(caminho) {
  const st = fs.statSync(caminho);
  const salvo = cache.get(caminho);
  if (salvo && salvo.mtime === st.mtimeMs) return salvo.info;

  const fd = fs.openSync(caminho, 'r');
  try {
    const cab = Buffer.alloc(20);
    fs.readSync(fd, cab, 0, 20, 0);
    if (cab.readUInt32LE(0) !== MAGICO_GLB) throw new Error('não é um arquivo VRM/GLB');
    const tamJson = cab.readUInt32LE(12);
    if (cab.readUInt32LE(16) !== BLOCO_JSON || tamJson > LIMITE_JSON) throw new Error('arquivo VRM danificado');
    const bj = Buffer.alloc(tamJson);
    fs.readSync(fd, bj, 0, tamJson, 20);
    const json = JSON.parse(bj.toString('utf8'));
    const ext = json.extensions || {};

    let versao;
    let titulo = '';
    let autor = '';
    let licenca = '';
    let imagem = null;
    if (ext.VRMC_vrm) {
      versao = '1.0';
      const m = ext.VRMC_vrm.meta || {};
      titulo = m.name || '';
      autor = (m.authors || []).join(', ');
      licenca = m.licenseUrl || '';
      imagem = m.thumbnailImage ?? null;
    } else if (ext.VRM) {
      versao = '0.x';
      const m = ext.VRM.meta || {};
      titulo = m.title || '';
      autor = m.author || '';
      licenca = m.licenseName || '';
      if (m.texture != null && json.textures?.[m.texture]) imagem = json.textures[m.texture].source ?? null;
    } else {
      throw new Error('o arquivo não tem dados de VRM (é um GLB comum?)');
    }

    let miniatura = null;
    const img = imagem != null ? json.images?.[imagem] : null;
    if (img && img.bufferView != null) {
      const bv = json.bufferViews?.[img.bufferView];
      if (bv && bv.byteLength <= LIMITE_MINIATURA) {
        const inicioBin = 20 + tamJson + 8;
        const b = Buffer.alloc(bv.byteLength);
        fs.readSync(fd, b, 0, bv.byteLength, inicioBin + (bv.byteOffset || 0));
        miniatura = `data:${img.mimeType || 'image/png'};base64,${b.toString('base64')}`;
      }
    }
    const info = { versao, titulo, autor, licenca, miniatura, bytes: st.size };
    cache.set(caminho, { mtime: st.mtimeMs, info });
    return info;
  } finally {
    fs.closeSync(fd);
  }
}

class Modelos {
  constructor({ pastaApp, pastaUsuario }) {
    this.pastas = { app: pastaApp, usuario: pastaUsuario };
  }

  caminho(id) {
    if (!id) return null;
    const [origem, ...resto] = id.includes('/') ? id.split('/') : ['usuario', id];
    const arquivo = resto.join('/');
    const pasta = this.pastas[origem];
    if (!pasta || !arquivo || arquivo !== path.basename(arquivo)) return null;
    const p = path.join(pasta, arquivo);
    return fs.existsSync(p) ? p : null;
  }

  normalizarId(id) {
    if (!id) return '';
    return id.includes('/') ? id : 'usuario/' + id; // configurações antigas guardavam só o nome
  }

  listar() {
    const lista = [];
    for (const [origem, pasta] of Object.entries(this.pastas)) {
      let arquivos = [];
      try { arquivos = fs.readdirSync(pasta).filter((n) => n.toLowerCase().endsWith('.vrm')); } catch { /* pasta não existe */ }
      for (const arquivo of arquivos.sort((a, b) => a.localeCompare(b))) {
        const id = `${origem}/${arquivo}`;
        const base = { id, arquivo, origem, removivel: origem === 'usuario' };
        try {
          const info = lerInfo(path.join(pasta, arquivo));
          lista.push({ ...base, ...info, titulo: info.titulo || path.parse(arquivo).name });
        } catch (e) {
          lista.push({ ...base, titulo: path.parse(arquivo).name, erro: e.message });
        }
      }
    }
    return lista;
  }

  // Modelo em uso: o escolhido nas configurações, ou emy.vrm, ou o primeiro que existir.
  ativo(cfg) {
    const escolhido = this.normalizarId(cfg.modelo_vrm);
    if (escolhido && this.caminho(escolhido)) return escolhido;
    const lista = this.listar().filter((m) => !m.erro);
    const padrao = lista.find((m) => m.origem === 'app' && m.arquivo.toLowerCase() === 'emy.vrm');
    return (padrao || lista[0])?.id || null;
  }

  url(id) {
    const c = this.caminho(id);
    if (!c) return null;
    const [origem] = id.split('/');
    const arquivo = encodeURIComponent(path.basename(c));
    return origem === 'app' ? `emy://app/__recursos/modelos/${arquivo}` : `emy://app/__usuario/${arquivo}`;
  }

  // Copia arquivos .vrm para a pasta do usuário. Devolve os ids adicionados e os erros.
  adicionar(caminhos) {
    const adicionados = [];
    const erros = [];
    fs.mkdirSync(this.pastas.usuario, { recursive: true });
    for (const origem of caminhos || []) {
      const nome = path.basename(origem);
      try {
        if (!nome.toLowerCase().endsWith('.vrm')) throw new Error('o arquivo precisa ser .vrm');
        lerInfo(origem); // valida antes de copiar
        const { name, ext } = path.parse(nome);
        let destino = nome;
        for (let i = 2; fs.existsSync(path.join(this.pastas.usuario, destino)); i++) destino = `${name} (${i})${ext}`;
        fs.copyFileSync(origem, path.join(this.pastas.usuario, destino));
        adicionados.push('usuario/' + destino);
      } catch (e) {
        erros.push(`${nome}: ${e.message}`);
      }
    }
    return { adicionados, erros };
  }

  remover(id) {
    if (!id || !id.startsWith('usuario/')) return false;
    const c = this.caminho(id);
    if (!c) return false;
    fs.unlinkSync(c);
    cache.delete(c);
    return true;
  }
}

module.exports = { Modelos, lerInfo };
