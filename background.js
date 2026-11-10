const GOOGLE_PARAMS = {
  hl: "fa",
  gl: "ir",
  udm: "14",
  pws: "0",
  nfpr: "1",
  uule: "w+CAIQICIDFRlaHJhbixJcmFu"
};

const TARGET_RESULTS = 15;
const CONCURRENCY = 3;
const TAB_READY_TIMEOUT_MS = 12000;
const POST_LOAD_WAIT_MS = 600;

// لیست کلمات بی‌ارزش فارسی برای فیلتر کردن (Stop-words)
const STOP_WORDS = new Set(["و", "در", "به", "از", "که", "این", "را", "با", "است", "برای", "آن", "یک", "شود", "شده", "خود", "ها", "های", "می", "تا", "هم", "کنید", "کند", "بود", "دارد", "اما", "یا", "اگر", "بر", "ما", "شما", "او", "آنها", "ما", "شما", "کرد", "کردن", "هست", "نیز", "بین", "دو", "هر", "چه", "چی", "کدام"]);

let state = { running: false, message: "" };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "start") {
    if (state.running) { sendResponse({ ok: false, message: "Agha Reza is already working!" }); return true; }
    runJob(msg.query);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "state") { sendResponse({ ...state }); return true; }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

chrome.runtime.onStartup.addListener(() => { state = { running: false, message: "" }; chrome.action.setBadgeText({ text: "" }); });
chrome.runtime.onInstalled.addListener(() => { state = { running: false, message: "" }; chrome.action.setBadgeText({ text: "" }); });

function buildGoogleSearchUrl(query, start = 0) {
  const p = new URLSearchParams({ q: query, start: String(start), ...GOOGLE_PARAMS });
  return "https://www.google.com/search?" + p.toString();
}

async function runJob(query) {
  state = { running: true, message: "Agha Reza is searching Google..." };
  setBadge("...", "#f0b400");

  try {
    let allUrls = new Set();

    state.message = "Extracting results 1 to 10 from Google...";
    const page1 = await fetchGooglePage(query, 0);
    page1.forEach(url => allUrls.add(url));
    
    if (allUrls.size < TARGET_RESULTS) {
      state.message = "Extracting results 11 to 20 from Google...";
      await sleep(1000);
      const page2 = await fetchGooglePage(query, 10);
      page2.forEach(url => allUrls.add(url));
    }

    if (allUrls.size < TARGET_RESULTS) {
      state.message = "Extracting results 21 to 30 from Google...";
      await sleep(1000);
      const page3 = await fetchGooglePage(query, 20);
      page3.forEach(url => allUrls.add(url));
    }

    const extractedList = Array.from(allUrls).slice(0, TARGET_RESULTS);

    if (!extractedList.length) {
      throw new Error("No results found. Did Google show a captcha?");
    }

    state.message = `Extracting content & analyzing NLP for ${extractedList.length} pages...`;
    const finalItems = extractedList.map((url, i) => ({ url, source: `Rank ${i + 1}` }));
    const results = await extractAllParallel(finalItems, CONCURRENCY);

    // --- NLP & SEMANTIC ANALYSIS ENGINE ---
    state.message = "Running NLP & Semantic Analysis...";
    const semanticReport = analyzeSemantics(results);

    // Build output file
    const parts = [];
    const dateStr = new Date().toISOString();
    
    parts.push("---");
    parts.push("TOOL: Agha Reza!");
    parts.push(`QUERY: "${query}"`);
    parts.push(`TIMESTAMP: ${dateStr}`);
    parts.push(`TOTAL_RESULTS: ${results.length}`);
    parts.push("---\n");

    parts.push("# RANKING OVERVIEW");
    results.forEach((r, i) => {
      parts.push(`${i + 1}. [${r.status}] ${r.url}`);
    });
    parts.push("\n");

    // Insert Semantic Report
    parts.push(semanticReport);
    parts.push("\n");

    parts.push("# HEADING STRUCTURE ANALYSIS");
    parts.push("This section groups headings by their order of appearance across all search results.\n");
    const maxHeadings = Math.max(...results.map(r => (r.headings || []).length), 0);
    if (maxHeadings > 0) {
      for (let hIdx = 0; hIdx < maxHeadings; hIdx++) {
        parts.push(`## Heading Position #${hIdx + 1}`);
        let foundAny = false;
        for (let rIdx = 0; rIdx < results.length; rIdx++) {
          const r = results[rIdx];
          if (r.headings && r.headings[hIdx]) {
            parts.push(`- **[Rank ${rIdx + 1}]** ${r.headings[hIdx]}`);
            foundAny = true;
          }
        }
        if (foundAny) parts.push("");
      }
      parts.push("\n");
    }

    parts.push("# PAGE CONTENTS\n");
    const failures = [];
    for (const r of results) {
      if (r.status !== "OK") failures.push({ url: r.url, status: r.status });
      parts.push(`## [${r.source}] ${r.url}`);
      parts.push(`**Status:** ${r.status}`);
      parts.push("**Content:**");
      parts.push("```text");
      parts.push(r.text);
      parts.push("```\n");
    }

    if (failures.length) {
      parts.push("# FAILURE SUMMARY");
      for (const f of failures) parts.push(`- [${f.status}] ${f.url}`);
    }

    const all = parts.join("\n");
    state.message = "Downloading file...";
    await downloadAsFile(all, query);
    
    state = {
      running: false,
      message: `Done. Extracted ${results.length} pages with NLP analysis.`
    };
    setBadge("✓", "#34a853");
    setTimeout(() => setBadge(""), 5000);

  } catch (e) {
    state = { running: false, message: "Error: " + e.message };
    setBadge("!", "#ea4335");
    console.error(e);
  }
}

