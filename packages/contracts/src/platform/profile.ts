import { z } from "zod";

const isValidTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(isValidTimeZone, "Timezone must be a valid IANA timezone.");

const profileSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable(),
  name: z.string(),
  kind: z.string(),
  timezone: timezoneSchema.nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const profileUpdateInputSchema = z.object({
  timezone: timezoneSchema.nullable(),
});

export type Profile = z.infer<typeof profileSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;

export { profileSchema, profileUpdateInputSchema, timezoneSchema };
