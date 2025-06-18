// src/types/index.ts

export interface ApiResponse<T = any> {
    data?: T;
    error?: string | Error;
    message: string;
    successful: boolean;
}

export interface AppConfig {
    github: {
        token: string;
        owner: string;
        repo: string;
    };
    ai: {
        apiKey: string;
        model: string;
        baseUrl: string;
    };
    social: {
        linkedin: {
            accessToken: string;
        };
        facebook: {
            accessToken: string;
            pageId?: string;
        };
    };
    app: {
        nodeEnv: string;
        logLevel: string;
        cronSchedule: string;
    };
}

export interface LogLevel {
    ERROR: 'error';
    WARN: 'warn';
    INFO: 'info';
    DEBUG: 'debug';
}

export * from './github';
export * from './memory';
export * from './social';