// src/services/memory/context-manager.ts

import { ProcessedCommit, OngoingFeature, ApiResponse, CommitCategory } from '@/types';
import { memoryStore } from './store';
import { createApiResponse, dateUtils, stringUtils } from '@/utils/helpers';
import { createServiceLogger } from '@/utils/logger';

const logger = createServiceLogger('ContextManager');

class ContextManagerService {
    private static instance: ContextManagerService;

    private constructor() { }

    public static getInstance(): ContextManagerService {
        if (!ContextManagerService.instance) {
            ContextManagerService.instance = new ContextManagerService();
        }
        return ContextManagerService.instance;
    }

    /**
     * Analyze commits and build narrative context
     */
    public async analyzeCommitsForContext(commits: ProcessedCommit[]): Promise<ApiResponse<string>> {
        try {
            const memory = memoryStore.getMemoryStore();

            // Group commits by category for better storytelling
            const commitsByCategory = this.groupCommitsByCategory(commits);

            // Update ongoing features
            await this.updateOngoingFeatures(commits);

            // Build narrative context
            const narrativeElements = this.buildNarrativeElements(commitsByCategory, memory);

            // Generate contextual story
            const story = this.generateContextualStory(narrativeElements, memory);

            logger.info('Context analysis completed', {
                commitCount: commits.length,
                categories: Object.keys(commitsByCategory)
            });

            return createApiResponse(true, 'Context analysis completed', story);
        } catch (error: unknown) {
            logger.error('Failed to analyze commits for context', error);
            const errMsg = error instanceof Error ? error : String(error);
            return createApiResponse(false, 'Context analysis failed', '', errMsg);
        }
    }

