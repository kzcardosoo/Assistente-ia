# -*- coding: utf-8 -*-
"""Gera o PDF 'Guia_Assistente_Virtual_Anime.pdf' (passo a passo da assistente virtual)."""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                PageBreak, Table, TableStyle, Preformatted, KeepTogether,
                                NextPageTemplate)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Sans", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-B", F + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", F + "DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-B", italic="Sans", boldItalic="Sans-B")

ROSA = colors.HexColor("#E84393")
ROXO = colors.HexColor("#6C3FC5")
ESCURO = colors.HexColor("#1E1B2E")
CINZA = colors.HexColor("#5A5670")
CODE_BG = colors.HexColor("#F4F1FA")
DICA_BG = colors.HexColor("#FFF0F7")
AVISO_BG = colors.HexColor("#FFF8E1")

W, H = A4
MARG = 20 * mm

sTitulo = ParagraphStyle("t", fontName="Sans-B", fontSize=20, leading=25, textColor=ROXO,
                         spaceBefore=4, spaceAfter=10)
sSub = ParagraphStyle("s", fontName="Sans-B", fontSize=13, leading=17, textColor=ROSA,
                      spaceBefore=10, spaceAfter=5)
sTxt = ParagraphStyle("p", fontName="Sans", fontSize=9.8, leading=14.2, textColor=ESCURO,
                      spaceAfter=6)
sBul = ParagraphStyle("b", parent=sTxt, leftIndent=14, bulletIndent=4, spaceAfter=3)
sCode = ParagraphStyle("c", fontName="Mono", fontSize=7.4, leading=9.4, textColor=ESCURO)
sCodeTit = ParagraphStyle("ct", fontName="Sans-B", fontSize=8, leading=10, textColor=colors.white)
sCel = ParagraphStyle("cel", fontName="Sans", fontSize=8.6, leading=11.5, textColor=ESCURO)
sCelB = ParagraphStyle("celb", parent=sCel, fontName="Sans-B", textColor=colors.white)


class Doc(BaseDocTemplate):
    def afterFlowable(self, f):
        if isinstance(f, Paragraph) and f.style.name == "t":
            txt = f.getPlainText()
            key = "h%d" % id(f)
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(txt, key, 0)
            self.notify("TOCEntry", (0, txt, self.page, key))


def rodape(c, d):
    c.saveState()
    c.setFillColor(ROSA)
    c.rect(0, H - 6 * mm, W, 6 * mm, stroke=0, fill=1)
    c.setFillColor(ROXO)
    c.rect(0, H - 7.5 * mm, W, 1.5 * mm, stroke=0, fill=1)
    c.setFont("Sans", 8)
    c.setFillColor(CINZA)
    c.drawString(MARG, 10 * mm, "Guia: Assistente Virtual Anime para Desktop")
    c.drawRightString(W - MARG, 10 * mm, "Página %d" % d.page)
    c.restoreState()


def capa(c, d):
    c.saveState()
    c.setFillColor(ESCURO)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    # círculos decorativos
    for (x, y, r, cor, a) in [(W * .85, H * .82, 120, ROSA, .35), (W * .12, H * .2, 160, ROXO, .35),
                              (W * .7, H * .25, 60, ROSA, .25), (W * .25, H * .75, 40, ROXO, .5),
                              (W * .55, H * .55, 230, ROXO, .12)]:
        c.setFillColor(cor)
        c.setFillAlpha(a)
        c.circle(x, y, r, stroke=0, fill=1)
    c.setFillAlpha(1)
    # estrelas/brilhos
    c.setFillColor(colors.white)
    for (x, y, s) in [(80, 700, 3), (480, 560, 2), (150, 420, 2.5), (520, 300, 3), (300, 760, 2),
                      (90, 560, 1.5), (420, 680, 1.5), (250, 300, 2)]:
        p = c.beginPath()
        p.moveTo(x, y + s * 4); p.lineTo(x + s, y + s); p.lineTo(x + s * 4, y); p.lineTo(x + s, y - s)
        p.lineTo(x, y - s * 4); p.lineTo(x - s, y - s); p.lineTo(x - s * 4, y); p.lineTo(x - s, y + s)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
    c.setFillColor(ROSA)
    c.setFont("Sans-B", 13)
    c.drawString(MARG, H * .62, "GUIA PASSO A PASSO")
    c.setFillColor(colors.white)
    c.setFont("Sans-B", 34)
    c.drawString(MARG, H * .62 - 45, "Sua Assistente")
    c.drawString(MARG, H * .62 - 85, "Virtual Anime")
    c.setFont("Sans", 13)
    c.setFillColor(colors.HexColor("#D9D2F0"))
    for i, l in enumerate(["Uma personagem que vive na sua área de trabalho: ouve, fala com",
                           "voz realista, conversa com IA gratuita ou local, abre sites e",
                           "programas, dança com a música e passeia pela tela."]):
        c.drawString(MARG, H * .62 - 125 - i * 19, l)
    c.setFillColor(ROSA)
    c.roundRect(MARG, H * .62 - 215, 250, 30, 8, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Sans-B", 11)
    c.drawString(MARG + 14, H * .62 - 205, "Electron  +  VRM  +  Python  +  IA")
    c.setFont("Sans", 9)
    c.setFillColor(colors.HexColor("#A79FC4"))
    c.drawString(MARG, 18 * mm, "Versão 1.0  •  Novembro de 2026  •  Windows 10/11 (com notas para Linux e macOS)")
    c.restoreState()


def P(t):
    return Paragraph(t, sTxt)


def T(t):
    return Paragraph(t, sTitulo)


def S(t):
    return Paragraph(t, sSub)


def B(itens):
    return [Paragraph(i, sBul, bulletText="•") for i in itens]


def code(texto, titulo=None):
    linhas = texto.strip("\n").split("\n")
    rows = []
    if titulo:
        rows.append([Paragraph(titulo, sCodeTit)])
    rows += [[Preformatted(l if l else " ", sCode)] for l in linhas]
    t = Table(rows, colWidths=[W - 2 * MARG])
    est = [("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
           ("TOPPADDING", (0, 0), (-1, -1), 0.4), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.4),
           ("LINEBEFORE", (0, 0), (0, -1), 2.5, ROXO)]
    if titulo:
        est += [("BACKGROUND", (0, 0), (-1, 0), ROXO), ("TOPPADDING", (0, 0), (-1, 0), 3),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 3)]
    est += [("BOTTOMPADDING", (0, -1), (-1, -1), 5)]
    if not titulo:
        est += [("TOPPADDING", (0, 0), (-1, 0), 5)]
    t.setStyle(TableStyle(est))
    if len(linhas) <= 52:
        return [KeepTogether([t, Spacer(1, 8)])]
    return [t, Spacer(1, 8)]


def caixa(texto, tipo="dica"):
    cor, bg, rot = (ROSA, DICA_BG, "DICA") if tipo == "dica" else (colors.HexColor("#E0A800"), AVISO_BG, "ATENÇÃO")
    t = Table([[Paragraph("<b>%s:</b> %s" % (rot, texto), sCel)]], colWidths=[W - 2 * MARG])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("LINEBEFORE", (0, 0), (0, -1), 3, cor),
                           ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 6),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return [t, Spacer(1, 8)]


def tabela(dados, larguras):
    rows = [[Paragraph(c, sCelB if i == 0 else sCel) for c in r] for i, r in enumerate(dados)]
    t = Table(rows, colWidths=larguras, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), ROXO),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CODE_BG]),
                           ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D8D2EA")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return [t, Spacer(1, 10)]


CW = W - 2 * MARG
story = [NextPageTemplate("normal"), PageBreak()]

# ---------------------------------------------------------------- Sumário
story.append(Paragraph("Sumário", ParagraphStyle("sum", parent=sTitulo)))
toc = TableOfContents()
toc.levelStyles = [ParagraphStyle("toc", fontName="Sans", fontSize=10.5, leading=17, textColor=ESCURO)]
story += [toc, PageBreak()]

