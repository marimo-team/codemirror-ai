import {
	Facet,
	Prec,
	StateEffect,
	StateField,
	type Text,
} from "@codemirror/state";
import {
	type Command,
	Decoration,
	type DecorationSet,
	type EditorView,
	keymap,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { debouncePromise } from "../utils.js";
import { debug } from "./debug.js";
import { type DiffOperation, extractDiffParts } from "./diff.js";
import {
	CURSOR_MARKER,
	type DiffSuggestion,
	type NextEditPredictor,
} from "./types.js";
import { insertDiffText } from "./utils.js";

/**
 * Current state of the autosuggestion
 */
const NextEditPredictionState = StateField.define<{
	suggestion: null | DiffSuggestion;
}>({
	create() {
		return { suggestion: null };
	},
	update(previousValue, tr) {
		const inlineSuggestion = tr.effects.find((e) =>
			e.is(NextEditPredictionEffect),
		);
		if (tr.state.doc) {
			if (inlineSuggestion && tr.state.doc === inlineSuggestion.value.doc) {
				// There is a new selection that has been set via an effect,
				// and it applies to the current document.
				return { suggestion: inlineSuggestion.value.suggestion };
			}
			if (!tr.docChanged && !tr.selection) {
				// This transaction is irrelevant to the document state
				// and could be generate by another plugin, so keep
				// the previous value.
				return previousValue;
			}
		}
		return { suggestion: null };
	},
});

const NextEditPredictionEffect = StateEffect.define<{
	suggestion: DiffSuggestion | null;
	doc: Text;
}>();

/**
 * Widget for displaying ghost text inline with diff information
 */
class GhostTextWidget extends WidgetType {
	diffParts: DiffOperation[];
	suggestion: DiffSuggestion;

	constructor(diffParts: DiffOperation[], suggestion: DiffSuggestion) {
		super();
		this.diffParts = diffParts;
		this.suggestion = suggestion;
	}

	toDOM(view: EditorView) {
		const container = document.createElement("span");
		container.className = "cm-ghost-text-container";
		container.style.cssText = `
      cursor: pointer;
      display: inline;
    `;

		// Create spans for each diff part
		for (const part of this.diffParts) {
			const span = document.createElement("span");
			span.className = `cm-ghost-text cm-ghost-${part.type}`;

			if (part.type === "add") {
				span.style.cssText = `
          color: #22863a;
          opacity: 0.7;
          font-style: italic;
          background: rgba(34, 134, 58, 0.1);
          border-radius: 2px;
          padding: 1px 2px;
          margin-right: 1px;
        `;
			} else if (part.type === "remove") {
				span.style.cssText = `
          color: #d73a49;
          opacity: 0.7;
          font-style: italic;
          background: rgba(215, 58, 73, 0.1);
          border-radius: 2px;
          padding: 1px 2px;
          margin-right: 1px;
          text-decoration: line-through;
        `;
			} else if (part.type === "modify") {
				span.style.cssText = `
          color: #888;
          opacity: 0.7;
          font-style: italic;
          background: rgba(136, 136, 136, 0.1);
          border-radius: 2px;
          padding: 1px 2px;
          margin-right: 1px;
        `;
				span.textContent = part.insertText;
			} else if (part.type === "none") {
				span.style.cssText = `
          color: #888;
          opacity: 0.7;
        `;
			} else if (part.type === "cursor") {
				span.style.cssText = `
          color: #888;
          opacity: 0.7;
        `;
			}
			container.appendChild(span);
		}

		container.onclick = (e) => this.accept(e, view);
		return container;
	}

	accept(e: MouseEvent, view: EditorView) {
		const config = view.state.facet(suggestionConfigFacet);
		if (!config.acceptOnClick) return;

		e.stopPropagation();
		e.preventDefault();

		const suggestion = view.state.field(NextEditPredictionState)?.suggestion;

		// If there is no suggestion, do nothing and let the default keymap handle it
		if (!suggestion) {
			return false;
		}

		view.dispatch({
			...insertDiffText(view.state, suggestion),
		});
		return true;
	}
}

/**
 * Small widget to indicate that a suggestion can be accepted
 */
class AcceptIndicatorWidget extends WidgetType {
	suggestion: DiffSuggestion;

	constructor(suggestion: DiffSuggestion) {
		super();
		this.suggestion = suggestion;
	}

	toDOM(view: EditorView) {
		debug("AcceptIndicatorWidget.toDOM called");
		const container = document.createElement("div");
		container.style.cssText = `
      display: inline-flex;
      gap: 8px;
      align-items: center;
    `;

		// Accept button
		const acceptSpan = document.createElement("span");
		acceptSpan.className = "cm-accept-indicator";
		acceptSpan.style.cssText = `
      color: #007acc;
      opacity: 0.8;
      font-size: 0.8em;
      cursor: pointer;
      padding: 1px 4px;
      background: rgba(0, 122, 204, 0.1);
      border-radius: 3px;
      border: 1px solid rgba(0, 122, 204, 0.3);
      margin-left: 8px;
    `;
		acceptSpan.textContent = "💡 Accept [Tab]";
		acceptSpan.onclick = (e) => this.accept(e, view);
		container.appendChild(acceptSpan);

		// Reject button
		const rejectSpan = document.createElement("span");
		rejectSpan.className = "cm-reject-indicator";
		rejectSpan.style.cssText = `
      color: #d73a49;
      opacity: 0.8;
      font-size: 0.8em;
      cursor: pointer;
      padding: 1px 4px;
      background: rgba(215, 58, 73, 0.1);
      border-radius: 3px;
      border: 1px solid rgba(215, 58, 73, 0.3);
    `;
		rejectSpan.textContent = "❌ Reject [Esc]";
		rejectSpan.onclick = (e) => this.reject(e, view);
		container.appendChild(rejectSpan);

		return container;
	}

	accept(e: MouseEvent, view: EditorView) {
		const config = view.state.facet(suggestionConfigFacet);
		if (!config.acceptOnClick) return;

		e.stopPropagation();
		e.preventDefault();

		const suggestion = view.state.field(NextEditPredictionState)?.suggestion;

		// If there is no suggestion, do nothing and let the default keymap handle it
		if (!suggestion) {
			return false;
		}

		view.dispatch({
			...insertDiffText(view.state, suggestion),
		});
		return true;
	}

	reject(e: MouseEvent, view: EditorView) {
		e.stopPropagation();
		e.preventDefault();

		// Clear the suggestion
		view.dispatch({
			effects: NextEditPredictionEffect.of({
				suggestion: null,
				doc: view.state.doc,
			}),
		});
		return true;
	}
}

// DECORATIONS

// /**
//  * Extracts diff parts from a suggestion for ghost text rendering
//  */
// export function extractDiffParts(
// 	suggestion: Pick<DiffSuggestion, "oldText" | "newText">,
// 	cursorMarker: string,
// ): {
// 	diffParts: DiffPart[];
// 	ghostText: string;
// } {
// 	const { oldText, newText } = suggestion;

// 	if (!newText.includes(cursorMarker)) {
// 		return { diffParts: [], ghostText: "" };
// 	}

// 	// Remove cursor marker from both texts to compute the actual diff
// 	const oldTextClean = oldText.replace(cursorMarker, "");
// 	const newTextClean = newText.replace(cursorMarker, "");

// 	// Use diff library to compute precise changes
// 	const diffs = diffChars(oldTextClean, newTextClean);

// 	// Find cursor positions in both old and new text
// 	const oldCursorPosition = oldText.indexOf(cursorMarker);
// 	const newCursorPosition = newText.indexOf(cursorMarker);

// 	// Track positions in both old and new text as we process diffs
// 	let diffTextPos = 0;

// 	// Extract diff parts for ghost text rendering - only changes at cursor position
// 	const diffParts: DiffPart[] = [];
// 	let ghostText = "";

// 	// Add a newline to the ghost text if the last character of the last part is a newline
// 	let shouldAddNewline = false;
// 	for (const part of diffs) {
// 		let value = part.value;

// 		if (shouldAddNewline) {
// 			value = `\n${value}`;
// 			shouldAddNewline = false;
// 		}

// 		if (
// 			diffTextPos >= oldCursorPosition &&
// 			diffTextPos + part.value.length <= newCursorPosition
// 		) {
// 			if (part.added) {
// 				diffParts.push({ text: value, type: "added" });
// 			}
// 			if (part.removed) {
// 				diffParts.push({ text: value, type: "removed" });
// 			}
// 			if (!part.added && !part.removed) {
// 				diffParts.push({ text: value, type: "unchanged" });
// 			}
// 			ghostText += value;
// 		}
// 		if (value[value.length - 1] === "\n") {
// 			shouldAddNewline = true;
// 		}
// 		diffTextPos += part.count ?? 0;
// 	}

// 	return { diffParts, ghostText };
// }

/**
 * Creates decorations for a suggestion
 */
export function createSuggestionDecorations(
	suggestion: DiffSuggestion,
	diffParts: DiffOperation[],
): DecorationSet {
	if (diffParts.length === 0) {
		return Decoration.none;
	}

	// Position ghost text at the current cursor position
	const ghostStartPos = suggestion.to;

	const decorations = [
		Decoration.widget({
			widget: new GhostTextWidget(diffParts, suggestion),
			side: 1, // 1 means after the position
		}).range(ghostStartPos),

		Decoration.widget({
			widget: new AcceptIndicatorWidget(suggestion),
			side: 1, // 1 means after the position
		}).range(ghostStartPos),
	];

	return Decoration.set(decorations);
}

/**
 * Rendered by `renderNextEditPredicationPlugin`,
 * this creates multiple decoration widgets for the ranges
 * where changes occur in the document.
 */
function nextEditPredicationDecoration(suggestion: DiffSuggestion) {
	debug("====oldText====");
	debug(suggestion.oldText);
	debug("====end oldText====");
	debug("====newText====");
	debug(suggestion.newText);
	debug("====end newText====");

	if (!suggestion.newText.includes(CURSOR_MARKER)) {
		debug("No cursor marker found, skipping ghost text");
		return Decoration.none;
	}

	const { operation, ghostText } = extractDiffParts(suggestion, CURSOR_MARKER);

	debug(`Computed ghost text using diff: "${ghostText}"`);
	debug("Diff parts:", operation);

	// Store the ghost text in the suggestion for use when accepting
	suggestion.ghostText = ghostText;

	// Only show ghost text if there's content to show
	if (operation.type === "add") {
		debug("No ghost text needed - no diff parts to show");
		return Decoration.none;
	}

	return createSuggestionDecorations(suggestion, [operation]);
}

export const suggestionConfigFacet = Facet.define<
	{
		acceptOnClick: boolean;
		fetchFn: NextEditPredictor;
		onEdit?: (
			oldDoc: string,
			newDoc: string,
			from: number,
			to: number,
			insert: string,
		) => void;
	},
	{
		acceptOnClick: boolean;
		fetchFn: NextEditPredictor | undefined;
		onEdit?: (
			oldDoc: string,
			newDoc: string,
			from: number,
			to: number,
			insert: string,
		) => void;
	}
>({
	combine(value) {
		return {
			acceptOnClick: !!value.at(-1)?.acceptOnClick,
			fetchFn: value.at(-1)?.fetchFn,
			onEdit: value.at(-1)?.onEdit,
		};
	},
});

// PLUGINS

/**
 * Listens to document updates and calls `fetchFn`
 * to fetch auto-suggestions. This relies on
 * `InlineSuggestionState` also being installed
 * in the editor's extensions.
 */
export const fetchSuggestion = ViewPlugin.fromClass(
	class Plugin {
		async update(update: ViewUpdate) {
			const doc = update.state.doc;
			// Only fetch if the document has changed
			if (!update.docChanged) {
				return;
			}

			const isAutocompleted = update.transactions.some((t) =>
				t.isUserEvent("input.complete"),
			);
			if (isAutocompleted) {
				return;
			}

			// Call onEdit callback if provided
			const config = update.view.state.facet(suggestionConfigFacet);
			const onEdit = config.onEdit;
			if (onEdit) {
				for (const tr of update.transactions) {
					if (tr.docChanged) {
						const oldDoc = update.startState.doc.toString();
						const newDoc = update.state.doc.toString();

						// Find the changes in the transaction
						tr.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
							onEdit(oldDoc, newDoc, fromA, toA, insert.toString());
						});
					}
				}
			}

			if (!config.fetchFn) {
				// biome-ignore lint/suspicious/noConsole: <explanation>
				console.error(
					"Unexpected issue in codemirror-copilot: fetchFn was not configured",
				);
				return;
			}

			const result = await config.fetchFn(update.state);

			// The result is now a DiffSuggestion object
			update.view.dispatch({
				effects: NextEditPredictionEffect.of({ suggestion: result, doc: doc }),
			});
		}
	},
);

