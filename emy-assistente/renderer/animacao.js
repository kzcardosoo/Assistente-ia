// Animações procedurais da personagem: respirar, trocar o peso das pernas, andar (normal ou
// saltitando), dançar no ritmo com vários passos, acenar, pensar, dormir, ser arrastada...
// Tudo é calculado por código sobre o esqueleto padrão do VRM, então funciona com qualquer
// modelo. Se houver arquivos .vrma na pasta "animacoes", eles são usados no lugar.
//
// Convenções dos ossos "normalizados" do VRM (modelo olhando para a câmera):
//   braço esquerdo:  z negativo abaixa o braço; x negativo leva o braço para a frente
//   braço direito:   z positivo abaixa o braço; x negativo leva o braço para a frente
//   antebraço:       esquerdo y negativo / direito y positivo dobram o cotovelo para a frente
//   perna (coxa):    x negativo leva a perna para a frente; joelho: x positivo dobra
//   coluna/cabeça:   x positivo inclina para a frente; y gira (positivo = para a esquerda dela)
import * as THREE from 'three';

const OSSOS = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
];
const DEDOS = ['Index', 'Middle', 'Ring', 'Little'];
const FALANGES = ['Proximal', 'Intermediate', 'Distal'];
for (const lado of ['left', 'right']) {
  for (const d of DEDOS) for (const f of FALANGES) OSSOS.push(`${lado}${d}${f}`);
  for (const f of ['Metacarpal', 'Proximal', 'Distal']) OSSOS.push(`${lado}Thumb${f}`);
}

const TAU = Math.PI * 2;
const sortear = (l) => l[Math.floor(Math.random() * l.length)];
const suavizar = (x) => x * x * (3 - 2 * x);
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

function somar(p, osso, x = 0, y = 0, z = 0) {
  const v = p[osso] || (p[osso] = [0, 0, 0]);
  v[0] += x; v[1] += y; v[2] += z;
}

// Move o osso em direção a uma rotação absoluta, com peso w (0..1).
function fixar(p, osso, alvo, w = 1) {
  const v = p[osso] || (p[osso] = [0, 0, 0]);
  for (let i = 0; i < 3; i++) v[i] += (alvo[i] - v[i]) * w;
}

// Mão: dobra os dedos (0 = aberta, 1 = fechada). Sinal oposto para cada lado.
function dedos(p, lado, fechar, w = 1) {
  const s = lado === 'left' ? -1 : 1;
  const forca = { Index: 0.8, Middle: 0.95, Ring: 1.05, Little: 1.15 };
  for (const d of DEDOS) {
    fixar(p, `${lado}${d}Proximal`, [0, 0, s * 0.9 * fechar * forca[d]], w);
    fixar(p, `${lado}${d}Intermediate`, [0, 0, s * 1.1 * fechar * forca[d]], w);
    fixar(p, `${lado}${d}Distal`, [0, 0, s * 0.7 * fechar * forca[d]], w);
  }
  fixar(p, `${lado}ThumbProximal`, [0, s * -0.25 * fechar, s * 0.2 * fechar], w);
  fixar(p, `${lado}ThumbDistal`, [0, 0, s * 0.4 * fechar], w);
}

