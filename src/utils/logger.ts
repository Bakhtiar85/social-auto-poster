// src/utils/logger.ts

import winston from 'winston';
import path from 'path';
import { config } from '@/config';
import { STORAGE_PATHS } from '@/config/database';

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, service, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
        const serviceStr = service ? `[${service}] ` : '';
        return `${timestamp} [${level.toUpperCase()}] ${serviceStr}${message} ${stack || ''} ${metaStr}`;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: config.app.logLevel,
    format: logFormat,
    defaultMeta: { service: 'social-auto-poster' },
    transports: [
        // Console transport
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),

        // File transport for all logs
        new winston.transports.File({
            filename: STORAGE_PATHS.logs.app,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),

        // Separate file for errors
        new winston.transports.File({
            filename: STORAGE_PATHS.logs.error,
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 3
        })
    ]
});

// Service-specific loggers
export const createServiceLogger = (serviceName: string) => {
    return {
        info: (message: string, meta?: any) =>
            logger.info(message, { service: serviceName, ...meta }),

        error: (message: string, error?: Error | any, meta?: any) =>
            logger.error(message, {
                service: serviceName,
                error: error?.message || error,
                stack: error?.stack,
                ...meta
            }),

        warn: (message: string, meta?: any) =>
            logger.warn(message, { service: serviceName, ...meta }),

        debug: (message: string, meta?: any) =>
            logger.debug(message, { service: serviceName, ...meta })
    };
};

// Performance logging
export const logPerformance = (operation: string, startTime: number, meta?: any) => {
    const duration = Date.now() - startTime;
    logger.info(`Performance: ${operation} completed in ${duration}ms`, {
        service: 'performance',
        operation,
        duration,
        ...meta
    });
};

// API request logging
export const logApiRequest = (
    service: string,
    endpoint: string,
    method: string,
    statusCode?: number,
    duration?: number
) => {
    const level = statusCode && statusCode >= 400 ? 'error' : 'info';
    logger.log(level, `API Request: ${method} ${endpoint}`, {
        service,
        endpoint,
        method,
        statusCode,
        duration
    });
};

export default logger;