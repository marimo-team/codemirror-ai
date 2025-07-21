import { python } from "@codemirror/lang-python";
import { tooltips } from "@codemirror/view";
import { basicSetup, EditorView } from "codemirror";
import { aiExtension } from "../src/inline-edit.js";
import { PredicationBackend } from "../src/next-edit-predication/backend.js";
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
					model: "oxen:ox-wonderful-pink-swordtail",
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

	return { editor, nextEditPredicationEditor };
})();