// ---------------------------------------------------------------- gestos (por cima da pose)
const GESTOS = {
  acenar: {
    duracao: 2.6,
    aplicar(p, t, w) {
      fixar(p, 'rightUpperArm', [-0.15, 0.35, 0.2], w);
      fixar(p, 'rightLowerArm', [0, 0.1, -1.9 + 0.38 * Math.sin(t * 11)], w);
      fixar(p, 'rightHand', [0, 0, -0.15 + 0.1 * Math.sin(t * 11 + 0.6)], w);
      dedos(p, 'right', 0.05, w);
      somar(p, 'rightShoulder', 0, 0, -0.1 * w);
      somar(p, 'head', 0, -0.06 * w, -0.12 * w);
      somar(p, 'chest', 0, -0.06 * w, 0.03 * w);
    },
    expressao: 'happy',
  },
  reagir: {
    duracao: 1.0,
    aplicar(p, t, w, prog) {
      const pulo = Math.sin(Math.min(1, prog * 1.6) * Math.PI);
      p._y += 0.04 * pulo * w;
      somar(p, 'leftUpperArm', 0, 0, 0.5 * pulo * w);
      somar(p, 'rightUpperArm', 0, 0, -0.5 * pulo * w);
      somar(p, 'leftLowerLeg', 0.4 * pulo * w, 0, 0);
      somar(p, 'rightLowerLeg', 0.4 * pulo * w, 0, 0);
      somar(p, 'head', -0.08 * pulo * w, 0, 0.1 * w);
    },
    expressao: 'happy',
  },
  inclinar: {
    duracao: 2.8,
    aplicar(p, t, w) {
      somar(p, 'head', 0.03 * w, 0.08 * w, 0.24 * w);
      somar(p, 'neck', 0, 0, 0.08 * w);
      somar(p, 'chest', 0, 0, -0.04 * w);
      somar(p, 'hips', 0, 0, 0.03 * w);
    },
  },
  maos_atras: {
    duracao: 6,
    aplicar(p, t, w) {
      fixar(p, 'leftUpperArm', [0.4, 0, -1.3], w);
      fixar(p, 'rightUpperArm', [0.4, 0, 1.3], w);
      fixar(p, 'leftLowerArm', [0, 1.1, 0], w);
      fixar(p, 'rightLowerArm', [0, -1.1, 0], w);
      somar(p, 'chest', -0.06 * w, 0, 0);
      somar(p, 'head', -0.04 * w, 0, 0);
      const balanco = Math.sin(t * 1.4);
      somar(p, 'hips', 0, 0.05 * balanco * w, 0.02 * balanco * w);
      somar(p, 'spine', 0, -0.04 * balanco * w, 0);
    },
  },
  alongar: {
    duracao: 3.4,
    aplicar(p, t, w) {
      fixar(p, 'leftUpperArm', [0, 0, 1.3], w);
      fixar(p, 'rightUpperArm', [0, 0, -1.3], w);
      fixar(p, 'leftLowerArm', [0, 0, 0.55], w);
      fixar(p, 'rightLowerArm', [0, 0, -0.55], w);
      dedos(p, 'left', 0.6, w);
      dedos(p, 'right', 0.6, w);
      somar(p, 'spine', -0.1 * w, 0, 0);
      somar(p, 'chest', -0.08 * w, 0, 0);
      somar(p, 'head', -0.2 * w, 0, 0);
      p._y += 0.012 * w;
    },
    expressao: 'relaxed',
  },
  balancar: {
    duracao: 3.6,
    aplicar(p, t, w) {
      const s = Math.sin(t * TAU * 0.9);
      somar(p, 'hips', 0, 0.04 * s * w, 0.07 * s * w);
      somar(p, 'leftUpperLeg', 0, 0, -0.07 * s * w);
      somar(p, 'rightUpperLeg', 0, 0, -0.07 * s * w);
      somar(p, 'spine', 0, 0, -0.05 * s * w);
      somar(p, 'head', 0, 0, 0.1 * s * w);
      somar(p, 'leftUpperArm', 0, 0, 0.12 * s * w);
      somar(p, 'rightUpperArm', 0, 0, 0.12 * s * w);
    },
    expressao: 'happy',
  },
  olhar_redor: {
    duracao: 4,
    aplicar(p, t, w, prog) {
      // olha para um lado, depois para o outro
      const lado = Math.sin(prog * TAU) * 0.55;
      somar(p, 'head', -0.05 * w, lado * w, -lado * 0.15 * w);
      somar(p, 'neck', 0, lado * 0.4 * w, 0);
      somar(p, 'chest', 0, lado * 0.15 * w, 0);
    },
    olhos: (prog) => ({ yaw: Math.sin(prog * TAU) * 0.9, pitch: -0.1 }),
  },
  ajeitar_cabelo: {
    duracao: 2.8,
    aplicar(p, t, w) {
      fixar(p, 'rightUpperArm', [-0.55, 0.7, 0.55], w);
      fixar(p, 'rightLowerArm', [0, 2.2, -0.4 + 0.12 * Math.sin(t * 6)], w);
      fixar(p, 'rightHand', [0, 0, -0.3], w);
      dedos(p, 'right', 0.25, w);
      somar(p, 'head', 0, -0.12 * w, -0.16 * w);
      somar(p, 'chest', 0, -0.05 * w, 0);
    },
    expressao: 'relaxed',
  },
  bater_pe: {
    duracao: 3,
    aplicar(p, t, w) {
      const toque = Math.max(0, Math.sin(t * TAU * 2.2));
      somar(p, 'rightUpperLeg', -0.12 * w, 0, -0.05 * w);
      somar(p, 'rightLowerLeg', 0.25 * w, 0, 0);
      somar(p, 'rightFoot', (-0.35 * toque - 0.1) * w, 0, 0);
      somar(p, 'hips', 0, 0, 0.03 * w);
      somar(p, 'head', 0.03 * toque * w, 0, 0);
    },
  },
  aterrissar: {
    duracao: 0.7,
    aplicar(p, t, w, prog) {
      const k = Math.sin(Math.min(1, prog * 1.4) * Math.PI);
      p._y -= 0.06 * k * w;
      somar(p, 'leftUpperLeg', -0.4 * k * w, 0, 0.05 * k * w);
      somar(p, 'rightUpperLeg', -0.4 * k * w, 0, -0.05 * k * w);
      somar(p, 'leftLowerLeg', 0.8 * k * w, 0, 0);
      somar(p, 'rightLowerLeg', 0.8 * k * w, 0, 0);
      somar(p, 'leftFoot', -0.4 * k * w, 0, 0);
      somar(p, 'rightFoot', -0.4 * k * w, 0, 0);
      somar(p, 'spine', 0.18 * k * w, 0, 0);
      somar(p, 'leftUpperArm', 0, 0, 0.4 * k * w);
      somar(p, 'rightUpperArm', 0, 0, -0.4 * k * w);
    },
  },
};

