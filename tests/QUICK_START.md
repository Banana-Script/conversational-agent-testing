# Quick Start Guide - ElevenLabs Agent Testing

## Prerequisites

1. **Set Environment Variable**
   ```bash
   export ELEVENLABS_AGENT_ID="agent_1401k6d9rrrzecdbww6x3jdyybx7"
   ```

2. **Verify Configuration**
   ```bash
   npm run simulate -- tests/scenarios/p0-smoke-complete-happy-path.yaml
   ```

---

## Running Tests

### **Smoke Tests (Fast - 2 minutes)**
Critical path validation for every commit:

```bash
npm run simulate -- tests/scenarios/p0-smoke-complete-happy-path.yaml
npm run simulate -- tests/scenarios/p0-smoke-identity-verification-core.yaml
npm run simulate -- tests/scenarios/p0-smoke-wrong-person-termination.yaml
```

### **Core Functionality (10 minutes)**
Run before merging PR:

```bash
for test in tests/scenarios/p0-*.yaml tests/scenarios/p1-*.yaml; do
  echo "Running: $test"
  npm run simulate -- "$test"
done
```

### **Full Regression (30-60 minutes)**
Weekly comprehensive validation:

```bash
for test in tests/scenarios/*.yaml; do
  echo "Running: $test"
  npm run simulate -- "$test"
done
```

---

## Test Priority Levels

| Priority | When to Run | Count | Execution Time |
|----------|-------------|-------|----------------|
| **P0** | Every commit | 3 | ~2 min |
| **P1** | Pre-merge PR | 10 | ~8 min |
| **P2** | Nightly build | 13 | ~20 min |
| **P3** | Weekly | 7 | ~10 min |

---

## Understanding Test Results

### **Success Criteria**
Each test has multiple `evaluation_criteria`. A test **passes** only if **ALL** criteria are "success":

```yaml
evaluation_criteria:
  - id: "criterion-1"
    result: "success"  # ✅ Pass
  - id: "criterion-2"
    result: "success"  # ✅ Pass
```

### **Failure Indicators**
Any criterion with "failure" or "unknown" fails the entire test:

```yaml
evaluation_criteria:
  - id: "criterion-1"
    result: "success"
  - id: "criterion-2"
    result: "failure"  # ❌ Entire test fails
    rationale: "Agent asked for email when correo_electronico was 'No aplica'"
```

---

## Common Test Scenarios

### **1. Verify "No aplica" Handling**
```bash
npm run simulate -- tests/scenarios/p1-validation-no-aplica-skipping.yaml
```
**What it tests:** Agent silently skips fields with "No aplica" without mentioning missing data

### **2. Verify Retry Limits**
```bash
npm run simulate -- tests/scenarios/p1-error-max-retries-document.yaml
```
**What it tests:** Agent closes call after 2 failed document verification attempts

### **3. Verify Callback Scheduling**
```bash
npm run simulate -- tests/scenarios/p1-interruption-callback-same-day.yaml
```
**What it tests:** Agent correctly schedules same-day callback before 6 PM

### **4. Verify Bank-Specific Flows**
```bash
# Banco de Bogotá
npm run simulate -- tests/scenarios/p2-integration-banco-bogota-specific-flow.yaml

# Banco Pichincha
npm run simulate -- tests/scenarios/p2-integration-banco-pichincha-full-flow.yaml
```

---

## Debugging Failed Tests

### **Step 1: Check Conversation Transcript**
The simulate command outputs the full conversation. Review for:
- Agent's exact responses
- Where the conversation diverged from expected behavior
- Which criterion failed

### **Step 2: Check Evaluation Rationale**
Each criterion result includes a `rationale` explaining why it passed/failed:

```json
{
  "criterion-1": {
    "result": "failure",
    "rationale": "Agent mentioned 'no está disponible' which violates the rule..."
  }
}
```

### **Step 3: Verify Dynamic Variables**
Ensure the test is using correct dynamic variables:
```bash
grep -A 20 "^dynamic_variables:" tests/scenarios/[test-name].yaml
```

### **Step 4: Adjust Test if Needed**
If agent behavior changed intentionally:
1. Update evaluation criteria in the test
2. Document the change in commit message
3. Re-run test to verify

---

