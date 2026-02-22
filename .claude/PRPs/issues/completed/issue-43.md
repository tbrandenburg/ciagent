# Investigation: Real Codex run fails despite valid auth (breaks real-world E2E success case)

**Issue**: #43 (https://github.com/tbrandenburg/ciagent/issues/43)
**Type**: BUG
**Investigated**: 2026-02-22T09:25:01Z

### Assessment

| Metric | Value | Reasoning |
| --- | --- | --- |
| Severity | HIGH | The core `cia run --provider=codex` user path fails in authenticated environments and blocks the intended real E2E success workflow, with no reliable in-product workaround. |
| Complexity | MEDIUM | The fix is concentrated in provider/model resolution and tests (about 4-6 files) with moderate integration risk across config parsing, provider factory wiring, and Codex session options. |
| Confidence | MEDIUM | The failure is reproducible and model/config wiring gaps are explicit in code, but Codex SDK behavior differences across versions add one remaining runtime unknown to validate. |

---

## Problem Statement

Real Codex execution from `cia` fails on this machine even though `codex exec` succeeds with the same local auth context. The current Codex provider path does not wire model selection from CLI/config into SDK thread options, so runtime behavior depends on implicit SDK defaults that are not controlled by `cia`. This mismatch now breaks the real-world Codex E2E success case introduced to validate non-mocked behavior.

---

## Analysis

### Root Cause / Change Rationale

The Codex integration path is missing end-to-end model resolution plumbing. `cia` parses model input but does not consistently pass it to provider creation and Codex thread startup. This leaves model selection implicit and can drift from user expectations and documented config behavior.

### Evidence Chain

WHY: `./dist/cia run "Test" --provider=codex` fails while `codex exec "Test"` succeeds on same machine.
↓ BECAUSE: `cia` Codex path emits provider failure from model access on streamed run.
Evidence: Runtime repro output from this investigation:

```text
❌ Error: AI execution failed
   Provider 'reliable-codex' reliability issue: Reconnecting... 1/5 (stream disconnected before completion: The model `gpt-5.3-codex` does not exist or you do not have access to it.)
```

↓ BECAUSE: Codex provider create path explicitly ignores model/baseUrl/apiKey/timeout config.
Evidence: `packages/cli/src/providers/codex.ts:43`-`packages/cli/src/providers/codex.ts:45`

```typescript
static async create(config?: ProviderConfig): Promise<CodexAssistantChat> {
  // TODO: Use config.baseUrl, config.apiKey, config.timeout, config.model in future iterations
  void config;
```

↓ BECAUSE: Codex thread options sent to SDK do not include model selection.
Evidence: `packages/cli/src/providers/codex.ts:97`-`packages/cli/src/providers/codex.ts:103`

```typescript
const threadOptions = {
  workingDirectory: cwd,
  skipGitRepoCheck: true,
  sandboxMode: 'danger-full-access',
  networkAccessEnabled: true,
  approvalPolicy: 'never',
};
```

↓ BECAUSE: CLI parses top-level `--model`, but provider factory only forwards `config.providers[provider]` and does not merge top-level model into provider config.
Evidence: `packages/cli/src/cli.ts:22`, `packages/cli/src/cli.ts:52`, `packages/cli/src/providers/index.ts:40`-`packages/cli/src/providers/index.ts:47`

```typescript
model: { type: 'string', short: 'm' },
...
model: values.model as string | undefined,
...
const providerConfig = structuredConfig?.providers?.[provider];
...
assistantChat = await CodexAssistantChat.create(providerConfig);
```

↓ ROOT CAUSE: Codex model selection is not wired from CLI/config into Codex runtime session options, causing uncontrolled model resolution and failure in real runs.
Evidence: `packages/cli/src/providers/codex.ts:43`-`packages/cli/src/providers/codex.ts:45`, `packages/cli/src/providers/codex.ts:97`-`packages/cli/src/providers/codex.ts:103`, `packages/cli/src/providers/index.ts:40`-`packages/cli/src/providers/index.ts:47`

### Affected Files

| File | Lines | Action | Description |
| --- | --- | --- | --- |
| `packages/cli/src/providers/index.ts` | 39-49 | UPDATE | Merge top-level model into provider config before provider creation (Codex-first, reusable helper). |
| `packages/cli/src/providers/codex.ts` | 43-45, 97-115, 166-178 | UPDATE | Persist resolved model in provider instance, pass model into thread options, align fallback model list with supported naming. |
| `packages/cli/src/shared/validation/validation.ts` | 210-225 | UPDATE | Accept both `model` and `provider/model` formats to match documented config and avoid false-invalid inputs. |
| `packages/cli/tests/providers/factory.test.ts` | 81-117 | UPDATE | Add assertion that effective model from config reaches Codex creation path. |
| `packages/cli/tests/providers.contract.test.ts` | 19-42 | UPDATE | Strengthen Codex SDK mock to capture thread options and verify model forwarding behavior. |
| `packages/cli/tests/e2e.test.ts` | 120-140 | UPDATE | Keep real Codex test and add assertion variant with explicit model flag for deterministic model selection verification. |

