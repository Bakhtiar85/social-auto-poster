// src/services/social/linkedin.ts

import { SocialPost, PublishResult, ApiResponse, PlatformConfig } from '@/types';
import { config } from '@/config';
import { API_ENDPOINTS } from '@/config/apis';
import { createApiResponse } from '@/utils/helpers';
import { createServiceLogger } from '@/utils/logger';
import { validateSocialPost } from '@/utils/validators';
import { BasePublisher } from './base-publisher';

const logger = createServiceLogger('LinkedInPublisher');

class LinkedInPublisher extends BasePublisher {
    private userId: string | null = null;

    constructor() {
        const platformConfig: PlatformConfig = {
            enabled: !!config.social.linkedin.accessToken,
            accessToken: config.social.linkedin.accessToken,
            rateLimits: {
                postsPerHour: 25,
                postsPerDay: 150
            }
        };

        super('LinkedIn', platformConfig, API_ENDPOINTS.linkedin.baseUrl);

        // Set authorization header
        if (this.config.accessToken) {
            this.axiosInstance.defaults.headers['Authorization'] = `Bearer ${this.config.accessToken}`;
        }
    }

    /**
     * Publish post to LinkedIn
     */
    public async publishPost(post: SocialPost): Promise<ApiResponse<PublishResult | undefined>> {
        try {
            if (!this.isEnabled()) {
                return createApiResponse(
                    false,
                    'LinkedIn publisher not enabled',
                    undefined,
                    'LinkedIn access token not configured'
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

            logger.info('Publishing post to LinkedIn', {
                contentLength: post.content.length,
                hashtagCount: post.hashtags.length
            });

            // Get user ID if not cached
            if (!this.userId) {
                const userIdResult = await this.getUserId();
                if (!userIdResult.successful || !userIdResult.data) {
                    return createApiResponse(false, 'Failed to get LinkedIn user ID', undefined, userIdResult.error);
                }
                this.userId = userIdResult.data;
            }

            // Prepare post data
            const postData = this.prepareLinkedInPost(post);

            // Publish the post
            const response = await this.retryApiCall(
                () => this.axiosInstance.post('/ugcPosts', postData),
                'publish post'
            );

            const postId = response.data?.id;
            if (!postId) {
                return createApiResponse(false, 'No post ID returned', undefined, 'LinkedIn API returned no post ID');
            }

            // Create success result
            const result = this.createSuccessResult(
                postId,
                `https://www.linkedin.com/feed/update/${postId}`
            );

            this.logSuccessfulPost(result);
            return createApiResponse(true, 'LinkedIn post published successfully', result);

        } catch (error: unknown) {
            return this.handleApiError(error, 'publish post');
        }
    }

    /**
     * Validate LinkedIn access token
     */
    public async validateToken(): Promise<ApiResponse<boolean>> {
        try {
            if (!this.config.accessToken) {
                return createApiResponse(false, 'No LinkedIn access token', false, 'Access token not configured');
            }

            logger.info('Validating LinkedIn access token');

            await this.retryApiCall(
                () => this.axiosInstance.get('/people/~'),
                'validate token'
            );

            logger.info('LinkedIn token validated successfully');
            return createApiResponse(true, 'LinkedIn token is valid', true);

        } catch (error: unknown) {
            logger.error('LinkedIn token validation failed', error);
            return this.handleApiError(error, 'validate token') as unknown as ApiResponse<boolean>;
        }
    }

    /**
     * Get LinkedIn user profile information
     */
    public async getUserProfile(): Promise<ApiResponse<{
        id: string;
        firstName: string;
        lastName: string;
        headline?: string;
    } | undefined>> {
        try {
            logger.info('Fetching LinkedIn user profile');

            const response = await this.retryApiCall(
                () => this.axiosInstance.get('/people/~:(id,firstName,lastName,headline)'),
                'get user profile'
            );

            const profile = {
                id: response.data.id,
                firstName: response.data.firstName?.localized?.en_US || '',
                lastName: response.data.lastName?.localized?.en_US || '',
                headline: response.data.headline?.localized?.en_US
            };

            logger.info('LinkedIn profile fetched successfully', { userId: profile.id });
            return createApiResponse(true, 'LinkedIn profile fetched', profile);

        } catch (error: unknown) {
            return this.handleApiError(error, 'get user profile') as ApiResponse<any>;
        }
    }

    /**
     * Get LinkedIn user ID
     */
    private async getUserId(): Promise<ApiResponse<string | undefined>> {
        try {
            const profileResult = await this.getUserProfile();
            if (!profileResult.successful || !profileResult.data) {
                return createApiResponse(false, 'Failed to get user profile', undefined, profileResult.error);
            }

            return createApiResponse(true, 'User ID retrieved', profileResult.data.id);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return createApiResponse(false, 'Failed to get user ID', undefined, errMsg);
        }
    }

    /**
     * Prepare LinkedIn post data structure
     */
    private prepareLinkedInPost(post: SocialPost): any {
        const { fullContent } = this.prepareContent(post);

        const postData = {
            author: `urn:li:person:${this.userId}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: {
                        text: fullContent
                    },
                    shareMediaCategory: 'NONE',
                    // Add media as optional property for type safety
                    media: undefined as
                        | Array<{
                              status: string;
                              description: { text: string };
                              media: string;
                              title: { text: string };
                          }>
                        | undefined
                }
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
        };

        // Add image if provided
        if (post.imageUrl) {
            postData.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
            postData.specificContent['com.linkedin.ugc.ShareContent'].media = [
                {
                    status: 'READY',
                    description: {
                        text: 'Development update image'
                    },
                    media: post.imageUrl,
                    title: {
                        text: 'Development Update'
                    }
                }
            ];
        }

        return postData;
    }

    /**
     * Get post analytics (if available)
     */
    public async getPostAnalytics(postId: string): Promise<ApiResponse<{
        likes: number;
        comments: number;
        shares: number;
        impressions?: number;
    } | undefined>> {
        try {
            logger.info('Fetching LinkedIn post analytics', { postId });

            // LinkedIn analytics requires additional permissions
            // This is a placeholder for when analytics are needed
            const analytics = {
                likes: 0,
                comments: 0,
                shares: 0,
                impressions: 0
            };

            return createApiResponse(true, 'Analytics retrieved (placeholder)', analytics);
        } catch (error: unknown) {
            return this.handleApiError(error, 'get analytics') as ApiResponse<any>;
        }
    }

    /**
     * Validate LinkedIn-specific content
     */
    protected validatePostContent(post: SocialPost): ApiResponse<boolean> {
        const baseValidation = super.validatePostContent(post);
        if (!baseValidation.successful) {
            return baseValidation;
        }

        // LinkedIn-specific validations
        if (post.content.length > 3000) {
            return createApiResponse(
                false,
                'LinkedIn post too long',
                false,
                'LinkedIn posts cannot exceed 3000 characters'
            );
        }

        // Check for LinkedIn-specific content guidelines
        const content = post.content.toLowerCase();
        if (content.includes('follow for follow') || content.includes('f4f')) {
            return createApiResponse(
                false,
                'Content violates LinkedIn guidelines',
                false,
                'Avoid follow-for-follow content on LinkedIn'
            );
        }

        return createApiResponse(true, 'LinkedIn content validated', true);
    }
}

// Export singleton instance
export const linkedinPublisher = new LinkedInPublisher();
export default linkedinPublisher;