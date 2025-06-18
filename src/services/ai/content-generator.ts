// src/services/ai/content-generator.ts

import axios, { AxiosResponse } from 'axios';
import { ProcessedCommit, PostContent, SocialPlatform, PostTone, PostLength, ApiResponse } from '@/types';
import { config } from '@/config';
import { API_ENDPOINTS, DEFAULT_HEADERS, REQUEST_TIMEOUTS, RETRY_CONFIG } from '@/config/apis';
import { CONTENT_GENERATION_PROMPTS, HASHTAG_SUGGESTIONS, PLATFORM_SPECIFIC_ADJUSTMENTS } from '@/data/templates/prompts';
import { createApiResponse, retry, stringUtils } from '@/utils/helpers';
import { createServiceLogger, logApiRequest } from '@/utils/logger';
import { validatePostContent } from '@/utils/validators';
import { memoryStore } from '@/services/memory/store';
import { contextManager } from '@/services/memory/context-manager';

const logger = createServiceLogger('ContentGenerator');

class ContentGeneratorService {
    private static instance: ContentGeneratorService;
    private axiosInstance;

    private constructor() {
        this.axiosInstance = axios.create({
            baseURL: config.ai.baseUrl,
            timeout: REQUEST_TIMEOUTS.openRouter,
            headers: {
                ...DEFAULT_HEADERS.openRouter,
                'Authorization': `Bearer ${config.ai.apiKey}`
            }
        });

        // Request/Response interceptors
        this.axiosInstance.interceptors.request.use((config) => {
            logger.debug('AI API request', { model: config.data?.model, endpoint: config.url });
            return config;
        });

        this.axiosInstance.interceptors.response.use(
            (response) => {
                logApiRequest('openrouter', response.config.url || '',
                    response.config.method?.toUpperCase() || 'POST',
                    response.status);
                return response;
            },
            (error) => {
                logApiRequest('openrouter', error.config?.url || '',
                    error.config?.method?.toUpperCase() || 'POST',
                    error.response?.status);
                return Promise.reject(error);
            }
        );
    }

    public static getInstance(): ContentGeneratorService {
        if (!ContentGeneratorService.instance) {
            ContentGeneratorService.instance = new ContentGeneratorService();
        }
        return ContentGeneratorService.instance;
    }

    /**
     * Generate social media post from commits
     */
    public async generatePost(params: {
        commits: ProcessedCommit[];
        platform: SocialPlatform;
        tone?: PostTone;
        length?: PostLength;
    }): Promise<ApiResponse<PostContent | undefined>> {
        try {
            const { commits, platform, tone = 'professional', length = 'medium' } = params;

            if (commits.length === 0) {
                return createApiResponse(false, 'No commits provided', undefined, 'Cannot generate post without commits');
            }

            logger.info('Generating post content', {
                commitCount: commits.length,
                platform,
                tone,
                length
            });

            // Get context and recommendations
            const memory = memoryStore.getMemoryStore();
            const contextResult = await contextManager.analyzeCommitsForContext(commits);
            const context = contextResult.data || '';

            // Prepare commit summaries
            const commitSummaries = commits.map(commit =>
                `- ${commit.type}: ${commit.message} (${commit.category}, ${commit.significance})`
            );

            // Get recent topics to avoid repetition
            const recentPosts = memoryStore.getRecentPosts(7);
            const recentTopics = recentPosts.map(post =>
                this.extractTopicsFromContent(post.content)
            ).flat();

            // Get ongoing features for context
            const ongoingFeatures = memory.narrativeContext.ongoingFeatures
                .filter(f => f.status === 'in-progress' || f.status === 'testing')
                .map(f => f.name);

            // Generate content using AI
            const prompt = CONTENT_GENERATION_PROMPTS.generatePost({
                commits: commitSummaries,
                platform,
                tone,
                length,
                context,
                projectName: memory.projectContext.projectName,
                recentTopics: Array.from(new Set(recentTopics)),
                ongoingFeatures
            });

            const aiResponse = await this.callAI(prompt);
            if (!aiResponse.successful || !aiResponse.data) {
                return createApiResponse(false, 'AI content generation failed', undefined, aiResponse.error);
            }

            // Parse and validate generated content
            const parsedContent = this.parseAIResponse(aiResponse.data, platform);
            if (!parsedContent) {
                return createApiResponse(false, 'Failed to parse AI response', undefined, 'Invalid AI response format');
            }

            // Validate against platform requirements
            const validation = validatePostContent(parsedContent);
            if (!validation.successful || !validation.data) {
                return createApiResponse(false, 'Generated content validation failed', undefined, validation.error);
            }

            logger.info('Post content generated successfully', {
                contentLength: parsedContent.body.length,
                hashtagCount: parsedContent.hashtags.length
            });

            return createApiResponse(true, 'Post content generated', validation.data);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate post content', error);
            return createApiResponse(false, 'Content generation failed', undefined, errMsg);
        }
    }

