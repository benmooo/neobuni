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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@neobuni/ui/components/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@neobuni/ui/components/sheet";
import { cn } from "@neobuni/ui/lib/utils";
import {
	BookOpen,
	CalendarDots,
	ChatCircleDots,
	DotsThree,
	GearSix,
	PencilSimple,
	Plus,
	Sparkle,
	Target,
	TerminalWindow,
	Trash,
} from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
	useConversationList,
	useCreateConversation,
	useDeleteConversation,
} from "../../hooks/use-conversation-list";
import { RenameDialog } from "./RenameDialog";

type Props = {
	open: boolean;
	onClose: () => void;
	activeConversationId?: string;
};

const NAV_LINKS = [
	{ to: "/now", label: "Now", icon: Target },
	{ to: "/memories", label: "记忆", icon: Sparkle },
	{ to: "/knowledge", label: "知识库", icon: BookOpen },
	{ to: "/schedules", label: "日程", icon: CalendarDots },
	{ to: "/ops", label: "Ops", icon: TerminalWindow },
	{ to: "/settings", label: "设置", icon: GearSix },
] as const;

function ConversationSheet({ open, onClose, activeConversationId }: Props) {
	const navigate = useNavigate();
	const { data: conversations = [] } = useConversationList();
	const createConversation = useCreateConversation();
	const deleteConversation = useDeleteConversation();

	const [renameTarget, setRenameTarget] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

	const handleNew = async () => {
		const now = new Date();
		const title = new Intl.DateTimeFormat("zh-CN", {
			month: "numeric",
			day: "numeric",
		}).format(now);
		const conversation = await createConversation.mutateAsync(title);
		onClose();
		navigate({
			to: "/chat/$conversationId",
			params: { conversationId: conversation.id },
		});
	};

	const handleDelete = async () => {
		if (!deleteTarget) {
			return;
		}
		await deleteConversation.mutateAsync(deleteTarget);
		setDeleteTarget(null);

		if (deleteTarget === activeConversationId) {
			const remaining = conversations.filter((c) => c.id !== deleteTarget);
			if (remaining.length > 0) {
				navigate({
					to: "/chat/$conversationId",
					params: { conversationId: remaining[0].id },
					replace: true,
				});
			} else {
				navigate({ to: "/chat", replace: true });
			}
		}
	};

	return (
		<>
			<Sheet onOpenChange={(v) => !v && onClose()} open={open}>
				<SheetContent className="flex w-72 flex-col p-0" side="left">
					<SheetHeader className="border-border/50 border-b px-5 py-4">
						<div className="flex items-center justify-between">
							<SheetTitle className="font-semibold text-base">Buni</SheetTitle>
						</div>
					</SheetHeader>

					{/* Conversation list */}
					<div className="flex flex-1 flex-col overflow-hidden">
						<Button
							className="mx-3 mt-3 justify-start gap-2"
							onClick={handleNew}
							variant="ghost"
						>
							<Plus size={16} weight="bold" />
							新对话
						</Button>

						<div className="mt-2 flex flex-col gap-0.5 overflow-y-auto px-3 pb-2">
							{conversations.map((conv) => (
								<div
									className={cn(
										"group flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
										conv.id === activeConversationId
											? "bg-secondary text-secondary-foreground"
											: "text-foreground hover:bg-muted"
									)}
									key={conv.id}
								>
									<Link
										className="flex min-w-0 flex-1 items-center gap-2"
										onClick={onClose}
										params={{ conversationId: conv.id }}
										to="/chat/$conversationId"
									>
										<ChatCircleDots
											className="shrink-0"
											size={15}
											weight={
												conv.id === activeConversationId ? "fill" : "regular"
											}
										/>
										<span className="truncate">{conv.title}</span>
									</Link>

									<DropdownMenu>
										<DropdownMenuTrigger className="shrink-0 rounded-md p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
											<DotsThree size={16} weight="bold" />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() =>
													setRenameTarget({ id: conv.id, title: conv.title })
												}
											>
												<PencilSimple className="mr-2" size={14} />
												重命名
											</DropdownMenuItem>
											<DropdownMenuItem
												className="text-destructive focus:text-destructive"
												onClick={() => setDeleteTarget(conv.id)}
											>
												<Trash className="mr-2" size={14} />
												删除
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							))}
						</div>
					</div>

					{/* Bottom nav */}
					<div className="border-border/50 border-t px-3 py-3">
						{NAV_LINKS.map(({ to, label, icon: Icon }) => (
							<Link
								className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-secondary [&.active]:text-secondary-foreground"
								key={to}
								onClick={onClose}
								to={to}
							>
								<Icon size={17} weight="duotone" />
								{label}
							</Link>
						))}
					</div>
				</SheetContent>
			</Sheet>

			{/* Rename dialog */}
			{renameTarget && (
				<RenameDialog
					conversationId={renameTarget.id}
					currentTitle={renameTarget.title}
					onClose={() => setRenameTarget(null)}
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
						<AlertDialogTitle>删除对话</AlertDialogTitle>
						<AlertDialogDescription>
							删除后无法恢复，确定要删除这个对话吗？
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
		</>
	);
}

export { ConversationSheet };