# ---------------------------------------------------------------- 1
story.append(T("1. O que vamos construir"))
story.append(P("Este guia mostra, do zero, como criar uma <b>assistente virtual de desktop</b> com corpo de "
               "personagem feminina de anime. Ela aparece sozinha na tela, sem janela, sem fundo e sem "
               "moldura, como se estivesse em cima da área de trabalho. Nos exemplos ela se chama "
               "<b>Aiko</b>, mas o nome, a aparência e a personalidade são todos configuráveis."))
story.append(S("Funcionalidades"))
story += B([
    "<b>Conversa com IA</b>: cada usuária conecta a própria chave de uma API gratuita (Google Gemini, Groq, "
    "OpenRouter) ou usa uma IA <b>local e off-line</b> com o Ollama.",
    "<b>Duas formas de ativar</b>: dizendo a palavra de ativação (\"Aiko\") ou clicando nela para que comece a ouvir.",
    "<b>Voz feminina realista</b>: Edge TTS (on-line, gratuita, neural) ou Kokoro TTS (off-line).",
    "<b>Ações no computador</b>: abre pesquisas e abas no Google de acordo com os gostos da usuária e abre "
    "programas quando alguém pede.",
    "<b>Dança</b> quando detecta música tocando no computador, no ritmo da batida.",
    "<b>Passeia pela tela</b> sozinha e pode ser arrastada com o mouse.",
    "<b>Parece viva</b>: pisca, respira, segue o cursor com o olhar, muda de expressão, sincroniza a boca "
    "com a fala, cochila quando o PC fica ocioso.",
    "<b>Comentários espontâneos</b> a cada X minutos, com intervalo ajustável.",
    "<b>Tudo ligável e desligável</b> em um painel de configurações.",
])
story.append(S("Arquitetura"))
story.append(P("O projeto tem três partes que conversam entre si. Essa divisão deixa cada parte simples e "
               "permite trocar peças (por exemplo, outro motor de voz) sem mexer no resto."))
story += tabela([
    ["Parte", "Tecnologia", "Responsabilidade"],
    ["Janela e sistema", "Electron (Node.js) — main.js",
     "Janela transparente, sempre no topo, clique atravessando o fundo, mover a janela, abrir sites e "
     "programas, chamar a IA, guardar configurações e chaves."],
    ["Corpo da personagem", "Three.js + @pixiv/three-vrm (renderer)",
     "Desenhar a modelo 3D anime (.vrm), animações de idle, dança, caminhada, expressões, olhar e boca."],
    ["Ouvido e voz", "Python: Vosk, faster-whisper, edge-tts, Kokoro",
     "Palavra de ativação, transcrição da fala, geração da voz. Conversa com o Electron por stdin/stdout "
     "em linhas JSON."],
    ["Cérebro", "Qualquer API compatível com OpenAI",
     "Gemini, Groq, OpenRouter ou Ollama local. Devolve a fala, a emoção e as ações em JSON."],
], [32 * mm, 48 * mm, CW - 80 * mm])
story += code("""
 Usuária fala "Aiko, abre o Spotify"  ou  clica na personagem
          |
          v
 [voz.py]  Vosk ouve a palavra de ativação -> grava até silêncio -> Whisper transcreve
          |  {"tipo":"texto","texto":"abre o Spotify"}
          v
 [main.js] envia o texto para a IA escolhida (Gemini / Groq / OpenRouter / Ollama)
          |  {"fala":"Abrindo!","emocao":"feliz","acoes":[{"tipo":"abrir_programa","nome":"spotify"}]}
          v
 [main.js] executa as ações permitidas  +  manda a fala para voz.py gerar o áudio
          v
 [renderer] toca o áudio, mexe a boca, muda a expressão, faz um gesto
""", "Fluxo de uma interação")
story.append(PageBreak())

# ---------------------------------------------------------------- 2
story.append(T("2. Ferramentas e requisitos"))
story += tabela([
    ["Item", "Para quê", "Onde obter"],
    ["Node.js 20 LTS ou mais novo", "Rodar o Electron", "nodejs.org"],
    ["Python 3.11", "Ouvido e voz (voz.py)", "python.org (marque \"Add to PATH\")"],
    ["VS Code", "Editar o código", "code.visualstudio.com"],
    ["VRoid Studio", "Criar a personagem anime 3D e exportar .vrm", "vroid.com/studio (grátis)"],
    ["Ollama (opcional)", "IA local e off-line", "ollama.com"],
    ["Modelo Vosk PT", "Palavra de ativação off-line", "alphacephei.com/vosk/models (vosk-model-small-pt-0.3)"],
    ["espeak-ng (opcional)", "Necessário para a voz off-line Kokoro", "github.com/espeak-ng/espeak-ng/releases"],
    ["Animações .vrma", "Dança, caminhada, acenos", "VRoid Hub / pacotes de VRM Animation gratuitos"],
], [42 * mm, 55 * mm, CW - 97 * mm])
story.append(S("Hardware recomendado"))
story += B([
    "Usando APIs on-line: qualquer PC com 8 GB de RAM e placa de vídeo integrada.",
    "Usando IA local (Ollama): 16 GB de RAM; com GPU de 6 GB+ de VRAM as respostas ficam bem mais rápidas.",
    "Microfone (headset de preferência, para ela não ouvir a própria voz).",
])
story.append(S("Estrutura de pastas do projeto"))
story += code("""
aiko-assistente/
|-- package.json
|-- main.js              <- processo principal do Electron (janela, IA, ações)
|-- preload.js           <- ponte segura entre o main e a página
|-- ia.js                <- cliente de IA (Gemini, Groq, OpenRouter, Ollama)
|-- config.js            <- leitura/gravação das configurações
|-- renderer/
|   |-- index.html       <- a "tela" transparente onde a personagem é desenhada
|   |-- personagem.js    <- carrega o VRM, idle, expressões, boca
|   |-- danca.js         <- detecção de música e dança
|   |-- movimento.js     <- passear pela tela e arrastar
|   `-- configuracoes.html  <- painel de configurações
|-- modelos/aiko.vrm
|-- animacoes/ (danca1.vrma, andar.vrma, acenar.vrma ...)
`-- python/
    |-- voz.py           <- palavra de ativação, transcrição e voz
    |-- requirements.txt
    `-- modelos/vosk-model-small-pt-0.3/
""")
story.append(PageBreak())

# ---------------------------------------------------------------- 3
story.append(T("3. Passo 1 — Criar a personagem anime"))
story.append(P("A forma mais fácil e legal de ter uma personagem original e chamativa é o <b>VRoid Studio</b>, "
               "um programa gratuito feito exatamente para criar modelos de anime 3D. Ele exporta no formato "
               "<b>VRM</b>, que já vem com esqueleto, expressões faciais (piscar, sorrir, vogais da boca) e física de "
               "cabelo e roupa, ou seja, tudo o que a assistente precisa."))
story.append(S("Dicas para um visual chamativo"))
story += B([
    "<b>Cores fortes e contrastantes</b>: cabelo rosa-chiclete, lilás ou prata com mechas coloridas; olhos "
    "grandes com brilho (use texturas de íris com dois tons).",
    "<b>Silhueta marcante</b>: rabo de cavalo alto ou maria-chiquinha, laço grande, fones de gatinho, jaqueta "
    "oversized. Isso deixa ela reconhecível mesmo pequena na tela.",
    "<b>Contorno (outline)</b>: aumente a espessura do contorno no VRoid. Ajuda a personagem a se destacar "
    "contra qualquer papel de parede.",
    "<b>Física</b>: ative a física do cabelo e da saia. Ao andar e dançar, o balanço deixa ela muito mais viva.",
    "<b>Expressões</b>: confira na aba de expressões se Joy, Angry, Sorrow, Surprised, Blink e as vogais A, I, U, "
    "E, O estão bem ajustadas.",
])
story.append(S("Exportando"))
story += B([
    "No VRoid Studio: <b>Câmera/Exportar -> Exportar como VRM</b>. Escolha VRM 1.0.",
    "Reduza polígonos/texturas (2048 px é suficiente) para a assistente ficar leve no PC.",
    "Salve como <b>modelos/aiko.vrm</b>.",
])
story += caixa("Use uma personagem <b>original</b>. Modelos baixados do VRoid Hub ou BOOTH têm licença própria: "
               "confira se permitem uso em aplicativos e redistribuição antes de publicar o programa. Não use "
               "personagens de animes existentes se for distribuir o app.", "aviso")
