---
name: pinme-uniwebpay
description: Use when generating, modifying, or reviewing PinMe Worker (Cloudflare Worker TypeScript) code that accepts payments through UniwebPay — payment links, products/prices, checkout sessions, payment status reads, refunds, subscriptions, or handling UniwebPay webhooks with @uniwebpay/sdk in a PinMe project.
---

# PinMe UniwebPay Payment Integration

Guides writing payment services in a PinMe Worker (Cloudflare Worker TypeScript) that call UniwebPay directly through `@uniwebpay/sdk`.

Core model: PinMe provisions the UniwebPay wallet and keys per **PinMe user** (not per project) and injects `UNIWEB_*` environment bindings at Worker deploy time; Worker code calls UniwebPay **directly with the SDK** — it does not go through PinMe payment proxy routes, and it must not call the legacy VibeCash APIs.

## Environment Binding Contract

```typescript
export interface Env {
  UNIWEB_SECRET: string;           // PinMe-provisioned sk_server_ key (server-side only)
  UNIWEB_WEBHOOK_SECRET?: string;  // wallet-level whsec_, used to verify webhook signatures
  UNIWEB_API_URL?: string;         // UniwebPay API endpoint override (default https://apiskill.uniwebpay.com)
  UNIWEB_PAY_URL?: string;         // UniwebPay checkout host override (default https://skill.uniwebpay.com)
  UNIWEB_WALLET_ID?: string;       // user-level wallet id (wal_), diagnostics/reconciliation only
  WORKER_URL?: string;             // this project's public URL: https://{projectName}.{platform api domain}
  PROJECT_NAME?: string;           // PinMe project name
  DB?: D1Database;                 // project D1 (if enabled)
}
```

Injection rules (metadata is rebuilt server-side by PinMe at deploy time; client-supplied bindings are ignored):

- The `UNIWEB_*` bindings are injected only after the user's UniwebPay credentials have been provisioned. Newly created projects are provisioned automatically and get them immediately; **existing projects must be redeployed after enabling UniwebPay or rotating keys** to pick up new bindings.
- `WORKER_URL`, `PROJECT_NAME`, `API_KEY`, `DB` and other base bindings are injected on every deploy, independent of UniwebPay.
- All projects owned by the same PinMe user share one wallet, one `sk_server_`, and one `whsec_`.
- PinMe never gives the full wallet secret (`sk_live_`) to a Worker. Do not ask the user for it, and do not put it in code, `wrangler.toml`, `.dev.vars`, responses, logs, D1, or frontend bundles.
- If `UNIWEB_SECRET` is missing at runtime, the user has not enabled UniwebPay or has not redeployed — tell the user to enable it and redeploy; never fabricate a value.

## SDK Client

Always instantiate on the server side (the Worker); the SDK throws when run in a browser:

```typescript
import Uniweb from "@uniwebpay/sdk";

function uniwebClient(env: Env): Uniweb {
  return new Uniweb(env.UNIWEB_SECRET, {
    baseUrl: env.UNIWEB_API_URL,
    payUrl: env.UNIWEB_PAY_URL,
  });
}
```

- The constructor's first positional argument is the key (must have an `sk_server_` or `sk_live_` prefix); the second is optional options: `{ baseUrl?, payUrl?, timeout? (default 30s), maxRetries? (default 2) }`.
- The SDK auto-retries only GET/DELETE on 429/5xx; POST/PATCH are never retried (avoids duplicate charges).
- Install `@uniwebpay/sdk` only when Worker code imports it; pick the package manager from the project's existing lockfile.

## Choosing an Integration Path

