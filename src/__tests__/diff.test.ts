import { describe, expect, it } from "vitest";
import {
	applyDiffOperation,
	type DiffText,
	extractDiffParts,
} from "../next-edit-predication/diff.js";

const cursorMarker = "▲";

describe("extractDiffParts", () => {
	it("should return no operation when no cursor marker in new text", () => {
		const suggestion: DiffText = {
			oldText: "def hello_world():",
			newText: "def hello_earth():", // no cursor marker
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result).toEqual({
			operation: { type: "none" },
			ghostText: "",
		});
	});

	it("should handle simple text addition", () => {
		const suggestion: DiffText = {
			oldText: `def hello▲():`,
			newText: `def hello_world▲():`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe("_world");
			expect(result.operation.position).toBe(9);
		}
		expect(result.ghostText).toBe("_world");
	});

	it("should handle simple text removal", () => {
		const suggestion: DiffText = {
			oldText: `def hello_world▲():`,
			newText: `def hello▲():`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("remove");
		if (result.operation.type === "remove") {
			expect(result.operation.count).toBe(6);
			expect(result.operation.position).toBe(9);
		}
		expect(result.ghostText).toBe("");
	});

	it("should handle text replacement", () => {
		const suggestion: DiffText = {
			oldText: `print("old_value"▲)`,
			newText: `print("new_value"▲)`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("modify");
		if (result.operation.type === "modify") {
			expect(result.operation.insertText).toBe("new");
			expect(result.operation.removeCount).toBe(3);
			expect(result.operation.position).toBe(7);
		}
	});

	it("should handle unchanged text", () => {
		const suggestion: DiffText = {
			oldText: `def hello▲() -> str:`,
			newText: `def hello▲() -> str:`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("none");
	});

	it("should handle cursor at beginning", () => {
		const suggestion: DiffText = {
			oldText: `▲print("hello")`,
			newText: `▲import os\nprint("hello")`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe("import os");
			expect(result.operation.position).toBe(0);
		}
		expect(result.ghostText).toBe("import os");
	});

	it("should handle cursor at end", () => {
		const suggestion: DiffText = {
			oldText: `print("hello")▲`,
			newText: `print("hello")\nprint("world")▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe('\nprint("world")');
			expect(result.operation.position).toBe(14);
		}
		expect(result.ghostText).toBe('\nprint("world")');
	});

	it("should handle multiline changes", () => {
		const suggestion: DiffText = {
			oldText: `def test():▲\n    pass`,
			newText: `def test():\n    x = 42\n    print(x)▲\n    pass`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		// The diff algorithm finds this as a cursor operation due to complex multiline diff
		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe("\n    x = 42\n    print(x)");
			expect(result.operation.position).toBe(14);
		}
		expect(result.ghostText).toBe("\n    x = 42\n    print(x)");
	});

	it("should handle complex diff with variable replacement", () => {
		const suggestion: DiffText = {
			oldText: `old_var = ▲42`,
			newText: `new_variable = ▲"hello"`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("modify");
		if (result.operation.type === "modify") {
			expect(result.operation.insertText).toBe('new_variable = "hello"');
			expect(result.operation.removeCount).toBe(2);
			expect(result.operation.position).toBe(7);
		}
		expect(result.ghostText).toBe('new_variable = "hello"');
	});

	it("should handle empty strings", () => {
		const suggestion: DiffText = {
			oldText: `▲`,
			newText: `▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("cursor");
		if (result.operation.type === "cursor") {
			expect(result.operation.position).toBe(0);
		}
		expect(result.ghostText).toBe("");
	});

	it("should handle only cursor position changes", () => {
		const suggestion: DiffText = {
			oldText: `print▲("hello")`,
			newText: `print(▲"hello")`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("cursor");
		if (result.operation.type === "cursor") {
			expect(result.operation.position).toBe(6);
		}
		expect(result.ghostText).toBe("");
	});

	it("should handle special characters in diff", () => {
		const suggestion: DiffText = {
			oldText: `data = {▲}`,
			newText: `data = {"key": "value", "num": 42▲}`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe('"key": "value", "num": 42');
			expect(result.operation.position).toBe(8);
		}
		expect(result.ghostText).toBe('"key": "value", "num": 42');
	});

	it("should handle python class definition changes", () => {
		const suggestion: DiffText = {
			oldText: `class MyClass:▲\n    pass`,
			newText: `class MyClass:\n    def __init__(self):\n        self.value = 0▲\n    pass`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe(
				"\n    def __init__(self):\n        self.value = 0",
			);
			expect(result.operation.position).toBe(14);
		}
		expect(result.ghostText).toBe(
			"\n    def __init__(self):\n        self.value = 0",
		);
	});

	it("should handle function parameter addition", () => {
		const suggestion: DiffText = {
			oldText: `def calculate(a▲):`,
			newText: `def calculate(a, b=10▲):`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe(", b=10");
			expect(result.operation.position).toBe(15);
		}
		expect(result.ghostText).toBe(", b=10");
	});

	it("should handle list comprehension changes", () => {
		const suggestion: DiffText = {
			oldText: `numbers = [▲]`,
			newText: `numbers = [x**2 for x in range(10)▲]`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe("x**2 for x in range(10)");
			expect(result.operation.position).toBe(11);
		}
		expect(result.ghostText).toBe("x**2 for x in range(10)");
	});

	it("should handle import statement modification", () => {
		const suggestion: DiffText = {
			oldText: `from os import ▲path`,
			newText: `from os import path, environ▲`,
		};

		const result = extractDiffParts(suggestion, cursorMarker);

		expect(result.operation.type).toBe("add");
		if (result.operation.type === "add") {
			expect(result.operation.text).toBe(", environ");
			expect(result.operation.position).toBe(15);
		}
		expect(result.ghostText).toBe(", environ");
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

import { diffChars } from "diff";
import { findLargestDiffBound } from "../next-edit-predication/diff";
import { invariant } from "../utils.js";

describe("findLargestDiffBound", () => {
	it("should find diff containing cursor in simple addition", () => {
		const oldText = `print("hello"▲)`;
		const newText = `print("hello world"▲)`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).not.toBeNull();
		invariant(bound != null, "bound is null");
		expect(bound.oldStart).toBe(12);
		expect(bound.newStart).toBe(12);
		// The diff region should be the added " world"
		const added = diffs
			.slice(bound.startIdx, (bound.endIdx ?? 0) + 1)
			.find((d) => d.added);
		expect(added?.value).toBe(" world");
	});

	it("should handle cursor at diff boundary", () => {
		const oldText = `def func():▲`;
		const newText = `def func():\n    pass▲`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).not.toBeNull();
		invariant(bound != null, "bound is null");
		const added = diffs
			.slice(bound.startIdx, (bound.endIdx ?? 0) + 1)
			.find((d) => d.added);
		expect(added?.value).toBe("\n    pass");
	});

	it("should expand to find largest contiguous diff region", () => {
		const oldText = `x = old_value▲`;
		const newText = `y = new_value▲`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).not.toBeNull();
		invariant(bound != null, "bound is null");
		const region = diffs.slice(bound.startIdx, bound.endIdx + 1);
		const added = region
			.filter((d) => d.added)
			.map((d) => d.value)
			.join("");
		const removed = region
			.filter((d) => d.removed)
			.map((d) => d.value)
			.join("");
		expect(added).toBe("y = new_value");
		expect(removed.length).toBe(13);
	});

	it("should handle multiple separate changes and find cursor region", () => {
		const oldText = `first = 1\nsecond = ▲2\nthird = 3`;
		const newText = `first = 1\nsecond = ▲42\nthird = 3`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).not.toBeNull();
		invariant(bound != null, "bound is null");
		const region = diffs.slice(bound.startIdx, bound.endIdx + 1);
		const added = region
			.filter((d) => d.added)
			.map((d) => d.value)
			.join("");
		expect(added).toBe("4");
	});

	it("should handle no diff at cursor position", () => {
		const oldText = `unchanged▲_text`;
		const newText = `unchanged▲_text`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).toBeNull();
	});

	it("should handle cursor in unchanged region between changes", () => {
		const oldText = `old start▲ unchanged end`;
		const newText = `new start▲ unchanged finish`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).toBeNull();
	});

	it("should handle complex multiline python code changes", () => {
		const oldText = `def calculate(x):
    result = x * 2▲
    return result`;
		const newText = `def calculate(x, multiplier=2):
    result = x * multiplier▲
    return result`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).not.toBeNull();
		invariant(bound != null, "bound is null");
		const region = diffs.slice(bound.startIdx, bound.endIdx + 1);
		const added = region
			.filter((d) => d.added)
			.map((d) => d.value)
			.join("");
		expect(added).toEqual("multiplier=2):\n    result = x * multiplier");
	});

	it("should handle indentation changes", () => {
		const oldText = `if True:
print("hello")▲`;
		const newText = `if True:
    print("hello")▲`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).not.toBeNull();
		invariant(bound != null, "bound is null");
		const region = diffs.slice(bound.startIdx, bound.endIdx + 1);
		const added = region
			.filter((d) => d.added)
			.map((d) => d.value)
			.join("");
		expect(added).toBe("    ");
	});

	it("should handle empty diff arrays gracefully", () => {
		const oldText = `▲`;
		const newText = `▲`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).toBeNull();
	});

	it("should handle cursor outside any diff region", () => {
		const oldText = `unchanged_start ▲ old_change unchanged_end`;
		const newText = `unchanged_start ▲ new_change unchanged_end`;
		const cursorMarker = "▲";
		const oldCursor = oldText.indexOf(cursorMarker);
		const newCursor = newText.indexOf(cursorMarker);
		const oldTextClean = oldText.replace(cursorMarker, "");
		const newTextClean = newText.replace(cursorMarker, "");
		const diffs = diffChars(oldTextClean, newTextClean);

		const bound = findLargestDiffBound(diffs, oldCursor, newCursor);

		expect(bound).toBeNull();
	});
});
