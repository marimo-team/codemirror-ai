import { describe, expect, it } from "vitest";
import * as exports from "../index";

describe("index.ts exports", () => {
  it("should not change unexpectedly", () => {
    const sortedExports = Object.keys(exports).sort();
    expect(sortedExports).toMatchInlineSnapshot(`
      [
        "PredictionBackend",
        "acceptAiEdit",
        "acceptInlineCompletion",
        "acceptNepSuggestion",
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
        "navigatePromptDown",
        "navigatePromptUp",
        "newCodeDecoration",
        "nextEditPrediction",
        "oldCodeDecoration",
        "optionsFacet",
        "promptHistory",
        "rejectAiEdit",
        "rejectInlineCompletion",
        "rejectNepSuggestion",
        "setInputFocus",
        "setInputValue",
        "setLoading",
        "showAiEditInput",
        "showCompletion",
        "showInput",
        "storePrompt",
        "triggerOptions",
        "triggerPlugin",
        "triggerViewPlugin",
      ]
    `);
  });
});
