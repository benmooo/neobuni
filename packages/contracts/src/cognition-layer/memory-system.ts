import { z } from "zod";
import { memoryTypeSchema } from "./memory";

const memoryStoreKindSchema = z.enum(["temporal", "graph", "knowledge"]);

const retrievalReasonSchema = z.enum([
  "explicit_reference",
  "topic_continuity",
  "task_followup",
  "relationship_lookup",
  "world_knowledge",
  "hybrid",
]);

const retrievalIntentSchema = z.enum([
  "personal_history",
  "task_state",
  "relationship_state",
  "topic_continuity",
  "world_knowledge",
  "hybrid",
]);

const retrievalActivationModeSchema = z.enum([
  "prefetch",
  "defer_to_tool",
  "skip",
]);

const temporalMemorySourceTierSchema = z.enum([
  "vector_hit",
  "unresolved_carryover",
  "recent_continuity",
]);

const knowledgeRetrievalQuerySchema = z.object({
  query: z.string().trim().min(1),
  keywords: z.array(z.string()),
  limit: z.number().int().positive(),
});

const temporalRetrievalQuerySchema = knowledgeRetrievalQuerySchema.extend({
  targetPools: z.array(z.enum(["unresolved", "recent", "global"])),
  expectedTypes: z.array(memoryTypeSchema),
});

const graphRetrievalQuerySchema = z.object({
  seedTerms: z.array(z.string()),
  relationTypes: z.array(z.string()),
  maxDepth: z.number().int().positive(),
  limit: z.number().int().positive(),
});

const retrievalIntentProfileSchema = z.object({
  personalHistory: z.number().min(0).max(1),
  relationshipState: z.number().min(0).max(1),
  taskState: z.number().min(0).max(1),
  topicContinuity: z.number().min(0).max(1),
  worldKnowledge: z.number().min(0).max(1),
});

const storeActivationDecisionSchema = z.object({
  mode: retrievalActivationModeSchema,
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});

const storeActivationPlanSchema = z.object({
  temporal: storeActivationDecisionSchema,
  graph: storeActivationDecisionSchema,
  knowledge: storeActivationDecisionSchema,
});

const storeQuerySetSchema = z.object({
  temporal: temporalRetrievalQuerySchema.nullable(),
  graph: graphRetrievalQuerySchema.nullable(),
  knowledge: knowledgeRetrievalQuerySchema.nullable(),
});

const retrievalPlanSchema = z.object({
  intent: retrievalIntentSchema,
  intentProfile: retrievalIntentProfileSchema,
  activation: storeActivationPlanSchema,
  queries: storeQuerySetSchema,
  reasons: z.array(retrievalReasonSchema),
  stores: z.array(memoryStoreKindSchema),
});

const evidenceSourceTypeSchema = z.enum([
  "message",
  "memory",
  "knowledge_chunk",
  "document",
  "manual",
]);

const evidenceKindSchema = z.enum([
  "memory",
  "entity",
  "event",
  "task",
  "fact",
  "chunk",
  "relation",
]);

const evidenceProvenanceSchema = z.object({
  sourceType: evidenceSourceTypeSchema,
  sourceId: z.string().trim().min(1),
  citationLabel: z.string().trim().min(1).optional(),
});

const evidenceItemSchema = z.object({
  id: z.string().trim().min(1),
  store: memoryStoreKindSchema,
  kind: evidenceKindSchema,
  title: z.string().nullable(),
  content: z.string().trim().min(1),
  score: z.number(),
  confidence: z.number().nullable(),
  recency: z.number().nullable(),
  retrievalReason: retrievalReasonSchema,
  provenance: evidenceProvenanceSchema,
  metadata: z.record(z.string(), z.unknown()),
});

const workingMemoryOpenLoopSchema = z.object({
  id: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  sourceStore: memoryStoreKindSchema,
});

const workingMemoryFocusSchema = z.enum([
  "support",
  "reflection",
  "planning",
  "continuity",
  "knowledge",
  "open",
]);

