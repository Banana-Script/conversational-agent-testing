# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-provider testing framework for conversational AI agents (voice and chat). It supports ElevenLabs, Vapi, and Viernes providers with a provider-agnostic architecture.

## Common Commands

```bash
# Run tests via simulation (multi-provider)
npm run simulate                           # Run all tests
npm run simulate -- -f tests/scenarios/happy-path.yaml  # Single test
npm run simulate -- --verbose              # With HTTP logging

# Unit tests (Vitest)
npm test                                   # Run all tests once
npm run test:watch                         # Watch mode
npm run test:unit                          # Exclude integration tests
npm run test:integration                   # Only integration tests
npm run test:coverage                      # With coverage report

# Build
npm run build                              # Compile TypeScript

# Other commands
npm run analyze -- <results-file.json>     # Analyze severity with Claude
npm run download                           # Download agent config
npm run generate:tests                     # Auto-generate tests with Claude Code
```

## Architecture

### Multi-Provider System

The framework uses a provider pattern for supporting multiple AI platforms:

```
src/providers/base-provider.ts    # TestProvider interface and BaseTestProvider abstract class
src/providers/elevenlabs-provider.ts
src/providers/vapi-provider.ts
src/providers/viernes-provider.ts
src/adapters/provider-factory.ts  # Factory creates providers based on type/env vars
```

Provider selection order:
1. `provider` field in test YAML
2. `TEST_PROVIDER` environment variable
3. Default: `elevenlabs`

### Core Flow

1. **Test Loading**: `TestRunner.loadTest()` parses YAML, replaces `${ENV_VAR}` syntax, validates with Zod
2. **Provider Selection**: `ProviderFactory.determineProvider()` chooses provider
3. **Execution**: Provider's `executeTest()` runs simulation
4. **Evaluation**: Response analyzed against `evaluation_criteria`
5. **Reporting**: `Reporter` generates JSON/Markdown, `SeverityAnalyzer` classifies failures
6. **Auto-Correction**: If tests fail, `PromptCorrector` generates corrected instructions

### Key Components

- `src/index.ts` - CLI commands (Commander.js)
- `src/testing/test-runner.ts` - Test orchestration with multi-provider support
- `src/testing/severity-analyzer.ts` - Claude-based failure classification
- `src/testing/prompt-corrector.ts` - Auto-generates corrected instructions on test failures
- `src/validation/schemas.ts` - Zod schemas for YAML validation
- `src/utils/path-validator.ts` - Security: path traversal prevention

### API Clients

- `src/api/elevenlabs-client.ts` - ElevenLabs simulation/test API
- `src/api/vapi-client.ts` - Vapi evals API
- `src/api/viernes-client.ts` - Viernes webhook-based testing
- `src/api/openai-client.ts` - LLM evaluation calls

## Test YAML Structure

Tests are YAML files in `tests/scenarios/`. Two evaluation approaches:

**Simulation (npm run simulate)**: Multi-turn conversation with `evaluation_criteria`:
```yaml
evaluation_criteria:
  - id: "criterion-1"
    name: "Criterion Name"
    prompt: "Evaluate if the agent..."  # Converted to conversation_goal_prompt
    use_knowledge_base: false
```

**Persistent (npm run create)**: Single-turn with success/failure examples:
```yaml
success_condition: "Agent must..."
success_examples: ["Good response"]
failure_examples: ["Bad response"]
```

Provider-specific config via `vapi:` or `viernes:` blocks.

## Environment Variables

```
# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=

# Vapi
VAPI_API_KEY=
VAPI_ASSISTANT_ID=
VAPI_USE_CHAT_API=true  # Use Chat API + OpenAI instead of Evals API

# Viernes
VIERNES_API_KEY=
VIERNES_BASE_URL=
VIERNES_ORGANIZATION_ID=

# General
TEST_PROVIDER=elevenlabs|vapi|viernes
VERBOSE_HTTP=true  # Enable HTTP logging
OPENAI_API_KEY=    # Required for AI-powered instruction correction
```

## Code Patterns

- TypeScript with ES modules (`"type": "module"`)
- Zod for runtime validation (`src/validation/schemas.ts`)
- Environment variable substitution: `${VAR_NAME}` in YAML
- Path security validation before file operations
- Async/await throughout with proper error handling

## Auto-Correction of Instructions

When `npm run simulate` detects failed tests, it automatically generates a corrected instructions file:

- **Output**: `results/corrected-instructions-{timestamp}.md`
- **Requires**: Agent config downloaded via `npm run download` (stored in `./agents/`)
- **AI-powered**: Uses OpenAI (`OPENAI_API_KEY`) for intelligent corrections
- **Fallback**: Basic analysis if no OpenAI key configured

The corrected instructions file includes:
1. Summary of problems found in failed tests
2. Specific corrections applied
3. Complete corrected instructions ready to copy/paste
4. Implementation notes

Prompt template: `prompts/correct-instructions.md`
