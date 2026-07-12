---
name: pinme-r2
description: Use when a PinMe Cloudflare Worker needs R2 object storage, including secure file or image upload, streaming download, metadata lookup, deletion, listing, Range requests, or R2+D1 coordination. Guides AI to use PinMe's automatically injected env.R2 binding without R2 credentials or manual Wrangler configuration.
---

# PinMe Worker R2 Storage

Use the project-scoped R2 bucket that PinMe binds to every deployed Worker as `env.R2`. Do not create credentials, choose a bucket name, or edit generated Wrangler configuration.

## Runtime Contract

PinMe rebuilds trusted Worker metadata on create, save, and update. Client metadata cannot replace the R2 binding.

| Binding | TypeScript type | Availability |
| --- | --- | --- |
| `DB` | `D1Database` | Always injected |
| `R2` | `R2Bucket` | Always injected; current project's bucket |
| `API_KEY` | `string` | Always injected |
| `LLM_API_KEY` | `string` | Always injected |
| `BASE_URL` | `string` | Always injected |
| `WORKER_URL` | `string` | Always injected |
| `PROJECT_NAME` | `string` | Always injected |

Payment-specific bindings such as `UNIWEB_SECRET` are conditional and unrelated to R2 access.

Declare only the bindings used by the Worker module. R2 code normally starts with:

```typescript
export interface Env {
  R2: R2Bucket;
  PROJECT_NAME: string;
  WORKER_URL: string;
}
```

When the same module coordinates file metadata in D1, also declare `DB: D1Database` as a required field.

## Choose R2 or D1

- Use R2 for file bodies, images, attachments, media, exports, and other objects addressed by key.
- Use D1 for searchable business metadata, ownership, relations, status, and audit fields.
- For managed files, store the body in R2 and store only its key and business metadata in D1.
- Never use Worker local filesystem state for persistence and never store complete files or base64 payloads in D1.

## Required Security Workflow

Apply this sequence to every upload, download, metadata, delete, and list route:

```text
authenticate request
→ authorize the project/user action
→ validate size and media policy
→ generate or normalize a scoped object key
→ call env.R2
→ return a sanitized response
```

Use the application's existing authentication. The examples below accept a trusted `userId` that the route must obtain from verified identity claims, never from an untrusted request body or query parameter.

Keep object keys server-controlled. Prefer opaque IDs under an owner prefix:

```typescript
const FILE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ownerPrefix(userId: string): string {
  if (!userId) throw new Error('Authenticated user id is required');
  return `users/${encodeURIComponent(userId)}/files/`;
}

function objectKey(userId: string, fileId: string): string {
  if (!FILE_ID_RE.test(fileId)) throw new Error('Invalid file id');
  return `${ownerPrefix(userId)}${fileId}`;
}
```

Never accept a complete object key from the client. Reject empty identifiers, `.` or `..` segments, backslashes, control characters, and any attempt to access another user's prefix.

## Shared Helpers

Use small helpers and explicit business limits. Adapt the allowlist to the product rather than accepting every client-supplied media type.

```typescript
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function safeDownloadName(value: string | null): string {
  const cleaned = (value || 'download')
    .replace(/[\r\n"\\]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return (cleaned || 'download').slice(0, 128);
}

function requestedFileId(request: Request): string | null {
  const url = new URL(request.url);
  const value = url.pathname.split('/').filter(Boolean).at(-1) || '';
  return FILE_ID_RE.test(value) ? value : null;
}
```

Client filenames and `Content-Type` are hints, not proof of content. For sensitive formats, inspect magic bytes or send the object through an asynchronous validation/scanning workflow before marking it ready.

## Stream an Upload

Require authentication before calling this handler. Pass `request.body` directly to R2; do not call `arrayBuffer()`, `text()`, `json()`, `formData()`, or base64 conversion first.

