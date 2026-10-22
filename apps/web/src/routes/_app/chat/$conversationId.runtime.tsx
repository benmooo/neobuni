import { idSchema } from "@neobuni/contracts";
import { Button } from "@neobuni/ui/components/button";
import { Spinner } from "@neobuni/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { RuntimeTimelinePage } from "@/components/chat/RuntimeTimelineSheet";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";

const conversationRuntimeSearchSchema = z.object({
  turnId: idSchema.optional(),
});

export const Route = createFileRoute("/_app/chat/$conversationId/runtime")({
  validateSearch: conversationRuntimeSearchSchema,
  component: ConversationRuntimePage,
});

function ConversationRuntimePage() {
  const navigate = useNavigate();
  const { conversationId } = Route.useParams();
  const search = Route.useSearch();

  const conversationQuery = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => api.conversations.get({ conversationId }),
  });

  if (conversationQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        actions={
          <Button
            className="rounded-xl"
            onClick={() =>
              navigate({
                to: "/chat/$conversationId",
                params: { conversationId },
              })
            }
            size="sm"
            variant="ghost"
          >
            返回对话
          </Button>
        }
        title="Runtime Timeline"
      />

      <div className="border-border/60 border-b px-4 py-3">
        <p className="font-medium text-foreground text-sm">
          {conversationQuery.data?.title ?? "Conversation"}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          观察当前 conversation 的 turn 和 pipeline spans
        </p>
      </div>

      <RuntimeTimelinePage
        conversationId={conversationId}
        initialTurnId={search.turnId ?? null}
      />
    </div>
  );
}
