import { describe, expect, test } from "vitest";

import { createReminderInputSchema } from "./create-reminder";

describe("datetime execution-layer contracts", () => {
	test("createReminderInputSchema accepts direct triggerAt input", () => {
		const parsed = createReminderInputSchema.parse({
			title: "Pay rent",
			content: "Transfer this month's rent.",
			triggerAt: "2026-06-05T01:30:00.000Z",
			timezone: "Asia/Shanghai",
		});

		expect(parsed.triggerAt).toBe("2026-06-05T01:30:00.000Z");
		expect(parsed.timezone).toBe("Asia/Shanghai");
		expect("resolutionId" in parsed).toBe(false);
	});

	test("tools export now contract and not resolve_datetime contract", async () => {
		const mod = await import("./tools");

		expect("nowDef" in mod).toBe(true);
		expect("nowInputSchema" in mod).toBe(true);
		expect("resolveDatetimeDef" in mod).toBe(false);
		expect("resolveDatetimeInputSchema" in mod).toBe(false);
	});
});
