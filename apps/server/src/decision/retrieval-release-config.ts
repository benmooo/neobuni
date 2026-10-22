interface RetrievalReleaseGateConfig {
  maxAverageJevLatencyMs: number;
  maxProviderErrorRate: number;
  minAgreementRate: number;
  minComparedPairs: number;
}

const createRetrievalReleaseGateConfig = (input: RetrievalReleaseGateConfig) =>
  input;

export type { RetrievalReleaseGateConfig };
export { createRetrievalReleaseGateConfig };
