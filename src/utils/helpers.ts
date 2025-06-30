// src/utils/helpers.ts

import moment from 'moment';
import { ApiResponse } from '@/types';

/**
 * Sleep/delay function
 */
export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
export const retry = async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoffMultiplier: number = 2
): Promise<T> => {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (i < maxRetries - 1) {
                await sleep(delay * Math.pow(backoffMultiplier, i));
            }
        }
    }

    throw lastError!;
};

/**
 * Safe JSON parse with default value
 */
export const safeJsonParse = <T>(jsonString: string, defaultValue: T): T => {
    try {
        return JSON.parse(jsonString);
    } catch {
        return defaultValue;
    }
};

/**
 * Create standardized API response
 */
export const createApiResponse = <T>(
    successful: boolean,
    message: string,
    data?: T,
    error?: string | Error
): ApiResponse<T> => {
    const response: any = {
        successful,
        message,
        error: error instanceof Error ? error.message : error
    };
    if (data !== undefined) {
        response.data = data;
    }
    return response;
};

/**
 * Date and time utilities
 */
export const dateUtils = {
    isToday: (date: string): boolean => {
        return moment(date).isSame(moment(), 'day');
    },

    isYesterday: (date: string): boolean => {
        return moment(date).isSame(moment().subtract(1, 'day'), 'day');
    },

    formatRelative: (date: string): string => {
        return moment(date).fromNow();
    },

    getYesterday: (): string => {
        return moment().subtract(1, 'day').toISOString();
    },

    getFromStart: (): string => {
        return '2025-05-29T00:00:00Z';
    },

    getTodayStart: (): string => {
        return moment().startOf('day').toISOString();
    },

    isWithinDays: (date: string, days: number): boolean => {
        return moment(date).isAfter(moment().subtract(days, 'days'));
    }
};

/**
 * String utilities
 */
export const stringUtils = {
    truncate: (text: string, maxLength: number, suffix: string = '...'): string => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - suffix.length) + suffix;
    },

    slugify: (text: string): string => {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    extractHashtags: (text: string): string[] => {
        const hashtags = text.match(/#[\w]+/g);
        return hashtags ? hashtags.map(tag => tag.toLowerCase()) : [];
    },

    removeHashtags: (text: string): string => {
        return text.replace(/#[\w]+/g, '').trim();
    },

    capitalizeFirst: (text: string): string => {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
};

/**
 * Array utilities
 */
export const arrayUtils = {
    chunk: <T>(array: T[], size: number): T[][] => {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    unique: <T>(array: T[]): T[] => {
        return [...new Set(array)];
    },

    randomElement: <T>(array: T[]): T | undefined => {
        return array[Math.floor(Math.random() * array.length)];
    },

    shuffle: <T>(array: T[]): T[] => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            if (shuffled[i] !== undefined && shuffled[j] !== undefined) {
                [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
            }
        }
        return shuffled;
    }
};

/**
 * Object utilities
 */
export const objectUtils = {
    deepClone: <T>(obj: T): T => {
        return JSON.parse(JSON.stringify(obj));
    },

    isEmpty: (obj: any): boolean => {
        return obj == null || Object.keys(obj).length === 0;
    },

    pick: <T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
        const result = {} as Pick<T, K>;
        keys.forEach(key => {
            if (key in obj) {
                result[key] = obj[key];
            }
        });
        return result;
    }
};

/**
 * Generate unique ID
 */
export const generateId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};