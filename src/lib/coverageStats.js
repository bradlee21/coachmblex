import coverageTargets from '../content/blueprintCoverageTargets.json';
import pelvisHipPack from '../content/diagrams/pelvis-hip.json';
import { listAllNodesFlat, mblexBlueprint } from '../content/mblexBlueprint';

const DIAGRAM_PACKS = [pelvisHipPack];
const QUESTION_TYPES = ['mcq', 'fill', 'reverse'];

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

function buildTitlePath(code) {
  const flat = listAllNodesFlat();
  const byCode = new Map(flat.map((node) => [node.code, node]));
  const path = [];
  let cursor = byCode.get(code);
  while (cursor) {
    path.unshift(`${cursor.code} ${cursor.title}`);
    cursor = cursor.parentCode ? byCode.get(cursor.parentCode) : null;
  }
  return path.join(' > ');
}

function getDiagramCountsByCode() {
  const counts = {};
  for (const pack of DIAGRAM_PACKS) {
    const key = pack.blueprint_code;
    counts[key] = (counts[key] || 0) + (pack.labelSets?.length || 0);
  }
  return counts;
}

export async function getCoverageStats(supabase) {
  const leafCodes = gatherLeafCodes(mblexBlueprint.sections);
  const diagramCountsByCode = getDiagramCountsByCode();
  const rowsByCode = {};

  for (const code of leafCodes) {
    rowsByCode[code] = {
      code,
      sectionCode: code.split('.')[0],
      titlePath: buildTitlePath(code),
      targets: coverageTargets[code] || {
        mcq: 5,
        fill: 3,
        reverse: 3,
        diagram: 0,
      },
      counts: {
        mcq: 0,
        fill: 0,
        reverse: 0,
        diagram: diagramCountsByCode[code] || 0,
      },
      status: 'Missing',
    };
  }

  const { data, error } = await supabase
    .from('questions')
    .select('blueprint_code,question_type')
    .not('blueprint_code', 'is', null)
    .limit(5000);

  if (error) {
    throw new Error(error.message);
  }

  for (const item of data || []) {
    const code = item.blueprint_code;
    if (!rowsByCode[code]) continue;
    const type = item.question_type || 'mcq';
    if (!QUESTION_TYPES.includes(type)) continue;
    rowsByCode[code].counts[type] += 1;
  }

  const rows = Object.values(rowsByCode).map((row) => {
    const complete = ['mcq', 'fill', 'reverse', 'diagram'].every(
      (type) => row.counts[type] >= row.targets[type]
    );
    const hasAny =
      row.counts.mcq > 0 ||
      row.counts.fill > 0 ||
      row.counts.reverse > 0 ||
      row.counts.diagram > 0;
    return {
      ...row,
      status: complete ? 'Complete' : hasAny ? 'In Progress' : 'Missing',
    };
  });

  const completeCount = rows.filter((row) => row.status === 'Complete').length;
  const overallPercent = rows.length
    ? Math.round((completeCount / rows.length) * 100)
    : 0;

  return {
    overallPercent,
    rows,
  };
}
