// bait-live-game.js
// Requires: <script src="https://unpkg.com/@supabase/supabase-js@2"></script> in your HTML

// ----------------------------
// SUPABASE CONFIG (EDIT THESE)
// ----------------------------
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ----------------------------
// DEMO CONTENT (swap later)
// ----------------------------
const DEMO = {
  question: "🔥 HOT TAKE: Pineapple on pizza is...",
  ruleWords: 5,
  options: [
    { id: "crime", label: "A crime against humanity 🚫" },
    { id: "delicious", label: "Actually delicious 🍕" },
    { id: "depends", label: "Depends on the mood 🤷" },
  ],
  selectedOption: null,
};

function questionKeyToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const QUESTION_KEY = questionKeyToday();
const LS_VOTE_KEY = `bait_vote_${QUESTION_KEY}`;

// ----------------------------
// Timer
// ----------------------------
const demoTimerEl = document.getElementById("demo-timer");
function msToHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function nextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}
function tickTimer() {
  const now = new Date();
  demoTimerEl.textContent = `Ends in ${msToHMS(nextMidnight() - now)}`;
}
tickTimer();
setInterval(tickTimer, 1000);

// ----------------------------
// DOM refs
// ----------------------------
const elOptions = document.getElementById("demo-options");
const elName = document.getElementById("demo-name");
const elReason = document.getElementById("demo-reason");
const elError = document.getElementById("demo-error");
const elSubmit = document.getElementById("demo-submit");
const elBars = document.getElementById("demo-bars");
const elReasons = document.getElementById("demo-reasons");
const elQuestion = document.getElementById("demo-question");
const elResults = document.getElementById("demo-results");
const elResultMsg = document.getElementById("demo-result-msg");
const elYouVoted = document.getElementById("demo-youvoted");

elQuestion.textContent = DEMO.question;

function setError(msg) {
  if (!msg) {
    elError.classList.add("hidden");
    elError.textContent = "";
    return;
  }
  elError.classList.remove("hidden");
  elError.textContent = msg;
}
function wordCount(s) {
  const t = (s || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ----------------------------
// UI
// ----------------------------
function renderOptions() {
  elOptions.innerHTML = "";
  DEMO.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className =
      "w-full text-left bg-black/30 border border-white/10 rounded-xl px-4 py-4 font-bold text-white hover:border-bait-gold transition flex items-center justify-between";
    btn.innerHTML = `<span>${opt.label}</span><span class="text-xs text-gray-400">Select</span>`;
    btn.addEventListener("click", () => {
      DEMO.selectedOption = opt.id;
      [...elOptions.children].forEach((child) =>
        child.classList.remove("ring-2", "ring-bait-gold")
      );
      btn.classList.add("ring-2", "ring-bait-gold");
      setError("");
    });
    elOptions.appendChild(btn);
  });

  if (window.lucide) lucide.createIcons();
}

