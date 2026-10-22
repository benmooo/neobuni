import { z } from "zod";

const runtimeSurfaceSchema = z.enum([
	"chat_private",
	"chat_public_safe",
	"task_run_private",
	"task_run_public_safe",
]);

const surfaceResponseVisibilitySchema = z.enum(["private", "group"]);

const surfacePolicySchema = z.object({
	surface: runtimeSurfaceSchema,
	allowMemoryRecall: z.boolean(),
	allowMemoryWrite: z.boolean(),
	allowAutobiographicalContext: z.boolean(),
	allowScheduleMutation: z.boolean(),
	toolAllowlist: z.array(z.string().trim().min(1)).nullable(),
	responseVisibility: surfaceResponseVisibilitySchema,
});

export {
	runtimeSurfaceSchema,
	surfacePolicySchema,
	surfaceResponseVisibilitySchema,
};

export type RuntimeSurface = z.infer<typeof runtimeSurfaceSchema>;
export type SurfacePolicy = z.infer<typeof surfacePolicySchema>;
export type SurfaceResponseVisibility = z.infer<
	typeof surfaceResponseVisibilitySchema
>;
