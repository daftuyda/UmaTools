# Uma Event Helper (Web)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/daftuyda/Uma-Event-Helper-Web)

## Overview

Uma Event Helper is a browser-based tool to assist with Uma Musume event choices. It:

- Captures the game window using browser screen capture.
- Uses Tesseract.js for OCR to read event titles.
- Looks up events via a FastAPI backend.
- Scores and recommends options based on stats, energy, hints, and statuses.

---

## Usage

This app includes multiple pages. Use the top navigation or visit the routes directly.

### Events (Event Helper)

1. **Open the app** in your browser.
2. Click **Capture Screen for OCR** and select your game window.
3. Adjust **Scan Time** for OCR frequency (CPU vs. responsiveness).
4. Enter or OCR an event name to search.
5. The app displays event options, scores them, and recommends the best choice.
   - If multiple options tie, no recommendation badge is shown.
   - Labeled options are preferred over unlabeled duplicates.

### Support Hints (Support Hint Finder)

1. Type a skill hint and press **Add** (or Enter) to add it to your filter.
2. Choose **Match ALL (AND)** or **Match ANY (OR)**.
3. Filter by rarity (SSR/SR/R).
4. Results update as you add or remove hint chips.
5. Use **Clear** to reset.

### Umadle (Daily Guessing Game)

1. Select an Uma from the list and submit a guess.
2. Compare stats and hints in the grid to narrow the answer.
3. The legend shows whether your guess is lower or higher for each stat.
4. When you win, start a new Uma or keep the board.

### Randomizer

**Support Deck Randomizer**
1. Filter by rarity and optionally enable **2A- speed**.
2. Exclude supports from the list to avoid repeats.
3. Click **Roll 5** to generate a deck; clear exclusions if needed.

**Random Uma**
1. Optionally enable **2A- speed**.
2. Click **Pick Random Uma**.

### Optimizer (Skill Optimizer + Rating Calculator)

1. Set your **Skill Points Budget** and optional **Fast Learner** discount.
2. Configure track, distance, and strategy aptitudes.
3. Use **Generate Build** to auto-pick skills for selected targets.
4. Add/edit skill rows; results update with best score and points used.
5. Use **Copy Build** or **Load Build** to share or restore builds.
6. Enter final stats in the **Rating Calculator** to project the final rating.

---

## Acknowledgements

- Project initially inspired by [Kisegami's Event Helper](https://github.com/Kisegami/Uma-Event-Helper)
- Resources and Data from [GameTora](https://gametora.com)

## Local Development

- **Install dependencies**  
  Make sure you have Node.js and the [Vercel CLI](https://vercel.com/download) installed:

  ```bash
   npm i -g vercel
  ```

- **Clone the repo**
  
  ```bash
  git clone https://github.com/daftuyda/Uma-Event-Helper-Web.git
  cd Uma-Event-Helper-Web
  ```

- **Run with Vercel**
  
  ```bash
  vercel dev --debug
  ```

---

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).