### Integration Points

- `packages/cli/src/commands/run.ts:39`-`packages/cli/src/commands/run.ts:47` resolves provider and invokes `createAssistantChat`.
- `packages/cli/src/providers/index.ts:40`-`packages/cli/src/providers/index.ts:49` computes provider-specific config and constructs provider.
- `packages/cli/src/providers/codex.ts:97`-`packages/cli/src/providers/codex.ts:117` starts/resumes Codex thread and runs stream.
- `packages/cli/src/providers/reliability.ts:160`-`packages/cli/src/providers/reliability.ts:179` marks model/access failures non-retryable and surfaces error immediately.
- `packages/cli/src/cli.ts:22` and `packages/cli/src/cli.ts:52` parse `--model`, which currently does not fully flow through to Codex execution.

### Git History

- **Introduced**: `adfd779` (2026-02-11) - `feat(core): implement CLI infrastructure foundation with structured config and timeout handling` introduced Codex `create(config?)` TODO and ignored config behavior.
- **Last modified**: `76475c3` (2026-02-22) updated error preservation but did not implement model/config wiring in Codex provider.
- **Exposure point**: `0c39d99` (2026-02-22) removed E2E seam and exercised real Codex path, making latent runtime mismatch visible.
- **Implication**: This is a long-standing implementation gap now surfaced by real-path testing, not a test harness-only regression.

---

## Implementation Plan

### Step 1: Build effective provider config with model precedence

**File**: `packages/cli/src/providers/index.ts`
**Lines**: 39-49
**Action**: UPDATE

**Current code:**

```typescript
const structuredConfig = config ? loadStructuredConfig(config) : undefined;
const providerConfig = structuredConfig?.providers?.[provider];
...
if (provider === 'codex') {
  assistantChat = await CodexAssistantChat.create(providerConfig);
}
```

**Required change:**

```typescript
const structuredConfig = config ? loadStructuredConfig(config) : undefined;
const providerConfig = structuredConfig?.providers?.[provider] ?? {};
const effectiveProviderConfig = {
  ...providerConfig,
  ...(config?.model ? { model: extractModelForProvider(provider, config.model) } : {}),
};
...
if (provider === 'codex') {
  assistantChat = await CodexAssistantChat.create(effectiveProviderConfig);
}
```

Also add helper in same file (or small shared helper) to support both accepted syntaxes:

```typescript
function extractModelForProvider(provider: string, rawModel: string): string | undefined {
  if (rawModel.includes('/')) {
    const [modelProvider, modelName] = rawModel.split('/', 2);
    return modelProvider === provider ? modelName : undefined;
  }
  return rawModel;
}
```

**Why**: Ensures `--model` and top-level config model actually influence the provider runtime behavior.

---

### Step 2: Wire Codex model into session/thread startup

**File**: `packages/cli/src/providers/codex.ts`
**Lines**: 43-45, 97-115
**Action**: UPDATE

**Current code:**

```typescript
static async create(config?: ProviderConfig): Promise<CodexAssistantChat> {
  // TODO: Use config.baseUrl, config.apiKey, config.timeout, config.model in future iterations
  void config;
  ...
  return new CodexAssistantChat(new codexModule.Codex());
}
...
const threadOptions = {
  workingDirectory: cwd,
  skipGitRepoCheck: true,
  sandboxMode: 'danger-full-access',
  networkAccessEnabled: true,
  approvalPolicy: 'never',
};
```

**Required change:**

```typescript
private readonly model?: string;

private constructor(codex: CodexAssistantChat['codex'], model?: string) {
  this.codex = codex;
  this.model = model;
}

static async create(config?: ProviderConfig): Promise<CodexAssistantChat> {
  const configuredModel =
    typeof config?.model === 'string' && config.model.trim().length > 0 ? config.model.trim() : undefined;
  ...
  return new CodexAssistantChat(new codexModule.Codex(), configuredModel);
}

const threadOptions = {
  workingDirectory: cwd,
  skipGitRepoCheck: true,
  sandboxMode: 'danger-full-access',
  networkAccessEnabled: true,
  approvalPolicy: 'never',
  ...(this.model ? { model: this.model } : {}),
};
```

**Why**: Removes reliance on implicit SDK model defaults and makes model selection deterministic.

---

### Step 3: Align model validation with documented syntax

**File**: `packages/cli/src/shared/validation/validation.ts`
**Lines**: 210-225
**Action**: UPDATE

**Current code:**

```typescript
if (!/^[a-zA-Z0-9\-\.]+$/.test(model)) {
  return {
    isValid: false,
    errors: [
      `Invalid model name format: ${model}. Must contain only alphanumeric characters, dashes, and dots.`,
    ],
  };
}
```

**Required change:**

