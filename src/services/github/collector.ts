// src/services/github/collector.ts

import axios from 'axios';
import { GitHubCommit, ApiResponse } from '@/types';
import { config } from '@/config';
import { API_ENDPOINTS, DEFAULT_HEADERS, REQUEST_TIMEOUTS, RETRY_CONFIG } from '@/config/apis';
import { createApiResponse, retry, dateUtils } from '@/utils/helpers';
import { createServiceLogger, logApiRequest } from '@/utils/logger';
import { validateGitHubCommit } from '@/utils/validators';

const logger = createServiceLogger('GitHubCollector');

class GitHubCollectorService {
    private static instance: GitHubCollectorService;
    private axiosInstance;

    private constructor() {
        this.axiosInstance = axios.create({
            baseURL: API_ENDPOINTS.github.baseUrl,
            timeout: REQUEST_TIMEOUTS.github,
            headers: {
                ...DEFAULT_HEADERS.github,
                'Authorization': `Bearer ${config.github.token}`
            }
        });

        // Request interceptor for logging
        this.axiosInstance.interceptors.request.use((config) => {
            logger.debug('GitHub API request', {
                method: config.method?.toUpperCase(),
                url: config.url,
                params: config.params
            });
            return config;
        });

        // Response interceptor for logging
        this.axiosInstance.interceptors.response.use(
            (response) => {
                logApiRequest('github', response.config.url || '',
                    response.config.method?.toUpperCase() || 'GET',
                    response.status);
                return response;
            },
            (error) => {
                logApiRequest('github', error.config?.url || '',
                    error.config?.method?.toUpperCase() || 'GET',
                    error.response?.status);
                return Promise.reject(error);
            }
        );
    }

    public static getInstance(): GitHubCollectorService {
        if (!GitHubCollectorService.instance) {
            GitHubCollectorService.instance = new GitHubCollectorService();
        }
        return GitHubCollectorService.instance;
    }

    /**
     * Fetch commits from repository since yesterday
     */
    public async fetchRecentCommits(since?: string): Promise<ApiResponse<GitHubCommit[]>> {
        try {
            const sinceDate = since || dateUtils.getFromStart();
            const endpoint = API_ENDPOINTS.github.repos.commits(config.github.owner, config.github.repo);

            logger.info('Fetching commits from GitHub', {
                owner: config.github.owner,
                repo: config.github.repo,
                since: sinceDate
            });

            const response = await retry(
                () => this.axiosInstance.get<GitHubCommit[]>(endpoint, {
                    params: {
                        since: sinceDate,
                        per_page: 50,
                        author: config.github.owner // Only commits by repo owner
                    }
                }),
                RETRY_CONFIG.maxRetries,
                RETRY_CONFIG.retryDelay,
                RETRY_CONFIG.backoffMultiplier
            );

            const commits = response.data;
            logger.info('Commits fetched successfully', { count: commits.length });

            return createApiResponse(true, `Fetched ${commits.length} commits`, commits);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to fetch commits', error);

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    return createApiResponse(false, 'GitHub authentication failed', [], 'Invalid GitHub token');
                }
                if (error.response?.status === 404) {
                    return createApiResponse(false, 'Repository not found', [], 'Check repository owner and name');
                }
                if (error.response?.status === 403) {
                    return createApiResponse(false, 'GitHub rate limit exceeded', [], 'Try again later');
                }
            }

