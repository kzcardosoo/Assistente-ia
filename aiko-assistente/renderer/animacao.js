// Animações procedurais da personagem: respirar, balançar o peso, andar, dançar no
// ritmo, acenar, pensar, dormir, ser arrastada... Tudo calculado por código, então
// funciona com qualquer modelo VRM sem precisar de arquivos de animação. Se houver
// arquivos .vrma na pasta "animacoes", eles são usados no lugar (dança, andar, acenar).
import * as THREE from 'three';

const OSSOS = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
];

const TAU = Math.PI * 2;
const sortear = (l) => l[Math.floor(Math.random() * l.length)];
const suavizar = (x) => x * x * (3 - 2 * x);

function somar(p, osso, x = 0, y = 0, z = 0) {
  const v = p[osso] || (p[osso] = [0, 0, 0]);
  v[0] += x; v[1] += y; v[2] += z;
}

// Move o osso em direção a uma rotação absoluta, com peso w (0..1).
function fixar(p, osso, alvo, w) {
  const v = p[osso] || (p[osso] = [0, 0, 0]);
  for (let i = 0; i < 3; i++) v[i] += (alvo[i] - v[i]) * w;
}

// Gestos: duração em segundos e uma função que altera a pose com peso w.
const GESTOS = {
  acenar: {
    duracao: 2.6,
    aplicar(p, t, w) {
      fixar(p, 'rightUpperArm', [-0.1, 0.35, 0.25], w);
      fixar(p, 'rightLowerArm', [0, 0.1, -1.9 + 0.35 * Math.sin(t * 11)], w);
      fixar(p, 'rightHand', [0, 0, -0.15], w);
      somar(p, 'head', 0, -0.05 * w, -0.1 * w);
      somar(p, 'chest', 0, -0.06 * w, 0.03 * w);
    },
    expressao: 'happy',
  },
  reagir: {
    duracao: 1.0,
    aplicar(p, t, w, prog) {
      const pulo = Math.sin(Math.min(1, prog * 1.6) * Math.PI);
      p._y += 0.035 * pulo * w;
      somar(p, 'leftUpperArm', 0, 0, 0.35 * pulo * w);
      somar(p, 'rightUpperArm', 0, 0, -0.35 * pulo * w);
      somar(p, 'head', -0.08 * pulo * w, 0, 0.1 * w);
    },
    expressao: 'happy',
  },
  inclinar: {
    duracao: 2.6,
    aplicar(p, t, w) {
      somar(p, 'head', 0.02 * w, 0.06 * w, 0.22 * w);
      somar(p, 'neck', 0, 0, 0.08 * w);
      somar(p, 'chest', 0, 0, -0.03 * w);
    },
  },
  maos_atras: {
    duracao: 6,
    aplicar(p, t, w) {
      fixar(p, 'leftUpperArm', [0.35, 0, -1.3], w);
      fixar(p, 'rightUpperArm', [0.35, 0, 1.3], w);
      fixar(p, 'leftLowerArm', [0, 1.0, 0], w);
      fixar(p, 'rightLowerArm', [0, -1.0, 0], w);
      somar(p, 'chest', -0.05 * w, 0, 0);
      somar(p, 'hips', 0, 0, 0.03 * Math.sin(t * 1.3) * w);
    },
  },
  alongar: {
    duracao: 3.2,
    aplicar(p, t, w) {
      fixar(p, 'leftUpperArm', [0, 0, 1.25], w);
      fixar(p, 'rightUpperArm', [0, 0, -1.25], w);
      fixar(p, 'leftLowerArm', [0, 0, 0.5], w);
      fixar(p, 'rightLowerArm', [0, 0, -0.5], w);
      somar(p, 'spine', -0.08 * w, 0, 0);
      somar(p, 'chest', -0.06 * w, 0, 0);
      somar(p, 'head', -0.18 * w, 0, 0);
      p._y += 0.01 * w;
    },
    expressao: 'relaxed',
  },
  balancar: {
    duracao: 3.4,
    aplicar(p, t, w) {
      const s = Math.sin(t * TAU * 0.9);
      somar(p, 'hips', 0, 0, 0.06 * s * w);
      somar(p, 'leftUpperLeg', 0, 0, -0.06 * s * w);
      somar(p, 'rightUpperLeg', 0, 0, -0.06 * s * w);
      somar(p, 'spine', 0, 0, -0.05 * s * w);
      somar(p, 'head', 0, 0, 0.08 * s * w);
      somar(p, 'leftUpperArm', 0, 0, 0.1 * s * w);
      somar(p, 'rightUpperArm', 0, 0, 0.1 * s * w);
    },
    expressao: 'happy',
  },
  aterrissar: {
    duracao: 0.7,
    aplicar(p, t, w, prog) {
      const k = Math.sin(Math.min(1, prog * 1.4) * Math.PI);
      p._y -= 0.05 * k * w;
      somar(p, 'leftUpperLeg', -0.35 * k * w, 0, 0);
      somar(p, 'rightUpperLeg', -0.35 * k * w, 0, 0);
      somar(p, 'leftLowerLeg', 0.7 * k * w, 0, 0);
      somar(p, 'rightLowerLeg', 0.7 * k * w, 0, 0);
      somar(p, 'leftFoot', -0.35 * k * w, 0, 0);
      somar(p, 'rightFoot', -0.35 * k * w, 0, 0);
      somar(p, 'spine', 0.15 * k * w, 0, 0);
    },
  },
};

