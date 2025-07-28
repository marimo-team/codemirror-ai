import {
	EditorSelection,
	type EditorState,
	type TransactionSpec,
} from "@codemirror/state";
import type { DiffOperation } from "./diff.js";

export function insertDiffText(opts: {
	state: EditorState;
	operation: DiffOperation;
	cursorPosition: number | null;
}): TransactionSpec {
	const { state, operation, cursorPosition } = opts;

	switch (operation.type) {
		case "add": {
			const insertPosition = operation.position;
			const finalCursorPosition = insertPosition + operation.text.length;
			return {
				changes: { from: insertPosition, to: insertPosition, insert: operation.text },
				selection: EditorSelection.cursor(finalCursorPosition),
				userEvent: "input.complete",
			};
		}

		case "remove": {
			const finalCursorPosition = operation.position;
			return {
				changes: { from: operation.position, to: operation.position + operation.count, insert: "" },
				selection: EditorSelection.cursor(finalCursorPosition),
				userEvent: "input.complete",
			};
		}

		case "modify": {
			const finalCursorPosition = operation.position + operation.insertText.length;
			return {
				changes: { 
					from: operation.position, 
					to: operation.position + operation.removeCount, 
					insert: operation.insertText 
				},
				selection: EditorSelection.cursor(finalCursorPosition),
				userEvent: "input.complete",
			};
		}

		case "cursor": {
			// For cursor operations, just move the cursor without changing text
			return {
				selection: EditorSelection.cursor(operation.position),
				userEvent: "select",
			};
		}

		case "none": {
			// No operation - return current state
			return {
				selection: cursorPosition !== null ? EditorSelection.cursor(cursorPosition) : state.selection,
			};
		}
	}
}
