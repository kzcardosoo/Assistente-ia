#!/usr/bin/env python3
"""Módulo de voz da assistente.

- Ouve o microfone o tempo todo (off-line) esperando a palavra de ativação (Vosk).
- Quando ativada (pela voz ou por clique), grava até a pessoa parar de falar e
  transcreve com o faster-whisper (off-line). Sem Whisper, usa o próprio Vosk.
- Gera a voz da personagem com Edge TTS (on-line) ou Kokoro (off-line).

Comunicação com o Electron: recebe comandos JSON (um por linha) pelo stdin e
envia eventos JSON pelo stdout. Mensagens de diagnóstico vão para o stderr.
Tudo é opcional: se faltar uma biblioteca, o resto continua funcionando.
"""
import argparse
import asyncio
import collections
import difflib
import json
import os
import queue
import re
import sys
import threading
import time
import unicodedata
import uuid
import wave

TAXA = 16000          # Hz
BLOCO = 1600          # amostras por bloco (0,1 s)

_trava_saida = threading.Lock()


def log(*partes):
    print('[voz]', *partes, file=sys.stderr, flush=True)


def enviar(**msg):
    with _trava_saida:
        sys.stdout.write(json.dumps(msg, ensure_ascii=False) + '\n')
        sys.stdout.flush()


try:
    import numpy as np
except ImportError:  # sem numpy não há microfone, mas a voz Edge ainda funciona
    np = None


# ---------------------------------------------------------------- palavra de ativação
def normalizar(texto):
    t = unicodedata.normalize('NFD', str(texto).lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]+', ' ', t).split()


def fonetico(t):
    """Aproxima a escrita do som em português: "aico" e "aiko" viram a mesma coisa."""
    t = t.replace('qu', 'k').replace('ch', 'x').replace('ss', 's').replace('y', 'i').replace('w', 'u')
    t = re.sub(r'c(?=[aou]|$)', 'k', t)
    t = re.sub(r'c(?=[ei])', 's', t)
    t = re.sub(r'h(?![aeiou])|^h', '', t)
    return t


def contem_palavra(texto, palavras, limiar=0.8):
    """Procura a palavra de ativação no texto, aceitando pequenas diferenças
    ("aico", "ai co"...), já que o reconhecimento nem sempre acerta nomes."""
    tokens = normalizar(texto)
    for palavra in palavras:
        alvo = fonetico(''.join(normalizar(palavra)))
        if not alvo:
            continue
        for tamanho in (1, 2, 3):
            for i in range(len(tokens) - tamanho + 1):
                junto = fonetico(''.join(tokens[i:i + tamanho]))
                if junto == alvo:
                    return True
                # Aproximação só para palavras isoladas: juntar palavras ("aí com") gera falsos positivos
                if tamanho == 1 and len(alvo) >= 4 and abs(len(junto) - len(alvo)) <= 2:
                    if difflib.SequenceMatcher(None, junto, alvo).ratio() >= limiar:
                        return True
    return False


def remover_palavra_inicio(texto, palavras):
    """Tira o nome da personagem do começo do comando ("Aiko, abre o..." -> "abre o...")."""
    t = texto.strip()
    for palavra in sorted(palavras, key=len, reverse=True):
        if not palavra:
            continue
        m = re.match(r'^\W*' + re.escape(palavra) + r'\W+', t, flags=re.IGNORECASE)
        if m:
            return t[m.end():].strip()
    return t


class DetectorAtivacao:
    def __init__(self, caminho_modelo):
        from vosk import KaldiRecognizer, Model, SetLogLevel
        SetLogLevel(-1)
        self.KaldiRecognizer = KaldiRecognizer
        self.modelo = Model(caminho_modelo)
        self.rec = KaldiRecognizer(self.modelo, TAXA)

    def processar(self, dados, palavras, limiar):
        if self.rec.AcceptWaveform(dados):
            texto = json.loads(self.rec.Result()).get('text', '')
        else:
            texto = json.loads(self.rec.PartialResult()).get('partial', '')
        if texto and contem_palavra(texto, palavras, limiar):
            self.rec.Reset()
            return True
        return False

    def reiniciar(self):
        self.rec.Reset()

    def transcrever(self, pcm):
        rec = self.KaldiRecognizer(self.modelo, TAXA)
        rec.AcceptWaveform(pcm)
        return json.loads(rec.FinalResult()).get('text', '')


