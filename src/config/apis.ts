// src/config/apis.ts

import { config } from './index';

export const API_ENDPOINTS = {
    github: {
        baseUrl: 'https://api.github.com',
        repos: {
            commits: (owner: string, repo: string) =>
                `/repos/${owner}/${repo}/commits`,
            commitDetails: (owner: string, repo: string, sha: string) =>
                `/repos/${owner}/${repo}/commits/${sha}`,
            repo: (owner: string, repo: string) =>
                `/repos/${owner}/${repo}`
        }
    },

    openRouter: {
        baseUrl: config.ai.baseUrl,
        chat: '/chat/completions',
        models: '/models'
    },

    linkedin: {
        baseUrl: 'https://api.linkedin.com/v2',
        posts: '/ugcPosts',
        shares: '/shares',
        profile: '/people/~'
    },

    facebook: {
        baseUrl: 'https://graph.facebook.com/v18.0',
        posts: (pageId: string) => `/${pageId}/feed`,
        photos: (pageId: string) => `/${pageId}/photos`,
        me: '/me'
    }
};

export const API_LIMITS = {
    github: {
        requestsPerHour: 5000,
        requestsPerMinute: 60
    },

    openRouter: {
        requestsPerMinute: 200,
        tokensPerDay: 100000
    },

    linkedin: {
        postsPerDay: 150,
        postsPerHour: 25
    },

    facebook: {
        postsPerDay: 200,
        postsPerHour: 25
    }
};

export const REQUEST_TIMEOUTS = {
    github: 10000,      // 10 seconds
    openRouter: 30000,  // 30 seconds
    linkedin: 15000,    // 15 seconds
    facebook: 15000     // 15 seconds
};

export const RETRY_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000,     // 1 second
    backoffMultiplier: 2
};

export const DEFAULT_HEADERS = {
    github: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'social-auto-poster/1.0'
    },

    openRouter: {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/your-repo',
        'X-Title': 'Social Auto Poster'
    },

    linkedin: {
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
    },

    facebook: {
        'Content-Type': 'application/json'
    }
};