// ==========================================
// NLP & SEMANTIC ANALYSIS FUNCTIONS
// ==========================================
function analyzeSemantics(results) {
  let allText = "";
  let top5Text = "";
  let bottom5Text = "";
  let allQuestions = new Set();
  let metrics = {};

  results.forEach((r, index) => {
    if (r.status !== "OK" || !r.text) return;
    
    const text = r.text;
    allText += " " + text;

    // Gap Analysis Prep (Top 5 vs Bottom 5)
    if (index < 5) top5Text += " " + text;
    if (index >= results.length - 5) bottom5Text += " " + text;

    // 1. Question Mining (Intent)
    const sentences = text.split(/[.?!؟\n]+/);
    sentences.forEach(s => {
      s = s.trim();
      if (s.length > 10 && s.length < 150) {
        if (s.includes("?") || s.includes("؟") || /^(چرا|چگونه|چطور|آیا|چیست|کدام|چه زمانی|کجا)/.test(s)) {
          allQuestions.add(s);
        }
      }
    });

    // 2. Entity & Metric Extraction (Numbers, Prices, Percentages)
    const priceMatches = text.match(/(\d[\d,\.]*\s*(میلیون|هزار|تومان|دلار|درصد|٪|%|ساعت|جلسه|ترم))/gi);
    if (priceMatches) {
      metrics[`Rank ${index + 1}`] = [...new Set(priceMatches)].slice(0, 10); // Top 10 metrics per page
    }
  });

  // 3. Semantic Core Extraction (N-Grams)
  const words = allText.replace(/[.,!?؟:;()«»\n\r]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  
  const bigrams = {};
  const trigrams = {};

  for (let i = 0; i < words.length - 1; i++) {
    const b = words[i] + " " + words[i+1];
    bigrams[b] = (bigrams[b] || 0) + 1;
    if (i < words.length - 2) {
      const t = words[i] + " " + words[i+1] + " " + words[i+2];
      trigrams[t] = (trigrams[t] || 0) + 1;
    }
  }

  const topBigrams = Object.entries(bigrams).sort((a,b) => b[1] - a[1]).slice(0, 15);
  const topTrigrams = Object.entries(trigrams).sort((a,b) => b[1] - a[1]).slice(0, 10);

  // 4. Semantic Gap Analysis (What top 5 have that bottom 5 lack)
  const top5Words = new Set(top5Text.replace(/[.,!?؟:;()«»\n\r]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)));
  const bottom5Words = new Set(bottom5Text.replace(/[.!?؟:;()«»\n\r]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)));
  
  const gapWords = [];
  top5Words.forEach(w => {
    if (!bottom5Words.has(w)) gapWords.push(w);
  });

  // --- Build the Markdown Report ---
  let report = "# NLP & SEMANTIC ANALYSIS\n\n";

  report += "## 1. Core Semantic N-Grams (Top Keywords & Phrases)\n";
  report += "These are the most frequent phrase combinations across all top 15 competitors. Use these to optimize your semantic density.\n";
  report += "### Top 2-Word Phrases (Bigrams):\n";
  topBigrams.forEach(([phrase, count]) => { report += `- **${phrase}** (${count} times)\n`; });
  
  report += "\n### Top 3-Word Phrases (Trigrams):\n";
  topTrigrams.forEach(([phrase, count]) => { report += `- **${phrase}** (${count} times)\n`; });

  report += "\n## 2. User Intent & Questions Mined\n";
  report += "Here are the exact questions competitors are answering, extracted from the text. This is what the user is searching for.\n";
  Array.from(allQuestions).slice(0, 20).forEach(q => { report += `- "${q}"\n`; });

  report += "\n## 3. Entity & Metric Extraction (Prices, Numbers, Time)\n";
  report += "Key metrics and numbers extracted per competitor. Great for comparing prices and durations.\n";
  for (const [rank, list] of Object.entries(metrics)) {
    report += `**${rank}:** ${list.join(" | ")}\n`;
  }

  report += "\n## 4. Semantic Gap Analysis (Top 5 vs Bottom 5)\n";
  report += "These are words used heavily by Rank 1-5 but completely ignored by Rank 11-15. These are your competitive advantages.\n";
  report += `**Missing Keywords (Used by Top 5, absent in Bottom 5):**\n`;
  report += gapWords.slice(0, 30).join(", ");

  return report;
}

