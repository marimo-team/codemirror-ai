import type { Range } from "@codemirror/state";
import { type Command, Decoration, WidgetType } from "@codemirror/view";
import type { EditorView } from "codemirror";
import { debug } from "./debug.js";
import type { DiffOperationOf } from "./diff.js";
import { suggestionConfigFacet } from "./state.js";

/**
 * Widget for displaying ghost text inline with diff information
 * This shows 'Added' texted in the document.
 */
export class GhostTextWidget extends WidgetType {
	operation: DiffOperationOf<"add">;
	onAccept: Command;

	constructor(operation: DiffOperationOf<"add">, onAccept: Command) {
		super();
		this.operation = operation;
		this.onAccept = onAccept;
	}

	toDOM(view: EditorView) {
		const container = document.createElement("span");
		container.className = "cm-ghost-text-container";
		container.style.cssText = `cursor: pointer; display: inline;`;

		const span = document.createElement("span");
		span.className = `cm-ghost-text cm-ghost-add`;
		span.style.cssText = `
				color: #22863a;
				opacity: 0.7;
				font-style: italic;
				background: rgba(34, 134, 58, 0.1);
				border-radius: 2px;
				padding: 1px 2px;
				margin-right: 1px;
		`;
		span.textContent = " efficiently";
		container.appendChild(span);

		container.onclick = (e) => this.accept(e, view);
		return container;
	}

	accept(e: MouseEvent, view: EditorView) {
		const config = view.state.facet(suggestionConfigFacet);
		if (!config.acceptOnClick) return;

		e.stopPropagation();
		e.preventDefault();

		return this.onAccept(view);
	}
}

/**
 * Create a mark decoration for highlighting text that will be removed
 */
export function createRemovalDecoration(
	operation: DiffOperationOf<"remove">,
	_onAccept: Command,
): Range<Decoration>[] {
	return [
		Decoration.mark({
			class: "cm-removal-highlight",
			attributes: {
				style: `
				background: rgba(215, 58, 73, 0.3);
				color: #d73a49;
				text-decoration: line-through;
				border-radius: 2px;
				cursor: pointer;
			`,
			},
		}).range(operation.position, operation.position + operation.count),
	];
}

/**
 * Create a mark decoration for highlighting text that will be modified
 */
export function createModifyDecoration(
	operation: DiffOperationOf<"modify">,
	onAccept: Command,
): Range<Decoration>[] {
	return [
		Decoration.mark({
			class: "cm-modify-highlight",
			attributes: {
				style: `
				background: rgba(128, 128, 128, 0.3);
				color: #666;
				border-radius: 2px;
				cursor: pointer;
				opacity: 0.8;
			`,
			},
		}).range(operation.position, operation.position + operation.removeCount),
		Decoration.widget({
			widget: new ModifyWidget(operation, onAccept),
			side: 1,
		}).range(operation.position + operation.removeCount),
	];
}

// /**
//  * Widget for displaying deletion operations with red background highlight
//  *
//  * unused
//  */
// export class DeletionWidget extends WidgetType {
// 	operation: DiffOperationOf<"remove">;
// 	onAccept: Command;

// 	constructor(operation: DiffOperationOf<"remove">, onAccept: Command) {
// 		super();
// 		this.operation = operation;
// 		this.onAccept = onAccept;
// 	}

// 	toDOM(view: EditorView) {
// 		const container = document.createElement("span");
// 		container.className = "cm-deletion-widget";

// 		if (this.operation.type === "remove") {
// 			container.style.cssText = `
// 				display: inline;
// 				background: rgba(215, 58, 73, 0.2);
// 				border-radius: 3px;
// 				padding: 1px 3px;
// 				margin: 0 1px;
// 				border: 1px solid rgba(215, 58, 73, 0.4);
// 				position: relative;
// 				cursor: pointer;
// 			`;

// 			// Create a placeholder for the deleted content
// 			const deletedSpan = document.createElement("span");
// 			deletedSpan.style.cssText = `
// 				color: #d73a49;
// 				font-style: italic;
// 				opacity: 0.8;
// 				font-size: 0.9em;
// 			`;
// 			deletedSpan.textContent = view.state.doc.sliceString(
// 				this.operation.position,
// 				this.operation.position + this.operation.count,
// 			);
// 			container.appendChild(deletedSpan);
// 		}

// 		container.onclick = (e) => this.accept(e, view);
// 		return container;
// 	}

// 	accept(e: MouseEvent, view: EditorView) {
// 		const config = view.state.facet(suggestionConfigFacet);
// 		if (!config.acceptOnClick) return;

// 		e.stopPropagation();
// 		e.preventDefault();

// 		return this.onAccept(view);
// 	}
// }

/**
 * Widget for highlighting existing text that will be removed with red background
 */
export class RemovalHighlightWidget extends WidgetType {
	operation: DiffOperationOf<"remove">;
	onAccept: Command;

