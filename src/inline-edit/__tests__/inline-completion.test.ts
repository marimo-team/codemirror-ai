import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptInlineCompletion,
  inlineCompletion,
  rejectInlineCompletion,
} from "../inline-completion";

describe("inline-completion", () => {
  let view: EditorView;
  const mockFetchFn = vi.fn().mockResolvedValue("suggestion");

  beforeEach(() => {
    // Create a new editor for each test
    const state = EditorState.create({
      doc: "Hello world",
      extensions: [
        inlineCompletion({
          fetchFn: mockFetchFn,
          delay: 0, // No delay for testing
        }),
      ],
    });

    vi.useFakeTimers();

    view = new EditorView({
      state,
      parent: document.createElement("div"),
    });
  });

  afterEach(() => {
    view.destroy();
    vi.clearAllMocks();
  });

  it("should fetch suggestions when document changes", async () => {
    // Trigger a document change
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });

    // Wait for the debounced function to be called
    await vi.runAllTimersAsync();

    // Verify that fetchFn was called with the current state
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    expect(mockFetchFn).toHaveBeenCalledWith(expect.any(EditorState), expect.any(AbortSignal));
  });

  it("should accept inline completion", async () => {
    // Set up a suggestion
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });

    await vi.runAllTimersAsync();

    // Manually trigger the accept command
    const result = acceptInlineCompletion(view);

    // Verify the suggestion was accepted
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("suggestion");
  });

  it("should reject inline completion", async () => {
    // Set up a suggestion
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });

    await vi.runAllTimersAsync();

    // Manually trigger the reject command
    const result = rejectInlineCompletion(view);

    // Verify the suggestion was rejected
    expect(result).toBe(true);
    // The document should remain unchanged
    expect(view.state.doc.toString()).toBe("Hello  world");
  });

  it("should not fetch suggestions when selection changes", async () => {
    // Change selection without changing document
    view.dispatch({
      selection: EditorSelection.single(0, 5),
    });

    await vi.runAllTimersAsync();

    // Verify that fetchFn was not called
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it("should render inline suggestion as decoration", async () => {
    // Trigger a document change
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });

    await vi.runAllTimersAsync();

    // Check if decoration is rendered
    const suggestionElements = view.dom.querySelectorAll(".cm-inline-suggestion");
    expect(suggestionElements.length).toBeGreaterThan(0);
    expect(suggestionElements[0].textContent).toBe("suggestion");
  });
});

describe("inline-completion events", () => {
  let view: EditorView;
  const mockFetchFn = vi.fn().mockResolvedValue("suggestion");
  const mockEvents = {
    onSuggestionAccepted: vi.fn(),
    onSuggestionRejected: vi.fn(),
    beforeSuggestionFetch: vi.fn().mockReturnValue(true),
  };

  beforeEach(() => {
    const state = EditorState.create({
      doc: "Hello world",
      extensions: [
        inlineCompletion({
          fetchFn: mockFetchFn,
          delay: 0,
          events: mockEvents,
        }),
      ],
    });

    vi.useFakeTimers();
    view = new EditorView({
      state,
      parent: document.createElement("div"),
    });
  });

  afterEach(() => {
    view.destroy();
    vi.clearAllMocks();
  });

  it("should call onSuggestionAccepted when accepting completion", async () => {
    // Set up a suggestion
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });
    await vi.runAllTimersAsync();

    acceptInlineCompletion(view);

    expect(mockEvents.onSuggestionAccepted).toHaveBeenCalledWith(
      expect.any(EditorView),
      "suggestion",
    );
  });

  it("should call onSuggestionRejected when rejecting completion", async () => {
    // Set up a suggestion
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });
    await vi.runAllTimersAsync();

    rejectInlineCompletion(view);

    expect(mockEvents.onSuggestionRejected).toHaveBeenCalledWith(
      expect.any(EditorView),
      "suggestion",
    );
  });

  it("should call beforeSuggestionFetch before fetching suggestions", async () => {
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });
    await vi.runAllTimersAsync();

    expect(mockEvents.beforeSuggestionFetch).toHaveBeenCalledWith(expect.any(EditorView));
    expect(mockFetchFn).toHaveBeenCalled();
  });

  it("should not fetch suggestions when beforeSuggestionFetch returns false", async () => {
    mockEvents.beforeSuggestionFetch.mockReturnValueOnce(false);

    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });
    await vi.runAllTimersAsync();

    expect(mockEvents.beforeSuggestionFetch).toHaveBeenCalled();
    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

describe("inline-completion cache", () => {
  let view: EditorView;
  const mockFetchFn = vi.fn().mockResolvedValue("suggestion");

  beforeEach(() => {
    const state = EditorState.create({
      doc: "Hello world",
      extensions: [
        inlineCompletion({
          fetchFn: mockFetchFn,
          delay: 0,
          cacheTimeout: 1000,
        }),
      ],
    });

    vi.useFakeTimers();
    view = new EditorView({
      state,
      parent: document.createElement("div"),
    });
  });

  afterEach(() => {
    view.destroy();
    vi.clearAllMocks();
  });

  it.skip("should use cached result for identical document", async () => {
    // First change
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });
    await vi.runAllTimersAsync();

    // Second identical change
    view.dispatch({
      changes: { from: 6, to: 6, insert: " " },
    });
    await vi.runAllTimersAsync();

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });

  it("should invalidate cache after timeout", async () => {
    // First change
    view.dispatch({
      changes: { from: 5, to: 5, insert: " " },
    });
    await vi.runAllTimersAsync();

    // Advance time past cache timeout
    vi.advanceTimersByTime(1100);

    // Same change again
    view.dispatch({
      changes: { from: 6, to: 6, insert: " " },
    });
    await vi.runAllTimersAsync();

    expect(mockFetchFn).toHaveBeenCalledTimes(2);
  });
});
