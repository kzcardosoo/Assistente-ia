// Corpo da personagem: carrega o modelo VRM, enquadra na janela, controla olhar,
// expressões, piscadas e boca, e desenha tudo com fundo 100% transparente.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { Animador } from './animacao.js';

const EMOCOES = {
  feliz: 'happy', triste: 'sad', brava: 'angry', surpresa: 'surprised',
  relaxada: 'relaxed', envergonhada: 'happy', neutra: null,
};
const PRESETS = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];
const BOCAS = ['aa', 'ih', 'ou', 'ee', 'oh'];
const FRACAO_CORPO = 0.74; // parte da altura da janela ocupada pela personagem (o resto é para o balão)

export class Personagem {
  constructor(canvas) {
    this.canvas = canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch (e) {
      // Placa de vídeo sem suporte a WebGL (ou driver bloqueado): o resto do app continua funcionando.
      this.renderer = null;
      this.erroGrafico = e.message;
    }

    this.cena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(20, 1, 0.1, 50);
    const luz = new THREE.DirectionalLight(0xffffff, 2.6);
    luz.position.set(1, 2, 3);
    this.cena.add(luz, new THREE.AmbientLight(0xffffff, 0.7));
    this.alvoOlhar = new THREE.Object3D();
    this.cena.add(this.alvoOlhar);

    this.loader = new GLTFLoader();
    this.loader.register((p) => new VRMLoaderPlugin(p));
    this.loader.register((p) => new VRMAnimationLoaderPlugin(p));

    this.vrm = null;
    this.animador = null;
    this.medidas = null;
    this.estado = 'parada';
    this.emocaoAtual = null;
    this.emocaoAte = 0;
    this.pesos = {};
    this.boca = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.fonteBoca = null;      // função que devolve os valores da boca (vem da fala)
    this.piscada = { proxima: 2.5, restante: 0 };
    this.cursor = { x: -1, y: -1, t: 0 };
    this.olharMouse = true;
    this.sacada = new THREE.Vector3();
    this.proximaSacada = 0;
    this.fps = 30;
    this.acumulado = 0;
    this.aoQuadro = null;

    this.gl = this.renderer?.getContext();
    this.pixel = new Uint8Array(4);
    this.ultimoTempo = performance.now();
    this.redimensionar();
    window.addEventListener('resize', () => this.redimensionar());
    this.loop();
  }

  // ---------------------------------------------------------------- carregamento
  async carregar(url, animacoes = []) {
    if (!this.renderer) {
      throw new Error('Não consegui ligar os gráficos 3D (WebGL). Atualize o driver da placa de vídeo e reinicie o app.');
    }
    const gltf = await this.loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('O arquivo não é um modelo VRM válido.');
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => { o.frustumCulled = false; });

    if (this.vrm) {
      this.cena.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.vrm = vrm;
    this.cena.add(vrm.scene);
    if (vrm.lookAt) vrm.lookAt.target = this.alvoOlhar;

    this.animador = new Animador(vrm);
    this.animador.update(0.016, true);
    vrm.update(0.016);
    this.medir();
    this.enquadrar();

    for (const a of animacoes) {
      try {
        const g = await this.loader.loadAsync(a.url);
        const anim = g.userData.vrmAnimations?.[0];
        if (anim) this.animador.adicionarClipe(a.nome, createVRMAnimationClip(anim, vrm));
      } catch (e) {
        console.warn('Não consegui carregar a animação', a.nome, e.message);
      }
    }
    return vrm;
  }

  medir() {
    this.vrm.scene.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(this.vrm.scene, true);
    let base = caixa.min.y;
    let topo = caixa.max.y;
    // Conferência pelos ossos, caso a caixa venha estranha (cabelo enorme, acessórios soltos...)
    const cabeca = this.vrm.humanoid.getNormalizedBoneNode('head');
    const pe = this.vrm.humanoid.getNormalizedBoneNode('leftFoot');
    if (cabeca && pe) {
      const c = cabeca.getWorldPosition(new THREE.Vector3());
      const p = pe.getWorldPosition(new THREE.Vector3());
      const alturaOssos = c.y - p.y;
      if (!(topo > c.y) || topo - c.y > alturaOssos * 0.8) topo = c.y + alturaOssos * 0.22;
      if (!(base < p.y) || p.y - base > alturaOssos * 0.3) base = p.y - alturaOssos * 0.06;
    }
    this.medidas = { base, topo };
  }

  enquadrar() {
    if (!this.medidas) return;
    const altura = this.medidas.topo - this.medidas.base;
    const visivel = altura / FRACAO_CORPO;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distancia = visivel / 2 / Math.tan(fov / 2);
    const centroY = this.medidas.base - visivel * 0.01 + visivel / 2;
    this.camera.position.set(0, centroY, distancia);
    this.camera.lookAt(0, centroY, 0);
    this.visivel = visivel;
    this.distancia = distancia;
    this.centroY = centroY;
  }

