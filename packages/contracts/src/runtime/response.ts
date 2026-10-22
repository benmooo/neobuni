import { z } from "zod";

import {
  intimacySignalSchema,
  stanceSchema,
  verbosityLevelSchema,
} from "../core-layer/soul";

const responseGoalSchema = z.enum([
  "stay_present",
  "soothe",
  "clarify",
  "guard",
  "gently_mobilize",
]);

const responseToolPolicySchema = z.enum(["avoid", "allow", "prefer"]);

const responseSpecSchema = z.object({
  goal: responseGoalSchema,
  stance: stanceSchema,
  tone: z.array(z.string().trim().min(1)),
  mustAvoid: z.array(z.string().trim().min(1)),
  intimacyCap: intimacySignalSchema,
  verbosity: verbosityLevelSchema,
  shouldAskFollowup: z.boolean(),
  shouldSuggestAction: z.boolean(),
  toolPolicy: responseToolPolicySchema,
});

export { responseGoalSchema, responseSpecSchema, responseToolPolicySchema };

export type ResponseGoal = z.infer<typeof responseGoalSchema>;
export type ResponseSpec = z.infer<typeof responseSpecSchema>;
export type ResponseToolPolicy = z.infer<typeof responseToolPolicySchema>;
