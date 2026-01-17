# Test Validation Instructions

## Workspace Structure
```
/workspace/
  specs/           # User-provided agent specs (READ ONLY)
  tests/           # Generated test files (WRITE HERE)
  @fix_plan.md     # Task checklist
  @AGENT.md        # This file - validation rules
  PROMPT.md        # Main instructions
```

## YAML Schema Reference

### ElevenLabs Provider
```yaml
agent_id: "string"  # Required: ElevenLabs agent ID
name: "string"      # Required: p{0-3}-{category}-{description}
description: "string"
simulated_user:
  prompt: "string"  # Single line: behavior description
  first_message: "string"  # Natural greeting (voice context)
  language: "es" | "en"
evaluation_criteria:
  - id: "string"
    name: "string"
    prompt: "string"  # Binary: "Agent must..." or "Agent must NOT..."
    use_knowledge_base: false
dynamic_variables:  # Optional: key-value pairs
  var_name: "value"
new_turns_limit: 25  # Max conversation turns
```

### VAPI Provider
```yaml
agent_id: "string"
name: "string"
description: "string"
simulated_user:
  prompt: "string"
  first_message: "string"
  language: "es" | "en"
evaluation_criteria:
  - id: "string"
    name: "string"
    prompt: "string"
    use_knowledge_base: false
vapi:
  phone_number_id: "string"  # Optional
new_turns_limit: 25
```

### Viernes Provider
```yaml
name: "string"
description: "string"
simulated_user:
  prompt: "string"
  first_message: "string"  # Chat context: "Hola", "Necesito ayuda"
  language: "es" | "en"
evaluation_criteria:
  - id: "string"
    name: "string"
    prompt: "string"
    use_knowledge_base: false
viernes:
  organization_id: number  # Required
  agent_id: number         # Required
new_turns_limit: 25
```

## Validation Commands

Run these to verify your tests:

```bash
# Check YAML syntax
for f in tests/*.yaml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"
done

# Count tests by priority
ls tests/ | grep -c "^p0-"  # Smoke tests
ls tests/ | grep -c "^p1-"  # Core tests
ls tests/ | grep -c "^p2-"  # Extended tests
ls tests/ | grep -c "^p3-"  # Edge tests
```

## Quality Checks

Before marking Phase 5 complete, verify:

1. **Binary Criteria**: No subjective words (professional, friendly, appropriate, etc.)
2. **30% Negative**: Count criteria with "must NOT" >= 30% of total
3. **Naming**: All files match `p{0-3}-{category}-{description}.yaml`
4. **Coverage**: Each critical flow has happy + error + edge test

## Common Issues

| Issue | Fix |
|-------|-----|
| YAML parse error | Check indentation (2 spaces, no tabs) |
| Missing agent_id | Add required ID for provider |
| Subjective criteria | Rewrite with specific, measurable behavior |
| No negative tests | Add "Agent must NOT..." criteria |

## first_message Guidelines

**Voice (ElevenLabs, VAPI)** - User answering a call:
- "Alo?", "Diga", "Si?", "Bueno?", "Hello?"

**Chat (Viernes)** - User starting conversation:
- "Hola", "Buenos dias", "Necesito ayuda con..."
- NOT: "Alo?", "Diga?" (these are phone greetings)
