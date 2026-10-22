import { z } from "zod";

const soulRoleSchema = z.enum(["gentle_companion"]);

const relationshipFlavorSchema = z.enum([
	"soft_companion",
	"light_romantic",
	"caregiver_like",
]);

const closenessLevelSchema = z.enum(["low", "medium", "high"]);

const initiativeLevelSchema = z.enum(["low", "medium", "high"]);

const initiativeStyleSchema = z.enum(["subtle", "gentle", "explicit"]);

const interruptionPolicySchema = z.enum([
	"minimal_by_default",
	"allow_soft_interrupt",
	"allow_strong_interrupt_when_abnormal",
]);

const stanceSchema = z.enum([
	"companion",
	"comforting",
	"playful",
	"reflective",
	"protective",
	"mobilizing",
]);

const driveSchema = z.enum([
	"respect",
	"comfort",
	"continuity",
	"protection",
	"progress",
	"connection",
]);

const verbosityLevelSchema = z.enum(["low", "medium", "high"]);

const expressionToneSchema = z.enum(["warm_calm_natural"]);

const expressionPacingSchema = z.enum(["soft_and_clear"]);

const intimacySignalSchema = z.enum([
	"none",
	"low",
	"low_to_medium",
	"medium",
	"subtle",
	"moderate",
]);

const addressingModeSchema = z.enum(["user_name", "preferred_name"]);

const intimacySignalOrder: Record<
	z.infer<typeof intimacySignalSchema>,
	number
> = {
	none: 0,
	low: 1,
	subtle: 2,
	low_to_medium: 3,
	medium: 4,
	moderate: 5,
};

const normalizedNumberSchema = z.number().min(0).max(1);

const uniqueStringArray = (
	itemSchema: z.ZodType<string>,
	min: number,
	max?: number
) =>
	z
		.array(itemSchema)
		.min(min)
		.max(max ?? Number.POSITIVE_INFINITY)
		.superRefine((values, ctx) => {
			if (new Set(values).size !== values.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Array values must be unique.",
				});
			}
		});

const exactDriveOrderSchema = uniqueStringArray(driveSchema, 6, 6).superRefine(
	(values, ctx) => {
		const expected = new Set(driveSchema.options);
		const actual = new Set(values);

		if (
			expected.size !== actual.size ||
			[...expected].some((value) => !actual.has(value))
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Drive priorityOrder must contain each drive exactly once.",
			});
		}
	}
);

const soulTemperamentSchema = z.object({
	warmth: normalizedNumberSchema,
	playfulness: normalizedNumberSchema,
	directness: normalizedNumberSchema,
	proactiveness: normalizedNumberSchema,
	emotionalIntensity: normalizedNumberSchema,
	stability: normalizedNumberSchema,
	soothingTendency: normalizedNumberSchema,
	pushTendency: normalizedNumberSchema,
});

const soulRelationshipContractSchema = z.object({
	role: soulRoleSchema,
	relationshipFlavor: relationshipFlavorSchema,
	closenessLevel: closenessLevelSchema,
	initiativeLevel: initiativeLevelSchema,
	initiativeStyle: initiativeStyleSchema,
	interruptionPolicy: interruptionPolicySchema,
	canGuardWhenAbnormal: z.boolean(),
	canPushWhenUserIsReady: z.boolean(),
});

const soulValuePolicySchema = z.object({
	immutableCore: uniqueStringArray(z.string().trim().min(1), 1),
	primary: uniqueStringArray(z.string().trim().min(1), 1),
	antiValues: uniqueStringArray(z.string().trim().min(1), 1),
});

const soulDriveWeightsSchema = z.object({
	respect: normalizedNumberSchema,
	comfort: normalizedNumberSchema,
	continuity: normalizedNumberSchema,
	protection: normalizedNumberSchema,
	progress: normalizedNumberSchema,
	connection: normalizedNumberSchema,
});

const soulDriveConfigSchema = z.object({
	priorityOrder: exactDriveOrderSchema,
	weights: soulDriveWeightsSchema,
});

const expressionIntimacySchema = z
	.object({
		default: intimacySignalSchema,
		maxWithoutUserSignal: intimacySignalSchema,
	})
	.superRefine((value, ctx) => {
		if (
			intimacySignalOrder[value.default] >
			intimacySignalOrder[value.maxWithoutUserSignal]
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Default intimacy cannot exceed maxWithoutUserSignal.",
				path: ["default"],
			});
		}
	});

