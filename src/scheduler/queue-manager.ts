// src/scheduler/queue-manager.ts

import { createServiceLogger } from '@/utils/logger';
import { createApiResponse, generateId } from '@/utils/helpers';
import { ApiResponse } from '@/types';
import { app } from '@/app';
import { memoryStore } from '@/services/memory/store';
import { githubCollector } from '@/services/github/collector';
import { linkedinPublisher } from '@/services/social/linkedin';
import { facebookPublisher } from '@/services/social/facebook';

const logger = createServiceLogger('QueueManager');

interface QueueJob {
    id: string;
    type: string;
    priority: 'high' | 'medium' | 'low';
    data: any;
    createdAt: string;
    attempts: number;
    maxAttempts: number;
    nextRetry?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string | undefined;
}

class QueueManagerService {
    private static instance: QueueManagerService;
    private queue: QueueJob[] = [];
    private isProcessing: boolean = false;
    private processingInterval: NodeJS.Timeout | null = null;

    private constructor() { }

    public static getInstance(): QueueManagerService {
        if (!QueueManagerService.instance) {
            QueueManagerService.instance = new QueueManagerService();
        }
        return QueueManagerService.instance;
    }

    /**
     * Start queue processing
     */
    public async start(): Promise<ApiResponse<boolean>> {
        try {
            if (this.isProcessing) {
                return createApiResponse(true, 'Queue manager already running', true);
            }

            logger.info('Starting queue manager');
            this.isProcessing = true;

            // Process queue every 30 seconds
            this.processingInterval = setInterval(() => {
                this.processQueue().catch(error => {
                    logger.error('Queue processing error', error);
                });
            }, 30000);

            // Process immediately
            await this.processQueue();

            logger.info('Queue manager started successfully');
            return createApiResponse(true, 'Queue manager started', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to start queue manager', error);
            return createApiResponse(false, 'Failed to start queue manager', false, errMsg);
        }
    }

    /**
     * Stop queue processing
     */
    public async stop(): Promise<ApiResponse<boolean>> {
        try {
            logger.info('Stopping queue manager');

            if (this.processingInterval) {
                clearInterval(this.processingInterval);
                this.processingInterval = null;
            }

            this.isProcessing = false;

            logger.info('Queue manager stopped successfully');
            return createApiResponse(true, 'Queue manager stopped', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to stop queue manager', error);
            return createApiResponse(false, 'Failed to stop queue manager', false, errMsg);
        }
    }

    /**
     * Add job to queue
     */
    public async addJob(type: string, jobData: {
        type: string;
        priority: 'high' | 'medium' | 'low';
        data: any;
        maxAttempts?: number;
    }): Promise<ApiResponse<string>> {
        try {
            const job: QueueJob = {
                id: generateId(),
                type,
                priority: jobData.priority,
                data: jobData.data,
                createdAt: new Date().toISOString(),
                attempts: 0,
                maxAttempts: jobData.maxAttempts || 3,
                status: 'pending'
            };

            // Insert job based on priority
            const insertIndex = this.findInsertPosition(job.priority);
            this.queue.splice(insertIndex, 0, job);

            logger.info('Job added to queue', {
                jobId: job.id,
                type: job.type,
                priority: job.priority,
                queueLength: this.queue.length
            });

            // Process immediately if high priority
            if (job.priority === 'high' && this.isProcessing) {
                setImmediate(() => this.processQueue());
            }

            return createApiResponse(true, 'Job added to queue', job.id);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to add job to queue', error);
            return createApiResponse(false, 'Failed to add job', '', errMsg);
        }
    }

    /**
     * Get queue status
     */
    public getQueueStatus(): {
        totalJobs: number;
        pendingJobs: number;
        processingJobs: number;
        completedJobs: number;
        failedJobs: number;
        isProcessing: boolean;
    } {
        return {
            totalJobs: this.queue.length,
            pendingJobs: this.queue.filter(j => j.status === 'pending').length,
            processingJobs: this.queue.filter(j => j.status === 'processing').length,
            completedJobs: this.queue.filter(j => j.status === 'completed').length,
            failedJobs: this.queue.filter(j => j.status === 'failed').length,
            isProcessing: this.isProcessing
        };
    }

    /**
     * Process queue
     */
    private async processQueue(): Promise<void> {
        if (!this.isProcessing || this.queue.length === 0) {
            return;
        }

        // Find next job to process
        const nextJob = this.queue.find(job =>
            job.status === 'pending' &&
            (!job.nextRetry || new Date(job.nextRetry) <= new Date())
        );

        if (!nextJob) {
            return;
        }

        // Mark job as processing
        nextJob.status = 'processing';
        nextJob.attempts++;

        logger.info('Processing job', {
            jobId: nextJob.id,
            type: nextJob.type,
            attempt: nextJob.attempts
        });

        try {
            const result = await this.executeJob(nextJob);

            if (result.successful) {
                nextJob.status = 'completed';
                logger.info('Job completed successfully', { jobId: nextJob.id, type: nextJob.type });
            } else {
                await this.handleJobFailure(nextJob, result.error || 'Unknown error');
            }
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            await this.handleJobFailure(nextJob, errMsg);
        }

        // Clean up old completed/failed jobs (keep last 100)
        this.cleanupOldJobs();
    }

    /**
     * Execute a specific job
     */
    private async executeJob(job: QueueJob): Promise<ApiResponse<any>> {
        switch (job.type) {
            case 'main-posting':
                return await this.executeMainPostingJob(job);

            case 'health-check':
                return await this.executeHealthCheckJob(job);

            case 'cleanup':
                return await this.executeCleanupJob(job);

            case 'backup':
                return await this.executeBackupJob(job);

            default:
                return createApiResponse(false, `Unknown job type: ${job.type}`, null, 'Job type not supported');
        }
    }

    /**
     * Execute main posting job
     */
    private async executeMainPostingJob(job: QueueJob): Promise<ApiResponse<any>> {
        try {
            logger.info('Executing main posting job', { jobId: job.id });

            const result = await app.processCommitsAndPost();

            if (result.successful) {
                logger.info('Main posting job completed', {
                    jobId: job.id,
                    commitsProcessed: result.data?.commitsProcessed,
                    postsCreated: result.data?.postsCreated,
                    errors: result.data?.errors?.length || 0
                });
            }

            return result;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return createApiResponse(false, 'Main posting job failed', null, errMsg);
        }
    }

    /**
     * Execute health check job
     */
    private async executeHealthCheckJob(job: QueueJob): Promise<ApiResponse<any>> {
        try {
            logger.info('Executing health check job', { jobId: job.id });

            const healthChecks = [
                { name: 'GitHub', check: () => githubCollector.validateRepository() },
                { name: 'LinkedIn', check: () => linkedinPublisher.validateToken() },
                { name: 'Facebook', check: () => facebookPublisher.validateToken() }
            ];

            const results = [];

            for (const healthCheck of healthChecks) {
                try {
                    const result = await healthCheck.check();
                    results.push({
                        service: healthCheck.name,
                        status: result.successful ? 'healthy' : 'unhealthy',
                        error: result.error || null
                    });
                } catch (error) {
                    results.push({
                        service: healthCheck.name,
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            logger.info('Health check completed', {
                jobId: job.id,
                results: results.map(r => ({ service: r.service, status: r.status }))
            });

            return createApiResponse(true, 'Health check completed', results);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return createApiResponse(false, 'Health check failed', null, errMsg);
        }
    }

    /**
     * Execute cleanup job
     */
    private async executeCleanupJob(job: QueueJob): Promise<ApiResponse<any>> {
        try {
            logger.info('Executing cleanup job', { jobId: job.id });

            const cleanupTasks = [
                'Clean old queue jobs',
                'Clean old log files',
                'Clean old memory backups'
            ];

            // Clean old queue jobs
            const oldJobs = this.queue.filter(j =>
                (j.status === 'completed' || j.status === 'failed') &&
                new Date(j.createdAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days old
            );

            this.queue = this.queue.filter(j => !oldJobs.includes(j));

            logger.info('Cleanup completed', {
                jobId: job.id,
                oldJobsRemoved: oldJobs.length,
                tasksCompleted: cleanupTasks.length
            });

            return createApiResponse(true, 'Cleanup completed', {
                tasksCompleted: cleanupTasks.length,
                oldJobsRemoved: oldJobs.length
            });
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return createApiResponse(false, 'Cleanup failed', null, errMsg);
        }
    }

    /**
     * Execute backup job
     */
    private async executeBackupJob(job: QueueJob): Promise<ApiResponse<any>> {
        try {
            logger.info('Executing backup job', { jobId: job.id });

            const backupResult = await memoryStore.createBackup();

            if (backupResult.successful) {
                logger.info('Backup job completed', {
                    jobId: job.id,
                    backupPath: backupResult.data
                });
            }

            return backupResult;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return createApiResponse(false, 'Backup job failed', null, errMsg);
        }
    }

    /**
     * Handle job failure
     */
    private async handleJobFailure(job: QueueJob, error?: string | Error): Promise<void> {
        job.error = error instanceof Error ? error.message : error;

        if (job.attempts >= job.maxAttempts) {
            job.status = 'failed';
            logger.error('Job failed after maximum attempts', {
                jobId: job.id,
                type: job.type,
                attempts: job.attempts,
                error: job.error
            });
        } else {
            job.status = 'pending';
            // Exponential backoff: 1min, 2min, 4min, etc.
            const delay = Math.pow(2, job.attempts) * 60 * 1000;
            job.nextRetry = new Date(Date.now() + delay).toISOString();

            logger.warn('Job failed, will retry', {
                jobId: job.id,
                type: job.type,
                attempts: job.attempts,
                nextRetry: job.nextRetry,
                error: job.error
            });
        }
    }

    /**
     * Find insert position based on priority
     */
    private findInsertPosition(priority: 'high' | 'medium' | 'low'): number {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const jobPriority = priorityOrder[priority];

        for (let i = 0; i < this.queue.length; i++) {
            const queueJobPriority = priorityOrder[this.queue[i]?.priority || 'low'];
            if (jobPriority > queueJobPriority) {
                return i;
            }
        }

        return this.queue.length;
    }

    /**
     * Clean up old jobs
     */
    private cleanupOldJobs(): void {
        const maxJobs = 100;
        if (this.queue.length <= maxJobs) {
            return;
        }

        // Keep recent jobs and failed jobs for debugging
        const jobsToKeep = this.queue.filter(job =>
            job.status === 'pending' ||
            job.status === 'processing' ||
            (job.status === 'failed') ||
            (job.status === 'completed' && new Date(job.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000))
        );

        // If still too many, keep only the most recent
        if (jobsToKeep.length > maxJobs) {
            jobsToKeep.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            this.queue = jobsToKeep.slice(0, maxJobs);
        } else {
            this.queue = jobsToKeep;
        }
    }

    /**
     * Get job details
     */
    public getJob(jobId: string): QueueJob | undefined {
        return this.queue.find(job => job.id === jobId);
    }

    /**
     * Get recent jobs
     */
    public getRecentJobs(limit: number = 20): QueueJob[] {
        return this.queue
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);
    }

    /**
     * Cancel a pending job
     */
    public cancelJob(jobId: string): ApiResponse<boolean> {
        const job = this.queue.find(j => j.id === jobId);

        if (!job) {
            return createApiResponse(false, 'Job not found', false, 'Job ID does not exist');
        }

        if (job.status === 'processing') {
            return createApiResponse(false, 'Cannot cancel processing job', false, 'Job is currently being processed');
        }

        if (job.status === 'completed' || job.status === 'failed') {
            return createApiResponse(false, 'Job already finished', false, 'Job has already completed or failed');
        }

        this.queue = this.queue.filter(j => j.id !== jobId);
        logger.info('Job cancelled', { jobId, type: job.type });

        return createApiResponse(true, 'Job cancelled successfully', true);
    }
}

export const queueManager = QueueManagerService.getInstance();
export default queueManager;