| Scenario | Approach | Returns |
|------|------|------|
| Fixed-amount one-time collection | `uniweb.links.create(...)` | Permanent, reusable `/p/` link (one-time payments only) |
| Stable product catalog | `products.create` + `prices.create` once, store the `priceId` | Price carries a permanent `paymentUrl` (`/buy/` link) |
| Dynamic cart/order | Reuse or create a price, then `uniweb.checkout.create(...)` | `session.url` — **one-time, expires in 24 hours** |
| Subscriptions | Recurring price + `checkout.create({ mode: "subscription" })` or `subscriptions.create` | Same as above |
| Server-side payment status checks | `payments.get / list` | Server routes only |

Amounts are always **integer minor units** (cents). Default currency convention is `SGD` unless the app has a stronger existing convention. Do not create a new product/price on every page view — create stable catalog items once and persist the `priceId`.

## Payment Methods and Currency Rules

| Method | Supported currencies |
|------|---------|
| `card` | SGD, USD, EUR, GBP, JPY, CNY, HKD, AUD, MYR, THB (minimum 10 minor units) |
| `wechat` | SGD only |
| `alipay` | SGD only |
| `paynow` | SGD only |

- The QR methods (wechat/alipay/paynow) **all support SGD only** — never generate "CNY via WeChat/Alipay" code.
- Subscriptions (recurring / `mode: "subscription"`) use `card` only.
- When `paymentMethodTypes` is omitted, the server picks sensible defaults for the currency; when passed explicitly, validate user input against the table above first.

## SDK Surface Quick Reference

The surface below is verified against source. All parameter fields are camelCase (`priceId`, `webhookUrl`, `startingAfter`, …); the SDK handles wire-level conversion itself. `list()` returns `{ data: T[], hasMore: boolean }`; `listAll()` is an async generator available on products, prices, payments, customers, subscriptions, and links (not on checkout or refunds).

Products (`webhookUrl` is the per-product callback override):

```typescript
await uniweb.products.create({ name, description?, webhookUrl?, metadata? });
await uniweb.products.list({ limit?, startingAfter? });
await uniweb.products.get(productId);
await uniweb.products.update(productId, { name?, description?, webhookUrl?, active?, metadata? });
await uniweb.products.del(productId);
for await (const product of uniweb.products.listAll()) {}
```

Prices (the returned price carries a permanent `paymentUrl`; `deactivate` takes it off sale):

```typescript
await uniweb.prices.create({
  productId,
  amount,        // integer minor units
  currency,      // e.g. "SGD"
  type,          // "one_time" | "recurring"
  interval?,     // "day" | "week" | "month" | "year"; recurring only
  intervalCount?,
  trialPeriodDays?,
  metadata?,
});
await uniweb.prices.list({ productId?, limit?, startingAfter? });
await uniweb.prices.get(priceId);
await uniweb.prices.update(priceId, { active });
await uniweb.prices.activate(priceId);
await uniweb.prices.deactivate(priceId);
for await (const price of uniweb.prices.listAll({ productId? })) {}
```

Checkout sessions (**do not accept `webhookUrl`** — events resolve through the price → product → wallet chain; the URL is one-time and expires after 24 hours):

```typescript
await uniweb.checkout.create({
  mode,           // "payment" | "subscription"
  lineItems: [{ priceId, quantity }],
  successUrl?,
  cancelUrl?,
  customerEmail?,
  customerId?,
  trialPeriodDays?,
  paymentMethodTypes?, // ["card", "wechat", "alipay", "paynow"]
  metadata?,
});
await uniweb.checkout.list({ limit?, startingAfter? });
await uniweb.checkout.get(checkoutSessionId);
```

Payments (for server-side status checks; only mark a local order paid when amount, currency, metadata, and order state all match expectations):

```typescript
await uniweb.payments.create({ amount, currency, customerId?, metadata? });
await uniweb.payments.list({ status?, customerId?, limit?, startingAfter? });
await uniweb.payments.get(paymentId, { gateway? });
await uniweb.payments.listRefunds(paymentId);
await uniweb.payments.sync(paymentId);
await uniweb.payments.void(paymentId);
for await (const payment of uniweb.payments.listAll({ status?, customerId? })) {}
```

