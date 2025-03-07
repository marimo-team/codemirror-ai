import { describe, expect, it } from "vitest";
import * as exports from "../index";

describe("index.ts exports", () => {
  it("should not change unexpectedly", () => {
    const sortedExports = Object.keys(exports).sort();
    expect(sortedExports).toMatchInlineSnapshot(`
      [
        "acceptAiEdit",
        "aiExtension",
        "aiTheme",
        "closeAiEditInput",
        "completionState",
        "defaultKeymaps",
        "defaultTriggerRenderer",
        "inputPromptDecoration",
        "inputState",
        "inputValueState",
        "lineShiftListener",
        "loadingState",
        "newCodeDecoration",
        "oldCodeDecoration",
        "optionsFacet",
        "rejectAiEdit",
        "setInputFocus",
        "setInputValue",
        "setLoading",
        "showAiEditInput",
        "showCompletion",
        "showInput",
        "triggerOptions",
        "triggerPlugin",
        "triggerViewPlugin",
      ]
    `);
  });
});
