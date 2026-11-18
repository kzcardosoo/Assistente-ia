# Emy — assistente virtual anime para desktop

Uma personagem 3D que fica na sua área de trabalho, sem janela e sem fundo. Ela conversa com você por voz ou por texto usando uma IA gratuita (cada pessoa conecta a própria chave) ou uma IA local que funciona sem internet. Também abre sites e programas, dança quando tem música tocando, passeia pela tela e puxa assunto de vez em quando.

Todas as funções podem ser ligadas e desligadas nas Configurações.

## O que ela faz

| Função | Como funciona |
|---|---|
| Só ela na tela | Janela transparente, sem moldura, sempre por cima. Cliques no espaço vazio passam para o que está atrás. |
| Ouvir | Clique nela, diga o nome dela ("Emy, ..." ou "Ei Emy, ...") ou use **Ctrl + Alt + A**. Tudo roda no seu PC: o Vosk fica atento ao nome e o Whisper confirma e transcreve. Se você disser só "Emy?", ela responde "Sim?" e espera o pedido. |
| Conversar | Gemini, Groq ou OpenRouter (grátis, com a sua chave), ou Ollama / LM Studio (local, off-line). |
| Voz feminina | Edge TTS (neural, on-line e gratuita) ou Kokoro (off-line). Se nenhuma funcionar, usa a voz do sistema. A boca acompanha a fala. |
| Abrir sites | Pesquisa no Google e no YouTube, abre seus sites favoritos e sugere coisas do seu gosto. |
| Abrir programas | Só os que você cadastrar na lista (por segurança). |
| Dançar | Detecta música no áudio do computador e dança no ritmo da batida (Windows). Também dança quando você pede. |
| Trocar de corpo | Adicione quantos modelos VRM quiser e troque pelo menu ou pela galeria. Todo modelo ganha as mesmas funções. |
| Parecer viva | Respira, pisca, segue o mouse com o olhar, troca o peso das pernas, se alonga, inclina a cabeça, cochila quando você some e acena quando você volta. |
| Passear | Anda sozinha pela barra de tarefas. Você pode arrastá-la; se soltar no ar, ela cai até o chão. |
| Comentários | Puxa assunto a cada X minutos (você escolhe o intervalo). |

## Jeito mais fácil: versão portátil (Windows)

Baixe o **`Emy-portatil-windows.zip`**, descompacte em qualquer pasta sua e dê dois cliques em **`Emy.exe`**.

- Não instala nada e **não precisa de administrador**.
- Já vem com tudo: o app, a personagem Emy, um Python próprio, o reconhecimento de voz em português (Vosk + Whisper) e a voz.
- Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações > Executar assim mesmo** (o programa não tem assinatura digital paga).
- Para remover, apague a pasta. As configurações ficam em `%APPDATA%\Emy Assistente`.

Dentro do zip há um arquivo **COMO USAR.txt** com o passo a passo, incluindo como pegar a chave grátis do Gemini.

Para gerar esse zip você mesmo (em Linux, macOS ou Git Bash): `npm run portatil`. O script `scripts/montar-portatil.sh` baixa o Python portátil, as bibliotecas e os modelos de voz, monta o app para Windows e compacta tudo.

## Instalação para desenvolvimento (Windows)

1. Instale o **Node.js LTS**: https://nodejs.org
2. Instale o **Python 3.11 ou 3.12**: https://python.org (marque "Add Python to PATH"). É opcional, mas sem ele ela não ouve o microfone e usa a voz do Windows.
3. Dê dois cliques em **`instalar.bat`**. Ele instala tudo e baixa o modelo de palavra de ativação.
4. Coloque o modelo da personagem em **`modelos/emy.vrm`** ou adicione depois pela galeria (veja abaixo).
5. Dê dois cliques em **`iniciar.bat`**.

No Linux ou macOS: `./instalar.sh` e depois `npm start`.

Na primeira vez, as Configurações abrem sozinhas na aba **IA** para você escolher o provedor.

## A personagem (modelo VRM)

O app usa modelos no formato **VRM**, o padrão de avatares de anime 3D. Ele já vem com a **Emy** (`modelos/emy.vrm`): cabelo rosa, blusa lilás e olhos violeta, feita a partir de um modelo de exemplo da pixiv cuja licença permite modificar e redistribuir (veja `modelos/CREDITOS.txt`).

- O jeito mais fácil é criar a sua no **VRoid Studio**, que é gratuito: https://vroid.com/en/studio. Monte cabelo, olhos e roupa (cores fortes e um contorno mais grosso deixam ela bem chamativa na tela) e exporte em **VRM**.
- Salve como `modelos/emy.vrm` para ser o corpo padrão.
- Modelos baixados prontos (VRoid Hub, BOOTH) têm licença própria. Confira se o uso é permitido.

### Vários modelos e troca de personagem

Você pode ter quantos modelos quiser e trocar a qualquer momento:

- **Adicionar:** em **Configurações > Personagem**, clique em **Adicionar modelos...** (pode escolher vários de uma vez) ou arraste os arquivos `.vrm` para a janela. Também dá para soltar um `.vrm` direto em cima dela: ela troca de corpo na hora.
- **Trocar:** clique com o botão direito nela > **Trocar personagem**, ou use o botão **Usar** na galeria. A troca acontece sem fechar o app, e ela continua o que estava fazendo (se estava dançando, continua dançando).
- **Remover:** botão ✕ no cartão do modelo. Só apaga a cópia que o app guardou; o arquivo original não é mexido.
- **Ajuste por modelo:** cada modelo tem o próprio ajuste de **abertura dos braços**, para os braços não atravessarem roupas largas.

