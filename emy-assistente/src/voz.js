'use strict';
// Gerencia o módulo de voz em Python (python/voz.py): microfone, palavra de ativação,
// transcrição (Whisper/Vosk) e voz (Edge TTS/Kokoro). A conversa é feita por linhas
// JSON no stdin/stdout do processo.
const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WIN = process.platform === 'win32';

class Voz extends EventEmitter {
  constructor({ raiz, recursos, dadosUsuario }) {
    super();
    this.dirPython = fs.existsSync(path.join(recursos, 'python')) ? path.join(recursos, 'python') : path.join(raiz, 'python');
    this.script = path.join(this.dirPython, 'voz.py');
    this.dadosUsuario = dadosUsuario;
    this.proc = null;
    this.disponivel = false;
    this.recursos = {};
    this.erro = '';
    this.parando = false;
    this.reinicios = 0;
    this.ultimasLinhasErro = [];
    this.esperas = new Map();
  }

  candidatos(cfg) {
    const lista = [];
    if (cfg.python) lista.push({ cmd: cfg.python, args: [this.script] });
    // Versão portátil: Python que já vem dentro do app (-E -s: ignora qualquer Python instalado no PC)
    const embutido = path.join(this.dirPython, 'runtime', WIN ? 'python.exe' : 'bin/python3');
    lista.push({ cmd: embutido, args: ['-E', '-s', '-X', 'utf8', this.script], absoluto: true });
    const exe = path.join(this.dirPython, 'dist', 'voz', WIN ? 'voz.exe' : 'voz');
    lista.push({ cmd: exe, args: [], absoluto: true });
    const venv = path.join(this.dirPython, '.venv', WIN ? 'Scripts/python.exe' : 'bin/python');
    lista.push({ cmd: venv, args: [this.script], absoluto: true });
    if (WIN) {
      lista.push({ cmd: 'py', args: ['-3', this.script] });
      lista.push({ cmd: 'python', args: [this.script] });
    } else {
      lista.push({ cmd: 'python3', args: [this.script] });
      lista.push({ cmd: 'python', args: [this.script] });
    }
    return lista;
  }

  dadosParaPython(cfg) {
    const pastaModelos = path.join(this.dirPython, 'modelos');
    let vosk = '';
    try {
      const pasta = fs.readdirSync(pastaModelos).find((n) => n.startsWith('vosk-model') && fs.statSync(path.join(pastaModelos, n)).isDirectory());
      if (pasta) vosk = path.join(pastaModelos, pasta);
    } catch { /* sem modelos */ }
    return {
      nome: cfg.nome,
      escuta: cfg.escuta,
      voz: cfg.voz,
      modelo_vosk: vosk,
      pasta_modelos: pastaModelos,
      pasta_whisper: path.join(this.dadosUsuario, 'whisper'),
      pasta_temp: path.join(this.dadosUsuario, 'audio'),
    };
  }

  iniciar(cfg) {
    this.cfg = cfg;
    this.parando = false;
    const arq = path.join(this.dadosUsuario, 'voz-config.json');
    fs.mkdirSync(this.dadosUsuario, { recursive: true });
    fs.writeFileSync(arq, JSON.stringify(this.dadosParaPython(cfg)), 'utf8');
    this.arqConfig = arq;
    this._tentar(this.candidatos(cfg), 0);
  }

  _tentar(lista, i) {
    if (i >= lista.length) {
      this.disponivel = false;
      const detalhe = this.ultimasLinhasErro.slice(-3).join(' | ');
      this.erro = 'Módulo de voz indisponível. Instale o Python e rode o instalador (instalar.bat).' + (detalhe ? ' Detalhe: ' + detalhe : '');
      this.emit('indisponivel', this.erro);
      return;
    }
    const c = lista[i];
    if (c.absoluto && !fs.existsSync(c.cmd)) return this._tentar(lista, i + 1);

    let avancou = false;
    const proximo = () => { if (!avancou) { avancou = true; this._tentar(lista, i + 1); } };
    let proc;
    try {
      proc = spawn(c.cmd, [...c.args, '--config', this.arqConfig], {
        cwd: this.dirPython,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' },
      });
    } catch {
      return proximo();
    }
    let iniciou = false;
    proc.on('error', () => { if (!iniciou) proximo(); });
    readline.createInterface({ input: proc.stderr }).on('line', (linha) => {
      if (!linha.trim()) return;
      this.ultimasLinhasErro.push(linha);
      this.ultimasLinhasErro = this.ultimasLinhasErro.slice(-20);
      this.emit('log', linha);
    });
    readline.createInterface({ input: proc.stdout }).on('line', (linha) => {
      let msg;
      try { msg = JSON.parse(linha); } catch { this.emit('log', linha); return; }
      if (!iniciou && msg.tipo === 'pronto') {
        iniciou = true;
        avancou = true;
        this.proc = proc;
        this.disponivel = true;
        this.reinicios = 0;
        this.recursos = msg.recursos || {};
        this.emit('pronto', this.recursos);
        return;
      }
      this._mensagem(msg);
    });
    proc.on('exit', (codigo) => {
      if (!iniciou) return proximo();
      this.disponivel = false;
      this.proc = null;
      if (this.parando) return;
      if (this.reinicios < 3) {
        this.reinicios += 1;
        this.emit('log', `módulo de voz saiu (código ${codigo}); reiniciando...`);
        setTimeout(() => this.iniciar(this.cfg), 2000);
      } else {
        this.erro = 'O módulo de voz parou várias vezes. Veja os detalhes no terminal.';
        this.emit('indisponivel', this.erro);
      }
    });
  }

  _mensagem(msg) {
    switch (msg.tipo) {
      case 'recursos':
        this.recursos = msg.recursos || this.recursos;
        this.emit('recursos', this.recursos);
        break;
      case 'microfones': {
        const espera = this.esperas.get('microfones');
        if (espera) { espera(msg.lista || []); this.esperas.delete('microfones'); }
        break;
      }
      default:
        this.emit(msg.tipo, msg);
    }
  }

  enviar(obj) {
    if (!this.proc || !this.proc.stdin.writable) return false;
    try { this.proc.stdin.write(JSON.stringify(obj) + '\n'); return true; } catch { return false; }
  }

  configurar(cfg) {
    this.cfg = cfg;
    this.enviar({ tipo: 'config', dados: this.dadosParaPython(cfg) });
  }

  listarMicrofones() {
    return new Promise((resolve) => {
      if (!this.enviar({ tipo: 'listar_microfones' })) return resolve([]);
      const t = setTimeout(() => { this.esperas.delete('microfones'); resolve([]); }, 5000);
      this.esperas.set('microfones', (lista) => { clearTimeout(t); resolve(lista); });
    });
  }

  parar() {
    this.parando = true;
    if (!this.proc) return;
    this.enviar({ tipo: 'sair' });
    const p = this.proc;
    setTimeout(() => { try { p.kill(); } catch { /* já saiu */ } }, 1500);
  }
}

module.exports = { Voz };