story.append(S("Animações"))
story.append(P("O VRM usa animações no formato <b>.vrma</b> (VRM Animation). Procure pacotes gratuitos de "
               "\"VRM Animation\" (a própria pixiv disponibiliza um pacote de exemplo com várias poses) e "
               "animações de dança com licença livre. Também dá para converter animações do Mixamo (FBX) para VRMA "
               "com ferramentas da comunidade. Coloque em <b>animacoes/</b>: pelo menos uma de "
               "<b>dança</b>, uma de <b>andar</b> e uma de <b>acenar</b>."))
story += caixa("Alternativa 2D: se preferir um estilo \"VTuber 2D\", use um modelo <b>Live2D</b> com a biblioteca "
               "pixi-live2d-display. A lógica do resto do guia (janela, IA, voz, ações) é a mesma; muda só o "
               "arquivo personagem.js.")
story.append(PageBreak())

# ---------------------------------------------------------------- 4
story.append(T("4. Passo 2 — Projeto Electron e janela transparente"))
story.append(P("Abra um terminal em uma pasta vazia chamada <b>aiko-assistente</b> e rode:"))
story += code("""
npm init -y
npm install three @pixiv/three-vrm @pixiv/three-vrm-animation
npm install --save-dev electron electron-builder
""", "Terminal")
story.append(P("Edite o <b>package.json</b> para ter o ponto de entrada e os scripts:"))
story += code("""
{
  "name": "aiko-assistente",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": { "start": "electron .", "dist": "electron-builder" },
  "build": { "appId": "com.seunome.aiko", "files": ["**/*"],
             "extraResources": ["python/**", "modelos/**", "animacoes/**"] }
}
""", "package.json (trecho)")
story.append(S("Só ela na tela: a janela invisível"))
story.append(P("O segredo para a personagem aparecer \"solta\" na área de trabalho é uma janela "
               "<b>transparente, sem moldura, sem sombra, fora da barra de tarefas e sempre no topo</b>. Além "
               "disso, os cliques no espaço vazio ao redor dela precisam <b>atravessar</b> a janela e chegar ao "
               "que está atrás. Fazemos isso com <b>setIgnoreMouseEvents(true, { forward: true })</b>: a janela ignora "
               "cliques, mas continua recebendo o movimento do mouse, e a página avisa quando o cursor está em cima "
               "da personagem."))
story += code("""
const { app, BrowserWindow, ipcMain, shell, screen, session,
        desktopCapturer, powerMonitor } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const ia = require('./ia');

let win, janelaConfig, voz;

function criarJanela() {
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: 380, height: 560,
    x: area.x + area.width - 400, y: area.y + area.height - 560,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'),
                      contextIsolation: true, nodeIntegration: false }
  });
  win.setAlwaysOnTop(true, 'screen-saver');      // fica acima até de janelas em tela cheia
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true }); // cliques atravessam por padrão
  win.loadFile('renderer/index.html');
}

// a página avisa se o mouse está sobre um pixel visível da personagem
ipcMain.on('mouse-sobre', (_e, sobre) => win.setIgnoreMouseEvents(!sobre, { forward: true }));
ipcMain.on('mover-janela', (_e, { x, y }) => win.setPosition(Math.round(x), Math.round(y)));
ipcMain.handle('info-tela', () => ({ area: screen.getDisplayMatching(win.getBounds()).workArea,
                                     janela: win.getBounds() }));
ipcMain.handle('tempo-ocioso', () => powerMonitor.getSystemIdleTime());

app.whenReady().then(() => {
  // permite capturar o áudio do sistema (para saber se há música tocando)
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then(fontes => cb({ video: fontes[0], audio: 'loopback' }));
  });
  criarJanela();
  iniciarVoz();          // passo 5
});
app.on('window-all-closed', () => app.quit());
""", "main.js — parte 1: a janela")
story += code("""
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aiko', {
  mouseSobre: (v) => ipcRenderer.send('mouse-sobre', v),
  moverJanela: (pos) => ipcRenderer.send('mover-janela', pos),
  infoTela: () => ipcRenderer.invoke('info-tela'),
  tempoOcioso: () => ipcRenderer.invoke('tempo-ocioso'),
  ouvir: () => ipcRenderer.send('ouvir'),
  config: () => ipcRenderer.invoke('config-ler'),
  salvarConfig: (c) => ipcRenderer.invoke('config-salvar', c),
  pedirComentario: () => ipcRenderer.invoke('comentario'),
  abrirConfiguracoes: () => ipcRenderer.send('abrir-config'),
  on: (canal, fn) => ipcRenderer.on(canal, (_e, dados) => fn(dados)),
});
""", "preload.js")
story += code("""
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin:0; background: transparent !important; overflow:hidden; }
  canvas { display:block; }
  #balao { position:absolute; top:8px; left:50%; transform:translateX(-50%); max-width:300px;
    padding:8px 12px; border-radius:14px; background:#fff; color:#333; font:14px sans-serif;
    box-shadow:0 2px 8px #0004; display:none; }
</style>
<script type="importmap">
{ "imports": {
  "three": "../node_modules/three/build/three.module.js",
  "three/addons/": "../node_modules/three/examples/jsm/",
  "@pixiv/three-vrm": "../node_modules/@pixiv/three-vrm/lib/three-vrm.module.js",
  "@pixiv/three-vrm-animation":
      "../node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.js"
} }
</script></head>
<body><div id="balao"></div>
<script type="module" src="personagem.js"></script></body></html>
""", "renderer/index.html")
story += caixa("Rode <b>npm start</b>. Nesse ponto aparece uma janela totalmente invisível; a personagem entra no "
               "próximo passo. Se aparecer um fundo preto no Windows, confira se a aceleração de hardware está "
               "ativa e se <b>transparent: true</b> e o <b>background: transparent</b> do CSS estão corretos. No "
               "Linux, rode com um compositor ativo (ex.: <b>--enable-transparent-visuals</b>).")
story.append(PageBreak())

# ---------------------------------------------------------------- 5
story.append(T("5. Passo 3 — Dar vida à personagem"))
story.append(P("Agora carregamos o arquivo .vrm com Three.js e adicionamos os detalhes que fazem ela "
               "<b>parecer viva</b>: respiração, piscadas em intervalos aleatórios, olhar seguindo o cursor, "
               "pequenos movimentos de cabeça, expressões e a boca acompanhando a voz."))
