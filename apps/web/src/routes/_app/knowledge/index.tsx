import type { KnowledgeDocumentCreateInput } from "@neobuni/contracts";
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
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@neobuni/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@neobuni/ui/components/dialog";
import { Input } from "@neobuni/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@neobuni/ui/components/select";
import { Spinner } from "@neobuni/ui/components/spinner";
import { Textarea } from "@neobuni/ui/components/textarea";
import {
	BookOpen,
	FileText,
	LinkSimple,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import {
	useCreateKnowledgeDocument,
	useDeleteKnowledgeDocument,
	useKnowledgeDocumentDetail,
	useKnowledgeDocuments,
} from "@/hooks/use-knowledge";

export const Route = createFileRoute("/_app/knowledge/")({
	component: KnowledgePage,
});

const initialDraft: KnowledgeDocumentCreateInput = {
	title: "",
	content: "",
	sourceType: "manual",
	sourceUri: null,
	scope: "profile",
	trustLevel: "imported",
};

const formatDate = (value: string) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));

function KnowledgePage() {
	const [importOpen, setImportOpen] = useState(false);
	const [detailId, setDetailId] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [draft, setDraft] =
		useState<KnowledgeDocumentCreateInput>(initialDraft);

	const documentsQuery = useKnowledgeDocuments();
	const detailQuery = useKnowledgeDocumentDetail(detailId);
	const createMutation = useCreateKnowledgeDocument();
	const deleteMutation = useDeleteKnowledgeDocument();

	const documents = documentsQuery.data ?? [];
	const importSummary = useMemo(() => {
		if (!createMutation.data) {
			return null;
		}

		return createMutation.data.created
			? `导入完成：${createMutation.data.chunkCount} 个 chunk，${createMutation.data.factCount} 条 fact。`
			: "已存在相同 checksum 的知识文档，本次未重复导入。";
	}, [createMutation.data]);

	const handleImport = async () => {
		await createMutation.mutateAsync({
			...draft,
			title: draft.title.trim(),
			content: draft.content.trim(),
			sourceUri:
				draft.sourceUri && draft.sourceUri.trim().length > 0
					? draft.sourceUri.trim()
					: null,
			scope: "profile",
		});

		setImportOpen(false);
		setDraft(initialDraft);
	};

	const handleDelete = async () => {
		if (!deleteId) {
			return;
		}

		await deleteMutation.mutateAsync(deleteId);
		if (detailId === deleteId) {
			setDetailId(null);
		}
		setDeleteId(null);
	};

	const isImportDisabled =
		createMutation.isPending ||
		draft.title.trim().length === 0 ||
		draft.content.trim().length === 0;

	return (
		<div className="flex h-screen flex-col">
			<PageHeader
				actions={
					<Button
						className="rounded-xl text-muted-foreground"
						onClick={() => setImportOpen(true)}
						size="icon"
						variant="ghost"
					>
						<Plus size={20} weight="regular" />
					</Button>
				}
				title="知识库"
			/>

			<div className="flex-1 overflow-y-auto px-4 pb-4">
				{createMutation.isError ? (
					<Alert className="mt-4" variant="destructive">
						<AlertDescription>
							导入失败：
							{createMutation.error instanceof Error
								? createMutation.error.message
								: "请稍后重试。"}
						</AlertDescription>
					</Alert>
				) : null}

				{importSummary ? (
					<Alert className="mt-4">
						<AlertDescription>{importSummary}</AlertDescription>
					</Alert>
				) : null}

				{documentsQuery.isLoading ? (
					<div className="flex h-40 items-center justify-center">
						<Spinner className="size-5 text-muted-foreground" />
					</div>
				) : documents.length === 0 ? (
					<div className="flex h-52 flex-col items-center justify-center gap-3 text-center">
						<BookOpen
							className="text-muted-foreground/50"
							size={32}
							weight="duotone"
						/>
						<div className="space-y-1">
							<p className="text-foreground text-sm">还没有知识文档</p>
							<p className="text-muted-foreground text-sm">
								先导入一段文档、笔记或外部资料，系统会自动切 chunk，并在
								provider 可用时补 embedding 与 fact。
							</p>
						</div>
					</div>
				) : (
					<div className="mt-4 flex flex-col gap-3">
						{documents.map((document) => (
							<Card key={document.id}>
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 space-y-2">
											<CardTitle className="truncate text-base">
												{document.title}
											</CardTitle>
											<div className="flex flex-wrap gap-2">
												<Badge variant="outline">{document.sourceType}</Badge>
												<Badge variant="outline">{document.scope}</Badge>
												<Badge variant="outline">{document.trustLevel}</Badge>
												<Badge variant="outline">
													{document.chunkCount} chunks
												</Badge>
												<Badge variant="outline">
													{document.factCount} facts
												</Badge>
												{document.profileId === null ? (
													<Badge variant="outline">read-only</Badge>
												) : null}
											</div>
										</div>
										{document.profileId === null ? null : (
											<Button
												className="rounded-xl text-muted-foreground"
												onClick={() => setDeleteId(document.id)}
												size="icon"
												variant="ghost"
											>
												<Trash size={18} />
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
										<span>updated {formatDate(document.updatedAt)}</span>
										{document.sourceUri ? (
											<span className="truncate">
												source {document.sourceUri}
											</span>
										) : null}
									</div>
									<div className="flex gap-2">
										<Button
											className="rounded-2xl"
											onClick={() => setDetailId(document.id)}
											variant="outline"
										>
											查看详情
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>

			<Dialog
				onOpenChange={(open) =>
					!createMutation.isPending && setImportOpen(open)
				}
				open={importOpen}
			>
				<DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>导入知识文档</DialogTitle>
						<DialogDescription>
							导入后会写入 `knowledge_documents / chunks / facts`。embedding 或
							fact extraction provider 没配好时，也会先以纯文本文档导入。
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3">
						<div className="space-y-2">
							<label className="font-medium text-sm">标题</label>
							<Input
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										title: event.target.value,
									}))
								}
								placeholder="例如：BRDF 学习笔记"
								value={draft.title}
							/>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-2">
								<label className="font-medium text-sm">来源类型</label>
								<Select
									onValueChange={(value) => {
										if (!value) {
											return;
										}

										setDraft((current) => ({
											...current,
											sourceType: value,
										}));
									}}
									value={draft.sourceType}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="manual">manual</SelectItem>
										<SelectItem value="note">note</SelectItem>
										<SelectItem value="web">web</SelectItem>
										<SelectItem value="file">file</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<label className="font-medium text-sm">来源 URI</label>
								<Input
									onChange={(event) =>
										setDraft((current) => ({
											...current,
											sourceUri: event.target.value,
										}))
									}
									placeholder="可选，例如 https://... 或本地标识"
									value={draft.sourceUri ?? ""}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<label className="font-medium text-sm">正文</label>
							<Textarea
								className="min-h-56"
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										content: event.target.value,
									}))
								}
								placeholder="粘贴文档、笔记、术语说明或领域资料"
								value={draft.content}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							disabled={createMutation.isPending}
							onClick={() => setImportOpen(false)}
							variant="outline"
						>
							取消
						</Button>
						<Button disabled={isImportDisabled} onClick={handleImport}>
							{createMutation.isPending ? "导入中…" : "开始导入"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				onOpenChange={(open) => !open && setDetailId(null)}
				open={detailId !== null}
			>
				<DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>
							{detailQuery.data?.title ?? "知识文档详情"}
						</DialogTitle>
						<DialogDescription>
							查看 chunk 与 fact extraction 结果。
						</DialogDescription>
					</DialogHeader>

					{detailQuery.isLoading ? (
						<div className="flex h-40 items-center justify-center">
							<Spinner className="size-5 text-muted-foreground" />
						</div>
					) : detailQuery.data ? (
						<div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
							<div className="flex flex-wrap gap-2">
								<Badge variant="outline">{detailQuery.data.sourceType}</Badge>
								<Badge variant="outline">{detailQuery.data.scope}</Badge>
								<Badge variant="outline">{detailQuery.data.trustLevel}</Badge>
								<Badge variant="outline">
									{detailQuery.data.chunkCount} chunks
								</Badge>
								<Badge variant="outline">
									{detailQuery.data.factCount} facts
								</Badge>
							</div>

							{detailQuery.data.sourceUri ? (
								<Alert>
									<AlertDescription className="flex items-center gap-2 text-sm">
										<LinkSimple size={14} />
										<span className="break-all">
											{detailQuery.data.sourceUri}
										</span>
									</AlertDescription>
								</Alert>
							) : null}

							<section className="space-y-3">
								<div className="flex items-center gap-2">
									<FileText size={16} />
									<h3 className="font-semibold text-sm">Facts</h3>
								</div>
								{detailQuery.data.facts.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										暂无 fact extraction 结果。
									</p>
								) : (
									<div className="flex flex-col gap-2">
										{detailQuery.data.facts.map((fact) => (
											<Card key={fact.id} size="sm">
												<CardContent className="text-sm">
													<div>
														{fact.subject} {fact.predicate} {fact.object}
													</div>
													<div className="mt-1 text-muted-foreground text-xs">
														confidence {(fact.confidence * 100).toFixed(0)}%
													</div>
												</CardContent>
											</Card>
										))}
									</div>
								)}
							</section>

							<section className="space-y-3">
								<div className="flex items-center gap-2">
									<BookOpen size={16} />
									<h3 className="font-semibold text-sm">Chunks</h3>
								</div>
								<div className="flex flex-col gap-2">
									{detailQuery.data.chunks.map((chunk) => (
										<Card key={chunk.id} size="sm">
											<CardContent>
												<div className="mb-2 flex flex-wrap gap-2 text-muted-foreground text-xs">
													<Badge variant="outline">#{chunk.chunkIndex}</Badge>
													<Badge variant="outline">
														{chunk.tokenCount} tokens
													</Badge>
													{chunk.keywords.map((keyword) => (
														<Badge key={keyword} variant="outline">
															{keyword}
														</Badge>
													))}
												</div>
												<p className="whitespace-pre-wrap text-foreground text-sm">
													{chunk.content}
												</p>
											</CardContent>
										</Card>
									))}
								</div>
							</section>
						</div>
					) : (
						<Alert variant="destructive">
							<AlertDescription>
								{detailQuery.error instanceof Error
									? detailQuery.error.message
									: "加载详情失败。"}
							</AlertDescription>
						</Alert>
					)}
				</DialogContent>
			</Dialog>

			<AlertDialog
				onOpenChange={(open) => !open && setDeleteId(null)}
				open={deleteId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>删除知识文档</AlertDialogTitle>
						<AlertDialogDescription>
							删除后会一并移除对应 chunk、fact、vector 索引和 FTS 索引。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteMutation.isPending}>
							取消
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={handleDelete}
							variant="destructive"
						>
							{deleteMutation.isPending ? "删除中…" : "删除"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
