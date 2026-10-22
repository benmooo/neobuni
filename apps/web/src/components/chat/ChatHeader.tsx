import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@neobuni/ui/components/dropdown-menu";
import {
	DotsThree,
	List,
	PencilSimple,
	Plus,
	Pulse,
} from "@phosphor-icons/react";
import { useState } from "react";

import { BuniAvatar } from "./BuniAvatar";
import { ConversationSheet } from "./ConversationSheet";

type Props = {
	aiName: string;
	avatarUri: string;
	conversationId: string;
	onNewConversation: () => void;
	onOpenRuntimePage: () => void;
	onRenameConversation: () => void;
	showRuntimeInspector?: boolean;
};

function ChatHeader({
	aiName,
	avatarUri,
	conversationId,
	onNewConversation,
	onOpenRuntimePage,
	onRenameConversation,
	showRuntimeInspector = false,
}: Props) {
	const [sheetOpen, setSheetOpen] = useState(false);

	return (
		<>
			<header className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3">
				{/* Menu button */}
				<Button
					className="rounded-xl text-muted-foreground"
					onClick={() => setSheetOpen(true)}
					size="icon"
					variant="ghost"
				>
					<List size={20} weight="regular" />
				</Button>

				{/* AI identity */}
				<div className="flex flex-1 items-center gap-2">
					<BuniAvatar
						aiName={aiName}
						avatarUri={avatarUri}
						className="rounded-xl"
						fallbackClassName="rounded-xl"
						imageClassName="rounded-xl"
					/>
					<div>
						<p className="font-semibold text-sm leading-none">{aiName}</p>
						<div className="mt-1">
							<Badge variant="outline">在线</Badge>
						</div>
					</div>
				</div>

				{/* Right actions */}
				<div className="flex items-center gap-1">
					<Button
						className="rounded-xl text-muted-foreground"
						onClick={onNewConversation}
						size="icon"
						variant="ghost"
					>
						<Plus size={20} weight="regular" />
					</Button>

					<DropdownMenu>
						<DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
							<DotsThree size={20} weight="regular" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{showRuntimeInspector ? (
								<DropdownMenuItem onClick={onOpenRuntimePage}>
									<Pulse size={16} weight="regular" />
									Runtime
								</DropdownMenuItem>
							) : null}
							<DropdownMenuItem onClick={onRenameConversation}>
								<PencilSimple size={16} weight="regular" />
								重命名
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			<ConversationSheet
				activeConversationId={conversationId}
				onClose={() => setSheetOpen(false)}
				open={sheetOpen}
			/>
		</>
	);
}

export { ChatHeader };