    /**
     * Get posting recommendations based on context
     */
    public getPostingRecommendations(): ApiResponse<{
        shouldPost: boolean;
        reason: string;
        suggestedTone: string;
        contextualHints: string[];
    }> {
        try {
            const memory = memoryStore.getMemoryStore();
            const recentPosts = memoryStore.getRecentPosts(3);

            // Analyze posting frequency
            const lastPostDate = memory.lastPostDate;
            const daysSincePost = lastPostDate ?
                Math.floor((Date.now() - new Date(lastPostDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;

            // Check for ongoing features that need updates
            const activeFeatures = memory.narrativeContext.ongoingFeatures.filter(
                feature => feature.status === 'in-progress' || feature.status === 'testing'
            );

            // Determine if we should post
            let shouldPost = true;
            let reason = 'Regular posting schedule';
            let suggestedTone = 'informative';
            const contextualHints: string[] = [];

            if (daysSincePost < 1) {
                shouldPost = false;
                reason = 'Posted recently, avoid spam';
            } else if (activeFeatures.length > 0) {
                reason = 'Ongoing feature updates available';
                suggestedTone = 'excited';
                if (activeFeatures[0]) {
                    contextualHints.push(`Continue story about: ${activeFeatures[0].name}`);
                }
            } else if (daysSincePost > 3) {
                reason = 'Overdue for posting';
                suggestedTone = 'casual';
                contextualHints.push('Catch up audience on recent progress');
            }

            // Add context-specific hints
            if (memory.narrativeContext.buildingUp.length > 0) {
                contextualHints.push(`Building anticipation for: ${memory.narrativeContext.buildingUp[0]}`);
            }

            if (recentPosts.length > 0) {
                const lastPost = recentPosts[0];
                if (lastPost && lastPost.content) {
                    contextualHints.push(`Reference previous post about: ${this.extractMainTopic(lastPost.content)}`);
                }
            }

            return createApiResponse(true, 'Posting recommendations generated', {
                shouldPost,
                reason,
                suggestedTone,
                contextualHints
            });
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error : String(error);
            logger.error('Failed to get posting recommendations', error);
            return createApiResponse(false, 'Failed to generate recommendations', {
                shouldPost: false,
                reason: 'Error in analysis',
                suggestedTone: 'professional',
                contextualHints: []
            }, errMsg);
        }
    }

    /**
     * Update ongoing features based on new commits
     */
    private async updateOngoingFeatures(commits: ProcessedCommit[]): Promise<void> {
        const memory = memoryStore.getMemoryStore();
        const features = [...memory.narrativeContext.ongoingFeatures];

        for (const commit of commits) {
            const featureName = this.extractFeatureName(commit);
            if (!featureName) continue;

            // Find existing feature or create new one
            let feature = features.find(f => f.name.toLowerCase() === featureName.toLowerCase());

            if (!feature) {
                feature = {
                    name: featureName,
                    startedAt: commit.date,
                    lastMentioned: commit.date,
                    commits: [commit.sha],
                    status: 'starting'
                };
                features.push(feature);
            } else {
                feature.lastMentioned = commit.date;
                feature.commits.push(commit.sha);

                // Update status based on commit type
                if (commit.type === 'test') {
                    feature.status = 'testing';
                } else if (commit.message.toLowerCase().includes('complete') ||
                    commit.message.toLowerCase().includes('finish')) {
                    feature.status = 'completed';
                } else {
                    feature.status = 'in-progress';
                }
            }
        }

        // Clean up old completed features
        const activeFeatures = features.filter(feature =>
            feature.status !== 'completed' ||
            dateUtils.isWithinDays(feature.lastMentioned, 7)
        );

        // Update memory
        await memoryStore.updateProjectContext({
            ...memory,
            // @ts-expect-error: narrativeContext is an extension to ProjectContext
            narrativeContext: {
                ...memory.narrativeContext,
                ongoingFeatures: activeFeatures
            }
        });
    }

    /**
     * Group commits by category for better storytelling
     */
    private groupCommitsByCategory(commits: ProcessedCommit[]): Record<CommitCategory, ProcessedCommit[]> {
        const grouped: Record<CommitCategory, ProcessedCommit[]> = {
            frontend: [],
            backend: [],
            database: [],
            api: [],
            ui: [],
            security: [],
            performance: [],
            configuration: [],
            general: []
        };

        commits.forEach(commit => {
            grouped[commit.category].push(commit);
        });

        return grouped;
    }

    /**
     * Build narrative elements from commits
     */
    private buildNarrativeElements(
        commitsByCategory: Record<CommitCategory, ProcessedCommit[]>,
        memory: any
    ): {
        mainFocus: CommitCategory | null;
        achievements: string[];
        progression: string[];
        techHighlights: string[];
    } {
        const elements = {
            mainFocus: null as CommitCategory | null,
            achievements: [] as string[],
            progression: [] as string[],
            techHighlights: [] as string[]
        };

        logger.debug('Building narrative elements from commits' + memory)
        // Find main focus (category with most significant commits)
        let maxScore = 0;
        for (const [category, commits] of Object.entries(commitsByCategory)) {
            if (commits.length === 0) continue;

            const score = commits.reduce((sum, commit) => {
                return sum + (commit.significance === 'major' ? 3 : commit.significance === 'minor' ? 2 : 1);
            }, 0);

            if (score > maxScore) {
                maxScore = score;
                elements.mainFocus = category as CommitCategory;
            }
        }

        // Extract achievements and progression
        Object.entries(commitsByCategory).forEach(([category, commits]) => {
            commits.forEach(commit => {
                if (commit.significance === 'major') {
                    elements.achievements.push(`${category}: ${commit.message}`);
                }

                if (commit.type === 'feature') {
                    elements.progression.push(`New ${category} feature: ${this.cleanCommitMessage(commit.message)}`);
                }
            });
        });

        // Add tech highlights
        if (commitsByCategory.performance.length > 0) {
            elements.techHighlights.push('performance optimizations');
        }
        if (commitsByCategory.security.length > 0) {
            elements.techHighlights.push('security enhancements');
        }

        return elements;
    }

    /**
     * Generate contextual story from narrative elements
     */
    private generateContextualStory(elements: any, memory: any): string {
        const parts = [];

        // Project context intro
        parts.push(`Working on ${memory.projectContext.projectName} - ${memory.projectContext.description}`);

        // Current phase
        parts.push(`Currently in ${memory.projectContext.currentPhase} phase`);

        // Main focus
        if (elements.mainFocus) {
            parts.push(`Main focus: ${elements.mainFocus} improvements`);
        }

        // Ongoing features
        const activeFeatures = memory.narrativeContext.ongoingFeatures
            .filter((f: OngoingFeature) => f.status === 'in-progress')
            .slice(0, 2);

        if (activeFeatures.length > 0) {
            parts.push(`Ongoing: ${activeFeatures.map((f: OngoingFeature) => f.name).join(', ')}`);
        }

        // Recent achievements
        if (elements.achievements.length > 0) {
            parts.push(`Recent achievements: ${elements.achievements.slice(0, 2).join(', ')}`);
        }

        return parts.join('. ') + '.';
    }

    /**
     * Extract feature name from commit
     */
    private extractFeatureName(commit: ProcessedCommit): string | null {
        const message = commit.message.toLowerCase();

        // Common patterns for feature names
        const patterns = [
            /(?:add|implement|create|build)\s+([a-z\s]+?)(?:\s|$)/,
            /^feat(?:\([^)]+\))?\s*:\s*([^$]+)/,
            /(?:new|added)\s+([a-z\s]+?)(?:\s|$)/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match?.[1]) {
                return stringUtils.capitalizeFirst(match[1].trim());
            }
        }

        return null;
    }

    /**
     * Clean commit message for display
     */
    private cleanCommitMessage(message: string): string {
        return message
            .replace(/^(feat|fix|docs|style|refactor|test|chore)(\(.+?\))?\s*:\s*/, '')
            .replace(/^\w+\s*:\s*/, '')
            .trim();
    }

    /**
     * Extract main topic from post content
     */
    private extractMainTopic(content: string): string {
        const words = content.toLowerCase().split(' ');
        const techWords = ['api', 'database', 'frontend', 'backend', 'ui', 'auth', 'user', 'feature'];

        for (const word of techWords) {
            if (words.includes(word)) {
                return word;
            }
        }

        return 'development';
    }
}

export const contextManager = ContextManagerService.getInstance();
export default contextManager;