story += code("""
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { iniciarDanca } from './danca.js';
import { iniciarMovimento, foiArrastada } from './movimento.js';

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true,
                                           preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);              // fundo 100% transparente
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 20);
camera.position.set(0, 0.95, 3.6);
camera.lookAt(0, 0.85, 0);
const luz = new THREE.DirectionalLight(0xffffff, 2.2);
luz.position.set(1, 2, 2);
cena.add(luz, new THREE.AmbientLight(0xffffff, 0.8));

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));
loader.register(p => new VRMAnimationLoaderPlugin(p));

const vrm = (await loader.loadAsync('../modelos/aiko.vrm')).userData.vrm;
VRMUtils.removeUnnecessaryVertices(vrm.scene);
VRMUtils.rotateVRM0(vrm);                          // corrige modelos VRM 0.x
cena.add(vrm.scene);

export const mixer = new THREE.AnimationMixer(vrm.scene);
export async function carregarAnimacao(arquivo) {
  const g = await loader.loadAsync('../animacoes/' + arquivo);
  return mixer.clipAction(createVRMAnimationClip(g.userData.vrmAnimations[0], vrm));
}
export { vrm };
""", "renderer/personagem.js — parte 1: carregar a modelo")
story += code("""
// ---------- olhar seguindo o mouse ----------
const alvoOlhar = new THREE.Object3D();
camera.add(alvoOlhar); cena.add(camera);
vrm.lookAt.target = alvoOlhar;
window.addEventListener('mousemove', (e) => {
  alvoOlhar.position.set((e.clientX / innerWidth - 0.5) * 2, -(e.clientY / innerHeight - 0.5), -1);
  verificarMouseSobre(e.clientX, e.clientY);
});

// ---------- cliques só onde a personagem existe ----------
const gl = renderer.getContext(); const px = new Uint8Array(4);
let sobreAnterior = false;
function verificarMouseSobre(x, y) {
  const r = devicePixelRatio;
  gl.readPixels(x * r, (innerHeight - y) * r, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const sobre = px[3] > 20;                       // pixel não transparente = personagem
  if (sobre !== sobreAnterior) { window.aiko.mouseSobre(sobre); sobreAnterior = sobre; }
}

// ---------- expressões e boca ----------
const em = vrm.expressionManager;
let emocaoAtual = 'neutral', bocaAlvo = 0, bocaAtual = 0;
export function mudarEmocao(nome, duracaoMs = 4000) {
  const mapa = { feliz: 'happy', triste: 'sad', brava: 'angry', surpresa: 'surprised',
                 relaxada: 'relaxed', neutra: 'neutral' };
  ['happy', 'sad', 'angry', 'surprised', 'relaxed'].forEach(n => em.setValue(n, 0));
  emocaoAtual = mapa[nome] || 'neutral';
  setTimeout(() => (emocaoAtual = 'neutral'), duracaoMs);
}
export function setBoca(v) { bocaAlvo = v; }      // 0..1, chamado pela fala (passo 6)

// ---------- piscar em intervalos aleatórios ----------
let proximaPiscada = 2, piscando = 0;

// ---------- loop principal ----------
const relogio = new THREE.Clock(); let t = 0;
function animar() {
  requestAnimationFrame(animar);
  const dt = relogio.getDelta(); t += dt;

  // respiração e micro-movimentos (se nenhuma animação estiver tocando)
  const peito = vrm.humanoid.getNormalizedBoneNode('chest');
  const cabeca = vrm.humanoid.getNormalizedBoneNode('head');
  if (peito) peito.rotation.x = Math.sin(t * 1.6) * 0.02;
  if (cabeca) { cabeca.rotation.z = Math.sin(t * 0.5) * 0.04; cabeca.rotation.y = Math.sin(t * 0.3) * 0.05; }

  // piscar
  proximaPiscada -= dt;
  if (proximaPiscada <= 0) { piscando = 0.15; proximaPiscada = 2 + Math.random() * 4; }
  if (piscando > 0) { piscando -= dt; em.setValue('blink', 1); } else em.setValue('blink', 0);

  // boca suavizada
  bocaAtual += (bocaAlvo - bocaAtual) * 0.4;
  em.setValue('aa', bocaAtual);
  if (emocaoAtual !== 'neutral') em.setValue(emocaoAtual, 0.8);

  mixer.update(dt);
  vrm.update(dt);
  renderer.render(cena, camera);
}
animar();
""", "renderer/personagem.js — parte 2: parecer viva")
story += code("""
// clique = começar a ouvir;  botão direito = abrir configurações
window.addEventListener('mousedown', (e) => {
  if (e.button === 2) return window.aiko.abrirConfiguracoes();
});
window.addEventListener('click', async () => {
  if (foiArrastada()) return;                     // soltou depois de arrastar: não ouvir
  const cfg = await window.aiko.config();
  if (cfg.clique_para_ouvir) { mudarEmocao('surpresa', 1200); window.aiko.ouvir(); }
});
const balao = document.getElementById('balao');
export function mostrarBalao(texto, ms = 6000) {
  balao.textContent = texto; balao.style.display = 'block';
  clearTimeout(balao._t); balao._t = setTimeout(() => (balao.style.display = 'none'), ms);
}
window.aiko.on('estado', (s) => { if (s === 'ouvindo') mostrarBalao('Estou ouvindo...', 3000); });
window.aiko.on('resposta', (r) => { mostrarBalao(r.fala); mudarEmocao(r.emocao); });

const cfg = await window.aiko.config();
iniciarDanca(cfg);
iniciarMovimento(cfg);
""", "renderer/personagem.js — parte 3: interação")
story += caixa("Outros toques de \"vida\" fáceis de adicionar: cumprimentar de acordo com a hora (\"Bom dia!\" na "
               "primeira abertura do dia), fazer cara de sono e fechar os olhos quando "
               "<b>tempoOcioso()</b> passar de 10 minutos, reagir com <b>surpresa</b> quando é arrastada, "
               "e tocar uma animação de acenar quando a usuária volta ao PC.")
story.append(PageBreak())

# ---------------------------------------------------------------- 6
story.append(T("6. Passo 4 — O cérebro: IA gratuita ou local"))
story.append(P("Todos os provedores abaixo aceitam o <b>mesmo formato de requisição</b> (compatível com a API "
               "da OpenAI). Então um único cliente atende todos, e a usuária só escolhe o provedor e cola a "
               "própria chave no painel de configurações. Com o Ollama não há chave: tudo roda no PC, "
               "<b>sem internet</b>."))
story += tabela([
    ["Provedor", "Custo", "Como conseguir a chave", "Modelo sugerido"],
    ["Google Gemini", "Camada gratuita com limite diário", "aistudio.google.com -> Get API key", "gemini-2.5-flash"],
    ["Groq", "Camada gratuita, respostas muito rápidas", "console.groq.com -> API Keys", "llama-3.3-70b-versatile"],
    ["OpenRouter", "Modelos marcados como \":free\"", "openrouter.ai -> Keys", "um modelo terminado em :free"],
    ["Ollama (local)", "Grátis, off-line", "Instale e rode: ollama pull qwen2.5:7b", "qwen2.5:7b ou gemma3"],
], [30 * mm, 38 * mm, 55 * mm, CW - 123 * mm])
story += caixa("Os nomes dos modelos e os limites gratuitos mudam com frequência. Deixe o campo \"modelo\" "
               "editável no painel e confira a página de cada provedor.", "aviso")
story.append(S("Personalidade e formato da resposta"))
story.append(P("Pedimos para a IA responder sempre em <b>JSON</b>, com o texto da fala, a emoção e uma lista de "
               "ações. Assim a mesma resposta faz ela falar, mudar a cara e agir no computador."))
story += code("""
const PROVEDORES = {
  gemini:     { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
  groq:       { url: 'https://api.groq.com/openai/v1/chat/completions' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions' },
  ollama:     { url: 'http://localhost:11434/v1/chat/completions' },
};

function promptSistema(cfg) {
  return `Você é ${cfg.nome}, uma assistente virtual anime que vive na área de trabalho de
${cfg.nome_usuaria}. Personalidade: ${cfg.personalidade}.
Gostos da usuária: ${cfg.interesses.join(', ')}.
Responda SEMPRE apenas com JSON neste formato:
{"fala": "texto curto e natural, no máximo 2 frases",
 "emocao": "feliz|triste|brava|surpresa|relaxada|neutra",
 "acoes": [ {"tipo":"pesquisar","termo":"..."},
            {"tipo":"abrir_site","url":"https://..."},
            {"tipo":"abrir_programa","nome":"..."},
            {"tipo":"dancar"} ]}
Programas que você pode abrir: ${Object.keys(cfg.programas).join(', ')}.
Use "acoes": [] quando não precisar fazer nada. Nunca invente programas fora da lista.`;
}

const historico = [];
async function perguntar(texto, cfg) {
  historico.push({ role: 'user', content: texto });
  while (historico.length > 16) historico.shift();          // memória curta
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.ia.provedor !== 'ollama') headers.Authorization = 'Bearer ' + cfg.ia.chave;
  const r = await fetch(PROVEDORES[cfg.ia.provedor].url, {
    method: 'POST', headers,
    body: JSON.stringify({ model: cfg.ia.modelo, temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: promptSistema(cfg) }, ...historico] })
  });
  if (!r.ok) throw new Error('IA respondeu ' + r.status + ': ' + await r.text());
  const bruto = (await r.json()).choices[0].message.content;
  historico.push({ role: 'assistant', content: bruto });
  try { return JSON.parse(bruto.match(/\\{[\\s\\S]*\\}/)[0]); }
  catch { return { fala: bruto, emocao: 'neutra', acoes: [] }; }  // modelo não mandou JSON
}
module.exports = { perguntar };
""", "ia.js")
story += caixa("Guarde a chave da usuária criptografada com <b>safeStorage.encryptString()</b> do Electron "
               "(veja o passo 11). Nunca coloque uma chave sua no código: cada usuária usa a dela.")
