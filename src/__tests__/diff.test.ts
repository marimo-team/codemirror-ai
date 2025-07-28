import { Text } from "@codemirror/state";
import { type Change, diffChars } from "diff";
import { describe, expect, it } from "vitest";
import { findLargestDiffBound } from "../next-edit-predication/diff";
import {
	applyDiffOperation,
	type DiffOperationOf,
	type DiffResult,
	type DiffText,
	extractDiffOperation,
} from "../next-edit-predication/diff.js";
import { invariant } from "../utils.js";

const cursorMarker = "▲";

/**
 * Helper function to format DiffResult as human-readable text for snapshots
 */
function diffTexts(before: string, after: string): string {
	const result = extractDiffOperation(
		{ oldText: before, newText: after },
		cursorMarker,
	);
	return new DiffFormatter(before, after, cursorMarker).format(result);
}

/**
 * Class for formatting DiffResult into visual representations
 */
class DiffFormatter {
	constructor(
		private oldText: string,
		private newText: string,
		private cursorMarker: string,
	) {}

	format(result: DiffResult): string {
		const getText = () => {
			switch (result.operation.type) {
				case "add":
					return this.formatAddOperation(result.operation);
				case "remove":
					return this.formatRemoveOperation(result.operation);
				case "modify":
					return this.formatModifyOperation(result.operation);
				case "cursor":
					return this.formatCursorOperation(result.operation);
				case "none":
					return "";
			}
		};

		const text = getText();
		if (text === "") {
			return `[none]`;
		}

		return `[${result.operation.type}]\n\n${this.trimEndLines(text)}\n`;
	}

	private trimEndLines(text: string): string {
		return text
			.split("\n")
			.map((line) => line.trimEnd())
			.join("\n");
	}

	private formatAddOperation(operation: DiffOperationOf<"add">): string {
		const cleanNewText = this.newText.replace(this.cursorMarker, "");
		const cursorPos = this.newText.indexOf(this.cursorMarker);

		return this.formatTextWithIndicators(cleanNewText, cursorPos, {
			operationStart: operation.position,
			operationLength: operation.text.length,
			addedChar: "+",
			removedChar: " ",
		});
	}

	private formatRemoveOperation(operation: DiffOperationOf<"remove">): string {
		const cleanOldText = this.oldText.replace(this.cursorMarker, "");
		const cursorPos = this.oldText.indexOf(this.cursorMarker);

		return this.formatTextWithIndicators(cleanOldText, cursorPos, {
			operationStart: operation.position,
			operationLength: operation.count,
			addedChar: " ",
			removedChar: "~",
		});
	}

	private formatModifyOperation(operation: DiffOperationOf<"modify">): string {
		const lines: string[] = [];

		// Show the old text with removals marked
		const cleanOldText = this.oldText.replace(this.cursorMarker, "");
		const oldCursorPos = this.oldText.indexOf(this.cursorMarker);

		const oldFormatted = this.formatTextWithIndicators(
			cleanOldText,
			oldCursorPos,
			{
				operationStart: operation.position,
				operationLength: operation.removeCount,
				addedChar: " ",
				removedChar: "~",
				prefix: "(-): ",
			},
		);

		// Show the new text with additions marked
		const cleanNewText = this.newText.replace(this.cursorMarker, "");
		const newCursorPos = this.newText.indexOf(this.cursorMarker);

		const newFormatted = this.formatTextWithIndicators(
			cleanNewText,
			newCursorPos,
			{
				operationStart: operation.position,
				operationLength: operation.insertText.length,
				addedChar: "+",
				removedChar: " ",
				prefix: "(+): ",
			},
		);

		return [oldFormatted, newFormatted].join("\n");
	}

	private formatCursorOperation(operation: DiffOperationOf<"cursor">): string {
		const cleanNewText = this.newText.replace(this.cursorMarker, "");
		const cursorPos = this.newText.indexOf(this.cursorMarker);

		return this.formatTextWithIndicators(cleanNewText, cursorPos, {
			operationStart: -1, // No operation range
			operationLength: 0,
			addedChar: " ",
			removedChar: " ",
		});
	}

