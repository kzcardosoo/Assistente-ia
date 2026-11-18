'use strict';
// Ponte segura para a janela de configurações.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfgApi', {
  ler: () => ipcRenderer.invoke('cfg-ler'),
  salvar: (cfg) => ipcRenderer.invoke('cfg-salvar', cfg),
  testarIA: (cfg) => ipcRenderer.invoke('cfg-testar-ia', cfg),
  listarModelos: (cfg) => ipcRenderer.invoke('cfg-listar-modelos', cfg),
  listarMicrofones: () => ipcRenderer.invoke('cfg-listar-microfones'),
  testarVoz: (voz) => ipcRenderer.invoke('cfg-testar-voz', voz),
  escolherVrm: () => ipcRenderer.invoke('cfg-escolher-vrm'),
  escolherPrograma: () => ipcRenderer.invoke('cfg-escolher-programa'),
  abrirLink: (url) => ipcRenderer.invoke('cfg-abrir-link', url),
  abrirPasta: (qual) => ipcRenderer.invoke('cfg-abrir-pasta', qual),
});
