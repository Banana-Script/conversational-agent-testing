# Test Execution Checklist

Use this checklist to track test execution status across different environments and stages.

---

## Pre-Execution Setup

- [ ] Environment variable set: `ELEVENLABS_AGENT_ID`
- [ ] Agent is active and accessible via API
- [ ] Testing framework dependencies installed (`npm install`)
- [ ] No pending agent configuration changes
- [ ] Agent prompt matches: `agents/agent_1401k6d9rrrzecdbww6x3jdyybx7.md`

---

## Priority 0 - Smoke Tests (Run on every commit)

**Target Time:** < 2 minutes | **Status:** ⬜ Not Run | ✅ Pass | ❌ Fail

| Test | Status | Notes |
|------|--------|-------|
| `p0-smoke-complete-happy-path.yaml` | ⬜ | End-to-end validation |
| `p0-smoke-identity-verification-core.yaml` | ⬜ | Fast identity check |
| `p0-smoke-wrong-person-termination.yaml` | ⬜ | Security validation |

**P0 Result:** ⬜ Not Run | ✅ All Pass | ❌ Failed (details below)

---

## Priority 1 - Core Functionality (Run on PR merge)

**Target Time:** < 10 minutes | **Status:** ⬜ Not Run | ✅ Pass | ❌ Fail

### Happy Path
| Test | Status | Notes |
|------|--------|-------|
| `p1-happy-all-data-valid.yaml` | ⬜ | Complete verification flow |

### Error Handling
| Test | Status | Notes |
|------|--------|-------|
| `p1-error-max-retries-document.yaml` | ⬜ | 2 retry limit for document |
| `p1-error-max-retries-name.yaml` | ⬜ | 1 retry limit for name |
| `p1-error-max-retries-birthdate.yaml` | ⬜ | 1 retry limit for birthdate |

### Validation
| Test | Status | Notes |
|------|--------|-------|
| `p1-validation-no-aplica-skipping.yaml` | ⬜ | CRITICAL: Silent skip "No aplica" |
| `p1-edge-partial-no-aplica-mixed.yaml` | ⬜ | Mixed valid/"No aplica" |

### Interruption/Callback
| Test | Status | Notes |
|------|--------|-------|
| `p1-interruption-callback-same-day.yaml` | ⬜ | Callback before 6 PM |
| `p1-interruption-advisor-escalation.yaml` | ⬜ | Advisor scheduling |

### Credit Terms
| Test | Status | Notes |
|------|--------|-------|
| `p1-validation-credit-terms-disagreement.yaml` | ⬜ | Executive escalation |
| `p1-validation-illegal-payment-detected.yaml` | ⬜ | Payment verification |

**P1 Result:** ⬜ Not Run | ✅ All Pass | ❌ Failed (details below)

---

## Priority 2 - Extended Coverage (Run nightly)

**Target Time:** < 25 minutes | **Status:** ⬜ Not Run | ✅ Pass | ❌ Fail

### Boundary Tests
| Test | Status | Notes |
|------|--------|-------|
| `p2-boundary-address-context-variations.yaml` | ⬜ | barrio/ciudad combinations |
| `p2-boundary-birthdate-format-variations.yaml` | ⬜ | Date format acceptance |
| `p2-boundary-document-short-prefix.yaml` | ⬜ | Short document numbers |
| `p2-boundary-email-special-characters.yaml` | ⬜ | Email pronunciation |
| `p2-boundary-large-monetary-values.yaml` | ⬜ | Number pronunciation |

### Edge Cases
| Test | Status | Notes |
|------|--------|-------|
| `p2-edge-advisor-name-incorrect.yaml` | ⬜ | Advisor discrepancy |
| `p2-edge-credit-terms-partial-no-aplica.yaml` | ⬜ | Partial terms "No aplica" |
| `p2-edge-data-discrepancy-name.yaml` | ⬜ | Name mismatch handling |

### Integration
| Test | Status | Notes |
|------|--------|-------|
| `p2-integration-banco-bogota-specific-flow.yaml` | ⬜ | Bogotá bank flow |
| `p2-integration-banco-pichincha-full-flow.yaml` | ⬜ | Pichincha bank flow |