Refunds (no list/listAll — use `payments.listRefunds`):

```typescript
await uniweb.refunds.create({ paymentId, amount?, reason?, offlineRefundFlag? });
await uniweb.refunds.get(refundId, { gateway? });
```

Customers:

```typescript
await uniweb.customers.create({ email, name?, metadata? });
await uniweb.customers.list({ email?, limit?, startingAfter? });
await uniweb.customers.get(customerId);
await uniweb.customers.update(customerId, { email?, name?, metadata? });
await uniweb.customers.del(customerId);
for await (const customer of uniweb.customers.listAll({ email? })) {}
```

Subscriptions (states include `trialing` / `active` / `past_due` / `unpaid` / `canceled`; update access only from verified webhooks or a trusted server-side reconciliation job):

```typescript
await uniweb.subscriptions.create({ customerId, priceId, paymentMethodId?, trialPeriodDays?, metadata? });
await uniweb.subscriptions.list({ customerId?, status?, limit?, startingAfter? });
await uniweb.subscriptions.get(subscriptionId);
await uniweb.subscriptions.update(subscriptionId, { cancelAtPeriodEnd? });
await uniweb.subscriptions.cancel(subscriptionId); // cancel immediately
await uniweb.subscriptions.resume(subscriptionId); // undo cancelAtPeriodEnd
for await (const subscription of uniweb.subscriptions.listAll({ customerId?, status? })) {}
```

Payment links (permanent reusable `/p/` links, one-time collection only; `webhookUrl` is the per-link callback override):

```typescript
await uniweb.links.create({
  amount,
  currency,
  name?,
  description?,
  successUrl?,
  cancelUrl?,
  webhookUrl?,
  paymentMethodTypes?,
  metadata?,
});
await uniweb.links.list({ limit?, startingAfter? });
await uniweb.links.get(paymentLinkId);
await uniweb.links.update(paymentLinkId, { name?, description?, successUrl?, cancelUrl?, webhookUrl?, active? });
await uniweb.links.deactivate(paymentLinkId);
for await (const link of uniweb.links.listAll()) {}
```

Wallet and wallet-level webhook configuration (**danger zone**: affects the wallet shared by ALL of the user's projects):

```typescript
await uniweb.wallet.current();
await uniweb.wallet.update({ merchantName?, merchantCity?, merchantCountry?, webhookUrl? });
await uniweb.webhooks.set(url);       // overwrites the wallet-level callback URL
await uniweb.webhooks.info();
await uniweb.webhooks.remove();
await uniweb.webhooks.rollSecret();   // rotates the shared whsec_
```

Ordinary project routes must **not** call `webhooks.set / remove / rollSecret` or `wallet.update` — they mutate the wallet callback fallback and signing secret shared across all of the user's projects. Generate them only when the user explicitly asks for wallet administration and the route has project/admin-level authorization. Same for refunds, subscription mutations, payouts, KYC, and bank account APIs: generate only when the user explicitly requests that business flow and the code has validation, persistence, and authorization.

## Webhook Integration

### Callback URL: set it on the link/product, pointing at this Worker

Event delivery precedence: **per-link `webhookUrl` > per-product `webhookUrl` > wallet-level fallback**. The signing secret is always the wallet-level `whsec_` (i.e. `env.UNIWEB_WEBHOOK_SECRET`).

PinMe sets a managed fallback callback URL on the wallet, but it exists only to obtain and preserve the signing secret — **PinMe's server discards events it receives there (204); it never forwards them to the Worker**. Business events must therefore set this project's `webhookUrl` explicitly on the resource that creates the payment:

- Payment links: pass `webhookUrl` on `links.create`.
- Checkout sessions: `checkout.create` has no `webhookUrl` field; events route through the price's product — set `webhookUrl` on `products.create` (or on the reused product).

Rules for building the `webhookUrl`:

- Keep the callback path in a single constant (e.g. `const WEBHOOK_PATH = "/api/pay/webhook"`) shared by the router and the `webhookUrl` construction, so a path mismatch can't 404 the callbacks and leave orders stuck in pending.
- Use `env.WORKER_URL` as the base: `new URL(WEBHOOK_PATH, env.WORKER_URL).toString()`. It is the only public address available at runtime (the platform subdomain); the user's custom domain is not in `env`. Prefer it over `request.url` (the current request's host is not necessarily the deployed address), and non-HTTP contexts (cron/queue) have no request at all — fail loudly if it's missing rather than emitting a broken URL.
- Local dev has no `WORKER_URL`; a `request.url` fallback resolves to localhost, which UniwebPay cannot reach. To test webhooks locally, expose the Worker through a tunnel (cloudflared / ngrok).
- `webhookUrl` must be HTTPS. Put no secrets or trust-bearing data in the URL query — carry correlation like `orderId` in `metadata`, and verify identity from the signature plus `metadata` (a query string can be forged).

