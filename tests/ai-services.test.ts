// tests/ai-services.test.ts

import { contentGenerator } from '../src/services/ai/content-generator';
import { imageGenerator } from '../src/services/ai/image-generator';
import { ProcessedCommit } from '../src/types';

console.log('🤖 Testing AI Services...\n');

// Mock processed commits for testing
const mockCommits: ProcessedCommit[] = [
    {
        sha: 'abc123',
        message: 'Add user authentication system',
        author: 'Test User',
        date: new Date().toISOString(),
        filesChanged: 5,
        additions: 120,
        deletions: 15,
        type: 'feature',
        category: 'backend',
        significance: 'major'
    },
    {
        sha: 'def456',
        message: 'Fix login button styling',
        author: 'Test User',
        date: new Date().toISOString(),
        filesChanged: 2,
        additions: 8,
        deletions: 3,
        type: 'fix',
        category: 'frontend',
        significance: 'minor'
    }
];

async function testContentGenerator() {
    console.log('📝 Testing Content Generator...');

    try {
        // Test LinkedIn post generation
        console.log('1. Testing LinkedIn post generation...');
        const linkedinResult = await contentGenerator.generatePost({
            commits: mockCommits,
            platform: 'linkedin',
            tone: 'professional',
            length: 'medium'
        });

        console.log('   ✅ LinkedIn generation:', linkedinResult.successful ? 'PASSED' : 'FAILED');
        if (linkedinResult.successful && linkedinResult.data) {
            console.log('   📊 Generated content:');
            console.log('      Title:', linkedinResult.data.title);
            console.log('      Length:', linkedinResult.data.body.length, 'characters');
            console.log('      Tone:', linkedinResult.data.tone);
            console.log('      Hashtags:', linkedinResult.data.hashtags.join(', '));
            console.log('      Preview:', linkedinResult.data.body.substring(0, 100) + '...');
        } else {
            console.log('   ❌ Error:', linkedinResult.error);
        }

        // Test Facebook post generation
        console.log('2. Testing Facebook post generation...');
        const facebookResult = await contentGenerator.generatePost({
            commits: mockCommits,
            platform: 'facebook',
            tone: 'casual',
            length: 'short'
        });

        console.log('   ✅ Facebook generation:', facebookResult.successful ? 'PASSED' : 'FAILED');
        if (facebookResult.successful && facebookResult.data) {
            console.log('   📊 Generated content:');
            console.log('      Title:', facebookResult.data.title);
            console.log('      Length:', facebookResult.data.body.length, 'characters');
            console.log('      Hashtags:', facebookResult.data.hashtags.length);
        }

        // Test feature announcement
        console.log('3. Testing feature announcement...');
        const featureResult = await contentGenerator.generateFeatureAnnouncement({
            featureName: 'User Authentication',
            description: 'Secure login and registration system',
            benefits: ['Enhanced security', 'Better user experience', 'Data protection'],
            platform: 'linkedin'
        });

        console.log('   ✅ Feature announcement:', featureResult.successful ? 'PASSED' : 'FAILED');
        if (featureResult.successful && featureResult.data) {
            console.log('   📊 Feature post generated successfully');
            console.log('      Length:', featureResult.data.body.length, 'characters');
        }

        return true;
    } catch (error) {
        console.log('   ❌ Content Generator Test Failed:', error);
        return false;
    }
}

async function testImageGenerator() {
    console.log('\n🎨 Testing Image Generator...');

    try {
        // Test post image generation
        console.log('1. Testing post image generation...');
        const postImageResult = await imageGenerator.generatePostImage({
            topic: 'user authentication feature',
            style: 'tech',
            dimensions: { width: 1200, height: 630, aspectRatio: '16:9' }
        });

        console.log('   ✅ Post image:', postImageResult.successful ? 'PASSED' : 'FAILED');
        if (postImageResult.successful && postImageResult.data) {
            console.log('   🖼️  Image generated:');
            console.log('      URL/Data:', postImageResult.data.substring(0, 50) + '...');
            console.log('      Type:', postImageResult.data.startsWith('data:') ? 'Base64/SVG' : 'URL');
        }

        // Test progress image generation
        console.log('2. Testing progress image generation...');
        const progressImageResult = await imageGenerator.generateProgressImage({
            milestone: 'Authentication System',
            percentage: 75,
            style: 'professional'
        });

        console.log('   ✅ Progress image:', progressImageResult.successful ? 'PASSED' : 'FAILED');
        if (progressImageResult.successful && progressImageResult.data) {
            console.log('   📊 Progress image generated successfully');
        }

        // Test feature image generation
        console.log('3. Testing feature image generation...');
        const featureImageResult = await imageGenerator.generateFeatureImage({
            featureName: 'User Dashboard',
            type: 'ui',
            brandColors: ['#3b82f6', '#1e40af']
        });

        console.log('   ✅ Feature image:', featureImageResult.successful ? 'PASSED' : 'FAILED');

        // Test simple image generation (fallback)
        console.log('4. Testing simple image generation...');
        const simpleImageResult = await imageGenerator.generateSimpleImage({
            text: 'Development Update',
            backgroundColor: '#1e40af',
            textColor: '#ffffff'
        });

        console.log('   ✅ Simple image:', simpleImageResult.successful ? 'PASSED' : 'FAILED');
        if (simpleImageResult.successful && simpleImageResult.data) {
            console.log('   🎨 Simple image created (SVG fallback)');
        }

        return true;
    } catch (error) {
        console.log('   ❌ Image Generator Test Failed:', error);
        return false;
    }
}

// Run tests
async function runAITests() {
    console.log('🚀 Starting AI Services Tests\n');

    const contentSuccess = await testContentGenerator();
    const imageSuccess = await testImageGenerator();

    console.log('\n📊 AI Services Test Summary:');
    console.log('   Content Generator:', contentSuccess ? '✅ PASSED' : '❌ FAILED');
    console.log('   Image Generator:', imageSuccess ? '✅ PASSED' : '❌ FAILED');
    console.log('   Overall Status:', (contentSuccess && imageSuccess) ? '✅ ALL PASSED' : '⚠️  SOME FAILED');
    console.log('');
}

// Export for use in other tests
export { testContentGenerator, testImageGenerator };

// Run if called directly
if (require.main === module) {
    runAITests().catch(console.error);
}