import { type Change, diffChars } from "diff";
import { debug } from "./debug.js";

/**
 * Type union for different diff operations
 */
export type DiffOperation =
	| { type: "add"; position: number; text: string }
	| { type: "remove"; position: number; count: number }
	| {
			type: "modify";
			position: number;
			insertText: string;
			removeCount: number;
	  }
	| {
			type: "cursor";
			position: number;
	  }
	| {
			type: "none";
	  };

export type DiffOperationOf<T extends DiffOperation["type"]> = Extract<
	DiffOperation,
	{ type: T }
>;

export interface DiffText {
	oldText: string;
	newText: string;
}

export interface DiffResult {
	operation: DiffOperation;
	ghostText: string;
}

/**
 * Finds the largest contiguous diff region that contains the cursor
 */
export function findLargestDiffBound(
	diffs: Change[],
	cursorPosInOld: number,
	cursorPosInNew: number,
): {
	startIdx: number;
	endIdx: number;
	oldStart: number;
	newStart: number;
} | null {
	let oldPos = 0;
	let newPos = 0;

	// Find which diff contains the cursor
	let cursorDiffIdx = -1;

	for (let i = 0; i < diffs.length; i++) {
		const diff = diffs[i];
		if (diff === undefined) continue;

		const oldLen = diff.removed
			? diff.value.length
			: diff.added
				? 0
				: diff.value.length;
		const newLen = diff.added
			? diff.value.length
			: diff.removed
				? 0
				: diff.value.length;

		// Check if cursor is within this diff's range
		if (
			oldPos <= cursorPosInOld &&
			cursorPosInOld <= oldPos + oldLen &&
			newPos <= cursorPosInNew &&
			cursorPosInNew <= newPos + newLen
		) {
			cursorDiffIdx = i;
			break;
		}

		oldPos += oldLen;
		newPos += newLen;
	}

	if (cursorDiffIdx === -1) return null;

	// Expand to find the largest contiguous change region
	let startIdx = cursorDiffIdx;
	let endIdx = cursorDiffIdx;

	// Expand backwards while we have changes
	while (
		startIdx > 0 &&
		(diffs[startIdx - 1]?.added || diffs[startIdx - 1]?.removed)
	) {
		startIdx--;
	}

	// Expand forwards while we have changes
	while (
		endIdx < diffs.length - 1 &&
		(diffs[endIdx + 1]?.added || diffs[endIdx + 1]?.removed)
	) {
		endIdx++;
	}

	// Calculate positions
	let oldStart = 0;
	let newStart = 0;

	for (let i = 0; i < startIdx; i++) {
		const diff = diffs[i];
		if (diff === undefined) continue;
		if (!diff.added) oldStart += diff.value.length;
		if (!diff.removed) newStart += diff.value.length;
	}

	return { startIdx, endIdx, oldStart, newStart };
}

/**
 * Extracts the largest diff operation at the cursor position
 */