story.append(PageBreak())

# ---------------------------------------------------------------- 7
story.append(T("7. Passo 5 — Ouvir: palavra de ativação e clique"))
story.append(P("A parte de áudio fica em um pequeno programa Python, o <b>voz.py</b>, que o Electron inicia "
               "junto com o app. Ele faz três coisas:"))
story += B([
    "<b>Vosk</b> fica ouvindo o microfone o tempo todo, off-line e com pouquíssima CPU, só esperando a "
    "palavra de ativação (ex.: \"Aiko\").",
    "Quando ouve a palavra, <b>ou quando a usuária clica na personagem</b>, grava até a pessoa parar de falar.",
    "<b>faster-whisper</b> transcreve a frase com ótima precisão em português, também off-line.",
])
story += code("""
pip install vosk sounddevice numpy faster-whisper edge-tts
# voz off-line (opcional):
pip install kokoro soundfile
""", "python/requirements.txt  (instale com: pip install -r requirements.txt)")
story += code("""
import sys, json, queue, threading, tempfile, asyncio, os, time
import numpy as np, sounddevice as sd
from vosk import Model, KaldiRecognizer
from faster_whisper import WhisperModel

CFG = json.load(open(sys.argv[1], encoding='utf-8'))
TAXA = 16000
fila = queue.Queue()
ouvir_agora = threading.Event()
falando = threading.Event()          # enquanto ela fala, não escuta a si mesma

def enviar(**msg):
    print(json.dumps(msg, ensure_ascii=False), flush=True)

def ao_receber_audio(dados, frames, tempo, status):
    fila.put(bytes(dados))

palavra = CFG['palavra_ativacao'].lower()
vosk = Model(CFG['modelo_vosk'])
rec = KaldiRecognizer(vosk, TAXA, json.dumps([palavra, '[unk]']))
whisper = WhisperModel(CFG['modelo_whisper'], device='cpu', compute_type='int8')

def gravar_ate_silencio(max_seg=12, silencio_seg=1.2, limite=500):
    blocos, silencio, falou = [], 0.0, False
    while True:
        b = np.frombuffer(fila.get(), dtype=np.int16)
        blocos.append(b)
        if np.abs(b).mean() > limite: falou, silencio = True, 0.0
        else: silencio += len(b) / TAXA
        duracao = sum(len(x) for x in blocos) / TAXA
        if (falou and silencio > silencio_seg) or duracao > max_seg or (not falou and duracao > 5):
            break
    audio = np.concatenate(blocos).astype(np.float32) / 32768
    segs, _ = whisper.transcribe(audio, language='pt', vad_filter=True)
    return ' '.join(s.text for s in segs).strip()
""", "python/voz.py — parte 1: ouvir")
story += code("""
def loop_microfone():
    with sd.RawInputStream(samplerate=TAXA, blocksize=4000, dtype='int16',
                           channels=1, callback=ao_receber_audio):
        enviar(tipo='pronto')
        while True:
            if ouvir_agora.is_set():
                ouvir_agora.clear()
                with fila.mutex: fila.queue.clear()
                enviar(tipo='estado', valor='ouvindo')
                texto = gravar_ate_silencio()
                enviar(tipo='texto', texto=texto)
                rec.Reset()
                continue
            dados = fila.get()
            if falando.is_set() or not CFG['ativacao_por_voz']:
                continue
            if rec.AcceptWaveform(dados):
                if palavra in json.loads(rec.Result()).get('text', ''):
                    ouvir_agora.set()

def ler_comandos():                  # comandos que chegam do Electron
    for linha in sys.stdin:
        cmd = json.loads(linha)
        if cmd['tipo'] == 'ouvir':
            ouvir_agora.set()
        elif cmd['tipo'] == 'falar':
            threading.Thread(target=falar, args=(cmd['texto'],), daemon=True).start()
        elif cmd['tipo'] == 'fim_fala':
            falando.clear()
        elif cmd['tipo'] == 'config':
            CFG.update(cmd['dados'])

threading.Thread(target=ler_comandos, daemon=True).start()
# a função falar() está no passo 6
""", "python/voz.py — parte 2: loop do microfone")
story.append(P("No Electron, iniciamos o Python e trocamos mensagens por linhas JSON:"))
story += code("""
const readline = require('readline');
const fs = require('fs');
function iniciarVoz() {
  const cfg = config.ler();
  const arqCfg = path.join(app.getPath('userData'), 'voz.json');
  fs.writeFileSync(arqCfg, JSON.stringify(cfg.voz));
  voz = spawn('python', [path.join(__dirname, 'python', 'voz.py'), arqCfg],
              { cwd: path.join(__dirname, 'python') });
  readline.createInterface({ input: voz.stdout }).on('line', async (linha) => {
    const msg = JSON.parse(linha);
    if (msg.tipo === 'estado') win.webContents.send('estado', msg.valor);
    if (msg.tipo === 'texto' && msg.texto) await responder(msg.texto);
    if (msg.tipo === 'audio') win.webContents.send('tocar-audio', msg.caminho);
  });
  voz.stderr.on('data', d => console.error('[voz]', d.toString()));
}
const enviarVoz = (obj) => voz.stdin.write(JSON.stringify(obj) + '\\n');
ipcMain.on('ouvir', () => enviarVoz({ tipo: 'ouvir' }));
ipcMain.on('fim-fala', () => enviarVoz({ tipo: 'fim_fala' }));
""", "main.js — parte 2: ligar o voz.py")
story += caixa("Palavras de ativação curtas e incomuns funcionam melhor (\"Aiko\", \"Yuki\", \"Sakura\"). O Vosk "
               "só reconhece palavras que existem no vocabulário do modelo; se o nome não for detectado, "
               "teste variações de escrita (\"aico\") e coloque as duas na lista.")
story.append(PageBreak())

# ---------------------------------------------------------------- 8
story.append(T("8. Passo 6 — Voz feminina realista e boca sincronizada"))
story.append(P("Duas opções, escolhidas no painel:"))
story += tabela([
    ["Motor", "Tipo", "Vozes femininas PT-BR", "Observações"],
    ["Edge TTS", "On-line, gratuito", "pt-BR-FranciscaNeural, pt-BR-ThalitaNeural",
     "Vozes neurais da Microsoft, muito naturais. Ajuste velocidade e tom (rate/pitch)."],
    ["Kokoro TTS", "Off-line", "pf_dora", "Roda na CPU. Precisa do espeak-ng instalado."],
    ["XTTS v2 / F5-TTS", "Off-line, avançado", "Clona qualquer voz de um áudio de 10 s",
     "Mais pesado (ideal com GPU). Use somente vozes que você tem direito de usar."],
], [28 * mm, 28 * mm, 50 * mm, CW - 106 * mm])
story += code("""
_kokoro = None
def falar(texto):
    global _kokoro
    falando.set()
    base = os.path.join(tempfile.gettempdir(), f'aiko_{int(time.time()*1000)}')
    if CFG['motor'] == 'edge':
        import edge_tts
        caminho = base + '.mp3'
        asyncio.run(edge_tts.Communicate(texto, CFG['voz_edge'],
                    rate=CFG['velocidade'], pitch=CFG['tom']).save(caminho))
    else:
        from kokoro import KPipeline
        import soundfile as sf
        if _kokoro is None:
            _kokoro = KPipeline(lang_code='p')       # 'p' = português do Brasil
        caminho = base + '.wav'
        partes = [audio for _, _, audio in _kokoro(texto, voice='pf_dora')]
        sf.write(caminho, np.concatenate(partes), 24000)
    enviar(tipo='audio', caminho=caminho)

loop_microfone()   # última linha do arquivo: inicia a escuta
""", "python/voz.py — parte 3: falar")
story.append(P("No renderer, tocamos o áudio e usamos um <b>analisador de volume</b> para abrir e fechar a "
               "boca no ritmo da fala. É simples e o resultado fica muito convincente:"))
