import { z } from "zod"

const newsProviderSchema = z.literal("newsnow")

const newsSourceIdValues = [
  "v2ex-share",
  "coolapk",
  "36kr-quick",
  "36kr-renqi",
  "ithome",
  "pcbeta-windows11",
  "solidot",
  "hackernews",
  "producthunt",
  "github-trending-today",
  "sspai",
  "juejin",
  "baidu",
  "nowcoder",
  "ifeng",
  "chongbuluo-latest",
  "chongbuluo-hot",
  "zhihu",
  "weibo",
  "douyin",
  "hupu",
  "tieba",
  "toutiao",
  "thepaper",
  "bilibili-hot-search",
  "freebuf",
  "qqvideo-tv-hotsearch",
  "douban",
  "tencent-hot",
  "iqiyi-hot-ranklist",
  "zaobao",
  "sputniknewscn",
  "cankaoxiaoxi",
  "kaopu",
  "steam",
  "cls-depth",
  "cls-hot",
  "cls-telegraph",
  "mktnews-flash",
  "wallstreetcn-quick",
  "wallstreetcn-news",
  "wallstreetcn-hot",
  "xueqiu-hotstock",
  "gelonghui",
  "fastbull-express",
  "fastbull-news",
  "jin10",
] as const

const newsSourceIdSchema = z.enum(newsSourceIdValues)

const newsSourceCategorySchema = z.enum([
  "technology",
  "domestic",
  "international",
  "finance",
])

const newsBriefIdSchema = z.enum(["ai", "tech", "china"])

const newsSourceSchema = z.object({
  provider: newsProviderSchema,
  sourceId: newsSourceIdSchema,
  name: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().min(1).max(120).nullable(),
  description: z.string().trim().min(1).max(400).nullable(),
  category: newsSourceCategorySchema,
  locale: z.string().trim().min(1).max(40),
  enabled: z.boolean(),
})

const newsHeadlineSchema = z.object({
  rank: z.number().int().positive(),
  sourceId: newsSourceIdSchema,
  sourceName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(500),
  url: z.string().trim().min(1).max(2_000),
  mobileUrl: z.string().trim().min(1).max(2_000).nullable(),
  publishedAt: z.string().datetime().nullable(),
})

const newsBriefSchema = z.object({
  briefId: newsBriefIdSchema,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(400),
  sourceIds: z.array(newsSourceIdSchema).min(1).max(12),
})

const newsSourceFetchStatusSchema = z.enum(["ok", "error"])

const newsSourceFetchResultSchema = z.object({
  sourceId: newsSourceIdSchema,
  sourceName: z.string().trim().min(1).max(120),
  status: newsSourceFetchStatusSchema,
  updatedTime: z.string().datetime().nullable(),
  itemCount: z.number().int().nonnegative(),
  error: z.string().trim().min(1).max(500).nullable(),
})

export {
  newsBriefIdSchema,
  newsBriefSchema,
  newsHeadlineSchema,
  newsProviderSchema,
  newsSourceCategorySchema,
  newsSourceIdSchema,
  newsSourceIdValues,
  newsSourceFetchResultSchema,
  newsSourceFetchStatusSchema,
  newsSourceSchema,
}

export type NewsBrief = z.infer<typeof newsBriefSchema>
export type NewsBriefId = z.infer<typeof newsBriefIdSchema>
export type NewsHeadline = z.infer<typeof newsHeadlineSchema>
export type NewsProvider = z.infer<typeof newsProviderSchema>
export type NewsSource = z.infer<typeof newsSourceSchema>
export type NewsSourceCategory = z.infer<typeof newsSourceCategorySchema>
export type NewsSourceId = z.infer<typeof newsSourceIdSchema>
export type NewsSourceFetchResult = z.infer<typeof newsSourceFetchResultSchema>