	private formatTextWithIndicators(
		text: string,
		cursorPos: number,
		options: {
			operationStart: number;
			operationLength: number;
			addedChar: string;
			removedChar: string;
			prefix?: string;
		},
	): string {
		const lines: string[] = [];
		const textLines = text.split("\n");
		let currentPos = 0;
		let foundLine = false;

		for (let i = 0; i < textLines.length; i++) {
			const lineLength =
				textLines[i].length + (i < textLines.length - 1 ? 1 : 0);

			if (
				!foundLine &&
				currentPos <= cursorPos &&
				cursorPos <= currentPos + lineLength
			) {
				const lineText = textLines[i];
				const cursorInLine = cursorPos - currentPos;

				// Add prefix if provided
				const displayLine = (options.prefix || "") + lineText;
				lines.push(displayLine);

				// Create indicator line
				let indicator = " ".repeat(displayLine.length);

				// Mark operation range
				if (options.operationStart >= 0) {
					const opStart =
						options.operationStart - currentPos + (options.prefix?.length || 0);
					const opEnd = opStart + options.operationLength;

					for (
						let j = Math.max(0, opStart);
						j < Math.min(indicator.length, opEnd);
						j++
					) {
						// Use the appropriate character for the operation type
						const char =
							options.addedChar !== " "
								? options.addedChar
								: options.removedChar;
						indicator =
							indicator.substring(0, j) + char + indicator.substring(j + 1);
					}
				}

				// Mark cursor position
				const cursorInDisplay = cursorInLine + (options.prefix?.length || 0);
				if (cursorInDisplay >= 0 && cursorInDisplay < indicator.length) {
					indicator =
						indicator.substring(0, cursorInDisplay) +
						"^" +
						indicator.substring(cursorInDisplay + 1);
				}

				lines.push(indicator);
				foundLine = true;
			} else if (!foundLine) {
				lines.push((options.prefix || "") + textLines[i]);
			}

			currentPos += lineLength;
		}

		return lines.join("\n");
	}
}

describe("extractDiffOperation - snapshot tests", () => {
	it("should handle simple text addition", () => {
		const result = diffTexts(`def hello▲():`, `def hello_world▲():`);
		expect(result).toMatchInlineSnapshot(`
			"[add]

			def hello_world():
			         ++++++^
			"
		`);
	});

	it("should handle simple text removal", () => {
		const result = diffTexts(`def hello_world▲():`, `def hello▲():`);
		expect(result).toMatchInlineSnapshot(`
			"[remove]

			def hello_world():
			         ~~~~~~^
			"
		`);
	});

	it("should handle text replacement", () => {
		const result = diffTexts(`print("old_value"▲)`, `print("new_value"▲)`);
		expect(result).toMatchInlineSnapshot(`
			"[modify]

			(-): print("old_value")
			            ~~~       ^
			(+): print("new_value")
			            +++       ^
			"
		`);
	});

	it("should handle cursor at beginning", () => {
		const result = diffTexts(`▲print("hello")`, `import os\\nprint("hello")`);
		expect(result).toMatchInlineSnapshot(`"[none]"`);
	});

	it("should handle multiline changes", () => {
		const result = diffTexts(
			`def test():▲\n    pass`,
			`def test():\\n    x = 42\\n    print(x)▲`,
		);
		expect(result).toMatchInlineSnapshot(`
			"[modify]

			(-): def test():

			(+): def test():\\n    x = 42\\n    print(x)
			                ++++++++++++++++++++++++++
			"
		`);
	});

	it("should handle complex variable replacement", () => {
		const result = diffTexts(`old_var = ▲42`, `new_variable = ▲"hello"`);
		expect(result).toMatchInlineSnapshot(`
			"[modify]

			(-): old_var = 42
			     ~~~~~~~~~ ^
			(+): new_variable = "hello"
			     +++++++++++++++^+++
			"
		`);
	});

	it("should handle no operation when texts are identical without cursor", () => {
		const result = diffTexts(`def hello_world():`, `def hello_earth():`);
		expect(result).toMatchInlineSnapshot(`"[none]"`);
	});

	it("should handle cursor position changes only", () => {
		const result = diffTexts(`print▲("hello")`, `print(▲"hello")`);
		expect(result).toMatchInlineSnapshot(`
			"[cursor]

			print("hello")
			      ^
			"
		`);
	});

	it("should handle function parameter addition", () => {
		const result = diffTexts(`def calculate(a▲):`, `def calculate(a, b=10▲):`);
		expect(result).toMatchInlineSnapshot(`
			"[add]

			def calculate(a, b=10):
			               ++++++^
			"
		`);
	});

	it("should handle special characters in diff", () => {
		const result = diffTexts(
			`data = {▲}`,
			`data = {"key": "value", "num": 42▲}`,
		);
		expect(result).toMatchInlineSnapshot(`
			"[add]

			data = {"key": "value", "num": 42}
			        +++++++++++++++++++++++++^
			"
		`);
	});

	it("should handle unchanged text", () => {
		const result = diffTexts(`def hello▲() -> str:`, `def hello▲() -> str:`);
		expect(result).toMatchInlineSnapshot(`"[none]"`);
	});

	it("should handle cursor at end", () => {
		const result = diffTexts(
			`print("hello")▲`,
			`print("hello")\\nprint("world")▲`,
		);
		expect(result).toMatchInlineSnapshot(`
			"[add]

			print("hello")\\nprint("world")
			              ++++++++++++++++
			"
		`);
	});

	it("should handle empty strings", () => {
		const result = diffTexts(`▲`, `▲`);
		expect(result).toMatchInlineSnapshot(`"[none]"`);
	});

	it("should handle python class definition changes", () => {
		const result = diffTexts(
			`class MyClass:▲\\n    return 42`,
			`class MyClass:\\n    def __init__(self):\\n        self.value = 0▲\\n    return 42`,
		);
		expect(result).toMatchInlineSnapshot(`
			"[add]

			class MyClass:\\n    def __init__(self):\\n        self.value = 0\\n    return 42
			                    +++++++++++++++++++++++++++++++++++++++++++^+++++
			"
		`);
	});

	it("should handle list comprehension changes", () => {
		const result = diffTexts(
			`numbers = [▲]`,
			`numbers = [x**2 for x in range(10)▲]`,
		);
		expect(result).toMatchInlineSnapshot(`
			"[add]

			numbers = [x**2 for x in range(10)]
			           +++++++++++++++++++++++^
			"
		`);
	});

	it("should handle import statement modification", () => {
		const result = diffTexts(
			`from os import ▲path`,
			`from os import path, environ▲`,
		);
		expect(result).toMatchInlineSnapshot(`
			"[add]

			from os import path, environ
			                   +++++++++
			"
		`);
	});
});

