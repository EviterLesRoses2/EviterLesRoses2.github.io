import { Publication, PublicationType, ResearchArea } from '@/types/publication';
import { getConfig } from './config';
import { getRuntimeI18nConfig } from './i18n/config';
import { parseBibTeXInline } from './bibtexInline';

interface RawBibTeXEntry {
  entryType: string;
  citationKey: string;
  entryTags: Record<string, string>;
}

// Map BibTeX entry types to our publication types
const typeMapping: Record<string, PublicationType> = {
  article: 'journal',
  inproceedings: 'conference',
  conference: 'conference',
  incollection: 'book-chapter',
  book: 'book',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'technical-report',
  unpublished: 'preprint',
  misc: 'preprint',
};

// Convert month names to numbers
const monthMapping: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function parseBibTeX(bibtexContent: string, locale?: string): Publication[] {
  const highlightNames = getHighlightNames(locale);
  const entries = parseRawBibTeX(bibtexContent);

  return entries.map((entry: { entryType: string; citationKey: string; entryTags: Record<string, string> }, index: number) => {
    const tags = entry.entryTags;

    // Parse authors
    const authors = parseAuthors(tags.author || '', highlightNames);

    // Parse year and month
    const year = parseInt(tags.year) || new Date().getFullYear();
    const monthStr = tags.month?.toLowerCase() || '';
    const month = monthMapping[monthStr] || (parseInt(monthStr) || undefined);

    // Determine type
    const type = typeMapping[entry.entryType.toLowerCase()] || 'journal';

    // Parse tags/keywords
    const keywords = tags.keywords?.split(',').map((k: string) => k.trim()) || [];

    // Parse selected field (convert string to boolean)
    const selected = tags.selected === 'true' || tags.selected === 'yes';

    // Parse preview field (remove braces if present)
    const preview = tags.preview?.replace(/[{}]/g, '');
    const title = parseBibTeXInline(tags.title || 'Untitled');

    // Create publication object
    const publication: Publication = {
      id: entry.citationKey || tags.id || `pub-${Date.now()}-${index}`,
      title: title.plainText || 'Untitled',
      titleNodes: title.nodes,
      authors,
      year,
      month: monthMapping[tags.month?.toLowerCase()] ? String(month) : tags.month,
      type,
      status: parsePublicationStatus(tags.status),
      statusLabel: cleanBibTeXString(tags.statuslabel),
      authorPosition: parseOptionalNumber(tags.authorposition),
      authorRole: cleanBibTeXString(tags.authorrole),
      tags: keywords,
      keywords,
      researchArea: detectResearchArea(tags.title, keywords),

      // Optional fields
      journal: cleanBibTeXString(tags.journal),
      conference: cleanBibTeXString(tags.booktitle),
      volume: tags.volume,
      issue: tags.number,
      pages: tags.pages,
      doi: tags.doi,
      url: tags.url,
      code: tags.code,
      abstract: cleanBibTeXString(tags.abstract),
      description: cleanBibTeXString(tags.description || tags.note),
      impactFactor: parseOptionalNumber(tags.impactfactor),
      quartile: parseQuartile(tags.quartile),
      selected,
      preview,

      // Store original BibTeX (excluding custom fields)
      bibtex: reconstructBibTeX(entry, [
        'selected', 'preview', 'description', 'keywords', 'code',
        'status', 'statuslabel', 'authorposition', 'authorrole', 'impactfactor', 'quartile'
      ]),
    };

    // Clean up undefined fields
    Object.keys(publication).forEach(key => {
      if (publication[key as keyof Publication] === undefined) {
        delete publication[key as keyof Publication];
      }
    });

    return publication;
  }).sort((a: Publication, b: Publication) => {
    // Personal-site order: author position first, then journal impact factor.
    const authorPositionA = a.authorPosition ?? Number.POSITIVE_INFINITY;
    const authorPositionB = b.authorPosition ?? Number.POSITIVE_INFINITY;
    if (authorPositionA !== authorPositionB) return authorPositionA - authorPositionB;

    const impactFactorA = a.impactFactor ?? Number.NEGATIVE_INFINITY;
    const impactFactorB = b.impactFactor ?? Number.NEGATIVE_INFINITY;
    if (impactFactorA !== impactFactorB) return impactFactorB - impactFactorA;

    // Fall back to publication date for otherwise equal entries.
    if (b.year !== a.year) return b.year - a.year;

    // For month comparison, treat missing months as January (1) to ensure they appear last within the year
    const monthA = typeof a.month === 'string' ?
      (monthMapping[a.month.toLowerCase()] || parseInt(a.month) || 1) :
      (a.month || 1);
    const monthB = typeof b.month === 'string' ?
      (monthMapping[b.month.toLowerCase()] || parseInt(b.month) || 1) :
      (b.month || 1);

    // Sort by month descending (December to January)
    return monthB - monthA;
  });
}

