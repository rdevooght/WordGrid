import argparse
import json
import sys


class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end_of_word = False


class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for char in word:
            if char not in node.children:
                node.children[char] = TrieNode()
            node = node.children[char]
        node.is_end_of_word = True

    def search_prefix(self, prefix):
        node = self.root
        for char in prefix:
            if char not in node.children:
                return None
            node = node.children[char]
        return node


def parse_theme(theme_path):
    with open(theme_path, "r") as f:
        return json.load(f)


def parse_dictionary(dict_path):
    with open(dict_path, "r") as f:
        content = f.read()

    # Remove "const GAME_DICTIONARY = " prefix and trailing ";"
    prefix = "const GAME_DICTIONARY = "
    if content.startswith(prefix):
        content = content[len(prefix) :]

    content = content.strip()
    if content.endswith(";"):
        content = content[:-1]

    data = json.loads(content)

    words = set()
    for category in data.values():
        for word in category:
            words.add(word.lower())
    return list(words)


def solve_grid(grid, words):
    rows = len(grid)
    cols = len(grid[0])
    found_words = set()

    trie = Trie()
    for word in words:
        trie.insert(word)

    # 8 directions: N, NE, E, SE, S, SW, W, NW
    directions = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]

    visited = set()

    def dfs(r, c, current_node, current_word):
        if current_node.is_end_of_word:
            found_words.add(current_word)

        visited.add((r, c))

        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in visited:
                char = grid[nr][nc].lower()
                if char in current_node.children:
                    dfs(nr, nc, current_node.children[char], current_word + char)

        visited.remove((r, c))

    for r in range(rows):
        for c in range(cols):
            start_char = grid[r][c].lower()
            if start_char in trie.root.children:
                dfs(r, c, trie.root.children[start_char], start_char)

    return found_words


def main():
    parser = argparse.ArgumentParser(description="Count findable words in a grid.")
    parser.add_argument("--theme", required=True, help="Path to the theme JSON file")
    parser.add_argument("--dict", required=True, help="Path to the dictionary JS file")

    args = parser.parse_args()

    try:
        theme = parse_theme(args.theme)
        grid = theme["grid"]
        # The grid in json might be strings, need to ensure it's characters.
        # Example json showed: "grid": ["ROW1", "ROW2"...] which is fine for direct indexing grid[r][c]

        words = parse_dictionary(args.dict)
        print(f"Loaded {len(words)} unique words from dictionary.")

        found = solve_grid(grid, words)

        print(f"Total found words: {len(found)}")

        # Stats
        stats = {}
        for w in found:
            n = len(w)
            stats[n] = stats.get(n, 0) + 1

        print("Stats by word length:")
        for length in sorted(stats.keys()):
            print(f"  {length} letters: {stats[length]}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
