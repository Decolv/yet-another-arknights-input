export interface SearchVariants { primaryPinyin: string; alternatePinyin: string[]; primaryInitials: string; alternateInitials: string[]; }
export interface AliasRecord extends SearchVariants { text: string; }
export interface OperatorRecord { id: `prts:${number}`; name: string; avatarUrl: string; nameSearch: SearchVariants; aliases: AliasRecord[]; }
export interface OperatorSnapshot { schemaVersion: 1; generatedAt: string; sources: { prts: string; moegirl: string }; operators: OperatorRecord[]; }
export type MatchedBy = 'name' | 'name-pinyin' | 'name-pinyin-alt' | 'name-initials' | 'name-initials-alt' | 'alias' | 'alias-pinyin' | 'alias-pinyin-alt' | 'alias-initials' | 'alias-initials-alt';
export interface SelectedCharacter { id: OperatorRecord['id']; name: string; avatarUrl: string; }
export interface CharacterSelectDetail extends SelectedCharacter { matchedBy: MatchedBy; matchedText: string; }
export interface SearchResult { operator: OperatorRecord; matchedBy: MatchedBy; matchedText: string; quality: 1 | 2 | 3; fieldPriority: number; }
