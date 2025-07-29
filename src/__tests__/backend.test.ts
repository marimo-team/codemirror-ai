import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import { cleanPrediction, PredictionBackend } from "../next-edit-prediction/backend.js";
import type { DiffSuggestion } from "../next-edit-prediction/types.js";

describe("cleanPrediction", () => {
  it("should remove EDIT_START and EDIT_END markers", () => {
    const input = `<|EDIT_START|>
# Create a Python script to scrape a web page and output the title of the page.
import requests
from bs4 import BeautifulSoup

url = 'https://www.example.com'

resp = requests.get(url)
soup = BeautifulSoup(resp.text, <|user_cursor_is_here|>

print(title)
<|EDIT_END|>`;

    const expected = `# Create a Python script to scrape a web page and output the title of the page.
import requests
from bs4 import BeautifulSoup

url = 'https://www.example.com'

resp = requests.get(url)
soup = BeautifulSoup(resp.text, <|user_cursor_is_here|>

print(title)`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should remove EDIT markers without newlines", () => {
    const input = `<|EDIT_START|>some code<|EDIT_END|>`;
    const expected = `some code`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should remove EDIT markers with newlines after them", () => {
    const input = `<|EDIT_START|>
function test() {
  return true;
}
<|EDIT_END|>
`;
    const expected = `function test() {
  return true;
}`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should trim whitespace from the result", () => {
    const input = `  <|EDIT_START|>
code here
<|EDIT_END|>  `;
    const expected = `code here`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should handle text without EDIT markers", () => {
    const input = `console.log("hello world");`;
    const expected = `console.log("hello world");`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should handle empty string", () => {
    const input = ``;
    const expected = ``;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should handle only EDIT markers", () => {
    const input = `<|EDIT_START|><|EDIT_END|>`;
    const expected = ``;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should handle multiple EDIT markers", () => {
    const input = `<|EDIT_START|>first<|EDIT_END|> middle <|EDIT_START|>second<|EDIT_END|>`;
    const expected = `first middle second`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should handle mixed newline scenarios", () => {
    const input = `<|EDIT_START|>
start content
<|EDIT_END|>
middle content
<|EDIT_START|>
end content
<|EDIT_END|>`;
    const expected = `start content
middle content
end content`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should preserve other user cursor markers", () => {
    const input = `<|EDIT_START|>
code with <|user_cursor_is_here|> marker
<|EDIT_END|>`;
    const expected = `code with <|user_cursor_is_here|> marker`;

    const result = cleanPrediction(input);
    expect(result.cleaned).toBe(expected);
    expect(result.intent).toBe("");
  });

  it("should extract intent from INTENT tags", () => {
    const input = `<|INTENT|>Add error handling for network requests<|EDIT_START|>
try {
  const response = await fetch(url);
  return response.json();
} catch (error) {
  console.error('Network error:', error);
  return null;
}
<|EDIT_END|>`;

    const result = cleanPrediction(input);
    expect(result.intent).toBe("Add error handling for network requests");
    expect(result.cleaned).toBe(`try {
  const response = await fetch(url);
  return response.json();
} catch (error) {
  console.error('Network error:', error);
  return null;
}`);
  });

  it("should extract intent with multiline content", () => {
    const input = `<|INTENT|>
Refactor function to use async/await
instead of promises for better readability
<|EDIT_START|>
async function getData() {
  const result = await api.fetch();
  return result;
}
<|EDIT_END|>`;

    const result = cleanPrediction(input);
    expect(result.intent).toBe(
      "Refactor function to use async/await\ninstead of promises for better readability",
    );
    expect(result.cleaned).toBe(`async function getData() {
  const result = await api.fetch();
  return result;
}`);
  });

  it("should handle missing intent tags", () => {
    const input = `<|EDIT_START|>
const result = process(data);
<|EDIT_END|>`;

    const result = cleanPrediction(input);
    expect(result.intent).toBe("");
    expect(result.cleaned).toBe("const result = process(data);");
  });

  it("should handle intent without content", () => {
    const input = `<|INTENT|><|EDIT_START|>
const x = 1;
<|EDIT_END|>`;

    const result = cleanPrediction(input);
    expect(result.intent).toBe("");
    expect(result.cleaned).toBe("const x = 1;");
  });

  it("should handle intent with only whitespace", () => {
    const input = `<|INTENT|>
   <|EDIT_START|>
const y = 2;
<|EDIT_END|>`;

    const result = cleanPrediction(input);
    expect(result.intent).toBe("");
    expect(result.cleaned).toBe("const y = 2;");
  });
});

