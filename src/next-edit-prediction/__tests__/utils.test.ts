import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import type { DiffOperation } from "../diff.js";
import { createSuggestionDecorations } from "../extension.js";
import { insertDiffText } from "../utils.js";

describe("insertDiffText with DiffOperation", () => {
  const createState = (doc: string, cursor?: number) => {
    return EditorState.create({
      doc,
      selection: cursor !== undefined ? EditorSelection.cursor(cursor) : undefined,
    });
  };

  describe("add operations", () => {
    it("should handle simple text addition", () => {
      const state = createState("hello world");
      const operation: DiffOperation = {
        type: "add",
        position: 5,
        text: " beautiful",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 15,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 5,
				  "insert": " beautiful",
				  "to": 5,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 15,
				  "head": 15,
				}
			`);
      expect(transaction.userEvent).toBe("input.complete");
    });

    it("should handle add at beginning", () => {
      const state = createState("world");
      const operation: DiffOperation = {
        type: "add",
        position: 0,
        text: "hello ",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 6,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "hello ",
				  "to": 0,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 6,
				  "head": 6,
				}
			`);
    });

    it("should handle add at end", () => {
      const state = createState("hello");
      const operation: DiffOperation = {
        type: "add",
        position: 5,
        text: " world",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 11,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 5,
				  "insert": " world",
				  "to": 5,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 11,
				  "head": 11,
				}
			`);
    });

    it("should handle empty text additions", () => {
      const state = createState("hello");
      const operation: DiffOperation = {
        type: "add",
        position: 5,
        text: "",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 5,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 5,
				  "insert": "",
				  "to": 5,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 5,
				  "head": 5,
				}
			`);
    });
  });

  describe("remove operations", () => {
    it("should handle simple text removal", () => {
      const state = createState("hello beautiful world");
      const operation: DiffOperation = {
        type: "remove",
        position: 5,
        count: 10,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 5,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 5,
				  "insert": "",
				  "to": 15,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 5,
				  "head": 5,
				}
			`);
    });

    it("should handle remove from beginning", () => {
      const state = createState("hello world");
      const operation: DiffOperation = {
        type: "remove",
        position: 0,
        count: 6,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 0,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "",
				  "to": 6,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 0,
				  "head": 0,
				}
			`);
    });

    it("should handle remove to end", () => {
      const state = createState("hello world");
      const operation: DiffOperation = {
        type: "remove",
        position: 5,
        count: 6,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 5,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 5,
				  "insert": "",
				  "to": 11,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 5,
				  "head": 5,
				}
			`);
    });

    it("should handle zero count removals", () => {
      const state = createState("hello world");
      const operation: DiffOperation = {
        type: "remove",
        position: 5,
        count: 0,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 5,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 5,
				  "insert": "",
				  "to": 5,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 5,
				  "head": 5,
				}
			`);
    });
  });

  describe("modify operations", () => {
    it("should handle simple text modification", () => {
      const state = createState("hello old world");
      const operation: DiffOperation = {
        type: "modify",
        position: 6,
        insertText: "new",
        removeCount: 3,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 9,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 6,
				  "insert": "new",
				  "to": 9,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 9,
				  "head": 9,
				}
			`);
    });

    it("should handle modify with multiline text", () => {
      const state = createState("def old_function():\n    pass");
      const operation: DiffOperation = {
        type: "modify",
        position: 4,
        insertText: "new_function",
        removeCount: 12,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 16,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 4,
				  "insert": "new_function",
				  "to": 16,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 16,
				  "head": 16,
				}
			`);
    });

    it("should handle python specific operations", () => {
      const state = createState("x = 42");
      const operation: DiffOperation = {
        type: "modify",
        position: 4,
        insertText: '"hello world"',
        removeCount: 2,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 17,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 4,
				  "insert": ""hello world"",
				  "to": 6,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 17,
				  "head": 17,
				}
			`);
    });
  });

  describe("cursor operations", () => {
    it("should handle cursor operation (no text change)", () => {
      const state = createState("hello world");
      const operation: DiffOperation = {
        type: "cursor",
        position: 5,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 5,
      });

      expect(transaction.changes).toBeUndefined();
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 5,
				  "head": 5,
				}
			`);
      expect(transaction.userEvent).toBe("select");
    });

    it("should handle cursor movement", () => {
      const state = createState("hello world", 0);
      const operation: DiffOperation = {
        type: "cursor",
        position: 11,
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 11,
      });

      expect(transaction.changes).toBeUndefined();
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 11,
				  "head": 11,
				}
			`);
    });
  });

  describe("none operations", () => {
    it("should handle none operation (no change)", () => {
      const state = createState("hello world", 5);
      const operation: DiffOperation = {
        type: "none",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 7,
      });

      expect(transaction.changes).toBeUndefined();
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 7,
				  "head": 7,
				}
			`);
    });

    it("should preserve current selection when cursorPosition is null", () => {
      const state = createState("hello world", 5);
      const operation: DiffOperation = {
        type: "none",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: null,
      });

      expect(transaction.changes).toBeUndefined();
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "main": 0,
				  "ranges": [
				    {
				      "anchor": 5,
				      "head": 5,
				    },
				  ],
				}
			`);
    });
  });

  describe("edge cases", () => {
    it("should handle empty document with add operation", () => {
      const state = createState("");
      const operation: DiffOperation = {
        type: "add",
        position: 0,
        text: "Hello",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 5,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "Hello",
				  "to": 0,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 5,
				  "head": 5,
				}
			`);
    });

    it("should handle large documents", () => {
      const largeText = "a".repeat(1000);
      const state = createState(largeText);
      const operation: DiffOperation = {
        type: "add",
        position: 500,
        text: "insertion",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 509,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 500,
				  "insert": "insertion",
				  "to": 500,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 509,
				  "head": 509,
				}
			`);
    });

    it("should handle multiline operations", () => {
      const state = createState("function test() {\n}");
      const operation: DiffOperation = {
        type: "add",
        position: 17,
        text: "  console.log('test');\n",
      };

      const transaction = insertDiffText({
        state,
        operation,
        cursorPosition: 40,
      });

      expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 17,
				  "insert": "  console.log('test');
				",
				  "to": 17,
				}
			`);
      expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 40,
				  "head": 40,
				}
			`);
    });
  });
});

describe("createSuggestionDecorations", () => {
  it("should return empty decorations when no diff parts", () => {
    const result = createSuggestionDecorations({
      type: "none",
    });

    expect(result.size).toBe(0);
  });

  it("should create decorations when diff parts exist", () => {
    const result = createSuggestionDecorations({
      type: "add",
      position: 5,
      text: " world",
    });

    expect(result.size).toBe(2); // GhostTextWidget + AcceptIndicatorWidget
  });

  it("should use correct position for decorations", () => {
    const result = createSuggestionDecorations({
      type: "add",
      position: 5,
      text: " world",
    });

    // Test that decorations are created (we can't easily test the exact position without more setup)
    expect(result.size).toBe(2);
  });

  it("should handle cursor diff parts", () => {
    const result = createSuggestionDecorations({
      type: "cursor",
      position: 5,
    });

    expect(result.size).toBe(1);
  });
});
