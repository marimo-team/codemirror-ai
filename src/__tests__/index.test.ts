import { describe, expect, it } from "vitest";
import * as exports from "../index";

describe("index.ts exports", () => {
  it("should not change unexpectedly", () => {
    const sortedExports = Object.keys(exports).sort();
    expect(sortedExports).toMatchInlineSnapshot(`
      [
        "acceptAiEdit",
        "acceptInlineCompletion",
        "aiExtension",
        "aiTheme",
        "closeAiEditInput",
        "completionState",
        "defaultKeymaps",
        "defaultTriggerRenderer",
        "inlineCompletion",
        "inlineCompletionKeymap",
        "inputPromptDecoration",
        "inputState",
        "inputValueState",
        "lineShiftListener",
        "loadingState",
        "newCodeDecoration",
        "oldCodeDecoration",
        "optionsFacet",
        "rejectAiEdit",
        "rejectInlineCompletion",
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
