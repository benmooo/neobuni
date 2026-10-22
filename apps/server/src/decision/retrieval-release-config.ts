type RetrievalReleaseGateConfig = {
	minComparedPairs: number;
	minAgreementRate: number;
	maxAverageJevLatencyMs: number;
	maxProviderErrorRate: number;
};

const createRetrievalReleaseGateConfig = (input: RetrievalReleaseGateConfig) =>
	input;

export type { RetrievalReleaseGateConfig };
export { createRetrievalReleaseGateConfig };
