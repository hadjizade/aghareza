document.getElementById('query').value = '';

const $ = (id) => document.getElementById(id);

$("go").addEventListener("click", async () => {
  const query = $("query").value.trim();
  if (!query) { $("status").textContent = "Please enter a query."; return; }
  $("go").disabled = true;
  $("status").textContent = "Agha Reza is working...";
  try {
    await chrome.runtime.sendMessage({ type: "start", query });
  } catch (e) {
    $("status").textContent = "Error: " + e.message;
  }
  poll();
});

async function poll() {
  try {
    const st = await chrome.runtime.sendMessage({ type: "state" });
    if (st && st.message) $("status").textContent = st.message;
    if (st && !st.running) { $("go").disabled = false; return; }
  } catch {}
  setTimeout(poll, 800);
}