    /**
     * Generate feature announcement post
     */
    public async generateFeatureAnnouncement(params: {
        featureName: string;
        description: string;
        benefits: string[];
        platform: SocialPlatform;
    }): Promise<ApiResponse<PostContent | undefined>> {
        try {
            const { featureName, description, benefits, platform } = params;
            const memory = memoryStore.getMemoryStore();

            logger.info('Generating feature announcement', { featureName, platform });

            const prompt = CONTENT_GENERATION_PROMPTS.announceFeature({
                featureName,
                description,
                platform,
                projectName: memory.projectContext.projectName,
                benefits
            });

            const aiResponse = await this.callAI(prompt);
            if (!aiResponse.successful || !aiResponse.data) {
                return createApiResponse(false, 'Feature announcement generation failed', undefined, aiResponse.error);
            }

            const parsedContent = this.parseAIResponse(aiResponse.data, platform);
            if (!parsedContent) {
                return createApiResponse(false, 'Failed to parse AI response', undefined, 'Invalid AI response format');
            }

            const validation = validatePostContent(parsedContent);
            if (!validation.successful || !validation.data) {
                return createApiResponse(false, 'Generated content validation failed', undefined, validation.error);
            }

            logger.info('Feature announcement generated successfully', { featureName });
            return createApiResponse(true, 'Feature announcement generated', validation.data);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate feature announcement', error);
            return createApiResponse(false, 'Feature announcement generation failed', undefined, errMsg);
        }
    }

    /**
     * Generate progress update post
     */
    public async generateProgressUpdate(params: {
        weeklyProgress: string[];
        challenges: string[];
        nextWeek: string[];
        platform: SocialPlatform;
    }): Promise<ApiResponse<PostContent | undefined>> {
        try {
            const memory = memoryStore.getMemoryStore();

            logger.info('Generating progress update', { platform: params.platform });

            const prompt = CONTENT_GENERATION_PROMPTS.progressUpdate({
                ...params,
                projectName: memory.projectContext.projectName
            });

            const aiResponse = await this.callAI(prompt);
            if (!aiResponse.successful || !aiResponse.data) {
                return createApiResponse(false, 'Progress update generation failed', undefined, aiResponse.error);
            }

            const parsedContent = this.parseAIResponse(aiResponse.data, params.platform);
            if (!parsedContent) {
                return createApiResponse(false, 'Failed to parse AI response', undefined, 'Invalid AI response format');
            }

            const validation = validatePostContent(parsedContent);
            if (!validation.successful || !validation.data) {
                return createApiResponse(false, 'Generated content validation failed', undefined, validation.error);
            }

            logger.info('Progress update generated successfully');
            return createApiResponse(true, 'Progress update generated', validation.data);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate progress update', error);
            return createApiResponse(false, 'Progress update generation failed', undefined, errMsg);
        }
    }

    /**
     * Call AI API with retry logic
     */
    private async callAI(prompt: string): Promise<ApiResponse<string | undefined>> {
        try {
            const response = await retry(
                () => this.axiosInstance.post('/chat/completions', {
                    model: config.ai.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional developer creating engaging social media content. Always respond with properly formatted content including hashtags.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7,
                    top_p: 0.9
                }),
                RETRY_CONFIG.maxRetries,
                RETRY_CONFIG.retryDelay,
                RETRY_CONFIG.backoffMultiplier
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                return createApiResponse(false, 'Empty AI response', undefined, 'AI returned empty content');
            }

            return createApiResponse(true, 'AI content generated', content.trim());
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    return createApiResponse(false, 'AI authentication failed', undefined, 'Invalid OpenRouter API key');
                }
                if (error.response?.status === 429) {
                    return createApiResponse(false, 'AI rate limit exceeded', undefined, 'Try again later');
                }
                if (error.response?.status === 400) {
                    return createApiResponse(false, 'Invalid AI request', undefined, 'Check model name and parameters');
                }
            }

