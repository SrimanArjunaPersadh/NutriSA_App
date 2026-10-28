import { describe, expect, it } from "vitest"

import { scrubBreadcrumb, scrubUrl } from "../src/lib/sentry-scrub"

describe("scrubUrl", () => {
  it("drops the search text", () => {
    expect(scrubUrl("https://x.ngrok-free.dev/api/foods/search?q=chicken%20mayo")).toBe(
      "https://x.ngrok-free.dev/api/foods/search",
    )
  })

  it("hides a barcode", () => {
    expect(scrubUrl("https://x.dev/api/foods/barcode/6009522310363")).toBe("https://x.dev/api/foods/barcode/[code]")
  })

  it("hides a chat's and a message's id, keeping the route", () => {
    expect(scrubUrl("https://x.dev/api/chat/conversations/0192f6a4-0000-7000-8000-000000000001")).toBe(
      "https://x.dev/api/chat/conversations/[id]",
    )
    expect(scrubUrl("https://x.dev/api/chat/messages/0192f6a4-0000-7000-8000-000000000002/dismiss")).toBe(
      "https://x.dev/api/chat/messages/[id]/dismiss",
    )
    expect(scrubUrl("https://x.dev/api/chat/conversations")).toBe("https://x.dev/api/chat/conversations")
  })

  it("leaves a plain path alone", () => {
    expect(scrubUrl("https://x.dev/api/day/2026-10-20")).toBe("https://x.dev/api/day/2026-10-20")
  })
})

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "anything" })).toBeNull()
  })

  it("scrubs the URL of a network breadcrumb", () => {
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "https://x.dev/api/foods/search/local?q=oats", method: "GET" } }))
      .toEqual({ category: "fetch", data: { url: "https://x.dev/api/foods/search/local", method: "GET" } })
  })

  it("scrubs a URL inside a message", () => {
    expect(scrubBreadcrumb({ category: "navigation", message: "GET https://x.dev/api/foods/search?q=beans failed" }))
      .toEqual({ category: "navigation", message: "GET https://x.dev/api/foods/search failed" })
  })
})
