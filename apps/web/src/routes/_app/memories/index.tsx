import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@neobuni/ui/components/alert-dialog";
import { Button } from "@neobuni/ui/components/button";
import { Spinner } from "@neobuni/ui/components/spinner";
import { ArrowsClockwise, Brain, Plus } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DigestButton } from "@/components/memories/DigestButton";
import { type Memory, MemoryCard } from "@/components/memories/MemoryCard";
import {
  type MemoryData,
  MemoryEditDialog,
} from "@/components/memories/MemoryEditDialog";
import {
  type Filters,
  MemoryFilters,
} from "@/components/memories/MemoryFilters";
import { PageHeader } from "@/components/PageHeader";
import {
  useDeleteMemory,
  useMemoryList,
  useReindexMemories,
} from "@/hooks/use-memories";

export const Route = createFileRoute("/_app/memories/")({
  component: MemoriesPage,
});

function MemoriesPage() {
  const [filters, setFilters] = useState<Filters>({
    search: "",
    type: undefined,
    unresolved: undefined,
  });
  const [editTarget, setEditTarget] = useState<MemoryData | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [reindexOpen, setReindexOpen] = useState(false);

  const { data: memories, isLoading } = useMemoryList({
    type: filters.type,
    unresolved: filters.unresolved,
  });
  const deleteMutation = useDeleteMemory();
  const reindexMutation = useReindexMemories();

  // Client-side text search filter
  const filtered = filters.search
    ? (memories ?? []).filter(
        (m) =>
          m.content.includes(filters.search) ||
          m.keywords.some((k) => k.includes(filters.search))
      )
    : (memories ?? []);

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    await deleteMutation.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  };

  const handleReindex = async () => {
    await reindexMutation.mutateAsync();
    setReindexOpen(false);
  };

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        actions={
          <div className="flex gap-1">
            <DigestButton />
            <Button
              className="rounded-xl text-muted-foreground"
              disabled={reindexMutation.isPending}
              onClick={() => setReindexOpen(true)}
              size="icon"
              variant="ghost"
            >
              <ArrowsClockwise
                className={
                  reindexMutation.isPending ? "animate-spin" : undefined
                }
                size={20}
                weight="regular"
              />
            </Button>
            <Button
              className="rounded-xl text-muted-foreground"
              onClick={() => setCreateOpen(true)}
              size="icon"
              variant="ghost"
            >
              <Plus size={20} weight="regular" />
            </Button>
          </div>
        }
        title="记忆"
      />

      <MemoryFilters filters={filters} onChange={setFilters} />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {(reindexMutation.isError || reindexMutation.isSuccess) && (
          <Alert className="mb-3">
            {reindexMutation.isError ? (
              <AlertDescription>
                重建向量失败：
                {reindexMutation.error instanceof Error
                  ? reindexMutation.error.message
                  : "请检查记忆向量化配置后重试。"}
              </AlertDescription>
            ) : reindexMutation.data ? (
              <AlertDescription>
                向量重建完成：共 {reindexMutation.data.total} 条，成功{" "}
                {reindexMutation.data.reindexed} 条，失败{" "}
                {reindexMutation.data.failed} 条。
              </AlertDescription>
            ) : null}
          </Alert>
        )}

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <Brain
              className="text-muted-foreground/50"
              size={32}
              weight="duotone"
            />
            <p className="text-muted-foreground text-sm">
              {filters.search || filters.type || filters.unresolved
                ? "没有匹配的记忆"
                : "还没有记忆，从对话中生成或手动添加"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory as Memory}
                onDelete={setDeleteTarget}
                onEdit={(m) =>
                  setEditTarget({
                    id: m.id,
                    content: m.content,
                    type: m.type as MemoryData["type"],
                    keywords: m.keywords,
                    importance: m.importance,
                    unresolved: m.unresolved,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {createOpen && (
        <MemoryEditDialog onClose={() => setCreateOpen(false)} open />
      )}

      {/* Edit dialog */}
      {editTarget && (
        <MemoryEditDialog
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          open
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除记忆</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，确定要删除这条记忆吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(value) => !value && setReindexOpen(false)}
        open={reindexOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重建记忆向量</AlertDialogTitle>
            <AlertDialogDescription>
              这会重新为当前所有记忆生成
              embedding，用于迁移模型或修复向量索引。过程可能持续一段时间。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reindexMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reindexMutation.isPending}
              onClick={handleReindex}
            >
              {reindexMutation.isPending ? "重建中…" : "开始重建"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
