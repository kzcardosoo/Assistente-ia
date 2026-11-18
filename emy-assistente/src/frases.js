'use strict';
// Frases locais (não usam IA) para momentos rápidos: saudação, volta do usuário etc.
const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];
const nome = (cfg) => (cfg.nome_usuario ? ', ' + cfg.nome_usuario : '');

function saudacao(cfg) {
  const h = new Date().getHours();
  const n = nome(cfg);
  if (h < 5) return sortear([`Ainda por aqui${n}? Tô com você!`, `Madrugada, hein${n}? Vamos lá!`]);
  if (h < 12) return sortear([`Bom dia${n}! Vamos começar o dia?`, `Bom dia${n}! Que bom te ver!`]);
  if (h < 18) return sortear([`Boa tarde${n}! Tô aqui se precisar.`, `Oi${n}! Boa tarde!`]);
  return sortear([`Boa noite${n}! Bora fazer alguma coisa legal?`, `Boa noite${n}! Senti sua falta.`]);
}

function voltou(cfg) {
  const n = nome(cfg);
  return sortear([`Você voltou${n}! Eu tava cochilando...`, `Ah, oi${n}! Acordei!`, `Que bom que você voltou${n}!`]);
}

function naoOuvi() {
  return sortear(['Não ouvi nada... pode repetir?', 'Hm? Não escutei direito.', 'Acho que não ouvi. Fala de novo?']);
}

function semMicrofone() {
  return 'Não consigo usar o microfone agora. Pode escrever pra mim!';
}

function primeiraVez(cfg) {
  return `Oi! Eu sou a ${cfg.nome}! Clica com o botão direito em mim e abre as Configurações para escolher minha IA.`;
}

module.exports = { saudacao, voltou, naoOuvi, semMicrofone, primeiraVez, sortear };
