// src/scheduler/cron-jobs.ts

import cron from 'node-cron';
import { config } from '@/config';
import { createServiceLogger } from '@/utils/logger';
import { createApiResponse } from '@/utils/helpers';
import { ApiResponse } from '@/types';
import { memoryStore } from '@/services/memory/store';
import { queueManager } from './queue-manager';

const logger = createServiceLogger('CronJobs');

interface JobInfo {
    name: string;
    schedule: string;
    task: cron.ScheduledTask | null;
    lastRun?: string;
}

class CronJobsService {
    private static instance: CronJobsService;
    private jobs: Map<string, JobInfo> = new Map();
    private isRunning: boolean = false;

    private constructor() { }

    public static getInstance(): CronJobsService {
        if (!CronJobsService.instance) {
            CronJobsService.instance = new CronJobsService();
        }
        return CronJobsService.instance;
    }

    /**
     * Start all cron jobs
     */
    public async start(): Promise<ApiResponse<boolean>> {
        try {
            if (this.isRunning) {
                return createApiResponse(true, 'Cron jobs already running', true);
            }

            logger.info('Starting cron jobs');

            // Initialize job definitions
            this.initializeJobs();

            // Start all jobs
            this.startAllJobs();

            this.isRunning = true;
            logger.info('All cron jobs started successfully', {
                totalJobs: this.jobs.size,
                mainSchedule: config.app.cronSchedule
            });

            return createApiResponse(true, 'Cron jobs started successfully', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to start cron jobs', error);
            return createApiResponse(false, 'Failed to start cron jobs', false, errMsg);
        }
    }

    /**
     * Stop all cron jobs
     */
    public async stop(): Promise<ApiResponse<boolean>> {
        try {
            logger.info('Stopping cron jobs');

            // Stop all scheduled jobs
            this.jobs.forEach((jobInfo, name) => {
                if (jobInfo.task) {
                    jobInfo.task.stop();
                    jobInfo.task = null;
                    logger.debug(`Stopped cron job: ${name}`);
                }
            });

            this.isRunning = false;

            logger.info('All cron jobs stopped successfully');
            return createApiResponse(true, 'Cron jobs stopped successfully', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to stop cron jobs', error);
            return createApiResponse(false, 'Failed to stop cron jobs', false, errMsg);
        }
    }

    /**
     * Get status of all cron jobs
     */
    public getStatus(): {
        isRunning: boolean;
        jobs: Array<{
            name: string;
            running: boolean;
            lastRun?: string;
            nextRun?: string;
        }>;
    } {
        const jobsStatus = Array.from(this.jobs.values()).map(jobInfo => {
            const status: {
                name: string;
                running: boolean;
                lastRun?: string;
                nextRun?: string;
            } = {
                name: jobInfo.name,
                running: this.isRunning && jobInfo.task !== null
            };
            if (jobInfo.lastRun !== undefined) {
                status.lastRun = jobInfo.lastRun;
            }
            const nextRun = this.calculateNextExecution(jobInfo.schedule);
            if (nextRun !== undefined) {
                status.nextRun = nextRun;
            }
            return status;
        });

        return {
            isRunning: this.isRunning,
            jobs: jobsStatus
        };
    }

    /**
     * Initialize job definitions
     */
    private initializeJobs(): void {
        const jobDefinitions = [
            { name: 'main-posting', schedule: config.app.cronSchedule },
            { name: 'backup', schedule: '0 2 * * *' },
            { name: 'health-check', schedule: '0 */6 * * *' },
            { name: 'cleanup', schedule: '0 3 * * 0' }
        ];

        jobDefinitions.forEach(def => {
            this.jobs.set(def.name, {
                name: def.name,
                schedule: def.schedule,
                task: null
            });
        });
    }

    /**
     * Start all jobs
     */
    private startAllJobs(): void {
        this.scheduleMainJob();
        this.scheduleBackupJob();
        this.scheduleHealthCheckJob();
        this.scheduleCleanupJob();
    }

    /**
     * Schedule main posting job
     */
    private scheduleMainJob(): void {
        const jobInfo = this.jobs.get('main-posting');
        if (!jobInfo) return;

        // Check for immediate run flag
        if (process.env.RUN_NOW === 'true') {
            logger.info('RUN_NOW flag detected - executing immediately');
            setTimeout(async () => {
                await queueManager.addJob('main-posting', {
                    type: 'main-posting',
                    priority: 'high',
                    data: { manual: true }
                });
            }, 5000); // 5 second delay after startup
        }

        const schedule = jobInfo.schedule;

        if (!cron.validate(schedule)) {
            logger.error('Invalid cron schedule for main job', { schedule });
            return;
        }

        const task = cron.schedule(schedule, async () => {
            logger.info('Main posting job triggered');
            jobInfo.lastRun = new Date().toISOString();

            try {
                await queueManager.addJob('main-posting', {
                    type: 'main-posting',
                    priority: 'high',
                    data: {}
                });
            } catch (error) {
                logger.error('Failed to queue main posting job', error);
            }
        }, {
            scheduled: false,
            timezone: 'Asia/Karachi'
        });

        jobInfo.task = task;
        task.start();

        logger.info('Main posting job scheduled', { schedule });
    }

    /**
     * Schedule backup job - daily at 2 AM
     */
    private scheduleBackupJob(): void {
        const jobInfo = this.jobs.get('backup');
        if (!jobInfo) return;

        const task = cron.schedule(jobInfo.schedule, async () => {
            logger.info('Backup job triggered');
            jobInfo.lastRun = new Date().toISOString();

            try {
                const backupResult = await memoryStore.createBackup();
                if (backupResult.successful) {
                    logger.info('Scheduled backup completed successfully', { path: backupResult.data });
                } else {
                    logger.error('Scheduled backup failed', { error: backupResult.error });
                }
            } catch (error) {
                logger.error('Backup job error', error);
            }
        }, {
            scheduled: false,
            timezone: 'Asia/Karachi'
        });

        jobInfo.task = task;
        task.start();

        logger.info('Backup job scheduled', { schedule: jobInfo.schedule });
    }

    /**
     * Schedule health check job - every 6 hours
     */
    private scheduleHealthCheckJob(): void {
        const jobInfo = this.jobs.get('health-check');
        if (!jobInfo) return;

        const task = cron.schedule(jobInfo.schedule, async () => {
            logger.info('Health check job triggered');
            jobInfo.lastRun = new Date().toISOString();

            try {
                await queueManager.addJob('health-check', {
                    type: 'health-check',
                    priority: 'low',
                    data: {}
                });
            } catch (error) {
                logger.error('Failed to queue health check job', error);
            }
        }, {
            scheduled: false,
            timezone: 'Asia/Karachi'
        });

        jobInfo.task = task;
        task.start();

        logger.info('Health check job scheduled', { schedule: jobInfo.schedule });
    }

    /**
     * Schedule cleanup job - weekly on Sunday at 3 AM
     */
    private scheduleCleanupJob(): void {
        const jobInfo = this.jobs.get('cleanup');
        if (!jobInfo) return;

        const task = cron.schedule(jobInfo.schedule, async () => {
            logger.info('Cleanup job triggered');
            jobInfo.lastRun = new Date().toISOString();

            try {
                await queueManager.addJob('cleanup', {
                    type: 'cleanup',
                    priority: 'low',
                    data: {}
                });
            } catch (error) {
                logger.error('Failed to queue cleanup job', error);
            }
        }, {
            scheduled: false,
            timezone: 'Asia/Karachi'
        });

        jobInfo.task = task;
        task.start();

        logger.info('Cleanup job scheduled', { schedule: jobInfo.schedule });
    }

    /**
     * Manual trigger for testing
     */
    public async triggerMainJob(): Promise<ApiResponse<boolean>> {
        try {
            logger.info('Manually triggering main posting job');

            await queueManager.addJob('main-posting-manual', {
                type: 'main-posting',
                priority: 'high',
                data: { manual: true }
            });

            return createApiResponse(true, 'Main job triggered manually', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to trigger main job manually', error);
            return createApiResponse(false, 'Failed to trigger main job', false, errMsg);
        }
    }

    /**
     * Update main job schedule
     */
    public async updateMainSchedule(newSchedule: string): Promise<ApiResponse<boolean>> {
        try {
            if (!cron.validate(newSchedule)) {
                return createApiResponse(false, 'Invalid cron schedule', false, 'Schedule format is invalid');
            }

            const jobInfo = this.jobs.get('main-posting');
            if (!jobInfo) {
                return createApiResponse(false, 'Main job not found', false, 'Job not initialized');
            }

            // Stop existing job
            if (jobInfo.task) {
                jobInfo.task.stop();
                jobInfo.task = null;
            }

            // Update schedule
            jobInfo.schedule = newSchedule;
            logger.info('Updating main job schedule', { oldSchedule: config.app.cronSchedule, newSchedule });

            // Recreate job with new schedule
            this.scheduleMainJob();

            return createApiResponse(true, 'Schedule updated successfully', true);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to update schedule', error);
            return createApiResponse(false, 'Failed to update schedule', false, errMsg);
        }
    }

    /**
     * Get next execution times for jobs
     */
    public getNextExecutions(): Array<{
        jobName: string;
        schedule: string;
        nextExecution: string;
    }> {
        return Array.from(this.jobs.values()).map(jobInfo => ({
            jobName: jobInfo.name,
            schedule: jobInfo.schedule,
            nextExecution: this.calculateNextExecution(jobInfo.schedule)
        }));
    }

    /**
     * Calculate next execution time (simplified)
     */
    private calculateNextExecution(schedule: string): string {
        // This is a placeholder - for production use a proper cron parser like 'cron-parser'
        const now = new Date();

        // Parse basic schedules
        const parts = schedule.split(' ');
        if (parts.length === 5) {
            const [minute, hour, day, month, weekday] = parts;

            // Handle daily schedules (0 9 * * *)
            if (day === '*' && month === '*' && weekday === '*') {
                const nextRun = new Date(now);
                nextRun.setHours(parseInt(hour || '0'), parseInt(minute || '0'), 0, 0);

                // If time has passed today, schedule for tomorrow
                if (nextRun <= now) {
                    nextRun.setDate(nextRun.getDate() + 1);
                }

                return nextRun.toISOString();
            }
        }

        // Fallback: next day at the same time
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString();
    }

    /**
     * Get individual job status
     */
    public getJobStatus(jobName: string): {
        exists: boolean;
        running: boolean;
        lastRun?: string;
        nextRun?: string;
    } {
        const jobInfo = this.jobs.get(jobName);

        if (!jobInfo) {
            return { exists: false, running: false };
        }

        const result: {
            exists: boolean;
            running: boolean;
            lastRun?: string;
            nextRun?: string;
        } = {
            exists: true,
            running: this.isRunning && jobInfo.task !== null
        };
        if (jobInfo.lastRun !== undefined) {
            result.lastRun = jobInfo.lastRun;
        }
        const nextRun = this.calculateNextExecution(jobInfo.schedule);
        if (nextRun !== undefined) {
            result.nextRun = nextRun;
        }
        return result;
    }
}

export const cronJobs = CronJobsService.getInstance();
export default cronJobs;