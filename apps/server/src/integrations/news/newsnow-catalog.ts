import type {
	NewsBrief,
	NewsBriefId,
	NewsSource,
	NewsSourceCategory,
	NewsSourceId,
	NewsSourceMatchKind,
	ResolvedNewsSourceCandidate,
	ResolveNewsSourceOutput,
} from "@neobuni/contracts";

const newsnowSources = [
	{
		provider: "newsnow",
		sourceId: "v2ex-share",
		name: "v2ex-share",
		label: "V2EX",
		subtitle: "最新分享",
		description: "V2EX 最新分享与社区讨论。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "coolapk",
		name: "coolapk",
		label: "酷安",
		subtitle: "今日最热",
		description: "酷安今日热门数码、应用与社区内容。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "36kr-quick",
		name: "36kr-quick",
		label: "36氪",
		subtitle: "快讯",
		description: "36氪科技、创业与商业快讯。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "36kr-renqi",
		name: "36kr-renqi",
		label: "36氪",
		subtitle: "人气榜",
		description: "36氪人气内容排行榜。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "ithome",
		name: "ithome",
		label: "IT之家",
		subtitle: null,
		description: "IT之家科技、数码与硬件热点。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "pcbeta-windows11",
		name: "pcbeta-windows11",
		label: "远景论坛",
		subtitle: "Win11",
		description: "远景论坛 Windows 11 相关讨论。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "solidot",
		name: "solidot",
		label: "Solidot",
		subtitle: null,
		description: "Solidot 科技与开源新闻。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "hackernews",
		name: "hackernews",
		label: "Hacker News",
		subtitle: null,
		description: "Y Combinator Hacker News 首页。",
		category: "technology",
		locale: "en-US",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "producthunt",
		name: "producthunt",
		label: "Product Hunt",
		subtitle: null,
		description: "Product Hunt 热门产品发布。",
		category: "technology",
		locale: "en-US",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "github-trending-today",
		name: "github-trending-today",
		label: "GitHub",
		subtitle: "Today",
		description: "GitHub 每日热门仓库。",
		category: "technology",
		locale: "en-US",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "sspai",
		name: "sspai",
		label: "少数派",
		subtitle: null,
		description: "少数派效率工具、数码和生活方式内容。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "juejin",
		name: "juejin",
		label: "稀土掘金",
		subtitle: null,
		description: "稀土掘金开发者社区热门内容。",
		category: "technology",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "baidu",
		name: "baidu",
		label: "百度热搜",
		subtitle: null,
		description: "百度实时热搜话题。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "nowcoder",
		name: "nowcoder",
		label: "牛客",
		subtitle: null,
		description: "牛客社区热门讨论。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "ifeng",
		name: "ifeng",
		label: "凤凰网",
		subtitle: "热点资讯",
		description: "凤凰网热点资讯。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "chongbuluo-latest",
		name: "chongbuluo-latest",
		label: "虫部落",
		subtitle: "最新",
		description: "虫部落最新发现与资讯。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "chongbuluo-hot",
		name: "chongbuluo-hot",
		label: "虫部落",
		subtitle: "最热",
		description: "虫部落热门发现与资讯。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "zhihu",
		name: "zhihu",
		label: "知乎",
		subtitle: null,
		description: "知乎热门话题。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "weibo",
		name: "weibo",
		label: "微博",
		subtitle: "实时热搜",
		description: "微博实时热搜话题。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "douyin",
		name: "douyin",
		label: "抖音",
		subtitle: null,
		description: "抖音热门内容。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "hupu",
		name: "hupu",
		label: "虎扑",
		subtitle: "主干道热帖",
		description: "虎扑主干道热门帖子。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "tieba",
		name: "tieba",
		label: "百度贴吧",
		subtitle: "热议",
		description: "百度贴吧热门讨论。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "toutiao",
		name: "toutiao",
		label: "今日头条",
		subtitle: null,
		description: "今日头条热点资讯。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "thepaper",
		name: "thepaper",
		label: "澎湃新闻",
		subtitle: "热榜",
		description: "澎湃新闻热门资讯。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "bilibili-hot-search",
		name: "bilibili-hot-search",
		label: "哔哩哔哩",
		subtitle: "热搜",
		description: "哔哩哔哩热搜和站内热门话题。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "freebuf",
		name: "freebuf",
		label: "Freebuf",
		subtitle: "网络安全",
		description: "Freebuf 网络安全资讯。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "qqvideo-tv-hotsearch",
		name: "qqvideo-tv-hotsearch",
		label: "腾讯视频",
		subtitle: "热搜榜",
		description: "腾讯视频热搜榜。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "douban",
		name: "douban",
		label: "豆瓣",
		subtitle: "热门电影",
		description: "豆瓣热门电影。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "tencent-hot",
		name: "tencent-hot",
		label: "腾讯新闻",
		subtitle: "综合早报",
		description: "腾讯新闻综合早报。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "iqiyi-hot-ranklist",
		name: "iqiyi-hot-ranklist",
		label: "爱奇艺",
		subtitle: "热播榜",
		description: "爱奇艺热播榜。",
		category: "domestic",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "zaobao",
		name: "zaobao",
		label: "联合早报",
		subtitle: null,
		description: "联合早报国际与区域资讯。",
		category: "international",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "sputniknewscn",
		name: "sputniknewscn",
		label: "卫星通讯社",
		subtitle: null,
		description: "卫星通讯社中文资讯。",
		category: "international",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "cankaoxiaoxi",
		name: "cankaoxiaoxi",
		label: "参考消息",
		subtitle: null,
		description: "参考消息国际资讯。",
		category: "international",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "kaopu",
		name: "kaopu",
		label: "靠谱新闻",
		subtitle: null,
		description: "靠谱新闻国际热点。",
		category: "international",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "steam",
		name: "steam",
		label: "Steam",
		subtitle: "在线人数",
		description: "Steam 平台实时在线人数。",
		category: "international",
		locale: "en-US",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "cls-depth",
		name: "cls-depth",
		label: "财联社",
		subtitle: "深度",
		description: "财联社深度财经报道。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "cls-hot",
		name: "cls-hot",
		label: "财联社",
		subtitle: "热门",
		description: "财联社热门财经资讯。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "cls-telegraph",
		name: "cls-telegraph",
		label: "财联社",
		subtitle: "电报",
		description: "财联社电报快讯。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "mktnews-flash",
		name: "mktnews-flash",
		label: "MKTNews",
		subtitle: "快讯",
		description: "MKTNews 财经市场快讯。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "wallstreetcn-quick",
		name: "wallstreetcn-quick",
		label: "华尔街见闻",
		subtitle: "快讯",
		description: "华尔街见闻财经快讯。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "wallstreetcn-news",
		name: "wallstreetcn-news",
		label: "华尔街见闻",
		subtitle: "最新",
		description: "华尔街见闻最新财经新闻。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "wallstreetcn-hot",
		name: "wallstreetcn-hot",
		label: "华尔街见闻",
		subtitle: "最热",
		description: "华尔街见闻热门财经新闻。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "xueqiu-hotstock",
		name: "xueqiu-hotstock",
		label: "雪球",
		subtitle: "热门股票",
		description: "雪球热门股票。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "gelonghui",
		name: "gelonghui",
		label: "格隆汇",
		subtitle: "事件",
		description: "格隆汇财经市场事件。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "fastbull-express",
		name: "fastbull-express",
		label: "法布财经",
		subtitle: "快讯",
		description: "法布财经市场快讯。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "fastbull-news",
		name: "fastbull-news",
		label: "法布财经",
		subtitle: "头条",
		description: "法布财经市场头条。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
	{
		provider: "newsnow",
		sourceId: "jin10",
		name: "jin10",
		label: "金十数据",
		subtitle: null,
		description: "金十数据财经与市场资讯。",
		category: "finance",
		locale: "zh-CN",
		enabled: true,
	},
] satisfies NewsSource[];

const newsSourceAliases = {
	"v2ex-share": ["v2ex", "v2ex share", "v2ex 最新分享"],
	coolapk: ["酷安", "coolapk 今日最热"],
	"36kr-quick": ["36氪 快讯", "36kr quick", "36kr 快讯"],
	"36kr-renqi": ["36氪 人气榜", "36kr renqi", "36kr 人气"],
	ithome: ["it home", "it之家"],
	"pcbeta-windows11": ["远景论坛", "远景 win11", "pcbeta"],
	solidot: [],
	hackernews: ["hacker news", "hn"],
	producthunt: ["product hunt"],
	"github-trending-today": [
		"github trending",
		"github trending today",
		"github 热门",
	],
	sspai: ["少数派"],
	juejin: ["掘金", "稀土掘金"],
	baidu: ["百度", "百度热搜"],
	nowcoder: ["牛客", "牛客网"],
	ifeng: ["凤凰网", "凤凰"],
	"chongbuluo-latest": ["虫部落 最新", "虫部落最新"],
	"chongbuluo-hot": ["虫部落 最热", "虫部落最热"],
	zhihu: ["知乎"],
	weibo: ["微博", "weibo hot", "weibo hot search"],
	douyin: ["抖音"],
	hupu: ["虎扑", "虎扑主干道"],
	tieba: ["贴吧", "百度贴吧"],
	toutiao: ["头条", "今日头条"],
	thepaper: ["the paper", "澎湃", "澎湃新闻"],
	"bilibili-hot-search": [
		"bilibili",
		"bilibili hot",
		"bilibili hot search",
		"哔哩哔哩",
		"b站",
		"b站热搜",
	],
	freebuf: ["freebuf", "freebuf 网络安全"],
	"qqvideo-tv-hotsearch": ["腾讯视频", "腾讯视频 热搜"],
	douban: ["豆瓣", "豆瓣电影"],
	"tencent-hot": ["腾讯新闻", "腾讯热榜"],
	"iqiyi-hot-ranklist": ["爱奇艺", "爱奇艺 热播"],
	zaobao: ["联合早报", "zaobao"],
	sputniknewscn: ["卫星通讯社", "sputnik"],
	cankaoxiaoxi: ["参考消息"],
	kaopu: ["靠谱新闻"],
	steam: ["steam", "steam 在线人数"],
	"cls-depth": ["财联社 深度", "财联社深度"],
	"cls-hot": ["财联社 热门", "财联社热门"],
	"cls-telegraph": ["财联社 电报", "财联社电报"],
	"mktnews-flash": ["mktnews", "mktnews 快讯"],
	"wallstreetcn-quick": [
		"华尔街见闻 快讯",
		"华尔街见闻快讯",
		"wallstreetcn quick",
	],
	"wallstreetcn-news": [
		"华尔街见闻 最新",
		"华尔街见闻最新",
		"wallstreetcn news",
	],
	"wallstreetcn-hot": [
		"wallstreetcn hot",
		"wall street cn hot",
		"华尔街见闻 最热",
		"华尔街见闻最热",
	],
	"xueqiu-hotstock": ["雪球", "雪球 热门股票"],
	gelonghui: ["格隆汇"],
	"fastbull-express": ["法布财经 快讯", "法布财经快讯", "fastbull express"],
	"fastbull-news": ["法布财经 头条", "法布财经头条", "fastbull news"],
	jin10: ["金十", "金十数据"],
} satisfies Record<NewsSourceId, readonly string[]>;

const newsnowBriefs = [
	{
		briefId: "ai",
		label: "AI Brief",
		description:
			"AI-adjacent product, developer, and startup signals aggregated from curated tech feeds.",
		sourceIds: ["hackernews", "github-trending-today", "producthunt", "juejin"],
	},
	{
		briefId: "tech",
		label: "Tech Brief",
		description:
			"A broader technology mix spanning global developer feeds and Chinese startup coverage.",
		sourceIds: [
			"hackernews",
			"github-trending-today",
			"producthunt",
			"36kr-quick",
			"ithome",
			"juejin",
			"sspai",
		],
	},
	{
		briefId: "china",
		label: "China Brief",
		description:
			"Chinese community and internet trends, including discussion boards and hot-topic feeds.",
		sourceIds: [
			"v2ex-share",
			"zhihu",
			"weibo",
			"bilibili-hot-search",
			"sspai",
			"thepaper",
		],
	},
] satisfies NewsBrief[];

type SearchNewsSourcesInput = {
	query?: string;
	category?: NewsSourceCategory;
	enabledOnly?: boolean;
	limit?: number;
};

type NewsSourceLookupEntry = {
	matchKind: NewsSourceMatchKind;
	matchedText: string;
	normalizedText: string;
};

type ScoredNewsSourceCandidate = ResolvedNewsSourceCandidate & {
	score: number;
};

const matchPriority: Record<NewsSourceMatchKind, number> = {
	source_id: 60,
	name: 50,
	label: 45,
	alias: 40,
	description: 10,
};

const normalizeLookupText = (value: string) =>
	value
		.trim()
		.toLowerCase()
		.replace(/[\s._/-]+/g, "");

const takeLimit = <T>(items: T[], limit?: number) =>
	limit === undefined ? items : items.slice(0, limit);

const getNewsSourceDisplayName = (source: NewsSource) =>
	source.subtitle ? `${source.label} ${source.subtitle}` : source.label;

const filterNewsSources = (
	input?: Omit<SearchNewsSourcesInput, "query" | "limit">
) =>
	newsnowSources.filter((source) => {
		if (input?.enabledOnly !== false && source.enabled !== true) {
			return false;
		}

		if (input?.category && source.category !== input.category) {
			return false;
		}

		return true;
	});

const buildLookupEntries = (source: NewsSource): NewsSourceLookupEntry[] => [
	{
		matchKind: "source_id",
		matchedText: source.sourceId,
		normalizedText: normalizeLookupText(source.sourceId),
	},
	{
		matchKind: "name",
		matchedText: source.name,
		normalizedText: normalizeLookupText(source.name),
	},
	{
		matchKind: "label",
		matchedText: source.label,
		normalizedText: normalizeLookupText(source.label),
	},
	...(source.description
		? [
				{
					matchKind: "description" as const,
					matchedText: source.description,
					normalizedText: normalizeLookupText(source.description),
				},
			]
		: []),
	...newsSourceAliases[source.sourceId].map((alias) => ({
		matchKind: "alias" as const,
		matchedText: alias,
		normalizedText: normalizeLookupText(alias),
	})),
];

const scoreLookupEntry = (input: {
	query: string;
	entry: NewsSourceLookupEntry;
}) => {
	if (!input.query) {
		return null;
	}

	if (input.entry.normalizedText === input.query) {
		return {
			exact: true,
			score: matchPriority[input.entry.matchKind] + 100,
		};
	}

	if (!input.entry.normalizedText.includes(input.query)) {
		return null;
	}

	return {
		exact: false,
		score: matchPriority[input.entry.matchKind],
	};
};

const compareCandidates = (
	left: ScoredNewsSourceCandidate,
	right: ScoredNewsSourceCandidate
) =>
	right.score - left.score ||
	Number(right.exact) - Number(left.exact) ||
	left.source.label.localeCompare(right.source.label) ||
	left.source.sourceId.localeCompare(right.source.sourceId);

const removeCandidateScore = (candidate: ScoredNewsSourceCandidate) => ({
	source: candidate.source,
	matchKind: candidate.matchKind,
	matchedText: candidate.matchedText,
	exact: candidate.exact,
});

const collectNewsSourceMatches = (
	input: Omit<SearchNewsSourcesInput, "limit">
) => {
	const normalizedQuery = normalizeLookupText(input.query ?? "");

	if (!normalizedQuery) {
		return [];
	}

	return filterNewsSources(input)
		.flatMap((source) => {
			const bestMatch = buildLookupEntries(
				source
			).reduce<ScoredNewsSourceCandidate | null>((currentBest, entry) => {
				const score = scoreLookupEntry({
					query: normalizedQuery,
					entry,
				});

				if (!score) {
					return currentBest;
				}

				const candidate = {
					source,
					matchKind: entry.matchKind,
					matchedText: entry.matchedText,
					exact: score.exact,
					score: score.score,
				};

				if (!currentBest || compareCandidates(candidate, currentBest) < 0) {
					return candidate;
				}

				return currentBest;
			}, null);

			return bestMatch ? [bestMatch] : [];
		})
		.sort(compareCandidates)
		.map(removeCandidateScore);
};

const getNewsSourceById = (sourceId: NewsSourceId) =>
	newsnowSources.find((source) => source.sourceId === sourceId) ?? null;

const getNewsBriefById = (briefId: NewsBriefId) =>
	newsnowBriefs.find((brief) => brief.briefId === briefId) ?? null;

const listAllNewsSources = () =>
	newsnowSources.filter((source) => source.enabled === true);

const searchNewsSources = (input?: SearchNewsSourcesInput) => {
	if (!input?.query) {
		return takeLimit(filterNewsSources(input), input?.limit);
	}

	return takeLimit(
		collectNewsSourceMatches(input).map((candidate) => candidate.source),
		input.limit
	);
};

const resolveNewsSourceQuery = (input: {
	query: string;
	limit?: number;
}): ResolveNewsSourceOutput => {
	const query = input.query.trim();
	const allItems = collectNewsSourceMatches({
		query,
	});
	const items = takeLimit(allItems, input.limit);
	const exactMatchCount = allItems.filter((item) => item.exact).length;
	const topCandidate = allItems[0] ?? null;
	const status =
		allItems.length === 0
			? "not_found"
			: exactMatchCount === 1 || allItems.length === 1
				? "resolved"
				: "ambiguous";

	return {
		query,
		status,
		resolvedSourceId:
			status === "resolved" ? (topCandidate?.source.sourceId ?? null) : null,
		resolution: status === "resolved" ? topCandidate : null,
		count: allItems.length,
		items,
	};
};

const listNewsBriefs = () => newsnowBriefs;

export {
	getNewsBriefById,
	getNewsSourceById,
	getNewsSourceDisplayName,
	listAllNewsSources,
	listNewsBriefs,
	newsnowBriefs,
	newsnowSources,
	resolveNewsSourceQuery,
	searchNewsSources,
};
