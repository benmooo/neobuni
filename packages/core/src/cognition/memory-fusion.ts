import type {
  EvidenceItem,
  RetrievalReason,
  SignalSet,
  WorkingMemory,
} from "@neobuni/contracts";

import {
  buildEvidenceItemsFromTemporalMemories,
  fuseEvidenceItems,
  type TemporalRecalledMemory,
} from "./evidence-fusion";
import { buildWorkingMemory } from "./working-memory";

type MemoryFusionResult = {
  temporalEvidence: EvidenceItem[];
  fusedEvidence: EvidenceItem[];
  workingMemory: WorkingMemory;
};

const buildMemoryFusionResult = (input: {
  temporalMemories: TemporalRecalledMemory[];
  graphEvidence?: EvidenceItem[];
  knowledgeEvidence?: EvidenceItem[];
  retrievalReason: RetrievalReason;
  signals: SignalSet;
}): MemoryFusionResult => {
  const temporalEvidence = buildEvidenceItemsFromTemporalMemories({
    memories: input.temporalMemories,
    retrievalReason: input.retrievalReason,
  });
  const fusedEvidence = fuseEvidenceItems({
    temporal: temporalEvidence,
    graph: input.graphEvidence,
    knowledge: input.knowledgeEvidence,
  });
  const workingMemory = buildWorkingMemory({
    fusedEvidence,
    signals: input.signals,
  });

  return {
    temporalEvidence,
    fusedEvidence,
    workingMemory,
  };
};

export { buildMemoryFusionResult };
export type { MemoryFusionResult };
