import type { EvidenceItem, RetrievalPlan } from "@neobuni/contracts";
import {
  getMemoryGraphNodesByIds as getMemoryGraphNodesByIdsFx,
  listMemoryGraphEdgesForNodeIds as listMemoryGraphEdgesForNodeIdsFx,
  listMemoryGraphSourcesForTargetIds as listMemoryGraphSourcesForTargetIdsFx,
  runRepo,
  searchMemoryGraphNodes as searchMemoryGraphNodesFx,
} from "@neobuni/db";

const getMemoryGraphNodesByIds = (
  ...args: Parameters<typeof getMemoryGraphNodesByIdsFx>
) => runRepo(getMemoryGraphNodesByIdsFx(...args));
const listMemoryGraphEdgesForNodeIds = (
  ...args: Parameters<typeof listMemoryGraphEdgesForNodeIdsFx>
) => runRepo(listMemoryGraphEdgesForNodeIdsFx(...args));
const listMemoryGraphSourcesForTargetIds = (
  ...args: Parameters<typeof listMemoryGraphSourcesForTargetIdsFx>
) => runRepo(listMemoryGraphSourcesForTargetIdsFx(...args));
const searchMemoryGraphNodes = (
  ...args: Parameters<typeof searchMemoryGraphNodesFx>
) => runRepo(searchMemoryGraphNodesFx(...args));

interface GraphRecallResult {
  items: EvidenceItem[];
  stats: {
    seedNodeCount: number;
    traversedEdgeCount: number;
    returnedItemCount: number;
  };
  store: "graph";
}

const unique = <T>(values: T[]) => Array.from(new Set(values));

const normalizeSourceType = (
  value: string | undefined
): EvidenceItem["provenance"]["sourceType"] => {
  if (
    value === "message" ||
    value === "memory" ||
    value === "knowledge_chunk" ||
    value === "document" ||
    value === "manual"
  ) {
    return value;
  }

  return "manual";
};

const toEvidenceKind = (kind: string): EvidenceItem["kind"] => {
  if (kind === "task") {
    return "task";
  }

  if (kind === "event") {
    return "event";
  }

  return "entity";
};

const recallGraphMemory = async (input: {
  profileId: string;
  plan: RetrievalPlan;
}): Promise<GraphRecallResult | null> => {
  const query = input.plan.queries.graph;

  if (!query) {
    return null;
  }

  const seeds = await searchMemoryGraphNodes(input.profileId, {
    terms: query.seedTerms,
    limit: query.limit,
  });
  const seedNodeIds = seeds.map((node) => node.id);
  const edges = await listMemoryGraphEdgesForNodeIds(input.profileId, {
    nodeIds: seedNodeIds,
    relationTypes: query.relationTypes,
    limit: query.limit * Math.max(1, query.maxDepth),
  });
  const neighborNodeIds = unique(
    edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId])
  );
  const allNodeIds = unique([...seedNodeIds, ...neighborNodeIds]);
  const nodes = await getMemoryGraphNodesByIds(allNodeIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeSources = await listMemoryGraphSourcesForTargetIds(
    input.profileId,
    "node",
    allNodeIds
  );
  const edgeSources = await listMemoryGraphSourcesForTargetIds(
    input.profileId,
    "edge",
    edges.map((edge) => edge.id)
  );
  const nodeSourceById = new Map<string, (typeof nodeSources)[number][]>();
  const edgeSourceById = new Map<string, (typeof edgeSources)[number][]>();

  for (const source of nodeSources) {
    const group = nodeSourceById.get(source.targetId) ?? [];
    group.push(source);
    nodeSourceById.set(source.targetId, group);
  }

  for (const source of edgeSources) {
    const group = edgeSourceById.get(source.targetId) ?? [];
    group.push(source);
    edgeSourceById.set(source.targetId, group);
  }

  const primaryReason = input.plan.reasons.includes("relationship_lookup")
    ? "relationship_lookup"
    : (input.plan.reasons[0] ?? "hybrid");

  const nodeItems: EvidenceItem[] = seeds.map((node) => {
    const source = nodeSourceById.get(node.id)?.[0];
    return {
      id: `graph-node-${node.id}`,
      store: "graph",
      kind: toEvidenceKind(node.kind),
      title: node.canonicalName,
      content: node.summary || node.canonicalName,
      score: 0.52 + node.matchScore * 0.4,
      confidence: node.matchScore,
      recency: null,
      retrievalReason: primaryReason,
      provenance: {
        sourceType: normalizeSourceType(source?.sourceType),
        sourceId: source?.sourceId ?? node.id,
        citationLabel: node.canonicalName,
      },
      metadata: {
        nodeId: node.id,
        nodeKind: node.kind,
        nodeStatus: node.status,
        canonicalName: node.canonicalName,
        payload: node.payload,
      },
    };
  });

  const relationItems: EvidenceItem[] = [];

  for (const edge of edges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);

    if (!(fromNode && toNode)) {
      continue;
    }

    const source = edgeSourceById.get(edge.id)?.[0];
    relationItems.push({
      id: `graph-edge-${edge.id}`,
      store: "graph" as const,
      kind: "relation" as const,
      title: `${fromNode.canonicalName} ${edge.relationType} ${toNode.canonicalName}`,
      content:
        source?.evidenceText ?? `${fromNode.summary} -> ${toNode.summary}`,
      score: 0.46 + Math.min(edge.weight, 1) * 0.28,
      confidence: Math.min(edge.weight, 1),
      recency: null,
      retrievalReason: primaryReason,
      provenance: {
        sourceType: normalizeSourceType(source?.sourceType ?? edge.sourceType),
        sourceId: source?.sourceId ?? edge.sourceId,
        citationLabel: `${fromNode.canonicalName} ${edge.relationType} ${toNode.canonicalName}`,
      },
      metadata: {
        edgeId: edge.id,
        relationType: edge.relationType,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        weight: edge.weight,
      },
    });
  }

  const items = [...nodeItems, ...relationItems]
    .sort((left, right) => right.score - left.score)
    .slice(0, query.limit);

  return {
    store: "graph",
    items,
    stats: {
      seedNodeCount: seeds.length,
      traversedEdgeCount: edges.length,
      returnedItemCount: items.length,
    },
  };
};

export type { GraphRecallResult };
export { recallGraphMemory };