	constructor(operation: DiffOperationOf<"remove">, onAccept: Command) {
		super();
		this.operation = operation;
		this.onAccept = onAccept;
	}

	toDOM(view: EditorView) {
		const container = document.createElement("span");
		container.className = "cm-removal-highlight";
		container.style.cssText = `
			display: inline;
			background: rgba(215, 58, 73, 0.3);
			color: #d73a49;
			text-decoration: line-through;
			border-radius: 2px;
			padding: 0 1px;
			cursor: pointer;
			opacity: 0.8;
		`;

		const textToRemove = view.state.doc.sliceString(
			this.operation.position,
			this.operation.position + this.operation.count,
		);

		container.textContent = textToRemove;
		container.onclick = (e) => this.accept(e, view);
		return container;
	}

	accept(e: MouseEvent, view: EditorView) {
		const config = view.state.facet(suggestionConfigFacet);
		if (!config.acceptOnClick) return;

		e.stopPropagation();
		e.preventDefault();

		return this.onAccept(view);
	}
}

const TOOLTIP_OFFSET_RIGHT = 24; // Distance in pixels to position tooltip to the right

/**
 * Utility function to find the start of a line given a position in the document
 */
function findLineStart(doc: string, position: number): number {
	if (position === 0) return 0;
	let pos = position - 1;
	while (pos >= 0 && doc[pos] !== "\n") {
		pos--;
	}
	return pos + 1;
}

/**
 * Utility function to find the end of a line given a position in the document
 */
function findLineEnd(doc: string, position: number): number {
	let pos = position;
	while (pos < doc.length && doc[pos] !== "\n") {
		pos++;
	}
	return pos;
}

/**
 * Extract full line context for a modify operation, from start of first line to end of last line
 */
function getFullLineContext(
	doc: string,
	operation: DiffOperationOf<"modify">,
): {
	fullContext: string;
	contextStart: number;
	contextEnd: number;
	relativeModifyStart: number;
	relativeModifyEnd: number;
} {
	const modifyStart = operation.position;
	const modifyEnd = operation.position + operation.removeCount;

	const contextStart = findLineStart(doc, modifyStart);
	const contextEnd = findLineEnd(doc, modifyEnd - 1);

	const fullContext = doc.slice(contextStart, contextEnd);
	const relativeModifyStart = modifyStart - contextStart;
	const relativeModifyEnd = modifyEnd - contextStart;

	return {
		fullContext,
		contextStart,
		contextEnd,
		relativeModifyStart,
		relativeModifyEnd,
	};
}

/**
 * Create inline diff spans with highlighting for additions and deletions
 */
function createInlineDiffSpan(
	text: string,
	type: "normal" | "removed" | "added",
): HTMLSpanElement {
	const span = document.createElement("span");

	if (type === "removed") {
		span.style.cssText = `
			background: rgba(215, 58, 73, 0.3);
			color: #d73a49;
		`;
	} else if (type === "added") {
		span.style.cssText = `
			background: rgba(40, 167, 69, 0.3);
			color: #28a745;
		`;
	}

	span.textContent = text;
	return span;
}

/**
 * Create a contextual diff line that shows the full line with inline highlighting
 */
function createContextualDiffLine(
	fullContext: string,
	operation: DiffOperationOf<"modify">,
	relativeModifyStart: number,
	relativeModifyEnd: number,
	type: "removed" | "added",
): HTMLDivElement {
	const line = document.createElement("div");
	const isRemoved = type === "removed";

	// background: ${isRemoved ? '#ffecec' : '#e6ffed'};
	// color: ${isRemoved ? '#d73a49' : '#28a745'};
	line.style.cssText = `
		padding: 2px 6px;
		font-family: inherit;
		white-space: pre;
		border-bottom: 1px solid ${isRemoved ? "#fdb8c0" : "#acf2bd"};
	`;

	// Add the prefix (- or +)
	const prefix = document.createElement("span");
	prefix.textContent = isRemoved ? "- " : "+ ";
	line.appendChild(prefix);

	if (isRemoved) {
		// For removed line: show full context with highlighted deletion
		const beforeChange = fullContext.substring(0, relativeModifyStart);
		const changedText = fullContext.substring(
			relativeModifyStart,
			relativeModifyEnd,
		);
		const afterChange = fullContext.substring(relativeModifyEnd);

		if (beforeChange) {
			line.appendChild(createInlineDiffSpan(beforeChange, "normal"));
		}
		if (changedText) {
			line.appendChild(createInlineDiffSpan(changedText, "removed"));
		}
		if (afterChange) {
			line.appendChild(createInlineDiffSpan(afterChange, "normal"));
		}
	} else {
		// For added line: show context with highlighted addition
		const beforeChange = fullContext.substring(0, relativeModifyStart);
		const afterChange = fullContext.substring(relativeModifyEnd);

		if (beforeChange) {
			line.appendChild(createInlineDiffSpan(beforeChange, "normal"));
		}
		// Add the new text with highlighting
		line.appendChild(createInlineDiffSpan(operation.insertText, "added"));
		if (afterChange) {
			line.appendChild(createInlineDiffSpan(afterChange, "normal"));
		}
	}

	return line;
}

