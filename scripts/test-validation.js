#!/usr/bin/env node

import { TestGenerator } from './lib/test-generator.js';

console.log('🧪 Testing input validation...\n');

// Test 1: Invalid agent ID with path traversal
console.log('Test 1: Path traversal attempt');
process.env.ELEVENLABS_AGENT_ID = '../etc/passwd';

try {
  const generator = new TestGenerator('base');
  console.log('❌ FAILED: Should have thrown validation error!');
  process.exit(1);
} catch (error) {
  console.log('✅ PASSED: Blocked path traversal');
  console.log(`   Error: ${error.message}\n`);
}

// Test 2: Invalid characters
console.log('Test 2: Invalid characters (@, $)');
process.env.ELEVENLABS_AGENT_ID = 'agent@123$test';

try {
  const generator = new TestGenerator('base');
  console.log('❌ FAILED: Should have thrown validation error!');
  process.exit(1);
} catch (error) {
  console.log('✅ PASSED: Blocked invalid characters');
  console.log(`   Error: ${error.message}\n`);
}

// Test 3: Empty agent ID
console.log('Test 3: Missing agent ID');
delete process.env.ELEVENLABS_AGENT_ID;

try {
  const generator = new TestGenerator('base');
  console.log('❌ FAILED: Should have thrown validation error!');
  process.exit(1);
} catch (error) {
  console.log('✅ PASSED: Blocked missing agent ID');
  console.log(`   Error: ${error.message}\n`);
}

// Test 4: Valid agent ID
console.log('Test 4: Valid agent ID');
process.env.ELEVENLABS_AGENT_ID = 'agent_1401k6d9rrrzecdbww6x3jdyybx7';

try {
  const generator = new TestGenerator('base');
  console.log('✅ PASSED: Accepted valid agent ID\n');
} catch (error) {
  console.log('❌ FAILED: Should have accepted valid ID!');
  console.log(`   Error: ${error.message}`);
  process.exit(1);
}

// Test 5: Path validation
console.log('Test 5: Path traversal validation');
process.env.ELEVENLABS_AGENT_ID = 'valid_agent_123';

try {
  const generator = new TestGenerator('base');
  generator.validatePath('../../../etc/passwd');
  console.log('❌ FAILED: Should have blocked path traversal!');
  process.exit(1);
} catch (error) {
  console.log('✅ PASSED: Blocked path traversal in validatePath');
  console.log(`   Error: ${error.message}\n`);
}

// Test 6: Valid relative path
console.log('Test 6: Valid relative path');
try {
  const generator = new TestGenerator('base');
  const result = generator.validatePath('tests/scenarios/test.yaml');
  console.log('✅ PASSED: Accepted valid relative path\n');
} catch (error) {
  console.log('❌ FAILED: Should have accepted valid path!');
  console.log(`   Error: ${error.message}`);
  process.exit(1);
}

console.log('🎉 All validation tests passed!');