const GESTOS_OCIOSOS = ['inclinar', 'maos_atras', 'alongar', 'balancar', 'olhar_redor', 'ajeitar_cabelo', 'bater_pe', 'olhar_redor'];
const PASSOS_DANCA = ['balanco', 'bracos_alto', 'palmas', 'pulinhos', 'quadril', 'passo_lateral', 'coracao'];

export class Animador {
  constructor(vrm) {
    this.vrm = vrm;
    this.ossos = {};
    for (const nome of OSSOS) {
      const o = vrm.humanoid.getNormalizedBoneNode(nome);
      if (o) this.ossos[nome] = o;
    }
    // Modelos VRM 0.x olham para -Z: os eixos X e Z das rotações ficam invertidos.
    this.inverter = vrm.meta?.metaVersion === '0';
    this.rotacaoBase = vrm.scene.rotation.y;
    this.quadrilBase = this.ossos.hips ? this.ossos.hips.position.clone() : new THREE.Vector3();
    this.escala = this.medirPernas();

    this.pose = {};
    this.yAtual = 0;
    this.xAtual = 0;
    this.estado = 'parada';
    this.direcao = 0;
    this.saltitar = false;
    this.intensidadeAndar = 0;
    this.faseAndar = 0;
    this.virada = 0;
    this.giro = 0;
    this.t = 0;
    this.gesto = null;
    this.proximoOcioso = 6 + Math.random() * 6;
    this.faseBatida = 0;
    this.bpm = 118;
    this.ritmoExterno = null;
    this.ordemDanca = this.embaralhar(PASSOS_DANCA);
    this.energiaFala = 0;
    this.olhar = { yaw: 0, pitch: 0 };
    this.ajuste = { bracos: 0 }; // ajustes do modelo (ex.: abrir os braços para não atravessar a roupa)

    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.clipes = {};
    this.acaoClipe = null;
    this.categoriaClipe = null;
  }

  embaralhar(lista) {
    const l = [...lista];
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  }

  medirPernas() {
    const h = this.ossos.hips;
    const p = this.ossos.leftFoot;
    if (!h || !p) return 1;
    this.vrm.scene.updateMatrixWorld(true);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    h.getWorldPosition(a);
    p.getWorldPosition(b);
    const perna = a.y - b.y;
    return perna > 0.1 ? perna / 0.8 : 1;
  }

  // ---------------------------------------------------------------- controle
  definirEstado(estado, direcao = 0, { saltitar = false } = {}) {
    if (estado === this.estado && direcao === this.direcao && saltitar === this.saltitar) return;
    if (estado === 'dancando' && this.estado !== 'dancando') {
      this.ordemDanca = this.embaralhar(PASSOS_DANCA);
      this.faseBatida = 0;
    }
    this.estado = estado;
    this.direcao = direcao;
    this.saltitar = saltitar;
    if (estado !== 'parada' && this.gesto && GESTOS_OCIOSOS.includes(this.gesto.nome)) this.gesto = null;
  }

  gestoAgora(nome) {
    if (!GESTOS[nome]) return;
    this.gesto = { nome, inicio: this.t, duracao: GESTOS[nome].duracao };
  }

  expressaoDoGesto() {
    return this.gesto ? GESTOS[this.gesto.nome].expressao || null : null;
  }

  // Olhar sugerido pelo gesto atual (ex.: "olhar ao redor"), ou null
  olharDoGesto() {
    const g = this.gesto && GESTOS[this.gesto.nome];
    if (!g || !g.olhos) return null;
    return g.olhos((this.t - this.gesto.inicio) / this.gesto.duracao);
  }

  definirRitmo(ritmo) {
    this.ritmoExterno = ritmo; // { bpm, ultimaBatida (segundos, performance.now) } ou null
    if (ritmo?.bpm) this.bpm = ritmo.bpm;
  }

  adicionarClipe(nomeArquivo, clip) {
    const n = nomeArquivo.toLowerCase();
    let cat = 'outros';
    if (/danc|dance/.test(n)) cat = 'danca';
    else if (/andar|walk|caminh/.test(n)) cat = 'andar';
    else if (/acen|wave|tchau|oi/.test(n)) cat = 'acenar';
    else if (/idle|parad|respir/.test(n)) cat = 'parada';
    (this.clipes[cat] ||= []).push(this.mixer.clipAction(clip));
  }

