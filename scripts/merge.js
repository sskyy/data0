import fs from 'fs';
import path from 'path';

const typesDir = path.join('dist', 'types');
const outputFile = path.join( 'dist', 'index.d.ts');

function mergeDeclarations(dir) {
  let content = '';
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      content += mergeDeclarations(filePath);
    } else if (file.endsWith('.d.ts')) {
      content += fs.readFileSync(filePath, 'utf8') + '\n';
    }
  });

  return content;
}

const mergedContent = mergeDeclarations(typesDir);
fs.writeFileSync(outputFile, mergedContent);

console.log('Declaration files merged into index.d.ts');
