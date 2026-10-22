import { z } from "zod";

const eventSchema = z.object({
	id: z.string(),
	profileId: z.string(),
	type: z.string().min(1).max(120),
	payload: z.record(z.string(), z.unknown()),
	createdAt: z.string().datetime(),
});

export { eventSchema };
