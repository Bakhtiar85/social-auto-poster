// src/types/github.ts

export interface GitHubCommit {
    sha: string;
    commit: {
        author: {
            name: string;
            email: string;
            date: string;
        };
        committer: {
            name: string;
            email: string;
            date: string;
        };
        message: string;
        tree: {
            sha: string;
        };
    };
    author: {
        login: string;
        id: number;
        avatar_url: string;
    } | null;
    committer: {
        login: string;
        id: number;
        avatar_url: string;
    } | null;
    parents: Array<{
        sha: string;
    }>;
    stats?: {
        additions: number;
        deletions: number;
        total: number;
    };
    files?: GitHubFile[];
}

export interface GitHubFile {
    filename: string;
    additions: number;
    deletions: number;
    changes: number;
    status: 'added' | 'removed' | 'modified' | 'renamed';
    raw_url: string;
    blob_url: string;
    patch?: string;
}

export interface ProcessedCommit {
    sha: string;
    message: string;
    author: string;
    date: string;
    filesChanged: number;
    additions: number;
    deletions: number;
    type: CommitType;
    category: CommitCategory;
    significance: 'major' | 'minor' | 'patch';
}

export type CommitType =
    | 'feature'
    | 'fix'
    | 'docs'
    | 'style'
    | 'refactor'
    | 'test'
    | 'chore'
    | 'merge'
    | 'other';

export type CommitCategory =
    | 'frontend'
    | 'backend'
    | 'database'
    | 'api'
    | 'ui'
    | 'security'
    | 'performance'
    | 'configuration'
    | 'general';

export interface CommitGroup {
    category: CommitCategory;
    commits: ProcessedCommit[];
    impact: 'high' | 'medium' | 'low';
    summary: string;
}