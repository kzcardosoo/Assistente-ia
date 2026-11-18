// Toca a voz da personagem e calcula a abertura da boca a partir do som (lip sync).
// Se o módulo de voz em Python não estiver disponível, usa a voz do próprio sistema.

const NOMES_FEMININOS = /francisca|thalita|maria|luciana|vitoria|vitória|leila|raquel|female|feminin|google português do brasil/i;

export class Fala {
  constructor({ aoIniciar, aoTerminar } = {}) {
    this.aoIniciar = aoIniciar;
    this.aoTerminar = aoTerminar;
    this.ctx = null;
    this.audio = null;
    this.analisador = null;
    this.freq = null;
    this.url = null;
    this.ativa = false;
    this.navegador = false;
    this.vozes = [];
    if ('speechSynthesis' in window) {
      const carregar = () => { this.vozes = speechSynthesis.getVoices(); };
      carregar();
      speechSynthesis.addEventListener('voiceschanged', carregar);
    }
  }

  contexto() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async tocar(dados, mime = 'audio/mpeg', volume = 1) {
    this.interromper();
    const ctx = this.contexto();
    const blob = new Blob([dados], { type: mime });
    this.url = URL.createObjectURL(blob);
    const audio = new Audio(this.url);
    const fonte = ctx.createMediaElementSource(audio);
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    analisador.smoothingTimeConstant = 0.45;
    const ganho = ctx.createGain();
    ganho.gain.value = Math.max(0, Math.min(1.5, Number(volume) || 1));
    fonte.connect(analisador);
    analisador.connect(ganho);
    ganho.connect(ctx.destination);
    this.audio = audio;
    this.analisador = analisador;
    this.freq = new Uint8Array(analisador.frequencyBinCount);
    this.navegador = false;
    audio.onended = () => this.terminar();
    audio.onerror = () => this.terminar();
    this.ativa = true;
    this.aoIniciar?.();
    try {
      await audio.play();
    } catch (e) {
      console.warn('Não consegui tocar o áudio:', e.message);
      this.terminar();
    }
  }

  escolherVoz() {
    const pt = this.vozes.filter((v) => /^pt[-_]BR/i.test(v.lang));
    return pt.find((v) => NOMES_FEMININOS.test(v.name)) || pt[0] ||
      this.vozes.find((v) => /^pt/i.test(v.lang)) || null;
  }

  falarNavegador(texto, { volume = 1, velocidade = 0, tom = 0 } = {}) {
    if (!('speechSynthesis' in window) || !texto) return;
    this.interromper();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR';
    const voz = this.escolherVoz();
    if (voz) u.voice = voz;
    u.rate = Math.max(0.5, Math.min(2, 1 + Number(velocidade || 0) / 100));
    u.pitch = Math.max(0, Math.min(2, 1.1 + Number(tom || 0) / 60));
    u.volume = Math.max(0, Math.min(1, Number(volume) || 1));
    u.onstart = () => { this.ativa = true; this.navegador = true; this.aoIniciar?.(); };
    u.onend = () => this.terminar();
    u.onerror = () => this.terminar();
    speechSynthesis.speak(u);
    // Alguns sistemas não disparam onstart: garante o estado
    setTimeout(() => { if (speechSynthesis.speaking && !this.ativa) u.onstart(); }, 300);
  }

  terminar() {
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.audio = null;
    this.analisador = null;
    if (!this.ativa) return;
    this.ativa = false;
    this.navegador = false;
    this.aoTerminar?.();
  }

  interromper() {
    if (this.audio) { try { this.audio.pause(); } catch { /* ignore */ } }
    if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
    this.terminar();
  }

  // Valores das formas de boca (aa, ih, ou, ee, oh) para o quadro atual.
  boca() {
    const zero = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    if (!this.ativa) return zero;
    if (this.navegador) {
      const t = performance.now() / 1000;
      const v = Math.max(0, Math.sin(t * 13) * 0.5 + Math.sin(t * 7.7) * 0.3 + 0.25);
      return { aa: v * 0.7, ih: 0, ou: 0, ee: 0, oh: v * 0.2 };
    }
    if (!this.analisador) return zero;
    this.analisador.getByteFrequencyData(this.freq);
    const hzPorBin = this.ctx.sampleRate / this.analisador.fftSize;
    let soma = 0;
    let pesoFreq = 0;
    const ini = Math.floor(90 / hzPorBin);
    const fim = Math.min(this.freq.length, Math.ceil(4000 / hzPorBin));
    for (let i = ini; i < fim; i++) {
      soma += this.freq[i];
      pesoFreq += this.freq[i] * i * hzPorBin;
    }
    const energia = Math.min(1, Math.max(0, (soma / (fim - ini) / 255 - 0.08) * 3.2));
    if (energia < 0.04) return zero;
    const centro = pesoFreq / Math.max(1, soma); // "brilho" do som: ajuda a escolher a vogal
    if (centro < 900) return { aa: energia * 0.45, ih: 0, ou: energia * 0.35, ee: 0, oh: energia * 0.55 };
    if (centro < 1500) return { aa: energia * 0.85, ih: 0, ou: 0, ee: 0, oh: energia * 0.15 };
    return { aa: energia * 0.35, ih: energia * 0.35, ou: 0, ee: energia * 0.5, oh: 0 };
  }
}