// ==========================================
// CRAWLER & SCRAPER FUNCTIONS
// ==========================================

async function fetchGooglePage(query, start) {
  const searchUrl = buildGoogleSearchUrl(query, start);
  const tab = await chrome.tabs.create({ url: searchUrl, active: false });
  try {
    await waitForTabReady(tab.id, 20000);
    await sleep(1000);

    for (let attempt = 0; attempt < 3; attempt++) {
      const info = await chrome.tabs.get(tab.id);
      if (info.url && info.url.includes("consent.google")) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: clickConsentButton });
        await sleep(2000);
        await waitForTabReady(tab.id, 12000);
      } else break;
    }

    const [check] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: location.href,
        hasResults: !!document.querySelector("#search, #rso, #main"),
        isCaptcha: location.href.includes("sorry.google") || !!document.querySelector("#captcha-form"),
        isError: location.href.startsWith("chrome-error://")
      })
    });
    const c = check && check.result;
    if (!c) throw new Error("Could not inspect Google page.");
    if (c.isError) throw new Error("Google tab hit an error page.");
    if (c.isCaptcha) throw new Error("Google showed a captcha.");
    if (!c.hasResults) throw new Error("Google results structure not found.");

    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractGoogleResults
    });
    return (inj && inj.result) || [];
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch {}
  }
}

function clickConsentButton() {
  const buttons = Array.from(document.querySelectorAll("button"));
  for (const b of buttons) {
    const t = (b.innerText || "").toLowerCase();
    if (t.includes("accept all") || t.includes("reject all")) { b.click(); return true; }
  }
  return false;
}

function extractGoogleResults() {
  const seen = new Set();
  const urls = [];
  const skipHost = /(^|\.)(google\.[a-z.]+|googleusercontent\.com|gstatic\.com|googleadservices\.com|doubleclick\.net|accounts\.google\.com|policies\.google\.com|support\.google\.com|youtube\.com|youtu\.be)$/i;
  
  const anchors = document.querySelectorAll("a[href]");
  for (const a of anchors) {
    if (!a.closest("#search, #rso, #main")) continue;
    let href = a.href;
    if (!href || !href.startsWith("http")) continue;
    
    try {
      const u = new URL(href);
      if (u.pathname === "/url" && /(^|\.)google\./.test(u.hostname)) {
        const real = u.searchParams.get("q") || u.searchParams.get("url");
        if (real) href = real;
      }
    } catch {}
    
    try {
      const u = new URL(href);
      if (skipHost.test(u.hostname)) continue;
    } catch { continue; }
    
    if ((a.innerText || "").trim().length < 8) continue;
    
    let cleanHref = href.split('#')[0]; 
    
    if (seen.has(cleanHref)) continue;
    seen.add(cleanHref);
    urls.push(cleanHref);
    
    if (urls.length >= 15) break; 
  }
  return urls;
}

