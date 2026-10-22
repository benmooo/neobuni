import type { ProviderPromptPacket, SurfacePolicy } from "@neobuni/contracts";

const applySurfacePromptPolicy = (input: {
	promptPacket: ProviderPromptPacket;
	surfacePolicy: SurfacePolicy;
}): ProviderPromptPacket => {
	if (
		input.surfacePolicy.responseVisibility !== "group" &&
		input.surfacePolicy.allowAutobiographicalContext
	) {
		return input.promptPacket;
	}

	const extraLines = [
		input.surfacePolicy.responseVisibility === "group"
			? "Response visibility: group-safe public surface."
			: null,
		input.surfacePolicy.allowAutobiographicalContext
			? null
			: "Do not rely on private autobiographical context that is not visible in this conversation.",
	].filter((line): line is string => line !== null);

	if (extraLines.length === 0) {
		return input.promptPacket;
	}

	return {
		...input.promptPacket,
		systemPrompt: [input.promptPacket.systemPrompt, ...extraLines].join("\n"),
	};
};

export { applySurfacePromptPolicy };
