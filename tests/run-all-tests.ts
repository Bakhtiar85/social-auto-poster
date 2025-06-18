// tests/run-all-tests.ts

import { testGitHubCollector, testGitHubParser } from './github-services.test';
import { testContentGenerator, testImageGenerator } from './ai-services.test';
import { testMemoryStore, testContextManager } from './memory-services.test';

console.log('🚀 SOCIAL AUTO-POSTER COMPREHENSIVE TEST SUITE');
console.log('='.repeat(50));
console.log('Testing all services before finalizing social media integration\n');

async function runComprehensiveTests() {
    const results = {
        github: { collector: false, parser: false },
        ai: { content: false, image: false },
        memory: { store: false, context: false },
        overall: false
    };

    console.log('📊 PHASE 1: GITHUB SERVICES');
    console.log('-'.repeat(30));

    try {
        // Test GitHub services
        const commits = await testGitHubCollector();
        results.github.collector = true;

        const processedCommits = await testGitHubParser(commits);
        results.github.parser = true;

        console.log('✅ GitHub services: ALL PASSED\n');
    } catch (error) {
        console.log('❌ GitHub services: FAILED -', error);
        console.log('');
    }

    console.log('🤖 PHASE 2: AI SERVICES');
    console.log('-'.repeat(30));

    try {
        // Test AI services
        results.ai.content = await testContentGenerator();
        results.ai.image = await testImageGenerator();

        console.log('✅ AI services: ALL PASSED\n');
    } catch (error) {
        console.log('❌ AI services: FAILED -', error);
        console.log('');
    }

    console.log('🧠 PHASE 3: MEMORY SERVICES');
    console.log('-'.repeat(30));

    try {
        // Test Memory services
        results.memory.store = await testMemoryStore();
        results.memory.context = await testContextManager();

        console.log('✅ Memory services: ALL PASSED\n');
    } catch (error) {
        console.log('❌ Memory services: FAILED -', error);
        console.log('');
    }

    // Calculate overall results
    const allPassed = Object.values(results.github).every(Boolean) &&
        Object.values(results.ai).every(Boolean) &&
        Object.values(results.memory).every(Boolean);

    results.overall = allPassed;

    // Final report
    console.log('📋 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(50));
    console.log('🐙 GitHub Services:');
    console.log(`   Collector: ${results.github.collector ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Parser: ${results.github.parser ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');
    console.log('🤖 AI Services:');
    console.log(`   Content Generator: ${results.ai.content ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Image Generator: ${results.ai.image ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');
    console.log('🧠 Memory Services:');
    console.log(`   Memory Store: ${results.memory.store ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Context Manager: ${results.memory.context ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');
    console.log('🎯 OVERALL STATUS:');
    console.log(`   ${results.overall ? '🎉 ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);
    console.log('');

    if (results.overall) {
        console.log('🚀 READY FOR SOCIAL MEDIA INTEGRATION!');
        console.log('   Next steps:');
        console.log('   1. Add LinkedIn API tokens');
        console.log('   2. Add Facebook API tokens');
        console.log('   3. Test full posting workflow');
        console.log('   4. Deploy to production');
    } else {
        console.log('🔧 ISSUES DETECTED:');
        console.log('   Please fix failing tests before proceeding');
        console.log('   Check API keys and network connectivity');
    }

    console.log('');
    console.log('='.repeat(50));

    return results;
}

// Run comprehensive tests
if (require.main === module) {
    runComprehensiveTests()
        .then((results) => {
            process.exit(results.overall ? 0 : 1);
        })
        .catch((error) => {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        });
}

export { runComprehensiveTests };