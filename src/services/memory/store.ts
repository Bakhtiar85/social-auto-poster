// src/services/memory/store.ts

import fs from 'fs/promises';
import path from 'path';
import { MemoryStore, PostHistory, ApiResponse } from '@/types';
import { STORAGE_PATHS, DEFAULT_MEMORY_STORE, BACKUP_CONFIG } from '@/config/database';
import { createApiResponse, safeJsonParse, generateId } from '@/utils/helpers';
import { createServiceLogger } from '@/utils/logger';

const logger = createServiceLogger('MemoryStore');

class MemoryStoreService {
    private static instance: MemoryStoreService;
    private memoryStore: MemoryStore;
    private isInitialized: boolean = false;

    private constructor() {
        this.memoryStore = { ...DEFAULT_MEMORY_STORE };
    }

    public static getInstance(): MemoryStoreService {
        if (!MemoryStoreService.instance) {
            MemoryStoreService.instance = new MemoryStoreService();
        }
        return MemoryStoreService.instance;
    }

    /**
     * Initialize memory store - create directories and load data
     */
    public async initialize(): Promise<ApiResponse<boolean>> {
        try {
            // Ensure directories exist
            await this.ensureDirectories();

            // Load existing data
            const loadResult = await this.loadFromDisk();
            if (!loadResult.successful) {
                logger.warn('Failed to load existing data, using defaults', { error: loadResult.error });
            }

            this.isInitialized = true;
            logger.info('Memory store initialized successfully');

            return createApiResponse(true, 'Memory store initialized', true);
        } catch (error: unknown) {
            logger.error('Failed to initialize memory store', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return createApiResponse(false, 'Memory store initialization failed', false, errorMsg);
        }
    }

    /**
     * Get current memory store
     */
    public getMemoryStore(): MemoryStore {
        return { ...this.memoryStore };
    }

    /**
     * Save post to history
     */
    public async savePost(post: PostHistory): Promise<ApiResponse<boolean>> {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Add to history
            this.memoryStore.postHistory.unshift(post);

            // Keep only recent history (based on settings)
            const maxEntries = this.memoryStore.settings.maxHistoryDays * 5; // ~5 posts per day
            if (this.memoryStore.postHistory.length > maxEntries) {
                this.memoryStore.postHistory = this.memoryStore.postHistory.slice(0, maxEntries);
            }

            // Update tracking info
            this.memoryStore.lastPostedCommit = post.commitSha;
            this.memoryStore.lastPostDate = post.postedAt;

            // Save to disk
            const saveResult = await this.saveToDisk();
            if (!saveResult.successful) {
                return saveResult;
            }

            logger.info('Post saved to memory', { postId: post.id, platform: post.platform });
            return createApiResponse(true, 'Post saved to memory', true);
        } catch (error: unknown) {
            logger.error('Failed to save post to memory', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return createApiResponse(false, 'Failed to save post', false, errorMsg);
        }
    }

    /**
     * Update project context
     */
    public async updateProjectContext(updates: Partial<MemoryStore['projectContext']>): Promise<ApiResponse<boolean>> {
        try {
            this.memoryStore.projectContext = {
                ...this.memoryStore.projectContext,
                ...updates
            };

            const saveResult = await this.saveToDisk();
            if (!saveResult.successful) {
                return saveResult;
            }

            logger.info('Project context updated', { updates: Object.keys(updates) });
            return createApiResponse(true, 'Project context updated', true);
        } catch (error: unknown) {
            logger.error('Failed to update project context', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return createApiResponse(false, 'Failed to update project context', false, errorMsg);
        }
    }

    /**
     * Get recent posts (within specified days)
     */
    public getRecentPosts(days: number = 7): PostHistory[] {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        return this.memoryStore.postHistory.filter(post =>
            new Date(post.postedAt) > cutoffDate
        );
    }

    /**
     * Check if topic was recently posted about
     */
    public wasTopicRecentlyPosted(topic: string, days: number = 7): boolean {
        const recentPosts = this.getRecentPosts(days);
        const topicLower = topic.toLowerCase();

        return recentPosts.some(post =>
            post.content.toLowerCase().includes(topicLower)
        );
    }

    /**
     * Update entire memory store (for narrative context updates)
     */
    public async updateMemoryStore(updates: Partial<MemoryStore>): Promise<ApiResponse<boolean>> {
        try {
            this.memoryStore = {
                ...this.memoryStore,
                ...updates
            };

            const saveResult = await this.saveToDisk();
            if (!saveResult.successful) {
                return saveResult;
            }

            logger.info('Memory store updated', { updates: Object.keys(updates) });
            return createApiResponse(true, 'Memory store updated', true);
        } catch (error: unknown) {
            logger.error('Failed to update memory store', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return createApiResponse(false, 'Failed to update memory store', false, errorMsg);
        }
    }
    public getLastPostedCommit(): string {
        return this.memoryStore.lastPostedCommit;
    }

    /**
     * Get last posted commit SHA
     */
    public async createBackup(): Promise<ApiResponse<string>> {
        try {
            if (!BACKUP_CONFIG.enabled) {
                return createApiResponse(false, 'Backup is disabled', '', 'Backup feature is disabled in config');
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `memory-backup-${timestamp}.json`;
            const backupPath = path.join(BACKUP_CONFIG.backupPath, backupFileName);

            // Ensure backup directory exists
            await fs.mkdir(BACKUP_CONFIG.backupPath, { recursive: true });

            // Save backup
            await fs.writeFile(backupPath, JSON.stringify(this.memoryStore, null, 2));

            // Clean old backups
            await this.cleanOldBackups();

            logger.info('Memory backup created', { backupPath });
            return createApiResponse(true, 'Backup created successfully', backupPath);
        } catch (error: unknown) {
            logger.error('Failed to create backup', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return createApiResponse(false, 'Backup creation failed', '', errorMsg);
        }
    }

    /**
     * Load data from disk
     */
    private async loadFromDisk(): Promise<ApiResponse<boolean>> {
        try {
            // Load post history
            try {
                const historyData = await fs.readFile(STORAGE_PATHS.memory.postHistory, 'utf-8');
                const history = safeJsonParse(historyData, []);
                this.memoryStore.postHistory = history;
            } catch {
                logger.info('No existing post history found, starting fresh');
            }

            // Load context
            try {
                const contextData = await fs.readFile(STORAGE_PATHS.memory.context, 'utf-8');
                const context = safeJsonParse(contextData, {});
                this.memoryStore = { ...this.memoryStore, ...context };
            } catch {
                logger.info('No existing context found, using defaults');
            }

            return createApiResponse(true, 'Data loaded from disk', true);
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return createApiResponse(false, 'Failed to load data from disk', false, errorMsg);
        }
    }

    /**
     * Save data to disk
     */
    private async saveToDisk(): Promise<ApiResponse<boolean>> {
        try {
            // Save post history
            await fs.writeFile(
                STORAGE_PATHS.memory.postHistory,
                JSON.stringify(this.memoryStore.postHistory, null, 2)
            );

            // Save context (excluding post history to avoid duplication)
            const { postHistory, ...contextData } = this.memoryStore;
            await fs.writeFile(
                STORAGE_PATHS.memory.context,
                JSON.stringify(contextData, null, 2)
            );

            return createApiResponse(true, 'Data saved to disk', true);
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return createApiResponse(false, 'Failed to save data to disk', false, errorMsg);
        }
    }

    /**
     * Ensure required directories exist
     */
    private async ensureDirectories(): Promise<void> {
        await fs.mkdir(STORAGE_PATHS.memory.root, { recursive: true });
        await fs.mkdir(STORAGE_PATHS.logs.root, { recursive: true });

        if (BACKUP_CONFIG.enabled) {
            await fs.mkdir(BACKUP_CONFIG.backupPath, { recursive: true });
        }
    }

    /**
     * Clean old backup files
     */
    private async cleanOldBackups(): Promise<void> {
        try {
            const files = await fs.readdir(BACKUP_CONFIG.backupPath);
            const backupFiles = files
                .filter(file => file.startsWith('memory-backup-'))
                .map(file => ({
                    name: file,
                    path: path.join(BACKUP_CONFIG.backupPath, file),
                    stat: null as any
                }));

            // Get file stats
            for (const file of backupFiles) {
                file.stat = await fs.stat(file.path);
            }

            // Sort by creation time (newest first)
            backupFiles.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

            // Remove old backups
            if (backupFiles.length > BACKUP_CONFIG.maxBackups) {
                const filesToDelete = backupFiles.slice(BACKUP_CONFIG.maxBackups);
                for (const file of filesToDelete) {
                    await fs.unlink(file.path);
                    logger.info('Old backup deleted', { fileName: file.name });
                }
            }
        } catch (error) {
            logger.warn('Failed to clean old backups', { error });
        }
    }
}

export const memoryStore = MemoryStoreService.getInstance();
export default memoryStore;