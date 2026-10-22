import { createFileRoute, redirect } from "@tanstack/react-router";

import { api } from "@/lib/api";

export const Route = createFileRoute("/_app/chat/")({
  beforeLoad: async ({ location }) => {
    // 已经在具体对话页面，不再重定向
    if (location.pathname !== "/chat") {
      return;
    }

    const conversations = await api.conversations.list();

    if (conversations.length > 0) {
      throw redirect({
        to: "/chat/$conversationId",
        params: { conversationId: conversations[0].id },
        replace: true,
      });
    }

    // No conversations — create a default one
    const now = new Date();
    const title = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
    }).format(now);

    const created = await api.conversations.create({
      title,
      modelKey: "default",
    });

    throw redirect({
      to: "/chat/$conversationId",
      params: { conversationId: created.id },
    });
  },
});