function parseRawBibTeX(input: string): RawBibTeXEntry[] {
  const entries: RawBibTeXEntry[] = [];
  const entryStart = /@([a-zA-Z]+)\s*([({])/g;
  let match: RegExpExecArray | null;

  while ((match = entryStart.exec(input)) !== null) {
    const open = match[2];
    const close = open === '{' ? '}' : ')';
    const bodyStart = entryStart.lastIndex;
    let depth = 1;
    let cursor = bodyStart;

    for (; cursor < input.length && depth > 0; cursor += 1) {
      const char = input[cursor];
      if (char === '\\') {
        cursor += 1;
        continue;
      }
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
    }

    if (depth !== 0) break;

    const body = input.slice(bodyStart, cursor - 1).trim();
    const firstComma = findTopLevelComma(body);
    if (firstComma === -1) continue;

    entries.push({
      entryType: match[1],
      citationKey: body.slice(0, firstComma).trim(),
      entryTags: parseBibTeXFields(body.slice(firstComma + 1)),
    });

    entryStart.lastIndex = cursor;
  }

  return entries;
}

function findTopLevelComma(value: string): number {
  let braceDepth = 0;
  let inQuote = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '"') inQuote = !inQuote;
    if (!inQuote && char === '{') braceDepth += 1;
    if (!inQuote && char === '}') braceDepth -= 1;
    if (!inQuote && braceDepth === 0 && char === ',') return index;
  }

  return -1;
}