            return createApiResponse(false, 'AI API call failed', undefined, errMsg);
        }
    }

    /**
     * Parse AI response into structured content
     */
    private parseAIResponse(aiResponse: string, platform: SocialPlatform): PostContent | null {
        try {
            const lines = aiResponse.split('\n').filter(line => line.trim());

            // Extract hashtags
            const hashtags = stringUtils.extractHashtags(aiResponse);

            // Remove hashtags from content for cleaner parsing
            const contentWithoutHashtags = stringUtils.removeHashtags(aiResponse);

            // Try to extract title and body
            let title = '';
            let body = contentWithoutHashtags.trim();

            // Look for title patterns
            const titleMatch = contentWithoutHashtags.match(/^(.+?)(?:\n\n|\n(?=[A-Z]))/);
            if (titleMatch && titleMatch[1] && titleMatch[1].length < 100) {
                title = titleMatch[1].trim();
                body = contentWithoutHashtags.replace(titleMatch[1], '').trim();
            } else {
                // Use first sentence as title if no clear title found
                const sentences = body.split(/[.!?]+/);
                if (sentences[0] && sentences[0].length < 100) {
                    title = sentences[0].trim() + '.';
                    body = sentences.slice(1).join('.').trim();
                } else {
                    title = body.substring(0, 50) + '...';
                }
            }

            // Add platform-appropriate hashtags if none found
            if (hashtags.length === 0) {
                const platformConfig = PLATFORM_SPECIFIC_ADJUSTMENTS[platform];
                const suggestedHashtags = this.selectRelevantHashtags(body, platformConfig.hashtagLimit);
                hashtags.push(...suggestedHashtags);
            }

            // Ensure platform limits
            const platformConfig = PLATFORM_SPECIFIC_ADJUSTMENTS[platform];
            if (body.length > platformConfig.maxLength) {
                body = stringUtils.truncate(body, platformConfig.maxLength - 50);
            }

            return {
                title: title || 'Development Update',
                body: body || aiResponse.trim(),
                hashtags: hashtags.slice(0, platformConfig.hashtagLimit),
                tone: platformConfig.preferredTone as PostTone,
                length: body.length > 500 ? 'long' : body.length > 200 ? 'medium' : 'short'
            };
        } catch (error) {
            logger.error('Failed to parse AI response', error, { response: aiResponse.substring(0, 200) });
            return null;
        }
    }

    /**
     * Select relevant hashtags based on content
     */
    private selectRelevantHashtags(content: string, limit: number): string[] {
        const lowerContent = content.toLowerCase();
        const selectedTags: string[] = [];

        // Always include general dev hashtags
        selectedTags.push(...HASHTAG_SUGGESTIONS.general.slice(0, 2));

        // Add specific hashtags based on content
        if (lowerContent.includes('frontend') || lowerContent.includes('react') || lowerContent.includes('ui')) {
            selectedTags.push(...HASHTAG_SUGGESTIONS.frontend.slice(0, 2));
        }

        if (lowerContent.includes('backend') || lowerContent.includes('api') || lowerContent.includes('server')) {
            selectedTags.push(...HASHTAG_SUGGESTIONS.backend.slice(0, 2));
        }

        if (lowerContent.includes('learn') || lowerContent.includes('journey') || lowerContent.includes('progress')) {
            selectedTags.push(...HASHTAG_SUGGESTIONS.learning.slice(0, 1));
        }

        // Remove duplicates and limit
        return Array.from(new Set(selectedTags)).slice(0, limit);
    }

    /**
     * Extract topics from content for avoiding repetition
     */
    private extractTopicsFromContent(content: string): string[] {
        const words = content.toLowerCase().split(/\s+/);
        const techTopics = ['api', 'database', 'frontend', 'backend', 'ui', 'auth', 'feature', 'bug', 'performance'];

        return words.filter(word =>
            techTopics.includes(word) ||
            word.startsWith('#')
        );
    }
}

export const contentGenerator = ContentGeneratorService.getInstance();
export default contentGenerator;