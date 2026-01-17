# Test Generation Plan

## Phase 1: Analysis
- [ ] Review agent specification in specs/
- [ ] Identify critical user flows
- [ ] List required dynamic variables (if any)
- [ ] Determine test priorities

## Phase 2: Happy Path Tests (P0-P1)
- [ ] Generate 2-3 smoke tests for core functionality
- [ ] Generate happy path test for each major feature
- [ ] Ensure all critical flows have success scenarios

## Phase 3: Error Handling (P1-P2)
- [ ] Generate error tests for invalid inputs
- [ ] Generate validation failure scenarios
- [ ] Test boundary conditions

## Phase 4: Edge Cases (P2-P3)
- [ ] Boundary value tests
- [ ] Interruption/topic-change tests
- [ ] Ambiguity resolution tests

## Phase 5: Quality Review
- [ ] Verify all criteria are binary (no subjective words)
- [ ] Verify 30% negative criteria ratio
- [ ] Verify proper file naming convention
- [ ] Validate YAML syntax for all tests

## Completion Criteria
All phases complete when:
- Each critical flow has happy + error + edge coverage
- At least 30% of criteria are negative
- All YAMLs pass schema validation
- File naming follows p{0-3}-{category}-{description}.yaml
