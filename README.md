# Conversational Agent Testing 🧪

Toolkit for evaluating and testing conversational AI agents (voice & chat) across multiple providers.

## 🎯 Overview

A comprehensive testing framework designed for conversational AI agents, supporting both voice and text-based interactions. Currently integrated with ElevenLabs, with planned support for additional providers.

## 🎯 Features

- ✅ **Provider-agnostic architecture**: Designed to support multiple AI providers
- 🎙️ **Voice testing**: Test voice-based conversational agents
- 💬 **Chat testing**: Support for text-based conversational agents (coming soon)
- ✅ **YAML-based test definitions**: Simple and readable test format
- 🔄 **Two testing flows**:
  - **Direct simulation**: Execute tests immediately without saving
  - **Persistent tests**: Save tests in provider platform for reuse
- 📊 **Detailed reports**: JSON and Markdown with complete metrics
- 🚦 **Severity analysis**: Classify failures by severity (Critical/High/Medium/Low) with deployment gates
- 🤖 **Intelligent analysis**: Uses Claude CLI to understand context and business logic
- 🎨 **Friendly CLI**: Interface with colors and spinners
- 📝 **Customizable criteria**: Define your own evaluation criteria
- 🤖 **Automatic test generation**: Claude Code generates test cases from agent configuration
- 🔒 **Security**: Input validation, command injection prevention, and path traversal protection
- 💾 **Automatic backup**: Saves existing tests before regenerating

## 📋 Requirements

- Node.js 18+
- ElevenLabs account with API key (for ElevenLabs agents)
- Agent ID of your agent

## 🚀 Installation

```bash
git clone https://github.com/Banana-Script/conversational-agent-testing.git
cd conversational-agent-testing
npm install
```

Configure the `.env`:

```env
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_AGENT_ID=your_agent_id
```

## 📖 Available Commands

### 1. Direct Simulation (`simulate`)

Execute tests immediately using the simulation API:

```bash
# Run all tests
npm run simulate

# Run a single test file
npm run simulate -- -f tests/scenarios/happy-path-saludo-inicial.yaml

# Run with verbose HTTP logging (debugging)
npm run simulate -- --verbose

# Combine options
npm run simulate -- -f mytest.yaml --verbose
```

**Options:**
- `-d, --dir <directory>`: Test directory (default: `./tests/scenarios`)
- `-f, --file <file>`: Execute a single test file
- `-o, --output <directory>`: Results directory (default: `./results`)
- `-v, --verbose`: Enable detailed HTTP request/response logging

✨ **When to use**: Rapid development, prompt iteration, ad-hoc testing

📖 **Verbose Mode**: See [VERBOSE_MODE.md](./VERBOSE_MODE.md) for detailed debugging guide

### 2. Create Persistent Tests (`create`)

Save tests in your ElevenLabs account:

```bash
npm run create
```

Returns test IDs that you can reuse.

### 3. Run Persistent Tests (`run`)

Execute tests already created in ElevenLabs:

```bash
npm run run -- --agent agent_123 --tests test_456 test_789
```

✨ **When to use**: CI/CD, scheduled testing, regression tests

### 4. List Tests (`list`)

List all tests for an agent:

```bash
npm run list -- --agent agent_123
```

### 5. Generate Report (`report`)

Generate Markdown report from results:

```bash
npm run report results/test-results-*.json
```

### 6. Download Agent Configuration (`download`)

Download complete agent configuration in JSON format:

```bash
# Use the agent from .env (automatic)
npm run download

# Or specify an agent manually
npm run download -- --agent agent_123

# Change output directory
npm run download -- --output ./backups
```

Options:
- `--agent` (optional): Agent ID to download. If not specified, uses `ELEVENLABS_AGENT_ID` from .env
- `--output` (optional): Output directory (default: `./agents`)

✨ **When to use**:
- Backup configuration before making changes
- Document current agent configuration
- Version control prompts and configuration
- Compare configurations between different agents