# ---------------------------------------------------------------- transcrição (Whisper)
class Transcritor:
    def __init__(self, nome_modelo, pasta, ao_mudar):
        self.modelo = None
        self.erro = None
        self.carregando = True
        self.nome = nome_modelo
        self.ao_mudar = ao_mudar
        threading.Thread(target=self._carregar, args=(nome_modelo, pasta), daemon=True).start()

    def _carregar(self, nome, pasta):
        try:
            from faster_whisper import WhisperModel
            os.makedirs(pasta, exist_ok=True)
            log(f'carregando Whisper "{nome}" (na primeira vez ele é baixado, pode demorar)...')
            self.modelo = WhisperModel(nome, device='cpu', compute_type='int8', download_root=pasta)
            log('Whisper pronto')
        except Exception as e:  # noqa: BLE001
            self.erro = str(e)[:200]
            log('Whisper indisponível:', self.erro)
        finally:
            self.carregando = False
            self.ao_mudar()

    def transcrever(self, audio_float, dica=''):
        segmentos, _ = self.modelo.transcribe(
            audio_float, language='pt', vad_filter=True, beam_size=5,
            initial_prompt=dica or None,
        )
        return ' '.join(s.text.strip() for s in segmentos).strip()


# ---------------------------------------------------------------- síntese de voz
class Sintetizador:
    def __init__(self, cfg, pasta_temp):
        self.cfg = cfg
        self.pasta = pasta_temp
        os.makedirs(pasta_temp, exist_ok=True)
        self.fila = queue.Queue()
        self.kokoro = None
        self.tem_edge = self._existe('edge_tts')
        self.tem_kokoro = self._existe('kokoro') and self._existe('soundfile')
        threading.Thread(target=self._trabalhar, daemon=True).start()

    @staticmethod
    def _existe(modulo):
        import importlib.util
        return importlib.util.find_spec(modulo) is not None

    def falar(self, texto, id_):
        self.fila.put((texto, id_))

    def _trabalhar(self):
        while True:
            texto, id_ = self.fila.get()
            motor = self.cfg['voz'].get('motor', 'edge')
            ordem = ['edge', 'kokoro'] if motor == 'edge' else ['kokoro', 'edge']
            erros = []
            for m in ordem:
                try:
                    caminho = self._edge(texto) if m == 'edge' else self._kokoro(texto)
                    enviar(tipo='audio', caminho=caminho, id=id_, motor=m)
                    break
                except Exception as e:  # noqa: BLE001
                    erros.append(f'{m}: {e}')
                    log('voz falhou com', erros[-1])
            else:
                enviar(tipo='erro_tts', id=id_, texto=texto, mensagem=' | '.join(erros)[:300])

    def _arquivo(self, ext):
        return os.path.join(self.pasta, f'fala_{uuid.uuid4().hex[:10]}.{ext}')

    def _edge(self, texto):
        if not self.tem_edge:
            raise RuntimeError('edge-tts não instalado')
        import edge_tts
        v = self.cfg['voz']
        caminho = self._arquivo('mp3')
        com = edge_tts.Communicate(
            texto, v.get('voz_edge') or 'pt-BR-FranciscaNeural',
            rate=f"{int(v.get('velocidade', 0)):+d}%", pitch=f"{int(v.get('tom', 0)):+d}Hz",
        )
        asyncio.run(asyncio.wait_for(com.save(caminho), timeout=25))
        if not os.path.exists(caminho) or os.path.getsize(caminho) < 100:
            raise RuntimeError('áudio vazio')
        return caminho

    def _kokoro(self, texto):
        if not self.tem_kokoro or np is None:
            raise RuntimeError('Kokoro não instalado')
        import soundfile as sf
        if self.kokoro is None:
            from kokoro import KPipeline
            self.kokoro = KPipeline(lang_code='p')  # 'p' = português do Brasil
        v = self.cfg['voz']
        velocidade = 1 + int(v.get('velocidade', 0)) / 100
        partes = []
        for _, _, audio in self.kokoro(texto, voice=v.get('voz_kokoro') or 'pf_dora', speed=velocidade):
            if audio is not None:
                partes.append(audio.cpu().numpy() if hasattr(audio, 'cpu') else np.asarray(audio))
        if not partes:
            raise RuntimeError('Kokoro não gerou áudio')
        caminho = self._arquivo('wav')
        sf.write(caminho, np.concatenate(partes), 24000)
        return caminho


