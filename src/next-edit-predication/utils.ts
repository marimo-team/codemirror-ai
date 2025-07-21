import {
	EditorSelection,
	type EditorState,
	type TransactionSpec,
} from "@codemirror/state";
import { CURSOR_MARKER, type DiffSuggestion } from "./types.js";

const debug = (...args: unknown[]) => {
	// biome-ignore lint/suspicious/noConsole: debug
	console.debug(...args);
};

export function insertDiffText(
	state: EditorState,
	newText: string,
	suggestion?: DiffSuggestion,
): TransactionSpec {
	const cursorMarkerWithNewline = `${CURSOR_MARKER}\n`;

	if (!suggestion?.ghostText || !newText.includes(CURSOR_MARKER)) {
		// Fallback to original behavior
		const cleanText = newText
			.replace(cursorMarkerWithNewline, "")
			.replace(CURSOR_MARKER, "")
			.trim();
		return {
			changes: { from: 0, to: state.doc.length, insert: cleanText },
			selection: EditorSelection.cursor(cleanText.length),
			userEvent: "input.complete",
		};
	}

	// Insert the ghost text at the current cursor position
	const insertText = suggestion.ghostText;
	const insertPosition = suggestion.to;

	// Calculate final cursor position relative to where we're inserting
	const finalCursorPosition = insertPosition + insertText.length;

	debug(`Insert text: "${insertText}"`);
	debug(`Final cursor position: ${finalCursorPosition}`);

	return {
		changes: { from: insertPosition, to: insertPosition, insert: insertText },
		selection: EditorSelection.cursor(finalCursorPosition),
		userEvent: "input.complete",
	};
}
