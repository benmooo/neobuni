import { z } from "zod";

const conversationCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  modelKey: z.string().trim().min(1).max(120).default("default"),
});

const conversationSchema = conversationCreateSchema.extend({
  id: z.string(),
  profileId: z.string(),
  hidden: z.boolean().default(false),
  status: z.enum(["active", "archived"]).default("active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const conversationUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export { conversationCreateSchema, conversationSchema, conversationUpdateSchema };