# ---------------------------------------------------------------- microfone
class Microfone:
    """Entrega blocos de áudio (int16, mono, 16 kHz) numa fila. Em modo de teste,
    lê um arquivo .wav no lugar do microfone."""

    def __init__(self, fila, dispositivo=None, arquivo_teste=None):
        self.fila = fila
        self.stream = None
        self.erro = None
        self.ativo = False
        if arquivo_teste:
            threading.Thread(target=self._ler_arquivo, args=(arquivo_teste,), daemon=True).start()
            self.ativo = True
            return
        try:
            import sounddevice as sd
            self.stream = sd.RawInputStream(
                samplerate=TAXA, blocksize=BLOCO, dtype='int16', channels=1,
                device=dispositivo or None, callback=self._callback,
            )
            self.stream.start()
            self.ativo = True
        except Exception as e:  # noqa: BLE001
            self.erro = str(e)[:200]
            log('microfone indisponível:', self.erro)

    def _callback(self, dados, frames, tempo, status):  # noqa: ARG002
        self.fila.put(bytes(dados))

    def _ler_arquivo(self, caminho):
        with wave.open(caminho, 'rb') as w:
            pcm = w.readframes(w.getnframes())
        passo = BLOCO * 2
        for i in range(0, len(pcm), passo):
            self.fila.put(pcm[i:i + passo].ljust(passo, b'\0'))
            time.sleep(BLOCO / TAXA / 4)  # 4x mais rápido que o tempo real
        silencio = b'\0' * passo
        while True:
            self.fila.put(silencio)
            time.sleep(BLOCO / TAXA)

    def fechar(self):
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:  # noqa: BLE001
                pass


def listar_microfones():
    try:
        import sounddevice as sd
        vistos, lista = set(), []
        for i, d in enumerate(sd.query_devices()):
            if d.get('max_input_channels', 0) > 0 and d['name'] not in vistos:
                vistos.add(d['name'])
                lista.append({'indice': i, 'nome': d['name']})
        return lista
    except Exception as e:  # noqa: BLE001
        log('não consegui listar microfones:', e)
        return []