story += code("""
import { setBoca } from './personagem.js';
const ctx = new AudioContext();
window.aiko.on('tocar-audio', async (caminho) => {
  const audio = new Audio('file://' + caminho);
  const fonte = ctx.createMediaElementSource(audio);
  const analisador = ctx.createAnalyser(); analisador.fftSize = 512;
  fonte.connect(analisador); analisador.connect(ctx.destination);
  const dados = new Uint8Array(analisador.frequencyBinCount);
  let rodando = true;
  (function boca() {
    if (!rodando) return setBoca(0);
    analisador.getByteFrequencyData(dados);
    const vol = dados.slice(4, 60).reduce((a, b) => a + b, 0) / (56 * 255);
    setBoca(Math.min(1, vol * 3));
    requestAnimationFrame(boca);
  })();
  const avisar = (v) => window.dispatchEvent(new CustomEvent('aiko-fala', { detail: v }));
  audio.onended = () => { rodando = false; avisar(false); window.aiko.fimFala(); };
  avisar(true);
  await audio.play();
});
""", "renderer/fala.js")
story += caixa("Adicione <b>fimFala: () => ipcRenderer.send('fim-fala')</b> no preload.js e "
               "<b>import './fala.js';</b> no início do personagem.js. Para uma boca ainda mais realista, alterne entre as expressões aa, ih, ou, ee e oh "
               "conforme a faixa de frequência dominante.")
story.append(PageBreak())

# ---------------------------------------------------------------- 9
story.append(T("9. Passo 7 — Ações: pesquisar, abrir abas e programas"))
story.append(P("Quando a IA devolve a lista de ações, o main.js executa apenas o que estiver "
               "<b>permitido nas configurações</b>. Programas só abrem se estiverem em uma lista que a própria "
               "usuária cadastrou. Isso evita que uma resposta errada da IA execute qualquer coisa no PC."))
story += code("""
async function responder(texto) {
  const cfg = config.ler();
  let resp;
  try { resp = await ia.perguntar(texto, cfg); }
  catch (e) { resp = { fala: 'Hmm, não consegui falar com a IA. Confere a chave?', emocao: 'triste',
                       acoes: [] }; console.error(e); }
  win.webContents.send('resposta', resp);           // balão + expressão
  if (cfg.voz_ativa) enviarVoz({ tipo: 'falar', texto: resp.fala });
  for (const a of resp.acoes || []) executarAcao(a, cfg);
}

function executarAcao(a, cfg) {
  switch (a.tipo) {
    case 'pesquisar':
      if (cfg.abrir_sites)
        shell.openExternal('https://www.google.com/search?q=' + encodeURIComponent(a.termo));
      break;
    case 'abrir_site':
      if (cfg.abrir_sites && /^https:\\/\\//.test(a.url)) shell.openExternal(a.url);
      break;
    case 'abrir_programa': {
      const caminho = cfg.programas[(a.nome || '').toLowerCase()];
      if (cfg.abrir_programas && caminho)
        spawn(caminho, [], { detached: true, stdio: 'ignore' }).unref();
      break;
    }
    case 'dancar':
      if (cfg.dancar) win.webContents.send('dancar');
      break;
  }
}
""", "main.js — parte 3: executar ações")
story.append(S("Abas de acordo com o gosto da usuária"))
story.append(P("No painel, a usuária lista seus <b>interesses</b> (ex.: \"animes da temporada\", \"receitas "
               "veganas\", \"notícias de games\") e seus <b>sites favoritos</b>. Esses dados vão no prompt do "
               "sistema, então pedidos vagos como \"me mostra algo legal\" viram pesquisas personalizadas. Também "
               "dá para criar atalhos diretos:"))
story += code("""
"interesses": ["animes da temporada", "lo-fi para estudar", "notícias de games"],
"sites_favoritos": { "youtube": "https://youtube.com", "anilist": "https://anilist.co" },
"programas": {
  "spotify":  "C:\\\\Users\\\\VOCE\\\\AppData\\\\Roaming\\\\Spotify\\\\Spotify.exe",
  "discord":  "C:\\\\Users\\\\VOCE\\\\AppData\\\\Local\\\\Discord\\\\Update.exe",
  "bloco de notas": "notepad.exe",
  "calculadora": "calc.exe"
}
""", "Trecho do config.json")
story += caixa("O Discord usa Update.exe com argumentos (--processStart Discord.exe). Para casos assim, salve o "
               "programa como objeto { caminho, args } e passe args para o spawn. Uma forma prática de cadastrar "
               "é um botão \"Adicionar programa\" no painel que abre um seletor de arquivo "
               "(dialog.showOpenDialog).")
story.append(PageBreak())

# ---------------------------------------------------------------- 10
story.append(T("10. Passo 8 — Dançar quando tocar música"))
story.append(P("O Electron captura o <b>áudio do sistema</b> (loopback) graças ao "
               "setDisplayMediaRequestHandler configurado no passo 2. Analisamos o volume dos graves: se houver som "
               "contínuo por alguns segundos enquanto <b>ela não está falando</b>, consideramos que há música. "
               "Picos nos graves marcam a batida, e usamos isso para acelerar ou desacelerar a dança."))
story += code("""
import { carregarAnimacao, mudarEmocao } from './personagem.js';

export async function iniciarDanca(cfg) {
  if (!cfg.dancar) return;
  const danca = await carregarAnimacao(cfg.animacao_danca || 'danca1.vrma');
  const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  stream.getVideoTracks().forEach(t => t.stop());       // só precisamos do áudio
  const ctx = new AudioContext();
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);       // não conecta na saída (sem eco)
  const f = new Uint8Array(an.frequencyBinCount);

  let segundosComSom = 0, dancando = false, media = 0, ultimaBatida = 0, intervalo = 0.5;
  let falando = false;                                   // ignora a própria voz dela
  window.addEventListener('aiko-fala', (e) => (falando = e.detail));
  window.aiko.on('dancar', () => { segundosComSom = 99; });

  setInterval(() => {
    an.getByteFrequencyData(f);
    const graves = f.slice(1, 12).reduce((a, b) => a + b, 0) / (11 * 255);
    const total = f.reduce((a, b) => a + b, 0) / (f.length * 255);
    media = media * 0.95 + graves * 0.05;
    const agora = performance.now() / 1000;
    if (graves > media * 1.35 && agora - ultimaBatida > 0.28) {   // batida detectada
      intervalo = intervalo * 0.8 + (agora - ultimaBatida) * 0.2;
      ultimaBatida = agora;
    }
    segundosComSom = total > 0.04 && !falando ? segundosComSom + 0.1 : Math.max(0, segundosComSom - 0.3);

    if (!dancando && segundosComSom > 3) {
      dancando = true; danca.reset().fadeIn(0.5).play(); mudarEmocao('feliz', 3000);
    } else if (dancando && segundosComSom === 0) {
      dancando = false; danca.fadeOut(0.8);
    }
    if (dancando) danca.timeScale = Math.min(1.5, Math.max(0.7, 0.5 / intervalo)); // ~120 BPM = 1x
  }, 100);
}
""", "renderer/danca.js")
story += caixa("O evento <b>aiko-fala</b> (disparado pelo fala.js) evita que ela dance ao som da própria voz. "
               "No macOS a captura de áudio do sistema exige um driver virtual (ex.: BlackHole); "
               "no Windows funciona direto. Tenha várias animações de dança e sorteie uma a cada música.", "aviso")