export function extractDiffParts(
	suggestion: Pick<DiffText, "oldText" | "newText">,
	cursorMarker: string,
): DiffResult {
	const { oldText, newText } = suggestion;

	if (!newText.includes(cursorMarker)) {
		debug("No cursor marker found, skipping ghost text");
		return {
			operation: { type: "none" },
			ghostText: "",
		};
	}

	// Find cursor positions
	const oldCursorPosition = oldText.indexOf(cursorMarker);
	const newCursorPosition = newText.indexOf(cursorMarker);

	// Remove cursor marker for diffing
	const oldTextClean = oldText.replace(cursorMarker, "");
	const newTextClean = newText.replace(cursorMarker, "");

	// Compute diffs
	const diffs = diffChars(oldTextClean, newTextClean);

	// Find the largest diff bound containing the cursor
	const bound = findLargestDiffBound(
		diffs,
		oldCursorPosition,
		newCursorPosition,
	);

	if (!bound) {
		debug("No diff bound found, checking if texts are identical");
		if (oldTextClean === newTextClean) {
			// Texts are identical - check if they're both empty (just cursor markers)
			if (oldTextClean === "") {
				// Both texts are empty, just cursor markers
				return {
					operation: { type: "cursor", position: 0 },
					ghostText: "",
				};
			} else {
				// Non-empty identical texts - no operation needed
				return {
					operation: { type: "none" },
					ghostText: "",
				};
			}
		} else {
			// Texts differ but cursor not in diff region
			return {
				operation: { type: "none" },
				ghostText: "",
			};
		}
	}

	// Extract the changes in the bound region
	let addedText = "";
	let removedText = "";
	let hasChanges = false;

	for (let i = bound.startIdx; i <= bound.endIdx; i++) {
		const diff = diffs[i];
		if (diff === undefined) continue;
		if (diff.added) {
			addedText += diff.value;
			hasChanges = true;
		} else if (diff.removed) {
			removedText += diff.value;
			hasChanges = true;
		}
	}

	// If no actual changes in this region, check if it's just cursor movement
	if (!hasChanges) {
		if (oldCursorPosition !== newCursorPosition) {
			// Cursor position changed but no text changes
			return {
				operation: { type: "cursor", position: newCursorPosition },
				ghostText: "",
			};
		} else {
			// No changes at all
			return {
				operation: { type: "none" },
				ghostText: "",
			};
		}
	}

	// Calculate what text will appear after the cursor in the final result
	// For this, we need to compute what the new text looks like after the cursor position
	let ghostText = "";
	let currentNewPos = bound.newStart;
	let foundCursor = false;

	debug("=== GHOST TEXT DEBUG ===");
	debug("bound.newStart:", bound.newStart);
	debug("newCursorPosition:", newCursorPosition);
	debug("Processing diffs from", bound.startIdx, "to", bound.endIdx);

	for (let i = bound.startIdx; i <= bound.endIdx; i++) {
		const diff = diffs[i];
		if (diff === undefined) continue;

		debug(`diff[${i}]:`, {
			value: JSON.stringify(diff.value),
			added: diff.added,
			removed: diff.removed,
			currentNewPos,
			foundCursor,
		});

		if (diff.added || !diff.removed) {
			// This text will appear in the new version
			const textToShow = diff.value;

			if (!foundCursor) {
				// Check if cursor is within or before this text
				if (
					currentNewPos <= newCursorPosition &&
					newCursorPosition <= currentNewPos + textToShow.length
				) {
					// Cursor is within this text - add the portion after the cursor
					const offsetInText = newCursorPosition - currentNewPos;
					const afterCursor = textToShow.substring(offsetInText);
					debug(
						`  Cursor within text - offset: ${offsetInText}, afterCursor: ${JSON.stringify(afterCursor)}`,
					);
					ghostText += afterCursor;
					foundCursor = true;
				} else if (currentNewPos > newCursorPosition) {
					// Cursor is before this text - add all of it
					debug(
						`  Cursor before text - adding all: ${JSON.stringify(textToShow)}`,
					);
					ghostText += textToShow;
					foundCursor = true;
				}
				currentNewPos += textToShow.length;
			} else {
				// Already found cursor - add all remaining text
				debug(`  Already found cursor - adding: ${JSON.stringify(textToShow)}`);
				ghostText += textToShow;
			}
		}
		debug(`  ghostText so far: ${JSON.stringify(ghostText)}`);
	}

	debug("Final ghostText:", JSON.stringify(ghostText));
	debug("========================");

	// Determine the operation type
	let operation: DiffOperation;

	if (addedText && !removedText) {
		// Pure addition
		operation = {
			type: "add",
			position: bound.oldStart,
			text: addedText,
		};
		// For pure additions, ghost text is the added text
		ghostText = addedText;
	} else if (!addedText && removedText) {
		// Pure removal
		operation = {
			type: "remove",
			position: bound.oldStart,
			count: removedText.length,
		};
		ghostText = ""; // Nothing to show for pure removal
	} else {
		// Modification (both add and remove)
		operation = {
			type: "modify",
			position: bound.oldStart,
			insertText: addedText,
			removeCount: removedText.length,
		};
	}

	return { operation, ghostText };
}

/**
 * Helper function to apply a diff operation to text
 */
export function applyDiffOperation(
	text: string,
	operation: DiffOperation,
): string {
	switch (operation.type) {
		case "add":
			return (
				text.slice(0, operation.position) +
				operation.text +
				text.slice(operation.position)
			);

		case "remove":
			return (
				text.slice(0, operation.position) +
				text.slice(operation.position + operation.count)
			);

		case "modify":
			return (
				text.slice(0, operation.position) +
				operation.insertText +
				text.slice(operation.position + operation.removeCount)
			);

		case "cursor":
			return text;

		case "none":
			return text;
	}
}
