// src/services/github/parser.ts

import { GitHubCommit, ProcessedCommit, CommitType, CommitCategory, CommitGroup, ApiResponse } from '@/types';
import { createApiResponse, stringUtils } from '@/utils/helpers';
import { createServiceLogger } from '@/utils/logger';
import { VALIDATION_RULES } from '@/config/database';

const logger = createServiceLogger('GitHubParser');

class GitHubParserService {
    private static instance: GitHubParserService;

    private constructor() { }

    public static getInstance(): GitHubParserService {
        if (!GitHubParserService.instance) {
            GitHubParserService.instance = new GitHubParserService();
        }
        return GitHubParserService.instance;
    }

    /**
     * Parse and process GitHub commits
     */
    public async parseCommits(commits: GitHubCommit[]): Promise<ApiResponse<ProcessedCommit[]>> {
        try {
            logger.info('Parsing commits', { count: commits.length });

            const processedCommits: ProcessedCommit[] = [];

            for (const commit of commits) {
                const processed = this.processCommit(commit);
                if (processed) {
                    processedCommits.push(processed);
                }
            }

            // Filter out insignificant commits
            const significantCommits = this.filterSignificantCommits(processedCommits);

            logger.info('Commits parsed successfully', {
                total: commits.length,
                processed: processedCommits.length,
                significant: significantCommits.length
            });

            return createApiResponse(true, `Parsed ${significantCommits.length} significant commits`, significantCommits);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to parse commits', error);
            return createApiResponse(false, 'Failed to parse commits', [], errMsg);
        }
    }

    /**
     * Group processed commits by category and impact
     */
    public groupCommitsByImpact(commits: ProcessedCommit[]): ApiResponse<CommitGroup[]> {
        try {
            const groups: Map<CommitCategory, ProcessedCommit[]> = new Map();

            // Group by category
            commits.forEach(commit => {
                if (!groups.has(commit.category)) {
                    groups.set(commit.category, []);
                }
                groups.get(commit.category)?.push(commit);
            });

            // Convert to CommitGroup array with impact analysis
            const commitGroups: CommitGroup[] = [];

            groups.forEach((groupCommits, category) => {
                if (groupCommits.length === 0) return;

                const impact = this.calculateGroupImpact(groupCommits);
                const summary = this.generateGroupSummary(category, groupCommits);

                commitGroups.push({
                    category,
                    commits: groupCommits,
                    impact,
                    summary
                });
            });

            // Sort by impact (high -> medium -> low)
            commitGroups.sort((a, b) => {
                const impactOrder = { high: 3, medium: 2, low: 1 };
                return impactOrder[b.impact] - impactOrder[a.impact];
            });

            logger.info('Commits grouped by impact', {
                groups: commitGroups.length,
                categories: commitGroups.map(g => g.category)
            });

            return createApiResponse(true, 'Commits grouped successfully', commitGroups);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to group commits', error);
            return createApiResponse(false, 'Failed to group commits', [], errMsg);
        }
    }

    /**
     * Process a single commit
     */
    private processCommit(commit: GitHubCommit): ProcessedCommit | null {
        try {
            const message = commit.commit.message.trim();

            // Skip commits that should be ignored
            if (this.shouldIgnoreCommit(commit)) {
                logger.debug('Ignoring commit', { sha: commit.sha, message: message.substring(0, 50) });
                return null;
            }

            const type = this.determineCommitType(message);
            const category = this.determineCommitCategory(message, commit.files);
            const significance = this.determineSignificance(commit, type);

            const processed: ProcessedCommit = {
                sha: commit.sha,
                message: this.cleanCommitMessage(message),
                author: commit.commit.author.name,
                date: commit.commit.author.date,
                filesChanged: commit.files?.length || 0,
                additions: commit.stats?.additions || 0,
                deletions: commit.stats?.deletions || 0,
                type,
                category,
                significance
            };

            return processed;
        } catch (error) {
            logger.warn('Failed to process commit', { sha: commit.sha, error });
            return null;
        }
    }