const soulAddressingConfigSchema = z.object({
	mode: addressingModeSchema.default("user_name"),
	preferredName: z.string().trim().max(80).default(""),
});

const soulExpressionStyleSchema = z.object({
	tone: expressionToneSchema,
	pacing: expressionPacingSchema,
	verbosity: verbosityLevelSchema,
	intimacy: expressionIntimacySchema,
	addressing: soulAddressingConfigSchema.default({
		mode: "user_name",
		preferredName: "",
	}),
});

const soulConfigInputSchema = z.object({
	name: z.string().trim().min(1).max(120),
	temperament: soulTemperamentSchema,
	relationship: soulRelationshipContractSchema,
	values: soulValuePolicySchema,
	drives: soulDriveConfigSchema,
	expression: soulExpressionStyleSchema,
});

const soulConfigSchema = soulConfigInputSchema.extend({
	id: z.string(),
	profileId: z.string(),
	version: z.number().int().min(1),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const soulConfigPatchSchema = z
	.object({
		temperament: soulTemperamentSchema
			.pick({
				playfulness: true,
				directness: true,
			})
			.partial(),
		relationship: soulRelationshipContractSchema
			.pick({
				closenessLevel: true,
				initiativeLevel: true,
				relationshipFlavor: true,
			})
			.partial(),
		expression: soulExpressionStyleSchema
			.pick({
				verbosity: true,
				intimacy: true,
				addressing: true,
			})
			.partial(),
	})
	.superRefine((value, ctx) => {
		const hasUpdates = Object.values(value).some(
			(section) => section !== undefined && Object.keys(section).length > 0
		);

		if (!hasUpdates) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "At least one configurable soul field must be provided.",
			});
		}
	});

export {
	addressingModeSchema,
	closenessLevelSchema,
	driveSchema,
	expressionPacingSchema,
	expressionToneSchema,
	initiativeLevelSchema,
	initiativeStyleSchema,
	interruptionPolicySchema,
	intimacySignalSchema,
	relationshipFlavorSchema,
	soulAddressingConfigSchema,
	soulConfigInputSchema,
	soulConfigPatchSchema,
	soulConfigSchema,
	soulDriveConfigSchema,
	soulDriveWeightsSchema,
	soulExpressionStyleSchema,
	soulRelationshipContractSchema,
	soulRoleSchema,
	soulTemperamentSchema,
	soulValuePolicySchema,
	stanceSchema,
	verbosityLevelSchema,
};

export type AddressingMode = z.infer<typeof addressingModeSchema>;
export type ClosenessLevel = z.infer<typeof closenessLevelSchema>;
export type Drive = z.infer<typeof driveSchema>;
export type ExpressionPacing = z.infer<typeof expressionPacingSchema>;
export type ExpressionTone = z.infer<typeof expressionToneSchema>;
export type InitiativeLevel = z.infer<typeof initiativeLevelSchema>;
export type InitiativeStyle = z.infer<typeof initiativeStyleSchema>;
export type InterruptionPolicy = z.infer<typeof interruptionPolicySchema>;
export type IntimacySignal = z.infer<typeof intimacySignalSchema>;
export type RelationshipFlavor = z.infer<typeof relationshipFlavorSchema>;
export type SoulConfig = z.infer<typeof soulConfigSchema>;
export type SoulConfigInput = z.infer<typeof soulConfigInputSchema>;
export type SoulConfigPatch = z.infer<typeof soulConfigPatchSchema>;
export type SoulAddressingConfig = z.infer<typeof soulAddressingConfigSchema>;
export type SoulDriveConfig = z.infer<typeof soulDriveConfigSchema>;
export type SoulDriveWeights = z.infer<typeof soulDriveWeightsSchema>;
export type SoulExpressionStyle = z.infer<typeof soulExpressionStyleSchema>;
export type SoulRelationshipContract = z.infer<
	typeof soulRelationshipContractSchema
>;
export type SoulRole = z.infer<typeof soulRoleSchema>;
export type SoulTemperament = z.infer<typeof soulTemperamentSchema>;
export type SoulValuePolicy = z.infer<typeof soulValuePolicySchema>;
export type Stance = z.infer<typeof stanceSchema>;
export type VerbosityLevel = z.infer<typeof verbosityLevelSchema>;
