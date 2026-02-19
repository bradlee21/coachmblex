import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const blueprintPath = resolve(process.cwd(), 'src/content/mblexBlueprint.js');
const blueprintSource = readFileSync(blueprintPath, 'utf8');

const moduleUrl = `data:text/javascript;base64,${Buffer.from(blueprintSource).toString(
  'base64'
)}`;
const blueprintModule = await import(moduleUrl);
const { mblexBlueprint } = blueprintModule;

function gatherLeafCodes(nodes, leafCodes = []) {
  for (const node of nodes) {
    if (!node.children?.length) {
      leafCodes.push(node.code);
      continue;
    }
    gatherLeafCodes(node.children, leafCodes);
  }
  return leafCodes;
}

const targets = {};
for (const code of gatherLeafCodes(mblexBlueprint.sections)) {
  targets[code] = {
    mcq: 5,
    fill: 3,
    reverse: 3,
    diagram: 0,
  };
}

const outputPath = resolve(process.cwd(), 'src/content/blueprintCoverageTargets.json');
writeFileSync(outputPath, JSON.stringify(targets, null, 2) + '\n');
console.log(`Wrote ${Object.keys(targets).length} blueprint coverage targets.`);
