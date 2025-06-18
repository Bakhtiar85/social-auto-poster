// src/services/ai/image-generator.ts

import axios from 'axios';
import { ImageStyle, ImageDimensions, ApiResponse } from '@/types';
import { config } from '@/config';
import { DEFAULT_HEADERS, REQUEST_TIMEOUTS } from '@/config/apis';
import { IMAGE_GENERATION_PROMPTS } from '@/data/templates/prompts';
import { createApiResponse } from '@/utils/helpers';
import { createServiceLogger, logApiRequest } from '@/utils/logger';

const logger = createServiceLogger('ImageGenerator');

class ImageGeneratorService {
    private static instance: ImageGeneratorService;
    private axiosInstance;

    private constructor() {
        this.axiosInstance = axios.create({
            baseURL: config.ai.baseUrl,
            timeout: REQUEST_TIMEOUTS.openRouter * 2, // Images take longer
            headers: {
                ...DEFAULT_HEADERS.openRouter,
                'Authorization': `Bearer ${config.ai.apiKey}`
            }
        });

        // Request/Response interceptors
        this.axiosInstance.interceptors.request.use((config) => {
            logger.debug('Image generation request', { model: config.data?.model });
            return config;
        });

        this.axiosInstance.interceptors.response.use(
            (response) => {
                logApiRequest('openrouter-image', response.config.url || '',
                    response.config.method?.toUpperCase() || 'POST',
                    response.status);
                return response;
            },
            (error) => {
                logApiRequest('openrouter-image', error.config?.url || '',
                    error.config?.method?.toUpperCase() || 'POST',
                    error.response?.status);
                return Promise.reject(error);
            }
        );
    }

    public static getInstance(): ImageGeneratorService {
        if (!ImageGeneratorService.instance) {
            ImageGeneratorService.instance = new ImageGeneratorService();
        }
        return ImageGeneratorService.instance;
    }

    /**
     * Generate image for social media post
     */
    public async generatePostImage(params: {
        topic: string;
        style?: ImageStyle;
        dimensions?: ImageDimensions;
        brandColors?: string[];
    }): Promise<ApiResponse<string | undefined>> {
        try {
            const {
                topic,
                style = 'tech',
                dimensions = { width: 1200, height: 630, aspectRatio: '16:9' },
                brandColors = ['#3b82f6', '#1e40af', '#0f172a']
            } = params;

            logger.info('Generating post image', { topic, style, dimensions });

            // Map or restrict style to allowed values for codeVisualization
            const allowedStyles: Array<'minimal' | 'tech' | 'abstract'> = ['minimal', 'tech', 'abstract'];
            const mappedStyle = allowedStyles.includes(style as any) ? style as 'minimal' | 'tech' | 'abstract' : 'tech';

            const prompt = IMAGE_GENERATION_PROMPTS.codeVisualization({
                topic,
                style: mappedStyle,
                colors: brandColors
            });

            const imageUrl = await this.callImageAPI(prompt, dimensions);
            if (!imageUrl.successful || !imageUrl.data) {
                return createApiResponse(false, 'Image generation failed', undefined, imageUrl.error);
            }

            logger.info('Post image generated successfully', { topic, url: imageUrl.data });
            return createApiResponse(true, 'Post image generated', imageUrl.data);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate post image', error);
            return createApiResponse(false, 'Image generation failed', undefined, errMsg);
        }
    }

    /**
     * Generate progress visualization image
     */
    public async generateProgressImage(params: {
        milestone: string;
        percentage: number;
        style?: 'professional' | 'colorful';
    }): Promise<ApiResponse<string | undefined>> {
        try {
            const { milestone, percentage, style = 'professional' } = params;

            logger.info('Generating progress image', { milestone, percentage, style });

            const prompt = IMAGE_GENERATION_PROMPTS.progressVisualization({
                milestone,
                percentage,
                style
            });

            const dimensions: ImageDimensions = { width: 1200, height: 675, aspectRatio: '16:9' };
            const imageUrl = await this.callImageAPI(prompt, dimensions);

            if (!imageUrl.successful || !imageUrl.data) {
                return createApiResponse(false, 'Progress image generation failed', undefined, imageUrl.error);
            }

            logger.info('Progress image generated successfully', { milestone });
            return createApiResponse(true, 'Progress image generated', imageUrl.data);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate progress image', error);
            return createApiResponse(false, 'Progress image generation failed', undefined, errMsg);
        }
    }

    /**
     * Generate feature showcase image
     */
    public async generateFeatureImage(params: {
        featureName: string;
        type: 'ui' | 'api' | 'database' | 'general';
        brandColors?: string[];
    }): Promise<ApiResponse<string | undefined>> {
        try {
            const {
                featureName,
                type,
                brandColors = ['#10b981', '#059669', '#047857']
            } = params;

            logger.info('Generating feature image', { featureName, type });

            const prompt = IMAGE_GENERATION_PROMPTS.featureShowcase({
                featureName,
                type,
                brandColors
            });

            const dimensions: ImageDimensions = { width: 1200, height: 630, aspectRatio: '16:9' };
            const imageUrl = await this.callImageAPI(prompt, dimensions);

            if (!imageUrl.successful || !imageUrl.data) {
                return createApiResponse(false, 'Feature image generation failed', undefined, imageUrl.error);
            }

            logger.info('Feature image generated successfully', { featureName });
            return createApiResponse(true, 'Feature image generated', imageUrl.data);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate feature image', error);
            return createApiResponse(false, 'Feature image generation failed', undefined, errMsg);
        }
    }