### Verification and Handling

```typescript
import { verifyWebhook } from "@uniwebpay/sdk";

const rawBody = await request.text();              // read the raw body exactly once
const event = await verifyWebhook(                  // note: async
  rawBody,
  request.headers.get("uniweb-Signature") || "",   // format: t=<unix>,v1=<hex>
  env.UNIWEB_WEBHOOK_SECRET,
);
```

- `verifyWebhook(rawBody, signature, secret)` returns `Promise<WebhookEvent>`; signature timestamp tolerance is ±5 minutes; it throws on failure.
- Event shape: `{ id: "evt_...", type, created, data: { object, productId?, priceId?, productName? } }`. The business object is in `event.data.object`; correlation like `orderId` is in `event.data.object.metadata`.
- Event types verified as actually delivered: `payment.succeeded` / `payment.failed` / `payment.refunded` / `payment.partially_refunded`, `refund.succeeded` / `refund.failed` / `refund.abandoned`, `checkout.session.completed` / `checkout.session.expired`, `subscription.created` / `subscription.renewed` / `subscription.past_due` / `subscription.unpaid` / `subscription.trial_ending` / `subscription.canceled`.

Handling rules:

- **The webhook route must bypass the project's own auth.** UniwebPay callbacks carry only `uniweb-Signature` (plus `uniweb-Event-Id` / `uniweb-Timestamp`), never the project `API_KEY`. If a global auth guard wraps all routes, exempt `WEBHOOK_PATH` — trust comes solely from signature verification. Otherwise callbacks get 401/403 and orders never fulfill.
- Return 400 for invalid signatures (so UniwebPay stops pointless retries); return 500 for temporary processing failures (so it retries).
- Enforce idempotency with `event.id` (combined with payment id / checkout session id / local order id).
- Before fulfillment, verify amount, currency, metadata, and current order state.
- Respond within 10 seconds; delivery does not follow redirects, so do not put the webhook route behind a redirect. The first delivery is immediate; on failure, retries follow at 5-minute, 30-minute, 2-hour, and 12-hour intervals, up to 6 attempts before the event is marked failed.
- Keep `UNIWEB_WEBHOOK_SECRET` optional in TypeScript — a project can exist before provisioning or redeploy; return 501 with a hint when it's missing at runtime.

## Security Rules

- No Uniweb secret (`UNIWEB_SECRET`, `UNIWEB_WEBHOOK_SECRET`) may appear in responses, logs, metadata, test snapshots, D1, source code, committed `wrangler.toml` / `.dev.vars`, or browser code. For local dev, use an uncommitted `.dev.vars` only.
- Do not import the SDK in browser-side code; do not use `process.env` in Cloudflare Workers — use the `env` argument.
- Do not call legacy VibeCash APIs or PinMe payment proxy routes; do not call PinMe payment APIs with `X-API-Key` for UniwebPay collection — the Worker calls UniwebPay directly through the SDK.
- `successUrl` / `cancelUrl` are UX redirects only. **Never fulfill based on a browser redirect**; grant access only after verified webhook processing (or another explicit server-side verification).
- Validate user input before SDK calls: amount (integer minor units), currency (ISO 4217 and within the payment-method constraints), quantity, product/price IDs, payment method types, order ownership, and metadata shape.