📝 **Automatic prompt extraction**:
The command automatically extracts the agent's prompt to a separate `.md` file:
- JSON file: `<agent_id>.json` (configuration without prompt)
- MD file: `<agent_id>.md` (complete prompt)
- In JSON, the `conversation_config.agent.prompt.prompt` field will reference the markdown file

Example: For agent `agent_1401k6d9rrrzecdbww6x3jdyybx7` creates:
- `agents/agent_1401k6d9rrrzecdbww6x3jdyybx7.json`
- `agents/agent_1401k6d9rrrzecdbww6x3jdyybx7.md`

⚠️ **Note**: Downloaded files are saved in `./agents/` and are in `.gitignore` to avoid exposing sensitive information.

### 7. Copy Configuration Between Agents (`copy-agent`)

Copy complete configuration from source agent to destination agent:

```bash
npm run copy-agent -- --source source_agent_id --destination destination_agent_id
```

Options:
- `--source` or `-s` (required): Source agent ID to copy from
- `--destination` or `-d` (required): Destination agent ID to update

✨ **When to use**:
- Replicate agent configuration to another
- Migrate configuration between environments (dev → staging → prod)
- Create variants of a base agent
- Synchronize changes between multiple agents

🔄 **What gets copied**:
- `name` - Agent name
- `conversation_config` - Complete conversational configuration (prompt, model, temperature, etc.)
- `platform_settings` - Platform configurations
- `secrets` - Environment variables and secrets

⚠️ **Important**:
- Destination agent will be completely overwritten with source configuration
- Recommended to backup destination agent before copying: `npm run download -- --agent destination_agent_id`

**Complete usage example**:
```bash
# 1. Backup destination agent (recommended)
npm run download -- --agent destination_agent_123 --output ./backups

# 2. Copy configuration
npm run copy-agent -- --source source_agent_456 --destination destination_agent_123

# 3. Verify copy was successful
npm run download -- --agent destination_agent_123
```

### 8. Analyze Results Severity (`analyze`)

Analyze test results and classify failures by severity using Claude CLI:

```bash
# Analyze specific results file
npm run analyze -- results/test-results-2025-12-10T02-17-42-982Z.json

# Analyze most recent results
npm run analyze -- $(ls -t results/test-results-*.json | head -1)
```

🎯 **Severity Classification**:

| Severity | Description | Deployment Impact |
|----------|-------------|-------------------|
| 🔴 **Critical** | Core functionality broken, security issues, data corruption | ❌ Blocks deployment |
| 🟠 **High** | Main flows broken, severely degraded UX, integration failures | ❌ Blocks deployment |
| 🟡 **Medium** | Secondary flows affected, edge cases not handled | ⚠️ Should fix soon |
| 🟢 **Low** | Minor UX issues, suboptimal behavior | ✅ Can deploy |

📊 **Deployment Rule**: Only deployable if there are **no Critical AND no High** severity failures.

🤖 **How it works**:
1. Reads the test results JSON file
2. If Claude CLI is available, uses intelligent analysis considering:
   - Conversation context and business logic
   - Nature of failed criteria
   - Potential production impact
   - Testing limitations (interruptions, latency, voice tone)
3. If Claude CLI is unavailable, falls back to percentage-based analysis
4. Generates `severity-analysis-{timestamp}.json` with classifications
5. Updates the Markdown report with deployment status section

**Output includes**:
- Deployment status (deployable/not deployable) with confidence level
- Summary by severity (critical, high, medium, low counts)
- Detailed classification for each failed test
- Recommendations for fixing issues
- Testing notes about framework limitations

✨ **Confidence Levels**:
- 🟢 **High**: Clear bot behavior issue
- 🟡 **Medium**: Possible testing limitation
- 🟠 **Low**: Likely framework error, not bot issue

⚠️ **Prerequisites**:
- Claude Code CLI installed (optional, falls back to basic analysis)
- Test results JSON file from `npm run simulate`

### 9. Generate Tests Automatically (`generate:tests`)

