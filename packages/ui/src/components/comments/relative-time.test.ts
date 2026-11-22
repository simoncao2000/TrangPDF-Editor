import { describe, expect, it } from "bun:test";
import { relativeTime } from "./relative-time";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");

describe("relativeTime", () => {
  it("says how long ago, in the largest unit that fits", () => {
    expect(relativeTime("2026-11-21T11:59:40.000Z", NOW)).toBe("just now");
    expect(relativeTime("2026-11-21T11:58:00.000Z", NOW)).toBe("2 min ago");
    expect(relativeTime("2026-11-21T09:00:00.000Z", NOW)).toBe("3 h ago");
    expect(relativeTime("2026-11-19T12:00:00.000Z", NOW)).toBe("2 days ago");
    expect(relativeTime("2026-11-20T11:00:00.000Z", NOW)).toBe("1 day ago");
  });

  it("gives the date for anything older than a week, and nothing for no time", () => {
    expect(relativeTime("2026-10-02T12:00:00.000Z", NOW)).toBe("2 Oct 2026");
    expect(relativeTime(null, NOW)).toBe("");
  });
});
