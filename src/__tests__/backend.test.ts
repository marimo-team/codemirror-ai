import { describe, expect, it } from "vitest";
import { cleanPrediction } from "../next-edit-prediction/backend.js";

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
