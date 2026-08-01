const IGNORED_SEPARATORS = /[\s\-_.·•/\\\\]+/gu;
const COMBINING_MARKS = /\p{M}/gu;

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase('en-US')
    .replace(IGNORED_SEPARATORS, '')
    .trim();
}
