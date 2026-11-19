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
THREADS = max(1, min(8, (os.cpu_count() or 4) - 1))

_trava_saida = threading.Lock()

# Conversa com o app sempre em UTF-8 (no Windows o padrão seria cp1252 e quebraria os acentos)
for _fluxo in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _fluxo.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass


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
    """Aproxima a escrita do som em português: "emi" e "emy" viram a mesma coisa."""
    t = t.replace('qu', 'k').replace('ch', 'x').replace('ss', 's').replace('y', 'i').replace('w', 'u')
    t = re.sub(r'c(?=[aou]|$)', 'k', t)
    t = re.sub(r'c(?=[ei])', 's', t)
    t = re.sub(r'h(?![aeiou])|^h', '', t)
    return re.sub(r'(.)\1', r'\1', t)  # letras dobradas: "emmy" -> "emi"


def distancia(a, b):
    """Quantas letras precisam mudar para "a" virar "b" (distância de Levenshtein)."""
    anterior = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        atual = [i]
        for j, cb in enumerate(b, 1):
            atual.append(min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (ca != cb)))
        anterior = atual
    return anterior[-1]


def bate_com_nome(trecho, palavras, limiar=0.8):
    t = fonetico(''.join(normalizar(trecho)))
    if not t:
        return False
    for palavra in palavras:
        alvo = fonetico(''.join(normalizar(palavra)))
        if not alvo:
            continue
        if t == alvo:
            return True
        if len(alvo) >= 4 and abs(len(t) - len(alvo)) <= 2 and difflib.SequenceMatcher(None, t, alvo).ratio() >= limiar:
            return True
    return False


def contem_palavra(texto, palavras, limiar=0.8, janela=3):
    """Procura o nome nas primeiras palavras da frase, que é onde as pessoas chamam
    ("Emy, ...", "Ei Emy, ..."). Aceita pequenas diferenças ("emi", "e mi"...)."""
    tokens = normalizar(texto)
    for tamanho in (1, 2, 3):
        for i in range(min(janela, len(tokens) - tamanho + 1)):
            junto = ''.join(tokens[i:i + tamanho])
            if tamanho == 1 and bate_com_nome(junto, palavras, limiar):
                return True
            # nome "quebrado" em duas palavras ("e mi"): só aceita igualdade exata
            if tamanho > 1 and bate_com_nome(junto, palavras, limiar=1.01):
                return True
    return False


def remover_palavra_inicio(texto, palavras):
    """Tira o chamado do começo do comando ("Ei Emy, abre o..." -> "abre o...")."""
    partes = re.findall(r'\S+', texto.strip())
    for i in range(min(3, len(partes))):
        for tamanho in (1, 2):
            if i + tamanho <= len(partes) and bate_com_nome(''.join(partes[i:i + tamanho]), palavras, 1.01 if tamanho > 1 else 0.8):
                return ' '.join(partes[i + tamanho:]).lstrip(' ,.!?;:-').strip()
    return texto.strip()


class DetectorAtivacao:
    def __init__(self, caminho_modelo):
        from vosk import KaldiRecognizer, Model, SetLogLevel
        SetLogLevel(-1)
        self.KaldiRecognizer = KaldiRecognizer
        self.modelo = Model(caminho_modelo)
        self.rec = KaldiRecognizer(self.modelo, TAXA)

    def processar(self, dados, palavras, rapidas, limiar):
        """Devolve 'forte' (ouviu o nome), 'fraco' (ouviu algo parecido, precisa confirmar) ou None."""
        if self.rec.AcceptWaveform(dados):
            texto = json.loads(self.rec.Result()).get('text', '')
        else:
            texto = json.loads(self.rec.PartialResult()).get('partial', '')
        if not texto:
            return None
        if contem_palavra(texto, palavras, limiar):
            self.rec.Reset()
            return 'forte'
        if rapidas and contem_palavra(texto, rapidas, 1.01, janela=2):
            self.rec.Reset()
            return 'fraco'
        return None

    def reiniciar(self):
        self.rec.Reset()

    def novo_reconhecedor(self):
        return self.KaldiRecognizer(self.modelo, TAXA)

    def transcrever(self, pcm):
        rec = self.KaldiRecognizer(self.modelo, TAXA)
        rec.AcceptWaveform(pcm)
        return json.loads(rec.FinalResult()).get('text', '')


