// Detecta música tocando no computador (áudio do sistema, via loopback no Windows)
// e estima o andamento (BPM) e o momento das batidas para a dança ficar no ritmo.
// Para diferenciar música de outros sons (vídeo falado, jogo), exige batidas regulares.

export class DetectorMusica {
  constructor({ aoComecar, aoParar } = {}) {
    this.aoComecar = aoComecar;
    this.aoParar = aoParar;
    this.stream = null;
    this.timer = null;
    this.tocando = false;
    this.pausado = false;
    this.sensibilidade = 0.5;
  }

  get ativo() { return !!this.stream; }

  async iniciar(sensibilidade = 0.5) {
    this.sensibilidade = sensibilidade;
    if (this.stream) return true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      // Só precisamos do som: desliga o vídeo para economizar processamento.
      stream.getVideoTracks().forEach((t) => {
        t.enabled = false;
        t.applyConstraints?.({ frameRate: 1, width: 16, height: 16 }).catch(() => {});
      });
      this.stream = stream;
      this.ctx = new AudioContext();
      const fonte = this.ctx.createMediaStreamSource(stream);
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 2048;
      this.an.smoothingTimeConstant = 0;
      fonte.connect(this.an); // não liga na saída: nada de eco
      this.freq = new Uint8Array(this.an.frequencyBinCount);
      this.reiniciarContadores();
      this.ultimo = performance.now() / 1000;
      this.timer = setInterval(() => this.analisar(), 23);
      return true;
    } catch (e) {
      console.warn('Captura do áudio do sistema indisponível:', e.message);
      return false;
    }
  }

  parar() {
    clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    if (this.tocando) { this.tocando = false; this.aoParar?.(); }
  }

  // Enquanto a personagem fala, a voz dela também sai no áudio do sistema: ignoramos.
  pausar(v) {
    this.pausado = v;
  }

  reiniciarContadores() {
    this.graveAnterior = 0;
    this.mediaFluxo = 0;
    this.batidas = [];
    this.ultimaBatida = 0;
    this.tempoComSom = 0;
    this.tempoSemSom = 0;
    this.bpm = 0;
    this.regularidade = 0;
  }

  analisar() {
    const agora = performance.now() / 1000;
    const dt = Math.min(0.2, agora - this.ultimo);
    this.ultimo = agora;
    if (this.pausado) return;

    this.an.getByteFrequencyData(this.freq);
    const hzPorBin = this.ctx.sampleRate / this.an.fftSize;
    const media = (de, ate) => {
      const a = Math.max(1, Math.floor(de / hzPorBin));
      const b = Math.max(a + 1, Math.ceil(ate / hzPorBin));
      let s = 0;
      for (let i = a; i < b; i++) s += this.freq[i];
      return s / (b - a);
    };
    const grave = media(40, 160);
    const geral = media(40, 8000) / 255;

    // Detecção de batida: subida brusca de energia nos graves
    const fluxo = Math.max(0, grave - this.graveAnterior);
    this.graveAnterior = grave;
    this.mediaFluxo = this.mediaFluxo * 0.96 + fluxo * 0.04;
    const s = this.sensibilidade;
    if (fluxo > this.mediaFluxo * (2.6 - s) + 3 && grave > 70 - 30 * s && agora - this.ultimaBatida > 0.26) {
      this.ultimaBatida = agora;
      this.batidas.push(agora);
      if (this.batidas.length > 16) this.batidas.shift();
      this.calcularRitmo();
    }

    const temSom = geral > 0.16 - 0.08 * s;
    if (temSom) { this.tempoComSom += dt; this.tempoSemSom = 0; }
    else { this.tempoSemSom += dt; this.tempoComSom = Math.max(0, this.tempoComSom - dt * 2); }

    if (!this.tocando && this.tempoComSom > 3.5 && this.batidas.length >= 6 && this.regularidade >= 0.55 - 0.15 * s) {
      this.tocando = true;
      this.aoComecar?.();
    } else if (this.tocando && (this.tempoSemSom > 2.5 || agora - this.ultimaBatida > 4)) {
      this.tocando = false;
      this.batidas = [];
      this.aoParar?.();
    }
  }

  calcularRitmo() {
    const b = this.batidas;
    if (b.length < 5) return;
    const intervalos = [];
    for (let i = 1; i < b.length; i++) intervalos.push(b[i] - b[i - 1]);
    const ordenados = [...intervalos].sort((x, y) => x - y);
    let periodo = ordenados[Math.floor(ordenados.length / 2)];
    while (periodo < 60 / 170) periodo *= 2;
    while (periodo > 60 / 75) periodo /= 2;
    // Quantos intervalos "batem" com o período (ou metade/dobro dele)?
    let bons = 0;
    for (const it of intervalos) {
      const razao = it / periodo;
      const maisPerto = Math.max(0.5, Math.round(razao * 2) / 2);
      if (Math.abs(razao - maisPerto) / maisPerto < 0.15) bons++;
    }
    this.regularidade = bons / intervalos.length;
    const novoBpm = 60 / periodo;
    this.bpm = this.bpm ? this.bpm * 0.7 + novoBpm * 0.3 : novoBpm;
  }

  ritmo() {
    if (!this.tocando || !this.bpm) return null;
    return { bpm: this.bpm, ultimaBatida: this.ultimaBatida };
  }
}
