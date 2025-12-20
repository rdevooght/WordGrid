import copy
import json
import random
import re
import sys

import numpy as np

from solve_grid import parse_dictionary, solve_grid

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
LETTER_FREQ = np.load("data/letter_frequencies.npy")
ADJ_MATRIX = np.load("data/adjacency_matrix.npy")


def apply_gravity(grid, path, filler=-1):
    """
    Removes the cells in path from grid and shifts down.
    Returns a new grid.
    """
    width = len(grid)
    height = len(grid[0])
    new_grid = copy.deepcopy(grid)

    path_set = set(path)

    for x in range(width):
        # Filter out removed items
        new_col = []
        for y in range(height):
            if (x, y) not in path_set:
                new_col.append(grid[x][y])

        # Fill Top with filler
        missing = height - len(new_col)
        for _ in range(missing):
            new_col.append(filler)

        new_grid[x] = new_col

    return new_grid


def convert_2Dgrid_to_list_of_strings(grid):
    """
    Converts a column-major 2D grid to a list of strings.
    in the 2D grid, y=0 corresponds to the bottom row, but in the list of strings, the first string is the top row.

    ex:
        [[A, B, C, D],
        [E, F, G, H],
        [I, J, K, L]]
        -> [
            'DHL',
            'CGK',
            'BFJ',
            'AEI'
        ]
    """
    height = len(grid[0])
    rows = [[] for _ in range(height)]

    for col in grid:
        for y, item in enumerate(col):
            rows[height - y - 1].append(item)

    return ["".join(row) for row in rows]


def print_grid(grid):
    for y in range(len(grid[0]))[::-1]:
        for x in range(len(grid)):
            print(grid[x][y] if grid[x][y] != -1 else ".", end="")
        print()


class WordPlacer:
    def __init__(self, width, visible_height, words, full_height=None, debug=False):
        """
        The full height is gives the total height of the grid, including the hidden rows.
        the visible height is the height of the grid that is visible to the user.
        Words can only be found in the visible height, but letters can be placed in the full height, as they might become visible later.
        """
        self.width = width
        self.visible_height = visible_height
        self.full_height = full_height or visible_height * 2
        self.words = [w.upper() for w in words]
        self.debug = debug
        self.letters = "EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUDDDDGGGGBBCCMMPPFFHHVVWWYYKJXQZ"

    def place_words(self):
        """
        Generates a grid where words can be found in sequence.
        Returns grid in 2D array format or None if failed.
        Only the letters for the words are placed, all other cells are filled with -1
        """
        # Schema tracks the visual cell -> original cell mapping.
        # -1 means the cell is filled from "future" random drops (unusable).
        # We start with a full grid of usable slots.
        # stored as col-major list of lists: schema[x][y]
        # where y=0 is Bottom (visual), y=Height-1 is TOP.
        initial_schema = [
            [(x, y) for y in range(self.full_height)] for x in range(self.width)
        ]

        # Current assignment: {(x,y): letter}
        assignment = {}

        if self._solve(0, initial_schema, assignment):
            return self._finalize_grid(assignment)
        return None

    def _solve(self, word_idx, schema, assignment, attempts=10):
        if word_idx >= len(self.words):
            return True

        word = self.words[word_idx]
        if self.debug:
            print(f"Trying to place '{word}' (Word {word_idx + 1}/{len(self.words)})")

        for i in range(attempts):
            if self.debug:
                print(f"Attempt {i + 1}/{attempts}")

            # Find a valid path for this word in the current schema
            po_pc = self._find_path(word, schema, assignment)

            if po_pc is None:
                continue

            path_orig, path_vis = po_pc

            # 1. Tentative Assignment
            newly_assigned = []
            possible = True

            for (sx, sy), letter in zip(path_orig, word):
                if (sx, sy) not in assignment:
                    assignment[(sx, sy)] = letter
                    newly_assigned.append((sx, sy))
                else:
                    possible = False
                    break

            if not possible:
                # Revert and try next path
                for pt in newly_assigned:
                    del assignment[pt]
                continue

            # 2. Apply gravity to the schema
            next_schema = apply_gravity(schema, path_vis)

            # 3. Recurse
            if self._solve(word_idx + 1, next_schema, assignment, attempts=attempts):
                return True

            # 4. Backtrack
            for pt in newly_assigned:
                del assignment[pt]

        return False

    def _find_path(self, word, schema, assignment):
        """
        Returns a random path as a list of (original_x, original_y).
        """

        # Find potential start nodes (visual coords)
        start_nodes = [
            (x, y)
            for x in range(self.width)
            for y in range(self.visible_height)
            if schema[x][y] != -1
        ]
        random.shuffle(start_nodes)

        # Loop over start nodes until a path is found
        for x, y in start_nodes:
            ox_oy = schema[x][y]
            if ox_oy == -1:
                continue  # Unusable

            ox, oy = ox_oy
            # Check if cell is available
            if (ox, oy) in assignment:
                continue

            # Find a path from that starting cell
            if po_pc := self._dfs(
                x, y, word, 1, [(ox, oy)], [(x, y)], schema, assignment
            ):
                return po_pc

    def _dfs(
        self,
        vx,
        vy,
        word,
        idx,
        current_path_orig,  # path in the original grid
        current_path_vis,  # path in the current grid
        schema,
        assignment,
    ):
        """
        Depth-first search to find a path from the starting cell.
        The exploration order is randomised to avoid finding the same path each time.
        """
        if idx == len(word):
            return current_path_orig, current_path_vis

        # Create a list of all 8 directions in a random order
        directions = [
            (dx, dy) for dx in [-1, 0, 1] for dy in [-1, 0, 1] if dx != 0 or dy != 0
        ]
        random.shuffle(directions)

        # Neighbors
        for dx, dy in directions:
            nx, ny = vx + dx, vy + dy

            # Check if within bounds
            if not (0 <= nx < self.width and 0 <= ny < self.visible_height):
                continue

            # Check if visited in this path
            if (nx, ny) in current_path_vis:
                continue

            ox_oy = schema[nx][ny]

            # Check it's one of the original cells
            if ox_oy == -1:
                continue

            ox, oy = ox_oy

            # Check cell is available
            if (ox, oy) in assignment:
                continue

            # Recurse
            current_path_orig.append((ox, oy))
            current_path_vis.append((nx, ny))
            if po_pc := self._dfs(
                nx,
                ny,
                word,
                idx + 1,
                current_path_orig,
                current_path_vis,
                schema,
                assignment,
            ):
                return po_pc
            current_path_orig.pop()
            current_path_vis.pop()

        # If no path found, return None
        return None

    def _finalize_grid(self, assignment):
        """
        Takes the assignement and returns a grid as an 2D array.
        Unassigned cells are filled with -1.
        """
        grid = [[-1] * self.full_height for _ in range(self.width)]

        for x in range(self.width):
            for y in range(self.full_height):
                if (x, y) in assignment:
                    grid[x][y] = assignment[(x, y)]

        return grid


