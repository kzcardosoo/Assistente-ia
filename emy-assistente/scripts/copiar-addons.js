// Copia os módulos extras do three.js usados pela personagem para renderer/vendor.
// (O empacotador descarta as pastas "examples" de node_modules, então eles precisam
// ficar dentro do app.) Roda sozinho depois do "npm install".
const fs = require('fs');
const path = require('path');

const origem = path.join(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm');
const destino = path.join(__dirname, '..', 'renderer', 'vendor', 'three-addons');
const arquivos = ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js'];

for (const rel of arquivos) {
  const de = path.join(origem, rel);
  const para = path.join(destino, rel);
  if (!fs.existsSync(de)) {
    console.error('Arquivo do three.js não encontrado:', de, '- rode "npm install" de novo.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(para), { recursive: true });
  fs.copyFileSync(de, para);
}
console.log('Módulos do three.js copiados para renderer/vendor/three-addons');