    /**
     * Determine if commit should be ignored
     */
    private shouldIgnoreCommit(commit: GitHubCommit): boolean {
        const message = commit.commit.message.toLowerCase();

        // Ignore merge commits
        if (message.startsWith('merge') || commit.parents?.length > 1) {
            return true;
        }

        // Ignore commits with only ignored file types
        if (commit.files) {
            const nonIgnoredFiles = commit.files.filter(file =>
                !VALIDATION_RULES.commit.ignorePaths.some(ignored =>
                    file.filename.includes(ignored)
                )
            );
            if (nonIgnoredFiles.length === 0) {
                return true;
            }
        }

        // Ignore very small commits (likely formatting/typos)
        if (commit.stats && commit.stats.total < 5 && !message.includes('fix')) {
            return true;
        }

        return false;
    }

    /**
     * Determine commit type from message
     */
    private determineCommitType(message: string): CommitType {
        const lowerMessage = message.toLowerCase();

        // Conventional commit patterns
        if (lowerMessage.match(/^feat(\(.+\))?:/)) return 'feature';
        if (lowerMessage.match(/^fix(\(.+\))?:/)) return 'fix';
        if (lowerMessage.match(/^docs(\(.+\))?:/)) return 'docs';
        if (lowerMessage.match(/^style(\(.+\))?:/)) return 'style';
        if (lowerMessage.match(/^refactor(\(.+\))?:/)) return 'refactor';
        if (lowerMessage.match(/^test(\(.+\))?:/)) return 'test';
        if (lowerMessage.match(/^chore(\(.+\))?:/)) return 'chore';

        // Keyword-based detection
        if (lowerMessage.includes('add') || lowerMessage.includes('implement') ||
            lowerMessage.includes('create') || lowerMessage.includes('new')) {
            return 'feature';
        }

        if (lowerMessage.includes('fix') || lowerMessage.includes('bug') ||
            lowerMessage.includes('error') || lowerMessage.includes('issue')) {
            return 'fix';
        }

        if (lowerMessage.includes('refactor') || lowerMessage.includes('restructure') ||
            lowerMessage.includes('reorganize')) {
            return 'refactor';
        }

        if (lowerMessage.includes('test') || lowerMessage.includes('spec')) {
            return 'test';
        }

        if (lowerMessage.includes('update') || lowerMessage.includes('improve') ||
            lowerMessage.includes('enhance')) {
            return 'refactor';
        }

        return 'other';
    }

    /**
     * Determine commit category from message and files
     */
    private determineCommitCategory(message: string, files?: any[]): CommitCategory {
        const lowerMessage = message.toLowerCase();

        // Check file paths first (more reliable)
        if (files && files.length > 0) {
            const filePaths = files.map(f => f.filename.toLowerCase());

            if (filePaths.some(path => path.includes('frontend') || path.includes('client') ||
                path.includes('components') || path.includes('pages'))) {
                return 'frontend';
            }

            if (filePaths.some(path => path.includes('backend') || path.includes('server') ||
                path.includes('api') || path.includes('routes'))) {
                return 'backend';
            }

            if (filePaths.some(path => path.includes('database') || path.includes('db') ||
                path.includes('migration') || path.includes('schema'))) {
                return 'database';
            }

            if (filePaths.some(path => path.includes('api') || path.endsWith('.api.ts') ||
                path.includes('endpoints'))) {
                return 'api';
            }

            if (filePaths.some(path => path.includes('ui') || path.includes('style') ||
                path.includes('.css') || path.includes('.scss'))) {
                return 'ui';
            }

            if (filePaths.some(path => path.includes('auth') || path.includes('security') ||
                path.includes('permission'))) {
                return 'security';
            }

            if (filePaths.some(path => path.includes('config') || path.includes('env') ||
                path.includes('docker') || path.includes('deploy'))) {
                return 'configuration';
            }
        }

        // Fallback to message keywords
        if (lowerMessage.includes('frontend') || lowerMessage.includes('client') ||
            lowerMessage.includes('react') || lowerMessage.includes('vue')) {
            return 'frontend';
        }

        if (lowerMessage.includes('backend') || lowerMessage.includes('server') ||
            lowerMessage.includes('node') || lowerMessage.includes('express')) {
            return 'backend';
        }

        if (lowerMessage.includes('database') || lowerMessage.includes('db') ||
            lowerMessage.includes('sql') || lowerMessage.includes('mongo')) {
            return 'database';
        }

        if (lowerMessage.includes('api') || lowerMessage.includes('endpoint') ||
            lowerMessage.includes('route')) {
            return 'api';
        }

        if (lowerMessage.includes('ui') || lowerMessage.includes('interface') ||
            lowerMessage.includes('design') || lowerMessage.includes('style')) {
            return 'ui';
        }

        if (lowerMessage.includes('auth') || lowerMessage.includes('security') ||
            lowerMessage.includes('login') || lowerMessage.includes('permission')) {
            return 'security';
        }

        if (lowerMessage.includes('performance') || lowerMessage.includes('optimize') ||
            lowerMessage.includes('speed') || lowerMessage.includes('cache')) {
            return 'performance';
        }

        if (lowerMessage.includes('config') || lowerMessage.includes('setup') ||
            lowerMessage.includes('deploy') || lowerMessage.includes('build')) {
            return 'configuration';
        }

        return 'general';
    }