function renderBars(counts) {
  elBars.innerHTML = "";
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  DEMO.options.forEach((opt) => {
    const v = counts[opt.id] || 0;
    const pct = total === 0 ? 0 : Math.round((v / total) * 100);

    const row = document.createElement("div");
    row.className = "space-y-2";
    row.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-sm font-bold text-white">${opt.label}</span>
        <span class="text-sm font-bold text-bait-gold">${pct}%</span>
      </div>
      <div class="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/10">
        <div class="h-full bg-gradient-to-r from-bait-red to-bait-orange" style="width:${pct}%"></div>
      </div>
      <div class="text-xs font-bold text-gray-400">${v} vote${v === 1 ? "" : "s"}</div>
    `;
    elBars.appendChild(row);
  });
}

// ----------------------------
// DATA
// ----------------------------
async function fetchAggregates() {
  const { data: votes, error } = await sb
    .from("bait_votes")
    .select("id, option_id, name, reason, created_at")
    .eq("question_key", QUESTION_KEY)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const counts = {};
  DEMO.options.forEach((o) => (counts[o.id] = 0));
  votes.forEach((v) => {
    counts[v.option_id] = (counts[v.option_id] || 0) + 1;
  });

  return { votes, counts };
}

async function fetchReactionsForVotes(voteIds) {
  if (!voteIds.length) return new Map();

  const { data, error } = await sb
    .from("bait_reason_reactions")
    .select("vote_id, agree, disagree")
    .in("vote_id", voteIds);

  if (error) throw error;

  const map = new Map();
  data.forEach((r) => map.set(r.vote_id, r));
  return map;
}

async function renderReasons(votes) {
  elReasons.innerHTML = "";

  const withReasons = votes.filter((v) => (v.reason || "").trim().length > 0);
  const voteIds = withReasons.map((v) => v.id);
  const reactionsMap = await fetchReactionsForVotes(voteIds);

  const enriched = withReasons
    .map((v) => {
      const rx = reactionsMap.get(v.id) || { agree: 0, disagree: 0 };
      return {
        ...v,
        agree: rx.agree,
        disagree: rx.disagree,
        score: rx.agree - rx.disagree,
      };
    })
    .sort((a, b) => b.score - a.score);

  enriched.slice(0, 6).forEach((v) => {
    const card = document.createElement("div");
    card.className = "bg-black/30 border border-white/10 rounded-xl p-4";

    const optLabel = DEMO.options.find((o) => o.id === v.option_id)?.label || "Answer";

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs text-gray-400 font-bold mb-1">${escapeHtml(v.name)} • <span class="text-bait-gold">${optLabel}</span></p>
          <p class="text-white font-bold">${escapeHtml(v.reason)}</p>
        </div>
        <div class="flex gap-2">
          <button data-action="agree" class="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs font-bold hover:border-bait-gold transition">
            👍 <span>${v.agree}</span>
          </button>
          <button data-action="disagree" class="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-xs font-bold hover:border-bait-red transition">
            👎 <span>${v.disagree}</span>
          </button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="agree"]').addEventListener("click", async () => {
      await incrementReaction(v.id, "agree");
    });
    card.querySelector('[data-action="disagree"]').addEventListener("click", async () => {
      await incrementReaction(v.id, "disagree");
    });

    elReasons.appendChild(card);
  });
}

async function refreshUI() {
  try {
    const { votes, counts } = await fetchAggregates();
    elResults.classList.remove("hidden");
    renderBars(counts);
    await renderReasons(votes);
  } catch (e) {
    console.error(e);
    setError("Couldn’t load live results. Check Supabase setup.");
  }
}

async function incrementReaction(voteId, field) {
  const { data: row, error: readErr } = await sb
    .from("bait_reason_reactions")
    .select("id, agree, disagree")
    .eq("vote_id", voteId)
    .maybeSingle();

  if (readErr) return console.error(readErr);
  if (!row) return;

  const next = {};
  next[field] = (row[field] || 0) + 1;

  const { error: upErr } = await sb
    .from("bait_reason_reactions")
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  if (upErr) console.error(upErr);
  await refreshUI();
}

// ----------------------------
// SUBMIT
// ----------------------------
function lockInputsAsVoted() {
  elSubmit.disabled = true;
  elSubmit.classList.add("opacity-60", "cursor-not-allowed");
  elName.disabled = true;
  elReason.disabled = true;
  elYouVoted.classList.remove("hidden");
}

async function submitVote() {
  if (localStorage.getItem(LS_VOTE_KEY)) return;

  const name = (elName.value || "").trim();
  const reason = (elReason.value || "").trim();

  if (!DEMO.selectedOption) return setError("Pick an answer first.");
  if (!name) return setError("Add a display name.");
  if (reason && wordCount(reason) !== DEMO.ruleWords)
    return setError(`Your reason must be exactly ${DEMO.ruleWords} words.`);

  setError("");

  const { data: inserted, error } = await sb
    .from("bait_votes")
    .insert([
      {
        question_key: QUESTION_KEY,
        option_id: DEMO.selectedOption,
        name,
        reason: reason || null,
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.error(error);
    return setError("Vote failed. Try again.");
  }

  const { error: rxErr } = await sb
    .from("bait_reason_reactions")
    .insert([{ vote_id: inserted.id, agree: 0, disagree: 0 }]);

  if (rxErr) console.error(rxErr);

  localStorage.setItem(LS_VOTE_KEY, inserted.id);

  elResultMsg.textContent = "✅ Vote submitted. Live results updating…";
  lockInputsAsVoted();
  await refreshUI();
}

elSubmit.addEventListener("click", submitVote);

// ----------------------------
// REALTIME
// ----------------------------
function startRealtime() {
  const channel = sb.channel(`bait-live-${QUESTION_KEY}`);

  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "bait_votes", filter: `question_key=eq.${QUESTION_KEY}` },
    () => refreshUI()
  );

  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "bait_reason_reactions" },
    () => refreshUI()
  );

  channel.subscribe();
}

// ----------------------------
// INIT
// ----------------------------
(async function init() {
  renderOptions();

  if (localStorage.getItem(LS_VOTE_KEY)) {
    lockInputsAsVoted();
    elResultMsg.textContent = "✅ You already voted today. Results update live.";
  }

  await refreshUI();
  startRealtime();
})();
