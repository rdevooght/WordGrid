import json
import random
import sys


class GridGenerator:
    def __init__(self, width, height, words, debug=False):
        self.width = width
        self.height = height
        self.words = [w.lower() for w in words]
        self.debug = debug
        self.letters = "EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUDDDDGGGGBBCCMMPPFFHHVVWWYYKJXQZ"

    def generate(self):
        """
        Generates a grid where words can be found in sequence.
        Returns flattened string of grid or None if failed.
        """
        # Schema tracks the visual cell -> original cell mapping.
        # -1 means the cell is filled from "future" random drops (unusable).
        # We start with a full grid of usable slots.
        # stored as col-major list of lists: schema[x][y]
        # where y=0 is TOP (visual), y=Height-1 is BOTTOM.
        initial_schema = [
            [(x, y) for y in range(self.height)] for x in range(self.width)
        ]

        # Current assignment: {(x,y): letter}
        assignment = {}

        if self._solve(0, initial_schema, assignment):
            return self._finalize_grid(assignment)
        return None

    def _solve(self, word_idx, schema, assignment):
        if word_idx >= len(self.words):
            return True

        word = self.words[word_idx]
        if self.debug:
            print(f"Trying to place '{word}' (Word {word_idx + 1}/{len(self.words)})")

        # Find all valid paths for this word in the current schema
        paths = self._find_paths(word, schema, assignment)

        # Shuffle paths to get random solutions
        random.shuffle(paths)

        for path in paths:
            # 1. Tentative Assignment
            newly_assigned = []
            possible = True

            for (sx, sy), letter in zip(path, word):
                if (sx, sy) not in assignment:
                    assignment[(sx, sy)] = letter
                    newly_assigned.append((sx, sy))
                elif assignment[(sx, sy)] != letter:
                    possible = False
                    break

            if not possible:
                # Revert and try next path
                for pt in newly_assigned:
                    del assignment[pt]
                continue

            # 2. Simulate Gravity (Transition)
            # Remove the used cells from schema
            # Path contains original coords (sx, sy).
            # We need to find where they are in CURRENT schema to remove them.
            # Actually, `_find_paths` returns Original Coords.
            # To simulate gravity, we need to know which VISUAL slots were removed.

            # Let's map Original->Visual in current schema
            # visual_refs = []
            # for ox, oy in path:
            #     found = False
            #     for vx in range(self.width):
            #         for vy in range(self.height):
            #             if schema[vx][vy] == (ox, oy):
            #                 visual_refs.append((vx, vy))
            #                 found = True
            #                 break
            #     if not found:
            #         # Should not happen if path finding logic is correct
            #         possible = False
            #         break

            # if not possible:
            #    ... revert ...

            next_schema = self._apply_gravity(schema, path)

            # 3. Recurse
            if self._solve(word_idx + 1, next_schema, assignment):
                return True

            # 4. Backtrack
            for pt in newly_assigned:
                del assignment[pt]

        return False

    def _find_paths(self, word, schema, assignment):
        """
        Returns list of paths. Each path is a list of (original_x, original_y).
        """
        paths = []

        # Find start nodes (visual coords)
        for x in range(self.width):
            for y in range(self.height):
                ox_oy = schema[x][y]
                if ox_oy == -1:
                    continue  # Unusable

                ox, oy = ox_oy
                # Check if matches first letter
                if (ox, oy) in assignment and assignment[(ox, oy)] != word[0]:
                    continue

                # Start DFS
                self._dfs(
                    x, y, word, 1, [(ox, oy)], [(x, y)], paths, schema, assignment
                )

        return paths

    def _dfs(
        self,
        vx,
        vy,
        word,
        idx,
        current_path_orig,
        current_path_vis,
        all_paths,
        schema,
        assignment,
    ):
        if idx == len(word):
            all_paths.append(list(current_path_orig))
            return

        target_char = word[idx]

        # Neighbors
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue
                nx, ny = vx + dx, vy + dy

                if 0 <= nx < self.width and 0 <= ny < self.height:
                    # Check if visited in this path
                    if (nx, ny) in current_path_vis:
                        continue

                    ox_oy = schema[nx][ny]
                    if ox_oy == -1:
                        continue

                    ox, oy = ox_oy

                    # Check constraints
                    if (ox, oy) in assignment and assignment[(ox, oy)] != target_char:
                        continue

                    # Recurse
                    current_path_orig.append((ox, oy))
                    current_path_vis.append((nx, ny))
                    self._dfs(
                        nx,
                        ny,
                        word,
                        idx + 1,
                        current_path_orig,
                        current_path_vis,
                        all_paths,
                        schema,
                        assignment,
                    )
                    current_path_orig.pop()
                    current_path_vis.pop()

    def _apply_gravity(self, schema, path_orig):
        """
        Removes the cells in path_orig from schema and shifts down.
        Returns a new schema.
        """
        new_schema = [col[:] for col in schema]  # Deep copy of list structure

        path_set = set(path_orig)

        for x in range(self.width):
            # Filter out removed items
            col = new_schema[x]
            new_col = [item for item in col if item not in path_set]

            # Fill Top (index 0) with -1
            missing = self.height - len(new_col)
            for _ in range(missing):
                new_col.insert(0, -1)

            new_schema[x] = new_col

        return new_schema

    def _finalize_grid(self, assignment):
        """
        Fills empty spots with random letters and returns rows.
        """
        grid_rows = []
        for y in range(self.height):
            row = ""
            for x in range(self.width):
                if (x, y) in assignment:
                    row += assignment[(x, y)].upper()
                else:
                    # Random letter based on frequency
                    row += random.choice(self.letters)
            grid_rows.append(row)
        return grid_rows