/**
 * Widget for displaying modify operations with gray highlighting around deleted text
 * and a tooltip showing the new text
 */
export class ModifyWidget extends WidgetType {
	operation: DiffOperationOf<"modify">;
	onAccept: Command;

	constructor(operation: DiffOperationOf<"modify">, onAccept: Command) {
		super();
		this.operation = operation;
		this.onAccept = onAccept;
	}

	toDOM(view: EditorView) {
		const container = document.createElement("span");
		container.className = "cm-modify-widget";
		container.style.cssText = `
			display: inline;
			position: relative;
			width: 0;
			height: 0;
		`;

		const _textToRemove = view.state.doc.sliceString(
			this.operation.position,
			this.operation.position + this.operation.removeCount,
		);

		// Use the container as reference for tooltip positioning
		const referenceElement = container;

		// Create tooltip element styled like a git diff
		const tooltip = document.createElement("div");
		tooltip.className = "cm-modify-tooltip";
		tooltip.style.cssText = `
			position: fixed;
			display: block;
			background: #f8f8f8;
			border: 1px solid #ddd;
			border-radius: 4px;
			font-size: 11px;
			font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Courier New', monospace;
			z-index: 1000;
			box-shadow: 0 2px 8px rgba(0,0,0,0.15);
			padding: 0;
			min-width: 120px;
			max-width: 400px;
		`;

		// Get full document text and create contextual diff
		const docText = view.state.doc.toString();
		const context = getFullLineContext(docText, this.operation);

		// Create contextual diff lines showing before and after with inline highlighting
		const removedLine = createContextualDiffLine(
			context.fullContext,
			this.operation,
			context.relativeModifyStart,
			context.relativeModifyEnd,
			"removed",
		);

		const addedLine = createContextualDiffLine(
			context.fullContext,
			this.operation,
			context.relativeModifyStart,
			context.relativeModifyEnd,
			"added",
		);

		tooltip.appendChild(removedLine);
		tooltip.appendChild(addedLine);
		document.body.appendChild(tooltip);

		// Position tooltip to the right of the widget position
		const positionTooltip = () => {
			const rect = referenceElement.getBoundingClientRect();
			const tooltipRect = tooltip.getBoundingClientRect();

			// Position to the right of the widget position
			const left = rect.left + TOOLTIP_OFFSET_RIGHT;
			const top = rect.top + (rect.height - tooltipRect.height) / 2;

			// Keep tooltip within viewport bounds
			const maxLeft = window.innerWidth - tooltipRect.width - 8;
			const finalLeft = Math.min(left, maxLeft);
			const finalTop = Math.max(
				8,
				Math.min(top, window.innerHeight - tooltipRect.height - 8),
			);

			tooltip.style.left = `${finalLeft}px`;
			tooltip.style.top = `${finalTop}px`;
		};

		// Position tooltip immediately
		requestAnimationFrame(positionTooltip);

		// Handle scroll events to reposition tooltip
		const scrollHandler = () => {
			requestAnimationFrame(positionTooltip);
		};

		// Listen for scroll events on the editor's scrollable element
		const scrollElement = view.scrollDOM;
		scrollElement.addEventListener("scroll", scrollHandler, { passive: true });

		// Also listen for window scroll in case editor is in a scrollable container
		window.addEventListener("scroll", scrollHandler, { passive: true });

		// Clean up tooltip and event listeners when widget is removed
		container.addEventListener("DOMNodeRemoved", () => {
			// Remove event listeners
			scrollElement.removeEventListener("scroll", scrollHandler);
			window.removeEventListener("scroll", scrollHandler);

			// Remove tooltip from DOM
			if (tooltip.parentNode) {
				tooltip.parentNode.removeChild(tooltip);
			}
		});

		container.onclick = (e) => this.accept(e, view);
		return container;
	}

	accept(e: MouseEvent, view: EditorView) {
		const config = view.state.facet(suggestionConfigFacet);
		if (!config.acceptOnClick) return;

		e.stopPropagation();
		e.preventDefault();

		return this.onAccept(view);
	}
}

/**
 * Small widget to indicate that a suggestion can be accepted
 */
export class AcceptIndicatorWidget extends WidgetType {
	onAccept: Command;
	onReject: Command;

	constructor(onAccept: Command, onReject: Command) {
		super();
		this.onAccept = onAccept;
		this.onReject = onReject;
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

		return this.onAccept(view);
	}

	reject(e: MouseEvent, view: EditorView) {
		e.stopPropagation();
		e.preventDefault();

		return this.onReject(view);
	}
}
