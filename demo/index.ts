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
import { PredicationBackend } from "../src/next-edit-predication/backend.js";
import {
	AcceptIndicatorWidget,
	createModifyDecoration,
	createRemovalDecoration,
	GhostTextWidget,
} from "../src/next-edit-predication/decorations.js";
import type { DiffOperation } from "../src/next-edit-predication/diff.js";
import { nextEditPrediction } from "../src/next-edit-predication/extension.js";

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

const decorationsDoc = `def calculate_sum(a, b):
    # This function will sum two numbers
    return a + b

def process_data(items):
    # Process each item in the list
    return [item * 2 for item in items]

def square(a):
    result = a * 2
    return result
double(a)

# Example usage
result = calculate_sum(10, 20)
processed = process_data([1, 2, 3, 4, 5])`;

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

			const ghostPos = endOf("sum two numbers");
			const deletePos = startOf("process_data");
			const deleteCount = 8; // "process_"
			const modifyPos = startOf("calculate_sum");
			const modifyCount = 13; // "calculate_sum"

			const operations: DiffOperation[] = [
				{ type: "add", text: " efficiently", position: ghostPos },
				{ type: "remove", position: deletePos, count: deleteCount },
				{
					type: "modify",
					position: modifyPos,
					insertText: "compute_total",
					removeCount: modifyCount,
				},
				{
					type: "modify",
					position: endOf("result = a * "),
					insertText: "a\n    return result\nsquare",
					removeCount: "2\n    return result\ndouble".length,
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
				// if (operation.type === "cursor") {
				// 	const ghostWidget = new CurosTextWidget(operation, () => console.log("Ghost text accepted") ?? true);
				// 	widgets.push(Decoration.widget({ widget: ghostWidget, side: 1 }).range(operation.position));
				// }
				// if (operation.type === "none") {
				// }
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

	// Next-edit-predication
	const nextEditPredicationEditor = new EditorView({
		doc: doc,
		extensions: [
			basicSetup,
			python(),
			nextEditPrediction({
				fetchFn: PredicationBackend.oxen({
					model: "oxen:ox-cold-olive-fox",
					baseUrl: "https://hub.oxen.ai/api/chat",
					headers: {
						Authorization: `Bearer ${import.meta.env.VITE_API_KEY}`,
					},
				}),
			}),
			tooltips(),
		],
		parent:
			document.querySelector("#next-edit-predication-editor") ?? undefined,
	});

	// Decorations showcase
	const decorationsEditor = new EditorView({
		doc: decorationsDoc,
		extensions: [basicSetup, python(), decorationsPlugin],
		parent: document.querySelector("#decorations-demo") ?? undefined,
	});

	return { editor, nextEditPredicationEditor, decorationsEditor };
})();
