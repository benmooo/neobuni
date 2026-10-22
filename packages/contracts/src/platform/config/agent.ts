import { z } from "zod";

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const avatarUriSchema = z
  .string()
  .trim()
  .max(1_000_000)
  .default("")
  .refine(
    (value) =>
      value.length === 0
      || value.startsWith("data:image/")
      || isHttpUrl(value),
    {
      message: "Avatar URI must be empty, an http(s) URL, or a data:image URI.",
    },
  );

const agentConfigInputSchema = z.object({
  aiName: z.string().trim().min(1).max(80),
  avatarUri: avatarUriSchema,
  userName: z.string().trim().min(1).max(80),
  userPersona: z.string().trim().max(6000).default(""),
});

const agentConfigSchema = agentConfigInputSchema.extend({
  id: z.string(),
  profileId: z.string(),
  soulConfigId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export { agentConfigInputSchema, agentConfigSchema };