async function extractAllParallel(items, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      const { url, source } = items[i];
      let text = "";
      let headings = [];
      let status = "OK";
      
      try {
        const data = await extractFromUrl(url);
        text = data.text;
        headings = data.headings;
        
        if (!text) { status = "EMPTY"; text = "[EMPTY]"; }
        else if (text.startsWith("[NETWORK_ERROR")) { status = "NETWORK"; }
        else if (text.startsWith("[PAGE_ERROR")) { status = "PAGE_ERROR"; }
        else if (text.startsWith("[LOW_CONTENT")) { status = "LOW"; }
        else if (text.startsWith("[LOGIN_WALL")) { status = "LOGIN"; }
      } catch (e) {
        status = "ERROR";
        text = "[ERROR: " + e.message + "]";
      }
      
      results[i] = { url, source, text, headings, status };
      done++;
      state.message = `Extracting ${done}/${items.length} ...`;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function extractFromUrl(url) {
  if (/\.(pdf|zip|docx?|xlsx?|pptx?|png|jpe?g|gif|svg|webp|mp4|mp3)(\?|$)/i.test(url)) {
    return { text: "[SKIPPED: non-HTML]", headings: [] };
  }

  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabReady(tab.id, TAB_READY_TIMEOUT_MS);
    await sleep(POST_LOAD_WAIT_MS);

    let info;
    try { info = await chrome.tabs.get(tab.id); } catch {}
    if (info && info.url && info.url.startsWith("chrome-error://")) {
      return { text: "[NETWORK_ERROR]", headings: [] };
    }

    let inj;
    try {
      [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractMainContent
      });
    } catch (e) {
      if (/error page|Cannot access|showing error|Frame with ID/i.test(e.message)) {
        return { text: "[PAGE_ERROR]", headings: [] };
      }
      throw e;
    }

    const data = inj && inj.result;
    let text = cleanupText(data.text || "");
    let headings = data.headings || [];

    if (!text) return { text: "[LOGIN_WALL or EMPTY]", headings };
    if (text.length < 200) return { text: "[LOW_CONTENT " + text.length + " chars]\n" + text, headings };
    return { text, headings };
  } finally {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch {} }
  }
}

function cleanupText(t) {
  return t
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractMainContent() {
  const clean = (el) => {
    if (!el) return "";
    const c = el.cloneNode(true);
    c.querySelectorAll("script,style,noscript,nav,footer,aside,header,form,iframe,svg,canvas,button,input,select,textarea,[aria-hidden=true],[role=navigation],[role=banner],[role=contentinfo]").forEach(n => n.remove());
    return (c.innerText || c.textContent || "").trim();
  };
  
  let targetEl = null;
  const sels = ["article", "main", "[role=main]", "#content", ".content", ".post-content", ".entry-content", ".article-body"];
  
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && clean(el).length >= 300) {
      targetEl = el;
      break;
    }
  }
  
  if (!targetEl) targetEl = document.body;

  const headings = [];
  const headingEls = targetEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headingEls.forEach(h => {
    const txt = (h.innerText || h.textContent || "").trim().replace(/\s+/g, ' ');
    if (txt.length > 2 && txt.length < 150) {
      headings.push(txt);
    }
  });

  const bodyText = clean(targetEl);
  const text = bodyText.split(/\n{2,}/).filter(p => p.trim().length > 40).join("\n\n").slice(0, 200000);

  return { text, headings };
}

function waitForTabReady(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return resolve();
        if (!tab) return resolve();
        if (tab.status === "complete") return resolve();
        if (Date.now() - start > timeoutMs) return resolve();
        setTimeout(tick, 250);
      });
    };
    tick();
  });
}

async function downloadAsFile(text, query) {
  const now = new Date();
  const year = now.getFullYear();
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthName = monthNames[now.getMonth()];
  const day = now.getDate(); 
  const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = daysOfWeek[now.getDay()];
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const hash = Math.random().toString(36).substring(2, 6); 

  const safeQuery = query.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "result";
  
  const filename = `search-extract/SERP-query_${safeQuery}-${monthName}-${day}-${year}-${dayName}-${hours}-${minutes}-${hash}.txt`;
  
  const MAX = 1_400_000;
  let body = text;
  if (body.length > MAX) body = body.slice(0, MAX) + "\n\n[TRUNCATED]";
  
  const dataUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(body);
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
}