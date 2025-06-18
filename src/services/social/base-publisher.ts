// src/services/social/base-publisher.ts

import axios, { AxiosInstance } from 'axios';
import { SocialPost, PublishResult, PlatformConfig, ApiResponse } from '@/types';
import { createApiResponse, retry, sleep } from '@/utils/helpers';
import { createServiceLogger, logApiRequest } from '@/utils/logger';
import { RETRY_CONFIG } from '@/config/apis';

const logger = createServiceLogger('BasePublisher');

export abstract class BasePublisher {
    protected axiosInstance: AxiosInstance;
    protected platformName: string;
    protected config: PlatformConfig;

    constructor(platformName: string, config: PlatformConfig, baseURL: string) {
        this.platformName = platformName;
        this.config = config;

        this.axiosInstance = axios.create({
            baseURL,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'social-auto-poster/1.0'
            }
        });

        this.setupInterceptors();
    }

    /**
     * Abstract method to publish post - must be implemented by each platform
     */
    abstract publishPost(post: SocialPost): Promise<ApiResponse<PublishResult | undefined>>;

    /**
     * Abstract method to validate access token
     */
    abstract validateToken(): Promise<ApiResponse<boolean>>;

    /**
     * Check if platform is enabled and configured
     */
    public isEnabled(): boolean {
        return this.config.enabled && !!this.config.accessToken;
    }

    /**
     * Check rate limits before posting
     */
    public async checkRateLimit(): Promise<ApiResponse<boolean>> {
        try {
            const now = new Date();
            const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
            const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // This is a simplified rate limiting check
            // In production, you'd store this in a database or cache
            const recentPosts = this.getRecentPostCount();

            if (recentPosts.hourly >= this.config.rateLimits.postsPerHour) {
                return createApiResponse(
                    false,
                    `${this.platformName} hourly rate limit exceeded`,
                    false,
                    `Maximum ${this.config.rateLimits.postsPerHour} posts per hour`
                );
            }

            if (recentPosts.daily >= this.config.rateLimits.postsPerDay) {
                return createApiResponse(
                    false,
                    `${this.platformName} daily rate limit exceeded`,
                    false,
                    `Maximum ${this.config.rateLimits.postsPerDay} posts per day`
                );
            }

            return createApiResponse(true, 'Rate limit check passed', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Rate limit check failed', error);
            return createApiResponse(false, 'Rate limit check failed', false, errMsg);
        }
    }

    /**
     * Prepare post content for platform-specific requirements
     */
    protected prepareContent(post: SocialPost): {
        content: string;
        hashtags: string;
        fullContent: string;
    } {
        const content = post.content.trim();
        const hashtags = post.hashtags.join(' ');
        const fullContent = hashtags ? `${content}\n\n${hashtags}` : content;

        return {
            content,
            hashtags,
            fullContent
        };
    }

    /**
     * Handle API errors consistently
     */
    protected handleApiError(error: any, action: string): ApiResponse<PublishResult | undefined> {
        logger.error(`${this.platformName} ${action} failed`, error);

        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const message = error.response?.data?.message || error.message;

            switch (status) {
                case 401:
                    return createApiResponse(
                        false,
                        `${this.platformName} authentication failed`,
                        undefined,
                        'Access token expired or invalid'
                    );
                case 403:
                    return createApiResponse(
                        false,
                        `${this.platformName} access forbidden`,
                        undefined,
                        'Insufficient permissions or account restrictions'
                    );
                case 429:
                    return createApiResponse(
                        false,
                        `${this.platformName} rate limit exceeded`,
                        undefined,
                        'Too many requests, try again later'
                    );
                case 400:
                    return createApiResponse(
                        false,
                        `${this.platformName} bad request`,
                        undefined,
                        `Invalid request: ${message}`
                    );
                default:
                    return createApiResponse(
                        false,
                        `${this.platformName} API error`,
                        undefined,
                        `HTTP ${status}: ${message}`
                    );
            }
        }

        const errMsg = error instanceof Error ? error.message : String(error);
        return createApiResponse(
            false,
            `${this.platformName} ${action} failed`,
            undefined,
            errMsg
        );
    }

    /**
     * Retry wrapper for API calls
     */
    protected async retryApiCall<T>(
        apiCall: () => Promise<T>,
        action: string
    ): Promise<T> {
        return await retry(
            apiCall,
            RETRY_CONFIG.maxRetries,
            RETRY_CONFIG.retryDelay,
            RETRY_CONFIG.backoffMultiplier
        );
    }

    /**
     * Setup axios interceptors for logging and error handling
     */
    private setupInterceptors(): void {
        // Request interceptor
        this.axiosInstance.interceptors.request.use(
            (config) => {
                logger.debug(`${this.platformName} API request`, {
                    method: config.method?.toUpperCase(),
                    url: config.url,
                    hasData: !!config.data
                });
                return config;
            },
            (error) => {
                logger.error(`${this.platformName} request error`, error);
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.axiosInstance.interceptors.response.use(
            (response) => {
                logApiRequest(
                    this.platformName.toLowerCase(),
                    response.config.url || '',
                    response.config.method?.toUpperCase() || 'GET',
                    response.status
                );
                return response;
            },
            (error) => {
                logApiRequest(
                    this.platformName.toLowerCase(),
                    error.config?.url || '',
                    error.config?.method?.toUpperCase() || 'GET',
                    error.response?.status
                );
                return Promise.reject(error);
            }
        );
    }

    /**
     * Get recent post count (simplified - in production use proper storage)
     */
    private getRecentPostCount(): { hourly: number; daily: number } {
        // This is a placeholder implementation
        // In production, you would track this in memory store or database
        return {
            hourly: 0,
            daily: 0
        };
    }

    /**
     * Log successful post
     */
    protected logSuccessfulPost(result: PublishResult): void {
        logger.info(`${this.platformName} post published successfully`, {
            postId: result.postId,
            url: result.url,
            publishedAt: result.publishedAt
        });
    }

    /**
     * Create success result
     */
    protected createSuccessResult(
        postId: string,
        url?: string
    ): PublishResult {
        return {
            platform: this.platformName.toLowerCase() as any,
            postId,
            url: url ?? '',
            publishedAt: new Date().toISOString(),
            success: true
        };
    }

    /**
     * Create error result
     */
    protected createErrorResult(error: string): PublishResult {
        return {
            platform: this.platformName.toLowerCase() as any,
            publishedAt: new Date().toISOString(),
            success: false,
            error
        };
    }

    /**
     * Validate post content before publishing
     */
    protected validatePostContent(post: SocialPost): ApiResponse<boolean> {
        if (!post.content || post.content.trim().length === 0) {
            return createApiResponse(false, 'Post content is empty', false, 'Content is required');
        }

        if (post.content.length > 3000) {
            return createApiResponse(false, 'Post content too long', false, 'Content exceeds maximum length');
        }

        if (post.hashtags && post.hashtags.length > 10) {
            return createApiResponse(false, 'Too many hashtags', false, 'Maximum 10 hashtags allowed');
        }

        return createApiResponse(true, 'Post content validated', true);
    }

    /**
     * Wait for rate limiting
     */
    protected async waitForRateLimit(seconds: number): Promise<void> {
        logger.info(`${this.platformName} rate limiting: waiting ${seconds} seconds`);
        await sleep(seconds * 1000);
    }
}