function parseBibTeXFields(value: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let cursor = 0;

  while (cursor < value.length) {
    while (cursor < value.length && /[\s,]/.test(value[cursor])) cursor += 1;
    const keyStart = cursor;
    while (cursor < value.length && /[a-zA-Z0-9_-]/.test(value[cursor])) cursor += 1;
    const key = value.slice(keyStart, cursor).trim().toLowerCase();
    if (!key) break;

    while (cursor < value.length && /\s/.test(value[cursor])) cursor += 1;
    if (value[cursor] !== '=') break;
    cursor += 1;
    while (cursor < value.length && /\s/.test(value[cursor])) cursor += 1;

    let fieldValue = '';
    if (value[cursor] === '{') {
      cursor += 1;
      const start = cursor;
      let depth = 1;
      while (cursor < value.length && depth > 0) {
        if (value[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (value[cursor] === '{') depth += 1;
        if (value[cursor] === '}') depth -= 1;
        cursor += 1;
      }
      fieldValue = value.slice(start, cursor - 1);
    } else if (value[cursor] === '"') {
      cursor += 1;
      const start = cursor;
      while (cursor < value.length && value[cursor] !== '"') {
        cursor += value[cursor] === '\\' ? 2 : 1;
      }
      fieldValue = value.slice(start, cursor);
      cursor += 1;
    } else {
      const start = cursor;
      while (cursor < value.length && value[cursor] !== ',') cursor += 1;
      fieldValue = value.slice(start, cursor);
    }

    fields[key] = fieldValue.trim();
  }

  return fields;
}

function parseOptionalNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePublicationStatus(value?: string): Publication['status'] {
  const supported: Publication['status'][] = [
    'published', 'accepted', 'under-review', 'submitted', 'in-preparation', 'draft'
  ];
  return supported.includes(value as Publication['status'])
    ? value as Publication['status']
    : 'published';
}

function parseQuartile(value?: string): Publication['quartile'] | undefined {
  const normalized = value?.trim().toUpperCase();
  return ['Q1', 'Q2', 'Q3', 'Q4'].includes(normalized || '')
    ? normalized as Publication['quartile']
    : undefined;
}

function getHighlightNames(locale?: string): string[] {
  const names = new Set<string>();
  const baseConfig = getConfig();
  const runtimeI18n = getRuntimeI18nConfig(baseConfig.i18n);

  const addName = (name?: string) => {
    const cleaned = cleanBibTeXString(name).trim();
    if (cleaned) {
      names.add(cleaned);
    }
  };

  addName(baseConfig.author.name);

  if (runtimeI18n.enabled) {
    runtimeI18n.locales.forEach((localeCode) => {
      const localizedConfig = getConfig(localeCode);
      addName(localizedConfig.author.name);
    });
  }

  if (locale) {
    const currentLocaleConfig = getConfig(locale);
    addName(currentLocaleConfig.author.name);
  }

  return Array.from(names);
}

function normalizePersonNameForMatch(name: string): string {
  return name.toLowerCase().replace(/[\s.,'’`"()\-_/]/g, '');
}

function buildNameVariants(name: string): Set<string> {
  const variants = new Set<string>();
  const cleaned = cleanBibTeXString(name).toLowerCase().trim();

  if (!cleaned) {
    return variants;
  }

  variants.add(cleaned);

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    variants.add(`${parts[1]} ${parts[0]}`);
  }

  return variants;
}

function parseAuthors(authorsStr: string, highlightNames: string[]): Array<{ name: string; isHighlighted?: boolean; isCorresponding?: boolean; isCoAuthor?: boolean }> {
  if (!authorsStr) return [];

  const highlightTextCandidates = new Set<string>();
  const highlightNormalizedCandidates = new Set<string>();

  highlightNames.forEach((name) => {
    const variants = buildNameVariants(name);
    variants.forEach((variant) => {
      highlightTextCandidates.add(variant);
      highlightNormalizedCandidates.add(normalizePersonNameForMatch(variant));
    });
  });

  const highlightTextList = Array.from(highlightTextCandidates);
  const highlightNormalizedList = Array.from(highlightNormalizedCandidates);

  // Split by "and" and clean up
  return authorsStr
    .split(/\sand\s/)
    .map(author => {
      // Clean up the author name
      let name = author.trim();

      // Check for corresponding author marker
      const isCorresponding = name.includes('*');

      // Check for co-author marker (#)
      const isCoAuthor = name.includes('#');

      // Remove special markers from name
      name = name.replace(/[*#]/g, '');

      // Handle "Last, First" format
      if (name.includes(',')) {
        const parts = name.split(',').map(p => p.trim());
        name = `${parts[1]} ${parts[0]}`;
      }

      name = cleanBibTeXString(name);

      // Check if this is the site owner (to highlight)
      const lowerName = name.toLowerCase();
      const normalizedName = normalizePersonNameForMatch(lowerName);
      const isHighlighted =
        highlightTextList.some((candidate) => lowerName.includes(candidate)) ||
        highlightNormalizedList.some((candidate) => normalizedName.includes(candidate));

      return {
        name,
        isHighlighted,
        isCorresponding,
        isCoAuthor,
      };
    })
    .filter(author => author.name);
}

function cleanBibTeXString(str?: string): string {
  if (!str) return '';

  return parseBibTeXInline(str).plainText;
}

function detectResearchArea(title: string, keywords: string[]): ResearchArea {
  const text = (title + ' ' + keywords.join(' ')).toLowerCase();

  if (text.includes('healthcare') || text.includes('medical') || text.includes('health')) {
    return 'ai-healthcare';
  }
  if (text.includes('signal') || text.includes('processing')) {
    return 'signal-processing';
  }
  if (text.includes('reliability') || text.includes('fault') || text.includes('diagnosis')) {
    return 'reliability-engineering';
  }
  if (text.includes('quantum')) {
    return 'quantum-computing';
  }
  if (text.includes('neural') || text.includes('spiking')) {
    return 'neural-networks';
  }
  if (text.includes('transformer') || text.includes('attention')) {
    return 'transformer-architectures';
  }

  return 'machine-learning';
}

function reconstructBibTeX(entry: { entryType: string; citationKey: string; entryTags: Record<string, string> }, excludeFields: string[] = []): string {
  const { entryType, citationKey, entryTags } = entry;

  let bibtex = `@${entryType}{${citationKey},\n`;

  Object.entries(entryTags).forEach(([key, value]) => {
    // Skip excluded fields
    if (!excludeFields.includes(key.toLowerCase())) {
      let cleanValue = value;

      // Clean author field by removing # and * symbols
      if (key.toLowerCase() === 'author') {
        cleanValue = value.replace(/[#*]/g, '');
      }

      bibtex += `  ${key} = {${cleanValue}},\n`;
    }
  });

  // Remove trailing comma and newline
  bibtex = bibtex.slice(0, -2) + '\n';
  bibtex += '}';

  return bibtex;
} 
