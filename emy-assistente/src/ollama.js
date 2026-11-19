'use strict';
// IA local que já vem dentro do app (Ollama). Roda numa porta própria (11435) para não
// brigar com um Ollama que a pessoa já tenha instalado, guarda os modelos na pasta de
// dados do usuário (não precisa de administrador) e mantém o modelo carregado na memória
// para responder rápido.
const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const WIN = process.platform === 'win32';

class OllamaEmbutido extends EventEmitter {
  constructor({ raiz, recursos, dadosUsuario, porta, log }) {
    super();
    const pastas = [path.join(recursos, 'ollama'), path.join(raiz, 'ollama')];
    const nomeExe = WIN ? 'ollama.exe' : path.join('bin', 'ollama');
    this.exe = pastas.map((p) => path.join(p, nomeExe)).find((p) => fs.existsSync(p)) || null;
    this.porta = porta;
    this.base = `http://127.0.0.1:${porta}`;
    this.pastaModelos = path.join(dadosUsuario, 'ollama-modelos');
    this.log = log || (() => {});
    this.proc = null;
    this.estado = this.exe ? 'parado' : 'ausente'; // parado | iniciando | pronto | baixando | erro | ausente
    this.progresso = 0;
    this.erro = '';
    this.modeloPronto = '';
    this.preparando = null;
  }

  get existe() { return !!this.exe; }

  definirEstado(estado, extra = {}) {
    this.estado = estado;
    Object.assign(this, extra);
    this.emit('estado', this.resumo());
  }

  resumo() {
    return { estado: this.estado, progresso: this.progresso, erro: this.erro, modelo: this.modeloPronto, existe: this.existe };
  }

  async api(caminho, opcoes = {}, timeoutMs = 5000) {
    return fetch(this.base + caminho, { ...opcoes, signal: AbortSignal.timeout(timeoutMs) });
  }

  async respondendo() {
    try { return (await this.api('/api/version', {}, 1500)).ok; } catch { return false; }
  }

  async iniciar({ usarPlacaDeVideo = true } = {}) {
    if (!this.exe) throw new Error('O Ollama não veio junto com esta versão do app.');
    if (await this.respondendo()) return; // já está rodando (outra janela do app ou reinício)
    this.definirEstado('iniciando');
    fs.mkdirSync(this.pastaModelos, { recursive: true });
    const env = {
      ...process.env,
      OLLAMA_HOST: `127.0.0.1:${this.porta}`,
      OLLAMA_MODELS: this.pastaModelos,
      OLLAMA_KEEP_ALIVE: '-1',          // mantém o modelo na memória enquanto o app estiver aberto
      OLLAMA_NUM_PARALLEL: '1',
      OLLAMA_MAX_LOADED_MODELS: '1',
      OLLAMA_CONTEXT_LENGTH: '4096',
      OLLAMA_NO_CLOUD: 'true',
      OLLAMA_ORIGINS: '*',
    };
    if (!usarPlacaDeVideo) {
      env.OLLAMA_VULKAN = '0';
      env.GGML_VK_VISIBLE_DEVICES = '-1';
      env.CUDA_VISIBLE_DEVICES = '-1';
    }
    this.proc = spawn(this.exe, ['serve'], { env, windowsHide: true, cwd: path.dirname(this.exe) });
    this.proc.stdout.on('data', (d) => this.log('[ollama]', d.toString().trim().slice(0, 300)));
    this.proc.stderr.on('data', (d) => {
      for (const l of d.toString().split(/\r?\n/)) if (/error|warn|inference compute|listening/i.test(l)) this.log('[ollama]', l.slice(0, 300));
    });
    this.proc.on('exit', (codigo) => {
      this.log('[ollama] saiu com código', codigo);
      this.proc = null;
      if (!this.parando) this.definirEstado('erro', { erro: `A IA local parou (código ${codigo}).` });
    });
    for (let i = 0; i < 100; i++) {
      if (await this.respondendo()) return;
      if (!this.proc) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('A IA local não iniciou. Veja o registro (log) do app.');
  }

  async temModelo(modelo) {
    const r = await this.api('/api/tags');
    const d = await r.json();
    const alvo = modelo.includes(':') ? modelo : modelo + ':latest';
    return (d.models || []).some((m) => m.name === alvo || m.model === alvo);
  }

  async baixar(modelo) {
    this.definirEstado('baixando', { progresso: 0, erro: '' });
    const r = await fetch(this.base + '/api/pull', { method: 'POST', body: JSON.stringify({ model: modelo, stream: true }) });
    if (!r.ok) throw new Error(`Não consegui baixar o modelo (${r.status}).`);
    const partes = new Map();
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    let ultimoAviso = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      let q;
      while ((q = buffer.indexOf('\n')) >= 0) {
        const linha = buffer.slice(0, q).trim();
        buffer = buffer.slice(q + 1);
        if (!linha) continue;
        let j;
        try { j = JSON.parse(linha); } catch { continue; }
        if (j.error) throw new Error(j.error);
        if (j.digest && j.total) partes.set(j.digest, { total: j.total, feito: j.completed || 0 });
        const total = [...partes.values()].reduce((a, p) => a + p.total, 0);
        const feito = [...partes.values()].reduce((a, p) => a + p.feito, 0);
        const pct = total ? Math.floor((feito / total) * 100) : 0;
        if (pct !== this.progresso && Date.now() - ultimoAviso > 400) {
          ultimoAviso = Date.now();
          this.definirEstado('baixando', { progresso: pct, totalBytes: total });
        }
      }
    }
    if (!(await this.temModelo(modelo))) throw new Error('O download do modelo não terminou.');
  }

  // Carrega o modelo na memória agora, para a primeira pergunta não demorar.
  async aquecer(modelo) {
    try {
      await this.api('/api/generate', { method: 'POST', body: JSON.stringify({ model: modelo, prompt: '', keep_alive: -1 }) }, 120000);
    } catch (e) {
      this.log('[ollama] aquecimento falhou:', e.message);
    }
  }

  // Deixa tudo pronto para usar o modelo (inicia, baixa se precisar e aquece).
  preparar(modelo, opcoes) {
    if (this.preparando && this.preparando.modelo === modelo) return this.preparando.promessa;
    const promessa = (async () => {
      try {
        await this.iniciar(opcoes);
        if (!(await this.temModelo(modelo))) {
          this.log('[ollama] baixando modelo', modelo);
          await this.baixar(modelo);
        }
        await this.aquecer(modelo);
        this.definirEstado('pronto', { modeloPronto: modelo, progresso: 100, erro: '' });
      } catch (e) {
        this.log('[ollama] erro:', e.message);
        this.definirEstado('erro', { erro: e.message });
        throw e;
      } finally {
        this.preparando = null;
      }
    })();
    this.preparando = { modelo, promessa };
    promessa.catch(() => {});
    return promessa;
  }

  async reiniciar(opcoes) {
    this.parar();
    await new Promise((r) => setTimeout(r, 800));
    this.parando = false;
    await this.iniciar(opcoes);
  }

  parar() {
    this.parando = true;
    if (this.proc) {
      try { this.proc.kill(); } catch { /* já saiu */ }
      this.proc = null;
    }
  }
}

module.exports = { OllamaEmbutido };
