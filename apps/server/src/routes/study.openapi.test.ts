import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { describe, expect, test } from "vitest";

import { studyRouter } from "../routers/study";

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const expectedRoutes = [
  ["get", "/study/goals"],
  ["get", "/study/goals/{goalId}"],
  ["post", "/study/goals"],
  ["patch", "/study/goals/{goalId}/config"],
  ["post", "/study/goals/start"],
  ["post", "/study/goals/{goalId}/plan/generate"],
  ["get", "/study/goals/{goalId}/plan"],
  ["post", "/study/goals/{goalId}/plan/activate"],
  ["post", "/study/goals/{goalId}/lessons/{planNodeId}/enrich"],
  ["get", "/study/goals/{goalId}/today"],
  ["get", "/study/goals/{goalId}/progress"],
  ["post", "/study/sessions/{sessionId}/checks"],
  ["post", "/study/sessions/{sessionId}/complete"],
  ["post", "/study/sessions/{sessionId}/skip"],
  ["patch", "/study/sessions/{sessionId}"],
] as const;

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

describe("study OpenAPI document", () => {
  test("publishes every procedure on a REST path with docs metadata", async () => {
    const document = await generator.generate(
      { study: studyRouter },
      { info: { title: "Test", version: "1.0.0" } }
    );

    const routes = Object.entries(document.paths ?? {}).flatMap(
      ([path, pathItem]) =>
        httpMethods.flatMap((method) => {
          const operation = pathItem?.[method];
          return operation ? [[method, path, operation] as const] : [];
        })
    );

    expect(routes.map(([method, path]) => [method, path]).sort()).toEqual(
      expectedRoutes.map(([method, path]) => [method, path]).sort()
    );

    for (const [, , operation] of routes) {
      expect(operation.summary).toBeTruthy();
      expect(operation.description).toBeTruthy();
      expect(operation.tags).toEqual(["Study"]);
    }
  });

  test("keeps path parameters typed in the generated spec", async () => {
    const document = await generator.generate(
      { study: studyRouter },
      { info: { title: "Test", version: "1.0.0" } }
    );

    const operation = document.paths?.["/study/sessions/{sessionId}"]?.patch;
    const parameters = operation?.parameters ?? [];

    expect(parameters).toContainEqual(
      expect.objectContaining({ in: "path", name: "sessionId", required: true })
    );
  });
});
