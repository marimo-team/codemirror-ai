import { afterEach, describe, expect, it, vi } from "vitest";
import { formatKeymap } from "../utils.js";

describe("formatKeymap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["Windows", "Win32", "CTRL L"],
    ["macOS", "MacIntel", "⌘ L"],
    ["other platforms", "Linux x86_64", "CTRL L"],
  ])("formats Mod correctly on %s", (_name, platform, expected) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);

    expect(formatKeymap("Mod-l")).toBe(expected);
  });
});
