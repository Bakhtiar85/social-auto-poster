// src/config/database.ts

import path from 'path';
import { MemoryStore, ProjectContext } from '@/types';

export const STORAGE_PATHS = {
    memory: {
        root: path.join(process.cwd(), 'src', 'data', 'memory'),
        postHistory: path.join(process.cwd(), 'src', 'data', 'memory', 'post-history.json'),
        context: path.join(process.cwd(), 'src', 'data', 'memory', 'context.json')
    },
    templates: {
        root: path.join(process.cwd(), 'src', 'data', 'templates'),
        prompts: path.join(process.cwd(), 'src', 'data', 'templates', 'prompts.ts')
    },
    logs: {
        root: path.join(process.cwd(), 'logs'),
        app: path.join(process.cwd(), 'logs', 'app.log'),
        error: path.join(process.cwd(), 'logs', 'error.log')
    }
};

export const DEFAULT_MEMORY_STORE: MemoryStore = {
    lastPostedCommit: '',
    lastPostDate: '',
    postHistory: [],
    projectContext: {
        projectName: process.env.PROJECT_NAME || 'My Project',
        description: process.env.PROJECT_DESCRIPTION || 'A software project',
        techStack: (process.env.TECH_STACK || 'JavaScript,Node.js,TypeScript').split(','),
        currentPhase: 'development',
        milestones: [],
        recentTopics: [],
        audienceKnows: []
    },
    narrativeContext: {
        currentStoryline: '',
        ongoingFeatures: [],
        mentionedConcepts: [],
        buildingUp: [],
        completedArcs: []
    },
    settings: {
        maxHistoryDays: 30,
        avoidRepeatTopicsDays: 7,
        referenceOldPostsFrequency: 0.3, // 30% chance
        contextAwareness: true
    }
};

export const BACKUP_CONFIG = {
    enabled: process.env.BACKUP_ENABLED === 'true',
    interval: parseInt(process.env.BACKUP_INTERVAL || '24', 10), // hours
    maxBackups: parseInt(process.env.MAX_BACKUPS || '7', 10),
    backupPath: path.join(process.cwd(), 'backups')
};

export const CACHE_CONFIG = {
    ttl: {
        commits: 300000,      // 5 minutes
        aiResponses: 3600000, // 1 hour
        socialPosts: 86400000 // 24 hours
    },
    maxSize: {
        commits: 100,
        aiResponses: 50,
        socialPosts: 200
    }
};

export const VALIDATION_RULES = {
    commit: {
        minMessageLength: 10,
        maxMessageLength: 500,
        ignorePaths: ['.gitignore', 'README.md', 'package-lock.json'],
        ignoreCommitTypes: ['merge', 'revert']
    },

    post: {
        minContentLength: 50,
        maxContentLength: {
            linkedin: 3000,
            facebook: 2000
        },
        maxHashtags: 10,
        requiredHashtags: ['#coding', '#developer']
    },

    memory: {
        maxHistoryEntries: 1000,
        maxOngoingFeatures: 5,
        maxMentionedConcepts: 50
    }
};