Funciona com VRM 1.0 e VRM 0.x. Qualquer modelo ganha as mesmas funções: boca acompanhando a fala, piscar, expressões, olhar o mouse, dançar, andar, acenar, dormir e cair. Se o modelo não tiver as formas de boca configuradas, ela abre a mandíbula no lugar. A galeria mostra a foto, o nome e o autor que vêm dentro do próprio arquivo VRM.

Ela já vem com animações automáticas (andar, dançar, acenar, dormir...). Se quiser animações feitas à mão, coloque arquivos `.vrma` em `animacoes/` com `danca`, `andar`, `acenar` ou `idle` no nome.

## Escolhendo a IA

| Provedor | Custo | Onde pegar a chave |
|---|---|---|
| Google Gemini | grátis com limite diário | https://aistudio.google.com/apikey |
| Groq | grátis com limite, muito rápido | https://console.groq.com/keys |
| OpenRouter | modelos terminados em `:free` | https://openrouter.ai/keys |
| Ollama | grátis, off-line | https://ollama.com/download e depois `ollama pull qwen2.5:7b` |
| LM Studio | grátis, off-line | https://lmstudio.ai (ligue o servidor local) |

A chave fica guardada criptografada no seu computador. Use **Testar conexão** e **Buscar modelos** na aba IA para conferir.

## Como usar

- **Clique esquerdo** nela: começa a ouvir (se essa opção estiver ligada).
- **Arrastar**: muda ela de lugar.
- **Clique direito**: menu com Ouvir, Escrever mensagem, Dançar, Acenar, Passear, Trocar personagem, Não perturbe, Configurações e Sair.
- **Ctrl + Alt + A**: ouvir de qualquer lugar.
- Exemplos: "Emy, pesquisa receitas de bolo de cenoura", "abre o Spotify", "coloca uma música lo-fi no YouTube", "dança pra mim", "me conta uma curiosidade sobre animes".

Para abrir programas, cadastre-os em **Configurações > Ações > Adicionar programa**. O nome cadastrado é o que você fala.

## Privacidade

- A escuta da palavra de ativação é 100% local. Nada sai do PC até você chamar.
- Com Ollama + Whisper + Kokoro, nada sai do computador.
- Programas só abrem se estiverem na sua lista. Sites só abrem com http/https.
- A detecção de música analisa o volume do áudio do sistema na hora e não grava nada.

## Problemas comuns

| Problema | O que fazer |
|---|---|
| Fundo preto em vez de transparente | Atualize o driver de vídeo. No Linux, use um ambiente com compositor. |
| "Não consegui ligar os gráficos 3D" | Driver de vídeo antigo ou sem WebGL. Atualize o driver. |
| Ela não ouve | Veja o status em **Configurações > Ouvir**. Rode `instalar.bat` de novo e confira o microfone. |
| Não reconhece o nome | Fale o nome no começo da frase ("Emy, ..." ou "Ei Emy, ..."). Se ainda falhar, adicione variações em **Ouvir > Variações aceitas**. |
| Braços atravessando a roupa | Em **Personagem**, aumente a abertura dos braços daquele modelo. |
| Ela se ouve e responde sozinha | Use fone de ouvido ou desligue a ativação por voz. |
| IA responde erro 401/403 | Chave errada. Gere outra no site do provedor. |
| IA responde erro 429 | Limite gratuito atingido. Espere um pouco ou troque de provedor. |
| "Não encontrei o Ollama" | Abra o Ollama e baixe o modelo: `ollama pull qwen2.5:7b`. |
| Dança sem música | Diminua a sensibilidade em **Vida > Sensibilidade para música**. |
| Usa muita CPU | Diminua os quadros por segundo em **Vida** e use o Whisper "base". |

Os registros do app aparecem no terminal aberto pelo `iniciar.bat`.

## Gerar um instalador (.exe)

```bat
python\empacotar_voz.bat   :: opcional: cria o voz.exe para PCs sem Python
npm run dist               :: cria o instalador em dist\
```

Sem o passo do `voz.exe`, o app instalado procura um Python no computador.

## Estrutura

```
main.js              processo principal: janela, bandeja, IA, ações, passeio, comentários
preload*.js          pontes seguras entre as janelas e o processo principal
src/config.js        configurações (chave da API criptografada)
src/ia.js            cliente de IA compatível com OpenAI (Gemini, Groq, OpenRouter, Ollama, LM Studio)
src/acoes.js         abrir sites, pesquisas e programas (com lista de permissão)
src/modelos.js       galeria de modelos VRM: listar, ler foto/nome/autor, adicionar, remover
src/voz.js           inicia e conversa com o módulo de voz em Python
src/frases.js        frases rápidas (saudação, voltou, não ouvi...)
renderer/            a personagem (three.js + three-vrm), animações, fala, música e configurações
python/voz.py        microfone, palavra de ativação (Vosk), transcrição (Whisper), voz (Edge/Kokoro)
modelos/             modelos que acompanham o app (o padrão é emy.vrm)
animacoes/           animações .vrma opcionais
```
