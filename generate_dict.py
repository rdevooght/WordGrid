import json

def generate_dictionary():
    categorized_words = {
        'common': [],
        'rare': [],
        'shiny': [],
        'legendary': []
    }
    
    # Thresholds
    LIMIT_COMMON = 2000
    LIMIT_RARE = 5000
    LIMIT_SHINY = 7000

    count_added = 0

    try:
        with open('data/google-10000-english-no-swears.txt', 'r') as f:
            for line in f:
                word = line.strip().lower()
                
                # Filter for length >= 4
                if 3 < len(word) < 16:
                    count_added += 1
                    
                    if count_added <= LIMIT_COMMON:
                        categorized_words['common'].append(word)
                    elif count_added <= LIMIT_RARE:
                        categorized_words['rare'].append(word)
                    elif count_added <= LIMIT_SHINY:
                        categorized_words['shiny'].append(word)
                    else:
                        categorized_words['legendary'].append(word)
                    
    except FileNotFoundError:
        print("Warning: google-10000-english-no-swears.txt not found")
        return

    # Sort alphabetically within categories
    for cat in categorized_words:
        categorized_words[cat].sort()

    total_words = sum(len(l) for l in categorized_words.values())
    print(f"Total words: {total_words}")
    
    # Print stats
    stats = {k: len(v) for k, v in categorized_words.items()}
    print("Category breakdown:", stats)

    # Write JS file
    js_content = f"const GAME_DICTIONARY = {json.dumps(categorized_words)};"
    
    with open('dictionary.js', 'w') as f:
        f.write(js_content)
    print("dictionary.js created")

if __name__ == '__main__':
    generate_dictionary()
