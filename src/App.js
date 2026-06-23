import React, { useState, useEffect, useRef } from "react";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, setDoc, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc, deleteDoc, getDoc, getDocs
} from "firebase/firestore";

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_LABELS = { work:"Work", health:"Health & fitness", personal:"Personal", learn:"Learning" };
const CAT_COLORS = { work:"#7F77DD", health:"#1D9E75", personal:"#D85A30", learn:"#378ADD" };
const BAR_COLORS = ["#7F77DD","#1D9E75","#D85A30","#378ADD"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function CaterpillarIcon({ size = 22 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 44 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8"  cy="18" r="7" fill="#66BB6A"/>
      <circle cx="18" cy="16" r="7" fill="#4CAF50"/>
      <circle cx="28" cy="16" r="7" fill="#66BB6A"/>
      <circle cx="38" cy="18" r="6" fill="#4CAF50"/>
      <line x1="5"  y1="11" x2="2"  y2="4" stroke="#388E3C" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="11" y1="11" x2="14" y2="4" stroke="#388E3C" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="2"  cy="4" r="1.5" fill="#388E3C"/>
      <circle cx="14" cy="4" r="1.5" fill="#388E3C"/>
      <circle cx="5.5"  cy="17" r="1.6" fill="white"/>
      <circle cx="10.5" cy="17" r="1.6" fill="white"/>
      <circle cx="6"    cy="17" r="0.8" fill="#1a1a1a"/>
      <circle cx="11"   cy="17" r="0.8" fill="#1a1a1a"/>
      <path d="M7 20 Q8.5 22 10 20" stroke="#388E3C" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <line x1="16" y1="22" x2="15" y2="26" stroke="#388E3C" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="20" y1="22" x2="21" y2="26" stroke="#388E3C" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="26" y1="22" x2="25" y2="26" stroke="#388E3C" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="30" y1="22" x2="31" y2="26" stroke="#388E3C" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function ButterflyIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 18 C14 10,2 6,2 14 C2 22,12 24,20 22" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
      <path d="M20 18 C14 22,4 26,6 32 C8 36,16 32,20 24" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
      <path d="M20 18 C26 10,38 6,38 14 C38 22,28 24,20 22" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
      <path d="M20 18 C26 22,36 26,34 32 C32 36,24 32,20 24" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
      <ellipse cx="20" cy="20" rx="1.8" ry="7" fill="#1a1a1a"/>
      <path d="M19 13 C17 8,13 5,12 3" stroke="#1a1a1a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M21 13 C23 8,27 5,28 3" stroke="#1a1a1a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <circle cx="12" cy="3" r="1.5" fill="#1a1a1a"/>
      <circle cx="28" cy="3" r="1.5" fill="#1a1a1a"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function isWeekPerfect(dayDataMap, year, month, sundayDate) {
  for (let i = 6; i >= 0; i--) {
    const d = new Date(year, month, sundayDate - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const data = dayDataMap[key];
    if (!data || data.done < data.total || data.total === 0) return false;
  }
  return true;
}

function getInitials(name = "") {
  return name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) || "?";
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  const [view, setView]                   = useState("schedule");
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [blocks, setBlocks]               = useState([]);
  const [members, setMembers]             = useState([]);
  const [memberBlocks, setMemberBlocks]   = useState({});
  const [dayDataMap, setDayDataMap]       = useState({});
  const [memberNotes, setMemberNotes]     = useState({});
  const [myNote, setMyNote]               = useState("");
  const [myNoteDraft, setMyNoteDraft]     = useState("");
  const [noteOpenId, setNoteOpenId]       = useState(null);
  const [toast, setToast]                 = useState("");
  const [editingId, setEditingId]         = useState(null);
  const [editDraft, setEditDraft]         = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [newTitle, setNewTitle]           = useState("");
  const [newTime, setNewTime]             = useState("");
  const [newCat, setNewCat]               = useState("work");
  const [newNote, setNewNote]             = useState("");
  const [calMonth, setCalMonth]           = useState(new Date().getMonth());
  const [calYear, setCalYear]             = useState(new Date().getFullYear());
  const [selectedCalDay, setSelectedCalDay] = useState(null);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [selectedDayBlocks, setSelectedDayBlocks] = useState([]);
  const toastTimer = useRef(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        await setDoc(doc(db, "members", u.uid), {
          name: u.displayName,
          photo: u.photoURL,
          uid: u.uid,
          lastSeen: serverTimestamp(),
        }, { merge: true });
        // Load my saved note
        const noteDoc = await getDoc(doc(db, "notes", u.uid));
        if (noteDoc.exists()) setMyNote(noteDoc.data().text || "");
      }
    });
  }, []);

  // ── Members ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "members"), snap => {
      setMembers(snap.docs.map(d => d.data()));
    });
  }, [user]);

  // ── Today's blocks ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "days", todayKey(), "blocks"),
      orderBy("createdAt")
    );
    return onSnapshot(q, snap => {
      const b = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBlocks(b);
      const done = b.filter(x => x.done).length;
      const key = todayKey();
      setDayDataMap(prev => ({ ...prev, [key]: { total: b.length, done } }));
    });
  }, [user]);

  // ── All members' blocks ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user || members.length === 0) return;
    const unsubs = members.map(m => {
      const q = query(
        collection(db, "users", m.uid, "days", todayKey(), "blocks"),
        orderBy("createdAt")
      );
      return onSnapshot(q, snap => {
        setMemberBlocks(prev => ({
          ...prev,
          [m.uid]: snap.docs.map(d => ({ id: d.id, ...d.data() })),
        }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [user, members]);

  // ── All member notes ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "notes"), snap => {
      const notes = {};
      snap.docs.forEach(d => { notes[d.id] = d.data().text || ""; });
      setMemberNotes(notes);
    });
  }, [user]);

  // ── Past day data for calendar (load on mount) ────────────────────────────

  useEffect(() => {
    if (!user) return;
    // Load last 60 days of completion summaries from Firestore
    async function loadPastDays() {
      const now = new Date();
      const newMap = {};
      for (let i = 1; i <= 60; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().split("T")[0];
        // Try to read a summary doc first (written by your app on day completion)
        // Falls back to counting blocks directly for recent days
        try {
          const summaryRef = doc(db, "users", user.uid, "daySummaries", key);
          const summarySnap = await getDoc(summaryRef);
          if (summarySnap.exists()) {
            newMap[key] = summarySnap.data();
          } else {
            // Fallback: count actual blocks
            const blocksSnap = await getDocs(
              collection(db, "users", user.uid, "days", key, "blocks")
            );
            const allBlocks = blocksSnap.docs.map(d => d.data());
            if (allBlocks.length > 0) {
              const total = allBlocks.length;
              const done = allBlocks.filter(b => b.done).length;
              newMap[key] = { total, done };
            }
          }
        } catch (e) {
          // skip
        }
      }
      setDayDataMap(prev => ({ ...newMap, ...prev }));
    }
    loadPastDays();
  }, [user]);

  // ── Save day summary whenever blocks change ───────────────────────────────

  useEffect(() => {
    if (!user || blocks.length === 0) return;
    const key = todayKey();
    const total = blocks.length;
    const done = blocks.filter(b => b.done).length;
    setDoc(doc(db, "users", user.uid, "daySummaries", key), { total, done }, { merge: true });
  }, [blocks, user]);

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  // ── Block CRUD ────────────────────────────────────────────────────────────

  async function addBlock() {
    if (!newTitle.trim()) return;
    const ref = doc(collection(db, "users", user.uid, "days", todayKey(), "blocks"));
    await setDoc(ref, {
      title: newTitle.trim(),
      time: newTime.trim() || "TBD",
      category: newCat,
      note: newNote.trim(),
      done: false,
      createdAt: serverTimestamp(),
    });
    setNewTitle(""); setNewTime(""); setNewNote(""); setNewCat("work");
    setShowAddModal(false);
    showToast("Block added");
  }

  async function toggleDone(block) {
    const ref = doc(db, "users", user.uid, "days", todayKey(), "blocks", block.id);
    await updateDoc(ref, { done: !block.done });
    const updated = blocks.map(b => b.id === block.id ? { ...b, done: !b.done } : b);
    const allDone = updated.length > 0 && updated.every(b => b.done);
    if (!block.done) {
      if (allDone) {
        const isWeekDone =
          new Date().getDay() === 0 &&
          isWeekPerfect(dayDataMap, calYear, calMonth, new Date().getDate());
        showToast(isWeekDone ? "🦋 Perfect week! Butterfly earned!" : "🐛 All tasks done! Caterpillar earned!");
      } else {
        showToast("⭐ +1 star — " + block.title);
      }
    } else {
      showToast("Star removed — " + block.title);
    }
  }

  function startEdit(block) {
    setEditingId(block.id);
    setEditDraft({ title: block.title, time: block.time, category: block.category, note: block.note || "" });
  }

  async function saveEdit() {
    if (!editDraft.title?.trim() || !editingId) return;
    const ref = doc(db, "users", user.uid, "days", todayKey(), "blocks", editingId);
    await updateDoc(ref, {
      title: editDraft.title.trim(),
      time: editDraft.time?.trim() || "TBD",
      category: editDraft.category,
      note: editDraft.note?.trim() || "",
    });
    setEditingId(null);
    showToast("Block updated");
  }

  function promptDelete(id) {
    setPendingDeleteId(id);
    setShowDeleteModal(true);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    await deleteDoc(doc(db, "users", user.uid, "days", todayKey(), "blocks", pendingDeleteId));
    if (editingId === pendingDeleteId) setEditingId(null);
    setPendingDeleteId(null);
    setShowDeleteModal(false);
    showToast("Block deleted");
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async function saveMyNote() {
    await setDoc(doc(db, "notes", user.uid), {
      text: myNoteDraft,
      authorName: user.displayName,
      updatedAt: serverTimestamp(),
    });
    setMyNote(myNoteDraft);
    setNoteOpenId(null);
    showToast("Note saved");
  }

  // ── Calendar day click ────────────────────────────────────────────────────

  async function selectCalDay(d, isPast) {
    if (!isPast) return;
    const date = new Date(calYear, calMonth, d);
    const key = date.toISOString().split("T")[0];
    setSelectedCalDay(d);
    const data = dayDataMap[key] || null;
    setSelectedDayData(data);
    // Load actual blocks for that day (read-only)
    try {
      const snap = await getDocs(
        collection(db, "users", user.uid, "days", key, "blocks")
      );
      setSelectedDayBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setSelectedDayBlocks([]);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const myDone  = blocks.filter(b => b.done).length;
  const myTotal = blocks.length;
  const myPct   = myTotal > 0 ? Math.round((myDone / myTotal) * 100) : 0;
  const allDoneToday = myTotal > 0 && myDone === myTotal;
  const today = new Date();

  const sortedLeaderboard = [...members].sort((a, b) => {
    const aBlocks = memberBlocks[a.uid] || [];
    const bBlocks = memberBlocks[b.uid] || [];
    const aDone = aBlocks.filter(x => x.done).length;
    const bDone = bBlocks.filter(x => x.done).length;
    const aTotal = aBlocks.length;
    const bTotal = bBlocks.length;
    const aPct = aTotal > 0 ? aDone / aTotal : 0;
    const bPct = bTotal > 0 ? bDone / bTotal : 0;
    return bPct - aPct;
  });

  // ── Calendar cells ────────────────────────────────────────────────────────

  function renderCalendarCells() {
    const firstJS  = new Date(calYear, calMonth, 1).getDay();
    const firstMon = (firstJS + 6) % 7; // Monday-first offset
    const dim      = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDim  = new Date(calYear, calMonth, 0).getDate();
    const cells    = [];

    // Padding from previous month
    for (let i = 0; i < firstMon; i++) {
      cells.push(
        <div key={"p"+i} style={{ ...styles.calCell, opacity: 0.3, background: "#f9fafb" }}>
          <span style={styles.calDayNum}>{prevDim - firstMon + 1 + i}</span>
        </div>
      );
    }

    for (let d = 1; d <= dim; d++) {
      const jsDay   = new Date(calYear, calMonth, d).getDay();
      const isSun   = jsDay === 0;
      const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
      const cellDate = new Date(calYear, calMonth, d);
      const isPast  = cellDate <= today;
      const key     = cellDate.toISOString().split("T")[0];
      const data    = dayDataMap[key];
      const allDone = data && data.total > 0 && data.done >= data.total;
      const wPerfect = isSun && isPast && isWeekPerfect(dayDataMap, calYear, calMonth, d);
      const isSelected = selectedCalDay === d;

      cells.push(
        <div
          key={d}
          onClick={() => selectCalDay(d, isPast)}
          style={{
            ...styles.calCell,
            ...(isToday    ? { outline: "2px solid #111", outlineOffset: -2 } : {}),
            ...(isSun      ? { background: "#FFFBF5" } : {}),
            ...(isSelected ? { background: "#EEEDFE" } : {}),
            cursor: isPast ? "pointer" : "default",
          }}
        >
          <span style={{
            ...styles.calDayNum,
            ...(isToday ? { background: "#111", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" } : {}),
            ...(isSun && !isToday ? { color: "#D85A30" } : {}),
          }}>
            {d}
          </span>
          {data && data.done > 0 && !allDone && isPast && (
            <span style={{ fontSize: 9, color: "#BA7517", marginTop: 2 }}>⭐{data.done}</span>
          )}
          {isPast && data && data.total > 0 && (
            <span style={{ position: "absolute", bottom: 3, right: 3, lineHeight: 1 }}>
              {wPerfect ? <ButterflyIcon size={16} /> : allDone ? <CaterpillarIcon size={18} /> : null}
            </span>
          )}
        </div>
      );
    }

    const rem = (firstMon + dim) % 7 === 0 ? 0 : 7 - ((firstMon + dim) % 7);
    for (let i = 1; i <= rem; i++) {
      cells.push(
        <div key={"r"+i} style={{ ...styles.calCell, opacity: 0.3, background: "#f9fafb" }}>
          <span style={styles.calDayNum}>{i}</span>
        </div>
      );
    }
    return cells;
  }

  // ── Loading / sign-in ─────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"system-ui,sans-serif", color:"#aaa" }}>
      Loading…
    </div>
  );

  if (!user) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:16, fontFamily:"system-ui,sans-serif", background:"#fafafa" }}>
      <CaterpillarIcon size={52} />
      <h1 style={{ fontSize:26, fontWeight:600, margin:0 }}>DaySync</h1>
      <p style={{ color:"#888", margin:0, fontSize:14 }}>Daily schedule tracker for you and your crew</p>
      <button
        onClick={() => signInWithPopup(auth, provider)}
        style={{ marginTop:8, padding:"12px 28px", borderRadius:10, border:"none", background:"#111", color:"#fff", fontSize:15, cursor:"pointer", fontFamily:"system-ui,sans-serif" }}
      >
        Sign in with Google
      </button>
    </div>
  );

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"system-ui,-apple-system,sans-serif", fontSize:14, color:"#111", background:"#fff", position:"relative" }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:"#FAEEDA", color:"#633806", border:"1px solid #FAC775", borderRadius:10, padding:"8px 18px", fontSize:13, fontWeight:500, zIndex:200, whiteSpace:"nowrap", pointerEvents:"none" }}>
          {toast}
        </div>
      )}

      {/* ── Sidebar backdrop ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.25)", zIndex:40 }}
        />
      )}

      {/* ── Slide-over sidebar ── */}
      <div style={{
        position: "fixed", top:0, left:0, bottom:0, width:220,
        background:"#fafafa", borderRight:"1px solid #eee",
        display:"flex", flexDirection:"column", zIndex:50,
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s ease",
      }}>
        {/* Logo + close */}
        <div style={{ padding:"14px 16px", borderBottom:"1px solid #eee", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:"#111", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>DaySync</div>
              <div style={{ fontSize:10, color:"#aaa" }}>{user.displayName}</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:18, color:"#aaa", lineHeight:1, padding:4 }}>×</button>
        </div>

        {/* Nav */}
        <div style={{ padding:"10px 8px", flex:1, overflowY:"auto" }}>
          <div style={{ fontSize:10, fontWeight:600, color:"#bbb", textTransform:"uppercase", letterSpacing:"0.08em", padding:"6px 10px 4px" }}>views</div>
          {[
            ["schedule",  "📅", "My schedule"],
            ["calendar",  "🗓", "Calendar"],
            ["notes",     "📝", "Notes"],
            ["progress",  "📊", "Progress"],
            ["leaderboard","🏆","Leaderboard"],
          ].map(([v, icon, label]) => (
            <div
              key={v}
              onClick={() => { setView(v); setSidebarOpen(false); }}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, cursor:"pointer", marginBottom:1, fontWeight: view===v ? 500 : 400, fontSize:13, color: view===v ? "#111" : "#666", background: view===v ? "#fff" : "transparent", border: view===v ? "0.5px solid #eee" : "none" }}
            >
              <span style={{ fontSize:14 }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>

        {/* Members in sidebar */}
        <div style={{ padding:"10px 12px", borderTop:"1px solid #eee" }}>
          <div style={{ fontSize:10, color:"#bbb", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.07em" }}>Members</div>
          {members.map((m, i) => {
            const mb = memberBlocks[m.uid] || [];
            const mStars = mb.filter(b => b.done).length;
            return (
              <div key={m.uid} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0", fontSize:12 }}>
                {m.photo
                  ? <img src={m.photo} alt="" style={{ width:22, height:22, borderRadius:"50%", flexShrink:0 }} />
                  : <div style={{ width:22, height:22, borderRadius:"50%", background:BAR_COLORS[i%4], color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:600, flexShrink:0 }}>{getInitials(m.name)}</div>
                }
                <span style={{ flex:1, color:"#555", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name?.split(" ")[0]}</span>
                <span style={{ fontSize:11, color:"#BA7517", fontWeight:500 }}>⭐{mStars}</span>
                <span style={{ width:6, height:6, borderRadius:"50%", background: i < 2 ? "#1D9E75" : "#ddd", flexShrink:0 }} />
              </div>
            );
          })}
          <button onClick={() => signOut(auth)} style={{ marginTop:8, fontSize:11, color:"#bbb", border:"none", background:"none", cursor:"pointer", padding:0 }}>Sign out</button>
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* Topbar */}
        <div style={{ padding:"10px 16px", borderBottom:"1px solid #eee", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ width:34, height:34, border:"1px solid #eee", borderRadius:8, background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}
            aria-label="Open menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/>
            </svg>
          </button>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:600, fontSize:15, display:"flex", alignItems:"center", gap:6 }}>
              { view==="schedule"    && "My schedule" }
              { view==="calendar"   && "Calendar" }
              { view==="notes"      && "Notes" }
              { view==="progress"   && "Group progress" }
              { view==="leaderboard"&& "Leaderboard" }
              { allDoneToday && view==="schedule" && <CaterpillarIcon size={18} /> }
            </div>
            <div style={{ fontSize:11, color:"#aaa" }}>
              {today.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" })}
            </div>
          </div>

          <div style={{ background:"#FAEEDA", color:"#633806", padding:"5px 11px", borderRadius:8, fontSize:12, fontWeight:500, flexShrink:0 }}>
            ⭐ {myDone} pts
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{ padding:"6px 14px", background:"#111", color:"#fff", border:"none", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}
          >
            + Add
          </button>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

          {/* ── SCHEDULE ── */}
          {view === "schedule" && (
            <div>
              {/* Progress bar */}
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11, color:"#888" }}>Today's progress</span>
                <span style={{ fontSize:11, color:"#888" }}>{myDone} / {myTotal} done</span>
              </div>
              <div style={{ height:3, background:"#f0f0f0", borderRadius:2, marginBottom:18 }}>
                <div style={{ height:3, width: myPct+"%", background:"#7F77DD", borderRadius:2, transition:"width 0.4s" }} />
              </div>

              {blocks.length === 0 && (
                <div style={{ color:"#bbb", fontSize:13, textAlign:"center", marginTop:40 }}>
                  No blocks yet — press + Add to get started
                </div>
              )}

              {blocks.map(b => (
                <div key={b.id} style={{ display:"flex", gap:12, marginBottom:7, alignItems:"flex-start" }}>
                  {/* Time */}
                  <div style={{ width:44, flexShrink:0, textAlign:"right", paddingTop:11, fontSize:10, color:"#aaa", lineHeight:1.3 }}>
                    {b.time?.split(" ")[0]}<br/>
                    <span style={{ fontSize:9 }}>{b.time?.split(" ")[1] || ""}</span>
                  </div>

                  {/* Edit mode */}
                  {editingId === b.id ? (
                    <div style={{ flex:1, border:"1.5px solid #7F77DD", borderRadius:12, padding:"12px 14px", background:"#fff" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 100px", gap:6, marginBottom:6 }}>
                        <input
                          style={styles.editInput}
                          value={editDraft.title}
                          onChange={e => setEditDraft(p => ({ ...p, title: e.target.value }))}
                          onKeyDown={e => { if (e.key==="Enter") saveEdit(); if (e.key==="Escape") setEditingId(null); }}
                          autoFocus
                          placeholder="Activity name"
                        />
                        <input
                          style={styles.editInput}
                          value={editDraft.time}
                          onChange={e => setEditDraft(p => ({ ...p, time: e.target.value }))}
                          placeholder="Time"
                        />
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", gap:6, marginBottom:10 }}>
                        <select style={styles.editInput} value={editDraft.category} onChange={e => setEditDraft(p => ({ ...p, category: e.target.value }))}>
                          <option value="work">Work</option>
                          <option value="health">Health & fitness</option>
                          <option value="personal">Personal</option>
                          <option value="learn">Learning</option>
                        </select>
                        <input style={styles.editInput} value={editDraft.note} onChange={e => setEditDraft(p => ({ ...p, note: e.target.value }))} placeholder="Note (optional)" />
                      </div>
                      <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                        <button onClick={() => promptDelete(b.id)} style={{ ...styles.btn, color:"#c0392b", borderColor:"#f5b7b1", fontSize:12 }}>Delete</button>
                        <button style={{ ...styles.btn, fontSize:12 }} onClick={() => setEditingId(null)}>Cancel</button>
                        <button style={{ ...styles.btnSolid, fontSize:12 }} onClick={saveEdit}>Save</button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div style={{
                      flex:1, border:"1px solid #e5e7eb", borderRadius:12,
                      padding:"10px 12px 10px 16px", position:"relative",
                      background: b.done ? "#f9fafb" : "#fff", overflow:"hidden",
                    }}>
                      {/* Category bar */}
                      <div style={{ position:"absolute", left:0, top:8, bottom:8, width:3, borderRadius:"0 2px 2px 0", background: CAT_COLORS[b.category] }} />
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color: b.done?"#aaa":"#111", textDecoration: b.done?"line-through":"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {b.title}
                          </div>
                          <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>
                            {b.time} · {CAT_LABELS[b.category]}{b.note ? " · "+b.note : ""}
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                          <button onClick={() => startEdit(b)} style={styles.iconBtn} title="Edit">✏️</button>
                          <button onClick={() => promptDelete(b.id)} style={styles.iconBtn} title="Delete">🗑</button>
                          {b.done && <span style={{ fontSize:13 }}>⭐</span>}
                          <div
                            onClick={() => toggleDone(b)}
                            style={{ width:22, height:22, borderRadius:"50%", border: b.done?"none":"1.5px solid #ccc", background: b.done?"#1D9E75":"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"white", fontSize:12, flexShrink:0 }}
                          >
                            {b.done ? "✓" : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add placeholder */}
              <div style={{ display:"flex", gap:12, marginTop:4 }}>
                <div style={{ width:44 }} />
                <div
                  onClick={() => setShowAddModal(true)}
                  style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"9px 14px", border:"1.5px dashed #e5e7eb", borderRadius:12, cursor:"pointer", color:"#bbb", fontSize:13 }}
                >
                  + Add a block
                </div>
              </div>
            </div>
          )}

          {/* ── CALENDAR ── */}
          {view === "calendar" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <button onClick={() => { let m=calMonth-1,y=calYear; if(m<0){m=11;y--;} setCalMonth(m);setCalYear(y);setSelectedCalDay(null);setSelectedDayData(null);setSelectedDayBlocks([]); }} style={styles.btn}>‹</button>
                  <span style={{ fontWeight:500, fontSize:14, minWidth:130, textAlign:"center" }}>{MONTHS[calMonth]} {calYear}</span>
                  <button onClick={() => { let m=calMonth+1,y=calYear; if(m>11){m=0;y++;} setCalMonth(m);setCalYear(y);setSelectedCalDay(null);setSelectedDayData(null);setSelectedDayBlocks([]); }} style={styles.btn}>›</button>
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <div style={styles.legendChip}><CaterpillarIcon size={14}/> Day done</div>
                  <div style={styles.legendChip}><ButterflyIcon size={14}/> Perfect week</div>
                </div>
              </div>

              {/* Calendar grid — Monday first */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1, background:"#f0f0f0", border:"1px solid #f0f0f0", borderRadius:12, overflow:"hidden" }}>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i) => (
                  <div key={d} style={{ background:"#fafafa", textAlign:"center", fontSize:10, fontWeight:500, color: i===6?"#D85A30":"#999", padding:"5px 0" }}>{d}</div>
                ))}
                {renderCalendarCells()}
              </div>

              <p style={{ fontSize:11, color:"#aaa", textAlign:"center", marginTop:8 }}>
                Click any past day to see your tasks · complete all tasks for 🐛 · perfect week earns 🦋 on Sunday
              </p>

              {/* Selected day detail — read only */}
              {selectedCalDay && (
                <div style={{ marginTop:14, border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", background:"#fafafa", borderBottom:"1px solid #eee", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>
                        {new Date(calYear, calMonth, selectedCalDay).toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
                      </div>
                      {selectedDayData && (
                        <div style={{ fontSize:11, color:"#888", marginTop:2 }}>
                          {selectedDayData.done}/{selectedDayData.total} tasks completed · {selectedDayData.total > 0 ? Math.round((selectedDayData.done/selectedDayData.total)*100) : 0}%
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelectedCalDay(null); setSelectedDayData(null); setSelectedDayBlocks([]); }} style={{ ...styles.btn, fontSize:11 }}>Close</button>
                  </div>
                  <div style={{ padding:"10px 14px" }}>
                    {selectedDayBlocks.length === 0 ? (
                      <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"12px 0" }}>No tasks recorded for this day</div>
                    ) : (
                      selectedDayBlocks.map(b => (
                        <div key={b.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f5f5f5" }}>
                          <div style={{ width:16, height:16, borderRadius:"50%", background: b.done?"#1D9E75":"#eee", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"white", flexShrink:0 }}>
                            {b.done ? "✓" : ""}
                          </div>
                          <span style={{ flex:1, fontSize:13, color: b.done?"#111":"#aaa", textDecoration: b.done?"none":"line-through" }}>{b.title}</span>
                          <span style={{ fontSize:11, color:"#aaa" }}>{b.time}</span>
                          {b.done && <span style={{ fontSize:12 }}>⭐</span>}
                        </div>
                      ))
                    )}
                    <p style={{ fontSize:11, color:"#bbb", marginTop:8, fontStyle:"italic" }}>Past days are read-only</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NOTES ── */}
          {view === "notes" && (
            <div>
              <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>
                Personal notes from each member — visible to the whole group.
              </p>
              {members.map((m, i) => {
                const isMe = m.uid === user.uid;
                const noteText = isMe ? myNote : (memberNotes[m.uid] || "");
                const isOpen = noteOpenId === m.uid;
                return (
                  <div key={m.uid} style={{ border:"1px solid #eee", borderRadius:12, marginBottom:8, overflow:"hidden" }}>
                    {/* Header — always clickable */}
                    <div
                      onClick={() => setNoteOpenId(isOpen ? null : m.uid)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", cursor:"pointer", background: isOpen?"#fafafa":"#fff" }}
                    >
                      {m.photo
                        ? <img src={m.photo} alt="" style={{ width:28, height:28, borderRadius:"50%", flexShrink:0 }} />
                        : <div style={{ width:28, height:28, borderRadius:"50%", background:BAR_COLORS[i%4], color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:600, flexShrink:0 }}>{getInitials(m.name)}</div>
                      }
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{m.name}{isMe ? " (you)" : ""}</div>
                        <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>
                          {noteText ? noteText.slice(0,50) + (noteText.length > 50 ? "…" : "") : "No notes yet"}
                        </div>
                      </div>
                      <span style={{ fontSize:14, color:"#aaa", transform: isOpen?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
                    </div>

                    {/* Body */}
                    {isOpen && (
                      <div style={{ padding:"12px 14px", borderTop:"1px solid #eee", background:"#fff" }}>
                        {isMe ? (
                          <>
                            <p style={{ fontSize:11, color:"#aaa", marginBottom:6 }}>Your note — visible to everyone in the group</p>
                            <textarea
                              value={myNoteDraft}
                              onChange={e => setMyNoteDraft(e.target.value)}
                              onFocus={() => setMyNoteDraft(myNote)}
                              placeholder="Write something about your week, goals, or anything you want to share…"
                              style={{ width:"100%", padding:"8px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, fontFamily:"inherit", color:"#111", background:"#fafafa", resize:"vertical", minHeight:80, outline:"none" }}
                            />
                            <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:8 }}>
                              <button style={styles.btn} onClick={() => setNoteOpenId(null)}>Cancel</button>
                              <button style={styles.btnSolid} onClick={saveMyNote}>Save note</button>
                            </div>
                          </>
                        ) : (
                          <p style={{ fontSize:13, color: noteText?"#333":"#aaa", lineHeight:1.6, fontStyle: noteText?"normal":"italic" }}>
                            {noteText || "No notes added yet."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PROGRESS ── */}
          {view === "progress" && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:20 }}>
                {[["My tasks", myTotal], ["Completed", myDone], ["Stars earned", "⭐ "+myDone]].map(([l,v]) => (
                  <div key={l} style={{ background:"#fafafa", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, color:"#999", marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:22, fontWeight:500 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:10 }}>Member progress today</div>
              {members.map((m, i) => {
                const mb = memberBlocks[m.uid] || [];
                const mDone = mb.filter(b => b.done).length;
                const mTotal = mb.length;
                const pct = mTotal > 0 ? Math.round((mDone/mTotal)*100) : 0;
                return (
                  <div key={m.uid} style={{ border:"1px solid #eee", borderRadius:10, padding:"10px 14px", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      {m.photo
                        ? <img src={m.photo} alt="" style={{ width:26, height:26, borderRadius:"50%" }} />
                        : <div style={{ width:26, height:26, borderRadius:"50%", background:BAR_COLORS[i%4], color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:600 }}>{getInitials(m.name)}</div>
                      }
                      <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{m.name}</span>
                      <span style={{ fontSize:12, color:"#BA7517", fontWeight:500 }}>⭐ {mDone}</span>
                    </div>
                    <div style={{ height:4, background:"#eee", borderRadius:2 }}>
                      <div style={{ height:4, width: pct+"%", background: BAR_COLORS[i%4], borderRadius:2, transition:"width 0.3s" }} />
                    </div>
                    <div style={{ fontSize:11, color:"#aaa", marginTop:4 }}>{mDone}/{mTotal} tasks · {pct}%</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── LEADERBOARD ── */}
          {view === "leaderboard" && (
            <div>
              <p style={{ fontSize:12, color:"#aaa", marginBottom:14 }}>
                Score = % of today's tasks completed · resets daily at midnight
              </p>
              {sortedLeaderboard.map((m, i) => {
                const mb = memberBlocks[m.uid] || [];
                const mDone = mb.filter(b => b.done).length;
                const mTotal = mb.length;
                const pct = mTotal > 0 ? Math.round((mDone/mTotal)*100) : 0;
                const isMe = m.uid === user.uid;
                return (
                  <div key={m.uid} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", border: i===0?"1.5px solid #EF9F27":"1px solid #eee", borderRadius:12, marginBottom:6, background: i===0?"#FFFBF0":"#fff" }}>
                    <span style={{ fontSize:20, width:28, textAlign:"center" }}>{["🥇","🥈","🥉"][i] || (i+1)}</span>
                    {m.photo
                      ? <img src={m.photo} alt="" style={{ width:30, height:30, borderRadius:"50%", flexShrink:0 }} />
                      : <div style={{ width:30, height:30, borderRadius:"50%", background:BAR_COLORS[i%4], color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, flexShrink:0 }}>{getInitials(m.name)}</div>
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight: isMe?600:400 }}>
                        {m.name}{isMe ? " (you)" : ""}
                      </div>
                      {/* Percentage progress bar */}
                      <div style={{ height:4, background:"#f0f0f0", borderRadius:2, marginTop:4 }}>
                        <div style={{ height:4, width: pct+"%", background: BAR_COLORS[i%4], borderRadius:2, transition:"width 0.4s" }} />
                      </div>
                      <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{mDone}/{mTotal} tasks</div>
                    </div>
                    <div style={{ fontSize:16, fontWeight:600, color: BAR_COLORS[i%4], flexShrink:0, minWidth:44, textAlign:"right" }}>
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* ── Add block modal ── */}
      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Add schedule block</h3>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Activity name</label>
              <input style={styles.fieldInput} value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addBlock()} placeholder="e.g. Morning run" autoFocus />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Time</label>
              <input style={styles.fieldInput} value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="e.g. 7:00 AM" />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Category</label>
              <select style={styles.fieldInput} value={newCat} onChange={e => setNewCat(e.target.value)}>
                <option value="work">Work</option>
                <option value="health">Health & fitness</option>
                <option value="personal">Personal</option>
                <option value="learn">Learning</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Note (optional)</label>
              <input style={styles.fieldInput} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Any details…" />
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button style={styles.btn} onClick={() => setShowAddModal(false)}>Cancel</button>
              <button style={styles.btnSolid} onClick={addBlock}>Add block</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {showDeleteModal && (
        <div style={styles.modalOverlay} onClick={() => setShowDeleteModal(false)}>
          <div style={{ ...styles.modal, width:280 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>Delete this block?</h3>
            <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>
              "{blocks.find(b => b.id===pendingDeleteId)?.title}" will be permanently removed.
            </p>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={styles.btn} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button style={{ ...styles.btnSolid, background:"#c0392b", border:"none" }} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const styles = {
  btn: {
    padding:"6px 14px", fontSize:13, border:"1px solid #e5e7eb",
    borderRadius:8, cursor:"pointer", background:"transparent",
    color:"#111", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4,
  },
  btnSolid: {
    padding:"6px 14px", fontSize:13, border:"none",
    borderRadius:8, cursor:"pointer", background:"#111",
    color:"#fff", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4,
  },
  editInput: {
    width:"100%", padding:"7px 9px", border:"1px solid #e5e7eb",
    borderRadius:8, fontSize:13, fontFamily:"system-ui,sans-serif",
    color:"#111", background:"#fff", outline:"none",
  },
  iconBtn: {
    width:26, height:26, border:"1px solid #ebebeb", borderRadius:6,
    background:"#fafafa", cursor:"pointer", display:"flex",
    alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0,
  },
  calCell: {
    background:"#fff", minHeight:62, padding:"4px 5px",
    position:"relative", display:"flex", flexDirection:"column",
  },
  calDayNum: {
    fontSize:10, fontWeight:500, color:"#111",
    width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center",
  },
  legendChip: {
    display:"flex", alignItems:"center", gap:5,
    background:"#f9fafb", border:"1px solid #eee",
    borderRadius:20, padding:"3px 10px", fontSize:11, color:"#666",
  },
  modalOverlay: {
    position:"fixed", inset:0, background:"rgba(0,0,0,0.35)",
    zIndex:100, display:"flex", alignItems:"center", justifyContent:"center",
  },
  modal: {
    background:"#fff", borderRadius:14, padding:22, width:310,
    border:"1px solid #eee", maxHeight:"90vh", overflowY:"auto",
  },
  field: { marginBottom:12 },
  fieldLabel: { fontSize:11, color:"#888", display:"block", marginBottom:4 },
  fieldInput: {
    width:"100%", padding:"8px 10px", border:"1px solid #e5e7eb",
    borderRadius:8, fontSize:13, fontFamily:"system-ui,sans-serif", color:"#111", background:"#fff",
  },
};