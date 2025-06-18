// src/data/templates/prompts.ts

import { PostTone, PostLength, SocialPlatform } from '@/types';

export const CONTENT_GENERATION_PROMPTS = {
    /**
     * Main content generation prompt
     */
    generatePost: (params: {
        commits: string[];
        platform: SocialPlatform;
        tone: PostTone;
        length: PostLength;
        context: string;
        projectName: string;
        recentTopics: string[];
        ongoingFeatures: string[];
    }) => `
You are a professional developer creating engaging social media content about your coding journey.

CONTEXT:
- Project: ${params.projectName}
- Platform: ${params.platform}
- Tone: ${params.tone}
- Length: ${params.length}
- Background: ${params.context}
${params.ongoingFeatures.length > 0 ? `- Ongoing features: ${params.ongoingFeatures.join(', ')}` : ''}

RECENT COMMITS:
${params.commits.join('\n')}

GUIDELINES:
- Write as a developer sharing their journey
- Focus on the most interesting/impactful changes
- Avoid technical jargon overload
- Include relevant hashtags
- ${params.platform === 'linkedin' ? 'Professional tone suitable for LinkedIn' : 'Casual tone for social media'}
- ${params.length === 'short' ? 'Keep it concise (1-2 paragraphs)' : params.length === 'medium' ? 'Medium length (2-3 paragraphs)' : 'Detailed post (3+ paragraphs)'}
- ${params.recentTopics.length > 0 ? `Avoid repeating these recent topics: ${params.recentTopics.join(', ')}` : ''}

Create an engaging post that tells a story about the development progress. Include 3-5 relevant hashtags.
`,

    /**
     * Feature announcement prompt
     */
    announceFeature: (params: {
        featureName: string;
        description: string;
        platform: SocialPlatform;
        projectName: string;
        benefits: string[];
    }) => `
Create an exciting announcement post about a new feature launch.

FEATURE DETAILS:
- Feature: ${params.featureName}
- Description: ${params.description}
- Project: ${params.projectName}
- Benefits: ${params.benefits.join(', ')}

REQUIREMENTS:
- Generate excitement and curiosity
- Explain the value to users
- Include call-to-action
- Use ${params.platform} best practices
- Add relevant hashtags
- Keep it engaging and accessible

Write a ${params.platform} post that announces this feature launch professionally yet excitingly.
`,

    /**
     * Progress update prompt
     */
    progressUpdate: (params: {
        weeklyProgress: string[];
        challenges: string[];
        nextWeek: string[];
        platform: SocialPlatform;
        projectName: string;
    }) => `
Create a weekly progress update post for your development project.

PROGRESS THIS WEEK:
${params.weeklyProgress.join('\n')}

CHALLENGES FACED:
${params.challenges.join('\n')}

NEXT WEEK PLANS:
${params.nextWeek.join('\n')}

REQUIREMENTS:
- Share both wins and challenges authentically
- Show learning and growth mindset
- Inspire other developers
- Include relevant hashtags
- Maintain ${params.platform} best practices

Create an engaging weekly update post that shows transparency and progress.
`,

    /**
     * Technical insight prompt
     */
    technicalInsight: (params: {
        topic: string;
        learnings: string[];
        codeExample?: string;
        platform: SocialPlatform;
        difficulty: 'beginner' | 'intermediate' | 'advanced';
    }) => `
Share a technical insight or learning from your development work.

TOPIC: ${params.topic}
DIFFICULTY LEVEL: ${params.difficulty}

KEY LEARNINGS:
${params.learnings.join('\n')}

${params.codeExample ? `CODE EXAMPLE:\n${params.codeExample}` : ''}

REQUIREMENTS:
- Explain complex concepts simply
- Share practical value
- Include actionable advice
- Use appropriate ${params.difficulty} level language
- Add relevant hashtags
- Encourage community discussion

Create a ${params.platform} post that teaches and inspires other developers.
`
};

export const IMAGE_GENERATION_PROMPTS = {
    /**
     * Code visualization prompt
     */
    codeVisualization: (params: {
        topic: string;
        style: 'minimal' | 'tech' | 'abstract';
        colors: string[];
    }) => `
Create a professional coding-themed image for social media.

TOPIC: ${params.topic}
STYLE: ${params.style}
COLORS: ${params.colors.join(', ')}

REQUIREMENTS:
- Clean, modern design
- Coding/tech theme
- Social media friendly dimensions
- Professional appearance
- Include subtle tech elements (code snippets, terminal, etc.)
- Avoid text overlay
- Use specified color palette

Generate a ${params.style} image representing ${params.topic} development work.
`,

    /**
     * Progress visualization prompt
     */
    progressVisualization: (params: {
        milestone: string;
        percentage: number;
        style: 'professional' | 'colorful';
    }) => `
Create a progress visualization image for development milestone.

MILESTONE: ${params.milestone}
PROGRESS: ${params.percentage}%
STYLE: ${params.style}

REQUIREMENTS:
- Show progress clearly
- Professional appearance
- Include milestone information
- Use progress bars or charts
- Modern, clean design
- Social media dimensions

Generate a ${params.style} progress image showing ${params.percentage}% completion of ${params.milestone}.
`,

    /**
     * Feature showcase prompt
     */
    featureShowcase: (params: {
        featureName: string;
        type: 'ui' | 'api' | 'database' | 'general';
        brandColors: string[];
    }) => `
Create a feature showcase image for social media announcement.

FEATURE: ${params.featureName}
TYPE: ${params.type}
BRAND COLORS: ${params.brandColors.join(', ')}

REQUIREMENTS:
- Highlight the feature prominently
- Use brand colors
- Modern, professional design
- Include relevant icons/symbols
- Social media friendly
- Clean typography
- Exciting but professional

Generate a showcase image for ${params.featureName} feature announcement.
`
};

export const HASHTAG_SUGGESTIONS = {
    general: ['#coding', '#developer', '#programming', '#tech', '#softwaredev'],
    frontend: ['#frontend', '#javascript', '#react', '#vue', '#angular', '#css', '#html'],
    backend: ['#backend', '#nodejs', '#python', '#api', '#database', '#server'],
    mobile: ['#mobiledev', '#reactnative', '#flutter', '#ios', '#android'],
    ai: ['#ai', '#machinelearning', '#artificialintelligence', '#ml', '#deeplearning'],
    startup: ['#startup', '#entrepreneur', '#buildinpublic', '#indie', '#founder'],
    learning: ['#100daysofcode', '#codelearning', '#devjourney', '#programming', '#coding'],
    tools: ['#devtools', '#productivity', '#automation', '#workflow', '#development']
};

export const PLATFORM_SPECIFIC_ADJUSTMENTS = {
    linkedin: {
        maxLength: 3000,
        preferredTone: 'professional',
        hashtagLimit: 5,
        callToAction: 'Connect with me to discuss',
        professionalLanguage: true
    },
    facebook: {
        maxLength: 2000,
        preferredTone: 'casual',
        hashtagLimit: 3,
        callToAction: 'What do you think?',
        professionalLanguage: false
    },
    twitter: {
        maxLength: 280,
        preferredTone: 'casual',
        hashtagLimit: 2,
        callToAction: 'Thoughts?',
        professionalLanguage: false
    },
    instagram: {
        maxLength: 2200,
        preferredTone: 'casual',
        hashtagLimit: 10,
        callToAction: 'Follow for more dev content',
        professionalLanguage: false
    }
};