describe("applyDiffOperation", () => {
	it("should apply add operation", () => {
		const text = "hello world";
		const operation = {
			type: "add" as const,
			position: 5,
			text: " beautiful",
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello beautiful world");
	});

	it("should apply remove operation", () => {
		const text = "hello beautiful world";
		const operation = {
			type: "remove" as const,
			position: 5,
			count: 10,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello world");
	});

	it("should apply modify operation", () => {
		const text = "hello old world";
		const operation = {
			type: "modify" as const,
			position: 6,
			insertText: "new",
			removeCount: 3,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello new world");
	});

	it("should handle cursor operation (no change)", () => {
		const text = "hello world";
		const operation = {
			type: "cursor" as const,
			position: 5,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello world");
	});

	it("should handle none operation (no change)", () => {
		const text = "hello world";
		const operation = {
			type: "none" as const,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello world");
	});

	it("should handle add at beginning", () => {
		const text = "world";
		const operation = {
			type: "add" as const,
			position: 0,
			text: "hello ",
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello world");
	});

	it("should handle add at end", () => {
		const text = "hello";
		const operation = {
			type: "add" as const,
			position: 5,
			text: " world",
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello world");
	});

	it("should handle remove from beginning", () => {
		const text = "hello world";
		const operation = {
			type: "remove" as const,
			position: 0,
			count: 6,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("world");
	});

	it("should handle remove to end", () => {
		const text = "hello world";
		const operation = {
			type: "remove" as const,
			position: 5,
			count: 6,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello");
	});

	it("should handle modify with multiline text", () => {
		const text = "def old_function():\n    pass";
		const operation = {
			type: "modify" as const,
			position: 4,
			insertText: "new_function",
			removeCount: 12,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("def new_function():\n    pass");
	});

	it("should handle python specific operations", () => {
		const text = "x = 42";
		const operation = {
			type: "modify" as const,
			position: 4,
			insertText: '"hello world"',
			removeCount: 2,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe('x = "hello world"');
	});

	it("should handle empty text additions", () => {
		const text = "hello";
		const operation = {
			type: "add" as const,
			position: 5,
			text: "",
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello");
	});

	it("should handle zero count removals", () => {
		const text = "hello world";
		const operation = {
			type: "remove" as const,
			position: 5,
			count: 0,
		};

		const result = applyDiffOperation(text, operation);

		expect(result).toBe("hello world");
	});
});

describe("findLargestDiffBound", () => {
	// Helper function to create diffs and get bounds
	const getDiffBounds = (oldText: string, newText: string) => {
		const diffs = diffChars(oldText, newText);
		return { diffs, bound: findLargestDiffBound(diffs) };
	};

	// Helper function to extract added/removed text from a bound region
	const extractChanges = (
		diffs: Change[],
		bound: NonNullable<ReturnType<typeof findLargestDiffBound>>,
	) => {
		const region = diffs.slice(bound.startIdx, bound.endIdx + 1);
		const added = region
			.filter((d) => d.added)
			.map((d) => d.value)
			.join("");
		const removed = region
			.filter((d) => d.removed)
			.map((d) => d.value)
			.join("");
		return { added, removed };
	};

	it("should find all diff changes in simple addition", () => {
		const { diffs, bound } = getDiffBounds(
			'print("hello")',
			'print("hello world")',
		);

		expect(bound).not.toBeNull();
		expect(bound!.startIdx).toBe(1); // First change index
		expect(bound!.endIdx).toBe(1); // Last change index
		expect(bound!.oldStart).toBe(12); // Position in old text
		expect(bound!.newStart).toBe(12); // Position in new text

		const { added } = extractChanges(diffs, bound!);
		expect(added).toBe(" world");
	});

	it("should find all diff changes in simple removal", () => {
		const { diffs, bound } = getDiffBounds(
			'print("hello world")',
			'print("hello")',
		);

		expect(bound).not.toBeNull();
		const { removed } = extractChanges(diffs, bound!);
		expect(removed).toBe(" world");
	});

	it("should combine all changes into single bound", () => {
		const { diffs, bound } = getDiffBounds("x = old_value", "y = new_value");

		expect(bound).not.toBeNull();
		expect(bound!.startIdx).toBe(0); // Starts at first change
		expect(bound!.endIdx).toBe(4); // Ends at last change

		const { added, removed } = extractChanges(diffs, bound!);
		expect(added).toBe("ynew");
		expect(removed).toBe("xold");
	});

	it("should handle single character changes", () => {
		const { diffs, bound } = getDiffBounds(
			"first = 1\nsecond = 2\nthird = 3",
			"first = 1\nsecond = 42\nthird = 3",
		);

		expect(bound).not.toBeNull();
		const { added } = extractChanges(diffs, bound!);
		expect(added).toBe("4");
	});

	it("should return null for identical texts", () => {
		const { bound } = getDiffBounds("unchanged_text", "unchanged_text");
		expect(bound).toBeNull();
	});

	it("should handle mixed additions and removals", () => {
		const { diffs, bound } = getDiffBounds(
			"old start unchanged end",
			"new start unchanged finish",
		);

		expect(bound).not.toBeNull();
		expect(bound!.startIdx).toBe(0); // First change
		expect(bound!.endIdx).toBeGreaterThan(bound!.startIdx); // Multiple changes

		const { added, removed } = extractChanges(diffs, bound!);
		expect(added).toContain("new");
		expect(added).toContain("fi"); // "finish" may be fragmented in char diff
		expect(removed).toContain("old");
		expect(removed).toContain("ed"); // "end" may be fragmented in char diff
	});

	it("should handle complex multiline changes", () => {
		const oldText = `def calculate(x):
    result = x * 2
    return result`;
		const newText = `def calculate(x, multiplier=2):
    result = x * multiplier
    return result`;

		const { diffs, bound } = getDiffBounds(oldText, newText);

		expect(bound).not.toBeNull();
		const { added } = extractChanges(diffs, bound!);
		expect(added).toContain("multiplier");
	});

	it("should handle indentation changes", () => {
		const { diffs, bound } = getDiffBounds(
			'if True:\nprint("hello")',
			'if True:\n    print("hello")',
		);

		expect(bound).not.toBeNull();
		const { added } = extractChanges(diffs, bound!);
		expect(added).toBe("    ");
	});

	it("should return null for empty diffs", () => {
		const { bound } = getDiffBounds("", "");
		expect(bound).toBeNull();
	});
});