```typescript
async function handleUpload(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  if (!request.body) return json({ error: 'File body is required' }, 400);

  const lengthHeader = request.headers.get('content-length');
  if (!lengthHeader) return json({ error: 'Content-Length is required' }, 411);

  const declaredSize = Number(lengthHeader);
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
    return json({ error: 'Invalid Content-Length' }, 400);
  }
  if (declaredSize > MAX_UPLOAD_BYTES) {
    return json({ error: 'File is too large' }, 413);
  }

  const contentType = (request.headers.get('content-type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return json({ error: 'Unsupported media type' }, 400);
  }

  const fileId = crypto.randomUUID();
  const key = objectKey(userId, fileId);
  const filename = safeDownloadName(request.headers.get('x-file-name'));

  const object = await env.R2.put(key, request.body, {
    httpMetadata: {
      contentType,
      contentDisposition: `attachment; filename="${filename}"`,
    },
    customMetadata: { ownerId: userId },
  });

  if (object === null) return json({ error: 'Upload precondition failed' }, 412);

  // Content-Length is only a precheck. Enforce the actual stored size too.
  if (object.size > MAX_UPLOAD_BYTES) {
    await env.R2.delete(key);
    return json({ error: 'File is too large' }, 413);
  }

  return json({ id: fileId, size: object.size, etag: object.httpEtag }, 201);
}
```

Do not return the bucket name or internal object-key layout. Return an opaque file ID that later routes resolve under the authenticated owner's prefix.

## Stream a Download

Validate a single Range header before passing it to R2. R2 may return `null` when the object does not exist, or metadata without a body when a conditional request fails.

```typescript
function validRangeHeader(value: string | null): boolean {
  if (!value) return true;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  return Boolean(match && (match[1] || match[2]));
}

async function handleDownload(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const fileId = requestedFileId(request);
  if (!fileId) return json({ error: 'Invalid file id' }, 400);
  if (!validRangeHeader(request.headers.get('range'))) {
    return json({ error: 'Invalid Range header' }, 416);
  }

  const object = await env.R2.get(objectKey(userId, fileId), {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (object === null) return json({ error: 'Not found' }, 404);
  if (!('body' in object)) return new Response(null, { status: 412 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  if (object.range) {
    const { offset, length } = object.range;
    headers.set(
      'content-range',
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    headers.set('content-length', String(length));
  } else {
    headers.set('content-length', String(object.size));
  }

  return new Response(object.body, {
    status: object.range ? 206 : 200,
    headers,
  });
}
```

For routes backed by D1 metadata, authorize the D1 row's owner before calling `env.R2.get`. Do not infer ownership only from a client-provided path.

## Read Metadata with HEAD

```typescript
async function handleHead(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const fileId = requestedFileId(request);
  if (!fileId) return json({ error: 'Invalid file id' }, 400);

  const object = await env.R2.head(objectKey(userId, fileId));
  if (object === null) return new Response(null, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('content-length', String(object.size));
  return new Response(null, { status: 200, headers });
}
```

Use `head()` when only size, ETag, upload time, or metadata is needed. Do not download the body to answer metadata requests.

## Delete an Object

```typescript
async function handleDelete(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const fileId = requestedFileId(request);
  if (!fileId) return json({ error: 'Invalid file id' }, 400);

  const key = objectKey(userId, fileId);
  const object = await env.R2.head(key);
  if (object === null) return json({ error: 'Not found' }, 404);

  await env.R2.delete(key);
  return new Response(null, { status: 204 });
}
```

R2 can delete up to 1000 keys in one `delete([...keys])` call. Batch deletion must still derive and authorize every key server-side.

## List an Owner's Objects

Never list the whole bucket for an end-user request. Derive the prefix from verified identity and treat the cursor as opaque.

```typescript
async function handleList(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (cursor && cursor.length > 2048) {
    return json({ error: 'Invalid cursor' }, 400);
  }

  const page = await env.R2.list({
    prefix: ownerPrefix(userId),
    cursor: cursor || undefined,
    limit: 100,
    include: ['httpMetadata', 'customMetadata'],
  });

  return json({
    objects: page.objects.map((object) => ({
      id: object.key.slice(ownerPrefix(userId).length),
      size: object.size,
      uploaded: object.uploaded.toISOString(),
      etag: object.httpEtag,
      contentType: object.httpMetadata?.contentType,
    })),
    nextCursor: page.truncated ? page.cursor : null,
  });
}
```

