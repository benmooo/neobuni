import { createAuth } from "@neobuni/auth";
import { createDb } from "@neobuni/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
