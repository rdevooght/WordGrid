import argparse
import re
import sys

import numpy as np

WORD_PATTERN = re.compile(r"^[a-zA-Z]{3,}$")


def generate_letter_frequency(files, weight_by_frequency=False):
    """
    Read files that have the following structures:
        each line contains a word followed by the frequency of the word, separated by a space
    Create a list of letter frequencies
    """
    frequencies = np.zeros(26, dtype=int)
    for file in files:
        try:
            with open(file, "r") as f:
                for line in f:
                    word, frequency = line.split(" ")
                    if not WORD_PATTERN.match(word):
                        continue
                    word = word.upper()
                    for i in range(len(word)):
                        frequencies[ord(word[i]) - ord("A")] += (
                            int(frequency) if weight_by_frequency else 1
                        )
        except FileNotFoundError:
            print(f"Warning: {file} not found")
            return

    normalised_frequencies = frequencies / frequencies.sum()
    return normalised_frequencies


def generate_matrix(files, weight_by_frequency=False):
    """
    Read files that have the following structures:
        each line contains a word followed by the frequency of the word, separated by a space
    Create a 26x26 matrix that contains the frequency of observation of each pair of letters
    """

    matrix = np.zeros((26, 26), dtype=int)

    for file in files:
        try:
            with open(file, "r") as f:
                for line in f:
                    word, frequency = line.split(" ")
                    if not WORD_PATTERN.match(word):
                        continue
                    word = word.upper()
                    for i in range(len(word) - 1):
                        matrix[
                            ord(word[i]) - ord("A"), ord(word[i + 1]) - ord("A")
                        ] += int(frequency) if weight_by_frequency else 1
                        matrix[
                            ord(word[i + 1]) - ord("A"), ord(word[i]) - ord("A")
                        ] += int(frequency) if weight_by_frequency else 1

        except FileNotFoundError:
            print(f"Warning: {file} not found")
            return

    print(matrix)

    # Normalize the matrix
    matrix = matrix / matrix.max()

    return matrix


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Count findable words in a grid.")
    parser.add_argument("--words", required=True, nargs="+", help="Path to word files")
    parser.add_argument(
        "--out_dir", required=False, default=".", help="output directory"
    )
    parser.add_argument(
        "--weight_by_frequency",
        action="store_true",
        help="Weight edges by word frequency",
    )

    args = parser.parse_args()

    files = args.words

    frequencies = generate_letter_frequency(
        files, weight_by_frequency=args.weight_by_frequency
    )
    matrix = generate_matrix(files, weight_by_frequency=args.weight_by_frequency)

    print(frequencies)
    np.save(f"{args.out_dir}/letter_frequencies.npy", frequencies)

    # print the matrix
    print(matrix)

    # save the matrix to a file
    np.save(f"{args.out_dir}/adjacency_matrix.npy", matrix)
