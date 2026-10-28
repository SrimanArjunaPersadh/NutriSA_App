/**
 * What the app's Sentry may keep of a URL it saw.
 *
 * The app's own network calls become Sentry breadcrumbs with their full URL,
 * and ride along on the next error the app reports. On `food-logger` those
 * URLs started carrying what a person is eating: `/api/foods/search?q=chicken`
 * and `/api/foods/barcode/6009522310363`. Found by the Privacy axis of
 * `/nutrisa-review`, 2026-10-20 — the server already scrubs its side
 * (`server/observability/sentry.ts`); this is the app's.
 *
 * Keeps the path (which endpoint failed is the useful part), drops the query
 * string and the fragment, and replaces a barcode with a placeholder.
 */
export function scrubUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? ""
  return (
    withoutQuery
      .replace(/\/barcode\/[^/]+/i, "/barcode/[code]")
      // A chat's or a message's id: no content, but it ties the error to one
      // conversation (Privacy review, 2026-10-28).
      .replace(/\/chat\/(conversations|messages)\/[^/]+/i, "/chat/$1/[id]")
  )
}

/** Sentry's breadcrumb, as far as this scrub reads and writes it. */
type Breadcrumb = { category?: string; message?: string; data?: { [key: string]: unknown } }

/**
 * The app's `beforeBreadcrumb`: console breadcrumbs dropped (the server drops
 * them too; a log line is the easiest place for a value to slip), and every
 * URL scrubbed.
 */
export function scrubBreadcrumb<T extends Breadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category === "console") return null
  const url = breadcrumb.data?.url
  if (typeof url === "string") breadcrumb.data = { ...breadcrumb.data, url: scrubUrl(url) }
  if (breadcrumb.message) breadcrumb.message = breadcrumb.message.replace(/https?:\/\/\S+/g, (found) => scrubUrl(found))
  return breadcrumb
}