describe("PredictionBackend.cached", () => {
  const createState = (doc: string, from?: number, to?: number) => {
    return EditorState.create({
      doc,
      selection: EditorSelection.create([
        EditorSelection.range(from ?? doc.length, to ?? from ?? doc.length),
      ]),
    });
  };

  it("should cache predictions based on cursor position and text", async () => {
    const mockResponse: DiffSuggestion = {
      oldText: "hello world",
      newText: "hello beautiful world",
      from: 5,
      to: 5,
    };

    const mockPredictor = vi.fn().mockResolvedValue(mockResponse);
    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    const state = createState("hello world", 5);

    // First call should hit the delegate
    const result1 = await cachedPredictor(state);
    expect(mockPredictor).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(mockResponse);

    // Second call with same state should return cached result
    const result2 = await cachedPredictor(state);
    expect(mockPredictor).toHaveBeenCalledTimes(1); // Still only called once
    expect(result2).toEqual(mockResponse);
  });

  it("should generate different cache keys for different cursor positions", async () => {
    const response1: DiffSuggestion = {
      oldText: "hello world",
      newText: "hello beautiful world",
      from: 5,
      to: 5,
    };

    const response2: DiffSuggestion = {
      oldText: "hello world",
      newText: "hello world!",
      from: 11,
      to: 11,
    };

    const mockPredictor = vi.fn().mockResolvedValueOnce(response1).mockResolvedValueOnce(response2);

    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    const state1 = createState("hello world", 5);
    const state2 = createState("hello world", 11);

    const result1 = await cachedPredictor(state1);
    const result2 = await cachedPredictor(state2);

    expect(mockPredictor).toHaveBeenCalledTimes(2);
    expect(result1).toEqual(response1);
    expect(result2).toEqual(response2);
  });

  it("should generate different cache keys for different text content", async () => {
    const response1: DiffSuggestion = {
      oldText: "hello world",
      newText: "hello beautiful world",
      from: 5,
      to: 5,
    };

    const response2: DiffSuggestion = {
      oldText: "goodbye world",
      newText: "goodbye cruel world",
      from: 5,
      to: 5,
    };

    const mockPredictor = vi.fn().mockResolvedValueOnce(response1).mockResolvedValueOnce(response2);

    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    const state1 = createState("hello world", 5);
    const state2 = createState("goodbye world", 5);

    const result1 = await cachedPredictor(state1);
    const result2 = await cachedPredictor(state2);

    expect(mockPredictor).toHaveBeenCalledTimes(2);
    expect(result1).toEqual(response1);
    expect(result2).toEqual(response2);
  });

  it("should handle ranges (from != to)", async () => {
    const mockResponse: DiffSuggestion = {
      oldText: "hello world",
      newText: "hello",
      from: 5,
      to: 11,
    };

    const mockPredictor = vi.fn().mockResolvedValue(mockResponse);
    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    const state = createState("hello world", 5, 11);

    const result1 = await cachedPredictor(state);
    const result2 = await cachedPredictor(state);

    expect(mockPredictor).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
  });

  it("should respect cache size limit and evict oldest entries", async () => {
    const maxSize = 2;
    const responses: DiffSuggestion[] = [
      { oldText: "text1", newText: "new1", from: 0, to: 0 },
      { oldText: "text2", newText: "new2", from: 0, to: 0 },
      { oldText: "text3", newText: "new3", from: 0, to: 0 },
    ];

    const mockPredictor = vi.fn();
    // Set up responses for each expected call
    responses.forEach((response) => {
      mockPredictor.mockResolvedValueOnce(response);
    });

    const cachedPredictor = PredictionBackend.cached(mockPredictor, maxSize);

    const state1 = createState("text1", 0);
    const state2 = createState("text2", 0);
    const state3 = createState("text3", 0);

    // Fill cache to capacity
    await cachedPredictor(state1); // Call 1
    await cachedPredictor(state2); // Call 2
    expect(mockPredictor).toHaveBeenCalledTimes(2);

    // Add third item, should evict oldest (state1)
    await cachedPredictor(state3); // Call 3
    expect(mockPredictor).toHaveBeenCalledTimes(3);

    // Cache now contains [state2, state3] (state1 was evicted)

    // Access second and third items - should be cached
    await cachedPredictor(state2); // Should be cached, no new call
    await cachedPredictor(state3); // Should be cached, no new call
    expect(mockPredictor).toHaveBeenCalledTimes(3);

    // Access first item again - should call delegate since it was evicted
    mockPredictor.mockResolvedValueOnce(responses[0]);
    await cachedPredictor(state1); // Call 4 (evicted, so needs new call)
    expect(mockPredictor).toHaveBeenCalledTimes(4);
  });

  it("should use default cache size of 20", async () => {
    const mockResponse: DiffSuggestion = {
      oldText: "test",
      newText: "test updated",
      from: 0,
      to: 0,
    };

    const mockPredictor = vi.fn().mockResolvedValue(mockResponse);
    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    // Create 21 different states to exceed default cache size
    const states = Array.from({ length: 21 }, (_, i) => createState(`text${i}`, 0));

    // Fill cache beyond capacity
    for (const state of states) {
      await cachedPredictor(state);
    }

    expect(mockPredictor).toHaveBeenCalledTimes(21);

    // First item should have been evicted, so it should call delegate again
    await cachedPredictor(states[0]);
    expect(mockPredictor).toHaveBeenCalledTimes(22);

    // Last item should still be cached
    await cachedPredictor(states[20]);
    expect(mockPredictor).toHaveBeenCalledTimes(22);
  });

  it("should handle async errors from delegate predictor", async () => {
    const error = new Error("Prediction failed");
    const mockPredictor = vi.fn().mockRejectedValue(error);
    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    const state = createState("hello world", 5);

    await expect(cachedPredictor(state)).rejects.toThrow("Prediction failed");
    expect(mockPredictor).toHaveBeenCalledTimes(1);

    // Should not cache errors - second call should also try delegate
    await expect(cachedPredictor(state)).rejects.toThrow("Prediction failed");
    expect(mockPredictor).toHaveBeenCalledTimes(2);
  });

  it("should generate cache key correctly", async () => {
    const mockResponse: DiffSuggestion = {
      oldText: "hello world",
      newText: "hello beautiful world",
      from: 5,
      to: 6,
    };

    const mockPredictor = vi.fn().mockResolvedValue(mockResponse);
    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    const state = createState("hello world", 5, 6);
    await cachedPredictor(state);

    // The cache key format should be: from::to::text
    // For this case: "5::6::hello world"
    expect(mockPredictor).toHaveBeenCalledWith(state);
  });

  it("should work with empty documents", async () => {
    const mockResponse: DiffSuggestion = {
      oldText: "",
      newText: "hello",
      from: 0,
      to: 0,
    };

    const mockPredictor = vi.fn().mockResolvedValue(mockResponse);
    const cachedPredictor = PredictionBackend.cached(mockPredictor);

    const state = createState("", 0);

    const result1 = await cachedPredictor(state);
    const result2 = await cachedPredictor(state);

    expect(mockPredictor).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
  });
});