  // ---------------------------------------------------------------- quadro a quadro
  update(dt, instantaneo = false) {
    this.t += dt;
    this.avancarRitmo(dt);
    // entra e sai da caminhada aos poucos (acelera e freia)
    const alvoAndar = this.estado === 'andando' ? 1 : 0;
    this.intensidadeAndar += (alvoAndar - this.intensidadeAndar) * (instantaneo ? 1 : 1 - Math.exp(-dt * 5));
    this.faseAndar += dt * TAU * (this.saltitar ? 1.25 : 0.95) * (0.4 + 0.6 * this.intensidadeAndar);

    const usandoClipe = this.atualizarClipe(dt);
    const alvo = this.calcularPose(dt);
    const rapidez = this.estado === 'dancando' ? 13 : this.estado === 'andando' ? 12 : 8;
    const k = instantaneo ? 1 : 1 - Math.exp(-dt * rapidez);

    if (!usandoClipe) {
      const nomes = new Set([...Object.keys(alvo), ...Object.keys(this.pose)]);
      for (const nome of nomes) {
        if (nome.startsWith('_')) continue;
        const osso = this.ossos[nome];
        if (!osso) continue;
        const a = alvo[nome] || [0, 0, 0];
        const c = this.pose[nome] || (this.pose[nome] = [0, 0, 0]);
        for (let i = 0; i < 3; i++) c[i] += (a[i] - c[i]) * k;
        if (this.inverter) osso.rotation.set(-c[0], c[1], -c[2]);
        else osso.rotation.set(c[0], c[1], c[2]);
      }
      this.yAtual += (alvo._y - this.yAtual) * k;
      this.xAtual += ((alvo._x || 0) - this.xAtual) * k;
      if (this.ossos.hips) {
        this.ossos.hips.position.y = this.quadrilBase.y + this.yAtual * this.escala;
        this.ossos.hips.position.x = this.quadrilBase.x + this.xAtual * this.escala * (this.inverter ? -1 : 1);
      }
    }

    const alvoVirada = this.estado === 'andando' ? this.direcao * 1.15 : (alvo._virar || 0);
    this.virada += (alvoVirada - this.virada) * (instantaneo ? 1 : 1 - Math.exp(-dt * 6));
    this.vrm.scene.rotation.y = this.rotacaoBase + this.virada + this.giro;
  }

  avancarRitmo(dt) {
    this.faseBatida += dt * this.bpm / 60;
    const r = this.ritmoExterno;
    if (r && r.bpm && r.ultimaBatida) {
      // Aproxima a fase interna da batida real (como um metrônomo que se ajusta).
      const periodo = 60 / r.bpm;
      const alvo = ((performance.now() / 1000 - r.ultimaBatida) / periodo) % 1;
      let dif = alvo - (this.faseBatida % 1);
      if (dif > 0.5) dif -= 1;
      if (dif < -0.5) dif += 1;
      this.faseBatida += dif * Math.min(1, dt * 4);
    }
  }

  atualizarClipe(dt) {
    let cat = null;
    if (this.gesto?.nome === 'acenar' && this.clipes.acenar) cat = 'acenar';
    else if (this.estado === 'dancando' && this.clipes.danca) cat = 'danca';
    else if (this.estado === 'andando' && this.clipes.andar) cat = 'andar';
    else if (this.estado === 'parada' && !this.gesto && this.clipes.parada) cat = 'parada';

    if (!cat) {
      if (this.acaoClipe) { this.acaoClipe.stop(); this.acaoClipe = null; this.categoriaClipe = null; }
      return false;
    }
    if (cat !== this.categoriaClipe) {
      const nova = sortear(this.clipes[cat]);
      if (this.acaoClipe) this.acaoClipe.fadeOut(0.35);
      nova.reset().fadeIn(0.35).play();
      if (cat === 'acenar') { nova.setLoop(THREE.LoopOnce, 1); nova.clampWhenFinished = true; }
      this.acaoClipe = nova;
      this.categoriaClipe = cat;
    }
    if (cat === 'danca') this.acaoClipe.timeScale = THREE.MathUtils.clamp(this.bpm / 120, 0.6, 1.6);
    this.mixer.update(dt);
    if (this.ossos.hips) { // evita que a animação "ande para fora" da janela
      this.ossos.hips.position.x = this.quadrilBase.x;
      this.ossos.hips.position.z = this.quadrilBase.z;
    }
    return true;
  }

