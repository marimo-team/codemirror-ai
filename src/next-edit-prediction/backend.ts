import type { EditorState } from "@codemirror/state";
import { debug } from "./debug.js";
import { CURSOR_MARKER, type DiffSuggestion, type NextEditPredictor } from "./types.js";

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
  signal?: AbortSignal;
}): Promise<{ prediction: string; prompt: string }> {
  const { message, model, url, headers, signal } = opts;
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
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  try {
    const data = await response.json();
    if (!data.output || !data.output.content || !data.output.content[0]) {
      throw new Error("Invalid response from server");
    }
    return {
      prediction: data.output.content[0].text,
      prompt: message,
    };
  } catch (error) {
    throw new Error(`Error parsing prediction response: ${error}`);
  }
}

export function cleanPrediction(prediction: string): {
  cleaned: string;
  intent: string;
} {
  // Extract intent from <|INTENT|> tags
  const intentMatch = prediction.match(/<\|INTENT\|>([\s\S]*?)<\|EDIT_START\|>/);
  const intent = intentMatch?.[1]?.trim() ?? "";

  // Remove all special tokens and clean up the prediction
  const cleaned = prediction
    .replace(/<\|INTENT\|>[\s\S]*?<\|EDIT_START\|>/g, "")
    .replace(/<\|EDIT_START\|>\n?|<\|EDIT_END\|>\n?/g, "")
    .trim();

  return { cleaned, intent };
}

function defaultTemplate(opts: {
  prefix: string;
  suffix: string;
  context: Record<string, string>;
}) {
  return `You are a code completion assistant and your task is to analyze user edits and then rewrite the marked region, taking into account the cursor location. The user intent will sometimes be explicitly given below, in which case you must follow this intent. If it is not present, you must infer the intent before implementing the change.

<|INTENT|>
<|EDIT_START|>
${opts.prefix}<|user_cursor_is_here|>${opts.suffix}
<|EDIT_END|>
`;
}

const oxen = (opts: PredictionBackendOptions): NextEditPredictor => {
  const { model, baseUrl, headers, onPrediction, templater = defaultTemplate } = opts;

  let currentController: AbortController | null = null;

  return async (state: EditorState): Promise<DiffSuggestion> => {
    // Cancel any existing prediction
    if (currentController) {
      currentController.abort();
    }

    // Create new controller for this prediction
    currentController = new AbortController();

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
        signal: currentController.signal,
      });

      // Call the prediction callback if provided
      if (onPrediction) {
        onPrediction(prediction, prompt);
      }

      // Remove special tokens and clean up the prediction
      const { cleaned, intent } = cleanPrediction(prediction);
      debug("Prompt", prompt);
      debug("Prediction", prediction);
      debug("Cleaned", cleaned);
      debug("Intent", intent);

      // Create a diff suggestion
      return {
        oldText: oldText,
        newText: cleaned,
        from: from,
        to: to,
      };
    } catch (error) {
      const shouldLog = error instanceof Error && error.name !== "AbortError";

      if (shouldLog) {
        // biome-ignore lint/suspicious/noConsole: error
        console.error("Error fetching prediction:", error);
      }

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

interface PredictionBackendOptions {
  model: string;
  baseUrl: string;
  headers?: Record<string, string>;
  onPrediction?: PredictionCallback;
  templater?: Templater;
}

export const PredictionBackend = {
  oxen: oxen,
};
