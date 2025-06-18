// src/types/social.ts

export interface SocialPost {
    platform: SocialPlatform;
    content: string;
    imageUrl?: string;
    hashtags: string[];
    mentions?: string[];
    scheduledFor?: string;
}

export type SocialPlatform = 'linkedin' | 'facebook' | 'twitter' | 'instagram';

export interface PostContent {
    title: string;
    body: string;
    callToAction?: string;
    hashtags: string[];
    tone: PostTone;
    length: PostLength;
}

export type PostTone =
    | 'professional'
    | 'casual'
    | 'technical'
    | 'excited'
    | 'informative'
    | 'storytelling';

export type PostLength = 'short' | 'medium' | 'long';

export interface ImageRequest {
    prompt: string;
    style: ImageStyle;
    dimensions: ImageDimensions;
    includeText?: boolean;
    brandColors?: string[];
}

export type ImageStyle =
    | 'minimal'
    | 'tech'
    | 'abstract'
    | 'professional'
    | 'colorful'
    | 'dark-mode';

export interface ImageDimensions {
    width: number;
    height: number;
    aspectRatio: '1:1' | '16:9' | '4:5' | '9:16';
}

export interface PublishResult {
    platform: SocialPlatform;
    postId?: string;
    url?: string;
    publishedAt: string;
    success: boolean;
    error?: string;
}

export interface PlatformConfig {
    enabled: boolean;
    accessToken: string;
    refreshToken?: string;
    apiVersion?: string;
    rateLimits: {
        postsPerHour: number;
        postsPerDay: number;
    };
}