  // ---------------------------------------------------------------- poses
  calcularPose(dt) {
    const p = { _y: 0, _x: 0, _virar: 0 };
    const t = this.t;
    this.giro = 0;

    // Pose de repouso natural: braços junto ao corpo, cotovelos e dedos levemente dobrados
    somar(p, 'leftUpperArm', 0, 0, -1.3);
    somar(p, 'rightUpperArm', 0, 0, 1.3);
    somar(p, 'leftLowerArm', 0, -0.32, 0);
    somar(p, 'rightLowerArm', 0, 0.32, 0);
    somar(p, 'leftHand', 0, 0, -0.1);
    somar(p, 'rightHand', 0, 0, 0.1);
    dedos(p, 'left', 0.3);
    dedos(p, 'right', 0.3);
    somar(p, 'leftUpperLeg', 0, 0, 0.025);
    somar(p, 'rightUpperLeg', 0, 0, -0.025);

    switch (this.estado) {
      case 'dancando': this.poseDanca(p, t); break;
      case 'dormindo': this.poseDormir(p, t); break;
      case 'pensando': this.poseParada(p, t, dt, false); this.posePensar(p, t); break;
      case 'ouvindo': this.poseParada(p, t, dt, false); this.poseOuvir(p, t); break;
      case 'arrastada': this.poseArrastada(p, t, 0.6); break;
      case 'caindo': this.poseArrastada(p, t, 1.0); break;
      default: this.poseParada(p, t, dt, this.estado === 'parada');
    }
    // A caminhada entra e sai aos poucos por cima da pose parada
    if (this.intensidadeAndar > 0.01 && this.estado !== 'arrastada' && this.estado !== 'caindo') {
      this.poseAndar(p, this.intensidadeAndar);
    }

    // Gesto por cima da pose atual (acenar, inclinar a cabeça...)
    if (this.gesto) {
      const g = GESTOS[this.gesto.nome];
      const decorrido = t - this.gesto.inicio;
      const prog = decorrido / this.gesto.duracao;
      if (prog >= 1) {
        this.gesto = null;
      } else {
        const entrada = suavizar(Math.min(1, decorrido / 0.4));
        const saida = suavizar(Math.min(1, (this.gesto.duracao - decorrido) / 0.45));
        g.aplicar(p, t, Math.min(entrada, saida), prog);
      }
    }

    // Enquanto fala: a cabeça acompanha a voz e as mãos gesticulam um pouco
    if (this.energiaFala > 0.01 && this.estado !== 'dormindo') {
      const e = this.energiaFala;
      somar(p, 'head', 0.05 * e * Math.sin(t * 7.3), 0.04 * Math.sin(t * 2.1), 0.025 * Math.sin(t * 3.1));
      somar(p, 'chest', 0.015 * e, 0.02 * Math.sin(t * 1.7), 0);
      if (this.estado === 'parada' && !this.gesto) {
        const g1 = 0.5 + 0.5 * Math.sin(t * 1.7);
        const g2 = 0.5 + 0.5 * Math.sin(t * 1.3 + 1);
        somar(p, 'rightUpperArm', -0.25 * e * g1, 0, -0.15 * e * g1);
        somar(p, 'rightLowerArm', 0, 0.7 * e * g1, 0);
        somar(p, 'leftLowerArm', 0, -0.45 * e * g2, 0);
        somar(p, 'rightHand', 0, 0, -0.2 * e * g1);
      }
    }

    // Ajuste do modelo: abre (ou fecha) os braços em todas as poses
    const b = Number(this.ajuste?.bracos) || 0;
    if (b) { somar(p, 'leftUpperArm', 0, 0, b); somar(p, 'rightUpperArm', 0, 0, -b); }

    // A cabeça acompanha parte do olhar (os olhos fazem o resto)
    if (this.estado !== 'dormindo' && this.estado !== 'arrastada' && this.estado !== 'caindo') {
      somar(p, 'head', this.olhar.pitch * 0.35, this.olhar.yaw * 0.4, 0);
      somar(p, 'neck', this.olhar.pitch * 0.15, this.olhar.yaw * 0.2, 0);
    }
    return p;
  }

  poseParada(p, t, dt, permitirGestos) {
    // Respiração: peito sobe, ombros acompanham
    const resp = Math.sin(t * TAU * 0.22);
    somar(p, 'chest', resp * 0.022, 0, 0);
    somar(p, 'spine', resp * 0.01, 0, 0);
    somar(p, 'leftShoulder', 0, 0, resp * 0.015);
    somar(p, 'rightShoulder', 0, 0, -resp * 0.015);
    somar(p, 'leftUpperArm', 0, 0, resp * 0.012);
    somar(p, 'rightUpperArm', 0, 0, -resp * 0.012);

    // Troca o peso de uma perna para a outra (contrapposto): quadril inclina, um joelho dobra
    const peso = Math.sin(t * 0.42) * 0.65 + Math.sin(t * 0.15 + 1) * 0.35;
    somar(p, 'hips', 0, peso * 0.03, peso * 0.04);
    somar(p, 'leftUpperLeg', 0, 0, -peso * 0.04);
    somar(p, 'rightUpperLeg', 0, 0, -peso * 0.04);
    somar(p, peso > 0 ? 'rightUpperLeg' : 'leftUpperLeg', -Math.abs(peso) * 0.06, 0, 0);
    somar(p, peso > 0 ? 'rightLowerLeg' : 'leftLowerLeg', Math.abs(peso) * 0.14, 0, 0);
    somar(p, peso > 0 ? 'rightFoot' : 'leftFoot', -Math.abs(peso) * 0.08, 0, 0);
    p._y -= Math.abs(peso) * 0.006;
    somar(p, 'spine', 0, -peso * 0.02, -peso * 0.03);
    somar(p, 'chest', 0, 0, -peso * 0.015);

    // Micro movimentos da cabeça
    somar(p, 'head', Math.sin(t * 0.7) * 0.02, Math.sin(t * 0.31) * 0.04, Math.sin(t * 0.53) * 0.03 + peso * 0.03);
    somar(p, 'neck', 0, Math.sin(t * 0.23) * 0.02, 0);

    if (permitirGestos && !this.gesto) {
      this.proximoOcioso -= dt;
      if (this.proximoOcioso <= 0) {
        this.gestoAgora(sortear(GESTOS_OCIOSOS));
        this.proximoOcioso = 10 + Math.random() * 16;
      }
    }
  }

