import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { describe, expect, test } from "vitest";

import { router } from "../router";

/**
 * The whole oRPC router is published over the OpenAPI handler mounted at
 * `/api-reference`.
 *
 * `expectedRoutes` is the contract. oRPC derives `POST /<namespace>/<name>` when
 * a procedure has no `.route(...)`, which is neither RESTful nor stable. Adding
 * a procedure therefore means picking a method, path, and tag here as well;
 * otherwise this test fails.
 */

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const httpMethods = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "options",
  "head",
  "trace",
] as const;

const expectedRoutes = [
  ["DELETE", "/conversations/{conversationId}", "Conversations"],
  [
    "DELETE",
    "/conversations/{conversationId}/messages/{messageId}",
    "Messages",
  ],
  ["DELETE", "/knowledge/{documentId}", "Knowledge"],
  ["DELETE", "/memories/{memoryId}", "Memories"],
  ["DELETE", "/schedules/{scheduleId}", "Schedules"],
  ["GET", "/action-proposals/{proposalId}", "Action Proposals"],
  ["GET", "/action-runs/{actionRunId}", "Action Runs"],
  ["GET", "/config/agent", "Config"],
  ["GET", "/config/messaging/discord", "Config"],
  ["GET", "/config/messaging/feishu", "Config"],
  ["GET", "/config/messaging/qq", "Config"],
  ["GET", "/config/messaging/telegram", "Config"],
  ["GET", "/config/provider", "Config"],
  ["GET", "/config/provider-checks", "Config"],
  ["GET", "/config/provider/memory-embedding", "Config"],
  ["GET", "/config/provider/memory-reasoning", "Config"],
  ["GET", "/config/provider/models", "Config"],
  ["GET", "/config/runtime", "Config"],
  ["GET", "/config/soul", "Config"],
  ["GET", "/conversations", "Conversations"],
  ["GET", "/conversations/{conversationId}", "Conversations"],
  ["GET", "/conversations/{conversationId}/messages", "Messages"],
  ["GET", "/conversations/{conversationId}/turns", "Runtime"],
  ["GET", "/goals", "Goals"],
  ["GET", "/goals/{goalId}", "Goals"],
  ["GET", "/goals/{goalId}/decisions/{decisionId}", "Decisions"],
  ["GET", "/health", "Health"],
  ["GET", "/knowledge", "Knowledge"],
  ["GET", "/knowledge/{documentId}", "Knowledge"],
  ["GET", "/memories", "Memories"],
  ["GET", "/memories/{memoryId}", "Memories"],
  ["GET", "/now", "Now"],
  ["GET", "/profile", "Profile"],
  ["GET", "/profile/events", "Profile"],
  ["GET", "/runtime/recent-activity", "Runtime"],
  ["GET", "/runtime/turns/{turnId}", "Runtime"],
  ["GET", "/runtime/turns/{turnId}/spans", "Runtime"],
  ["GET", "/schedules", "Schedules"],
  ["GET", "/schedules/{scheduleId}", "Schedules"],
  ["GET", "/schedules/{scheduleId}/task-runs", "Schedules"],
  ["GET", "/study/goals", "Study"],
  ["GET", "/study/goals/{goalId}", "Study"],
  ["GET", "/study/goals/{goalId}/plan", "Study"],
  ["GET", "/study/goals/{goalId}/progress", "Study"],
  ["GET", "/study/goals/{goalId}/today", "Study"],
  ["GET", "/task-runs/{taskRunId}", "Task Runs"],
  ["GET", "/task-runs/{taskRunId}/trace", "Task Runs"],
  ["GET", "/telegram/targets", "Telegram"],
  ["PATCH", "/conversations/{conversationId}", "Conversations"],
  ["PATCH", "/conversations/{conversationId}/messages/{messageId}", "Messages"],
  ["PATCH", "/goals/{goalId}", "Goals"],
  ["PATCH", "/goals/{goalId}/commitments/{commitmentId}", "Goals"],
  ["PATCH", "/memories/{memoryId}", "Memories"],
  ["PATCH", "/profile", "Profile"],
  ["PATCH", "/schedules/{scheduleId}", "Schedules"],
  ["PATCH", "/study/goals/{goalId}/config", "Study"],
  ["PATCH", "/study/sessions/{sessionId}", "Study"],
  ["POST", "/action-proposals", "Action Proposals"],
  ["POST", "/action-proposals/{proposalId}/authorize", "Action Proposals"],
  ["POST", "/action-proposals/{proposalId}/runs", "Action Runs"],
  ["POST", "/action-runs/{actionRunId}/cancel", "Action Runs"],
  ["POST", "/action-runs/{actionRunId}/confirm-receipt", "Action Runs"],
  ["POST", "/conversations", "Conversations"],
  ["POST", "/conversations/{conversationId}/messages", "Messages"],
  ["POST", "/decisions/{decisionId}/feedback", "Decisions"],
  ["POST", "/goals", "Goals"],
  ["POST", "/goals/next-action-evaluations", "Goals"],
  ["POST", "/goals/{goalId}/commitments", "Goals"],
  ["POST", "/knowledge", "Knowledge"],
  ["POST", "/memories", "Memories"],
  ["POST", "/memories/digest", "Memories"],
  ["POST", "/memories/reindex", "Memories"],
  ["POST", "/memories/search", "Memories"],
  ["POST", "/schedules", "Schedules"],
  ["POST", "/study/goals", "Study"],
  ["POST", "/study/goals/start", "Study"],
  ["POST", "/study/goals/{goalId}/lessons/{planNodeId}/enrich", "Study"],
  ["POST", "/study/goals/{goalId}/plan/activate", "Study"],
  ["POST", "/study/goals/{goalId}/plan/generate", "Study"],
  ["POST", "/study/sessions/{sessionId}/checks", "Study"],
  ["POST", "/study/sessions/{sessionId}/complete", "Study"],
  ["POST", "/study/sessions/{sessionId}/skip", "Study"],
  ["POST", "/telegram/drafts", "Telegram"],
  ["PUT", "/config/agent", "Config"],
  ["PUT", "/config/messaging/discord", "Config"],
  ["PUT", "/config/messaging/feishu", "Config"],
  ["PUT", "/config/messaging/qq", "Config"],
  ["PUT", "/config/messaging/telegram", "Config"],
  ["PUT", "/config/provider", "Config"],
  ["PUT", "/config/provider/memory-embedding", "Config"],
  ["PUT", "/config/provider/memory-reasoning", "Config"],
  ["PUT", "/config/soul", "Config"],
] as const;

