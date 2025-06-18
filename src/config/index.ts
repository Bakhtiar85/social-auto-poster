// src/config/index.ts

import dotenv from 'dotenv';
import { AppConfig, ApiResponse } from '@/types';

dotenv.config();

class ConfigManager {
    private static instance: ConfigManager;
    private config: AppConfig;

    private constructor() {
        this.config = this.loadConfig();
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    private loadConfig(): AppConfig {
        const requiredEnvVars = [
            'GITHUB_TOKEN',
            'GITHUB_REPO_OWNER',
            'GITHUB_REPO_NAME',
            'OPENROUTER_API_KEY',
            'LINKEDIN_ACCESS_TOKEN'
        ];

        // Check required environment variables
        const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        return {
            github: {
                token: process.env.GITHUB_TOKEN!,
                owner: process.env.GITHUB_REPO_OWNER!,
                repo: process.env.GITHUB_REPO_NAME!,
            },
            ai: {
                apiKey: process.env.OPENROUTER_API_KEY!,
                model: process.env.AI_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
                baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
            },
            social: {
                linkedin: {
                    accessToken: process.env.LINKEDIN_ACCESS_TOKEN!,
                },
                facebook: {
                    accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
                    pageId: process.env.FACEBOOK_PAGE_ID || '',
                },
            },
            app: {
                nodeEnv: process.env.NODE_ENV || 'development',
                logLevel: process.env.LOG_LEVEL || 'info',
                cronSchedule: process.env.CRON_SCHEDULE || '0 9 * * *', // 9 AM daily
            },
        };
    }

    public getConfig(): AppConfig {
        return this.config;
    }

    public validateConfig(): ApiResponse<boolean> {
        try {
            // Validate GitHub config
            if (!this.config.github.token.startsWith('ghp_') && !this.config.github.token.startsWith('github_pat_')) {
                return {
                    successful: false,
                    message: 'Invalid GitHub token format',
                    error: 'GitHub token should start with ghp_ or github_pat_'
                };
            }

            // Validate AI config
            if (!this.config.ai.apiKey || this.config.ai.apiKey.length < 10) {
                return {
                    successful: false,
                    message: 'Invalid OpenRouter API key',
                    error: 'OpenRouter API key is required and should be valid'
                };
            }

            return {
                successful: true,
                message: 'Configuration validated successfully',
                data: true
            };
        } catch (error) {
            return {
                successful: false,
                message: 'Configuration validation failed',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

export const config = ConfigManager.getInstance().getConfig();
export const configManager = ConfigManager.getInstance();
export default config;