  poseAndar(p, w) {
    const f = this.faseAndar;
    const s = Math.sin(f);
    const c = Math.cos(f);
    const pulo = this.saltitar;
    const A = (pulo ? 0.5 : 0.42) * w;

    // Pernas: a coxa vai à frente, o joelho dobra enquanto a perna avança, o pé acompanha
    const balancoE = Math.max(0, c);   // perna esquerda avançando
    const balancoD = Math.max(0, -c);  // perna direita avançando
    somar(p, 'leftUpperLeg', -A * s, 0, 0);
    somar(p, 'rightUpperLeg', A * s, 0, 0);
    somar(p, 'leftLowerLeg', w * (0.08 + 0.75 * balancoE ** 1.5), 0, 0);
    somar(p, 'rightLowerLeg', w * (0.08 + 0.75 * balancoD ** 1.5), 0, 0);
    somar(p, 'leftFoot', w * (0.2 * s - 0.35 * balancoE), 0, 0);
    somar(p, 'rightFoot', w * (-0.2 * s - 0.35 * balancoD), 0, 0);

    // Quadril: sobe e desce duas vezes por passada, gira e inclina; o tronco compensa
    p._y += w * (pulo ? 0.05 * Math.abs(Math.sin(f)) - 0.01 : -0.022 * s * s + 0.004);
    somar(p, 'hips', 0, 0.13 * s * w, 0.045 * c * w);
    somar(p, 'leftUpperLeg', 0, 0, -0.045 * c * w);
    somar(p, 'rightUpperLeg', 0, 0, -0.045 * c * w);
    somar(p, 'spine', 0.05 * w, -0.09 * s * w, -0.03 * c * w);
    somar(p, 'chest', 0, -0.07 * s * w, 0);
    somar(p, 'head', 0.02 * Math.cos(2 * f) * w, 0.05 * s * w, 0.02 * c * w);

    // Braços balançam em oposição às pernas, cotovelo dobra mais quando o braço vai à frente
    const B = (pulo ? 0.45 : 0.3) * w;
    somar(p, 'leftUpperArm', B * s, 0, 0.04 * w);
    somar(p, 'rightUpperArm', -B * s, 0, -0.04 * w);
    somar(p, 'leftLowerArm', 0, -(0.05 + 0.25 * Math.max(0, -s)) * w, 0);
    somar(p, 'rightLowerArm', 0, (0.05 + 0.25 * Math.max(0, s)) * w, 0);
  }

