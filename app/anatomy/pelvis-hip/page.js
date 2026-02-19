'use client';

import DiagramQuiz from '../../_components/DiagramQuiz';
import PelvisHipSvg from '../../../src/content/diagrams/pelvisHipSvg';
import diagramPack from '../../../src/content/diagrams/pelvis-hip.json';

export default function PelvisHipPage() {
  const labelSet = diagramPack.labelSets[0];

  return (
    <section>
      <h1>{diagramPack.title}</h1>
      <DiagramQuiz
        svg={PelvisHipSvg}
        targets={diagramPack.targets}
        labels={labelSet.labels}
        blueprint_code={diagramPack.blueprint_code}
        regionKey={diagramPack.regionKey}
        labelSetId={labelSet.id}
      />
    </section>
  );
}
