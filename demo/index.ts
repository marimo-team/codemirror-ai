import { python } from "@codemirror/lang-python";
import { tooltips } from "@codemirror/view";
import { EditorView, basicSetup } from "codemirror";
import { aiExtension } from "../src/inline-edit.js";

const logger = console;

(async () => {
  const extensions = [
    basicSetup,
    EditorView.lineWrapping,
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

  const editor = new EditorView({
    doc: `
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
${"\n".repeat(4)}`,
    extensions,
    parent: document.querySelector("#editor") ?? undefined,
  });

  return { editor };
})();
