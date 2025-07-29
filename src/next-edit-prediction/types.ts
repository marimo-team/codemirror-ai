import type { EditorState } from "@codemirror/state";

/**
 * Method to fetch predictions.
 */
export type NextEditPredictor = (state: EditorState) => Promise<DiffSuggestion>;

/**
 * Represents a diff suggestion with old and new text
 */
export interface DiffSuggestion {
  oldText: string;
  newText: string;
  from: number;
  to: number;
}

export const CURSOR_MARKER = "<|user_cursor_is_here|>";