            return createApiResponse(false, 'Failed to fetch commits', [], errMsg);
        }
    }

    /**
     * Fetch detailed commit information including file changes
     */
    public async fetchCommitDetails(sha: string): Promise<ApiResponse<GitHubCommit | undefined>> {
        try {
            const endpoint = API_ENDPOINTS.github.repos.commitDetails(
                config.github.owner,
                config.github.repo,
                sha
            );

            logger.debug('Fetching commit details', { sha });

            const response = await retry(
                () => this.axiosInstance.get<GitHubCommit>(endpoint),
                RETRY_CONFIG.maxRetries,
                RETRY_CONFIG.retryDelay,
                RETRY_CONFIG.backoffMultiplier
            );

            const commit = response.data;

            // Validate commit data
            const validation = validateGitHubCommit(commit);
            if (!validation.successful) {
                return createApiResponse(false, 'Invalid commit data', undefined, validation.error);
            }

            logger.debug('Commit details fetched', { sha, filesChanged: commit.files?.length || 0 });

            return createApiResponse(true, 'Commit details fetched', commit);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to fetch commit details', error, { sha });
            return createApiResponse(false, 'Failed to fetch commit details', undefined, errMsg);
        }
    }

    /**
     * Fetch commits with detailed information (files, stats, etc.)
     */
    public async fetchDetailedCommits(since?: string): Promise<ApiResponse<GitHubCommit[]>> {
        try {
            // First, get the list of commits
            const commitsResult = await this.fetchRecentCommits(since);
            if (!commitsResult.successful || !commitsResult.data) {
                return commitsResult;
            }

            const commits = commitsResult.data;
            logger.info(`Fetched ${commits.length} commits, starting to fetch details`);
            if (commits.length === 0) {
                return createApiResponse(true, 'No commits found', []);
            }

            // Fetch detailed information for each commit
            const detailedCommits: GitHubCommit[] = [];
            const maxConcurrent = 5; // Avoid overwhelming GitHub API

            for (let i = 0; i < commits.length; i += maxConcurrent) {
                const batch = commits.slice(i, i + maxConcurrent);

                const detailPromises = batch.map(commit =>
                    this.fetchCommitDetails(commit.sha)
                );

                const results = await Promise.allSettled(detailPromises);

                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value.successful && result.value.data) {
                        detailedCommits.push(result.value.data);
                    } else {
                        logger.warn('Failed to fetch details for commit', {
                            sha: batch[index]?.sha,
                            error: result.status === 'rejected' ? result.reason : 'Unknown error'
                        });
                        // Include basic commit info even if details failed
                        if (batch[index]) {
                            detailedCommits.push(batch[index] as GitHubCommit);
                        }
                    }
                });

                // Rate limiting: small delay between batches
                if (i + maxConcurrent < commits.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            logger.info('Detailed commits fetched', {
                total: commits.length,
                detailed: detailedCommits.length
            });

            return createApiResponse(true, `Fetched ${detailedCommits.length} detailed commits`, detailedCommits);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to fetch detailed commits', error);
            return createApiResponse(false, 'Failed to fetch detailed commits', [], errMsg);
        }
    }

    /**
     * Check if repository is accessible
     */
    public async validateRepository(): Promise<ApiResponse<boolean>> {
        try {
            const endpoint = API_ENDPOINTS.github.repos.repo(config.github.owner, config.github.repo);

            logger.info('Validating repository access', {
                owner: config.github.owner,
                repo: config.github.repo
            });

            await this.axiosInstance.get(endpoint);

            logger.info('Repository validation successful');
            return createApiResponse(true, 'Repository is accessible', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Repository validation failed', error);

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 404) {
                    return createApiResponse(false, 'Repository not found', false, 'Check repository owner and name');
                }
                if (error.response?.status === 401) {
                    return createApiResponse(false, 'Authentication failed', false, 'Invalid GitHub token');
                }
            }

            return createApiResponse(false, 'Repository validation failed', false, errMsg);
        }
    }

    /**
     * Get repository information
     */
    public async getRepositoryInfo(): Promise<ApiResponse<{
        name: string;
        description: string;
        language: string;
        stars: number;
        forks: number;
    }>> {
        try {
            const endpoint = API_ENDPOINTS.github.repos.repo(config.github.owner, config.github.repo);

            const response = await this.axiosInstance.get(endpoint);
            const repo = response.data;

            const repoInfo = {
                name: repo.name,
                description: repo.description || '',
                language: repo.language || 'Unknown',
                stars: repo.stargazers_count || 0,
                forks: repo.forks_count || 0
            };

            logger.info('Repository info fetched', repoInfo);
            return createApiResponse(true, 'Repository info fetched', repoInfo);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to fetch repository info', error);
            return createApiResponse(false, 'Failed to fetch repository info', {
                name: '',
                description: '',
                language: '',
                stars: 0,
                forks: 0
            }, errMsg);
        }
    }
}

export const githubCollector = GitHubCollectorService.getInstance();
export default githubCollector;