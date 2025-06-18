// src/services/social/facebook.ts

import { SocialPost, PublishResult, ApiResponse, PlatformConfig } from '@/types';
import { config } from '@/config';
import { API_ENDPOINTS } from '@/config/apis';
import { createApiResponse } from '@/utils/helpers';
import { createServiceLogger } from '@/utils/logger';
import { validateSocialPost } from '@/utils/validators';
import { BasePublisher } from './base-publisher';

const logger = createServiceLogger('FacebookPublisher');

class FacebookPublisher extends BasePublisher {
    private pageId: string;

    constructor() {
        const platformConfig: PlatformConfig = {
            enabled: !!config.social.facebook.accessToken,
            accessToken: config.social.facebook.accessToken,
            rateLimits: {
                postsPerHour: 25,
                postsPerDay: 200
            }
        };

        super('Facebook', platformConfig, API_ENDPOINTS.facebook.baseUrl);

        this.pageId = config.social.facebook.pageId || '';

        // Facebook uses access_token as query parameter
        if (this.config.accessToken) {
            this.axiosInstance.defaults.params = {
                access_token: this.config.accessToken
            };
        }
    }

    /**
     * Publish post to Facebook
     */
    public async publishPost(post: SocialPost): Promise<ApiResponse<PublishResult | undefined>> {
        try {
            if (!this.isEnabled()) {
                return createApiResponse(
                    false,
                    'Facebook publisher not enabled',
                    undefined,
                    'Facebook access token not configured'
                );
            }

            if (!this.pageId) {
                return createApiResponse(
                    false,
                    'Facebook page ID not configured',
                    undefined,
                    'Page ID is required for posting'
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

            logger.info('Publishing post to Facebook', {
                pageId: this.pageId,
                contentLength: post.content.length,
                hashtagCount: post.hashtags.length,
                hasImage: !!post.imageUrl
            });

            // Prepare post data
            const postData = this.prepareFacebookPost(post);
            const endpoint = API_ENDPOINTS.facebook.posts(this.pageId);

            // Publish the post
            const response = await this.retryApiCall(
                () => this.axiosInstance.post(endpoint, postData),
                'publish post'
            );

            const postId = response.data?.id;
            if (!postId) {
                return createApiResponse(false, 'No post ID returned', undefined, 'Facebook API returned no post ID');
            }

            // Create success result
            const result = this.createSuccessResult(
                postId,
                `https://www.facebook.com/${postId}`
            );

            this.logSuccessfulPost(result);
            return createApiResponse(true, 'Facebook post published successfully', result);

        } catch (error: unknown) {
            return this.handleApiError(error, 'publish post');
        }
    }

    /**
     * Validate Facebook access token
     */
    public async validateToken(): Promise<ApiResponse<boolean>> {
        try {
            if (!this.config.accessToken) {
                return createApiResponse(false, 'No Facebook access token', false, 'Access token not configured');
            }

            logger.info('Validating Facebook access token');

            // Test token by getting basic page info
            const endpoint = this.pageId ? `/${this.pageId}` : '/me';
            await this.retryApiCall(
                () => this.axiosInstance.get(endpoint, {
                    params: {
                        fields: 'id,name',
                        access_token: this.config.accessToken
                    }
                }),
                'validate token'
            );

            logger.info('Facebook token validated successfully');
            return createApiResponse(true, 'Facebook token is valid', true);

        } catch (error: unknown) {
            logger.error('Facebook token validation failed', error);
            return this.handleApiError(error, 'validate token') as unknown as ApiResponse<boolean>;
        }
    }

    /**
     * Get Facebook page information
     */
    public async getPageInfo(): Promise<ApiResponse<{
        id: string;
        name: string;
        followers?: number;
        likes?: number;
    } | undefined>> {
        try {
            if (!this.pageId) {
                return createApiResponse(false, 'No page ID configured', undefined, 'Page ID is required');
            }

            logger.info('Fetching Facebook page info', { pageId: this.pageId });

            const response = await this.retryApiCall(
                () => this.axiosInstance.get(`/${this.pageId}`, {
                    params: {
                        fields: 'id,name,followers_count,fan_count',
                        access_token: this.config.accessToken
                    }
                }),
                'get page info'
            );

            const pageInfo = {
                id: response.data.id,
                name: response.data.name,
                followers: response.data.followers_count,
                likes: response.data.fan_count
            };

            logger.info('Facebook page info fetched successfully', { pageId: pageInfo.id, name: pageInfo.name });
            return createApiResponse(true, 'Facebook page info fetched', pageInfo);

        } catch (error: unknown) {
            return this.handleApiError(error, 'get page info') as ApiResponse<any>;
        }
    }

    /**
     * Publish post with image
     */
    public async publishPhotoPost(post: SocialPost): Promise<ApiResponse<PublishResult | undefined>> {
        try {
            if (!post.imageUrl) {
                return this.publishPost(post);
            }

            logger.info('Publishing photo post to Facebook', { imageUrl: post.imageUrl });

            const { fullContent } = this.prepareContent(post);
            const endpoint = API_ENDPOINTS.facebook.photos(this.pageId);

            const photoData = {
                url: post.imageUrl,
                caption: fullContent,
                published: true
            };

            const response = await this.retryApiCall(
                () => this.axiosInstance.post(endpoint, photoData),
                'publish photo post'
            );

            const postId = response.data?.post_id || response.data?.id;
            if (!postId) {
                return createApiResponse(false, 'No post ID returned for photo', undefined, 'Facebook API returned no post ID');
            }

            const result = this.createSuccessResult(
                postId,
                `https://www.facebook.com/${postId}`
            );

            this.logSuccessfulPost(result);
            return createApiResponse(true, 'Facebook photo post published successfully', result);

        } catch (error: unknown) {
            return this.handleApiError(error, 'publish photo post');
        }
    }

    /**
     * Get post analytics
     */
    public async getPostAnalytics(postId: string): Promise<ApiResponse<{
        likes: number;
        comments: number;
        shares: number;
        reactions?: number;
    } | undefined>> {
        try {
            logger.info('Fetching Facebook post analytics', { postId });

            const response = await this.retryApiCall(
                () => this.axiosInstance.get(`/${postId}`, {
                    params: {
                        fields: 'likes.summary(true),comments.summary(true),shares',
                        access_token: this.config.accessToken
                    }
                }),
                'get post analytics'
            );

            const analytics = {
                likes: response.data.likes?.summary?.total_count || 0,
                comments: response.data.comments?.summary?.total_count || 0,
                shares: response.data.shares?.count || 0,
                reactions: response.data.reactions?.summary?.total_count || 0
            };

            logger.info('Facebook analytics retrieved', { postId, analytics });
            return createApiResponse(true, 'Facebook analytics retrieved', analytics);

        } catch (error: unknown) {
            return this.handleApiError(error, 'get analytics') as ApiResponse<any>;
        }
    }

    /**
     * Schedule post for later
     */
    public async schedulePost(post: SocialPost, scheduledTime: Date): Promise<ApiResponse<PublishResult | undefined>> {
        try {
            logger.info('Scheduling Facebook post', { scheduledTime });

            const postData = this.prepareFacebookPost(post);
            postData.published = false;
            postData.scheduled_publish_time = Math.floor(scheduledTime.getTime() / 1000);

            const endpoint = API_ENDPOINTS.facebook.posts(this.pageId);

            const response = await this.retryApiCall(
                () => this.axiosInstance.post(endpoint, postData),
                'schedule post'
            );

            const postId = response.data?.id;
            if (!postId) {
                return createApiResponse(false, 'No post ID returned for scheduled post', undefined, 'Facebook API returned no post ID');
            }

            const result = this.createSuccessResult(postId);
            result.publishedAt = scheduledTime.toISOString();

            logger.info('Facebook post scheduled successfully', { postId, scheduledTime });
            return createApiResponse(true, 'Facebook post scheduled successfully', result);

        } catch (error: unknown) {
            return this.handleApiError(error, 'schedule post');
        }
    }

    /**
     * Prepare Facebook post data structure
     */
    private prepareFacebookPost(post: SocialPost): any {
        const { fullContent } = this.prepareContent(post);

        const postData: any = {
            message: fullContent,
            published: true
        };

        // Add link if it's in the content
        const urlMatch = post.content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            postData.link = urlMatch[0];
        }

        return postData;
    }

    /**
     * Validate Facebook-specific content
     */
    protected validatePostContent(post: SocialPost): ApiResponse<boolean> {
        const baseValidation = super.validatePostContent(post);
        if (!baseValidation.successful) {
            return baseValidation;
        }

        // Facebook-specific validations
        if (post.content.length > 2000) {
            return createApiResponse(
                false,
                'Facebook post too long',
                false,
                'Facebook posts should be under 2000 characters for better engagement'
            );
        }

        // Check for Facebook-specific content guidelines
        const content = post.content.toLowerCase();
        if (content.includes('like and share') && content.includes('win')) {
            return createApiResponse(
                false,
                'Content may violate Facebook guidelines',
                false,
                'Avoid engagement bait content on Facebook'
            );
        }

        return createApiResponse(true, 'Facebook content validated', true);
    }
}

// Export singleton instance
export const facebookPublisher = new FacebookPublisher();
export default facebookPublisher;