An R2 list call returns at most 1000 entries and may return fewer than the requested limit when metadata is included. Continue only when `page.truncated` is true; never use `objects.length === limit` as the pagination condition.

## Route and Error Semantics

Authenticate once in the router, derive a trusted `userId`, then pass it to the handlers. Return an `Allow` header for unsupported methods.

| Status | Meaning |
| --- | --- |
| 400 | Invalid file ID, body, cursor, or media type |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not allowed to access the object |
| 404 | Object or owned metadata record not found |
| 411 | A capped upload route requires `Content-Length` but it is absent |
| 412 | Conditional R2 operation failed |
| 413 | Business or platform upload limit exceeded |
| 416 | Invalid or unsatisfiable Range request |
| 500 | Sanitized internal storage failure |

Catch storage failures at the route boundary, log only non-sensitive context, and return a generic error. Never return a raw provider error, bucket name, credential, or internal object key.
Translate a valid-but-unsatisfiable R2 Range failure to `416` without returning the provider error text.

## Coordinate R2 with D1

R2 and D1 do not share a transaction. Use an explicit state transition when business metadata is required:

```text
insert D1 row with status=pending
→ stream body to R2
→ update D1 row to status=ready
```

- If upload fails, delete the pending row or mark it failed.
- If the final D1 update fails, delete the newly uploaded object or retain a durable pending state for a compensation job.
- Store at least: public file ID, internal object key, owner ID, original name, size, MIME, status, and timestamps.
- For download and delete, load the row by public file ID and owner ID before touching R2.
- Delete the R2 object and D1 row with an explicit retry/compensation policy; do not pretend the two operations are atomic.

## Large Files

Use `request.body → env.R2.put` for small and medium uploads. Streaming avoids Worker memory amplification but does not bypass the Cloudflare request-body limit for the account plan.

Use multipart only when the object exceeds that request limit or resumability is an explicit product requirement. A multipart API must:

- authenticate every create, upload-part, complete, resume, and abort action;
- bind the object key and upload ID to an owner in durable state;
- validate part number, part size, total size, and declared content type;
- make completion idempotent and abort stale uploads;
- avoid accepting an arbitrary key or upload ID from an untrusted client.

Do not generate a public multipart controller by default. Multipart state and security are substantially more complex than a single streaming upload.

## Local Development

- Do not edit PinMe-generated `backend/wrangler.toml` to add an R2 binding.
- Unit-test key generation, authorization, routing, and failure handling with a narrow `R2Bucket` mock.
- Verify real metadata, Range, conditional requests, and streaming after `pinme update-worker` or `pinme save`.
- Treat the mock as a logic test, not proof of production R2 behavior.

## Anti-Patterns

| Do not | Use instead |
| --- | --- |
| Expose an unauthenticated upload route | Authenticate and authorize before every mutation |
| Accept a complete object key from the client | Generate an opaque ID under a server-derived owner prefix |
| Trust a user ID from JSON or query parameters | Derive identity from verified claims |
| Read a large body into an ArrayBuffer or base64 string | Stream `request.body` directly into `env.R2.put` |
| Store file bodies or base64 in D1 | Store bodies in R2 and searchable metadata in D1 |
| List the whole bucket | Restrict with an owner prefix and paginate |
| Stop pagination based on returned object count | Check `page.truncated` and return `page.cursor` |
| Drop response metadata | Apply `writeHttpMetadata`, `httpEtag`, length, and Range headers |
| Persist with `fs` or local directories | Use the injected R2 binding |
| Add R2 keys or secrets to source/config | Use `env.R2`; PinMe owns the binding |
| Edit generated Wrangler binding configuration | Deploy through `pinme save` or `pinme update-worker` |
