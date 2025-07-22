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
		debug("No diff bound found, skipping ghost text");
		return {
			operation: { type: "cursor", position: oldCursorPosition },
			ghostText: "",
		};
	}

	// Extract the operation from the bound
	let addedText = "";
	let removedText = "";
	let ghostText = "";

	for (let i = bound.startIdx; i <= bound.endIdx; i++) {
		const diff = diffs[i];
		if (diff === undefined) continue;
		if (diff.added) {
			addedText += diff.value;
			ghostText += diff.value;
		} else if (diff.removed) {
			removedText += diff.value;
		} else {
			ghostText += diff.value;
		}
	}

	// Determine the operation type
	let operation: DiffOperation;

	if (addedText && !removedText) {
		// Pure addition
		operation = {
			type: "add",
			position: bound.oldStart,
			text: addedText,
		};
	} else if (!addedText && removedText) {
		// Pure removal
		operation = {
			type: "remove",
			position: bound.oldStart,
			count: removedText.length,
		};
	} else {
		// Modification (both add and remove)
		operation = {
			type: "modify",
			position: bound.oldStart,
			insertText: addedText,
			removeCount: removedText.length,
		};
	}

	// If the modification is empty, return none
	if (operation.type === "modify" && operation.insertText === "") {
		operation = {
			type: "none",
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
