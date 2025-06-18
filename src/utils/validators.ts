// src/utils/validators.ts

import Joi from 'joi';
import { ApiResponse, GitHubCommit, SocialPost, PostContent } from '@/types';
import { createApiResponse } from './helpers';
import { VALIDATION_RULES } from '@/config/database';

/**
 * Environment variables validation schema
 */
const envSchema = Joi.object({
    GITHUB_TOKEN: Joi.string().required(),
    GITHUB_REPO_OWNER: Joi.string().required(),
    GITHUB_REPO_NAME: Joi.string().required(),
    OPENROUTER_API_KEY: Joi.string().required(),
    LINKEDIN_ACCESS_TOKEN: Joi.string().required(),
    AI_MODEL: Joi.string().optional(),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    CRON_SCHEDULE: Joi.string().optional()
});

/**
 * GitHub commit validation schema
 */
const githubCommitSchema = Joi.object({
    sha: Joi.string().required(),
    commit: Joi.object({
        message: Joi.string().min(VALIDATION_RULES.commit.minMessageLength).required(),
        author: Joi.object({
            name: Joi.string().required(),
            email: Joi.string().email().required(),
            date: Joi.string().isoDate().required()
        }).required()
    }).required(),
    author: Joi.object({
        login: Joi.string().required()
    }).allow(null)
});

/**
 * Social post validation schema
 */
const socialPostSchema = Joi.object({
    platform: Joi.string().valid('linkedin', 'facebook', 'twitter', 'instagram').required(),
    content: Joi.string().min(VALIDATION_RULES.post.minContentLength).required(),
    hashtags: Joi.array().items(Joi.string()).max(VALIDATION_RULES.post.maxHashtags),
    imageUrl: Joi.string().uri().optional(),
    scheduledFor: Joi.string().isoDate().optional()
});

/**
 * Post content validation schema
 */
const postContentSchema = Joi.object({
    title: Joi.string().min(5).max(100).required(),
    body: Joi.string().min(20).max(2500).required(),
    hashtags: Joi.array().items(Joi.string().pattern(/^#\w+$/)).max(10),
    tone: Joi.string().valid('professional', 'casual', 'technical', 'excited', 'informative', 'storytelling'),
    length: Joi.string().valid('short', 'medium', 'long')
});

/**
 * Validate environment variables
 */
export const validateEnv = (): ApiResponse<boolean> => {
    const { error } = envSchema.validate(process.env, {
        allowUnknown: true,
        stripUnknown: true
    });

    if (error) {
        return createApiResponse(
            false,
            'Environment validation failed',
            false,
            error.details.map(d => d.message).join(', ')
        );
    }

    return createApiResponse(true, 'Environment variables validated', true);
};

/**
 * Validate GitHub commit data
 */
export const validateGitHubCommit = (commit: any): ApiResponse<GitHubCommit | undefined> => {
    const { error, value } = githubCommitSchema.validate(commit);

    if (error) {
        return createApiResponse(
            false,
            'GitHub commit validation failed',
            undefined,
            error.details[0]?.message || 'Unknown validation error'
        );
    }

    // Additional business logic validation
    const message = value.commit.message.toLowerCase();

    // Skip merge commits
    if (message.startsWith('merge') || message.includes('merge branch')) {
        return createApiResponse(
            false,
            'Merge commit ignored',
            undefined,
            'Merge commits are filtered out'
        );
    }

    // Skip commits with only documentation changes
    if (message.includes('readme') && !message.includes('feat') && !message.includes('fix')) {
        return createApiResponse(
            false,
            'Documentation-only commit ignored',
            undefined,
            'Documentation-only commits are filtered out'
        );
    }

    return createApiResponse(true, 'GitHub commit validated', value);
};

/**
 * Validate social post data
 */
export const validateSocialPost = (post: any): ApiResponse<SocialPost | undefined> => {
    const { error, value } = socialPostSchema.validate(post);

    if (error) {
        return createApiResponse(
            false,
            'Social post validation failed',
            undefined,
            error.details[0]?.message || 'Unknown validation error'
        );
    }

    // Platform-specific validation
    const platform = value.platform;
    const contentLength = value.content.length;

    if (platform === 'linkedin' && contentLength > VALIDATION_RULES.post.maxContentLength.linkedin) {
        return createApiResponse(
            false,
            'LinkedIn post too long',
            undefined,
            `Content exceeds LinkedIn limit of ${VALIDATION_RULES.post.maxContentLength.linkedin} characters`
        );
    }

    if (platform === 'facebook' && contentLength > VALIDATION_RULES.post.maxContentLength.facebook) {
        return createApiResponse(
            false,
            'Facebook post too long',
            undefined,
            `Content exceeds Facebook limit of ${VALIDATION_RULES.post.maxContentLength.facebook} characters`
        );
    }

    return createApiResponse(true, 'Social post validated', value);
};

/**
 * Validate post content
 */
export const validatePostContent = (content: any): ApiResponse<PostContent | undefined> => {
    const { error, value } = postContentSchema.validate(content);

    if (error) {
        return createApiResponse(
            false,
            'Post content validation failed',
            undefined,
            error.details[0]?.message || 'Unknown validation error'
        );
    }

    return createApiResponse(true, 'Post content validated', value);
};

/**
 * Validate URL format
 */
export const isValidUrl = (url: string): boolean => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

/**
 * Validate GitHub token format
 */
export const isValidGitHubToken = (token: string): boolean => {
    return token.startsWith('ghp_') || token.startsWith('github_pat_');
};

/**
 * Validate cron expression (basic validation)
 */
export const isValidCronExpression = (cron: string): boolean => {
    const cronParts = cron.split(' ');
    return cronParts.length === 5 || cronParts.length === 6;
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (input: string): string => {
    return input
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>&"']/g, '') // Remove potentially dangerous characters
        .trim();
};