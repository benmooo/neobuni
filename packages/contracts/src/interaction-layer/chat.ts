import { z } from "zod";

const chatForwardedPropsSchema = z
	.object({
		conversationId: z.string().trim().min(1).optional(),
		timezone: z.string().trim().min(1).optional(),
	})
	.passthrough();

type ChatForwardedProps = z.infer<typeof chatForwardedPropsSchema>;

export type { ChatForwardedProps };
export { chatForwardedPropsSchema };