    /**
     * Generate simple text-based image (fallback)
     */
    public async generateSimpleImage(params: {
        text: string;
        backgroundColor?: string;
        textColor?: string;
    }): Promise<ApiResponse<string | undefined>> {
        try {
            const {
                text,
                backgroundColor = '#1e40af',
                textColor = '#ffffff'
            } = params;

            logger.info('Generating simple text image', { text: text.substring(0, 50) });

            // Create a simple SVG image as fallback
            const svgImage = this.createSVGImage(text, backgroundColor, textColor);
            const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgImage).toString('base64')}`;

            logger.info('Simple image generated successfully');
            return createApiResponse(true, 'Simple image generated', dataUrl);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('Failed to generate simple image', error);
            return createApiResponse(false, 'Simple image generation failed', undefined, errMsg);
        }
    }

    /**
     * Call AI image generation API
     */
    private async callImageAPI(prompt: string, dimensions: ImageDimensions): Promise<ApiResponse<string | undefined>> {
        try {
            // Note: OpenRouter doesn't support image generation in all models
            // This is a placeholder for when image generation becomes available
            // For now, we'll use a simple text-based image generation

            logger.warn('AI image generation not available, using simple image fallback' + dimensions);

            // Extract key terms from prompt for simple image
            const keyTerms = this.extractKeyTermsFromPrompt(prompt);
            return await this.generateSimpleImage({ text: keyTerms });

            /* 
            // Uncomment when AI image generation is available:
            
            const response = await retry(
              () => this.axiosInstance.post('/images/generations', {
                model: 'dall-e-3', // or appropriate model
                prompt: prompt,
                n: 1,
                size: `${dimensions.width}x${dimensions.height}`,
                quality: 'standard',
                style: 'natural'
              }),
              RETRY_CONFIG.maxRetries,
              RETRY_CONFIG.retryDelay,
              RETRY_CONFIG.backoffMultiplier
            );
      
            const imageUrl = response.data?.data?.[0]?.url;
            if (!imageUrl) {
              return createApiResponse(false, 'No image URL in response', undefined, 'AI returned empty image URL');
            }
      
            return createApiResponse(true, 'AI image generated', imageUrl);
            */
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.warn('AI image generation failed, using fallback', { error: errMsg });

            // Fallback to simple image
            const keyTerms = this.extractKeyTermsFromPrompt(prompt);
            return await this.generateSimpleImage({ text: keyTerms });
        }
    }

    /**
     * Create SVG image as fallback
     */
    private createSVGImage(text: string, backgroundColor: string, textColor: string): string {
        const cleanText = text.length > 60 ? text.substring(0, 57) + '...' : text;

        return `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${backgroundColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${this.adjustColor(backgroundColor, -20)};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <circle cx="100" cy="100" r="40" fill="${textColor}" opacity="0.1"/>
        <circle cx="1100" cy="530" r="60" fill="${textColor}" opacity="0.05"/>
        <rect x="50" y="50" width="60" height="4" fill="${textColor}" opacity="0.2"/>
        <rect x="50" y="60" width="40" height="4" fill="${textColor}" opacity="0.2"/>
        <rect x="50" y="70" width="80" height="4" fill="${textColor}" opacity="0.2"/>
        <text x="600" y="315" font-family="Arial, sans-serif" font-size="32" font-weight="bold" 
              text-anchor="middle" fill="${textColor}">
          <tspan x="600" dy="0">${this.splitTextIntoLines(cleanText)[0] || ''}</tspan>
          <tspan x="600" dy="40">${this.splitTextIntoLines(cleanText)[1] || ''}</tspan>
        </text>
        <text x="600" y="580" font-family="Arial, sans-serif" font-size="16" 
              text-anchor="middle" fill="${textColor}" opacity="0.7">
          Development Update
        </text>
      </svg>
    `.trim();
    }

    /**
     * Split text into lines for SVG
     */
    private splitTextIntoLines(text: string, maxLength: number = 30): string[] {
        if (text.length <= maxLength) return [text];

        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            if ((currentLine + word).length <= maxLength) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }

        if (currentLine) lines.push(currentLine);
        return lines.slice(0, 2); // Max 2 lines
    }

    /**
     * Adjust color brightness
     */
    private adjustColor(color: string, amount: number): string {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * amount);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;

        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }

    /**
     * Extract key terms from prompt for simple image
     */
    private extractKeyTermsFromPrompt(prompt: string): string {
        const words = prompt.toLowerCase().split(' ');
        const keyWords = words.filter(word =>
            ['feature', 'update', 'development', 'progress', 'coding', 'api', 'ui', 'database'].includes(word)
        );

        return keyWords.length > 0
            ? keyWords.slice(0, 3).join(' ').toUpperCase()
            : 'DEVELOPMENT UPDATE';
    }
}

export const imageGenerator = ImageGeneratorService.getInstance();
export default imageGenerator;