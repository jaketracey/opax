export const RECENT_VOTES_BUCKETS: number;
export function recentVotesBucket(key: string): number;
export function recentVotesBucketPath(bucket: number): string;
export function votesBucketPath(bucket: number): string;
export const VOTES_NAMES_PATH: string;
export function votesSlice(read: (path: string) => Promise<any>, keysFor: (names: {_names: Record<string, string[]>}) => string[]): Promise<Record<string, any> | null>;
export function recentVotesSlice(read: (path: string) => Promise<any>, keys: string[]): Promise<{_meta: unknown; people: Record<string, any>} | null>;
export function bucketLayout(bucket: number): {_bucket: number; _of: number};
