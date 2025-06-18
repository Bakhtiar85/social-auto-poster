// src/app.ts

import dotenv from 'dotenv';
dotenv.config();

import { configManager } from '@/config';
import { validateEnv } from '@/utils/validators';
import { createServiceLogger } from '@/utils/logger';
import { memoryStore } from '@/services/memory/store';
import { contextManager } from '@/services/memory/context-manager';
import { githubCollector } from '@/services/github/collector';
import { githubParser } from '@/services/github/parser';
import { contentGenerator } from '@/services/ai/content-generator';
import { imageGenerator } from '@/services/ai/image-generator';
import { linkedinPublisher } from '@/services/social/linkedin';
import { facebookPublisher } from '@/services/social/facebook';
import { cronJobs } from '@/scheduler/cron-jobs';
import { generateId, createApiResponse } from '@/utils/helpers';
import { ProcessedCommit, PostHistory, SocialPlatform, ApiResponse } from '@/types';

const logger = createServiceLogger('Application');

class Application {
    private static instance: Application;
    private isInitialized: boolean = false;

    private constructor() { }

    public static getInstance(): Application {
        if (!Application.instance) {
            Application.instance = new Application();
        }
        return Application.instance;
    }

    /**
     * Initialize the application
     */
    public async initialize(): Promise<ApiResponse<boolean>> {
        try {
            logger.info('Starting Social Auto Poster application');

            // Validate environment variables
            const envValidation = validateEnv();
            if (!envValidation.successful) {
                return createApiResponse(false, 'Environment validation failed', false, envValidation.error);
            }

            // Validate configuration
            const configValidation = configManager.validateConfig();
            if (!configValidation.successful) {
                return createApiResponse(false, 'Configuration validation failed', false, configValidation.error);
            }

            // Initialize memory store
            const memoryInit = await memoryStore.initialize();
            if (!memoryInit.successful) {
                logger.warn('Memory store initialization failed, continuing with defaults', { error: memoryInit.error });
            }

            // Validate external services
            await this.validateExternalServices();

            // Start cron jobs
            const cronStart = await cronJobs.start();
            if (!cronStart.successful) {
                logger.warn('Cron jobs failed to start', { error: cronStart.error });
            }

            this.isInitialized = true;
            logger.info('Application initialized successfully');

            return createApiResponse(true, 'Application initialized successfully', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to initialize application', error);
            return createApiResponse(false, 'Application initialization failed', false, errMsg);
        }
    }

    /**
     * Main workflow: Process commits and create social posts
     */
    public async processCommitsAndPost(): Promise<ApiResponse<{
        commitsProcessed: number;
        postsCreated: number;
        errors: string[];
    } | undefined>> {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            logger.info('Starting commit processing workflow');
            const errors: string[] = [];
            let commitsProcessed = 0;
            let postsCreated = 0;

            // Step 1: Fetch commits from GitHub
            const commitsResult = await githubCollector.fetchDetailedCommits();
            if (!commitsResult.successful || !commitsResult.data) {
                logger.error('Failed to fetch commits', { error: commitsResult.error });
                errors.push(`GitHub fetch failed: ${commitsResult.error}`);
                return createApiResponse(false, 'Failed to fetch commits', { commitsProcessed, postsCreated, errors });
            }

            const rawCommits = commitsResult.data;
            if (rawCommits.length === 0) {
                logger.info('No new commits found');
                return createApiResponse(true, 'No new commits to process', { commitsProcessed, postsCreated, errors });
            }

            // Step 2: Parse and filter commits
            const parseResult = await githubParser.parseCommits(rawCommits);
            if (!parseResult.successful || !parseResult.data) {
                logger.error('Failed to parse commits', { error: parseResult.error });
                errors.push(`Commit parsing failed: ${parseResult.error}`);
                return createApiResponse(false, 'Failed to parse commits', { commitsProcessed, postsCreated, errors });
            }

            const processedCommits = parseResult.data;
            commitsProcessed = processedCommits.length;

            if (processedCommits.length === 0) {
                logger.info('No significant commits found after filtering');
                return createApiResponse(true, 'No significant commits to post', { commitsProcessed, postsCreated, errors });
            }

            // Step 3: Check if we should post based on context
            const recommendations = contextManager.getPostingRecommendations();
            if (!recommendations.successful || !recommendations.data?.shouldPost) {
                logger.info('Skipping post based on recommendations', { reason: recommendations.data?.reason });
                return createApiResponse(true, `Posting skipped: ${recommendations.data?.reason}`, { commitsProcessed, postsCreated, errors });
            }

            // Step 4: Filter commits that haven't been posted
            const lastPostedCommit = memoryStore.getLastPostedCommit();
            const newCommits = this.filterNewCommits(processedCommits, lastPostedCommit);

            if (newCommits.length === 0) {
                logger.info('All commits have already been posted');
                return createApiResponse(true, 'All commits already posted', { commitsProcessed, postsCreated, errors });
            }

            // Step 5: Generate content for each platform
            const platforms: SocialPlatform[] = ['linkedin', 'facebook'];

            for (const platform of platforms) {
                try {
                    const postResult = await this.createAndPublishPost(newCommits, platform);
                    if (postResult.successful) {
                        postsCreated++;
                    } else {
                        errors.push(`${platform}: ${postResult.error}`);
                    }
                } catch (error: unknown) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    logger.error(`Failed to process ${platform}`, error);
                    errors.push(`${platform}: ${errMsg}`);
                }
            }

            // Step 6: Update memory with latest commit
            if (newCommits.length > 0) {
                const latestCommit = newCommits[0]; // Assuming commits are sorted by date
                if (latestCommit) {
                    await memoryStore.updateMemoryStore({
                        lastPostedCommit: latestCommit.sha,
                        lastPostDate: new Date().toISOString()
                    });
                }
            }

            logger.info('Workflow completed', { commitsProcessed, postsCreated, errors: errors.length });

            return createApiResponse(true, 'Workflow completed', { commitsProcessed, postsCreated, errors });
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Workflow failed', error);
            return createApiResponse(false, 'Workflow failed', undefined, errMsg);
        }
    }

    /**
     * Create and publish post for a specific platform
     */
    private async createAndPublishPost(commits: ProcessedCommit[], platform: SocialPlatform): Promise<ApiResponse<boolean>> {
        try {
            logger.info(`Creating post for ${platform}`, { commitCount: commits.length });

            // Generate content
            const contentResult = await contentGenerator.generatePost({
                commits,
                platform,
                tone: platform === 'linkedin' ? 'professional' : 'casual',
                length: 'medium'
            });

            if (!contentResult.successful || !contentResult.data) {
                return createApiResponse(false, `Content generation failed for ${platform}`, false, contentResult.error);
            }

            const content = contentResult.data;

            // Generate image (optional)
            let imageUrl: string | undefined;
            try {
                const imageResult = await imageGenerator.generatePostImage({
                    topic: content.title,
                    style: 'tech'
                });
                if (imageResult.successful && imageResult.data) {
                    imageUrl = imageResult.data;
                }
            } catch (error) {
                logger.warn(`Image generation failed for ${platform}, continuing without image`, { error });
            }

            // Create social post object
            const socialPost = {
                platform,
                content: content.body,
                hashtags: content.hashtags,
                imageUrl: imageUrl ?? ''
            };

            // Publish to platform
            const publisher = platform === 'linkedin' ? linkedinPublisher : facebookPublisher;

            if (!publisher.isEnabled()) {
                return createApiResponse(false, `${platform} publisher not enabled`, false, 'Publisher not configured');
            }

            const publishResult = await publisher.publishPost(socialPost);
            if (!publishResult.successful || !publishResult.data) {
                return createApiResponse(false, `Publishing failed for ${platform}`, false, publishResult.error);
            }

            // Save to memory
            const postHistory: PostHistory = {
                id: generateId(),
                commitSha: commits[0]?.sha || '',
                platform,
                content: socialPost.content,
                imageUrl,
                postedAt: new Date().toISOString()
            };

            await memoryStore.savePost(postHistory);

            logger.info(`Successfully posted to ${platform}`, {
                postId: publishResult.data.postId,
                url: publishResult.data.url
            });

            return createApiResponse(true, `Posted successfully to ${platform}`, true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to create/publish post for ${platform}`, error);
            return createApiResponse(false, `Failed to post to ${platform}`, false, errMsg);
        }
    }

    /**
     * Filter commits that haven't been posted yet
     */
    private filterNewCommits(commits: ProcessedCommit[], lastPostedSha: string): ProcessedCommit[] {
        if (!lastPostedSha) {
            return commits; // If no previous posts, all commits are new
        }

        const lastPostedIndex = commits.findIndex(commit => commit.sha === lastPostedSha);
        if (lastPostedIndex === -1) {
            return commits; // If last posted commit not found, process all
        }

        return commits.slice(0, lastPostedIndex); // Return commits newer than last posted
    }

    /**
     * Validate external services
     */
    private async validateExternalServices(): Promise<void> {
        const validations = [
            { name: 'GitHub', fn: () => githubCollector.validateRepository() },
            { name: 'LinkedIn', fn: () => linkedinPublisher.validateToken() },
            { name: 'Facebook', fn: () => facebookPublisher.validateToken() }
        ];

        for (const validation of validations) {
            try {
                const result = await validation.fn();
                if (result.successful) {
                    logger.info(`${validation.name} validation successful`);
                } else {
                    logger.warn(`${validation.name} validation failed`, { error: result.error });
                }
            } catch (error) {
                logger.warn(`${validation.name} validation error`, { error });
            }
        }
    }

    /**
     * Graceful shutdown
     */
    public async shutdown(): Promise<void> {
        try {
            logger.info('Shutting down application');

            // Stop cron jobs
            await cronJobs.stop();

            // Create final backup
            await memoryStore.createBackup();

            logger.info('Application shutdown complete');
        } catch (error) {
            logger.error('Error during shutdown', error);
        }
    }

    /**
     * Manual trigger for testing
     */
    public async runOnce(): Promise<void> {
        logger.info('Manual run triggered');
        const result = await this.processCommitsAndPost();
        if (result.successful) {
            logger.info('Manual run completed successfully', result.data);
        } else {
            logger.error('Manual run failed', { error: result.error });
        }
    }
}

// Export singleton instance
export const app = Application.getInstance();

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');
    await app.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    await app.shutdown();
    process.exit(0);
});

// Start application if this file is run directly
if (require.main === module) {
    app.initialize().then((result) => {
        if (result.successful) {
            logger.info('Application started successfully');
            // Uncomment the next line to run once immediately for testing
            // app.runOnce();
        } else {
            logger.error('Failed to start application', { error: result.error });
            process.exit(1);
        }
    });
}

export default app;