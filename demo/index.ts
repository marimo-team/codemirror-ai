import { python } from "@codemirror/lang-python";
import type { Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	tooltips,
	ViewPlugin,
} from "@codemirror/view";
import { basicSetup, EditorView } from "codemirror";
import { aiExtension } from "../src/inline-edit.js";
import { PredictionBackend } from "../src/next-edit-prediction/backend.js";
import {
	AcceptIndicatorWidget,
	CursorJumpWidget,
	createModifyDecoration,
	createRemovalDecoration,
	GhostTextWidget,
} from "../src/next-edit-prediction/decorations.js";
import type { DiffOperation } from "../src/next-edit-prediction/diff.js";
import { nextEditPrediction } from "../src/next-edit-prediction/extension.js";

const logger = console;

const doc = `# A very long comment that can be a selection start point that will stretch off screen of this demo and should still work
class DataProcessor:
    def __init__(self, data: list[int]):
        self.data = data
        self.processed = False

    def process(self) -> None:
        self.data = [x * 2 for x in self.data]
        self.processed = True

    def get_stats(self) -> dict:
        return {
            "mean": sum(self.data) / len(self.data),
            "max": max(self.data),
            "min": min(self.data)
        }

def quick_sort(arr: list) -> list:
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)

quick_sort([1, 2, 3, 4, 5])
${"\n".repeat(4)}`;

const decorationsDoc = `# AI Code Editor Decorations Demo
# This file demonstrates different types of code suggestions and decorations

def calculate_sum(a, b):
    # This function will sum two numbers
    return a + b

class DataProcessor:
    def __init__(self, data):
        self.data = data
        self.results = []
    
    def process_data(self, items):
        # Process each item in the list
        return [item * 2 for item in items]
    
    def validate_input(self, value):
        if value is None:
            raise ValueError("Input cannot be None")
        return True

def square(x):
    result = x * 2
    return result

def double(a):
    return a * 2

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Mathematical operations
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n-1)

# String processing utilities
def reverse_string(text):
    return text[::-1]

def capitalize_words(sentence):
    return ' '.join(word.capitalize() for word in sentence.split())

# File operations
def read_file(filename):
    with open(filename, 'r') as f:
        return f.read()

def write_file(filename, content):
    with open(filename, 'w') as f:
        f.write(content)

# Example usage and cursor position demonstrations
result = calculate_sum(10, 20)
processor = DataProcessor([1, 2, 3, 4, 5])
processed = processor.process_data([1, 2, 3, 4, 5])

# More examples to show different decoration types
numbers = [1, 2, 3, 4, 5]
squared_numbers = [square(x) for x in numbers]
doubled_numbers = [double(x) for x in numbers]

# Demonstration of various code patterns
for i in range(10):
    print(f"Processing item {i}")
    if i % 2 == 0:
        print("Even number")
    else:
        print("Odd number")

# Final section for cursor jump demonstration
final_result = sum(squared_numbers) + sum(doubled_numbers)
print(f"Final calculation result: {final_result}")

# End of file with trailing content for decoration positioning`;

