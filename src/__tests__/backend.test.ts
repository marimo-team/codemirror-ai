import { describe, expect, it } from "vitest";
import { cleanPrediction } from "../next-edit-prediction/backend.js";

describe("cleanPrediction", () => {
	it("should remove editable region start and end markers", () => {
		const input = `<|editable_region_start|>
# Create a Python script to scrape a web page and output the title of the page.
import requests
from bs4 import BeautifulSoup

url = 'https://www.example.com'

resp = requests.get(url)
soup = BeautifulSoup(resp.text, <|user_cursor_is_here|>

print(title)
<|editable_region_end|>`;

		const expected = `# Create a Python script to scrape a web page and output the title of the page.
import requests
from bs4 import BeautifulSoup

url = 'https://www.example.com'

resp = requests.get(url)
soup = BeautifulSoup(resp.text, <|user_cursor_is_here|>

print(title)`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should remove editable region markers without newlines", () => {
		const input = `<|editable_region_start|>some code<|editable_region_end|>`;
		const expected = `some code`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should remove editable region markers with newlines after them", () => {
		const input = `<|editable_region_start|>
function test() {
  return true;
}
<|editable_region_end|>
`;
		const expected = `function test() {
  return true;
}`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should trim whitespace from the result", () => {
		const input = `  <|editable_region_start|>
code here
<|editable_region_end|>  `;
		const expected = `code here`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should handle text without editable region markers", () => {
		const input = `console.log("hello world");`;
		const expected = `console.log("hello world");`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should handle empty string", () => {
		const input = ``;
		const expected = ``;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should handle only editable region markers", () => {
		const input = `<|editable_region_start|><|editable_region_end|>`;
		const expected = ``;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should handle multiple editable region markers", () => {
		const input = `<|editable_region_start|>first<|editable_region_end|> middle <|editable_region_start|>second<|editable_region_end|>`;
		const expected = `first middle second`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should handle mixed newline scenarios", () => {
		const input = `<|editable_region_start|>
start content
<|editable_region_end|>
middle content
<|editable_region_start|>
end content
<|editable_region_end|>`;
		const expected = `start content
middle content
end content`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});

	it("should preserve other user cursor markers", () => {
		const input = `<|editable_region_start|>
code with <|user_cursor_is_here|> marker
<|editable_region_end|>`;
		const expected = `code with <|user_cursor_is_here|> marker`;

		const result = cleanPrediction(input);
		expect(result).toBe(expected);
	});
});