const renderNextEditPredicationPlugin = ViewPlugin.fromClass(
	class Plugin {
		decorations: DecorationSet;
		constructor() {
			// Empty decorations
			this.decorations = Decoration.none;
		}
		update(update: ViewUpdate) {
			const suggestion = update.state.field(
				NextEditPredictionState,
			)?.suggestion;
			if (!suggestion) {
				this.decorations = Decoration.none;
				return;
			}

			this.decorations = nextEditPredicationDecoration(suggestion);
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

// COMMANDS

const acceptSuggestion: Command = (view: EditorView) => {
	const suggestion = view.state.field(NextEditPredictionState)?.suggestion;

	// If there is no suggestion, do nothing and let the default keymap handle it
	if (!suggestion) {
		return false;
	}

	view.dispatch({
		...insertDiffText(view.state, suggestion),
	});
	return true;
};

const rejectSuggestion: Command = (view: EditorView) => {
	const suggestion = view.state.field(NextEditPredictionState)?.suggestion;

	// If there is no suggestion, do nothing
	if (!suggestion) {
		return false;
	}

	// Clear the suggestion
	view.dispatch({
		effects: NextEditPredictionEffect.of({
			suggestion: null,
			doc: view.state.doc,
		}),
	});
	return true;
};

/**
 * Attaches a keybinding on `Tab` that accepts
 * the suggestion if there is one.
 */
const nextEditPredicationKeymap = Prec.highest(
	keymap.of([
		{
			key: "Tab",
			run: acceptSuggestion,
		},
		{
			key: "Escape",
			run: rejectSuggestion,
		},
	]),
);

/**
 * Options to configure the AI suggestion UI.
 */
interface NextEditPredictionOptions {
	fetchFn: NextEditPredictor;

	/**
	 * Delay after typing to query the API. A shorter
	 * delay will query more often, and cost more.
	 * @default 500
	 */
	delay?: number;

	/**
	 * Whether clicking the suggestion will
	 * automatically accept it.
	 */
	acceptOnClick?: boolean;

	/**
	 * Callback called when an edit occurs, for tracking patches
	 */
	onEdit?: (
		oldDoc: string,
		newDoc: string,
		from: number,
		to: number,
		insert: string,
	) => void;
}

/**
 * Configure the UI, state, and keymap to power
 * auto suggestions.
 */
export function nextEditPrediction(options: NextEditPredictionOptions) {
	const { delay = 500, acceptOnClick = true, onEdit } = options;
	const fetchFn = debouncePromise(options.fetchFn, delay);
	return [
		suggestionConfigFacet.of({ acceptOnClick, fetchFn, onEdit }),
		NextEditPredictionState,
		fetchSuggestion,
		renderNextEditPredicationPlugin,
		nextEditPredicationKeymap,
	];
}
