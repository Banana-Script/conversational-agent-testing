# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Windows Compatibility

On Windows, `npx tsx` does not properly capture stdout. Use this alternative:
```bash
node --import tsx src/index.ts [command] [options]
```

## Commands

**Run tests (simulate):**
```bash
# All tests in default directory
node --import tsx src/index.ts simulate

# Single file
node --import tsx src/index.ts simulate -f tests/scenariosdemo/smoke-test-basic-greeting-response.yaml

# Custom directory
node --import tsx src/index.ts simulate -d ./tests/scenarios

# Verbose mode (HTTP details)
node --import tsx src/index.ts simulate -v
```

**Other commands:**
```bash
node --import tsx src/index.ts create        # Create persistent tests in ElevenLabs
node --import tsx src/index.ts run -a <agent-id> -t <test-ids...>  # Run persistent tests
node --import tsx src/index.ts list          # List persistent tests
node --import tsx src/index.ts report <results.json>   # Generate report from results
node --import tsx src/index.ts analyze <results.json>  # Analyze severity with Claude
node --import tsx src/index.ts download-agent -p <provider> -a <agent-id>  # Download agent config
node --import tsx src/index.ts copy-agent -s <source-id> -d <dest-id>      # Copy agent config
```

**Run unit tests:**
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
```

## Architecture

Multi-provider conversational AI testing framework supporting ElevenLabs, Vapi, and Viernes.

### Provider System
- `src/adapters/provider-factory.ts` - Factory that creates providers based on type (`elevenlabs`, `vapi`, `viernes`)
- `src/providers/` - Provider implementations extending `TestProvider` base class
  - `vapi-provider.ts` - Uses Vapi Evals API
  - `chat-based-vapi-provider.ts` - Uses Vapi Chat API + OpenAI for evaluation (set `VAPI_USE_CHAT_API=true`)
  - `viernes-provider.ts` - Viernes chatbot platform

### Test Flow
1. `TestRunner` loads YAML test definitions from `tests/scenarios/`
2. `ProviderFactory.determineProvider()` selects provider per test (from test file, env var, or default)
3. Provider executes simulation and returns `SimulationResponse` with conversation and evaluation results
4. `SeverityAnalyzer` classifies failures (critical/high/medium/low) using Claude or basic fallback
5. `Reporter` generates markdown reports and deployment recommendations

### Key Types (`src/types/index.ts`)
- `TestDefinition` - YAML test structure with provider-specific configs (`vapi:`, `viernes:`)
- `TestResult` - Execution result with conversation, criteria results, timing
- `SimulationResponse` - Provider response with `simulated_conversation` and `analysis`
- `EvaluationCriterion` - Success criteria defined in YAML

### Test YAML Structure
```yaml
name: "Test Name"
provider: "viernes"  # elevenlabs | vapi | viernes

viernes:             # Provider-specific config
  organization_id: 143
  agent_id: 139
  max_turns: 10

simulated_user:
  prompt: "User persona description"
  first_message: "Initial message"
  language: "es"
  llm: "gpt-4o-mini"

evaluation_criteria:
  - id: "criterion-id"
    name: "Criterion Name"
    prompt: "What to evaluate"
```

## Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `TEST_PROVIDER` - Default provider (elevenlabs/vapi/viernes)
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_USE_CHAT_API`
- `VIERNES_ORGANIZATION_ID`, `VIERNES_AGENT_ID`, `VIERNES_BASE_URL`
- `OPENAI_API_KEY` - Required for Vapi Chat API mode and conversation generation