Automatically generate test cases using Claude Code from agent configuration:

```bash
# Generate with base Claude Code (faster, fewer tokens)
npm run generate:tests

# Generate with qa-expert agent (better quality, more tokens)
npm run generate:tests:qa
```

🤖 **How it works**:
1. Verifies agent files exist (JSON + MD)
2. If they don't exist, runs `npm run download` automatically
3. **Creates automatic backup** of existing tests in `tests/scenarios-backup-<timestamp>/`
4. Cleans `tests/scenarios/` (previous tests are in backup)
5. Uses optimized prompts from `prompts/` to generate high-quality tests
6. Creates all necessary YAML files for complete coverage

✨ **Differences between the two commands**:

| Command | Claude Mode | Tokens | Quality | Min Tests | When to use |
|---------|-------------|--------|---------|-----------|-------------|
| `generate:tests` | Base Claude | Less ⚡ | Good ✓ | 10-25 | Rapid development, iteration |
| `generate:tests:qa` | qa-expert agent | More 💰 | Excellent ✓✓✓ | 20-30 | Production, exhaustive coverage |

📋 **Types of generated tests**:
- `happy-path-*.yaml` - Successful flows
- `edge-case-*.yaml` - Edge cases
- `error-*.yaml` - Error handling
- `validation-*.yaml` - Data validation
- `interruption-*.yaml` - User interruptions
- `p0-smoke-*.yaml` - Critical tests (QA mode only)
- `p1-*, p2-*, p3-*` - Priority classification (QA mode only)

🔒 **Security**:
- Input validation to prevent command injection
- Path traversal protection
- Automatic backup before deleting files
- Commands executed with `spawn` (no shell injection)

⚠️ **Prerequisites**:
- Claude Code CLI installed: `npm install -g @anthropic-ai/claude-code`
- Authenticated in Claude Code: `claude auth login`
- For `generate:tests:qa`: qa-expert agent configured globally

🔍 **Verify installation**:
```bash
npm run check:claude-cli
```

This command verifies that Claude Code CLI is correctly installed and configured.
If it fails, follow the instructions in [CLAUDE_CLI_SETUP.md](./CLAUDE_CLI_SETUP.md).

💾 **Recover previous tests**:
If you need to restore tests from a backup:
```bash
# List available backups
ls -la tests/scenarios-backup-*

# Restore from specific backup
cp tests/scenarios-backup-2025-11-12T02-47-50/*.yaml tests/scenarios/
```

## 📝 Creating Tests

### Two Testing Approaches

#### 🔄 Direct Simulation (`npm run simulate`)
Executes complete multi-turn conversations. The simulated user (LLM) interacts with your agent for several turns, then the entire conversation is evaluated.

**When to use**: Development, prompt iteration, testing complete conversational flows

#### 💾 Persistent Tests (`npm run create` + `npm run run`)
Creates single-turn tests saved in ElevenLabs. The agent responds ONCE and is compared against examples.

**When to use**: CI/CD, automated testing, regression validation

⚠️ **IMPORTANT**: DO NOT mix both approaches in the same test.

### YAML Format

```yaml
name: "Test Name"
description: "What this test validates"
agent_id: "${ELEVENLABS_AGENT_ID}"
type: "llm"  # Only for persistent tests

simulated_user:
  # IMPORTANT: prompt must be a simple STRING
  prompt: "Simulated user behavior..."
  first_message: "Hello"
  language: "en"
  temperature: 0.4  # Optional: 0.0-1.0

# OPTION 1: For direct simulation (complete conversation)
evaluation_criteria:
  - id: "criterion-1"
    name: "Success Criterion"
    prompt: "Evaluate if the agent fulfilled..."
    use_knowledge_base: false

# OPTION 2: For persistent tests (single turn)
success_condition: "The agent must..."
success_examples:
  - "Appropriate response example 1"
failure_examples:
  - "Inappropriate response example 1"

dynamic_variables:
  customer_name: "Maria Gonzalez"
  document: "1234567"
```

