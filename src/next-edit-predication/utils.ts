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
	suggestion: Pick<DiffSuggestion, "newText" | "to" | "ghostText">,
	cursorMarker: string = CURSOR_MARKER,
): TransactionSpec {
	const { newText, to, ghostText } = suggestion;
	const cursorMarkerWithNewline = `${cursorMarker}\n`;

	if (!ghostText || !newText.includes(cursorMarker)) {
		// Fallback to original behavior
		const cleanText = newText
			.replace(cursorMarkerWithNewline, "")
			.replace(cursorMarker, "")
			.trim();
		return {
			changes: { from: 0, to: state.doc.length, insert: cleanText },
			selection: EditorSelection.cursor(cleanText.length),
			userEvent: "input.complete",
		};
	}

	// Insert the ghost text at the current cursor position
	const insertText = ghostText;
	const insertPosition = to;

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
