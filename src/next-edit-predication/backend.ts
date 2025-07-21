import type { EditorState } from "@codemirror/state";
import {
	CURSOR_MARKER,
	type DiffSuggestion,
	type NextEditPredictor,
} from "./types.js";

/**
 * Callback for when a prediction is made
 */
export type PredictionCallback = (prediction: string, prompt: string) => void;

export type Templater = (opts: {
	prefix: string;
	suffix: string;
	context: Record<string, string>;
}) => string;

/**
 * Internal function to make HTTP request to an openai-compatible API
 */
async function fetchPrediction(opts: {
	message: string;
	model: string;
	url: string;
	headers?: Record<string, string>;
}): Promise<{ prediction: string; prompt: string }> {
	const { message, model, url, headers } = opts;
	const completionsUrl = `${url}/completions`;
	const response = await fetch(completionsUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
		body: JSON.stringify({
			model,
			messages: [
				{
					role: "user",
					content: message,
				},
			],
		}),
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	try {
		return await response.json();
	} catch (error) {
		throw new Error(`Error parsing prediction response: ${error}`);
	}
}

function cleanPrediction(prediction: string): string {
	return prediction
		.replace(/<\|editable_region_start\|>\n?|<\|editable_region_end\|>\n?/g, "")
		.trim();
}

function defaultTemplate(opts: {
	prefix: string;
	suffix: string;
	context: Record<string, string>;
}) {
	return `You are a code completion assistant and your task is to analyze user edits and then rewrite the marked region, taking into account the cursor location.

<|editable_region_start|>
${opts.prefix}<|user_cursor_is_here|>${opts.suffix}
<|editable_region_end|>
`;
}

const oxen = (opts: PredicationBackendOptions): NextEditPredictor => {
	const {
		model,
		baseUrl,
		headers,
		onPrediction,
		templater = defaultTemplate,
	} = opts;

	return async (state: EditorState): Promise<DiffSuggestion> => {
		const { from, to } = state.selection.main;
		const text = state.doc.toString();
		const prefix = text.slice(0, to);
		const suffix = text.slice(from);

		// Insert a <|user_cursor_is_here|> marker at the cursor position
		const oldText = text.slice(0, from) + CURSOR_MARKER + text.slice(from);

		try {
			const { prediction, prompt } = await fetchPrediction({
				message: templater({
					prefix,
					suffix,
					context: {},
				}),
				model,
				url: baseUrl,
				headers,
			});

			// Call the prediction callback if provided
			if (onPrediction) {
				onPrediction(prediction, prompt);
			}

			// Remove special tokens and clean up the prediction
			const cleaned = cleanPrediction(prediction);

			// Create a diff suggestion
			return {
				oldText: oldText,
				newText: cleaned,
				from: from,
				to: to,
			};
		} catch (error) {
			// biome-ignore lint/suspicious/noConsole: error
			console.error("Error fetching prediction:", error);
			// Return empty suggestion on error
			return {
				oldText: text,
				newText: text,
				from: from,
				to: to,
			};
		}
	};
};

interface PredicationBackendOptions {
	model: string;
	baseUrl: string;
	headers?: Record<string, string>;
	onPrediction?: PredictionCallback;
	templater?: Templater;
}

export const PredicationBackend = {
	oxen: oxen,
};
