#!/usr/bin/env node

import { TestGenerator } from './lib/test-generator.js';

/**
 * Generate test cases using QA Expert agent
 *
 * Security improvements:
 * - Input validation via TestGenerator class
 * - Safe command execution using spawn (no shell injection)
 * - Path validation to prevent directory traversal
 * - Backup mechanism before file deletion
 *
 * Features:
 * - Uses optimized prompt from prompts/optimized-qa-expert.md
 * - Invokes qa-expert subagent for comprehensive QA analysis
 * - Auto-downloads agent config if missing
 * - Creates backup before cleaning tests
 * - Generates production-ready test suite with priority classification
 */

const generator = new TestGenerator('qa');
generator.generate();