story.append(PageBreak())

# ---------------------------------------------------------------- 11
story.append(T("11. Passo 9 — Andar livremente pela tela"))
story.append(P("Quem se move é a <b>janela invisível</b>. A cada intervalo aleatório ela escolhe um ponto da "
               "parte de baixo da tela (como se andasse sobre a barra de tarefas), vira o corpo para o lado certo, "
               "toca a animação de andar e desliza até lá. A usuária também pode <b>arrastá-la</b> com o mouse."))
story += code("""
import { vrm, carregarAnimacao, mudarEmocao } from './personagem.js';

let moveuNoArraste = false;
export const foiArrastada = () => moveuNoArraste;

export async function iniciarMovimento(cfg) {
  const andar = await carregarAnimacao('andar.vrma');
  let destino = null, arrastando = false, inicio = null;

  async function escolherDestino() {
    const { area, janela } = await window.aiko.infoTela();
    const x = area.x + Math.random() * (area.width - janela.width);
    destino = { x, y: area.y + area.height - janela.height };
    vrm.scene.rotation.y = x > janela.x ? Math.PI / 2 : -Math.PI / 2;  // vira para o lado
    andar.reset().fadeIn(0.3).play();
  }

  setInterval(async () => {
    if (!cfg.andar || destino || arrastando) return;
    if (Math.random() < 0.3) escolherDestino();
  }, (cfg.intervalo_andar_seg || 20) * 1000);

  setInterval(async () => {
    if (!destino || arrastando) return;
    const { janela } = await window.aiko.infoTela();
    const dx = destino.x - janela.x, passo = 2.2;              // pixels por quadro
    if (Math.abs(dx) < passo) {
      destino = null; andar.fadeOut(0.3); vrm.scene.rotation.y = 0;   // volta a olhar pra frente
      return;
    }
    window.aiko.moverJanela({ x: janela.x + Math.sign(dx) * passo, y: destino.y });
  }, 16);

  // arrastar com o botão esquerdo segurado
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    arrastando = true; moveuNoArraste = false; inicio = { x: e.screenX, y: e.screenY };
  });
  window.addEventListener('mousemove', async (e) => {
    if (!arrastando) return;
    const { janela } = await window.aiko.infoTela();
    const dx = e.screenX - inicio.x, dy = e.screenY - inicio.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { moveuNoArraste = true; mudarEmocao('surpresa', 800); }
    window.aiko.moverJanela({ x: janela.x + dx, y: janela.y + dy });
    inicio.x = e.screenX; inicio.y = e.screenY;
  });
  window.addEventListener('mouseup', () => { arrastando = false; destino = null; });
}
""", "renderer/movimento.js")
story += caixa("A função <b>foiArrastada()</b> impede que soltar a personagem depois de arrastar conte como "
               "clique para ouvir. Se a animação de andar fizer a "
               "personagem sair do lugar dentro da janela, zere a posição do quadril (hips) a cada quadro.")
story.append(PageBreak())

# ---------------------------------------------------------------- 12
story.append(T("12. Passo 10 — Comentários espontâneos a cada X minutos"))
story.append(P("Um temporizador pede à IA um comentário curto, usando contexto real: hora do dia, se há música "
               "tocando, há quanto tempo a usuária está no PC e os interesses dela. O intervalo vem da "
               "configuração e pode ser trocado a qualquer momento."))
story += code("""
let timerComentario = null;
function agendarComentarios() {
  clearInterval(timerComentario);
  const cfg = config.ler();
  if (!cfg.comentarios.ativo) return;
  timerComentario = setInterval(async () => {
    const ocioso = powerMonitor.getSystemIdleTime();
    if (ocioso > 300) return;                       // usuária longe do PC: fica quieta
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const pedido = `[EVENTO INTERNO] São ${hora}. Faça um comentário espontâneo, curto e fofo para a
${cfg.nome_usuaria}, de acordo com sua personalidade. Pode ser uma curiosidade sobre
${cfg.interesses.join(', ')}, um lembrete para beber água ou se alongar, ou só puxar assunto.
Não repita comentários anteriores. Não faça ações.`;
    await responder(pedido);
  }, cfg.comentarios.intervalo_min * 60 * 1000);
}
app.whenReady().then(agendarComentarios);
""", "main.js — parte 4: comentários")
story += caixa("Adicione um \"modo não perturbe\": se houver um app em tela cheia (jogo, apresentação) ou "
               "se a usuária desligar no painel, ela não comenta. Também é legal sortear o intervalo entre "
               "X e 1,5X para não ficar previsível.")
story.append(PageBreak())

# ---------------------------------------------------------------- 13
story.append(T("13. Passo 11 — Painel de configurações (tudo ajustável)"))
story.append(P("Todas as funções ficam em um arquivo <b>config.json</b> salvo na pasta de dados do app "
               "(app.getPath('userData')). O painel é uma segunda janela comum, aberta com o botão direito "
               "na personagem ou pelo ícone na bandeja do sistema."))
story += code("""
{
  "nome": "Aiko",
  "nome_usuaria": "Ana",
  "personalidade": "alegre, carinhosa, um pouco brincalhona, fala português do Brasil",
  "interesses": ["animes", "música pop", "games"],
  "ia": { "provedor": "gemini", "modelo": "gemini-2.5-flash", "chave": "" },
  "voz_ativa": true,
  "voz": { "motor": "edge", "voz_edge": "pt-BR-FranciscaNeural", "velocidade": "+0%",
           "tom": "+15Hz", "ativacao_por_voz": true, "palavra_ativacao": "aiko",
           "modelo_vosk": "modelos/vosk-model-small-pt-0.3", "modelo_whisper": "small" },
  "clique_para_ouvir": true,
  "abrir_sites": true,
  "abrir_programas": true,
  "dancar": true,
  "andar": true,
  "intervalo_andar_seg": 20,
  "comentarios": { "ativo": true, "intervalo_min": 15 },
  "tamanho": 1.0,
  "programas": { "bloco de notas": "notepad.exe" }
}
""", "config.json padrão")
story += code("""
const { app, safeStorage } = require('electron');
const fs = require('fs'), path = require('path');
const PADRAO = require('./config.padrao.json');
const arq = () => path.join(app.getPath('userData'), 'config.json');

function ler() {
  let c = { ...PADRAO };
  try { c = { ...c, ...JSON.parse(fs.readFileSync(arq(), 'utf8')) }; } catch {}
  if (c.ia.chave_cripto && safeStorage.isEncryptionAvailable())
    c.ia.chave = safeStorage.decryptString(Buffer.from(c.ia.chave_cripto, 'base64'));
  return c;
}
function salvar(c) {
  const copia = structuredClone(c);
  if (copia.ia.chave && safeStorage.isEncryptionAvailable()) {
    copia.ia.chave_cripto = safeStorage.encryptString(copia.ia.chave).toString('base64');
    copia.ia.chave = '';
  }
  fs.writeFileSync(arq(), JSON.stringify(copia, null, 2));
}
module.exports = { ler, salvar };
""", "config.js")
story += code("""
ipcMain.handle('config-ler', () => config.ler());
ipcMain.handle('config-salvar', (_e, c) => {
  config.salvar(c);
  enviarVoz({ tipo: 'config', dados: c.voz });  // voz.py aplica na hora
  agendarComentarios();                          // reinicia o timer com o novo intervalo
  win.webContents.reload();                      // personagem recarrega dança/andar
  return true;
});
ipcMain.on('abrir-config', () => {
  if (janelaConfig && !janelaConfig.isDestroyed()) return janelaConfig.focus();
  janelaConfig = new BrowserWindow({ width: 520, height: 720, title: 'Configurações',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  janelaConfig.loadFile('renderer/configuracoes.html');
});
""", "main.js — parte 5: painel")
story.append(S("O que colocar no painel"))
story += tabela([
    ["Seção", "Controles"],
    ["Personagem", "Nome, personalidade, tamanho na tela, arquivo .vrm, botão \"testar animações\"."],
    ["IA", "Provedor (lista), modelo (texto), chave da API (campo senha), botão \"Testar conexão\"."],
    ["Voz", "Ligar/desligar fala, motor (Edge/Kokoro), voz, velocidade, tom, botão \"Ouvir exemplo\"."],
    ["Escuta", "Ativação por voz (sim/não), palavra de ativação, clique para ouvir (sim/não), microfone."],
    ["Ações", "Permitir abrir sites, permitir abrir programas, lista de programas, interesses, sites favoritos."],
    ["Vida", "Dançar com música, andar pela tela + intervalo, comentários + intervalo em minutos, "
             "não perturbe em tela cheia, iniciar com o Windows."],
], [30 * mm, CW - 30 * mm])
story += code("""
<label><input type="checkbox" id="dancar"> Dançar quando tocar música</label>
<label><input type="checkbox" id="andar"> Andar pela tela</label>
<label><input type="checkbox" id="com_ativo"> Fazer comentários a cada
  <input type="number" id="com_int" min="1" max="240" style="width:60px"> minutos</label>
<select id="provedor"><option>gemini</option><option>groq</option>
  <option>openrouter</option><option>ollama</option></select>
<input type="password" id="chave" placeholder="Cole sua chave da API">
<button id="salvar">Salvar</button>
<script>
  const $ = (id) => document.getElementById(id);
  let cfg;
  window.aiko.config().then(c => { cfg = c;
    $('dancar').checked = c.dancar; $('andar').checked = c.andar;
    $('com_ativo').checked = c.comentarios.ativo; $('com_int').value = c.comentarios.intervalo_min;
    $('provedor').value = c.ia.provedor; $('chave').value = c.ia.chave; });
  $('salvar').onclick = () => {
    cfg.dancar = $('dancar').checked; cfg.andar = $('andar').checked;
    cfg.comentarios = { ativo: $('com_ativo').checked, intervalo_min: +$('com_int').value };
    cfg.ia.provedor = $('provedor').value; cfg.ia.chave = $('chave').value;
    window.aiko.salvarConfig(cfg);
  };
</script>
""", "renderer/configuracoes.html (trecho)")
story.append(PageBreak())