class Verifier:
    def __init__(self, visible_height, words, final_grid):
        self.width = len(final_grid)
        self.full_height = len(final_grid[0])
        self.visible_height = visible_height
        self.words = [w.upper() for w in words]
        self.grid = final_grid  # 2D array, col-major

    def verify(self):
        # Make a copy of the grid
        current_grid = copy.deepcopy(self.grid)
        remaining_words = self.words.copy()
        return self._check(current_grid, remaining_words)

    def _check(self, grid, remaining_words):
        if len(remaining_words) == 0:
            return True

        # Find all possible paths available from that grid
        all_paths = []
        for word in remaining_words:
            if paths := self._find_all_paths(grid, word):
                all_paths.extend([(word, path) for path in paths])

        if not all_paths:
            print(
                f"Verification Failed: Could not find any of the remaining words: {', '.join(remaining_words)}"
            )
            return False

        # Try all possible paths and ensure none lead to dead ends
        for word, path in all_paths:
            next_grid = apply_gravity(grid, path)
            remaining_words.remove(word)
            if not self._check(next_grid, remaining_words):
                print(
                    f"Dead end detected: Picking '{word}' at {path} makes future impossible."
                )
                return False
            remaining_words.append(word)

        return True

    def _find_all_paths(self, grid, word):
        paths = []
        for x in range(self.width):
            for y in range(self.visible_height):
                if grid[x][y] == word[0]:
                    self._dfs_char(x, y, word, 1, [(x, y)], paths, grid)
        return paths

    def _dfs_char(self, vx, vy, word, idx, current_path, all_paths, grid):
        if idx == len(word):
            all_paths.append(list(current_path))
            return

        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue
                nx, ny = vx + dx, vy + dy

                if 0 <= nx < self.width and 0 <= ny < self.visible_height:
                    if (nx, ny) in current_path:
                        continue
                    if grid[nx][ny] != word[idx]:
                        continue

                    current_path.append((nx, ny))
                    self._dfs_char(nx, ny, word, idx + 1, current_path, all_paths, grid)
                    current_path.pop()


