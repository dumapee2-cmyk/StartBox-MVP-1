export interface KeywordOptions {
  max?: number;
  minLength?: number;
}

const DOMAIN_STOPWORDS = new Set([
  "a", "an", "and", "app", "application", "apps", "are", "as", "at", "be", "build", "built", "by",
  "can", "create", "created", "do", "for", "from", "get", "give", "has", "have", "help", "i", "in",
  "into", "is", "it", "its", "just", "like", "make", "me", "need", "of", "on", "or", "our", "please",
  "really", "service", "should", "similar", "something", "system", "that", "the", "their", "them", "then",
  "there", "these", "this", "to", "tool", "us", "use", "using", "want", "we", "with", "would", "you",
  "your", "feature", "features", "platform", "product", "workflow", "dashboard", "ai", "new", "best",
]);

function sanitizeTerm(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDomainKeywords(terms: string[], opts: KeywordOptions = {}): string[] {
  const max = opts.max ?? 15;
  const minLength = opts.minLength ?? 3;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of terms) {
    const normalized = sanitizeTerm(raw);
    if (!normalized) continue;

    const compact = normalized.split(/\s+/).slice(0, 3).join(" ");
    if (!compact || compact.length < minLength || compact.length > 40) continue;

    if (!compact.includes(" ") && DOMAIN_STOPWORDS.has(compact)) continue;
    if (DOMAIN_STOPWORDS.has(compact)) continue;
    if (seen.has(compact)) continue;

    seen.add(compact);
    out.push(compact);
    if (out.length >= max) break;
  }

  return out;
}

export function extractDomainKeywordsFromPrompt(prompt: string, opts: KeywordOptions = {}): string[] {
  const max = opts.max ?? 15;
  const minLength = opts.minLength ?? 3;

  const cleaned = sanitizeTerm(prompt);
  if (!cleaned) return [];

  const words = cleaned.split(/\s+/).filter((w) => w.length >= minLength && !DOMAIN_STOPWORDS.has(w));
  const candidates: string[] = [];

  // Preserve user order for topical relevance.
  for (let i = 0; i < words.length; i += 1) {
    candidates.push(words[i]);
    if (i + 1 < words.length) {
      candidates.push(`${words[i]} ${words[i + 1]}`);
    }
  }

  return normalizeDomainKeywords(candidates, { max, minLength });
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keywordAppearsInText(text: string, keyword: string): boolean {
  const textLower = text.toLowerCase();
  const term = sanitizeTerm(keyword);
  if (!term) return false;

  const pattern = term
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join("\\s+");

  const regex = new RegExp(`\\b${pattern}\\b`, "i");
  return regex.test(textLower);
}