  poseDanca(p, t) {
    const b = this.faseBatida;
    const f = b % 1;
    const desce = (1 + Math.cos(TAU * f)) / 2;      // 1 no tempo forte, 0 no meio da batida
    const lado = Math.sin(Math.PI * b);             // alterna o lado a cada batida
    const bloco = Math.floor(b / 8);                // um passo a cada 8 batidas
    const passo = this.ordemDanca[bloco % this.ordemDanca.length];

    // Base de todo passo: joelhos marcam o ritmo, cabeça acompanha
    p._y -= 0.035 * desce;
    somar(p, 'leftUpperLeg', -0.2 * desce, 0, 0);
    somar(p, 'rightUpperLeg', -0.2 * desce, 0, 0);
    somar(p, 'leftLowerLeg', 0.42 * desce, 0, 0);
    somar(p, 'rightLowerLeg', 0.42 * desce, 0, 0);
    somar(p, 'leftFoot', -0.22 * desce, 0, 0);
    somar(p, 'rightFoot', -0.22 * desce, 0, 0);
    somar(p, 'head', 0.09 * desce, 0, 0.07 * lado);
    somar(p, 'hips', 0, 0.05 * lado, 0.07 * lado);
    somar(p, 'leftUpperLeg', 0, 0, -0.07 * lado);
    somar(p, 'rightUpperLeg', 0, 0, -0.07 * lado);
    somar(p, 'spine', 0, -0.04 * lado, -0.05 * lado);
    somar(p, 'chest', 0, 0, -0.03 * lado);

    // Giro de 360° no começo de cada 4º passo
    if (bloco % 4 === 3 && b % 8 < 2) this.giro = TAU * suavizar((b % 8) / 2);

    switch (passo) {
      case 'balanco': {  // braços dobrados, socando o ar alternadamente
        const socoE = Math.max(0, Math.sin(Math.PI * b));
        const socoD = Math.max(0, -Math.sin(Math.PI * b));
        fixar(p, 'leftUpperArm', [-0.35 - 0.3 * socoE, 0, -1.05]);
        fixar(p, 'rightUpperArm', [-0.35 - 0.3 * socoD, 0, 1.05]);
        fixar(p, 'leftLowerArm', [0, -1.5 + 0.5 * socoE, 0]);
        fixar(p, 'rightLowerArm', [0, 1.5 - 0.5 * socoD, 0]);
        dedos(p, 'left', 0.85); dedos(p, 'right', 0.85);
        break;
      }
      case 'bracos_alto': {  // braços para o alto, balançando de um lado para o outro
        fixar(p, 'leftUpperArm', [0, 0, 1.05 + 0.3 * lado]);
        fixar(p, 'rightUpperArm', [0, 0, -1.05 + 0.3 * lado]);
        fixar(p, 'leftLowerArm', [0, 0, 0.25 + 0.2 * desce]);
        fixar(p, 'rightLowerArm', [0, 0, -0.25 - 0.2 * desce]);
        fixar(p, 'leftHand', [0, 0, 0.3 * lado]);
        fixar(p, 'rightHand', [0, 0, 0.3 * lado]);
        dedos(p, 'left', 0.1); dedos(p, 'right', 0.1);
        somar(p, 'hips', 0, 0, 0.05 * lado);
        somar(p, 'head', -0.08, 0, 0.05 * lado);
        break;
      }
      case 'palmas': {  // palmas no tempo, braços à frente
        // ângulos calculados para as mãos se encontrarem à frente do peito (abrem entre as batidas)
        const abre = 1 - desce;
        fixar(p, 'leftUpperArm', [-0.5, -0.68 + 0.35 * abre, -1.5]);
        fixar(p, 'rightUpperArm', [-0.5, 0.68 - 0.35 * abre, 1.5]);
        fixar(p, 'leftLowerArm', [0, -1.2, 0]);
        fixar(p, 'rightLowerArm', [0, 1.2, 0]);
        dedos(p, 'left', 0.05); dedos(p, 'right', 0.05);
        break;
      }
      case 'pulinhos': {  // pulinhos, punho para o alto na batida
        const sobe = Math.pow(Math.sin(Math.PI * f), 2);
        p._y += 0.07 * sobe;
        somar(p, 'leftLowerLeg', 0.3 * sobe, 0, 0);
        somar(p, 'rightLowerLeg', 0.3 * sobe, 0, 0);
        const direito = Math.floor(b) % 2 === 0;
        fixar(p, direito ? 'rightUpperArm' : 'leftUpperArm', direito ? [0, 0, -1.25 + 0.2 * desce] : [0, 0, 1.25 - 0.2 * desce]);
        fixar(p, direito ? 'rightLowerArm' : 'leftLowerArm', direito ? [0, 0, -0.5] : [0, 0, 0.5]);
        dedos(p, direito ? 'right' : 'left', 0.9);
        fixar(p, direito ? 'leftUpperArm' : 'rightUpperArm', direito ? [-0.4, 0, -1.1] : [-0.4, 0, 1.1]);
        fixar(p, direito ? 'leftLowerArm' : 'rightLowerArm', direito ? [0, -1.2, 0] : [0, 1.2, 0]);
        break;
      }
      case 'quadril': {  // mãos na cintura, quadril fazendo círculos
        const ang = Math.PI * b;
        somar(p, 'hips', 0.06 * Math.cos(ang), 0.06 * Math.sin(ang), 0.1 * Math.sin(ang));
        somar(p, 'spine', -0.05 * Math.cos(ang), 0, -0.08 * Math.sin(ang));
        p._x += 0.03 * Math.sin(ang);
        fixar(p, 'leftUpperArm', [0.25, -0.2, -0.75]);
        fixar(p, 'rightUpperArm', [0.25, 0.2, 0.75]);
        fixar(p, 'leftLowerArm', [0, 0.5, -1.7]);
        fixar(p, 'rightLowerArm', [0, -0.5, 1.7]);
        dedos(p, 'left', 0.4); dedos(p, 'right', 0.4);
        somar(p, 'head', 0, 0.1 * Math.sin(ang), 0);
        break;
      }
      case 'passo_lateral': {  // passo para um lado e para o outro, braços abrindo e cruzando
        p._x += 0.07 * lado;
        somar(p, 'leftUpperLeg', 0, 0, 0.12 * Math.max(0, lado));
        somar(p, 'rightUpperLeg', 0, 0, -0.12 * Math.max(0, -lado));
        p._virar = 0.3 * lado;
        const abre = Math.abs(lado);
        fixar(p, 'leftUpperArm', [-0.6 + 0.3 * abre, 0, -1.1 + 0.6 * abre]);
        fixar(p, 'rightUpperArm', [-0.6 + 0.3 * abre, 0, 1.1 - 0.6 * abre]);
        fixar(p, 'leftLowerArm', [0, -0.9 * (1 - abre) - 0.2, 0]);
        fixar(p, 'rightLowerArm', [0, 0.9 * (1 - abre) + 0.2, 0]);
        dedos(p, 'left', 0.2); dedos(p, 'right', 0.2);
        break;
      }
      case 'coracao': {  // "coração" com as mãos na frente do peito, cabeça inclinada
        const pulsar = 0.08 * desce;
        // ângulos calculados para as mãos ficarem juntas à frente do peito
        fixar(p, 'leftUpperArm', [-0.45 - pulsar, -0.55, -1.4]);
        fixar(p, 'rightUpperArm', [-0.45 - pulsar, 0.55, 1.4]);
        fixar(p, 'leftLowerArm', [0, -1.8, 0]);
        fixar(p, 'rightLowerArm', [0, 1.8, 0]);
        fixar(p, 'leftHand', [0, -0.2, 0.25]);
        fixar(p, 'rightHand', [0, 0.2, -0.25]);
        dedos(p, 'left', 0.55); dedos(p, 'right', 0.55);
        somar(p, 'head', 0, 0, 0.2 * Math.sin(Math.PI * b * 0.5));
        somar(p, 'chest', 0, 0.1 * lado, 0);
        break;
      }
      default: break;
    }
  }

