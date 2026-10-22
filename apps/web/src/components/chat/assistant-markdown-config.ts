import { createMathPlugin } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";
import type {
	LinkSafetyConfig,
	PluginConfig,
	StreamdownProps,
} from "streamdown";

type AssistantMarkdownRenderState = {
	isAnimating: boolean;
	mode: NonNullable<StreamdownProps["mode"]>;
};

const assistantMarkdownPlugins: PluginConfig = {
	math: createMathPlugin({
		singleDollarTextMath: true,
	}),
	mermaid: createMermaidPlugin({
		config: {
			securityLevel: "strict",
			startOnLoad: false,
			suppressErrorRendering: true,
			theme: "neutral",
		},
	}),
};

const assistantMarkdownControls: NonNullable<StreamdownProps["controls"]> = {
	code: {
		copy: true,
		download: false,
	},
	mermaid: {
		copy: true,
		download: true,
		fullscreen: true,
		panZoom: true,
	},
	table: {
		copy: true,
		download: false,
		fullscreen: true,
	},
};

const assistantMarkdownAnimated: NonNullable<StreamdownProps["animated"]> = {
	animation: "blurIn",
	duration: 220,
	easing: "ease-out",
	sep: "word",
};

const assistantMarkdownClassName = [
	"min-w-0",
	"text-foreground",
	"[&_p]:break-words",
].join(" ");

const assistantMarkdownTranslations: NonNullable<
	StreamdownProps["translations"]
> = {
	close: "关闭",
	copied: "已复制",
	copyCode: "复制代码",
	copyLink: "复制链接",
	copyTable: "复制表格",
	copyTableAsCsv: "复制为 CSV",
	copyTableAsMarkdown: "复制为 Markdown",
	copyTableAsTsv: "复制为 TSV",
	downloadDiagram: "下载图表",
	downloadDiagramAsMmd: "下载为 MMD",
	downloadDiagramAsPng: "下载为 PNG",
	downloadDiagramAsSvg: "下载为 SVG",
	downloadFile: "下载文件",
	downloadImage: "下载图片",
	downloadTable: "下载表格",
	downloadTableAsCsv: "下载为 CSV",
	downloadTableAsMarkdown: "下载为 Markdown",
	exitFullscreen: "退出全屏",
	externalLinkWarning: "你将离开当前应用并打开外部链接。",
	imageNotAvailable: "图片暂时不可用",
	mermaidFormatMmd: "MMD",
	mermaidFormatPng: "PNG",
	mermaidFormatSvg: "SVG",
	openExternalLink: "打开外部链接？",
	openLink: "继续打开",
	tableFormatCsv: "CSV",
	tableFormatMarkdown: "Markdown",
	tableFormatTsv: "TSV",
	viewFullscreen: "全屏查看",
};

const normalizeAssistantMarkdownContent = (content: string) => content.trim();

const isEmptyAssistantMarkdownContent = (content: string) =>
	normalizeAssistantMarkdownContent(content).length === 0;

const isActiveStreamingMessage = ({
	activeAssistantMessageId,
	isLoading,
	messageId,
}: {
	activeAssistantMessageId: string | null;
	isLoading: boolean;
	messageId: string;
}) => isLoading && messageId === activeAssistantMessageId;

const getAssistantMarkdownRenderState = ({
	activeAssistantMessageId,
	isLoading,
	messageId,
}: {
	activeAssistantMessageId: string | null;
	isLoading: boolean;
	messageId: string;
}): AssistantMarkdownRenderState => {
	const streaming = isActiveStreamingMessage({
		activeAssistantMessageId,
		isLoading,
		messageId,
	});

	return {
		isAnimating: streaming,
		mode: streaming ? "streaming" : "static",
	};
};

const parseAssistantLink = (url: string) => {
	try {
		const base =
			typeof window === "undefined"
				? "https://buni.invalid"
				: window.location.origin;

		return new URL(url, base);
	} catch {
		return null;
	}
};

const isTrustedAssistantLink = (url: string) => {
	const parsed = parseAssistantLink(url);

	if (!parsed) {
		return false;
	}

	if (parsed.protocol === "mailto:" || parsed.protocol === "tel:") {
		return true;
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return false;
	}

	if (
		typeof window !== "undefined" &&
		parsed.origin === window.location.origin
	) {
		return true;
	}

	return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
};

const assistantMarkdownLinkSafety: LinkSafetyConfig = {
	enabled: true,
	onLinkCheck: isTrustedAssistantLink,
};

export type { AssistantMarkdownRenderState };
export {
	assistantMarkdownAnimated,
	assistantMarkdownClassName,
	assistantMarkdownControls,
	assistantMarkdownLinkSafety,
	assistantMarkdownPlugins,
	assistantMarkdownTranslations,
	getAssistantMarkdownRenderState,
	isEmptyAssistantMarkdownContent,
	isTrustedAssistantLink,
	normalizeAssistantMarkdownContent,
};
