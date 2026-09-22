import { createHash } from 'node:crypto';

export const CRAWLER_USER_AGENT = 'Feed-Gardener/0.2 (+local public-source reader)';

export const toArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

export function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function stableId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 20);
}

export function normalizeGithubUrl(value: string): string {
  try {
    const url = new URL(value, 'https://github.com');
    const [owner, repo] = url.pathname.split('/').filter(Boolean);
    if (owner && repo) return `https://github.com/${owner}/${repo.replace(/\.git$/, '')}`;
  } catch {
    // The caller will retain the original string when it cannot be normalized.
  }
  return value.trim();
}

export function githubRepoPath(value: string): string {
  const normalized = normalizeGithubUrl(value);
  try {
    const [owner, repo] = new URL(normalized).pathname.split('/').filter(Boolean);
    return owner && repo ? `${owner}/${repo}` : '';
  } catch {
    const match = value.match(/([A-Za-z0-9_.-]+)\s*\/\s*([A-Za-z0-9_.-]+)/);
    return match ? `${match[1]}/${match[2]}` : '';
  }
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      headers: {
        'User-Agent': CRAWLER_USER_AGENT,
        Accept: 'application/json, application/atom+xml, application/rss+xml, text/xml, */*',
        ...init.headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeout);
  }
}

const DOMAIN_KEYWORDS: Record<string, Record<string, number>> = {
  'AI Agent': {
    agent: 3,
    agents: 3,
    agentic: 4,
    'autonomous agent': 5,
    'multi-agent': 5,
    'computer use': 4,
    'tool calling': 4,
  },
  大语言模型: {
    llm: 4,
    'large language model': 5,
    'language model': 3,
    transformer: 2,
    inference: 2,
    'fine-tuning': 3,
    finetuning: 3,
    prompt: 2,
    'reasoning model': 4,
  },
  'RAG 与搜索': {
    rag: 5,
    'retrieval augmented': 5,
    'retrieval-augmented': 5,
    'semantic search': 4,
    'search engine': 3,
    reranker: 4,
    'embedding search': 4,
  },
  数据与向量库: {
    'vector database': 5,
    'vector index': 5,
    'vector store': 5,
    database: 2,
    'data pipeline': 3,
    etl: 3,
    analytics: 2,
    quantization: 3,
    faiss: 4,
  },
  开发者工具: {
    'developer tool': 4,
    devtool: 4,
    'code generation': 4,
    'coding assistant': 5,
    'code editor': 3,
    ide: 3,
    sdk: 2,
    cli: 3,
    debugger: 3,
    compiler: 3,
    api: 1,
  },
  计算机视觉: {
    'computer vision': 5,
    'vision-language': 5,
    'image generation': 4,
    'object detection': 4,
    segmentation: 3,
    diffusion: 3,
    'video generation': 4,
    ocr: 3,
  },
  安全与隐私: {
    cybersecurity: 5,
    security: 3,
    vulnerability: 4,
    exploit: 4,
    malware: 4,
    privacy: 3,
    authentication: 2,
    pentest: 5,
  },
  机器人与具身智能: {
    robotics: 5,
    robot: 4,
    embodied: 5,
    'autonomous driving': 5,
    slam: 4,
    manipulation: 3,
  },
  云原生与基础设施: {
    kubernetes: 5,
    container: 3,
    'cloud native': 5,
    observability: 4,
    'distributed system': 4,
    infrastructure: 3,
    deployment: 2,
    serverless: 4,
    devops: 4,
  },
  'Web 与应用': {
    'web app': 3,
    frontend: 3,
    browser: 3,
    'mobile app': 3,
    'desktop app': 3,
    react: 2,
    vue: 2,
    svelte: 2,
  },
  评测与研究: {
    benchmark: 4,
    evaluation: 3,
    dataset: 3,
    survey: 3,
    research: 2,
    paper: 1,
    leaderboard: 4,
  },
};

function keywordMatches(text: string, keyword: string): boolean {
  return new RegExp(
    `(?<![a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`,
  ).test(text);
}

export function classifyDomain(title: string, description: string): [string, string[]] {
  const titleText = cleanText(title).toLowerCase();
  const descriptionText = cleanText(description).toLowerCase();
  const ranked: Array<{ score: number; order: number; domain: string; matches: string[] }> = [];

  Object.entries(DOMAIN_KEYWORDS).forEach(([domain, keywords], order) => {
    let score = 0;
    const matches: string[] = [];
    Object.entries(keywords).forEach(([keyword, weight]) => {
      const titleMatch = keywordMatches(titleText, keyword);
      const descriptionMatch = keywordMatches(descriptionText, keyword);
      if (titleMatch || descriptionMatch) {
        score += weight * (titleMatch ? 3 : 1);
        matches.push(keyword);
      }
    });
    if (score) ranked.push({ score, order, domain, matches });
  });

  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  return ranked[0] ? [ranked[0].domain, ranked[0].matches.slice(0, 4)] : ['其他', []];
}

export function keywordTags(text: string): string[] {
  const lower = text.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ['Agent', ['agent', 'agentic']],
    ['LLM', ['llm', 'large language model']],
    ['RAG', ['rag', 'retrieval']],
    ['Coding', ['coding', 'code generation', 'repository', 'developer']],
    ['Multimodal', ['multimodal', 'vision-language', 'audio-visual', 'video']],
    ['Benchmark', ['benchmark', 'evaluation', 'dataset']],
    ['Security', ['cyber', 'security', 'exploit']],
    ['MCP', ['mcp', 'model context protocol']],
  ];
  return rules.filter(([, keys]) => keys.some((key) => lower.includes(key))).map(([tag]) => tag);
}
