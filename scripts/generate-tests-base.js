#!/usr/bin/env node

import { TestGenerator } from './lib/test-generator.js';

/**
 * Generate test cases using base Claude Code
 *
 * Security improvements:
 * - Input validation via TestGenerator class
 * - Safe command execution using spawn (no shell injection)
 * - Path validation to prevent directory traversal
 * - Backup mechanism before file deletion
 *
 * Features:
 * - Uses optimized prompt from prompts/optimized-base-claude.md
 * - Auto-downloads agent config if missing
 * - Creates backup before cleaning tests
 */

const generator = new TestGenerator('base');
generator.generate();