## Persistence Guidance (D1)

Add tables/migrations only when the project already uses D1 or the user asks for persistence. For order flows, store at least: local order id, the corresponding Uniweb link/session/payment/subscription id, amount and currency, status, timestamps, and processed webhook event ids (for idempotency). Never store secrets.

```sql
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  checkout_session_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  paid_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  order_id TEXT,
  raw_payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

## Worker Reference Implementation

```typescript
import Uniweb, { verifyWebhook } from "@uniwebpay/sdk";

export interface Env {
  UNIWEB_SECRET: string;
  UNIWEB_WEBHOOK_SECRET?: string;
  UNIWEB_API_URL?: string;
  UNIWEB_PAY_URL?: string;
  UNIWEB_WALLET_ID?: string;
  WORKER_URL?: string;
  PROJECT_NAME?: string;
  DB?: D1Database;
}

type PaymentMethod = "card" | "wechat" | "alipay" | "paynow";

const VALID_PAYMENT_METHODS = new Set<PaymentMethod>(["card", "wechat", "alipay", "paynow"]);
const CARD_CURRENCIES = new Set(["SGD", "USD", "EUR", "GBP", "JPY", "CNY", "HKD", "AUD", "MYR", "THB"]);

// Single source of truth for the webhook path: shared by the router and the
// webhookUrl construction so the address sent to UniwebPay always matches the
// route the Worker actually serves.
const WEBHOOK_PATH = "/api/pay/webhook";

function uniwebClient(env: Env): Uniweb {
  return new Uniweb(env.UNIWEB_SECRET, {
    baseUrl: env.UNIWEB_API_URL,
    payUrl: env.UNIWEB_PAY_URL,
  });
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, init);
}

function assertAmountCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 10) {
    throw new Error("amountCents must be an integer minor-unit amount >= 10");
  }
  return amount;
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value || "SGD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be an ISO 4217 code");
  return currency;
}

// QR methods (wechat/alipay/paynow) support SGD only; card supports 10 currencies.
function defaultPaymentMethods(currency: string): PaymentMethod[] {
  if (currency === "SGD") return ["card", "wechat", "alipay", "paynow"];
  if (CARD_CURRENCIES.has(currency)) return ["card"];
  throw new Error(`unsupported currency: ${currency}`);
}

function normalizePaymentMethods(value: unknown, currency: string): PaymentMethod[] {
  const requested = Array.isArray(value) && value.length > 0 ? value : defaultPaymentMethods(currency);
  const methods = requested.map((m) => String(m).toLowerCase() as PaymentMethod);
  for (const method of methods) {
    if (!VALID_PAYMENT_METHODS.has(method)) {
      throw new Error("paymentMethodTypes contains an unsupported method");
    }
    if (method !== "card" && currency !== "SGD") {
      throw new Error(`${method} only supports SGD payments`);
    }
    if (method === "card" && !CARD_CURRENCIES.has(currency)) {
      throw new Error(`card does not support ${currency}`);
    }
  }
  return Array.from(new Set(methods));
}

// Prefer the PinMe-injected WORKER_URL (the project's platform subdomain, the
// only public address available at runtime). request.url is only a fallback for
// older deploys; cron/queue contexts have no request, so WORKER_URL is required.
function projectWebhookUrl(env: Env, request?: Request): string {
  const base = env.WORKER_URL || request?.url;
  if (!base) throw new Error("WORKER_URL binding is missing");
  return new URL(WEBHOOK_PATH, base).toString();
}

// ---- One-time collection: payment link ----

