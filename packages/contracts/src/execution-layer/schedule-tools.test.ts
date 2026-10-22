import { describe, expect, test } from "vitest";

import { createScheduleInputSchema } from "./create-schedule";
import { updateScheduleInputSchema } from "./update-schedule";

describe("schedule tool contracts", () => {
	test("strips the legacy feishuTargetAlias field from create_schedule input", () => {
		const parsed = createScheduleInputSchema.parse({
			title: "Daily reflection",
			taskPrompt: "Generate the report and send it to the configured channel.",
			feishuTargetAlias: "legacy-feishu-room",
			channelTarget: {
				platform: "discord",
				targetAlias: "ops-room",
				targetId: null,
			},
		});

		expect(parsed).not.toHaveProperty("feishuTargetAlias");
		expect(parsed.channelTarget).toEqual({
			platform: "discord",
			targetAlias: "ops-room",
			targetId: null,
		});
	});

	test("strips the legacy feishuTargetAlias field from update_schedule input", () => {
		const parsed = updateScheduleInputSchema.parse({
			scheduleId: "schedule-1",
			feishuTargetAlias: "legacy-feishu-room",
			channelTarget: {
				platform: "telegram",
				targetAlias: "friends-group",
				targetId: null,
			},
		});

		expect(parsed).not.toHaveProperty("feishuTargetAlias");
		expect(parsed.channelTarget).toEqual({
			platform: "telegram",
			targetAlias: "friends-group",
			targetId: null,
		});
	});
});
