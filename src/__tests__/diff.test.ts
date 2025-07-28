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
