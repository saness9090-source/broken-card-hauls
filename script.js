const API = "https://api.scryfall.com";
const storeKey = "brokenCardHauls_v1";

// Paste your Supabase Project URL and Publishable key here.
// Never put a sb_secret_ key or your database password in browser code.
const SUPABASE_URL = "https://wnbgyjiftqhehhmfqmit.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RFIUTjjbp4Y3pLoMb_CzlA_Ps3uNpPJ";

const supabaseReady = !!window.supabase &&
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_");

const supabaseClient = supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
let currentUser = null;
let cloudSaveTimer = null;
let data = loadData(),
  activeTab = "discover",
  currentResults = [];
function loadData() {
  try {
    return Object.assign(
      { collection: [], wishlist: [], trades: [] },
      JSON.parse(localStorage.getItem(storeKey) || "{}"),
    );
  } catch (e) {
    return { collection: [], wishlist: [], trades: [] };
  }
}
function save() {
  localStorage.setItem(storeKey, JSON.stringify(data));
  updateStats();
  scheduleCloudSave();
}
function setAuthMessage(message, kind = "") {
  const el = document.getElementById("authMessage");
  if (el) { el.textContent = message; el.className = "status " + kind; }
}
function setAccountStatus(message, connected = false) {
  const el = document.getElementById("accountStatus");
  if (el) { el.textContent = message; el.classList.toggle("connected", connected); }
}
function scheduleCloudSave() {
  if (!currentUser || !supabaseClient) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    try {
      const { error } = await supabaseClient.from("collector_data").upsert({
        user_id: currentUser.id, data, updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (error) throw error;
      setAuthMessage("Your spellbook is synced to the cloud.", "ok");
    } catch (error) {
      setAuthMessage("Cloud save failed: " + (error.message || "Check your database setup."), "error");
    }
  }, 600);
}
async function loadCloudData(user) {
  const { data: row, error } = await supabaseClient.from("collector_data")
    .select("data").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (row && row.data && Array.isArray(row.data.collection) &&
      Array.isArray(row.data.wishlist) && Array.isArray(row.data.trades)) {
    data = row.data;
    localStorage.setItem(storeKey, JSON.stringify(data));
  } else {
    const { error: saveError } = await supabaseClient.from("collector_data").upsert({
      user_id: user.id, data, updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (saveError) throw saveError;
  }
  render();
}
async function refreshAuthUI(user) {
  currentUser = user || null;
  const form = document.getElementById("authForm");
  const signOutBtn = document.getElementById("signOutBtn");
  const signInBtn = document.getElementById("signInBtn");
  const signUpBtn = document.getElementById("signUpBtn");
  if (currentUser) {
    setAccountStatus("Signed in: " + (currentUser.email || "collector"), true);
    signOutBtn.classList.remove("hidden");
    signInBtn.classList.add("hidden"); signUpBtn.classList.add("hidden");
    form.querySelectorAll("label").forEach(label => label.classList.add("hidden"));
    try { await loadCloudData(currentUser); setAuthMessage("Signed in. Your spellbook is ready.", "ok"); }
    catch (error) { setAuthMessage("Signed in, but couldn't load cloud data: " + (error.message || "Check table setup."), "error"); }
  } else {
    setAccountStatus(supabaseClient ? "Not signed in" : "Needs setup");
    signOutBtn.classList.add("hidden");
    signInBtn.classList.remove("hidden"); signUpBtn.classList.remove("hidden");
    form.querySelectorAll("label").forEach(label => label.classList.remove("hidden"));
  }
}
async function initAuth() {
  const form = document.getElementById("authForm");
  const signUpBtn = document.getElementById("signUpBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  if (!supabaseClient) {
    setAccountStatus("Needs setup");
    setAuthMessage("Add your Supabase Project URL and Publishable key in script.js, then run supabase-setup.sql in Supabase.", "error");
    return;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    setAuthMessage("Signing in…");
    const { data: result, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return setAuthMessage(error.message, "error");
    await refreshAuthUI(result.user);
  });
  signUpBtn.addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    if (!email || !password) return setAuthMessage("Enter an email and password first.", "error");
    if (password.length < 6) return setAuthMessage("Use a password with at least 6 characters.", "error");
    setAuthMessage("Creating your account…");
    const { data: result, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return setAuthMessage(error.message, "error");
    if (result.session) await refreshAuthUI(result.user);
    else setAuthMessage("Account created/requested. Check your email to confirm it, then sign in.", "ok");
  });
  signOutBtn.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) return setAuthMessage(error.message, "error");
    currentUser = null;
    setAccountStatus("Not signed in");
    form.querySelectorAll("label").forEach(label => label.classList.remove("hidden"));
    document.getElementById("signInBtn").classList.remove("hidden");
    signUpBtn.classList.remove("hidden"); signOutBtn.classList.add("hidden");
    setAuthMessage("Signed out. This browser's local spellbook remains available.", "ok");
  });
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) setAuthMessage(sessionError.message, "error");
  await refreshAuthUI(sessionData?.session?.user || null);
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => refreshAuthUI(session?.user || null), 0);
  });
}
function money(v) {
  return typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";
}
function cardPrice(c) {
  const p = c.prices || {};
  return Number(p.usd || p.usd_foil || p.usd_etched || 0) || 0;
}
function imageFor(c) {
  return c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || "";
}
function facePrice(c) {
  let p = c.prices || {};
  return p.usd || p.usd_foil || p.usd_etched || null;
}
function updateStats() {
  document.getElementById("ownedCount").textContent = data.collection.reduce(
    (n, x) => n + (+x.qty || 1),
    0,
  );
  document.getElementById("ownedValue").textContent = money(
    data.collection.reduce((n, x) => n + (+x.qty || 1) * cardPrice(x.card), 0),
  );
  document.getElementById("wishCount").textContent = data.wishlist.length;
  document.getElementById("tradeCount").textContent = data.trades.reduce(
    (n, x) => n + (+x.qty || 1),
    0,
  );
}
function setStatus(msg, kind = "") {
  let el = document.getElementById("searchStatus");
  el.textContent = msg;
  el.className = "status " + kind;
}
function escapeHtml(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
function has(list, id) {
  return list.some((x) => x.card.id === id);
}
function add(list, c) {
  let item = list.find((x) => x.card.id === c.id);
  if (item) item.qty = (+item.qty || 1) + 1;
  else list.push({ card: c, qty: 1 });
  save();
  render();
}
function remove(list, id) {
  let i = list.findIndex((x) => x.card.id === id);
  if (i >= 0) list.splice(i, 1);
  save();
  render();
}
function moveCard(from, to, id) {
  let item = from.find((x) => x.card.id === id);
  if (!item) {
    return;
  }
  if (!to.some((x) => x.card.id === id)) to.push({ ...item });
  if (from === data.trades) {
  }
  save();
  render();
}
function cardTile(c) {
  const img = imageFor(c),
    p = facePrice(c),
    owned = has(data.collection, c.id),
    wished = has(data.wishlist, c.id),
    trade = has(data.trades, c.id);
  return `<article class="card">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(c.name)} card image" loading="lazy">` : `<div class="no-art">${escapeHtml(c.name)}</div>`}<div class="cardbody"><h4>${escapeHtml(c.name)}</h4><div class="meta">${escapeHtml(c.set_name || "Unknown set")} · ${escapeHtml(c.rarity || "unknown")}${c.foil ? " · foil" : ""}</div><div class="price">${p ? money(Number(p)) : "Price unavailable"}</div><div class="card-actions"><button data-action="own" data-id="${c.id}">${owned ? "Add another copy" : "＋ Add to collection"}</button><button class="secondary" data-action="wish" data-id="${c.id}">${wished ? "✓ Wishlisted" : "♡ Wishlist"}</button><button class="ghost" data-action="trade" data-id="${c.id}">${trade ? "✓ In trade binder" : "⇄ Mark for trade"}</button></div></div></article>`;
}
function rowTile(item, listName) {
  let c = item.card,
    img = imageFor(c);
  let trade = data.trades.some((x) => x.card.id === c.id),
    wish = data.wishlist.some((x) => x.card.id === c.id);
  return `<div class="collection-row">${img ? `<img class="thumb" src="${escapeHtml(img)}" alt="" loading="lazy">` : `<div class="thumb"></div>`}<div class="row-main"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.set_name || "Unknown set")} · Qty ${item.qty || 1}${c.foil ? " · foil" : ""}</small><div class="row-actions">${listName !== "collection" ? `<button class="ghost" data-action="own" data-id="${c.id}">＋ Own it</button>` : ""}${listName !== "trades" ? `<button class="ghost" data-action="trade" data-id="${c.id}">${trade ? "In trade binder" : "Mark trade"}</button>` : ""}${listName !== "wishlist" ? `<button class="ghost" data-action="wish" data-id="${c.id}">${wish ? "Wishlisted" : "Wishlist"}</button>` : ""}<button class="ghost" data-action="remove" data-list="${listName}" data-id="${c.id}">Remove</button></div></div><div class="row-price">${money(cardPrice(c) * (+item.qty || 1))}</div></div>`;
}
function render() {
  updateStats();
  const el = document.getElementById("content"),
    title = document.getElementById("viewTitle"),
    sub = document.getElementById("viewSub");
  document
    .querySelectorAll(".tab")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
  if (activeTab === "discover") {
    title.textContent = "Discover cards";
    sub.textContent =
      "Search for a card, then add the exact printing you want.";
    el.innerHTML = currentResults.length
      ? `<div class="results">${currentResults.map(cardTile).join("")}</div>`
      : `<div class="empty"><b>Welcome to your spellbook</b>Search for a card above to discover printings and prices.<br><br>Try <button class="ghost" data-search="Sol Ring">Sol Ring</button> <button class="ghost" data-search="The One Ring">The One Ring</button> <button class="ghost" data-search="Charizard">Nope, that's Pokémon ✦</button></div>`;
  } else {
    let list =
      activeTab === "collection"
        ? data.collection
        : activeTab === "wishlist"
          ? data.wishlist
          : data.trades;
    title.textContent =
      activeTab === "collection"
        ? "My Collection"
        : activeTab === "wishlist"
          ? "Wishlist"
          : "Trade Binder";
    sub.textContent =
      activeTab === "collection"
        ? "Your owned cards and estimated value."
        : activeTab === "wishlist"
          ? "Cards you are hunting for."
          : "Cards you have marked as available to discuss trading.";
    el.innerHTML = list.length
      ? list.map((x) => rowTile(x, activeTab)).join("")
      : `<div class="empty"><b>${activeTab === "collection" ? "Your vault is waiting." : activeTab === "wishlist" ? "Your next chase begins here." : "Your trade binder is empty."}</b>Head to Discover and add some cards to get started.</div>`;
  }
}
async function searchCards(q) {
  if (!q.trim()) {
    setStatus("Type a card name to search.");
    return;
  }
  setStatus("Consulting the archive…");
  document.getElementById("searchBtn").disabled = true;
  try {
    const url =
      API +
      "/cards/search?order=name&unique=prints&q=" +
      encodeURIComponent('name:"' + q.trim().replace(/"/g, "") + '"');
    let res = await fetch(url);
    let json = await res.json();
    if (!res.ok)
      throw new Error(
        json.details || "No matching cards found. Try a shorter name.",
      );
    currentResults = json.data.slice(0, 30);
    activeTab = "discover";
    render();
    setStatus(
      `Found ${json.total_cards} printing${json.total_cards === 1 ? "" : "s"}; showing up to 30.`,
      "ok",
    );
  } catch (e) {
    currentResults = [];
    activeTab = "discover";
    render();
    setStatus(
      e.message ||
        "Could not reach Scryfall. Check your connection and try again.",
      "error",
    );
  } finally {
    document.getElementById("searchBtn").disabled = false;
  }
}
document
  .getElementById("searchBtn")
  .addEventListener("click", () =>
    searchCards(document.getElementById("searchInput").value),
  );
document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchCards(e.target.value);
});
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => {
    activeTab = b.dataset.tab;
    render();
  }),
);
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.search) {
    document.getElementById("searchInput").value = b.dataset.search;
    searchCards(b.dataset.search);
    return;
  }
  let a = b.dataset.action,
    id = b.dataset.id;
  if (!a || !id) return;
  let c =
    currentResults.find((x) => x.id === id) ||
    [...data.collection, ...data.wishlist, ...data.trades].find(
      (x) => x.card.id === id,
    )?.card;
  if (a === "own" && c) {
    add(data.collection, c);
  } else if (a === "wish" && c) {
    has(data.wishlist, id) ? remove(data.wishlist, id) : add(data.wishlist, c);
  } else if (a === "trade" && c) {
    has(data.trades, id) ? remove(data.trades, id) : add(data.trades, c);
  } else if (a === "remove") {
    let list = data[b.dataset.list];
    if (list) remove(list, id);
  }
});
document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "broken-card-hauls-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
document
  .getElementById("importBtn")
  .addEventListener("click", () =>
    document.getElementById("importFile").click(),
  );
document.getElementById("importFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const x = JSON.parse(await f.text());
    if (
      !Array.isArray(x.collection) ||
      !Array.isArray(x.wishlist) ||
      !Array.isArray(x.trades)
    )
      throw Error("That file does not look like a Broken Card Hauls backup.");
    data = x;
    save();
    render();
    setStatus("Backup imported successfully.", "ok");
  } catch (err) {
    setStatus(err.message, "error");
  }
  e.target.value = "";
});
save();
render();
initAuth();

