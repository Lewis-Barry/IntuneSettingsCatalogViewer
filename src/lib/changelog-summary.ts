export interface ParsedSummaryHighlight {
  body: string;
  platforms: string[];
}

const PLATFORM_ONLY_PREFIX = /^(?:windows|macos|ios|android(?: enterprise)?|linux)(?:\s*(?:\/|,|and)\s*(?:windows|macos|ios|android(?: enterprise)?|linux))*$/i;
const LEADING_PLATFORM = /^(?:windows|macos|ios|android(?: enterprise)?|linux)\b[,\s]*/i;

export function parseSummaryHighlight(highlight: string): ParsedSummaryHighlight {
  const separator = highlight.indexOf(':');
  if (separator < 0) return { body: highlight, platforms: [] };

  const prefix = highlight.slice(0, separator);
  const platforms: string[] = [];
  if (/\bwindows\b/i.test(prefix)) platforms.push('windows10');
  if (/\bios\b/i.test(prefix)) platforms.push('iOS');
  if (/\bmacos\b/i.test(prefix)) platforms.push('macOS');
  if (/\bandroid\b/i.test(prefix)) platforms.push('android');
  if (/\blinux\b/i.test(prefix)) platforms.push('linux');
  if (platforms.length === 0) return { body: highlight, platforms };

  const remainingPrefix = PLATFORM_ONLY_PREFIX.test(prefix)
    ? ''
    : prefix.replace(LEADING_PLATFORM, '').trim();
  const body = highlight.slice(separator + 1).trim();

  return {
    body: `${remainingPrefix ? `${remainingPrefix}: ` : ''}${body}`,
    platforms,
  };
}