    /**
     * Determine commit significance
     */
    private determineSignificance(commit: GitHubCommit, type: CommitType): 'major' | 'minor' | 'patch' {
        const message = commit.commit.message.toLowerCase();
        const stats = commit.stats;

        // Major significance indicators
        if (type === 'feature' && (stats?.total || 0) > 100) return 'major';
        if (message.includes('breaking') || message.includes('major')) return 'major';
        if (message.includes('release') || message.includes('version')) return 'major';
        if ((stats?.total || 0) > 200) return 'major';

        // Minor significance indicators
        if (type === 'feature') return 'minor';
        if (type === 'fix' && (stats?.total || 0) > 50) return 'minor';
        if (message.includes('improve') || message.includes('enhance')) return 'minor';
        if ((stats?.total || 0) > 50) return 'minor';

        return 'patch';
    }

    /**
     * Filter out insignificant commits
     */
    private filterSignificantCommits(commits: ProcessedCommit[]): ProcessedCommit[] {
        return commits.filter(commit => {
            // Always include major and minor changes
            if (commit.significance === 'major' || commit.significance === 'minor') {
                return true;
            }

            // For patch changes, be more selective
            if (commit.type === 'fix' || commit.type === 'feature') {
                return true;
            }

            // Include if it affects multiple files
            if (commit.filesChanged > 3) {
                return true;
            }

            return false;
        });
    }

    /**
     * Calculate impact of a commit group
     */
    private calculateGroupImpact(commits: ProcessedCommit[]): 'high' | 'medium' | 'low' {
        const majorCount = commits.filter(c => c.significance === 'major').length;
        const minorCount = commits.filter(c => c.significance === 'minor').length;
        const totalChanges = commits.reduce((sum, c) => sum + c.additions + c.deletions, 0);

        if (majorCount > 0 || totalChanges > 500) return 'high';
        if (minorCount > 1 || totalChanges > 100) return 'medium';
        return 'low';
    }

    /**
     * Generate summary for commit group
     */
    private generateGroupSummary(category: CommitCategory, commits: ProcessedCommit[]): string {
        const types = commits.map(c => c.type);
        const featureCount = types.filter(t => t === 'feature').length;
        const fixCount = types.filter(t => t === 'fix').length;

        const parts = [];
        if (featureCount > 0) parts.push(`${featureCount} new feature${featureCount > 1 ? 's' : ''}`);
        if (fixCount > 0) parts.push(`${fixCount} bug fix${fixCount > 1 ? 'es' : ''}`);

        if (parts.length === 0) {
            parts.push(`${commits.length} update${commits.length > 1 ? 's' : ''}`);
        }

        return `${stringUtils.capitalizeFirst(category)}: ${parts.join(' and ')}`;
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
}

export const githubParser = GitHubParserService.getInstance();
export default githubParser;