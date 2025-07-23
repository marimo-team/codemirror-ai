export const INPUT_OUTPUT_FIXTURES = [
	[
		// Add in the middle
		`
# Create a Python script to scrape a web page and output the title of the page.
import requests
from bs4 import BeautifulSoup

url = 'https://www.example.com'

resp = requests.get(url)
soup = BeautifulSoup(resp.text, <|user_cursor_is_here|>

print(title)`,
		`
# Create a Python script to scrape a web page and output the title of the page.
import requests
from bs4 import BeautifulSoup

url = 'https://www.example.com'

resp = requests.get(url)
soup = BeautifulSoup(resp.text, 'html.parser')
title = soup.find('title').get_text()<|user_cursor_is_here|>

print(title)`,
	],
	// Add at the end
	`
# Write a python function to copy a list from a singleton tuple.
def lcopy(xs):
  return x<|user_cursor_is_here|>
  `,
	`
# Write a python function to copy a list from a singleton tuple.
def lcopy(xs):
  return xs[:]
<|user_cursor_is_here|>`,

	// Delete example
	[
		`
# Remove the print statement from this code.
def foo():
    print("Hello, world!")
    return 42
<|user_cursor_is_here|>
`,
		`
# Remove the print statement from this code.
def foo():
    return 42
<|user_cursor_is_here|>
`,
	],

	// Change single line example
	[
		`
def square(x):
    return x * x

bar(2)
<|user_cursor_is_here|>
`,
		`
def square(x):
    return x * x

square(2)
<|user_cursor_is_here|>
`,
	],

	// Change multiple lines example
	[
		`
def square(x):
    return x + 1

bar(2)
<|user_cursor_is_here|>
`,
		`
def square(x):
    return x * x

square(2)
<|user_cursor_is_here|>
`,
	],
];