const workingMemoryConstraintSchema = z.object({
  kind: z.enum([
    "emotional_safety",
    "task_continuity",
    "relationship_consistency",
    "knowledge_grounding",
  ]),
  content: z.string().trim().min(1),
  sourceIds: z.array(z.string().trim().min(1)),
});

const workingMemoryActionCandidateSchema = z.object({
  kind: z.enum([
    "offer_supportive_followup",
    "resolve_open_loop",
    "ground_answer_in_world_facts",
    "clarify_relationship_context",
  ]),
  content: z.string().trim().min(1),
  score: z.number().min(0).max(1),
  sourceIds: z.array(z.string().trim().min(1)),
});

const workingMemorySchema = z.object({
  focus: workingMemoryFocusSchema,
  relationshipState: z.array(evidenceItemSchema),
  emotionalState: z.array(evidenceItemSchema),
  personalContext: z.array(evidenceItemSchema),
  activeTasks: z.array(evidenceItemSchema),
  openLoops: z.array(workingMemoryOpenLoopSchema),
  worldFacts: z.array(evidenceItemSchema),
  constraints: z.array(workingMemoryConstraintSchema),
  actionCandidates: z.array(workingMemoryActionCandidateSchema),
});

const memorySliceSchema = z.object({
  id: z.string().trim().min(1),
  content: z.string().trim().min(1),
  type: memoryTypeSchema,
  keywords: z.array(z.string().trim().min(1)),
  unresolved: z.boolean(),
  createdAt: z.string().datetime(),
});

export {
  evidenceItemSchema,
  evidenceKindSchema,
  evidenceProvenanceSchema,
  evidenceSourceTypeSchema,
  graphRetrievalQuerySchema,
  knowledgeRetrievalQuerySchema,
  memorySliceSchema,
  memoryStoreKindSchema,
  retrievalActivationModeSchema,
  retrievalIntentProfileSchema,
  retrievalIntentSchema,
  retrievalPlanSchema,
  retrievalReasonSchema,
  storeActivationDecisionSchema,
  storeActivationPlanSchema,
  storeQuerySetSchema,
  temporalMemorySourceTierSchema,
  temporalRetrievalQuerySchema,
  workingMemoryActionCandidateSchema,
  workingMemoryConstraintSchema,
  workingMemoryFocusSchema,
  workingMemoryOpenLoopSchema,
  workingMemorySchema,
};

export type MemoryStoreKind = z.infer<typeof memoryStoreKindSchema>;
export type RetrievalActivationMode = z.infer<
  typeof retrievalActivationModeSchema
>;
export type RetrievalReason = z.infer<typeof retrievalReasonSchema>;
export type RetrievalIntent = z.infer<typeof retrievalIntentSchema>;
export type RetrievalIntentProfile = z.infer<
  typeof retrievalIntentProfileSchema
>;
export type TemporalMemorySourceTier = z.infer<
  typeof temporalMemorySourceTierSchema
>;
export type RetrievalPlan = z.infer<typeof retrievalPlanSchema>;
export type TemporalRetrievalQuery = z.infer<
  typeof temporalRetrievalQuerySchema
>;
export type GraphRetrievalQuery = z.infer<typeof graphRetrievalQuerySchema>;
export type KnowledgeRetrievalQuery = z.infer<
  typeof knowledgeRetrievalQuerySchema
>;
export type StoreActivationDecision = z.infer<
  typeof storeActivationDecisionSchema
>;
export type StoreActivationPlan = z.infer<typeof storeActivationPlanSchema>;
export type StoreQuerySet = z.infer<typeof storeQuerySetSchema>;
export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type EvidenceProvenance = z.infer<typeof evidenceProvenanceSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type MemorySlice = z.infer<typeof memorySliceSchema>;
export type WorkingMemoryActionCandidate = z.infer<
  typeof workingMemoryActionCandidateSchema
>;
export type WorkingMemoryConstraint = z.infer<
  typeof workingMemoryConstraintSchema
>;
export type WorkingMemoryFocus = z.infer<typeof workingMemoryFocusSchema>;
export type WorkingMemoryOpenLoop = z.infer<typeof workingMemoryOpenLoopSchema>;
export type WorkingMemory = z.infer<typeof workingMemorySchema>;