### Validation
| Test | Status | Notes |
|------|--------|-------|
| `p2-validation-all-fields-no-aplica-minimal-flow.yaml` | ⬜ | All fields "No aplica" |
| `p2-validation-recording-consent-acknowledgment.yaml` | ⬜ | Recording notice |
| `p2-validation-tipo-credito-mentioned.yaml` | ⬜ | Credit type presentation |

**P2 Result:** ⬜ Not Run | ✅ All Pass | ❌ Failed (details below)

---

## Priority 3 - Edge Cases (Run weekly)

**Target Time:** < 15 minutes | **Status:** ⬜ Not Run | ✅ Pass | ❌ Fail

### Ambiguity
| Test | Status | Notes |
|------|--------|-------|
| `p3-ambiguity-credit-terms-partial-understanding.yaml` | ⬜ | Terms clarification |
| `p3-ambiguity-unclear-availability-response.yaml` | ⬜ | Vague availability |

### Scheduling Edge Cases
| Test | Status | Notes |
|------|--------|-------|
| `p3-edge-advisor-schedule-weekend-request.yaml` | ⬜ | Weekend to weekday |
| `p3-edge-callback-invalid-time-after-6pm.yaml` | ⬜ | After 6 PM validation |
| `p3-edge-callback-relative-time-calculation.yaml` | ⬜ | "in 2 hours" calculation |
| `p3-edge-executive-schedule-today-not-allowed.yaml` | ⬜ | Today to tomorrow |

### Interruption
| Test | Status | Notes |
|------|--------|-------|
| `p3-interruption-user-interrupts-credit-terms.yaml` | ⬜ | Mid-presentation interrupt |

**P3 Result:** ⬜ Not Run | ✅ All Pass | ❌ Failed (details below)

---

## Overall Test Results

| Priority | Total | Pass | Fail | Not Run | Pass Rate |
|----------|-------|------|------|---------|-----------|
| P0 | 3 | 0 | 0 | 3 | 0% |
| P1 | 10 | 0 | 0 | 10 | 0% |
| P2 | 13 | 0 | 0 | 13 | 0% |
| P3 | 7 | 0 | 0 | 7 | 0% |
| **Total** | **33** | **0** | **0** | **33** | **0%** |

**Quality Gate:** P0 + P1 must be 100% pass rate for production deployment

---

## Failed Tests Details

### Test Name: _____________
- **Priority:** P0 / P1 / P2 / P3
- **Failed Criterion:** _____________
- **Rationale:** _____________
- **Root Cause:** _____________
- **Action:** Bug fix / Test update / Agent prompt change / Expected behavior
- **Assigned To:** _____________
- **Target Resolution:** _____________

### Test Name: _____________
- **Priority:** P0 / P1 / P2 / P3
- **Failed Criterion:** _____________
- **Rationale:** _____________
- **Root Cause:** _____________
- **Action:** Bug fix / Test update / Agent prompt change / Expected behavior
- **Assigned To:** _____________
- **Target Resolution:** _____________

---

## Test Environment Details

- **Date Executed:** _____________
- **Agent ID:** agent_1401k6d9rrrzecdbww6x3jdyybx7
- **Agent Version/Commit:** _____________
- **Framework Version:** _____________
- **Executed By:** _____________
- **Environment:** Development / Staging / Production
- **Notes:** _____________

---

## Sign-Off

### Development Team
- **Tested By:** _____________
- **Date:** _____________
- **Signature:** _____________

### QA Team
- **Reviewed By:** _____________
- **Date:** _____________
- **Signature:** _____________

### Product Owner
- **Approved By:** _____________
- **Date:** _____________
- **Signature:** _____________

---

## Next Steps

- [ ] All P0+P1 tests passing
- [ ] All P2+P3 tests passing
- [ ] Failed tests documented with action items
- [ ] Regression tests added for new bugs found
- [ ] Test results shared with team
- [ ] Agent ready for deployment / Next iteration

---

**Checklist Version:** 1.0
**Last Updated:** 2025-11-11
**Test Suite Version:** Initial Release (33 tests)