const allowedTags = [
  "Action Proposals",
  "Action Runs",
  "Config",
  "Conversations",
  "Decisions",
  "Goals",
  "Health",
  "Knowledge",
  "Memories",
  "Messages",
  "Now",
  "Profile",
  "Runtime",
  "Schedules",
  "Study",
  "Task Runs",
  "Telegram",
] as const;

const generate = () =>
  generator.generate(router, {
    info: { title: "Neobuni API", version: "1.0.0" },
  });

type Document = Awaited<ReturnType<typeof generate>>;

const readOperations = (document: Document) =>
  Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    httpMethods.flatMap((method) => {
      const operation = pathItem?.[method];

      return operation ? [{ method, operation, path }] : [];
    })
  );

const format = (method: string, path: string, tag: string | null) =>
  `${method} ${path} ${tag ?? "(no tag)"}`;

const pathParametersOf = (path: string) =>
  [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();

describe("router OpenAPI document", () => {
  test("publishes every procedure on a dedicated REST route", async () => {
    const actual = readOperations(await generate())
      .map(({ method, operation, path }) =>
        format(method.toUpperCase(), path, operation.tags?.[0] ?? null)
      )
      .sort();

    const expected = expectedRoutes.map(([method, path, tag]) =>
      format(method, path, tag)
    );

    expect(actual).toEqual(expected.sort());
  });

  test("documents every operation", async () => {
    const operations = readOperations(await generate());

    for (const { method, operation, path } of operations) {
      const label = format(method.toUpperCase(), path, null);

      expect(operation.operationId, `${label} operationId`).toBeTruthy();
      expect(operation.summary, `${label} summary`).toBeTruthy();
      expect(operation.description, `${label} description`).toBeTruthy();
      expect(operation.tags, `${label} tags`).toHaveLength(1);
      expect(allowedTags, `${label} tag`).toContain(operation.tags?.[0]);
    }
  });

  test("gives every operation a unique operation id", async () => {
    const operationIds = readOperations(await generate()).map(
      ({ operation }) => operation.operationId
    );

    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  test("declares every path parameter as required", async () => {
    const operations = readOperations(await generate());

    for (const { method, operation, path } of operations) {
      const label = format(method.toUpperCase(), path, null);
      const declared = (operation.parameters ?? []).flatMap((parameter) =>
        parameter && "in" in parameter && parameter.in === "path"
          ? [parameter]
          : []
      );

      expect(
        declared.map((parameter) => parameter.name).sort(),
        `${label} path parameters`
      ).toEqual(pathParametersOf(path));

      for (const parameter of declared) {
        expect(parameter.required, `${label} ${parameter.name} required`).toBe(
          true
        );
      }
    }
  });

  test("serves every documented route through the OpenAPI handler", async () => {
    const handler = new OpenAPIHandler(router);
    const operations = readOperations(await generate());
    const unmatched: string[] = [];

    for (const { method, path } of operations) {
      const url = path.replaceAll(/\{[^}]+\}/g, "probe-id");
      const result = await handler.handle(
        new Request(`http://localhost/api-reference${url}`, {
          method: method.toUpperCase(),
        }),
        // The session-based context is irrelevant: route matching happens
        // before authentication, so unauthenticated calls still match.
        {
          context: { profileId: "probe-profile" } as never,
          prefix: "/api-reference",
        }
      );

      if (!result.matched) {
        unmatched.push(format(method.toUpperCase(), path, null));
      }
    }

    expect(unmatched).toEqual([]);
  });
});