async function createPaymentLink(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });

  let input: any;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, { status: 400 });
  }

  let amount: number, currency: string, paymentMethodTypes: PaymentMethod[];
  try {
    amount = assertAmountCents(input.amountCents);
    currency = normalizeCurrency(input.currency);
    paymentMethodTypes = normalizePaymentMethods(input.paymentMethodTypes, currency);
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 });
  }

  const orderId = input.orderId || crypto.randomUUID();
  const uniweb = uniwebClient(env);

  try {
    const link = await uniweb.links.create({
      amount,
      currency,
      name: input.name || "Payment",
      description: input.description,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      webhookUrl: projectWebhookUrl(env, request),
      paymentMethodTypes,
      metadata: { orderId, projectName: env.PROJECT_NAME },
    });
    return json({ orderId, linkId: link.id, url: link.url });
  } catch {
    return json({ error: "failed to create payment link" }, { status: 502 });
  }
}

// ---- Dynamic orders: checkout session ----
// Note: checkout.create has no webhookUrl; the callback is set on the product.
// Stable catalog items should create the product/price once and persist the
// priceId — do not create new ones on every request.

async function createCheckoutSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });

  let input: any;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, { status: 400 });
  }

  let amount: number, currency: string, paymentMethodTypes: PaymentMethod[];
  try {
    amount = assertAmountCents(input.amountCents);
    currency = normalizeCurrency(input.currency);
    paymentMethodTypes = normalizePaymentMethods(input.paymentMethodTypes, currency);
  } catch (err) {
    return json({ error: (err as Error).message }, { status: 400 });
  }

  const orderId = input.orderId || crypto.randomUUID();
  const quantity = Math.max(1, Math.floor(Number(input.quantity || 1)));
  const uniweb = uniwebClient(env);

  try {
    const product = await uniweb.products.create({
      name: input.productName,
      webhookUrl: projectWebhookUrl(env, request),
      metadata: { orderId, projectName: env.PROJECT_NAME },
    });
    const price = await uniweb.prices.create({
      productId: product.id,
      amount,
      currency,
      type: "one_time",
      metadata: { orderId, projectName: env.PROJECT_NAME },
    });
    const session = await uniweb.checkout.create({
      mode: "payment",
      lineItems: [{ priceId: price.id, quantity }],
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.customerEmail,
      paymentMethodTypes,
      metadata: { orderId, projectName: env.PROJECT_NAME },
    });

    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO orders(order_id, checkout_session_id, status, amount_cents, currency, created_at)
         VALUES (?, ?, 'pending', ?, ?, ?)
         ON CONFLICT(order_id) DO UPDATE SET checkout_session_id = excluded.checkout_session_id`,
      )
        .bind(orderId, session.id, amount * quantity, currency, Math.floor(Date.now() / 1000))
        .run();
    }

    return json({ orderId, checkoutSessionId: session.id, url: session.url });
  } catch {
    return json({ error: "failed to create checkout session" }, { status: 502 });
  }
}

// ---- Webhook handling ----

async function handleUniwebWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  if (!env.UNIWEB_WEBHOOK_SECRET) {
    return json({ error: "webhook verification is not configured" }, { status: 501 });
  }

  const rawBody = await request.text();
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(
      rawBody,
      request.headers.get("uniweb-Signature") || "",
      env.UNIWEB_WEBHOOK_SECRET,
    );
  } catch {
    return json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    if (env.DB) {
      const object = event.data.object as { metadata?: Record<string, unknown> };
      const orderId = String(object?.metadata?.orderId || "");
      const now = Math.floor(Date.now() / 1000);

      // event.id idempotency: duplicate deliveries become no-ops
      await env.DB.prepare(
        `INSERT INTO payment_events(event_id, event_type, order_id, raw_payload, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(event_id) DO NOTHING`,
      )
        .bind(event.id, event.type, orderId, rawBody, now)
        .run();

      if (event.type === "payment.succeeded" && orderId) {
        // Production code should verify amount/currency/order state here before fulfilling
        await env.DB.prepare(
          `UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ? WHERE order_id = ? AND status != 'paid'`,
        )
          .bind(now, now, orderId)
          .run();
      }
    }
    return json({ ok: true });
  } catch {
    // 500 makes UniwebPay retry on the 5m/30m/2h/12h schedule
    return json({ error: "processing error" }, { status: 500 });
  }
}

// ---- Router ----

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The webhook must come before any project auth guard: callbacks carry only
    // uniweb-Signature, never the project API_KEY.
    if (url.pathname === WEBHOOK_PATH) return handleUniwebWebhook(request, env);

    // The project's own auth guard goes after this point, on the business routes.
    if (url.pathname === "/api/pay/link") return createPaymentLink(request, env);
    if (url.pathname === "/api/pay/checkout") return createCheckoutSession(request, env);

    return json({ error: "not found" }, { status: 404 });
  },
};
```

## Common Mistakes

| Mistake | Consequence / fix |
|------|----------|
| Webhook route blocked by the project's `API_KEY` / bearer auth guard | Callbacks get 401/403 and orders stay pending forever. Exempt `WEBHOOK_PATH`; trust comes solely from signature verification |
| Forgetting to set `webhookUrl` on the link/product | Events fall through to PinMe's managed fallback and are discarded; the Worker never sees them. Business events must point per-link/per-product at this Worker |
| Passing `webhookUrl` to `checkout.create` | The field does not exist. Set it on the backing product |
| Fulfilling on a `successUrl` redirect | Forgeable. Fulfill only from verified webhooks or server-side verification |
| Hardcoding the callback host or relying only on `request.url` | Build from `env.WORKER_URL`; `request.url` is a fallback only |
| Pairing CNY with wechat/alipay | Source limits QR methods to SGD only; CNY can only use card |
| Creating a new product/price on every request | Create stable catalog items once, persist and reuse the `priceId` |
| Calling `webhooks.set/remove/rollSecret` or `wallet.update` in ordinary business flows | Mutates/rotates the wallet callback and `whsec_` shared by ALL of the user's projects. Generate only for explicit wallet-administration requests with admin authorization |
| Using floating-point major units for amounts | Always integer minor units |
| Using `process.env` in the Worker or importing the SDK in the browser | Use the `env` argument; the SDK rejects browser environments |
| Putting `UNIWEB_SECRET` / `whsec_` in `wrangler.toml`, source, logs, or D1 | PinMe injects them at deploy time; locally use an uncommitted `.dev.vars` only |
| Reading the body more than once, or as JSON, before verification | Read with `request.text()` exactly once and pass the raw string to `verifyWebhook` |

## Finish Checklist

- [ ] `@uniwebpay/sdk` is installed only when Worker code imports it; package manager follows the lockfile.
- [ ] `Env` includes the PinMe-injected bindings the code uses; `UNIWEB_WEBHOOK_SECRET` / `WORKER_URL` stay optional and their absence is handled.
- [ ] The client is instantiated with `new Uniweb(env.UNIWEB_SECRET, { baseUrl: env.UNIWEB_API_URL, payUrl: env.UNIWEB_PAY_URL })`.
- [ ] No VibeCash or PinMe payment proxy routes are used; no secret appears in source, responses, logs, D1, tests, or docs.
- [ ] Amounts are validated integer minor units; payment methods and currencies follow the constraint table (QR methods SGD only).
- [ ] Every payment creation that needs events carries a per-link/per-product `webhookUrl` built from `env.WORKER_URL`.
- [ ] Webhook: raw body read exactly once, `verifyWebhook` verification, correct 400/500 semantics, `event.id` idempotency, route bypasses project auth, responds within 10 seconds.
- [ ] Fulfillment does not rely on browser redirects; amount, currency, metadata, and order state are verified before granting access.
