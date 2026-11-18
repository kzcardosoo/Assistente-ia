'use strict';
// Leitura e gravação das configurações (config.json na pasta de dados do usuário).
// A chave da API é guardada criptografada com o cofre do sistema (safeStorage).
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const PADRAO = require('../config.padrao.json');
const eventos = new EventEmitter();
let cache = null;

const arquivo = () => path.join(app.getPath('userData'), 'config.json');

function ehObjeto(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Junta o padrão com o que foi salvo, campo a campo, para que configurações
// novas (de versões futuras) apareçam com o valor padrão.
function mesclar(base, extra) {
  const saida = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (ehObjeto(v) && ehObjeto(base[k])) saida[k] = mesclar(base[k], v);
    else if (v !== undefined) saida[k] = v;
  }
  return saida;
}

function criptoDisponivel() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function ler() {
  if (cache) return structuredClone(cache);
  let salvo = {};
  try { salvo = JSON.parse(fs.readFileSync(arquivo(), 'utf8')); } catch { /* primeira execução */ }
  // Seções de mapa (programas, sites) não devem misturar com o padrão se o usuário já editou.
  const cfg = mesclar(PADRAO, salvo);
  if (salvo.programas) cfg.programas = salvo.programas;
  if (salvo.sites_favoritos) cfg.sites_favoritos = salvo.sites_favoritos;

  if (cfg.ia.chave_cripto) {
    try {
      cfg.ia.chave = criptoDisponivel()
        ? safeStorage.decryptString(Buffer.from(cfg.ia.chave_cripto, 'base64'))
        : '';
    } catch { cfg.ia.chave = ''; }
  }
  delete cfg.ia.chave_cripto;
  cache = cfg;
  return structuredClone(cfg);
}

function salvar(novo) {
  const cfg = mesclar(PADRAO, novo);
  if (novo.programas) cfg.programas = novo.programas;
  if (novo.sites_favoritos) cfg.sites_favoritos = novo.sites_favoritos;
  cache = structuredClone(cfg);

  const paraDisco = structuredClone(cfg);
  if (paraDisco.ia.chave && criptoDisponivel()) {
    paraDisco.ia.chave_cripto = safeStorage.encryptString(paraDisco.ia.chave).toString('base64');
    paraDisco.ia.chave = '';
  }
  fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
  const tmp = arquivo() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(paraDisco, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo());
  eventos.emit('mudou', structuredClone(cfg));
  return structuredClone(cfg);
}

function atualizar(fn) {
  const cfg = ler();
  fn(cfg);
  return salvar(cfg);
}

module.exports = { ler, salvar, atualizar, eventos, PADRAO, arquivo };
