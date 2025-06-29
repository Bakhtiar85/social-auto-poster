// src/services/social/twitter.ts

import { SocialPost, PublishResult, ApiResponse, PlatformConfig } from '@/types';
import { config } from '@/config';
import { createApiResponse } from '@/utils/helpers';
import { createServiceLogger } from '@/utils/logger';
import { validateSocialPost } from '@/utils/validators';
import { BasePublisher } from './base-publisher';
import axios from 'axios';
import crypto from 'crypto';

const logger = createServiceLogger('TwitterPublisher');

class TwitterPublisher extends BasePublisher {
    private apiKey: string;
    private apiSecret: string;
    private accessToken: string;
    private accessTokenSecret: string;

    constructor() {
        const platformConfig: PlatformConfig = {
            enabled: !!(
                process.env.TWITTER_API_KEY &&
                process.env.TWITTER_API_SECRET &&
                process.env.TWITTER_ACCESS_TOKEN &&
                process.env.TWITTER_ACCESS_TOKEN_SECRET
            ),
            accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
            rateLimits: {
                postsPerHour: 50,   // Twitter allows more frequent posting
                postsPerDay: 300
            }
        };

        super('Twitter', platformConfig, 'https://api.twitter.com/2');

        this.apiKey = process.env.TWITTER_API_KEY || '';
        this.apiSecret = process.env.TWITTER_API_SECRET || '';
        this.accessToken = process.env.TWITTER_ACCESS_TOKEN || '';
        this.accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET || '';

        // Set up OAuth 1.0a headers
        if (this.isEnabled()) {
            this.setupOAuthHeaders();
        }
    }

    /**
     * Publish post to Twitter
     */
    public async publishPost(post: SocialPost): Promise<ApiResponse<PublishResult | undefined>> {
        try {
            if (!this.isEnabled()) {
                return createApiResponse(
                    false,
                    'Twitter publisher not enabled',
                    undefined,
                    'Twitter API credentials not configured'
                );
            }

            // Validate post content
            const validation = validateSocialPost(post);
            if (!validation.successful) {
                return createApiResponse(false, 'Post validation failed', undefined, validation.error);
            }

            const contentValidation = this.validatePostContent(post);
            if (!contentValidation.successful) {
                return createApiResponse(false, 'Content validation failed', undefined, contentValidation.error);
            }

            // Check rate limits
            const rateLimitCheck = await this.checkRateLimit();
            if (!rateLimitCheck.successful) {
                return createApiResponse(false, 'Rate limit exceeded', undefined, rateLimitCheck.error);
            }

            logger.info('Publishing post to Twitter', {
                contentLength: post.content.length,
                hashtagCount: post.hashtags.length,
                hasImage: !!post.imageUrl
            });

            // Prepare tweet content
            const tweetData = this.prepareTwitterPost(post);

            // Post the tweet
            const response = await this.retryApiCall(
                () => this.postTweet(tweetData),
                'publish post'
            );

            if (!response.data?.id) {
                return createApiResponse(false, 'No tweet ID returned', undefined, 'Twitter API returned no tweet ID');
            }

            // Create success result
            const result = this.createSuccessResult(
                response.data.id,
                `https://twitter.com/i/status/${response.data.id}`
            );

            this.logSuccessfulPost(result);
            return createApiResponse(true, 'Twitter post published successfully', result);

        } catch (error: unknown) {
            return this.handleApiError(error, 'publish post');
        }
    }

    /**
     * Validate Twitter access token
     */
    public async validateToken(): Promise<ApiResponse<boolean>> {
        try {
            if (!this.isEnabled()) {
                return createApiResponse(false, 'No Twitter credentials', false, 'API credentials not configured');
            }

            logger.info('Validating Twitter access token');

            // Test with a simple user lookup
            await this.retryApiCall(
                () => this.axiosInstance.get('/users/me'),
                'validate token'
            );

            logger.info('Twitter token validated successfully');
            return createApiResponse(true, 'Twitter token is valid', true);

        } catch (error: unknown) {
            logger.error('Twitter token validation failed', error);
            return this.handleApiError(error, 'validate token') as unknown as ApiResponse<boolean>;
        }
    }

    /**
     * Post tweet using Twitter API v2
     */
    private async postTweet(tweetData: any): Promise<any> {
        const response = await this.axiosInstance.post('/tweets', tweetData);
        return response;
    }

    /**
     * Prepare Twitter post data
     */
    private prepareTwitterPost(post: SocialPost): any {
        const { fullContent } = this.prepareContent(post);

        // Twitter has a 280 character limit
        let content = fullContent;
        if (content.length > 280) {
            // Truncate and add link if needed
            content = content.substring(0, 275) + '...';
        }

        const tweetData: any = {
            text: content
        };

        // Add media if present
        if (post.imageUrl) {
            // Note: Twitter media upload is a separate endpoint
            // For now, we'll include the image URL in the text
            logger.info('Twitter image posting not fully implemented', { imageUrl: post.imageUrl });
        }

        return tweetData;
    }

