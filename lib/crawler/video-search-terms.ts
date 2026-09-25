import { domains } from '../feed.ts';

const catalog = domains.flatMap((domain) => domain.tags);
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();

// Popular topic families benefit from specific model and product searches.
const curated: Record<string, string[]> = {
  ai: ['AI', 'Claude', 'OpenAI', 'DeepSeek', 'Gemini', '人工智能'],
  'artificial intelligence': ['AI', 'Claude', 'OpenAI', 'DeepSeek', 'Gemini', '人工智能'],
  人工智能: ['AI', 'Claude', 'OpenAI', 'DeepSeek', 'Gemini', '人工智能'],
  'ai infrastructure': ['AI infrastructure', 'Claude', 'OpenAI', 'DeepSeek', 'Gemini'],
};

export function videoSearchTerms(tags: string[], localizedTags: string[] = []): string[] {
  const terms = tags.slice(0, 2).flatMap((value, index) => {
    const original = value.normalize('NFKC').trim().slice(0, 80);
    if (!original) return [];
    const localized = localizedTags[index]?.normalize('NFKC').trim().slice(0, 80);
    const known = catalog.find((tag) =>
      [tag.id, tag.label, tag.labelEn].some((label) => normalize(label) === normalize(original)),
    );
    // The catalog supplies the second language for every known tag. For custom
    // interests, use the saved translation and a useful phrase before brackets.
    const stem = original.split(/[（(]/, 1)[0].trim();
    return [
      ...(curated[normalize(original)] ?? []),
      original,
      known?.labelEn,
      known?.label,
      localized,
      stem !== original ? stem : undefined,
    ].filter((term): term is string => Boolean(term));
  });
  return [...new Map(terms.map((term) => [normalize(term), term])).values()].slice(0, 8);
}