  poseDormir(p, t) {
    const resp = Math.sin(t * TAU * 0.16);
    somar(p, 'head', 0.4, 0, 0.2);
    somar(p, 'neck', 0.12, 0, 0.05);
    somar(p, 'spine', 0.1, 0, 0);
    somar(p, 'chest', 0.06 + resp * 0.035, 0, 0);
    somar(p, 'leftShoulder', 0, 0, -0.06);
    somar(p, 'rightShoulder', 0, 0, 0.06);
    fixar(p, 'leftUpperArm', [-0.2, 0, -1.35]);
    fixar(p, 'rightUpperArm', [-0.2, 0, 1.35]);
    fixar(p, 'leftLowerArm', [0, -0.75, 0]);
    fixar(p, 'rightLowerArm', [0, 0.75, 0]);
    dedos(p, 'left', 0.45); dedos(p, 'right', 0.45);
    somar(p, 'leftLowerLeg', 0.08, 0, 0);
    somar(p, 'rightLowerLeg', 0.08, 0, 0);
    p._y -= 0.015;
  }

  posePensar(p, t) {
    somar(p, 'head', -0.12, 0.12, 0.15 + 0.03 * Math.sin(t * 1.2));
    fixar(p, 'rightUpperArm', [-0.55, 0.3, 1.2]);
    fixar(p, 'rightLowerArm', [0, 2.1, 0]);
    fixar(p, 'rightHand', [0, 0, 0.2]);
    dedos(p, 'right', 0.55);
    fixar(p, 'leftUpperArm', [-0.3, 0, -1.25]);
    fixar(p, 'leftLowerArm', [0, -1.5, 0]);
    dedos(p, 'left', 0.4);
    // tamborila os dedos do braço apoiado
    somar(p, 'leftIndexProximal', 0, 0, -0.25 * Math.max(0, Math.sin(t * 9)));
    somar(p, 'leftMiddleProximal', 0, 0, -0.25 * Math.max(0, Math.sin(t * 9 - 0.8)));
  }

  poseOuvir(p, t) {
    somar(p, 'head', 0.06, -0.1, -0.18);
    somar(p, 'spine', 0.06, 0, 0);
    // mão perto da orelha, como quem presta atenção
    fixar(p, 'leftUpperArm', [-0.5, -0.6, -0.45]);
    fixar(p, 'leftLowerArm', [0, -2.2, 0.35]);
    fixar(p, 'leftHand', [0, 0, 0.3]);
    dedos(p, 'left', 0.15);
    somar(p, 'chest', 0.01 * Math.sin(t * 2), 0, 0);
  }

  poseArrastada(p, t, intensidade) {
    const s = Math.sin(t * 7);
    somar(p, 'leftUpperLeg', -0.35 * s, 0, 0.05);
    somar(p, 'rightUpperLeg', 0.35 * s, 0, -0.05);
    somar(p, 'leftLowerLeg', 0.5 + 0.2 * Math.sin(t * 7 + 1), 0, 0);
    somar(p, 'rightLowerLeg', 0.5 + 0.2 * Math.sin(t * 7 + 2), 0, 0);
    fixar(p, 'leftUpperArm', [0, 0, 0.35 * intensidade + 0.25 * Math.sin(t * 13)]);
    fixar(p, 'rightUpperArm', [0, 0, -0.35 * intensidade - 0.25 * Math.sin(t * 13 + 1)]);
    fixar(p, 'leftLowerArm', [0, 0, 0.3]);
    fixar(p, 'rightLowerArm', [0, 0, -0.3]);
    dedos(p, 'left', 0.05); dedos(p, 'right', 0.05);
    somar(p, 'head', -0.1, 0.15 * Math.sin(t * 5), 0);
  }
}
