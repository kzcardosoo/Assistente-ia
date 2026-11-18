'use strict';
// Ponte segura para a janela de configurações.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('cfgApi', {
  ler: () => ipcRenderer.invoke('cfg-ler'),
  salvar: (cfg) => ipcRenderer.invoke('cfg-salvar', cfg),
  testarIA: (cfg) => ipcRenderer.invoke('cfg-testar-ia', cfg),
  listarModelos: (cfg) => ipcRenderer.invoke('cfg-listar-modelos', cfg),
  listarMicrofones: () => ipcRenderer.invoke('cfg-listar-microfones'),
  testarVoz: (voz) => ipcRenderer.invoke('cfg-testar-voz', voz),
  modelos: () => ipcRenderer.invoke('cfg-modelos-listar'),
  adicionarModelos: (arquivos) => ipcRenderer.invoke('cfg-modelos-adicionar',
    arquivos ? [...arquivos].map((f) => webUtils.getPathForFile(f)).filter(Boolean) : null),
  usarModelo: (id) => ipcRenderer.invoke('cfg-modelos-usar', id),
  removerModelo: (id) => ipcRenderer.invoke('cfg-modelos-remover', id),
  ajustarModelo: (id, ajuste) => ipcRenderer.invoke('cfg-modelos-ajustar', id, ajuste),
  escolherPrograma: () => ipcRenderer.invoke('cfg-escolher-programa'),
  abrirLink: (url) => ipcRenderer.invoke('cfg-abrir-link', url),
  abrirPasta: (qual) => ipcRenderer.invoke('cfg-abrir-pasta', qual),
});
