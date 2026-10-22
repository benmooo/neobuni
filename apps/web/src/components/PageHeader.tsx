import { Button } from "@neobuni/ui/components/button";
import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";

interface Props {
  actions?: React.ReactNode;
  title: string;
}

function PageHeader({ title, actions }: Props) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3">
      <Button
        className="rounded-xl text-muted-foreground"
        onClick={() => router.history.back()}
        size="icon"
        variant="ghost"
      >
        <ArrowLeft size={20} weight="regular" />
      </Button>
      <h1 className="flex-1 font-semibold text-base">{title}</h1>
      {actions}
    </header>
  );
}

export { PageHeader };