**📖 See complete template**: `tests/template.yaml`

### 3 Example Tests Included

- `happy-path.yaml`: Complete successful flow
- `invalid-data.yaml`: Invalid data handling
- `callback-scheduling.yaml`: Callback scheduling

## 🔄 Workflows

### Rapid Development

```bash
# 1. Create your YAML test in tests/scenarios/
# 2. Execute simulation
npm run simulate

# 3. Analyze severity (optional but recommended)
npm run analyze -- $(ls -t results/test-results-*.json | head -1)

# 4. Review results in results/
# 5. Iterate adjusting the YAML
```

### Production/CI

```bash
# 1. Create persistent tests once
npm run create

# 2. Save the test IDs
# 3. Execute in CI/CD
npm run run -- --agent $AGENT_ID --tests $TEST_IDS

# 4. Analyze severity for deployment decision
npm run analyze -- $(ls -t results/test-results-*.json | head -1)

# 5. Check deployment status
cat results/severity-analysis-*.json | jq '.deployment_status'
```

### Pre-deployment Check

```bash
# Complete flow with deployment gate
npm run simulate && \
npm run analyze -- $(ls -t results/test-results-*.json | head -1) && \
DEPLOYABLE=$(cat $(ls -t results/severity-analysis-*.json | head -1) | jq -r '.deployment_status.is_deployable') && \
if [ "$DEPLOYABLE" = "true" ]; then
  echo "✅ Ready to deploy!"
else
  echo "❌ Not deployable - fix critical/high issues first"
  exit 1
fi
```

## 📊 Results

### Console Output

```
✅ Successful Validation - Happy Path (6/6 criteria, 12500ms)
❌ Invalid Data Handling (4/5 criteria, 15200ms)
```

### JSON (`results/test-results-*.json`)

```json
{
  "generated_at": "2025-01-11T...",
  "total_tests": 3,
  "successful_tests": 2,
  "results": [...]
}
```

### Markdown (`results/report-*.md`)

Complete report with:
- **🚦 Deployment Status** (when severity analysis is run)
- Executive summary
- Test table
- Complete transcriptions
- Criteria and rationales

### Severity Analysis (`results/severity-analysis-*.json`)

When running `npm run analyze`, generates:
```json
{
  "analysis_timestamp": "2025-12-10T02:17:42.984Z",
  "deployment_status": {
    "is_deployable": false,
    "reason": "2 critical and 1 high severity failures",
    "confidence": "high"
  },
  "summary": {
    "total_tests": 11,
    "passed_tests": 6,
    "failed_tests": 5,
    "critical": 2,
    "high": 1,
    "medium": 1,
    "low": 1
  },
  "test_classifications": [...],
  "recommendations": [...],
  "testing_notes": [...]
}
```

## 🏗️ Project Structure

```
conversational-agent-testing/
├── src/
│   ├── api/elevenlabs-client.ts      # API client
│   ├── testing/
│   │   ├── test-runner.ts            # Test runner
│   │   ├── reporter.ts               # Reports generation
│   │   └── severity-analyzer.ts      # Severity analysis with Claude
│   ├── types/index.ts                # TS types
│   └── index.ts                      # CLI
├── prompts/
│   └── analyze-results.md            # Prompt for severity analysis
├── tests/
│   ├── template.yaml                 # Template
│   └── scenarios/                    # Tests
└── results/                          # Results & analysis
```

## 🔧 Advanced Configuration

### Dynamic Variables

Customize tests without duplicating:

```yaml
dynamic_variables:
  customer_name: "Juan"
  amount: "1000000"
```

### Tool Mocking

Simulate external tools:

```yaml
tool_mock_config:
  query_db:
    return_value: "OK"
    should_fail: false
```

## 🔒 Security and Improvements

### Implemented Security Improvements

This framework includes multiple security layers to protect against common vulnerabilities:

#### ✅ Command Injection Prevention
- Use of `spawn()` with argument array (no shell execution)
- Strict validation of all inputs
- `shell: false` to prevent malicious metacharacters

#### ✅ Path Traversal Prevention
- Agent ID validation with regex: `/^[a-zA-Z0-9_-]{1,100}$/`
- Detection of traversal patterns: `..`, absolute paths, drive letters
- Maximum 100 characters to prevent buffer overflow

#### ✅ Data Protection
- Automatic backup before deleting files
- `.gitignore` configured to avoid commits of sensitive data
- Agent files excluded from version control

#### ✅ Severity Analyzer Security
- Path validation with null byte detection
- Absolute path requirement for file operations
- Race condition prevention with settled flags
- Timeout protection (5 minutes) for Claude CLI execution
- Constructor validation for empty/invalid paths
- `shell: false` in all subprocess spawning

### Validation Tests

To verify that security measures work correctly:

```bash
node scripts/test-validation.js
```

This runs 6 security tests:
1. ✅ Block path traversal in agent ID
2. ✅ Reject invalid characters
3. ✅ Required agent ID validation
4. ✅ Accept valid agent IDs
5. ✅ Block path traversal in file paths
6. ✅ Accept valid relative paths

### Improvement Documentation

For complete details on security and optimization improvements:

📄 **[SECURITY_AND_OPTIMIZATION_IMPROVEMENTS.md](./SECURITY_AND_OPTIMIZATION_IMPROVEMENTS.md)**

Includes:
- Detailed analysis of fixed vulnerabilities
- Before/after comparisons
- Impact metrics
- Future recommendations

## 🐛 Troubleshooting

### Error: ELEVENLABS_API_KEY not found

```bash
cat .env | grep ELEVENLABS_API_KEY
```

### Error: Invalid ELEVENLABS_AGENT_ID

If you see this error, your agent ID contains characters not allowed. Only accepts:
- Letters (A-Z, a-z)
- Numbers (0-9)
- Hyphens (-)
- Underscores (_)
- Maximum 100 characters

Valid example: `agent_1401k6d9rrrzecdbww6x3jdyybx7`

### Error 422 when creating tests

Verify that `agent_id` is correct and the agent exists.

### Error: spawn claude ENOENT

Claude Code CLI is not installed or not in PATH.

**Quick solution:**

```bash
# 1. Verify the problem
npm run check:claude-cli

# 2. Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 3. Authenticate
claude auth login

# 4. Verify installation
claude --version

# 5. Run verification again
npm run check:claude-cli
```

**Important**: Don't confuse Claude Code Desktop (desktop application) with Claude Code CLI (terminal command). Scripts need the CLI installed globally.

For more details, see [CLAUDE_CLI_SETUP.md](./CLAUDE_CLI_SETUP.md)

### Slow tests

Reduce `new_turns_limit`:

```yaml
new_turns_limit: 20
```

### Recover accidentally deleted tests

Tests are automatically backed up before regenerating:

```bash
# View available backups
ls -la tests/scenarios-backup-*

# Restore from most recent backup
LATEST_BACKUP=$(ls -td tests/scenarios-backup-* | head -1)
cp $LATEST_BACKUP/*.yaml tests/scenarios/
```

## 🔗 Links

- [ElevenLabs Documentation](https://elevenlabs.io/docs)
- [API Reference - Tests](https://elevenlabs.io/docs/api-reference/tests/create)
- [API Reference - Simulate](https://elevenlabs.io/docs/api-reference/agents/simulate-conversation)

## 🗺️ Roadmap

### Planned Features
- 💬 **Chat provider support**: Integration with OpenAI, Anthropic, and other chat providers
- 🔌 **Plugin system**: Extensible architecture for custom providers
- 📈 **Advanced analytics**: Performance metrics and trend analysis
- 🌐 **Multi-language support**: Testing in multiple languages
- 🎯 **A/B testing**: Compare agent versions

---

**Developed by [Banana-Script](https://github.com/Banana-Script)** 🍌
