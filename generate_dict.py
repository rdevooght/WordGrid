import argparse
import json
import re

WORD_PATTERN = re.compile(r"^[a-zA-Z]{3,}$")


def get_words(files, min_frequency):
    words = []

    for file in files:
        try:
            with open(file, "r") as f:
                for line in f:
                    # remove frequency if in file
                    if " " in line:
                        word, freq = line.split()
                        if int(freq) < min_frequency:
                            continue
                    else:
                        word = line

                    word = word.strip().lower()

                    if WORD_PATTERN.match(word):
                        words.append(word)

        except FileNotFoundError:
            print(f"Warning: {file} not found")
            return

    # Sort alphabetically
    words.sort()

    return words


def save_to_js(filename, words):
    # Write JS file
    js_content = f"const GAME_DICTIONARY = {json.dumps(words)};"

    with open(filename, "w") as f:
        f.write(js_content)
    print(f"{filename} created")


def save_to_txt(filename, words):
    # Write TXT file
    with open(filename, "w") as f:
        for word in words:
            f.write(word + "\n")
    print(f"{filename} created")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a dictionary file")

    parser.add_argument("--files", "-f", nargs="+", help="Files to read words from")
    parser.add_argument(
        "--output", "-o", default="dictionary.js", help="Output file name"
    )
    parser.add_argument(
        "--min-frequency", type=int, default=100, help="Minimum frequency"
    )

    args = parser.parse_args()
    words = get_words(args.files, args.min_frequency)

    if args.output.endswith(".js"):
        save_to_js(args.output, words)
    elif args.output.endswith(".txt"):
        save_to_txt(args.output, words)
    else:
        print(f"Unsupported output format: {args.output}")
