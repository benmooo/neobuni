import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Button } from "@neobuni/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@neobuni/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neobuni/ui/components/select";
import { Lightning } from "@phosphor-icons/react";
import { useState } from "react";

import { useConversationList } from "../../hooks/use-conversation-list";
import { useDigestMemories } from "../../hooks/use-memories";

function DigestButton() {
  const [open, setOpen] = useState(false);
  const [selectedConv, setSelectedConv] = useState<string>("");
  const { data: conversations = [] } = useConversationList();
  const digest = useDigestMemories();

  const handleDigest = async () => {
    if (!selectedConv) {
      return;
    }
    await digest.mutateAsync(selectedConv);
    setOpen(false);
    setSelectedConv("");
  };

  return (
    <>
      <Button
        className="rounded-xl text-muted-foreground"
        onClick={() => setOpen(true)}
        size="icon"
        variant="ghost"
      >
        <Lightning size={20} weight="duotone" />
      </Button>

      <Dialog onOpenChange={(v) => !v && setOpen(false)} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成记忆摘要</DialogTitle>
          </DialogHeader>

          <p className="text-muted-foreground text-sm">
            从对话中提取重要信息并自动生成记忆条目。
          </p>

          <Select
            onValueChange={(value) => setSelectedConv(value ?? "")}
            value={selectedConv}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="选择对话..." />
            </SelectTrigger>
            <SelectContent>
              {conversations.map((conv) => (
                <SelectItem key={conv.id} value={conv.id}>
                  {conv.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {digest.isSuccess && (
            <Alert>
              <AlertDescription>
                生成了{" "}
                {(digest.data as { memoriesCreated: number }).memoriesCreated}{" "}
                条记忆
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              className="rounded-xl"
              disabled={!selectedConv || digest.isPending}
              onClick={handleDigest}
              size="sm"
            >
              {digest.isPending ? "生成中…" : "开始生成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { DigestButton };
