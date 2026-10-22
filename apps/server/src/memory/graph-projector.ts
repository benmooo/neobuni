import {
	buildGraphProjectionTerms,
	inferPrimaryNodeKind,
	inferPrimaryRelationType,
} from "@neobuni/core";
import {
	createMemoryGraphSource as createMemoryGraphSourceFx,
	runRepo,
	upsertMemoryGraphEdge as upsertMemoryGraphEdgeFx,
	upsertMemoryGraphNode as upsertMemoryGraphNodeFx,
} from "@neobuni/db";

const createMemoryGraphSource = (
	...args: Parameters<typeof createMemoryGraphSourceFx>
) => runRepo(createMemoryGraphSourceFx(...args));
const upsertMemoryGraphEdge = (
	...args: Parameters<typeof upsertMemoryGraphEdgeFx>
) => runRepo(upsertMemoryGraphEdgeFx(...args));
const upsertMemoryGraphNode = (
	...args: Parameters<typeof upsertMemoryGraphNodeFx>
) => runRepo(upsertMemoryGraphNodeFx(...args));

type ProjectableMemory = {
	id: string;
	content: string;
	type: "event" | "thought" | "preference" | "fact" | "task";
	keywords: string[];
	unresolved?: boolean;
	sourceStartTs?: string | null;
	sourceEndTs?: string | null;
};

const projectMemoryToGraph = async (
	profileId: string,
	memory: ProjectableMemory
) => {
	const primaryNode = await upsertMemoryGraphNode(profileId, {
		kind: inferPrimaryNodeKind(memory.type),
		canonicalName: `${memory.type}:${memory.id}`,
		summary: memory.content,
		status: memory.unresolved ? "open" : "active",
		payload: {
			memoryId: memory.id,
			memoryType: memory.type,
			unresolved: memory.unresolved ?? false,
			sourceStartTs: memory.sourceStartTs ?? null,
			sourceEndTs: memory.sourceEndTs ?? null,
		},
	});

	await createMemoryGraphSource(profileId, {
		targetKind: "node",
		targetId: primaryNode.id,
		sourceType: "memory",
		sourceId: memory.id,
		evidenceText: memory.content,
		confidence: 0.92,
	});

	const topicTerms = buildGraphProjectionTerms(memory);
	const topicNodes = await Promise.all(
		topicTerms.map(async (term) => {
			const topicNode = await upsertMemoryGraphNode(profileId, {
				kind: "topic",
				canonicalName: term,
				summary: memory.content,
				payload: {
					memoryId: memory.id,
					extractedFrom: "memory_keywords",
				},
			});

			await createMemoryGraphSource(profileId, {
				targetKind: "node",
				targetId: topicNode.id,
				sourceType: "memory",
				sourceId: memory.id,
				evidenceText: memory.content,
				confidence: 0.72,
			});

			return topicNode;
		})
	);

	for (const topicNode of topicNodes) {
		if (topicNode.id === primaryNode.id) {
			continue;
		}

		const edge = await upsertMemoryGraphEdge(profileId, {
			fromNodeId: primaryNode.id,
			relationType: inferPrimaryRelationType(memory.type),
			toNodeId: topicNode.id,
			weight: memory.unresolved ? 0.95 : 0.78,
			sourceType: "memory",
			sourceId: memory.id,
			validFromTs: memory.sourceStartTs ?? null,
			validToTs: memory.sourceEndTs ?? null,
		});

		await createMemoryGraphSource(profileId, {
			targetKind: "edge",
			targetId: edge.id,
			sourceType: "memory",
			sourceId: memory.id,
			evidenceText: memory.content,
			confidence: 0.74,
		});
	}

	const relatedTopicNodes = topicNodes.filter(
		(node) => node.id !== primaryNode.id
	);
	for (let index = 0; index < relatedTopicNodes.length - 1; index += 1) {
		const left = relatedTopicNodes[index];
		const right = relatedTopicNodes[index + 1];

		if (!(left && right) || left.id === right.id) {
			continue;
		}

		const edge = await upsertMemoryGraphEdge(profileId, {
			fromNodeId: left.id,
			relationType: "related_to",
			toNodeId: right.id,
			weight: 0.56,
			sourceType: "memory",
			sourceId: memory.id,
			validFromTs: memory.sourceStartTs ?? null,
			validToTs: memory.sourceEndTs ?? null,
		});

		await createMemoryGraphSource(profileId, {
			targetKind: "edge",
			targetId: edge.id,
			sourceType: "memory",
			sourceId: memory.id,
			evidenceText: memory.content,
			confidence: 0.6,
		});
	}

	return {
		primaryNodeId: primaryNode.id,
		topicNodeCount: topicNodes.length,
	};
};

const projectMemoriesToGraph = async (
	profileId: string,
	memories: ProjectableMemory[]
) => {
	let projectedCount = 0;
	let topicNodeCount = 0;

	for (const memory of memories) {
		const result = await projectMemoryToGraph(profileId, memory);
		projectedCount += 1;
		topicNodeCount += result.topicNodeCount;
	}

	return {
		projectedCount,
		topicNodeCount,
	};
};

export type { ProjectableMemory };
export { projectMemoriesToGraph };