# ---------------------------------------------------------------- serviço principal
class ServicoVoz:
    def __init__(self, cfg, arquivo_teste=None, sem_microfone=False):
        self.cfg = cfg
        self.fila = queue.Queue()
        self.pedido_ouvir = threading.Event()
        self.cancelar = threading.Event()
        self.falando = threading.Event()
        self.falando_desde = 0.0
        self.fim_fala = 0.0
        self.ruido = 200.0
        self.anterior = collections.deque(maxlen=4)  # 0,4 s antes da ativação
        self.erros = {}
        self.arquivo_teste = arquivo_teste
        self.sem_microfone = sem_microfone

        self.sintetizador = Sintetizador(cfg, cfg.get('pasta_temp') or os.path.join(os.getcwd(), 'audio'))
        self.microfone = None
        self.detector = None
        self.transcritor = None
        self.iniciar_microfone()
        self.iniciar_detector()
        self.iniciar_transcritor()

    # --- recursos
    def iniciar_microfone(self):
        if self.microfone:
            self.microfone.fechar()
        self.microfone = None
        if np is None:
            self.erros['microfone'] = 'numpy não instalado'
            return
        if self.sem_microfone:
            self.erros['microfone'] = 'desligado'
            return
        self.microfone = Microfone(self.fila, self.cfg['escuta'].get('microfone'), self.arquivo_teste)
        if not self.microfone.ativo:
            self.erros['microfone'] = self.microfone.erro
        else:
            self.erros.pop('microfone', None)

    def iniciar_detector(self):
        caminho = self.cfg.get('modelo_vosk')
        self.detector = None
        if not caminho or not os.path.isdir(caminho):
            self.erros['ativacao'] = 'modelo Vosk não encontrado (rode instalar.bat)'
            return
        try:
            self.detector = DetectorAtivacao(caminho)
            self.erros.pop('ativacao', None)
        except Exception as e:  # noqa: BLE001
            self.erros['ativacao'] = str(e)[:200]
            log('Vosk indisponível:', e)

    def iniciar_transcritor(self):
        if np is None:
            return
        self.transcritor = Transcritor(
            self.cfg['escuta'].get('modelo_whisper') or 'small',
            self.cfg.get('pasta_whisper') or os.path.join(os.getcwd(), 'whisper'),
            lambda: enviar(tipo='recursos', recursos=self.recursos()),
        )

    def recursos(self):
        transcricao = None
        if self.transcritor and self.transcritor.modelo:
            transcricao = 'whisper'
        elif self.detector:
            transcricao = 'vosk'
        if self.transcritor and self.transcritor.erro:
            self.erros['transcricao'] = 'Whisper: ' + self.transcritor.erro
        return {
            'microfone': bool(self.microfone and self.microfone.ativo),
            'ativacao': self.detector is not None,
            'transcricao': transcricao,
            'carregando_whisper': bool(self.transcritor and self.transcritor.carregando),
            'tts': {'edge': self.sintetizador.tem_edge, 'kokoro': self.sintetizador.tem_kokoro},
            'erros': self.erros,
        }

    # --- configuração
    def atualizar_config(self, novo):
        antigo = json.loads(json.dumps(self.cfg))
        self.cfg.update(novo)
        self.sintetizador.cfg = self.cfg
        if antigo['escuta'].get('microfone') != self.cfg['escuta'].get('microfone'):
            self.iniciar_microfone()
        if antigo.get('modelo_vosk') != self.cfg.get('modelo_vosk'):
            self.iniciar_detector()
        if antigo['escuta'].get('modelo_whisper') != self.cfg['escuta'].get('modelo_whisper'):
            self.iniciar_transcritor()
        enviar(tipo='recursos', recursos=self.recursos())

    def palavras(self):
        e = self.cfg['escuta']
        lista = [e.get('palavra_ativacao') or self.cfg.get('nome') or 'aiko']
        lista += [v for v in e.get('variantes') or [] if v]
        return lista

    # --- laço do microfone
    def laco(self):
        while True:
            try:
                dados = self.fila.get(timeout=0.5)
            except queue.Empty:
                if self.pedido_ouvir.is_set() and not (self.microfone and self.microfone.ativo):
                    self.pedido_ouvir.clear()
                    enviar(tipo='erro', origem='microfone', mensagem=self.erros.get('microfone') or 'sem microfone')
                    enviar(tipo='estado', valor='parado')
                continue

            if self.falando.is_set() and time.time() - self.falando_desde > 90:
                self.falando.clear()  # segurança: nunca fica "falando" para sempre

            self.anterior.append(dados)
            if self.pedido_ouvir.is_set():
                self.pedido_ouvir.clear()
                self.ouvir_comando(por_voz=False)
                continue

            amostras = np.frombuffer(dados, dtype=np.int16)
            nivel = float(np.sqrt(np.mean(amostras.astype(np.float32) ** 2))) if amostras.size else 0.0
            if not self.falando.is_set() and nivel < self.ruido * 2.5:
                self.ruido = self.ruido * 0.97 + nivel * 0.03

            escuta = self.cfg['escuta']
            if (self.detector and escuta.get('ativacao_por_voz', True) and not self.falando.is_set()
                    and time.time() - self.fim_fala > 0.6):
                sens = float(escuta.get('sensibilidade', 0.5))
                if self.detector.processar(dados, self.palavras(), 0.9 - 0.2 * sens):
                    enviar(tipo='ativacao')
                    self.ouvir_comando(por_voz=True)

    def ouvir_comando(self, por_voz):
        enviar(tipo='estado', valor='ouvindo')
        self.cancelar.clear()
        pcm = self.gravar(incluir_anterior=not por_voz)
        if pcm is None:
            enviar(tipo='estado', valor='parado')
            enviar(tipo='texto', texto='')
            self.esvaziar_fila()
            return
        enviar(tipo='estado', valor='transcrevendo')
        texto = ''
        try:
            texto = self.transcrever(pcm)
        except Exception as e:  # noqa: BLE001
            log('erro ao transcrever:', e)
        texto = remover_palavra_inicio(texto, self.palavras())
        log('ouvi:', texto)
        enviar(tipo='estado', valor='parado')
        enviar(tipo='texto', texto=texto)
        self.esvaziar_fila()

    def gravar(self, incluir_anterior):
        """Grava até a pessoa ficar em silêncio. Devolve bytes PCM ou None se ninguém falou."""
        sens = float(self.cfg['escuta'].get('sensibilidade', 0.5))
        limiar = max(self.ruido * (4.0 - 2.0 * sens), 350 - 150 * sens)
        blocos = list(self.anterior) if incluir_anterior else []
        falou, silencio, duracao = False, 0.0, 0.0
        while True:
            if self.cancelar.is_set():
                return None
            try:
                dados = self.fila.get(timeout=1.0)
            except queue.Empty:
                return None
            blocos.append(dados)
            amostras = np.frombuffer(dados, dtype=np.int16).astype(np.float32)
            nivel = float(np.sqrt(np.mean(amostras ** 2))) if amostras.size else 0.0
            passo = len(dados) / 2 / TAXA
            duracao += passo
            if nivel > limiar:
                falou, silencio = True, 0.0
            else:
                silencio += passo
            if falou and silencio >= 1.0:
                break
            if not falou and duracao >= 6:
                return None
            if duracao >= 15:
                break
        return b''.join(blocos)

    def transcrever(self, pcm):
        t = self.transcritor
        if t and t.carregando and not self.detector:
            enviar(tipo='estado', valor='transcrevendo')
            for _ in range(600):  # espera o Whisper terminar de carregar (até 60 s)
                if not t.carregando:
                    break
                time.sleep(0.1)
        if t and t.modelo:
            audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
            return t.transcrever(audio, dica=f"Conversa em português com a assistente {self.cfg.get('nome', '')}.")
        if self.detector:
            return self.detector.transcrever(pcm)
        raise RuntimeError('nenhum mecanismo de transcrição disponível')

    def esvaziar_fila(self):
        try:
            while True:
                self.fila.get_nowait()
        except queue.Empty:
            pass
        if self.detector:
            self.detector.reiniciar()

    # --- comandos vindos do Electron
    def comando(self, cmd):
        tipo = cmd.get('tipo')
        if tipo == 'ouvir':
            self.pedido_ouvir.set()
        elif tipo == 'cancelar':
            self.cancelar.set()
        elif tipo == 'falar':
            self.falando.set()
            self.falando_desde = time.time()
            self.sintetizador.falar(cmd.get('texto', ''), cmd.get('id'))
        elif tipo == 'fala_inicio':
            self.falando.set()
            self.falando_desde = time.time()
        elif tipo == 'fim_fala':
            self.falando.clear()
            self.fim_fala = time.time()
        elif tipo == 'config':
            self.atualizar_config(cmd.get('dados') or {})
        elif tipo == 'listar_microfones':
            enviar(tipo='microfones', lista=listar_microfones())
        elif tipo == 'status':
            enviar(tipo='recursos', recursos=self.recursos())
        elif tipo == 'sair':
            os._exit(0)


def main():
    parser = argparse.ArgumentParser(description='Módulo de voz da assistente')
    parser.add_argument('--config', help='arquivo JSON de configuração')
    parser.add_argument('--audio-teste', help='usa um .wav no lugar do microfone (para testes)')
    parser.add_argument('--sem-microfone', action='store_true')
    args = parser.parse_args()

    cfg = {'nome': 'Aiko', 'escuta': {}, 'voz': {}}
    if args.config:
        with open(args.config, encoding='utf-8') as f:
            cfg.update(json.load(f))
    cfg.setdefault('escuta', {})
    cfg.setdefault('voz', {})

    servico = ServicoVoz(cfg, arquivo_teste=args.audio_teste, sem_microfone=args.sem_microfone)
    if np is not None:
        threading.Thread(target=servico.laco, daemon=True).start()
    enviar(tipo='pronto', recursos=servico.recursos())

    for linha in sys.stdin:
        linha = linha.strip()
        if not linha:
            continue
        try:
            servico.comando(json.loads(linha))
        except Exception as e:  # noqa: BLE001
            log('comando inválido:', e)
    os._exit(0)  # o Electron fechou: encerra junto


if __name__ == '__main__':
    main()
