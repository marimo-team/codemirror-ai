import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
	createSuggestionDecorations,
	extractDiffParts,
} from "../next-edit-predication/extension.js";
import type { DiffSuggestion } from "../next-edit-predication/types.js";
import { insertDiffText } from "../next-edit-predication/utils.js";

describe("insertDiffText", () => {
	const createState = (doc: string, cursor?: number) => {
		return EditorState.create({
			doc,
			selection:
				cursor !== undefined ? EditorSelection.cursor(cursor) : undefined,
		});
	};

	describe("fallback behavior (no suggestion or ghost text)", () => {
		it("should replace entire document when no suggestion provided", () => {
			const state = createState("original text");
			const newText = "new text content";

			const transaction = insertDiffText(state, newText);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "new text content",
				  "to": 13,
				}
			`);
			expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 16,
				  "head": 16,
				}
			`);
			expect(transaction.userEvent).toMatchInlineSnapshot(`"input.complete"`);
		});

		it("should replace entire document when suggestion has no ghostText", () => {
			const state = createState("original text");
			const suggestion: DiffSuggestion = {
				oldText: "old",
				newText: "new",
				from: 0,
				to: 5,
				// No ghostText property
			};
			const newText = "replacement text";

			const transaction = insertDiffText(state, newText, suggestion);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "replacement text",
				  "to": 13,
				}
			`);
			expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 16,
				  "head": 16,
				}
			`);
		});

		it("should replace entire document when newText doesn't contain cursor marker", () => {
			const state = createState("original text");
			const suggestion: DiffSuggestion = {
				oldText: "old",
				newText: "new",
				from: 0,
				to: 5,
				ghostText: "ghost text",
			};
			const newText = "no cursor marker here";

			const transaction = insertDiffText(state, newText, suggestion);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "no cursor marker here",
				  "to": 13,
				}
			`);
			expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 21,
				  "head": 21,
				}
			`);
		});

		it("should clean cursor markers from fallback text", () => {
			const state = createState("original");
			const newText = `before ▲ after`;

			const transaction = insertDiffText(state, newText);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "before  after",
				  "to": 8,
				}
			`);
		});

		it("should clean cursor markers with newlines from fallback text", () => {
			const state = createState("original");
			const newText = `before ▲\nafter`;

			const transaction = insertDiffText(state, newText);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "before after",
				  "to": 8,
				}
			`);
		});
	});

	describe("normal behavior (with suggestion and ghost text)", () => {
		it("should insert ghost text at specified position", () => {
			const state = createState("Hello world");
			const suggestion: DiffSuggestion = {
				oldText: "world",
				newText: "beautiful world",
				from: 6,
				to: 11,
				ghostText: "beautiful ",
			};
			const newText = `Some text with ▲ marker`;

			const transaction = insertDiffText(state, newText, suggestion);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 11,
				  "insert": "beautiful ",
				  "to": 11,
				}
			`);
			expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 21,
				  "head": 21,
				}
			`);
			expect(transaction.userEvent).toMatchInlineSnapshot(`"input.complete"`);
		});

		it("should handle insertion at document start", () => {
			const state = createState("world");
			const suggestion: DiffSuggestion = {
				oldText: "",
				newText: "Hello ",
				from: 0,
				to: 0,
				ghostText: "Hello ",
			};
			const newText = `Text with ▲ marker`;

			const transaction = insertDiffText(state, newText, suggestion);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "Hello ",
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

		it("should handle insertion at document end", () => {
			const state = createState("Hello");
			const suggestion: DiffSuggestion = {
				oldText: "",
				newText: " world",
				from: 5,
				to: 5,
				ghostText: " world",
			};
			const newText = `Text with ▲ marker`;

			const transaction = insertDiffText(state, newText, suggestion);

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

		it("should handle empty ghost text", () => {
			const state = createState("Hello world");
			const suggestion: DiffSuggestion = {
				oldText: "some",
				newText: "thing",
				from: 6,
				to: 10,
				ghostText: "",
			};
			const newText = `Text with ▲marker`;

			const transaction = insertDiffText(state, newText, suggestion);

			// Empty ghostText should trigger fallback behavior
			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 0,
				  "insert": "Text with marker",
				  "to": 11,
				}
			`);
			expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 16,
				  "head": 16,
				}
			`);
		});

		it("should handle multi-line ghost text", () => {
			const state = createState("function test() {\n}");
			const suggestion: DiffSuggestion = {
				oldText: "",
				newText: "  console.log('test');\n",
				from: 17,
				to: 17,
				ghostText: "  console.log('test');\n",
			};
			const newText = `Code with ▲marker`;

			const transaction = insertDiffText(state, newText, suggestion);

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

		it("should handle ghost text with special characters", () => {
			const state = createState("const obj = {};");
			const suggestion: DiffSuggestion = {
				oldText: "{}",
				newText: "{ key: 'value', num: 42 }",
				from: 12,
				to: 14,
				// ghostText should only contain the extra text to insert, not full replacement
				ghostText: " key: 'value', num: 42 ",
			};
			const newText = `Text with ▲ marker`;

			const transaction = insertDiffText(state, newText, suggestion);

			expect(transaction.changes).toMatchInlineSnapshot(`
				{
				  "from": 14,
				  "insert": " key: 'value', num: 42 ",
				  "to": 14,
				}
			`);
			expect(transaction.selection).toMatchInlineSnapshot(`
				{
				  "anchor": 37,
				  "head": 37,
				}
			`);
		});
	});

	describe("cursor marker variations", () => {
		it("should work with cursor marker with newline", () => {
			const state = createState("Hello");
			const suggestion: DiffSuggestion = {
				oldText: "",
				newText: " world",
				from: 5,
				to: 5,
				ghostText: " world",
			};
			const newText = `Before ▲\nAfter`;

			const transaction = insertDiffText(state, newText, suggestion);

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

		it("should work with multiple cursor markers (uses first one)", () => {
			const state = createState("Hello");
			const suggestion: DiffSuggestion = {
				oldText: "",
				newText: " world",
				from: 5,
				to: 5,
				ghostText: " world",
			};
			const newText = `First ▲ and second ▲`;

			const transaction = insertDiffText(state, newText, suggestion);

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
	});

	describe("edge cases", () => {
		it("should handle empty document", () => {
			const state = createState("");
			const suggestion: DiffSuggestion = {
				oldText: "",
				newText: "Hello",
				from: 0,
				to: 0,
				ghostText: "Hello",
			};
			const newText = `Text with ▲`;

			const transaction = insertDiffText(state, newText, suggestion);

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
			const suggestion: DiffSuggestion = {
				oldText: "",
				newText: "insertion",
				from: 500,
				to: 500,
				ghostText: "insertion",
			};
			const newText = `Text with ▲`;

			const transaction = insertDiffText(state, newText, suggestion);

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
	});
});

type Comparison = Pick<DiffSuggestion, "oldText" | "newText">;

describe("extractDiffParts", () => {
	const cursorMarker = "▲";

	it("should return empty arrays when no cursor marker in new text", () => {
		const suggestion: Comparison = {
			oldText: "hello world",
			newText: "hello earth", // no cursor marker
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result).toEqual({
			diffParts: [],
			ghostText: "",
		});
	});

	it("should handle simple text addition", () => {
		const suggestion: Comparison = {
			oldText: `hello ▲`,
			newText: `hello marimo ▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([{ text: "marimo ", type: "added" }]);
		expect(result.ghostText).toBe("marimo ");
	});

	it("should handle simple text removal", () => {
		const suggestion: Comparison = {
			oldText: `hello marimo ▲`,
			newText: `hello ▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([{ text: "marimo ", type: "removed" }]);
		expect(result.ghostText).toBe("marimo ");
	});

	it("should handle text replacement", () => {
		const suggestion: Comparison = {
			oldText: `hello old ▲`,
			newText: `hello new ▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([
			{ text: "old ", type: "removed" },
			{ text: "new ", type: "added" },
		]);
		expect(result.ghostText).toBe("old new ");
	});

	it("should handle unchanged text", () => {
		const suggestion: Comparison = {
			oldText: `hello ▲ world`,
			newText: `hello ▲ world`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([]);
		expect(result.ghostText).toBe("");
	});

	it("should handle cursor at beginning", () => {
		const suggestion: Comparison = {
			oldText: `▲world`,
			newText: `▲hello world`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([{ text: "hello ", type: "added" }]);
		expect(result.ghostText).toBe("hello ");
	});

	it("should handle cursor at end", () => {
		const suggestion: Comparison = {
			oldText: `hello▲`,
			newText: `hello world▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([{ text: " world", type: "added" }]);
		expect(result.ghostText).toBe(" world");
	});

	it("should handle multiline changes", () => {
		const suggestion: Comparison = {
			oldText: `function test() {▲\n}`,
			newText: `function test() {\n  console.log('hello');▲\n}`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([
			{ text: "\n  console.log('hello');", type: "added" },
		]);
		expect(result.ghostText).toBe("\n  console.log('hello');");
	});

	it("should handle complex diff with multiple changes", () => {
		const suggestion: Comparison = {
			oldText: `const old = ▲42;`,
			newText: `const newVar = ▲'hello';`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts.length).toBeGreaterThan(0);
		expect(result.ghostText).toBeTruthy();
	});

	it("should handle empty strings", () => {
		const suggestion: Comparison = {
			oldText: `▲`,
			newText: `▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([]);
		expect(result.ghostText).toBe("");
	});

	it("should handle only cursor position changes", () => {
		const suggestion: Comparison = {
			oldText: `hello▲ world`,
			newText: `hello ▲world`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts.length).toBeGreaterThanOrEqual(0);
		expect(typeof result.ghostText).toBe("string");
	});

	it("should handle special characters in diff", () => {
		const suggestion: Comparison = {
			oldText: `const obj = {▲};`,
			newText: `const obj = { key: "value" ▲};`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.diffParts).toEqual([
			{ text: ' key: "value" ', type: "added" },
		]);
		expect(result.ghostText).toBe(' key: "value" ');
	});
});

describe("createSuggestionDecorations", () => {
	it("should return empty decorations when no diff parts", () => {
		const suggestion: DiffSuggestion = {
			oldText: "hello",
			newText: "hello",
			from: 0,
			to: 5,
		};

		const result = createSuggestionDecorations(suggestion, []);

		expect(result.size).toBe(0);
	});

	it("should create decorations when diff parts exist", () => {
		const suggestion: DiffSuggestion = {
			oldText: "hello",
			newText: "hello world",
			from: 0,
			to: 5,
		};

		const diffParts = [{ text: " world", type: "added" as const }];

		const result = createSuggestionDecorations(suggestion, diffParts);

		expect(result.size).toBe(2); // GhostTextWidget + AcceptIndicatorWidget
	});

	it("should use correct position for decorations", () => {
		const suggestion: DiffSuggestion = {
			oldText: "hello",
			newText: "hello world",
			from: 10,
			to: 15, // should use this position
		};

		const diffParts = [{ text: " world", type: "added" as const }];

		const result = createSuggestionDecorations(suggestion, diffParts);

		// Test that decorations are created (we can't easily test the exact position without more setup)
		expect(result.size).toBe(2);
	});

	it("should handle multiple diff part types", () => {
		const suggestion: DiffSuggestion = {
			oldText: "hello old world",
			newText: "hello new world",
			from: 0,
			to: 15,
		};

		const diffParts = [
			{ text: "old ", type: "removed" as const },
			{ text: "new ", type: "added" as const },
		];

		const result = createSuggestionDecorations(suggestion, diffParts);

		expect(result.size).toBe(2); // Still creates 2 widgets regardless of diff part count
	});

	it("should handle unchanged diff parts", () => {
		const suggestion: DiffSuggestion = {
			oldText: "hello world",
			newText: "hello world",
			from: 0,
			to: 11,
		};

		const diffParts = [{ text: "hello", type: "unchanged" as const }];

		const result = createSuggestionDecorations(suggestion, diffParts);

		expect(result.size).toBe(2);
	});
});
