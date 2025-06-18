// tests/github-services.test.ts

import { githubCollector } from '../src/services/github/collector';
import { githubParser } from '../src/services/github/parser';
import { GitHubCommit, ProcessedCommit } from '../src/types';

console.log('🧪 Testing GitHub Services...\n');

async function testGitHubCollector() {
    console.log('📊 Testing GitHub Collector...');

    try {
        // Test repository validation
        console.log('1. Testing repository validation...');
        const repoValidation = await githubCollector.validateRepository();
        console.log('   ✅ Repository validation:', repoValidation.successful ? 'PASSED' : 'FAILED');
        if (!repoValidation.successful) {
            console.log('   ❌ Error:', repoValidation.error);
        }

        // Test repository info
        console.log('2. Testing repository info...');
        const repoInfo = await githubCollector.getRepositoryInfo();
        console.log('   ✅ Repository info:', repoInfo.successful ? 'PASSED' : 'FAILED');
        if (repoInfo.successful && repoInfo.data) {
            console.log('   📋 Repository:', repoInfo.data.name);
            console.log('   📝 Description:', repoInfo.data.description || 'No description');
            console.log('   💻 Language:', repoInfo.data.language);
            console.log('   ⭐ Stars:', repoInfo.data.stars);
        }

        // Test recent commits fetching
        console.log('3. Testing recent commits...');
        const commitsResult = await githubCollector.fetchRecentCommits();
        console.log('   ✅ Fetch commits:', commitsResult.successful ? 'PASSED' : 'FAILED');
        if (commitsResult.successful && commitsResult.data) {
            console.log('   📈 Commits found:', commitsResult.data.length);
            if (commitsResult.data.length > 0) {
                const firstCommit = commitsResult.data[0];
                console.log('   📝 Latest commit:', firstCommit?.commit.message.substring(0, 50) + '...');
                console.log('   👤 Author:', firstCommit?.commit.author.name);
                console.log('   📅 Date:', new Date(firstCommit?.commit.author.date || '').toLocaleDateString());
            }
        } else {
            console.log('   ❌ Error:', commitsResult.error);
        }

        return commitsResult.data || [];
    } catch (error) {
        console.log('   ❌ GitHub Collector Test Failed:', error);
        return [];
    }
}

async function testGitHubParser(commits: GitHubCommit[]) {
    console.log('\n📊 Testing GitHub Parser...');

    try {
        if (commits.length === 0) {
            console.log('   ⚠️  No commits to parse');
            return [];
        }

        // Test commit parsing
        console.log('1. Testing commit parsing...');
        const parseResult = await githubParser.parseCommits(commits);
        console.log('   ✅ Parse commits:', parseResult.successful ? 'PASSED' : 'FAILED');

        if (parseResult.successful && parseResult.data) {
            console.log('   📊 Processed commits:', parseResult.data.length);

            // Show commit analysis
            if (parseResult.data.length > 0) {
                const processed = parseResult.data[0];
                console.log('   📝 Sample processed commit:');
                console.log('      Message:', processed?.message);
                console.log('      Type:', processed?.type);
                console.log('      Category:', processed?.category);
                console.log('      Significance:', processed?.significance);
                console.log('      Files changed:', processed?.filesChanged);
            }

            // Test grouping by impact
            console.log('2. Testing commit grouping...');
            const groupResult = githubParser.groupCommitsByImpact(parseResult.data);
            console.log('   ✅ Group commits:', groupResult.successful ? 'PASSED' : 'FAILED');

            if (groupResult.successful && groupResult.data) {
                console.log('   📈 Groups created:', groupResult.data.length);
                groupResult.data.forEach(group => {
                    console.log(`      ${group.category}: ${group.commits.length} commits (${group.impact} impact)`);
                    console.log(`      Summary: ${group.summary}`);
                });
            }

            return parseResult.data;
        } else {
            console.log('   ❌ Error:', parseResult.error);
            return [];
        }
    } catch (error) {
        console.log('   ❌ GitHub Parser Test Failed:', error);
        return [];
    }
}

// Run tests
async function runGitHubTests() {
    console.log('🚀 Starting GitHub Services Tests\n');

    const commits = await testGitHubCollector();
    const processedCommits = await testGitHubParser(commits);

    console.log('\n📊 Test Summary:');
    console.log('   Raw commits fetched:', commits.length);
    console.log('   Processed commits:', processedCommits.length);
    console.log('   Test status: ✅ COMPLETED\n');
}

// Export for use in other tests
export { testGitHubCollector, testGitHubParser };

// Run if called directly
if (require.main === module) {
    runGitHubTests().catch(console.error);
}