## Modifying Tests

### **Change User Behavior**
Edit the `simulated_user.prompt` field:

```yaml
simulated_user:
  prompt: "Eres Juan Perez que [NEW BEHAVIOR]. Cuando el agente pregunte [X], responde [Y]."
  first_message: "Hola"
  language: "es"
```

### **Add New Evaluation Criterion**
```yaml
evaluation_criteria:
  - id: "new-criterion"
    name: "Agent does something new"
    prompt: "Agent must [specific measurable behavior]"
    use_knowledge_base: false
```

### **Change Dynamic Variables**
Modify values to test different scenarios:

```yaml
dynamic_variables:
  documento_identidad: "1234567"  # Change to test different document
  correo_electronico: "No aplica"  # Test skipping email
  entidad_financiera_origen: "Banco Pichincha"  # Test bank-specific flow
```

---

## Test Categories Reference

### **Smoke (P0)** - Must always pass
- Complete happy path
- Identity verification
- Security (wrong person)

### **Happy Path (P1)** - Standard successful flows
- All data valid
- Credit terms accepted
- No interruptions

### **Error Handling (P1)** - Failure modes
- Max retries exceeded
- Invalid data provided
- User refuses information

### **Validation (P1-P2)** - Data handling
- "No aplica" skipping
- Mixed valid/invalid fields
- Data discrepancies

### **Integration (P2)** - Bank-specific logic
- Banco de Bogotá flow
- Banco Pichincha flow
- Default bank flow

### **Interruption (P1-P2)** - User unavailability
- Same-day callback
- Advisor escalation
- Executive escalation

### **Boundary (P2)** - Edge input values
- Special characters (email)
- Large numbers (monetary)
- Different formats (dates)

### **Ambiguity (P3)** - Unclear user responses
- Vague availability
- Partial understanding
- Interruptions mid-sentence

---

## Creating New Tests

### **1. Copy Template**
```bash
cp tests/scenarios/p1-happy-all-data-valid.yaml tests/scenarios/p1-my-new-test.yaml
```

### **2. Update Required Fields**
- `name`: Unique descriptive name
- `description`: What this test validates
- `simulated_user.prompt`: User behavior
- `evaluation_criteria`: What agent must do/not do
- `dynamic_variables`: Scenario-specific values

### **3. Test Locally**
```bash
npm run simulate -- tests/scenarios/p1-my-new-test.yaml
```

### **4. Add to Summary**
Update `TEST_SUITE_SUMMARY.md` with new test details

---

## Troubleshooting

### **Problem: "Agent ID not found"**
**Solution:** Set environment variable:
```bash
export ELEVENLABS_AGENT_ID="agent_1401k6d9rrrzecdbww6x3jdyybx7"
```

### **Problem: "Evaluation criteria always fail"**
**Solution:** Criteria may be too strict. Adjust evaluation criteria prompts to be more specific but realistic.

### **Problem: "Conversation doesn't end"**
**Solution:**
- Reduce `new_turns_limit` to 15-20
- Ensure simulated user responds naturally to agent's closing
- Check agent has proper closure flow (Step 9)

### **Problem: "Test is flaky (sometimes passes, sometimes fails)"**
**Solution:**
- LLM-based evaluation can have variance
- Review if criteria are too subjective
- Make criteria more objective and measurable
- Consider increasing `temperature: 0` in simulated_user for determinism

---

## Best Practices

1. **Run P0 tests before every commit**
2. **Run P0+P1 tests before creating PR**
3. **Review failed test transcripts, don't just re-run**
4. **Update tests when agent prompt changes**
5. **Add regression test for every bug fix**
6. **Keep test names descriptive and searchable**
7. **Document test assumptions in comments**
8. **Use realistic Colombian Spanish in simulated users**

---

## Resources

- **Full Documentation:** `tests/TEST_SUITE_SUMMARY.md`
- **Template Reference:** `tests/template.yaml`
- **Agent Configuration:** `agents/agent_1401k6d9rrrzecdbww6x3jdyybx7.json`
- **Agent Prompt:** `agents/agent_1401k6d9rrrzecdbww6x3jdyybx7.md`

---

**Generated:** 2025-11-11
**Total Tests:** 33
**Framework:** ElevenLabs Agent Testing
