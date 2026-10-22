import { Button } from "@neobuni/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@neobuni/ui/components/dialog";
import { Input } from "@neobuni/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

import { FormFieldBlock } from "@/components/form/FormFieldBlock";
import { readValidationMessage } from "@/lib/form-errors";

import { useRenameConversation } from "../../hooks/use-conversation-list";

type Props = {
	open: boolean;
	onClose: () => void;
	conversationId: string;
	currentTitle: string;
};

const renameConversationSchema = z.object({
	title: z.string().trim().min(1, "请输入新名称。").max(120),
});

function RenameDialog({ open, onClose, conversationId, currentTitle }: Props) {
	const rename = useRenameConversation();

	const form = useForm({
		defaultValues: {
			title: currentTitle,
		},
		validators: {
			onBlur: renameConversationSchema,
			onSubmit: renameConversationSchema,
		},
		onSubmit: async ({ value }) => {
			const trimmed = value.title.trim();

			if (trimmed === currentTitle) {
				onClose();
				return;
			}

			await rename.mutateAsync({ id: conversationId, title: trimmed });
			onClose();
		},
	});

	return (
		<Dialog onOpenChange={(value) => !value && onClose()} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>重命名对话</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<form.Field name="title">
						{(field) => (
							<FormFieldBlock
								error={
									field.state.meta.isTouched
										? readValidationMessage(field.state.meta.errors)
										: null
								}
								label="名称"
							>
								<Input
									autoFocus
									maxLength={120}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="输入新名称"
									value={field.state.value}
								/>
							</FormFieldBlock>
						)}
					</form.Field>

					<DialogFooter className="mt-4">
						<form.Subscribe
							selector={(state) => [state.canSubmit, state.isSubmitting]}
						>
							{([canSubmit, isSubmitting]) => (
								<Button
									disabled={!canSubmit || rename.isPending}
									size="sm"
									type="submit"
								>
									{isSubmitting ? "保存中…" : "保存"}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export { RenameDialog };