# ---------------------------------------------------------------- 14
story.append(T("14. Passo 12 — Toques finais e instalador"))
story.append(S("Ícone na bandeja e iniciar com o sistema"))
story += code("""
const { Tray, Menu } = require('electron');
let bandeja;
app.whenReady().then(() => {
  bandeja = new Tray(path.join(__dirname, 'icone.png'));
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar/ocultar', click: () => (win.isVisible() ? win.hide() : win.show()) },
    { label: 'Configurações', click: () => ipcMain.emit('abrir-config') },
    { label: 'Sair', click: () => app.quit() },
  ]));
  app.setLoginItemSettings({ openAtLogin: config.ler().iniciar_com_sistema === true });
});
app.on('before-quit', () => voz && voz.kill());
""", "main.js — parte 6")
story.append(S("Gerando o instalador"))
story += B([
    "Transforme o voz.py em executável com <b>PyInstaller</b> (pyinstaller --onefile voz.py) para a usuária "
    "não precisar instalar Python. No main.js, chame o .exe em vez de 'python voz.py' quando "
    "<b>app.isPackaged</b> for verdadeiro (use process.resourcesPath para achar o arquivo).",
    "Rode <b>npm run dist</b>. O electron-builder gera um instalador .exe na pasta dist/.",
    "Em produção, troque o importmap por um bundler (Vite) para o app carregar mais rápido.",
    "Na primeira execução, mostre um assistente de boas-vindas: escolher nome, provedor de IA, colar a chave "
    "(com link para a página do provedor) e testar o microfone.",
])
story.append(S("Ordem de desenvolvimento sugerida"))
story += tabela([
    ["Etapa", "Entrega", "Tempo estimado"],
    ["1", "Personagem no VRoid exportada em .vrm", "1 a 3 dias"],
    ["2", "Janela transparente com a personagem, piscando e respirando", "1 dia"],
    ["3", "Chat por texto com a IA (antes da voz, para testar)", "1 dia"],
    ["4", "Voz (Edge TTS) + boca sincronizada", "1 dia"],
    ["5", "Clique para ouvir + Whisper; depois palavra de ativação", "1 a 2 dias"],
    ["6", "Ações: sites, pesquisas, programas", "1 dia"],
    ["7", "Dança, andar, comentários", "2 dias"],
    ["8", "Painel de configurações, bandeja, instalador", "2 dias"],
], [18 * mm, CW - 58 * mm, 40 * mm])
story.append(PageBreak())

# ---------------------------------------------------------------- 15
story.append(T("15. Solução de problemas"))
story += tabela([
    ["Problema", "Causa provável e solução"],
    ["Fundo preto em vez de transparente",
     "Aceleração de hardware desativada ou driver de vídeo antigo. Atualize o driver. Não chame "
     "app.disableHardwareAcceleration(). No Linux use um compositor."],
    ["Não consigo clicar nas janelas atrás dela",
     "O setIgnoreMouseEvents não voltou para true. Confira o readPixels e o preserveDrawingBuffer: true."],
    ["Personagem aparece deitada ou de costas",
     "Modelo VRM 0.x: mantenha VRMUtils.rotateVRM0(vrm). Ajuste camera.position."],
    ["IA responde 401/403", "Chave errada ou expirada. Gere outra no site do provedor."],
    ["IA responde 429", "Limite gratuito atingido. Espere, troque de provedor ou use o Ollama."],
    ["Ollama não responde", "Abra o Ollama e rode ollama pull qwen2.5:7b. Teste em http://localhost:11434."],
    ["Ela não ouve a palavra de ativação",
     "Confira o microfone padrão do Windows, aumente o volume de entrada, tente outra grafia do nome."],
    ["Ela se ouve e responde a si mesma",
     "Use fone de ouvido ou garanta que o evento fim_fala só é enviado quando o áudio termina."],
    ["Dança sozinha sem música", "Aumente o limite de volume (total > 0.04) ou o tempo de confirmação."],
    ["Voz Kokoro com erro", "Instale o espeak-ng e reinicie o terminal."],
    ["Uso alto de CPU", "Use Whisper 'base' em vez de 'small', limite o FPS a 30 e reduza texturas do VRM."],
], [52 * mm, CW - 52 * mm])
story.append(S("Segurança e privacidade"))
story += B([
    "A escuta de ativação é 100% local (Vosk). Nada é enviado para a internet até ela ser ativada.",
    "Com Ollama + Whisper + Kokoro, <b>nada sai do computador</b>: modo totalmente off-line.",
    "Programas só abrem se estiverem na lista da usuária; sites só abrem com https.",
    "A chave da API fica criptografada com o cofre do sistema (safeStorage) e nunca vai para o código.",
    "Deixe claro no app quando o microfone está ouvindo (balão \"Estou ouvindo...\" e um brilho na personagem).",
])
story.append(S("Ideias para a versão 2"))
story += B([
    "Memória de longo prazo: salvar fatos sobre a usuária (aniversário, gostos) em um arquivo e incluir no prompt.",
    "Ver a tela: enviar uma captura para um modelo com visão (Gemini) quando a usuária perguntar \"o que é isso?\".",
    "Controle de mídia: pausar e pular músicas com teclas de mídia.",
    "Lembretes e alarmes falados; integração com agenda.",
    "Roupas trocáveis por estação ou data comemorativa.",
])

doc = Doc("Guia_Assistente_Virtual_Anime.pdf", pagesize=A4, leftMargin=MARG, rightMargin=MARG,
          topMargin=18 * mm, bottomMargin=18 * mm, title="Guia: Assistente Virtual Anime",
          author="Assistente-ia", subject="Passo a passo para criar uma assistente virtual anime de desktop")
fr = Frame(MARG, 18 * mm, W - 2 * MARG, H - 36 * mm, id="f")
doc.addPageTemplates([PageTemplate("capa", [fr], onPage=capa), PageTemplate("normal", [fr], onPage=rodape)])
doc.multiBuild(story)
print("ok")