    /**
     * Setup OAuth 1.0a headers for Twitter API
     */
    private setupOAuthHeaders(): void {
        this.axiosInstance.interceptors.request.use((config) => {
            const oauthHeaders = this.generateOAuthHeaders(
                config.method?.toUpperCase() || 'GET',
                (this.axiosInstance.defaults.baseURL ?? '') + (config.url ?? ''),
                config.data
            );

            if (config.headers) {
                if (oauthHeaders.Authorization) {
                    config.headers['Authorization'] = oauthHeaders.Authorization;
                }
                if (oauthHeaders['Content-Type']) {
                    config.headers['Content-Type'] = oauthHeaders['Content-Type'];
                }
            }
            
            return config;
        });
    }

    /**
     * Generate OAuth 1.0a headers for Twitter
     */
    private generateOAuthHeaders(method: string, url: string, data?: any): Record<string, string> {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomBytes(16).toString('hex');

        const params: Record<string, string> = {
            oauth_consumer_key: this.apiKey,
            oauth_token: this.accessToken,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_nonce: nonce,
            oauth_version: '1.0'
        };

        // Create signature
        const signature = this.createOAuthSignature(method, url, params, data);
        params.oauth_signature = signature;

        // Create Authorization header
        const authHeader = 'OAuth ' + Object.keys(params)
            .sort()
            .map(key => `${key}="${encodeURIComponent(params[key] || '')}"`)
            .join(', ');

        return {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Create OAuth signature for Twitter API
     */
    private createOAuthSignature(method: string, url: string, params: Record<string, string>, data?: any): string {
        // Simplified OAuth signature generation
        // In production, consider using a library like 'oauth-1.0a'

        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}=${encodeURIComponent(params[key] || '')}`)
            .join('&');

        const signatureBaseString = [
            method.toUpperCase(),
            encodeURIComponent(url),
            encodeURIComponent(sortedParams)
        ].join('&');

        const signingKey = [
            encodeURIComponent(this.apiSecret),
            encodeURIComponent(this.accessTokenSecret)
        ].join('&');

        return crypto
            .createHmac('sha1', signingKey)
            .update(signatureBaseString)
            .digest('base64');
    }

    /**
     * Post a thread (multiple tweets)
     */
    public async postThread(messages: string[]): Promise<ApiResponse<PublishResult[] | undefined>> {
        try {
            if (!this.isEnabled()) {
                return createApiResponse(false, 'Twitter not enabled', undefined, 'Not configured');
            }

            logger.info('Posting Twitter thread', { messageCount: messages.length });

            const results: PublishResult[] = [];
            let replyToId: string | undefined;

            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                if (typeof message !== 'string') {
                    logger.error(`Message at index ${i} is undefined or not a string`);
                    results.push(this.createErrorResult(`Message at index ${i} is invalid`));
                    continue;
                }
                const tweetData: any = {
                    text: message.length > 280 ? message.substring(0, 277) + '...' : message
                };

                if (replyToId) {
                    tweetData.reply = { in_reply_to_tweet_id: replyToId };
                }

                try {
                    const response = await this.postTweet(tweetData);
                    const result = this.createSuccessResult(
                        response.data.id,
                        `https://twitter.com/i/status/${response.data.id}`
                    );
                    results.push(result);
                    replyToId = response.data.id;

                    // Small delay between tweets
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    logger.error(`Failed to post tweet ${i + 1} in thread`, error);
                    results.push(this.createErrorResult(`Failed to post tweet ${i + 1}`));
                }
            }

            logger.info('Twitter thread posted', {
                total: messages.length,
                successful: results.filter(r => r.success).length
            });

            return createApiResponse(true, 'Twitter thread posted', results);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to post Twitter thread', error);
            return createApiResponse(false, 'Thread posting failed', undefined, errMsg);
        }
    }

    /**
     * Validate Twitter-specific content
     */
    protected validatePostContent(post: SocialPost): ApiResponse<boolean> {
        const baseValidation = super.validatePostContent(post);
        if (!baseValidation.successful) {
            return baseValidation;
        }

        // Twitter-specific validations
        const { fullContent } = this.prepareContent(post);

        if (fullContent.length > 280) {
            logger.warn('Twitter post exceeds 280 characters, will be truncated', {
                length: fullContent.length
            });
            // Don't fail validation, just warn - we'll truncate
        }

        // Check for Twitter-specific issues
        const content = post.content.toLowerCase();
        if (content.includes('follow for follow') || content.includes('f4f')) {
            return createApiResponse(
                false,
                'Content may violate Twitter guidelines',
                false,
                'Avoid follow-for-follow content on Twitter'
            );
        }

        return createApiResponse(true, 'Twitter content validated', true);
    }
}

// Export singleton instance
export const twitterPublisher = new TwitterPublisher();
export default twitterPublisher;