class Verifier:
    def __init__(self, width, height, words, final_grid):
        self.width = width
        self.height = height
        self.words = [w.lower() for w in words]
        self.grid = final_grid  # List of strings

    def verify(self):
        # Convert grid to schema-like structure with actual letters
        # current_grid[x][y] = char
        current_grid = [
            [self.grid[y][x].lower() for y in range(self.height)]
            for x in range(self.width)
        ]

        return self._check(0, current_grid)

    def _check(self, word_idx, grid):
        if word_idx >= len(self.words):
            return True

        word = self.words[word_idx]

        # Find all occurrences
        paths = self._find_all_paths(grid, word)

        if not paths:
            print(f"Verification Failed: Could not find '{word}' at step {word_idx}")
            return False

        # For "No Dead End", we should ensure ANY valid pick allows proceeding?
        # Or at least ONE?
        # "always possible" usually means "a solution exists".
        # But "no dead-end" implies "User cannot get stuck if they play correctly".
        # If there are multiple APPLEs, and one kills the solution, that is a "trap" / "dead-end".
        # So we must ensure that ALL valid paths for Word_i allow solving Word_{i+1}...

        # Optimization: If paths is unique, we are good (check next).
        # If multiple, verify ALL.

        for path in paths:
            next_grid = self._apply_gravity_char(grid, path)
            if not self._check(word_idx + 1, next_grid):
                print(
                    f"Dead end detected: Picking '{word}' at {path} makes future impossible."
                )
                return False

        return True

    def _find_all_paths(self, grid, word):
        paths = []
        for x in range(self.width):
            for y in range(self.height):
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

                if 0 <= nx < self.width and 0 <= ny < self.height:
                    if (nx, ny) in current_path:
                        continue
                    if grid[nx][ny] == "?":
                        continue  # empty/unusable
                    if grid[nx][ny] != word[idx]:
                        continue

                    current_path.append((nx, ny))
                    self._dfs_char(nx, ny, word, idx + 1, current_path, all_paths, grid)
                    current_path.pop()

    def _apply_gravity_char(self, grid, path):
        new_grid = [col[:] for col in grid]
        path_set = set(path)

        for x in range(self.width):
            col = new_grid[x]
            # remove used
            new_col = []
            for y in range(self.height):
                if (x, y) not in path_set:
                    new_col.append(col[y])

            # pad top with '?' (randoms are unknown/unusable for logic)
            missing = self.height - len(new_col)
            for _ in range(missing):
                new_col.insert(0, "?")

            new_grid[x] = new_col
        return new_grid


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 grid-maker.py <theme-json-file>")
        sys.exit(1)

    theme_file = sys.argv[1]

    try:
        with open(theme_file, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File {theme_file} not found.")
        sys.exit(1)

    words = data.get("theme-words", [])
    grid_size = data.get("grid-size", [6, 8])  # width, height
    width, height = grid_size

    print(f"Generating grid for '{data.get('name')}'...")
    print(f"Words: {words}")
    print(f"Size: {width}x{height}")

    # Generate
    # Retry loop if strict verification fails
    max_retries = 100
    for i in range(max_retries):
        generator = GridGenerator(width, height, words)
        grid_rows = generator.generate()

        if grid_rows:
            # Verify
            verifier = Verifier(width, height, words, grid_rows)
            if verifier.verify():
                print(f"Success! Grid generated (Attempt {i + 1})")
                data["grid"] = grid_rows

                with open(theme_file, "w") as f:
                    # Write pretty JSON
                    json.dump(data, f, indent=4)
                sys.exit(0)
            else:
                print(f"Verification failed on attempt {i + 1}. Retrying...")
        else:
            print(f"Generation blocked on attempt {i + 1}.")

    print("Failed to generate a valid grid after max retries.")
    sys.exit(1)


if __name__ == "__main__":
    main()
