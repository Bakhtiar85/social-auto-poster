// src/types/memory.ts

export interface PostHistory {
    id: string;
    commitSha: string;
    platform: string;
    content: string;
    imageUrl?: string | undefined;
    postedAt: string;
    engagement?: {
    likes: number;
    comments: number;
    shares: number;
} | undefined;
}

export interface ProjectContext {
    projectName: string;
    description: string;
    techStack: string[];
    currentPhase: ProjectPhase;
    milestones: Milestone[];
    recentTopics: string[];
    audienceKnows: string[];
}

export interface Milestone {
    id: string;
    title: string;
    description: string;
    completedAt?: string;
    isPublic: boolean;
}

export type ProjectPhase =
    | 'planning'
    | 'development'
    | 'testing'
    | 'beta'
    | 'launch'
    | 'maintenance'
    | 'scaling';

export interface MemoryStore {
    lastPostedCommit: string;
    lastPostDate: string;
    postHistory: PostHistory[];
    projectContext: ProjectContext;
    narrativeContext: NarrativeContext;
    settings: MemorySettings;
}

export interface NarrativeContext {
    currentStoryline: string;
    ongoingFeatures: OngoingFeature[];
    mentionedConcepts: string[];
    buildingUp: string[];
    completedArcs: string[];
}

export interface OngoingFeature {
    name: string;
    startedAt: string;
    lastMentioned: string;
    commits: string[];
    status: 'starting' | 'in-progress' | 'testing' | 'completed';
}

export interface MemorySettings {
    maxHistoryDays: number;
    avoidRepeatTopicsDays: number;
    referenceOldPostsFrequency: number;
    contextAwareness: boolean;
}