'use strict';
// Ponte segura entre a janela da personagem e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

const CANAIS = [
  'config', 'cursor', 'resposta', 'pensando', 'estado-escuta', 'tocar-audio', 'falar-navegador',
  'interromper', 'acao', 'andar', 'parar-andar', 'arrastada', 'cair', 'dormir', 'modo-texto',
];

contextBridge.exposeInMainWorld('aiko', {
  pronto: () => ipcRenderer.invoke('renderer-pronto'),
  modeloCarregado: (ok) => ipcRenderer.send('modelo-carregado', !!ok),
  mouseSobre: (v) => ipcRenderer.send('mouse-sobre', !!v),
  arrastarInicio: () => ipcRenderer.send('arrastar-inicio'),
  arrastarFim: () => ipcRenderer.invoke('arrastar-fim'),
  clique: () => ipcRenderer.send('clique'),
  menu: () => ipcRenderer.send('menu'),
  enviarTexto: (t) => ipcRenderer.send('mensagem-texto', String(t)),
  fecharTexto: () => ipcRenderer.send('fechar-texto'),
  falaInicio: () => ipcRenderer.send('fala-inicio'),
  falaFim: () => ipcRenderer.send('fala-fim'),
  dancando: (v) => ipcRenderer.send('dancando', !!v),
  log: (...a) => ipcRenderer.send('log', a.map(String).join(' ')),
  on: (canal, fn) => {
    if (CANAIS.includes(canal)) ipcRenderer.on(canal, (_e, dados) => fn(dados));
  },
});