const GESTOS_OCIOSOS = ['inclinar', 'maos_atras', 'alongar', 'balancar', 'inclinar'];

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
    this.estado = 'parada';
    this.direcao = 0;
    this.virada = 0;
    this.t = 0;
    this.gesto = null;
    this.proximoOcioso = 8 + Math.random() * 8;
    this.faseBatida = 0;
    this.bpm = 118;
    this.ritmoExterno = null;
    this.energiaFala = 0;
    this.olhar = { yaw: 0, pitch: 0 };

    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.clipes = {};
    this.acaoClipe = null;
    this.categoriaClipe = null;
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
  definirEstado(estado, direcao = 0) {
    if (estado === this.estado && direcao === this.direcao) return;
    this.estado = estado;
    this.direcao = direcao;
    if (estado !== 'parada' && this.gesto && GESTOS_OCIOSOS.includes(this.gesto.nome)) this.gesto = null;
  }

  gestoAgora(nome) {
    if (!GESTOS[nome]) return;
    this.gesto = { nome, inicio: this.t, duracao: GESTOS[nome].duracao };
  }

  expressaoDoGesto() {
    return this.gesto ? GESTOS[this.gesto.nome].expressao || null : null;
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
    const usandoClipe = this.atualizarClipe(dt);
    const alvo = this.calcularPose(dt);
    const k = instantaneo ? 1 : 1 - Math.exp(-dt * (this.estado === 'dancando' ? 16 : 10));

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
      if (this.ossos.hips) this.ossos.hips.position.y = this.quadrilBase.y + this.yAtual * this.escala;
    }

    const alvoVirada = this.estado === 'andando' ? this.direcao * 1.15 : 0;
    this.virada += (alvoVirada - this.virada) * (instantaneo ? 1 : 1 - Math.exp(-dt * 6));
    this.vrm.scene.rotation.y = this.rotacaoBase + this.virada;
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
    const p = { _y: 0 };
    const t = this.t;

    // Pose de repouso (braços para baixo, pernas levemente afastadas)
    somar(p, 'leftUpperArm', 0.05, 0, -1.2);
    somar(p, 'rightUpperArm', 0.05, 0, 1.2);
    somar(p, 'leftLowerArm', 0, -0.25, 0);
    somar(p, 'rightLowerArm', 0, 0.25, 0);
    somar(p, 'leftHand', 0, 0, -0.08);
    somar(p, 'rightHand', 0, 0, 0.08);
    somar(p, 'leftUpperLeg', 0, 0, 0.03);
    somar(p, 'rightUpperLeg', 0, 0, -0.03);

    switch (this.estado) {
      case 'andando': this.poseAndar(p, t); break;
      case 'dancando': this.poseDanca(p, t); break;
      case 'dormindo': this.poseDormir(p, t); break;
      case 'pensando': this.poseParada(p, t, dt, false); this.posePensar(p, t); break;
      case 'ouvindo': this.poseParada(p, t, dt, false); this.poseOuvir(p, t); break;
      case 'arrastada': this.poseArrastada(p, t, 0.6); break;
      case 'caindo': this.poseArrastada(p, t, 1.0); break;
      default: this.poseParada(p, t, dt, true);
    }

    // Gesto por cima da pose atual (acenar, inclinar a cabeça...)
    if (this.gesto) {
      const g = GESTOS[this.gesto.nome];
      const decorrido = t - this.gesto.inicio;
      const prog = decorrido / this.gesto.duracao;
      if (prog >= 1) {
        this.gesto = null;
      } else {
        const entrada = suavizar(Math.min(1, decorrido / 0.35));
        const saida = suavizar(Math.min(1, (this.gesto.duracao - decorrido) / 0.4));
        g.aplicar(p, t, Math.min(entrada, saida), prog);
      }
    }

    // Enquanto fala: cabeça acompanha a voz e as mãos gesticulam um pouco
    if (this.energiaFala > 0.01 && this.estado !== 'dormindo') {
      const e = this.energiaFala;
      somar(p, 'head', 0.05 * e * Math.sin(t * 7.3), 0.035 * Math.sin(t * 2.1), 0.02 * Math.sin(t * 3.1));
      somar(p, 'chest', 0.015 * e, 0, 0);
      if (this.estado === 'parada' && !this.gesto) {
        somar(p, 'rightLowerArm', 0, 0.5 * e * (0.5 + 0.5 * Math.sin(t * 1.7)), 0);
        somar(p, 'leftLowerArm', 0, -0.3 * e * (0.5 + 0.5 * Math.sin(t * 1.3 + 1)), 0);
      }
    }

    // A cabeça acompanha parte do olhar (os olhos fazem o resto)
    if (this.estado !== 'dormindo' && this.estado !== 'arrastada' && this.estado !== 'caindo') {
      somar(p, 'head', this.olhar.pitch * 0.35, this.olhar.yaw * 0.4, 0);
      somar(p, 'neck', this.olhar.pitch * 0.15, this.olhar.yaw * 0.2, 0);
    }
    return p;
  }

  poseParada(p, t, dt, permitirGestos) {
    const resp = Math.sin(t * TAU * 0.22);
    somar(p, 'chest', resp * 0.02, 0, 0);
    somar(p, 'spine', resp * 0.01, 0, 0);
    somar(p, 'leftUpperArm', 0, 0, resp * 0.015);
    somar(p, 'rightUpperArm', 0, 0, -resp * 0.015);

    // Troca o peso de uma perna para a outra, devagar
    const peso = Math.sin(t * 0.45) * 0.6 + Math.sin(t * 0.17 + 1) * 0.4;
    somar(p, 'hips', 0, 0, peso * 0.03);
    somar(p, 'leftUpperLeg', 0, 0, -peso * 0.03);
    somar(p, 'rightUpperLeg', 0, 0, -peso * 0.03);
    somar(p, 'spine', 0, 0, -peso * 0.025);
    somar(p, peso > 0 ? 'rightLowerLeg' : 'leftLowerLeg', Math.abs(peso) * 0.08, 0, 0);

    somar(p, 'head', Math.sin(t * 0.7) * 0.02, Math.sin(t * 0.31) * 0.04, Math.sin(t * 0.53) * 0.025);
    somar(p, 'neck', 0, Math.sin(t * 0.23) * 0.02, 0);

    if (permitirGestos && !this.gesto) {
      this.proximoOcioso -= dt;
      if (this.proximoOcioso <= 0) {
        this.gestoAgora(sortear(GESTOS_OCIOSOS));
        this.proximoOcioso = 14 + Math.random() * 22;
      }
    }
  }

  poseAndar(p, t) {
    const f = t * TAU * 0.95;
    const s = Math.sin(f);
    somar(p, 'leftUpperLeg', -s * 0.45, 0, 0);
    somar(p, 'rightUpperLeg', s * 0.45, 0, 0);
    somar(p, 'leftLowerLeg', 0.12 + 0.55 * Math.max(0, Math.sin(f - 0.9)), 0, 0);
    somar(p, 'rightLowerLeg', 0.12 + 0.55 * Math.max(0, Math.sin(f + Math.PI - 0.9)), 0, 0);
    somar(p, 'leftFoot', 0.1 * s, 0, 0);
    somar(p, 'rightFoot', -0.1 * s, 0, 0);
    somar(p, 'leftUpperArm', s * 0.35, 0, 0.08);
    somar(p, 'rightUpperArm', -s * 0.35, 0, -0.08);
    somar(p, 'leftLowerArm', 0, -0.2, 0);
    somar(p, 'rightLowerArm', 0, 0.2, 0);
    somar(p, 'hips', 0, s * 0.08, 0);
    somar(p, 'spine', 0.04, -s * 0.06, 0);
    somar(p, 'chest', 0, -s * 0.04, 0);
    somar(p, 'head', 0, s * 0.03, 0);
    p._y += 0.012 * Math.cos(2 * f) - 0.01;
  }

  poseDanca(p, t) {
    const b = this.faseBatida;
    const f = b % 1;
    const desce = (1 + Math.cos(TAU * f)) / 2;      // 1 no tempo forte, 0 no meio da batida
    const lado = Math.sin(Math.PI * b);             // alterna o lado a cada batida
    const estilo = Math.floor(b / 8) % 4;           // muda de passo a cada 8 batidas

    p._y -= 0.035 * desce;
    somar(p, 'leftUpperLeg', -0.22 * desce, 0, 0);
    somar(p, 'rightUpperLeg', -0.22 * desce, 0, 0);
    somar(p, 'leftLowerLeg', 0.45 * desce, 0, 0);
    somar(p, 'rightLowerLeg', 0.45 * desce, 0, 0);
    somar(p, 'leftFoot', -0.22 * desce, 0, 0);
    somar(p, 'rightFoot', -0.22 * desce, 0, 0);
    somar(p, 'head', 0.1 * desce, 0, 0.07 * lado);

    const balanco = estilo === 1 ? 0.1 : 0.07;
    somar(p, 'hips', 0, 0.05 * lado, balanco * lado);
    somar(p, 'leftUpperLeg', 0, 0, -balanco * lado);
    somar(p, 'rightUpperLeg', 0, 0, -balanco * lado);
    somar(p, 'spine', 0, -0.04 * lado, -0.05 * lado);
    somar(p, 'chest', 0, 0, -0.03 * lado);

    if (estilo === 0) {          // braços dobrados, balançando
      fixar(p, 'leftUpperArm', [-0.25 * lado, 0, -1.1], 1);
      fixar(p, 'rightUpperArm', [0.25 * lado, 0, 1.1], 1);
      fixar(p, 'leftLowerArm', [0, -1.3 - 0.3 * desce, 0], 1);
      fixar(p, 'rightLowerArm', [0, 1.3 + 0.3 * desce, 0], 1);
    } else if (estilo === 1) {   // mãos para o alto
      fixar(p, 'leftUpperArm', [0, 0, 1.0 + 0.25 * lado], 1);
      fixar(p, 'rightUpperArm', [0, 0, -1.0 + 0.25 * lado], 1);
      fixar(p, 'leftLowerArm', [0, 0, 0.3 + 0.2 * desce], 1);
      fixar(p, 'rightLowerArm', [0, 0, -0.3 - 0.2 * desce], 1);
    } else if (estilo === 2) {   // palmas no tempo
      const abre = 1 - desce;
      fixar(p, 'leftUpperArm', [-0.7, 0, -1.15 + 0.3 * abre], 1);
      fixar(p, 'rightUpperArm', [-0.7, 0, 1.15 - 0.3 * abre], 1);
      fixar(p, 'leftLowerArm', [0, -1.25, 0], 1);
      fixar(p, 'rightLowerArm', [0, 1.25, 0], 1);
    } else {                     // pulinhos com braços subindo
      const sobe = Math.pow(Math.sin(Math.PI * f), 2);
      p._y += 0.06 * sobe;
      fixar(p, 'leftUpperArm', [0, 0, -1.2 + 1.0 * sobe], 1);
      fixar(p, 'rightUpperArm', [0, 0, 1.2 - 1.0 * sobe], 1);
      fixar(p, 'leftLowerArm', [0, -0.4, 0], 1);
      fixar(p, 'rightLowerArm', [0, 0.4, 0], 1);
    }
  }

  poseDormir(p, t) {
    const resp = Math.sin(t * TAU * 0.16);
    somar(p, 'head', 0.38, 0, 0.18);
    somar(p, 'neck', 0.12, 0, 0.05);
    somar(p, 'spine', 0.08, 0, 0);
    somar(p, 'chest', 0.05 + resp * 0.035, 0, 0);
    fixar(p, 'leftUpperArm', [-0.2, 0, -1.3], 1);
    fixar(p, 'rightUpperArm', [-0.2, 0, 1.3], 1);
    fixar(p, 'leftLowerArm', [0, -0.7, 0], 1);
    fixar(p, 'rightLowerArm', [0, 0.7, 0], 1);
    p._y -= 0.012;
  }

  posePensar(p) {
    somar(p, 'head', -0.12, 0.12, 0.15);
    fixar(p, 'rightUpperArm', [-0.55, 0.3, 1.2], 1);
    fixar(p, 'rightLowerArm', [0, 2.1, 0], 1);
    fixar(p, 'leftUpperArm', [-0.3, 0, -1.25], 1);
    fixar(p, 'leftLowerArm', [0, -1.5, 0], 1);
  }

  poseOuvir(p) {
    somar(p, 'head', 0.06, -0.1, -0.16);
    somar(p, 'spine', 0.05, 0, 0);
    fixar(p, 'leftUpperArm', [-0.35, 0, -1.2], 1);
    fixar(p, 'leftLowerArm', [0, -1.2, 0], 1);
  }

  poseArrastada(p, t, intensidade) {
    const s = Math.sin(t * 7);
    somar(p, 'leftUpperLeg', -0.35 * s, 0, 0.05);
    somar(p, 'rightUpperLeg', 0.35 * s, 0, -0.05);
    somar(p, 'leftLowerLeg', 0.45, 0, 0);
    somar(p, 'rightLowerLeg', 0.45, 0, 0);
    fixar(p, 'leftUpperArm', [0, 0, 0.35 * intensidade + 0.25 * Math.sin(t * 13)], 1);
    fixar(p, 'rightUpperArm', [0, 0, -0.35 * intensidade - 0.25 * Math.sin(t * 13 + 1)], 1);
    fixar(p, 'leftLowerArm', [0, 0, 0.3], 1);
    fixar(p, 'rightLowerArm', [0, 0, -0.3], 1);
    somar(p, 'head', -0.1, 0.15 * Math.sin(t * 5), 0);
  }
}