class GridFiller:
    def __init__(self, grid, alpha=0.5, beta=1.5, debug=False):
        self.grid = copy.deepcopy(grid)
        self.width = len(grid)
        self.height = len(grid[0])
        self.debug = debug
        self.is_letter = re.compile(r"[A-Z]")
        self.current_frequency = np.zeros(len(ALPHABET))
        self.compute_frequency()
        self.alpha = alpha
        self.beta = beta

    def compute_frequency(self):
        for x in range(self.width):
            for y in range(self.height):
                if isinstance(self.grid[x][y], str) and self.is_letter.match(
                    self.grid[x][y]
                ):
                    self.current_frequency[ord(self.grid[x][y]) - ord("A")] += 1

    def get_neighbours(self, x, y):
        neighbours = np.zeros(len(ALPHABET))
        for dx, dy in [
            (-1, 0),
            (1, 0),
            (0, -1),
            (0, 1),
            (1, 1),
            (-1, -1),
            (1, -1),
            (-1, 1),
        ]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < self.width and 0 <= ny < self.height:
                if isinstance(self.grid[nx][ny], str) and self.is_letter.match(
                    self.grid[nx][ny]
                ):
                    neighbours[ord(self.grid[nx][ny]) - ord("A")] += 1
        return neighbours

    def fill_cell(self, x, y):
        neighbours = self.get_neighbours(x, y)

        correction = np.maximum(
            LETTER_FREQ - self.current_frequency / self.current_frequency.sum(), 0
        )

        weights = LETTER_FREQ + self.alpha * correction

        if neighbours.sum() != 0:
            # Existing neighbours -> use adjacency matrix to affect weights
            neighbours_weights = np.dot(neighbours, ADJ_MATRIX)
            weights += self.beta * neighbours_weights

        new_letter = random.choices(ALPHABET, weights=weights)[0]
        self.grid[x][y] = new_letter
        self.current_frequency[ord(new_letter) - ord("A")] += 1

    def fill_grid(self):
        for x in range(self.width):
            for y in range(self.height):
                if not isinstance(self.grid[x][y], str) or not self.is_letter.match(
                    self.grid[x][y]
                ):
                    self.fill_cell(x, y)
        return self.grid


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 grid-maker.py <theme-json-file> <dictionary-file>")
        sys.exit(1)

    theme_file = sys.argv[1]
    dict_file = sys.argv[2]

    try:
        with open(theme_file, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File {theme_file} not found.")
        sys.exit(1)

    try:
        dictionary_words = parse_dictionary(dict_file)
        print(f"Loaded {len(dictionary_words)} words from dictionary.")
    except FileNotFoundError:
        print(f"Error: File {dict_file} not found.")
        sys.exit(1)

    words = data.get("theme-words", [])
    grid_size = data.get("grid-size", [6, 8])  # width, height
    width, height = grid_size

    n_letters = sum(len(word) for word in words)

    print(f"Generating grid for '{data.get('name')}'...")
    print(f"Words: {words} ({n_letters} letters)")
    print(f"Size: {width}x{height} ({width * height} cells)")

    if n_letters > width * height * 2:
        print(
            f"Error: Not enough cells ({width * height * 2}) for all words ({n_letters})"
        )
        sys.exit(1)

    # Generate
    # Retry loop to find the best grid
    max_placement_retries = 100
    max_fill_retries = 100
    max_solves = 100

    solves = 0
    best_score = -1
    best_grid_strings = None

    print(
        f"Starting generation with {max_placement_retries} attempts to maximize findable words..."
    )

    for i in range(max_placement_retries):
        if solves >= max_solves:
            break

        generator = WordPlacer(width, height, words)
        grid_placement = generator.place_words()

        if grid_placement:
            # Verify that the grid with only the letters for the words is valid
            verifier = Verifier(height, words, grid_placement)
            if verifier.verify():
                for j in range(max_fill_retries):
                    # Try to fill the grid
                    filler = GridFiller(grid_placement)
                    full_grid = filler.fill_grid()

                    # Verify the full grid
                    verifier = Verifier(height, words, full_grid)
                    if verifier.verify():
                        grid_strings = convert_2Dgrid_to_list_of_strings(full_grid)
                        found_words = solve_grid(grid_strings, dictionary_words)
                        score = len(found_words)

                        if score > best_score:
                            best_score = score
                            best_grid_strings = grid_strings
                            print(
                                f"New best score: {score} words (Grid {i + 1}, Fill {j + 1}, Solve {solves + 1})"
                            )

                        solves += 1

                        if solves >= max_solves:
                            print(f"Max solves reached ({max_solves})")
                            break

    if best_grid_strings is None:
        print("Failed to generate a valid grid after max retries.")
        sys.exit(1)

    print(f"Final Result: Selected grid with {best_score} findable words.")

    data["grid"] = best_grid_strings
    with open(theme_file, "w") as f:
        # Write pretty JSON
        json.dump(data, f, indent=4)
    sys.exit(0)


if __name__ == "__main__":
    main()