  redimensionar() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.enquadrar();
  }

  // ---------------------------------------------------------------- controle
  definirEstado(estado, direcao = 0) {
    this.estado = estado;
    this.animador?.definirEstado(estado, direcao);
  }

  gesto(nome) { this.animador?.gestoAgora(nome); }

  emocao(nome, duracaoMs = 4500) {
    this.emocaoAtual = EMOCOES[nome] || null;
    this.emocaoAte = performance.now() + duracaoMs;
  }

  moverCursor(x, y) {
    if (x !== this.cursor.x || y !== this.cursor.y) this.cursor = { x, y, t: performance.now() };
  }

  // Posição da cabeça na janela, em pixels (para posicionar o balão).
  posicaoCabeca() {
    const cabeca = this.vrm?.humanoid.getNormalizedBoneNode('head');
    if (!cabeca || !this.medidas) return null;
    const v = cabeca.getWorldPosition(new THREE.Vector3());
    v.y = Math.max(v.y, this.medidas.topo - 0.02);
    v.project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  // O pixel (x, y) da janela pertence à personagem? Usado para deixar os cliques atravessarem o fundo.
  pixelVisivel(x, y) {
    if (!this.vrm || !this.renderer) return false;
    const r = this.renderer.getPixelRatio();
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (const [dx, dy] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
      const px = Math.floor((x + dx) * r);
      const py = Math.floor(h - (y + dy) * r - 1);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      this.gl.readPixels(px, py, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.pixel);
      if (this.pixel[3] > 30) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- quadro a quadro
  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.renderer) { this.aoQuadro?.(0.016); return; }
    const agora = performance.now();
    this.acumulado += Math.min((agora - this.ultimoTempo) / 1000, 0.1);
    this.ultimoTempo = agora;
    if (this.acumulado < (1 / this.fps) * 0.92) return;
    const dt = Math.min(this.acumulado, 0.1);
    this.acumulado = 0;
    if (this.vrm) this.atualizar(dt);
    this.aoQuadro?.(dt);
    this.renderer.render(this.cena, this.camera);
  }

  atualizar(dt) {
    this.atualizarOlhar(dt);
    if (this.fonteBoca) {
      const b = this.fonteBoca();
      for (const k of BOCAS) this.boca[k] += ((b[k] || 0) - this.boca[k]) * Math.min(1, dt * 22);
      this.animador.energiaFala = Math.max(this.boca.aa, this.boca.oh, this.boca.ee, this.boca.ih, this.boca.ou);
    }
    this.animador.update(dt);
    this.atualizarExpressoes(dt);
    this.vrm.update(dt);
  }

  atualizarOlhar(dt) {
    const agora = performance.now();
    const alvo = new THREE.Vector3();
    const cabeca = this.vrm.humanoid.getNormalizedBoneNode('head');
    const posCabeca = cabeca ? cabeca.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, this.centroY, 0);

    if (this.estado === 'pensando') {
      alvo.set(posCabeca.x + 0.5, posCabeca.y + 0.6, posCabeca.z + 1);
    } else if (this.olharMouse && this.cursor.t && agora - this.cursor.t < 6000) {
      const ppu = window.innerHeight / this.visivel; // pixels por metro no plano da personagem
      alvo.set(
        (this.cursor.x - window.innerWidth / 2) / ppu,
        this.centroY + (window.innerHeight / 2 - this.cursor.y) / ppu,
        this.distancia * 0.8,
      );
    } else {
      // Olha para a pessoa, com pequenas olhadas para os lados de vez em quando
      if (agora > this.proximaSacada) {
        this.sacada.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.25, 0);
        if (Math.random() < 0.6) this.sacada.set(0, 0, 0);
        this.proximaSacada = agora + 1200 + Math.random() * 3000;
      }
      alvo.copy(this.camera.position).add(this.sacada);
    }
    this.alvoOlhar.position.lerp(alvo, 1 - Math.exp(-dt * 10));

    const d = this.alvoOlhar.position.clone().sub(posCabeca);
    const virada = this.animador.virada || 0;
    const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z) - virada, -0.7, 0.7);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.45, 0.45);
    this.animador.olhar.yaw += (yaw - this.animador.olhar.yaw) * Math.min(1, dt * 5);
    this.animador.olhar.pitch += (pitch - this.animador.olhar.pitch) * Math.min(1, dt * 5);
  }

  atualizarExpressoes(dt) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const agora = performance.now();
    const alvos = {};
    let olhosFechados = 0;

    let emocao = agora < this.emocaoAte ? this.emocaoAtual : null;
    emocao = this.animador.expressaoDoGesto() || emocao;
    if (!emocao) {
      if (this.estado === 'dancando') emocao = 'happy';
      else if (this.estado === 'arrastada' || this.estado === 'caindo') emocao = 'surprised';
      else if (this.estado === 'dormindo') emocao = 'relaxed';
    }
    if (emocao) alvos[emocao] = emocao === 'surprised' && this.estado === 'ouvindo' ? 0.3 : 0.75;
    if (this.estado === 'ouvindo' && !emocao) alvos.surprised = 0.25;
    if (this.estado === 'dormindo') olhosFechados = 1;

    const k = Math.min(1, dt * 8);
    for (const nome of PRESETS) {
      const atual = this.pesos[nome] || 0;
      this.pesos[nome] = atual + ((alvos[nome] || 0) - atual) * k;
      em.setValue(nome, this.pesos[nome]);
    }

    // Piscar em intervalos aleatórios (às vezes duas vezes seguidas)
    let piscar = 0;
    if (olhosFechados) {
      piscar = 1;
    } else if ((this.pesos.happy || 0) < 0.5) {
      this.piscada.proxima -= dt;
      if (this.piscada.proxima <= 0) {
        this.piscada.restante = 0.16;
        this.piscada.proxima = Math.random() < 0.15 ? 0.25 : 1.8 + Math.random() * 4.5;
      }
      if (this.piscada.restante > 0) {
        this.piscada.restante -= dt;
        piscar = Math.sin(Math.max(0, this.piscada.restante) / 0.16 * Math.PI);
      }
    }
    em.setValue('blink', piscar);
    for (const b of BOCAS) em.setValue(b, this.boca[b]);
  }
}
