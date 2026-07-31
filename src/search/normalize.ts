const IGNORED_SEPARATORS = /[\s\-_.·•/\\\\]+/gu;

export function normalizeSearchText(input: string): string {
  return input.normalize('NFKC').toLocaleLowerCase('en-US').replace(IGNORED_SEPARATORS, '').trim();
}
