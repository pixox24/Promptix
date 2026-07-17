# Provider text connection test

## Objective

Let an administrator verify that a saved Provider can make a real, low-cost text request through the same Worker, environment variables, adapter, network path, and model configuration used by production jobs.

The feature answers one question precisely: **can this enabled Provider and selected text Model successfully process a minimal text completion right now?**

## Scope

Included:

- A Provider-level **Test connection** action in Providers & Models.
- Selection of one enabled Model owned by that Provider and declaring the `text` capability.
- A new, auditable `provider_test` asynchronous job handled by the existing BullMQ Worker.
- Clear progress, success, and failure feedback in the Provider page and Task Center.

Excluded:

- Vision, image generation, structured-output, streaming, and throughput tests.
- Persisting or accepting API keys in the browser or database.
- Altering a Provider or Model configuration as a side effect of testing.
- Replacing the existing end-to-end business task tests.

## Decision

Run the check as a Worker job instead of calling the upstream provider directly from the API route.

The API service currently owns configuration validation while the Worker owns model construction and all upstream AI requests. A synchronous API-side check would require a second provider-client implementation and could report success even when the Worker fails because of different environment variables or networking. A `provider_test` job uses the production model factory and makes Worker availability part of the result, which is the intended signal for an operator.

## Operator experience

1. On every saved Provider card, display a secondary **Test connection** button.
2. Clicking the button opens a compact dialog. It lists only this Provider's enabled Models that include `text`.
3. The default selection is the Provider's `isDefaultText` model; otherwise the first eligible model is selected. If there are no eligible models, the dialog explains that an enabled text Model must be added first and does not submit a request.
4. The dialog explains that the check sends a fixed, minimal request and may consume a small number of tokens. It does not expose or request a key.
5. On submit, the button is disabled and the dialog reports `Queued`, then `Running`, while polling the created job.
6. On success, show the selected Provider and Model, elapsed upstream time, and the message **Connection and text call succeeded**. The generated text is not shown beyond a fixed success indicator.
7. On failure, show a short operator-facing classification and the safe upstream error summary. A link to the Task Center opens the matching test job for retry and historical inspection.

The existing `key configured` badge remains a local environment-variable presence check. It is not relabelled as a connection result.

## API contract

Add an admin-only endpoint:

```http
POST /api/admin/providers/:providerId/test
Content-Type: application/json

{ "modelId": "uuid" }
```

The response is `202 Accepted`:

```json
{ "jobId": "uuid", "status": "queued" }
```

The API validates before enqueueing:

- Provider exists and is enabled.
- Model exists, belongs to that Provider, is enabled, and declares `text`.
- The Provider's configured environment variable is non-empty in the API process. This is an early diagnostic only; the Worker performs the authoritative key read.
- Redis is reachable and the test job is enqueueable.

Expected validation errors use the existing response envelope and stable error codes: `PROVIDER_NOT_FOUND`, `PROVIDER_DISABLED`, `MODEL_NOT_FOUND`, `MODEL_PROVIDER_MISMATCH`, `MODEL_DISABLED`, `MODEL_CAPABILITY_MISMATCH`, `PROVIDER_KEY_NOT_CONFIGURED`, and `QUEUE_UNAVAILABLE`.

## Job and Worker behavior

Add `provider_test` to the shared job-type schema. Store it in the existing `generation_jobs` table with the explicit Provider and Model IDs, an empty input object, and the regular status/audit fields. No migration is needed.

The Worker resolves the exact explicit model and calls the existing language-model factory. The request must use a fixed prompt (`Reply with OK only`), `temperature: 0`, and `maxOutputTokens: 16`. Test options override the Model's user-configured defaults so the request remains bounded and predictable.

The job succeeds when a valid model response is received. Its output is limited to safe diagnostics:

```json
{
  "ok": true,
  "providerId": "uuid",
  "modelId": "uuid",
  "latencyMs": 312,
  "checkedAt": "2026-07-17T00:00:00.000Z"
}
```

Never store an API key, authorization header, full upstream request, model response content, or raw provider payload. On failure, normalize known conditions while preserving a truncated, secret-scrubbed upstream message in `errorMessage`:

- API key missing in Worker environment.
- Authentication or authorization failure (`401` / `403`).
- Invalid endpoint or model (`404`).
- Rate limit (`429`).
- Upstream timeout or network failure.
- Unknown upstream failure.

The task is visible in Task Center as `provider_test`; it follows the existing retry rule for failed jobs. Retrying uses the current Provider, Model, and environment configuration, which is useful after a key or endpoint is corrected.

## Component boundaries

- `shared`: declares the job type and the test-job result shape.
- `api`: validates the selected configuration, creates and enqueues the job, but never calls an AI provider.
- `worker`: performs the text call through the existing model factory and normalizes diagnostics.
- `web`: presents the dialog, polls the existing job endpoint, and renders test-specific status without handling secrets.

This keeps vendor protocol details in the existing Worker model factory and avoids duplicate OpenAI-compatible, native OpenAI, Anthropic, Google, or DeepSeek request code.

## Testing and acceptance criteria

Automated coverage will verify:

- API rejects a Model from another Provider, a disabled Provider/Model, a non-text Model, and an absent key before enqueueing.
- The Worker uses the explicit selected Model, fixed 16-token limit, and does not fall back to a default Model.
- Success output excludes generated text and secrets.
- Worker failures are stored as failed jobs and can be retried.
- The UI disables submission while a test is active, shows queued/running/succeeded/failed states, and explains an empty eligible-model list.

Manual acceptance:

1. Configure an enabled OpenAI-compatible Provider and a valid text Model.
2. Run Test connection and observe `succeeded` with a latency value.
3. Change the key to an invalid value, restart the Worker, retry, and observe a clear authentication failure.
4. Verify an ordinary text-expansion task still succeeds with the repaired configuration.

## Non-functional constraints

- All endpoints remain admin-only.
- The fixed request is deliberately low cost; no user prompt or customer data is sent.
- The test must use the normal queue so a missing or unhealthy Worker is observable rather than hidden.
- Error presentation must not echo secret values or authorization headers.