```typescript
const plainModel = /^[a-zA-Z0-9\-\.]+$/;
const providerModel = /^[a-zA-Z0-9\-\.]+\/[a-zA-Z0-9\-\.]+$/;

if (!plainModel.test(model) && !providerModel.test(model)) {
  return {
    isValid: false,
    errors: [
      `Invalid model name format: ${model}. Use 'model' or 'provider/model' with alphanumeric characters, dashes, and dots.`,
    ],
  };
}
```

**Why**: Keeps runtime model resolution and validation consistent with documented configuration.

---

### Step 4: Update Codex model listing fallback to current naming convention

**File**: `packages/cli/src/providers/codex.ts`
**Lines**: 166-178
**Action**: UPDATE

**Current code:**

```typescript
return ['codex-v1'];
```

**Required change:**

```typescript
return ['gpt-5.3-codex'];
```

**Why**: Reduces internal naming drift and aligns list-model fallback with current documented/default Codex naming.

---

### Step 5: Add/Update Tests

**Files**:
- `packages/cli/tests/providers/factory.test.ts` (UPDATE)
- `packages/cli/tests/providers.contract.test.ts` (UPDATE)
- `packages/cli/tests/e2e.test.ts` (UPDATE)

**Test cases to add:**

```typescript
describe('codex model wiring', () => {
  it('forwards top-level --model to codex provider config', async () => {
    // createAssistantChat('codex', { provider: 'codex', model: 'gpt-5.3-codex' })
    // should call CodexAssistantChat.create with { model: 'gpt-5.3-codex' }
  });

  it('supports provider/model syntax and strips provider prefix', async () => {
    // model: 'codex/gpt-5.3-codex' -> effective model 'gpt-5.3-codex'
  });

  it('passes model into codex thread options for runStreamed path', async () => {
    // SDK mock captures startThread options and asserts options.model
  });
});
```

E2E extension (existing real Codex test block):

```typescript
it('returns assistant output for a real codex run with explicit model', async () => {
  // runCLI(['run', 'Test', '--provider=codex', '--model=gpt-5.3-codex'], { useRealHome: true })
  // expect exitCode 0, stdout non-empty, no auth/config error
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/vercel-factory.ts:103-112
// Pattern: resolve provider model with explicit config override + default fallback
if (config?.resourceName || config?.apiKey) {
  const azureProvider = azureModule.createAzure({
    resourceName: config.resourceName,
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    ...(networkFetch && { fetch: networkFetch }),
  });
  return azureProvider(config?.model || 'gpt-4o');
}
```

```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:160-179
// Pattern: classify deterministic auth/model failures as non-retryable and fail fast
private isNonRetryableError(message: string): boolean {
  const nonRetryablePatterns = [
    'authentication',
    'unauthorized',
    'authorization',
    'forbidden',
    'permission',
    'access denied',
    'invalid api key',
    'model',
    'does not exist',
    '401',
    'not found',
    '404',
    'contract validation failed',
  ];
```

---

## Edge Cases & Risks

| Risk/Edge Case | Mitigation |
| --- | --- |
| `model` provided in `provider/model` format for a different provider (e.g. `openai/gpt-4o` with `--provider=codex`) | `extractModelForProvider` returns `undefined` for mismatch; provider falls back to provider config/default and logs debug warning when `DEBUG` is set. |
| SDK option name incompatibility across Codex SDK versions | Add provider contract test that asserts option propagation in our wrapper; validate real E2E path after change and, if still failing, pin/upgrade `@openai/codex-sdk` in follow-up same PR. |
| Changing fallback model list affects `models` command output expectations | Update tests that currently assert `codex-v1` to `gpt-5.3-codex` and keep output format unchanged (`provider/model`). |

---

## Validation

### Automated Checks

```bash
bun run type-check
bun run test -- --run packages/cli/tests/providers/factory.test.ts packages/cli/tests/providers.contract.test.ts packages/cli/tests/commands/models.test.ts packages/cli/tests/e2e.test.ts
bun run lint
```

### Manual Verification

1. Run `codex exec "Test"` and confirm success baseline.
2. Run `./dist/cia run "Test" --provider=codex --model=gpt-5.3-codex` and confirm exit `0` with non-empty assistant output.
3. Run `./dist/cia run "Test" --provider=codex` and confirm no model-access failure regression.
4. Run `./dist/cia models --provider=codex` and confirm output uses slash notation and expected model naming.

---

## Scope Boundaries

**IN SCOPE:**

- Codex model-resolution flow from CLI/config to provider creation and thread startup.
- Validation compatibility for documented model syntax.
- Targeted tests for provider config forwarding and real Codex run behavior.

**OUT OF SCOPE (do not touch):**

- Broad provider architecture refactors unrelated to model flow.
- Reliability retry policy redesign.
- Changes to MCP/skills systems.

---

## Metadata

- **Investigated by**: OpenCode
- **Timestamp**: 2026-02-22T09:25:01Z
- **Artifact**: `.claude/PRPs/issues/issue-43.md`
