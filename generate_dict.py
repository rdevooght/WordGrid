import argparse
import json
import re
from collections import Counter

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


def get_words_with_counts(files, min_frequency):
    """
    Returns a list of (word, count) that contains all the words in the files that match the WORD_PATTERN,
    the count is the number of files in which the word appears
    """
    all_words = Counter()

    for file in files:
        words = set()
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
                        words.add(word)

        except FileNotFoundError:
            print(f"Warning: {file} not found")
            continue

        all_words.update(words)

    # Go from counter to list of tuples
    all_words = [(word, count) for word, count in all_words.items()]

    # Sort alphabetically
    all_words.sort(key=lambda x: x[0])

    return all_words


def save_to_js(filename, words, as_dict=False):
    """
    Save words to a JS file
    if compact is True, change the output, instead of [[word, count], [word, count], ...]
    use {count: [word, word, ...]}
    """
    if as_dict:
        words_dict = {word: count for word, count in words}
        js_content = (
            f"const GAME_DICTIONARY = {json.dumps(words_dict, separators=(',', ':'))};"
        )
    else:
        js_content = (
            f"const GAME_DICTIONARY = {json.dumps(words, separators=(',', ':'))};"
        )

    with open(filename, "w") as f:
        f.write(js_content)
    print(f"{filename} created")


def save_to_json(filename, words, as_dict=False):
    """
    Save words to a JSON file
    """

    if as_dict:
        words_dict = {word: count for word, count in words}
        json_content = json.dumps(words_dict, separators=(",", ":"))
    else:
        json_content = json.dumps(words, separators=(",", ":"))

    with open(filename, "w") as f:
        f.write(json_content)
    print(f"{filename} created")


def save_to_txt(filename, words, delimiter=","):
    """
    Write text file
    words is a list of strings or of iterables
    if words is a list of strings, write each string on a new line
    if words is a list of iterables, write each iterable as a comma-separated string on a new line
    """
    with open(filename, "w") as f:
        for word in words:
            if isinstance(word, str):
                f.write(word + "\n")
            else:
                f.write(delimiter.join(map(str, word)) + "\n")
    print(f"{filename} created")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a dictionary file")

    parser.add_argument(
        "--files", "-f", nargs="+", required=True, help="Files to read words from"
    )
    parser.add_argument(
        "--output", "-o", default="dictionary.js", help="Output file name"
    )
    parser.add_argument(
        "--min-frequency", type=int, default=100, help="Minimum frequency"
    )
    parser.add_argument(
        "--add_count", action="store_true", help="Add word count to output"
    )
    parser.add_argument(
        "--as_dict",
        action="store_true",
        help="store as a Object: {word: count} (only for js and json)",
    )

    args = parser.parse_args()
    if args.add_count:
        words = get_words_with_counts(args.files, args.min_frequency)
    else:
        words = get_words(args.files, args.min_frequency)

    if args.output.endswith(".js"):
        save_to_js(args.output, words, as_dict=args.as_dict)
    elif args.output.endswith(".json"):
        save_to_json(args.output, words, as_dict=args.as_dict)
    elif args.output.endswith(".txt"):
        save_to_txt(args.output, words, delimiter=" ")
    elif args.output.endswith(".csv"):
        save_to_txt(args.output, words, delimiter=",")
    else:
        print(f"Unsupported output format: {args.output}")