# ---------------------------------------------------------------- transcrição (Whisper)
class Transcritor:
    def __init__(self, nome_modelo, pasta, ao_mudar, pasta_modelos=None):
        self.modelo = None
        self.erro = None
        self.carregando = True
        self.nome = nome_modelo
        self.ao_mudar = ao_mudar
        threading.Thread(target=self._carregar, args=(nome_modelo, pasta, pasta_modelos), daemon=True).start()

    def _carregar(self, nome, pasta, pasta_modelos=None):
        try:
            from faster_whisper import WhisperModel
            # Modelo que já vem junto do app (versão portátil): não precisa baixar nada
            local = os.path.join(pasta_modelos, f'whisper-{nome}') if pasta_modelos else ''
            if local and os.path.isfile(os.path.join(local, 'model.bin')):
                log(f'carregando Whisper "{nome}" incluído no app...')
                self.modelo = WhisperModel(local, device='cpu', compute_type='int8', cpu_threads=THREADS)
            else:
                os.makedirs(pasta, exist_ok=True)
                log(f'carregando Whisper "{nome}" (na primeira vez ele é baixado, pode demorar)...')
                self.modelo = WhisperModel(nome, device='cpu', compute_type='int8', download_root=pasta, cpu_threads=THREADS)
            log('Whisper pronto')
        except Exception as e:  # noqa: BLE001
            self.erro = str(e)[:200]
            log('Whisper indisponível:', self.erro)
        finally:
            self.carregando = False
            self.ao_mudar()

    def transcrever(self, audio_float, dica=''):
        # beam_size=1 e sem marcas de tempo: bem mais rápido, quase a mesma precisão para frases curtas
        segmentos, _ = self.modelo.transcribe(
            audio_float, language='pt', vad_filter=True, beam_size=1, best_of=1,
            without_timestamps=True, condition_on_previous_text=False,
            initial_prompt=dica or None,
        )
        # descarta trechos que o Whisper "inventou" no silêncio
        textos = [s.text.strip() for s in segmentos if not (s.no_speech_prob > 0.6 and s.avg_logprob < -0.8)]
        return ' '.join(textos).strip()