// Create decorations showcase plugin
const decorationsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = this.buildDecorations(view);
		}

		buildDecorations(view: EditorView) {
			const widgets: Range<Decoration>[] = [];
			const _doc = view.state.doc;
			const endOf = (match: string) =>
				view.state.doc.toString().indexOf(match) + match.length;
			const startOf = (match: string) =>
				view.state.doc.toString().indexOf(match);

			const operations: DiffOperation[] = [
				// Ghost text suggestion after comment
				{
					type: "add",
					text: " and handle edge cases",
					position: endOf("sum two numbers"),
				},

				// Remove suggestion on function name
				{ type: "remove", position: startOf("process_data"), count: 8 }, // "process_"

				// Modify suggestion - rename function
				{
					type: "modify",
					position: startOf("calculate_sum"),
					insertText: "compute_total",
					removeCount: 13, // "calculate_sum"
				},

				// Modify suggestion - fix the square function implementation
				{
					type: "modify",
					position: startOf("result = x * 2"),
					insertText: "result = x * x  # Actually square the number",
					removeCount: 14, // "result = x * 2"
				},

				// Ghost text for adding docstring
				{
					type: "add",
					text: '\n    """Calculate fibonacci number recursively."""',
					position: endOf("def fibonacci(n):"),
				},

				// Remove suggestion for redundant validation
				{
					type: "remove",
					position: startOf("def validate_input"),
					count: endOf("return True\n") - startOf("def validate_input"),
				},

				// Modify suggestion - improve string reversal
				{
					type: "modify",
					position: startOf("return text[::-1]"),
					insertText:
						"return ''.join(reversed(text))  # More explicit reversal",
					removeCount: 17, // "return text[::-1]"
				},

				// Ghost text for error handling
				{
					type: "add",
					text: "\n        # TODO: Add error handling for file not found",
					position: endOf("def read_file(filename):"),
				},

				// Cursor jump demonstration - where cursor will be after accepting
				{ type: "cursor", position: endOf("final_result = ") },

				// Another cursor position for loop variable
				{ type: "cursor", position: endOf("for i in range(") },

				// Modify suggestion for better variable naming
				{
					type: "modify",
					position: startOf("squared_numbers"),
					insertText: "squares",
					removeCount: 15, // "squared_numbers"
				},
			];

			const onAccept = () => console.log("Operation accepted") ?? true;
			const _onReject = () => console.log("Operation rejected") ?? true;

			for (const operation of operations) {
				if (operation.type === "add") {
					const ghostWidget = new GhostTextWidget(operation, onAccept);
					widgets.push(
						Decoration.widget({ widget: ghostWidget, side: 1 }).range(
							operation.position,
						),
					);
				}
				if (operation.type === "remove") {
					widgets.push(...createRemovalDecoration(operation, onAccept));
				}
				if (operation.type === "modify") {
					widgets.push(...createModifyDecoration(operation, onAccept));
				}
				if (operation.type === "cursor") {
					const cursorJumpWidget = new CursorJumpWidget();
					widgets.push(
						Decoration.widget({ widget: cursorJumpWidget, side: 1 }).range(
							operation.position,
						),
					);
				}
				if (operation.type === "none") {
					// Do nothing
				}
			}

			// Accept indicator at the end
			const endPos = view.state.doc.length;
			const acceptIndicator = new AcceptIndicatorWidget(
				() => console.log("Accepted all changes") ?? true,
				() => console.log("Rejected all changes") ?? true,
			);
			widgets.push(
				Decoration.widget({ widget: acceptIndicator, side: 1 }).range(endPos),
			);

			// sort by from position
			widgets.sort((a, b) => a.from - b.from);

			return Decoration.set(widgets);
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

(async () => {
	const extensions = [
		basicSetup,
		// EditorView.lineWrapping,
		python(),
		aiExtension({
			onAcceptEdit: (opts) => {
				logger.log("Accepted edit", opts);
			},
			onRejectEdit: (opts) => {
				logger.log("Rejected edit", opts);
			},
			prompt: async ({ selection, codeBefore, codeAfter, prompt }) => {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				logger.log({ selection, codeBefore, codeAfter, prompt });
				return `# Adding a TODO: \n# ${prompt}`;
			},
		}),
		tooltips(),
	];

	// Inline-edit tooltip
	const editor = new EditorView({
		doc: doc,
		extensions,
		parent: document.querySelector("#editor") ?? undefined,
	});

	// Next-edit-prediction
	const nextEditPredictionEditor = new EditorView({
		doc: doc,
		extensions: [
			basicSetup,
			python(),
			nextEditPrediction({
				fetchFn: PredictionBackend.oxen({
					model: "oxen:dgonz-crucial-amethyst-cephalopod",
					baseUrl: "https://hub.oxen.ai/api/chat",
					headers: {
						Authorization: `Bearer ${import.meta.env.VITE_API_KEY}`,
					},
				}),
			}),
			tooltips(),
		],
		parent: document.querySelector("#next-edit-prediction-editor") ?? undefined,
	});

	// Decorations showcase
	const decorationsEditor = new EditorView({
		doc: decorationsDoc,
		extensions: [basicSetup, python(), decorationsPlugin],
		parent: document.querySelector("#decorations-demo") ?? undefined,
	});

	return { editor, nextEditPredictionEditor, decorationsEditor };
})();
