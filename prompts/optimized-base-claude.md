# Test Case Generation: Base Claude Prompt

## Objective
Generate comprehensive YAML test cases for ElevenLabs conversational AI agent validation.

## Input Files
- Agent configuration: `@${agentJsonPath}`
- Agent prompt: `@${agentMdPath}`
- Template reference: `@./tests/template.yaml`

---

## Task Workflow

### Phase 1: Configuration Analysis
Parse the agent configuration and identify:

1. **Functional capabilities**: All features, commands, and operations the agent supports
2. **Conversation flows**: Entry points, decision trees, and terminal states
3. **Tool integrations**: External APIs, functions, and their input/output contracts
4. **Dynamic variables**: Extract from `conversation_config.agent.dynamic_variables.dynamic_variable_placeholders` in the JSON file
5. **Success conditions**: Expected outcomes for each user intent
6. **Failure modes**: Error states, timeouts, invalid inputs, and fallback behaviors

Output a mental model covering:
- Primary user intents (minimum 3, typical 5-8)
- Tool dependencies and call sequences
- **Variable substitution patterns**: List ALL dynamic variables found in the JSON
- Edge cases by category (validation, state, timing)

**CRITICAL**: Extract the complete list of dynamic variables from the agent JSON configuration. These MUST be used in ALL generated tests.

---

### Phase 2: Test Strategy Definition

Based on analysis, define test coverage across these categories:

**A. Happy Path Tests** (minimum 1 per primary intent)
- Standard successful interactions
- Common user request patterns
- Expected tool invocations
- Positive validation scenarios

**B. Edge Case Tests** (minimum 2 per functional area)
- Boundary values (empty strings, max lengths, special characters)
- Uncommon but valid input combinations
- Sequential interactions (state dependencies)
- Timing variations (early termination, delayed responses)

**C. Error Handling Tests** (minimum 1 per tool/validation)
- Invalid input formats
- Missing required parameters
- Tool failures or timeouts
- Unexpected user interruptions

**D. Regression Tests** (if configuration indicates versioning)
- Critical path preservation
- Backward compatibility checks

Target total: **Minimum 10 tests, typical 15-25** based on agent complexity.

---

### Phase 3: YAML Test Generation

For each test case, generate a separate YAML file following this structure:

```yaml
agent_id: "${ELEVENLABS_AGENT_ID}"
name: "<category>-<intent>-<variant>"
description: "<brief test description>"
simulated_user:
  prompt: "<single-line behavior description>"
  first_message: "<initial user message>"
  language: "es"
evaluation_criteria:
  - id: "criterion-1"
    name: "Criterion Name"
    prompt: "<specific success criterion description>"
    use_knowledge_base: false
  - id: "criterion-2"
    name: "Another Criterion"
    prompt: "<another criterion description>"
    use_knowledge_base: false
dynamic_variables:
  # IMPORTANT: Copy ALL variables from conversation_config.agent.dynamic_variables.dynamic_variable_placeholders
  # Modify values as needed for each test scenario (e.g., use "No aplica" for testing omission logic)
  # Example values - replace with actual variables from agent JSON:
  variable_name_1: "test value 1"
  variable_name_2: "test value 2"
new_turns_limit: 25
```

**Critical Constraints:**
1. `description` field is REQUIRED (brief test description)
2. `simulated_user.prompt` MUST be a single-line string (no YAML multiline syntax)
3. `evaluation_criteria` MUST be array of objects with `id`, `name`, `prompt`, and `use_knowledge_base` fields
4. Each `id` must be unique within the test (use format: "criterion-1", "criterion-2", etc.)
5. **`dynamic_variables` is MANDATORY in EVERY test**: Copy ALL variables from the agent JSON and modify values per scenario
6. Use ONLY `evaluation_criteria` format (NOT `success_examples` or mixed formats)
7. Each criterion must be independently verifiable (no ambiguous language)
8. Test names must be unique and follow pattern: `{category}-{intent}-{variant}.yaml`
9. Language must be "es" for Spanish agent
10. `new_turns_limit: 25` should be included to keep tests efficient

**Naming Conventions:**
- `happy-path-*.yaml` - Successful standard flows
- `edge-case-*.yaml` - Boundary and uncommon scenarios
- `error-*.yaml` - Failure and exception handling
- `validation-*.yaml` - Input format checking
- `interruption-*.yaml` - Mid-conversation user changes

---

### Phase 4: File Output

Save each test to: `./tests/scenarios/<test-name>.yaml`

**Validation checklist per file:**
- [ ] Valid YAML syntax (no tabs, consistent indentation)
- [ ] All required fields present (agent_id, name, simulated_user, evaluation_criteria)
- [ ] Unique test name across all generated files
- [ ] Descriptive criteria (avoid vague terms like "works correctly")
- [ ] Language matches agent configuration (default: "en")

---

## Quality Standards

**Completeness Criteria:**
- ✅ All primary user intents have >= 1 happy path test
- ✅ Each tool has >= 1 error handling test
- ✅ Each validation rule has >= 1 edge case test
- ✅ At least 3 different conversation lengths covered (single-turn, short multi-turn, long multi-turn)

**Clarity Criteria:**
- ✅ Test names immediately convey scenario without reading file
- ✅ Evaluation criteria are measurable (avoid subjective language)
- ✅ Simulated user prompts clearly describe behavior pattern

**Maintainability Criteria:**
- ✅ Similar tests grouped by naming prefix
- ✅ Each test is independent (no cross-file dependencies)
- ✅ Variables use template syntax: `${VAR_NAME}`

---

## Error Handling

If configuration analysis reveals:
- **Ambiguous intents**: Generate tests for both interpretations, note in evaluation criteria
- **Missing tool documentation**: Create basic invocation test, flag with comment
- **Complex state machines**: Break into sequential test files, number with `-part1`, `-part2`
- **Undocumented features**: Skip rather than guess behavior

---

## Output Format

Confirm completion with:
```
Generated {N} test files:
- {X} happy path tests
- {Y} edge case tests
- {Z} error handling tests
Files saved to: ./tests/scenarios/
```

Then list all generated file names.