# ---------------------------------------------------------------- síntese de voz
class Sintetizador:
    def __init__(self, cfg, pasta_temp):
        self.cfg = cfg
        self.pasta = pasta_temp
        os.makedirs(pasta_temp, exist_ok=True)
        self.fila = queue.Queue()
        self.geracao = 0
        self.kokoro = None
        self.tem_edge = self._existe('edge_tts')
        self.tem_kokoro = self._existe('kokoro') and self._existe('soundfile')
        threading.Thread(target=self._trabalhar, daemon=True).start()

    @staticmethod
    def _existe(modulo):
        import importlib.util
        return importlib.util.find_spec(modulo) is not None

    def falar(self, texto, id_):
        self.fila.put((texto, id_, self.geracao))

    def cancelar(self):
        """Descarta tudo que ainda ia ser falado (chegou outra pergunta)."""
        self.geracao += 1
        try:
            while True:
                self.fila.get_nowait()
        except queue.Empty:
            pass

    def _trabalhar(self):
        while True:
            texto, id_, geracao = self.fila.get()
            if geracao != self.geracao:
                continue
            motor = self.cfg['voz'].get('motor', 'edge')
            ordem = ['edge', 'kokoro'] if motor == 'edge' else ['kokoro', 'edge']
            erros = []
            for m in ordem:
                try:
                    inicio = time.time()
                    caminho = self._edge(texto) if m == 'edge' else self._kokoro(texto)
                    log(f'voz ({m}) gerada em {time.time() - inicio:.1f}s')
                    if geracao != self.geracao:  # cancelado enquanto gerava
                        os.remove(caminho)
                        break
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
        # Respeita o proxy configurado no sistema (redes de empresa/escola)
        proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or None
        com = edge_tts.Communicate(
            texto, v.get('voz_edge') or 'pt-BR-FranciscaNeural',
            rate=f"{int(v.get('velocidade', 0)):+d}%", pitch=f"{int(v.get('tom', 0)):+d}Hz", proxy=proxy,
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
    """Entrega blocos de áudio (int16, mono, 16 kHz) numa fila. Abre o microfone na taxa
    que ele aceitar (muitos no Windows só funcionam a 44,1 ou 48 kHz) e converte para 16 kHz.
    Em modo de teste, lê um arquivo .wav no lugar do microfone."""

    def __init__(self, fila, dispositivo=None, arquivo_teste=None):
        self.fila = fila
        self.stream = None
        self.erro = None
        self.ativo = False
        self.taxa = TAXA
        self.canais = 1
        self.nome = ''
        self.pico = 0
        if arquivo_teste:
            self.nome = 'arquivo de teste'
            threading.Thread(target=self._ler_arquivo, args=(arquivo_teste,), daemon=True).start()
            self.ativo = True
            return
        try:
            import sounddevice as sd
            disp = self._achar(sd, dispositivo)
            info = sd.query_devices(disp, 'input')
            self.nome = info['name']
            taxas = list(dict.fromkeys([TAXA, int(info['default_samplerate']), 48000, 44100]))
            ultimo = None
            for taxa in taxas:
                for canais in (1, 2):
                    try:
                        self.taxa, self.canais = taxa, canais
                        self.stream = sd.InputStream(samplerate=taxa, blocksize=int(taxa / 10), dtype='int16',
                                                     channels=canais, device=disp, callback=self._callback)
                        self.stream.start()
                        self.ativo = True
                        log(f'microfone: "{self.nome}" a {taxa} Hz, {canais} canal(is)')
                        return
                    except Exception as e:  # noqa: BLE001
                        ultimo = e
                        self.stream = None
            raise ultimo or RuntimeError('nenhuma configuração funcionou')
        except Exception as e:  # noqa: BLE001
            self.erro = str(e)[:200]
            log('microfone indisponível:', self.erro)

    @staticmethod
    def _achar(sd, dispositivo):
        """Aceita o nome do microfone escolhido nas configurações; se sumir, usa o padrão."""
        if dispositivo in (None, ''):
            return None
        if isinstance(dispositivo, int):
            return dispositivo
        for i, d in enumerate(sd.query_devices()):
            if d.get('max_input_channels', 0) > 0 and d['name'] == dispositivo:
                return i
        log(f'microfone "{dispositivo}" não encontrado; usando o padrão do Windows')
        return None

    def _callback(self, dados, frames, tempo, status):  # noqa: ARG002
        a = dados[:, 0] if dados.ndim > 1 else dados
        if self.taxa != TAXA:
            if self.taxa % TAXA == 0:  # 48 kHz -> 16 kHz: média de 3 em 3 (já filtra)
                f = self.taxa // TAXA
                n = len(a) - len(a) % f
                a = a[:n].reshape(-1, f).astype(np.float32).mean(axis=1)
            else:
                x = np.arange(0, len(a), self.taxa / TAXA)
                a = np.interp(x, np.arange(len(a)), a.astype(np.float32))
            a = np.clip(a, -32768, 32767).astype(np.int16)
        self.pico = max(self.pico, int(np.abs(a).max()) if a.size else 0)
        self.fila.put(a.astype(np.int16).tobytes())

    def _ler_arquivo(self, caminho):
        with wave.open(caminho, 'rb') as w:
            pcm = w.readframes(w.getnframes())
        passo = BLOCO * 2
        for i in range(0, len(pcm), passo):
            self.fila.put(pcm[i:i + passo].ljust(passo, b'\0'))
            self.pico = max(self.pico, 1000)
            time.sleep(BLOCO / TAXA)  # no ritmo real, como um microfone
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
        self.anterior = collections.deque(maxlen=25)  # 2,5 s antes da ativação (inclui o nome falado)
        self.erros = {}
        self.pedido_teste = threading.Event()
        self.pico_longo = 3000.0  # para o ganho automático
        # detector de nome pelo Whisper: escuta o começo de cada fala
        self.em_fala = False
        self.ja_avaliado = False
        self.inicio_fala = []
        self.silencio_fala = 0.0
        self.fim_comando = 0.0
        self.pedido_pela_metade = ''
        self.avisou_mudo = False
        self.blocos_lidos = 0
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
        self.blocos_lidos = 0
        self.avisou_mudo = False
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
            self.cfg.get('pasta_modelos'),
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
            'microfone_nome': self.microfone.nome if self.microfone else '',
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
        lista = [e.get('palavra_ativacao') or self.cfg.get('nome') or 'emy']
        lista += [v for v in e.get('variantes') or [] if v]
        return lista

    def palavras_rapidas(self):
        """Como o reconhecimento rápido (Vosk) costuma "ouvir" o nome. Ex.: "Emy" vira "me".
        Só valem no começo da frase e sempre passam pela confirmação do Whisper."""
        e = self.cfg['escuta']
        chave = ''.join(normalizar(e.get('palavra_ativacao') or ''))
        return list((e.get('variantes_rapidas') or {}).get(chave, []))

    def tem_whisper(self):
        return bool(self.transcritor and self.transcritor.modelo)

    def ajustar(self, dados):
        """Ganho automático: microfone baixo é amplificado (até 8x) para o reconhecimento
        funcionar; microfone normal passa sem mudança."""
        a = np.frombuffer(dados, dtype=np.int16)
        pico = int(np.abs(a).max()) if a.size else 0
        self.pico_longo = max(float(pico), self.pico_longo * 0.995)  # lembra a fala dos últimos ~20 s
        ganho = min(8.0, 8000.0 / max(self.pico_longo, 300.0))
        if ganho <= 1.05:
            return dados
        return np.clip(a.astype(np.float32) * ganho, -32768, 32767).astype(np.int16).tobytes()

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

            dados = self.ajustar(dados)
            if self.falando.is_set() and time.time() - self.falando_desde > 45:
                self.falando.clear()  # segurança: nunca fica "falando" para sempre

            self.anterior.append(dados)
            self.blocos_lidos += 1
            if self.blocos_lidos == 40 and self.microfone and self.microfone.pico == 0 and not self.avisou_mudo:
                # 4 s de silêncio absoluto: o Windows está bloqueando o microfone (privacidade) ou ele está mudo
                self.avisou_mudo = True
                msg = ('Meu microfone está mudo. No Windows, abra Configurações, Privacidade e segurança, Microfone, '
                       'e ative "Permitir que aplicativos da área de trabalho acessem o microfone". '
                       'Confira também se o microfone certo está escolhido nas minhas Configurações.')
                self.erros['microfone'] = 'o microfone só entrega silêncio (bloqueado pela privacidade do Windows ou mudo)'
                log('microfone mudo:', self.microfone.nome)
                enviar(tipo='erro', origem='microfone_mudo', mensagem=msg)
            if self.pedido_teste.is_set():
                self.pedido_teste.clear()
                self.testar_microfone()
                continue
            if self.pedido_ouvir.is_set():
                self.pedido_ouvir.clear()
                self.ouvir_comando(por_voz=False)
                continue

            amostras = np.frombuffer(dados, dtype=np.int16)
            nivel = float(np.sqrt(np.mean(amostras.astype(np.float32) ** 2))) if amostras.size else 0.0
            if not self.falando.is_set() and nivel < self.ruido * 2.5:
                self.ruido = self.ruido * 0.97 + nivel * 0.03
            if self.verificar_inicio_de_fala(dados, nivel):
                continue

            escuta = self.cfg['escuta']
            if (self.detector and escuta.get('ativacao_por_voz', True) and not self.falando.is_set()
                    and time.time() - self.fim_fala > 0.6):
                sens = float(escuta.get('sensibilidade', 0.5))
                forca = self.detector.processar(dados, self.palavras(), self.palavras_rapidas(), 0.9 - 0.2 * sens)
                if forca == 'forte' and time.time() - self.fim_comando > 1.0:
                    enviar(tipo='ativacao')
                    self.ouvir_comando(por_voz=True)

    def verificar_inicio_de_fala(self, dados, nivel):
        """Quando alguém começa a falar depois de um silêncio, o Whisper ouve o primeiro 1,5 s
        e confere se é o nome dela. Muito mais confiável que o Vosk para um nome curto como
        "Emy" (que o Vosk escuta como "me", "em mil", "e me"...). Devolve True se ativou."""
        escuta = self.cfg['escuta']
        if (not escuta.get('ativacao_por_voz', True) or not self.tem_whisper() or self.falando.is_set()
                or time.time() - self.fim_fala < 0.6 or time.time() - self.fim_comando < 1.0):
            self.em_fala = False
            return False
        sens = float(escuta.get('sensibilidade', 0.5))
        limiar = max(self.ruido * (3.2 - 1.4 * sens), 160 - 60 * sens)
        passo = len(dados) / 2 / TAXA
        if not self.em_fala:
            if nivel > limiar:
                self.em_fala, self.ja_avaliado, self.silencio_fala = True, False, 0.0
                self.inicio_fala = list(self.anterior)[-4:]  # inclui 0,3 s antes (começo da palavra)
            return False
        self.silencio_fala = 0.0 if nivel > limiar else self.silencio_fala + passo
        if self.silencio_fala >= 0.7:  # a fala acabou
            self.em_fala = False
        if self.ja_avaliado:
            return False
        self.inicio_fala.append(dados)
        duracao = len(self.inicio_fala) * BLOCO / TAXA
        if duracao < 1.6 and not (self.silencio_fala >= 0.35 and duracao >= 0.5):
            return False
        self.ja_avaliado = True
        audio = np.frombuffer(b''.join(self.inicio_fala), dtype=np.int16).astype(np.float32) / 32768.0
        inicio = time.time()
        try:
            texto = self.transcritor.transcrever(self.normalizar_volume(audio), dica=self.dica_nome())
        except Exception as e:  # noqa: BLE001
            log('erro ao conferir o nome:', e)
            return False
        if not contem_palavra(texto, self.palavras()):
            return False
        log(f'ouvi o nome em {time.time() - inicio:.1f}s ("{texto}")')
        enviar(tipo='ativacao')
        self.em_fala = False
        self.ouvir_comando(por_voz=True)
        return True

    def dica_nome(self):
        n = self.cfg.get('nome') or 'Emy'
        # Exemplos com o nome ajudam o Whisper a escrever o nome certo (sem isso "Emy" às vezes vira "AM")
        return f'{n}, abre o YouTube. Ei {n}, que horas são? {n}, pesquisa receitas.'

    @staticmethod
    def normalizar_volume(audio):
        pico = float(np.abs(audio).max()) if audio.size else 0.0
        if 0.005 < pico < 0.3:  # microfone baixo: aumenta o volume antes de transcrever
            return audio * min(10.0, 0.5 / pico)
        return audio

    def ouvir_comando(self, por_voz, mostrar=True):
        if mostrar:
            enviar(tipo='estado', valor='ouvindo')
        self.cancelar.clear()
        # Pela voz, guarda 2,5 s de antes (o nome falado) para o Whisper confirmar; no clique, só um pouquinho
        pcm = self.gravar(blocos_antes=25 if por_voz else 3)
        if pcm is None:
            if mostrar:
                enviar(tipo='estado', valor='parado')
            if not por_voz:
                enviar(tipo='texto', texto=self.pedido_pela_metade)
                self.pedido_pela_metade = ''
            self.esvaziar_fila()
            return
        if mostrar:
            enviar(tipo='estado', valor='transcrevendo')
        bruto = ''
        inicio = time.time()
        try:
            bruto = self.transcrever(pcm)
        except Exception as e:  # noqa: BLE001
            log('erro ao transcrever:', e)
        log(f'transcrição em {time.time() - inicio:.1f}s:', bruto)
        if por_voz and self.tem_whisper() and not contem_palavra(bruto, self.palavras()):
            log('ativação descartada (não era o nome):', bruto)
            if mostrar:
                enviar(tipo='estado', valor='parado')
            self.esvaziar_fila()
            return
        if not mostrar:
            enviar(tipo='ativacao')  # confirmado: agora sim avisa o app
        texto = remover_palavra_inicio(bruto, self.palavras()) if por_voz else bruto
        if por_voz and not texto:
            # Chamou só pelo nome ("Emy?"): avisa e continua ouvindo o pedido.
            # Não esvazia a fila: o começo do pedido pode ter chegado enquanto transcrevia.
            enviar(tipo='chamado')
            if self.detector:
                self.detector.reiniciar()
            self.ouvir_comando(por_voz=False)
            return
        # Pedido pela metade ("pesquisa...", "abre...", "me fala..."): espera o resto e junta
        incompleto = re.fullmatch(r'(pesquis\w*|procur\w*|busc\w*|abr\w*|toc\w*|coloc\w*|bot\w*|'
                                  r'me (fala|conta|diz|mostra)|quero( ouvir| ver)?)', ' '.join(normalizar(texto)))
        if incompleto and not self.pedido_pela_metade:
            self.pedido_pela_metade = texto.rstrip(' .!?…,')
            log('pedido pela metade, esperando o resto:', texto)
            enviar(tipo='chamado')
            self.ouvir_comando(por_voz=False)
            return
        if self.pedido_pela_metade:
            texto = (self.pedido_pela_metade + ' ' + texto).strip() if texto else self.pedido_pela_metade
            self.pedido_pela_metade = ''
        enviar(tipo='estado', valor='parado')
        enviar(tipo='texto', texto=texto)
        self.esvaziar_fila()

    def gravar(self, blocos_antes, max_seg=12, reportar_nivel=False):
        """Grava até a pessoa terminar de falar. Devolve bytes PCM ou None se ninguém falou.
        O fim da frase é detectado pelo Vosk (funciona mesmo com microfone baixo) e, de reserva,
        pelo volume."""
        sens = float(self.cfg['escuta'].get('sensibilidade', 0.5))
        limiar = max(self.ruido * (3.0 - 1.5 * sens), 120 - 60 * sens)
        rec = self.detector.novo_reconhecedor() if self.detector else None
        antes = list(self.anterior)[-blocos_antes:] if blocos_antes else []
        blocos = []
        falou = vosk_ouviu = False
        silencio = duracao = 0.0
        parcial_anterior, mudou_em = '', 0.0
        while True:
            if self.cancelar.is_set():
                return None
            if antes:  # primeiro analisa o que foi dito logo antes da ativação
                dados = antes.pop(0)
            else:
                try:
                    dados = self.ajustar(self.fila.get(timeout=1.0))
                except queue.Empty:
                    return None
            blocos.append(dados)
            amostras = np.frombuffer(dados, dtype=np.int16).astype(np.float32)
            nivel = float(np.sqrt(np.mean(amostras ** 2))) if amostras.size else 0.0
            passo = len(dados) / 2 / TAXA
            duracao += passo
            if reportar_nivel and len(blocos) % 2 == 0:
                enviar(tipo='nivel', nivel=round(min(1.0, nivel / 3000), 3), pico=int(np.abs(amostras).max()) if amostras.size else 0)
            if nivel > limiar:
                falou, silencio = True, 0.0
            else:
                silencio += passo
            fim_vosk = False
            if rec is not None:
                if rec.AcceptWaveform(dados):
                    if json.loads(rec.Result()).get('text', ''):
                        vosk_ouviu = fim_vosk = True
                else:
                    parcial = json.loads(rec.PartialResult()).get('partial', '')
                    if parcial:
                        vosk_ouviu = True
                    if parcial != parcial_anterior:
                        parcial_anterior, mudou_em = parcial, duracao
            # Fim da frase só com silêncio de verdade: pausas curtas no meio ("pesquisa... receitas")
            # não cortam o pedido.
            if falou and silencio >= 0.9 and (rec is None or duracao - mudou_em >= 0.6):
                break
            if fim_vosk and silencio >= 1.0:
                break
            if vosk_ouviu and duracao - mudou_em >= 1.6 and silencio >= 0.8:
                break
            if not (falou or vosk_ouviu) and duracao >= 7:
                return None
            if duracao >= max_seg:
                break
        return b''.join(blocos)

    def testar_microfone(self):
        """Teste das Configurações: grava uma frase, mostra o volume e o que entendeu."""
        pico_antes = self.microfone.pico if self.microfone else 0
        self.cancelar.clear()
        pcm = self.gravar(blocos_antes=0, max_seg=8, reportar_nivel=True)
        res = {'tipo': 'teste_mic', 'microfone': self.microfone.nome if self.microfone else '',
               'taxa': self.microfone.taxa if self.microfone else 0, 'ruido': round(self.ruido)}
        if pcm is None:
            res.update(ok=False, texto='', pico=0, pico_geral=pico_antes)
        else:
            a = np.frombuffer(pcm, dtype=np.int16)
            texto = ''
            try:
                texto = self.transcrever(pcm)
            except Exception as e:  # noqa: BLE001
                log('teste do microfone: erro ao transcrever', e)
            res.update(ok=bool(texto), texto=texto, pico=int(np.abs(a).max()))
        log('teste do microfone:', json.dumps(res, ensure_ascii=False))
        enviar(**res)
        self.esvaziar_fila()

    def transcrever(self, pcm):
        t = self.transcritor
        if t and t.carregando and not self.detector:
            enviar(tipo='estado', valor='transcrevendo')
            for _ in range(600):  # espera o Whisper terminar de carregar (até 60 s)
                if not t.carregando:
                    break
                time.sleep(0.1)
        if t and t.modelo:
            audio = self.normalizar_volume(np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0)
            return t.transcrever(audio, dica=self.dica_nome())
        if self.detector:
            return self.detector.transcrever(pcm)
        raise RuntimeError('nenhum mecanismo de transcrição disponível')

    def esvaziar_fila(self):
        try:
            while True:
                self.fila.get_nowait()
        except queue.Empty:
            pass
        self.anterior.clear()
        self.em_fala = False
        self.fim_comando = time.time()
        if self.detector:
            self.detector.reiniciar()

    # --- comandos vindos do Electron
    def comando(self, cmd):
        tipo = cmd.get('tipo')
        if tipo == 'ouvir':
            self.pedido_ouvir.set()
        elif tipo == 'cancelar':
            self.cancelar.set()
        elif tipo == 'cancelar_fala':
            self.sintetizador.cancelar()
            self.falando.clear()
            self.fim_fala = time.time()
        elif tipo == 'teste_mic':
            if self.microfone and self.microfone.ativo:
                self.pedido_teste.set()
            else:
                enviar(tipo='teste_mic', ok=False, texto='', pico=0, erro=self.erros.get('microfone') or 'microfone indisponível')
        elif tipo == 'falar':
            # (o "falando" só liga quando o som começa de verdade: comando fala_inicio)
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

    cfg = {'nome': 'Emy', 'escuta': {}, 'voz': {}}
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
