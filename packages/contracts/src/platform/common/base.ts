import { z } from "zod";

const idSchema = z.string().min(1);
const isoDateTimeSchema = z.string().datetime();

export { idSchema, isoDateTimeSchema };
