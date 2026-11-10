# 🚀 Agha Reza! - SEO & SERP Analyzer

A powerful Chrome Extension (Manifest V3) designed for SEOs, content creators, and marketers. **Agha Reza!** digs deep into Google's top search results, extracts heading structures, and runs a comprehensive Natural Language Processing (NLP) analysis to reveal exactly what top-ranking competitors are doing.

## ✨ Features

*   **Top 15 SERP Extraction:** Automatically fetches the top 15 unique organic results from Google (optimized for Persian/Iranian geo-targeting, but works universally).
*   **Heading Structure Analysis:** Groups and analyzes `H1` through `H6` tags across all competitors by their order of appearance.
*   **Advanced NLP & Semantic Analysis Engine:**
    *   **Core Semantic N-Grams:** Extracts the most frequent 2-word and 3-word phrases (Bigrams & Trigrams) to find semantic core keywords.
    *   **User Intent & Question Mining:** Scans competitor texts to find exact questions users are asking (e.g., "How much does...?", "What is...?").
    *   **Entity & Metric Extraction:** Automatically detects prices, percentages, and durations (e.g., "50 million tomans", "20%", "3 hours") per ranking page.
    *   **Semantic Gap Analysis:** Compares Rank 1-5 against Rank 11-15 to find missing keywords that top competitors use but lower competitors ignore.
*   **Automated Reporting:** Generates a clean, well-formatted `.txt` file containing all the extracted data and NLP reports, saved directly to your `Downloads/search-extract/` folder.

## 🛠️ Installation (Developer Mode)

Since this extension is currently in development and not published on the Chrome Web Store, you can install it manually:

1. **Download the files:** Clone this repository or download it as a ZIP file and extract it to a folder on your computer.
2. **Generate Icons:**
   * Open the `make-icons.html` file in your Chrome browser.
   * Click the **"Generate & Download PNGs"** button.
   * Move the 4 generated PNG files (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`) into the main extension folder (right next to `manifest.json`).
3. **Load the Extension:**
   * Open Chrome and go to `chrome://extensions/`.
   * Enable **"Developer mode"** (toggle in the top right corner).
   * Click on **"Load unpacked"** (top left).
   * Select the folder containing the extension files.

## 📖 How to Use

1. Click on the **Agha Reza!** icon in your Chrome extension bar.
2. Enter your target keyword or query in the text box (e.g., `IELTS course cost`).
3. Click **"Dig the SERP & Analyze"**.
4. The extension will open hidden background tabs to scrape Google and the competitor pages. You can watch the progress in the extension popup.
5. Once finished, check your `Downloads/search-extract/` folder. You will find a `.txt` file named with your query, date, and time.

## ⚠️ Important Notes

*   **Google Captcha:** Because the extension performs automated scraping, Google might occasionally trigger a captcha or block the requests if used too rapidly. If this happens, the extension will notify you in the status bar. Wait a few minutes before trying again.
*   **Permissions:** The extension requires `<all_urls>` permission because it needs to visit the search result pages to extract headings and text content. No data is sent to any external servers; everything runs locally on your machine.

## 📄 License

This project is open-source. Feel free to modify and improve it!
