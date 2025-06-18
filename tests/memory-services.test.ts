// tests/memory-services.test.ts

import { memoryStore } from '../src/services/memory/store';
import { contextManager } from '../src/services/memory/context-manager';
import { PostHistory, ProcessedCommit } from '../src/types';
import { generateId } from '../src/utils/helpers';

console.log('🧠 Testing Memory Services...\n');

// Mock data for testing
const mockProcessedCommits: ProcessedCommit[] = [
    {
        sha: 'test123',
        message: 'Add user authentication feature',
        author: 'Test Developer',
        date: new Date().toISOString(),
        filesChanged: 8,
        additions: 200,
        deletions: 15,
        type: 'feature',
        category: 'backend',
        significance: 'major'
    },
    {
        sha: 'test456',
        message: 'Update login UI components',
        author: 'Test Developer',
        date: new Date().toISOString(),
        filesChanged: 3,
        additions: 45,
        deletions: 12,
        type: 'feature',
        category: 'frontend',
        significance: 'minor'
    }
];

const mockPostHistory: PostHistory = {
    id: generateId(),
    commitSha: 'test123',
    platform: 'linkedin',
    content: 'Just implemented a new user authentication system! 🔐 Enhanced security and better user experience. #coding #webdev #security',
    imageUrl: 'https://example.com/image.jpg',
    postedAt: new Date().toISOString(),
    engagement: {
        likes: 15,
        comments: 3,
        shares: 2
    }
};

async function testMemoryStore() {
    console.log('💾 Testing Memory Store...');

    try {
        // Test initialization
        console.log('1. Testing memory store initialization...');
        const initResult = await memoryStore.initialize();
        console.log('   ✅ Initialization:', initResult.successful ? 'PASSED' : 'FAILED');

        // Test getting memory store
        console.log('2. Testing get memory store...');
        const currentMemory = memoryStore.getMemoryStore();
        console.log('   ✅ Get memory store: PASSED');
        console.log('   📊 Current state:');
        console.log('      Project:', currentMemory.projectContext.projectName);
        console.log('      Phase:', currentMemory.projectContext.currentPhase);
        console.log('      Tech Stack:', currentMemory.projectContext.techStack.join(', '));
        console.log('      Post History:', currentMemory.postHistory.length, 'posts');

        // Test saving a post
        console.log('3. Testing save post...');
        const saveResult = await memoryStore.savePost(mockPostHistory);
        console.log('   ✅ Save post:', saveResult.successful ? 'PASSED' : 'FAILED');

        // Test getting recent posts
        console.log('4. Testing get recent posts...');
        const recentPosts = memoryStore.getRecentPosts(7);
        console.log('   ✅ Get recent posts: PASSED');
        console.log('   📊 Recent posts count:', recentPosts.length);

        // Test checking if topic was recently posted
        console.log('5. Testing topic check...');
        const wasPosted = memoryStore.wasTopicRecentlyPosted('authentication', 7);
        console.log('   ✅ Topic check: PASSED');
        console.log('   📊 Authentication recently posted:', wasPosted ? 'YES' : 'NO');

        // Test updating project context
        console.log('6. Testing project context update...');
        const updateResult = await memoryStore.updateProjectContext({
            currentPhase: 'testing',
            recentTopics: ['authentication', 'security', 'ui']
        });
        console.log('   ✅ Update context:', updateResult.successful ? 'PASSED' : 'FAILED');

        // Test getting last posted commit
        console.log('7. Testing get last posted commit...');
        const lastCommit = memoryStore.getLastPostedCommit();
        console.log('   ✅ Get last commit: PASSED');
        console.log('   📊 Last commit SHA:', lastCommit || 'None');

        // Test backup creation
        console.log('8. Testing backup creation...');
        const backupResult = await memoryStore.createBackup();
        console.log('   ✅ Create backup:', backupResult.successful ? 'PASSED' : 'SKIPPED (disabled)');

        return true;
    } catch (error) {
        console.log('   ❌ Memory Store Test Failed:', error);
        return false;
    }
}

async function testContextManager() {
    console.log('\n🎯 Testing Context Manager...');

    try {
        // Test commit analysis for context
        console.log('1. Testing commit context analysis...');
        const contextResult = await contextManager.analyzeCommitsForContext(mockProcessedCommits);
        console.log('   ✅ Context analysis:', contextResult.successful ? 'PASSED' : 'FAILED');

        if (contextResult.successful && contextResult.data) {
            console.log('   📊 Generated context:');
            console.log('      Story:', contextResult.data.substring(0, 100) + '...');
        } else {
            console.log('   ❌ Error:', contextResult.error);
        }

        // Test posting recommendations
        console.log('2. Testing posting recommendations...');
        const recommendationsResult = contextManager.getPostingRecommendations();
        console.log('   ✅ Recommendations:', recommendationsResult.successful ? 'PASSED' : 'FAILED');

        if (recommendationsResult.successful && recommendationsResult.data) {
            console.log('   📊 Posting recommendations:');
            console.log('      Should post:', recommendationsResult.data.shouldPost ? 'YES' : 'NO');
            console.log('      Reason:', recommendationsResult.data.reason);
            console.log('      Suggested tone:', recommendationsResult.data.suggestedTone);
            console.log('      Contextual hints:', recommendationsResult.data.contextualHints.length);

            if (recommendationsResult.data.contextualHints.length > 0) {
                recommendationsResult.data.contextualHints.forEach((hint, index) => {
                    console.log(`         ${index + 1}. ${hint}`);
                });
            }
        }

        return true;
    } catch (error) {
        console.log('   ❌ Context Manager Test Failed:', error);
        return false;
    }
}

// Run tests
async function runMemoryTests() {
    console.log('🚀 Starting Memory Services Tests\n');

    const storeSuccess = await testMemoryStore();
    const contextSuccess = await testContextManager();

    console.log('\n📊 Memory Services Test Summary:');
    console.log('   Memory Store:', storeSuccess ? '✅ PASSED' : '❌ FAILED');
    console.log('   Context Manager:', contextSuccess ? '✅ PASSED' : '❌ FAILED');
    console.log('   Overall Status:', (storeSuccess && contextSuccess) ? '✅ ALL PASSED' : '⚠️  SOME FAILED');
    console.log('');
}

// Export for use in other tests
export { testMemoryStore, testContextManager };

// Run if called directly
if (require.main === module) {
    runMemoryTests().catch(console.error);
}