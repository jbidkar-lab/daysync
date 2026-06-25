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

// Guardian tasks are the same for every user every day — read only
const GUARDIAN_TASKS = [
  { id:"g1", title:"Wake up",           time:"6:00 AM",  category:"health"   },
  { id:"g2", title:"Workout",           time:"7:00 AM",  category:"health"   },
  { id:"g3", title:"Breakfast",         time:"8:00 AM",  category:"personal" },
  { id:"g4", title:"Lunch",             time:"12:00 PM", category:"personal" },
  { id:"g5", title:"Work on your skills", time:"2:00 PM", category:"work"   },
];

// Penalty: health = -2 pts, others = -1 pt after 3 consecutive missed days
function penaltyFor(category) { return category === "health" ? 2 : 1; }

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function CaterpillarIcon({ size = 22 }) {
  const h = size * 0.6;
  return (
    <svg width={size} height={h} viewBox="0 0 44 26" fill="none">
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
    <svg width={size} height={size} viewBox="0 0 40 36" fill="none">
      <path d="M20 18 C14 10,2 6,2 14 C2 22,12 24,20 22" stroke="#1a1a1a" strokeWidth="1.6" fill="none"/>
      <path d="M20 18 C14 22,4 26,6 32 C8 36,16 32,20 24" stroke="#1a1a1a" strokeWidth="1.6" fill="none"/>
      <path d="M20 18 C26 10,38 6,38 14 C38 22,28 24,20 22" stroke="#1a1a1a" strokeWidth="1.6" fill="none"/>
      <path d="M20 18 C26 22,36 26,34 32 C32 36,24 32,20 24" stroke="#1a1a1a" strokeWidth="1.6" fill="none"/>
      <ellipse cx="20" cy="20" rx="1.8" ry="7" fill="#1a1a1a"/>
      <path d="M19 13 C17 8,13 5,12 3" stroke="#1a1a1a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M21 13 C23 8,27 5,28 3" stroke="#1a1a1a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <circle cx="12" cy="3" r="1.5" fill="#1a1a1a"/>
      <circle cx="28" cy="3" r="1.5" fill="#1a1a1a"/>
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayKey() { return new Date().toISOString().split("T")[0]; }
function getInitials(name = "") {
  return name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) || "?";
}
function isWeekPerfect(dayDataMap, year, month, sundayDate) {
  for (let i = 6; i >= 0; i--) {
    const d = new Date(year, month, sundayDate - i);
    const key = d.toISOString().split("T")[0];
    const data = dayDataMap[key];
    if (!data || data.done < data.total || data.total === 0) return false;
  }
  return true;
}

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ photo, name, size = 28, colorIdx = 0 }) {
  const fs = Math.round(size * 0.36);
  const style = {
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: fs, fontWeight: 600, overflow: "hidden",
    background: BAR_COLORS[colorIdx % 4] + "22",
    color: BAR_COLORS[colorIdx % 4],
  };
  if (photo) return (
    <div style={style}>
      <img src={photo} alt={name} style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }}/>
    </div>
  );
  return <div style={style}>{getInitials(name)}</div>;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:"#FAEEDA", color:"#633806", border:"1px solid #FAC775", borderRadius:10, padding:"8px 18px", fontSize:13, fontWeight:500, zIndex:200, whiteSpace:"nowrap", pointerEvents:"none" }}>
      {message}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]                     = useState(null);
  const [loading, setLoading]               = useState(true);
  const [view, setView]                     = useState("schedule");
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [members, setMembers]               = useState([]);
  const [memberBlocks, setMemberBlocks]     = useState({});
  const [guardianDone, setGuardianDone]     = useState({});  // { g1: true, g2: false, … }
  const [guardianStreaks, setGuardianStreaks] = useState({}); // miss streaks from Firestore
  const [myBlocks, setMyBlocks]             = useState([]);
  const [dayDataMap, setDayDataMap]         = useState({});
  const [memberNotes, setMemberNotes]       = useState({});
  const [myNote, setMyNote]                 = useState("");
  const [myNoteDraft, setMyNoteDraft]       = useState("");
  const [noteOpenId, setNoteOpenId]         = useState(null);
  const [toast, setToast]                   = useState("");
  const [editingId, setEditingId]           = useState(null);
  const [editDraft, setEditDraft]           = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [newTitle, setNewTitle]             = useState("");
  const [newTime, setNewTime]               = useState("");
  const [newCat, setNewCat]                 = useState("work");
  const [newNote, setNewNote]               = useState("");
  const [calMonth, setCalMonth]             = useState(new Date().getMonth());
  const [calYear, setCalYear]               = useState(new Date().getFullYear());
  const [selectedCalDay, setSelectedCalDay] = useState(null);
  const [selectedDayBlocks, setSelectedDayBlocks] = useState([]);
  const [selectedDayData, setSelectedDayData] = useState(null);
  // Summary data loaded from Firestore history
  const [taskSummary, setTaskSummary]       = useState([]);
  const [penaltyLog, setPenaltyLog]         = useState([]);
  const [totalEarned, setTotalEarned]       = useState(0);
  const [totalDeducted, setTotalDeducted]   = useState(0);
  const toastTimer = useRef(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        await setDoc(doc(db, "members", u.uid), {
          name: u.displayName, photo: u.photoURL, uid: u.uid,
          lastSeen: serverTimestamp(),
        }, { merge: true });
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

  // ── Today's guardian completion ───────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid, "guardianDays", todayKey()), snap => {
      if (snap.exists()) setGuardianDone(snap.data().done || {});
    });
  }, [user]);

  // ── Guardian miss streaks ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid, "guardianStreaks", "current"), snap => {
      if (snap.exists()) setGuardianStreaks(snap.data() || {});
    });
  }, [user]);

  // ── Personal blocks ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "days", todayKey(), "blocks"),
      orderBy("createdAt")
    );
    return onSnapshot(q, snap => {
      const b = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyBlocks(b);
      const gDoneCount = GUARDIAN_TASKS.filter(t => guardianDone[t.id]).length;
      const pDone = b.filter(x => x.done).length;
      const total = GUARDIAN_TASKS.length + b.length;
      const done = gDoneCount + pDone;
      setDayDataMap(prev => ({ ...prev, [todayKey()]: { total, done } }));
    });
  }, [user, guardianDone]);

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

  // ── Notes ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "notes"), snap => {
      const n = {};
      snap.docs.forEach(d => { n[d.id] = d.data().text || ""; });
      setMemberNotes(n);
    });
  }, [user]);

  // ── Past day summaries for calendar ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function load() {
      const now = new Date();
      const map = {};
      for (let i = 1; i <= 60; i++) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        const key = d.toISOString().split("T")[0];
        try {
          const snap = await getDoc(doc(db, "users", user.uid, "daySummaries", key));
          if (snap.exists()) map[key] = snap.data();
          else {
            const bSnap = await getDocs(collection(db, "users", user.uid, "days", key, "blocks"));
            const all = bSnap.docs.map(d => d.data());
            if (all.length > 0) map[key] = { total: GUARDIAN_TASKS.length + all.length, done: all.filter(b => b.done).length + GUARDIAN_TASKS.length };
          }
        } catch (_) {}
      }
      setDayDataMap(prev => ({ ...map, ...prev }));
    }
    load();
  }, [user]);

  // ── Save day summary on change ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const gDone = GUARDIAN_TASKS.filter(t => guardianDone[t.id]).length;
    const pDone = myBlocks.filter(b => b.done).length;
    const total = GUARDIAN_TASKS.length + myBlocks.length;
    const done = gDone + pDone;
    if (total === 0) return;
    setDoc(doc(db, "users", user.uid, "daySummaries", todayKey()), { total, done }, { merge: true });
  }, [guardianDone, myBlocks, user]);

  // ── Load summary stats from Firestore ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadSummary() {
      const snap = await getDoc(doc(db, "users", user.uid, "stats", "summary"));
      if (snap.exists()) {
        const d = snap.data();
        setTotalEarned(d.totalEarned || 0);
        setTotalDeducted(d.totalDeducted || 0);
        setTaskSummary(d.taskSummary || []);
        setPenaltyLog(d.penaltyLog || []);
      }
    }
    loadSummary();
  }, [user]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  // ── Guardian toggle ───────────────────────────────────────────────────────
  async function toggleGuardian(taskId) {
    const newDone = { ...guardianDone, [taskId]: !guardianDone[taskId] };
    await setDoc(
      doc(db, "users", user.uid, "guardianDays", todayKey()),
      { done: newDone }, { merge: true }
    );
    setGuardianDone(newDone);
    const task = GUARDIAN_TASKS.find(t => t.id === taskId);
    if (!guardianDone[taskId]) showToast("⭐ +1 star — " + task.title);
    else showToast("Unchecked — " + task.title);
  }

  // ── Personal block CRUD ───────────────────────────────────────────────────
  async function addBlock() {
    if (!newTitle.trim()) return;
    const ref = doc(collection(db, "users", user.uid, "days", todayKey(), "blocks"));
    await setDoc(ref, {
      title: newTitle.trim(), time: newTime.trim() || "TBD",
      category: newCat, note: newNote.trim(),
      done: false, createdAt: serverTimestamp(),
    });
    setNewTitle(""); setNewTime(""); setNewNote(""); setNewCat("work");
    setShowAddModal(false); showToast("Block added");
  }

  async function toggleDone(block) {
    const ref = doc(db, "users", user.uid, "days", todayKey(), "blocks", block.id);
    await updateDoc(ref, { done: !block.done });
    if (!block.done) showToast("⭐ +1 star — " + block.title);
    else showToast("Star removed — " + block.title);
  }

  function startEdit(block) {
    setEditingId(block.id);
    setEditDraft({ title: block.title, time: block.time, category: block.category, note: block.note || "" });
  }

  async function saveEdit() {
    if (!editDraft.title?.trim() || !editingId) return;
    const ref = doc(db, "users", user.uid, "days", todayKey(), "blocks", editingId);
    await updateDoc(ref, {
      title: editDraft.title.trim(), time: editDraft.time?.trim() || "TBD",
      category: editDraft.category, note: editDraft.note?.trim() || "",
    });
    setEditingId(null); showToast("Block updated");
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    await deleteDoc(doc(db, "users", user.uid, "days", todayKey(), "blocks", pendingDeleteId));
    if (editingId === pendingDeleteId) setEditingId(null);
    setPendingDeleteId(null); setShowDeleteModal(false); showToast("Block deleted");
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  async function saveMyNote() {
    await setDoc(doc(db, "notes", user.uid), {
      text: myNoteDraft, authorName: user.displayName, updatedAt: serverTimestamp(),
    });
    setMyNote(myNoteDraft); setNoteOpenId(null); showToast("Note saved");
  }

  // ── Calendar day select ───────────────────────────────────────────────────
  async function selectCalDay(d, isPast) {
    if (!isPast) return;
    const date = new Date(calYear, calMonth, d);
    const key = date.toISOString().split("T")[0];
    setSelectedCalDay(d);
    setSelectedDayData(dayDataMap[key] || null);
    try {
      const snap = await getDocs(collection(db, "users", user.uid, "days", key, "blocks"));
      setSelectedDayBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (_) { setSelectedDayBlocks([]); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const gDoneCount   = GUARDIAN_TASKS.filter(t => guardianDone[t.id]).length;
  const pDoneCount   = myBlocks.filter(b => b.done).length;
  const todayTotal   = GUARDIAN_TASKS.length + myBlocks.length;
  const todayDone    = gDoneCount + pDoneCount;
  const todayPct     = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;
  const allDoneToday = todayTotal > 0 && todayDone === todayTotal;
  const today        = new Date();

  // Members sorted by net score (% completion today)
  function memberScore(m) {
    const mb = memberBlocks[m.uid] || [];
    const done = mb.filter(b => b.done).length + GUARDIAN_TASKS.length;
    const total = mb.length + GUARDIAN_TASKS.length;
    return total > 0 ? done / total : 0;
  }
  const topThree = [...members].sort((a, b) => memberScore(b) - memberScore(a)).slice(0, 3);
  const rest = [...members].sort((a, b) => memberScore(b) - memberScore(a)).slice(3);

  // ── Calendar cells ────────────────────────────────────────────────────────
  function renderCalendarCells() {
    const firstJS  = new Date(calYear, calMonth, 1).getDay();
    const firstMon = (firstJS + 6) % 7;
    const dim      = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDim  = new Date(calYear, calMonth, 0).getDate();
    const cells    = [];

    for (let i = 0; i < firstMon; i++) {
      cells.push(<div key={"p"+i} style={{ ...sty.calCell, opacity:0.3, background:"#f9fafb" }}><span style={sty.calDayNum}>{prevDim-firstMon+1+i}</span></div>);
    }

    for (let d = 1; d <= dim; d++) {
      const jsDay  = new Date(calYear, calMonth, d).getDay();
      const isSun  = jsDay === 0;
      const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
      const cellDate = new Date(calYear, calMonth, d);
      const isPast  = cellDate <= today;
      const key     = cellDate.toISOString().split("T")[0];
      const data    = dayDataMap[key];
      const allDone = data && data.total > 0 && data.done >= data.total;
      const wPerfect = isSun && isPast && isWeekPerfect(dayDataMap, calYear, calMonth, d);
      const isSel   = selectedCalDay === d;

      cells.push(
        <div key={d} onClick={() => selectCalDay(d, isPast)} style={{
          ...sty.calCell,
          ...(isToday ? { outline:"2px solid #111", outlineOffset:-2 } : {}),
          ...(isSun   ? { background:"#FFFBF5" } : {}),
          ...(isSel   ? { background:"#EEEDFE" } : {}),
          cursor: isPast ? "pointer" : "default",
        }}>
          <span style={{ ...sty.calDayNum, ...(isToday ? { background:"#111", color:"#fff", borderRadius:"50%", width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center" } : {}), ...(isSun && !isToday ? { color:"#D85A30" } : {}) }}>
            {d}
          </span>
          {data && data.done > 0 && !allDone && isPast && (
            <span style={{ fontSize:9, color:"#BA7517", marginTop:2 }}>⭐{data.done}</span>
          )}
          {isPast && data && data.total > 0 && (
            <span style={{ position:"absolute", bottom:2, right:3 }}>
              {wPerfect ? <ButterflyIcon size={15}/> : allDone ? <CaterpillarIcon size={17}/> : null}
            </span>
          )}
        </div>
      );
    }

    const rem = (firstMon+dim) % 7 === 0 ? 0 : 7 - ((firstMon+dim) % 7);
    for (let i = 1; i <= rem; i++) {
      cells.push(<div key={"r"+i} style={{ ...sty.calCell, opacity:0.3, background:"#f9fafb" }}><span style={sty.calDayNum}>{i}</span></div>);
    }
    return cells;
  }

  // ── Loading / sign-in ─────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"system-ui,sans-serif", color:"#aaa" }}>Loading…</div>
  );

  if (!user) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:16, fontFamily:"system-ui,sans-serif", background:"#fafafa" }}>
      <CaterpillarIcon size={52}/>
      <h1 style={{ fontSize:26, fontWeight:600, margin:0 }}>DaySync</h1>
      <p style={{ color:"#888", margin:0, fontSize:14 }}>Daily schedule tracker for you and your crew</p>
      <button onClick={() => signInWithPopup(auth, provider)} style={{ marginTop:8, padding:"12px 28px", borderRadius:10, border:"none", background:"#111", color:"#fff", fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
        Sign in with Google
      </button>
    </div>
  );

  const memberIdx = members.findIndex(m => m.uid === user.uid);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"system-ui,-apple-system,sans-serif", fontSize:14, color:"#111", background:"#fff", position:"relative" }}>
      <Toast message={toast}/>

      {/* Backdrop */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.22)", zIndex:40 }}/>}

      {/* ── Sidebar ── */}
      <div style={{ position:"fixed", top:0, left:0, bottom:0, width:220, background:"#fafafa", borderRight:"1px solid #eee", display:"flex", flexDirection:"column", zIndex:50, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)", transition:"transform 0.22s ease" }}>
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
          <button onClick={() => setSidebarOpen(false)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:18, color:"#aaa", lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:"10px 8px", flex:1, overflowY:"auto" }}>
          <div style={{ fontSize:10, fontWeight:600, color:"#bbb", textTransform:"uppercase", letterSpacing:"0.08em", padding:"4px 10px 4px" }}>views</div>
          {[["schedule","📅","My schedule"],["calendar","🗓","Calendar"],["summary","📊","My summary"],["charts","📈","Progress charts"],["leaderboard","🏆","Leaderboard"],["notes","📝","Notes"]].map(([v,icon,label]) => (
            <div key={v} onClick={() => { setView(v); setSidebarOpen(false); }} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, cursor:"pointer", marginBottom:1, fontWeight: view===v?500:400, fontSize:13, color: view===v?"#111":"#666", background: view===v?"#fff":"transparent", border: view===v?"0.5px solid #eee":"none" }}>
              <span style={{ fontSize:14 }}>{icon}</span>{label}
            </div>
          ))}
          <div style={{ fontSize:10, fontWeight:600, color:"#bbb", textTransform:"uppercase", letterSpacing:"0.08em", padding:"10px 10px 4px" }}>members</div>
          {members.map((m, i) => {
            const mb = memberBlocks[m.uid] || [];
            const mDone = mb.filter(b => b.done).length + GUARDIAN_TASKS.filter(t => guardianDone[t.id]).length;
            return (
              <div key={m.uid} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 10px", fontSize:12 }}>
                <Avatar photo={m.uid === user.uid ? undefined : m.photo} name={m.name} size={22} colorIdx={i}/>
                <span style={{ flex:1, color:"#555", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name?.split(" ")[0]}</span>
                <span style={{ fontSize:11, color:"#BA7517", fontWeight:500 }}>⭐{m.uid === user.uid ? todayDone : mDone}</span>
              </div>
            );
          })}
        </div>
        <div style={{ padding:"10px 12px", borderTop:"1px solid #eee" }}>
          <button onClick={() => signOut(auth)} style={{ fontSize:11, color:"#bbb", border:"none", background:"none", cursor:"pointer", padding:0 }}>Sign out</button>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* Topbar */}
        <div style={{ padding:"10px 16px", borderBottom:"1px solid #eee", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <button onClick={() => setSidebarOpen(true)} style={{ width:34, height:34, border:"1px solid #eee", borderRadius:8, background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round"><line x1="1" y1="3.5" x2="14" y2="3.5"/><line x1="1" y1="7.5" x2="14" y2="7.5"/><line x1="1" y1="11.5" x2="14" y2="11.5"/></svg>
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:15, display:"flex", alignItems:"center", gap:6 }}>
              {view === "schedule"    && "My schedule"}
              {view === "calendar"    && "Calendar"}
              {view === "summary"     && "My summary"}
              {view === "charts"      && "Progress charts"}
              {view === "leaderboard" && "Leaderboard"}
              {view === "notes"       && "Notes"}
              {allDoneToday && view === "schedule" && <span style={{ marginLeft:4 }}><CaterpillarIcon size={18}/></span>}
            </div>
            <div style={{ fontSize:11, color:"#aaa" }}>{today.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" })}</div>
          </div>
          <div style={{ background:"#FAEEDA", color:"#633806", padding:"5px 11px", borderRadius:8, fontSize:12, fontWeight:500, flexShrink:0 }}>
            ⭐ {todayDone} today · {totalEarned - totalDeducted} net
          </div>
          <button onClick={() => setShowAddModal(true)} style={{ padding:"6px 14px", background:"#111", color:"#fff", border:"none", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>+ Add</button>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

          {/* ── SCHEDULE ── */}
          {view === "schedule" && (
            <div>
              {/* Progress bar */}
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11, color:"#888" }}>Today's progress</span>
                <span style={{ fontSize:11, color:"#888" }}>{todayDone} / {todayTotal} done</span>
              </div>
              <div style={{ height:3, background:"#f0f0f0", borderRadius:2, marginBottom:18 }}>
                <div style={{ height:3, width:todayPct+"%", background:"#7F77DD", borderRadius:2, transition:"width 0.4s" }}/>
              </div>

              {/* Guardian section header */}
              <div style={{ background:"linear-gradient(135deg,#1a1a2e,#16213e)", color:"#fff", borderRadius:12, padding:"11px 16px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>Guardian Tasks</span>
                    <span style={{ background:"#EF9F27", color:"#fff", fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>Mandatory</span>
                  </div>
                  <div style={{ fontSize:11, opacity:0.7 }}>Same for everyone · miss 3 days in a row = penalty (health −2 pts, others −1 pt)</div>
                </div>
              </div>

              {/* Guardian tasks */}
              {GUARDIAN_TASKS.map(t => {
                const done = !!guardianDone[t.id];
                const streak = guardianStreaks[t.id] || 0;
                return (
                  <div key={t.id} style={{ display:"flex", gap:12, marginBottom:6, alignItems:"flex-start" }}>
                    <div style={{ width:44, flexShrink:0, textAlign:"right", paddingTop:11, fontSize:10, color:"#aaa", lineHeight:1.3 }}>
                      {t.time.split(" ")[0]}<br/><span style={{ fontSize:9 }}>{t.time.split(" ")[1]||""}</span>
                    </div>
                    <div style={{ flex:1, border:"1px solid #e5e7eb", borderRadius:12, padding:"9px 12px 9px 16px", position:"relative", overflow:"hidden", background: done?"#f9fafb":"#fff" }}>
                      <div style={{ position:"absolute", left:0, top:7, bottom:7, width:3, borderRadius:"0 2px 2px 0", background:CAT_COLORS[t.category] }}/>
                      <div style={{ display:"flex", alignItems:"center", gap:8, paddingLeft:4 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                            <span style={{ fontSize:13, fontWeight:500, color: done?"#aaa":"#111", textDecoration: done?"line-through":"none" }}>{t.title}</span>
                            <span style={{ fontSize:9, background:"#EEEDFE", color:"#3C3489", padding:"1px 5px", borderRadius:4, fontWeight:500 }}>Mandatory</span>
                            {streak >= 2 && <span style={{ fontSize:9, background:"#FCEBEB", color:"#A32D2D", padding:"1px 5px", borderRadius:4, fontWeight:500 }}>⚠ {streak}d missed</span>}
                          </div>
                          <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>{t.time} · {CAT_LABELS[t.category]} · {t.category==="health"?"−2 pts":"−1 pt"} if missed 3 days</div>
                        </div>
                        {done && <span style={{ fontSize:13 }}>⭐</span>}
                        <div onClick={() => toggleGuardian(t.id)} style={{ width:22, height:22, borderRadius:"50%", border: done?"none":"1.5px solid #ccc", background: done?"#1D9E75":"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"white", fontSize:12, flexShrink:0 }}>
                          {done ? "✓" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Divider */}
              <div style={{ display:"flex", alignItems:"center", gap:10, margin:"14px 0 10px" }}>
                <div style={{ flex:1, height:1, background:"#f0f0f0" }}/>
                <span style={{ fontSize:11, color:"#bbb", fontWeight:500, letterSpacing:"0.05em" }}>YOUR TASKS</span>
                <div style={{ flex:1, height:1, background:"#f0f0f0" }}/>
              </div>

              {/* Personal tasks */}
              {myBlocks.length === 0 && (
                <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"16px 0" }}>No personal tasks yet — add one below</div>
              )}
              {myBlocks.map(b => (
                <div key={b.id} style={{ display:"flex", gap:12, marginBottom:6, alignItems:"flex-start" }}>
                  <div style={{ width:44, flexShrink:0, textAlign:"right", paddingTop:11, fontSize:10, color:"#aaa", lineHeight:1.3 }}>
                    {b.time?.split(" ")[0]}<br/><span style={{ fontSize:9 }}>{b.time?.split(" ")[1]||""}</span>
                  </div>
                  {editingId === b.id ? (
                    <div style={{ flex:1, border:"1.5px solid #7F77DD", borderRadius:12, padding:"12px 14px", background:"#fff" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 100px", gap:6, marginBottom:6 }}>
                        <input style={sty.editInput} value={editDraft.title} onChange={e => setEditDraft(p => ({...p,title:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditingId(null);}} autoFocus placeholder="Activity name"/>
                        <input style={sty.editInput} value={editDraft.time} onChange={e => setEditDraft(p => ({...p,time:e.target.value}))} placeholder="Time"/>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"140px 1fr", gap:6, marginBottom:10 }}>
                        <select style={sty.editInput} value={editDraft.category} onChange={e => setEditDraft(p => ({...p,category:e.target.value}))}>
                          <option value="work">Work</option><option value="health">Health & fitness</option><option value="personal">Personal</option><option value="learn">Learning</option>
                        </select>
                        <input style={sty.editInput} value={editDraft.note} onChange={e => setEditDraft(p => ({...p,note:e.target.value}))} placeholder="Note (optional)"/>
                      </div>
                      <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                        <button onClick={() => { setPendingDeleteId(b.id); setShowDeleteModal(true); }} style={{ ...sty.btn, color:"#c0392b", borderColor:"#f5b7b1", fontSize:12 }}>Delete</button>
                        <button style={{ ...sty.btn, fontSize:12 }} onClick={() => setEditingId(null)}>Cancel</button>
                        <button style={{ ...sty.btnSolid, fontSize:12 }} onClick={saveEdit}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex:1, border:"1px solid #e5e7eb", borderRadius:12, padding:"9px 12px 9px 16px", position:"relative", overflow:"hidden", background: b.done?"#f9fafb":"#fff" }}>
                      <div style={{ position:"absolute", left:0, top:7, bottom:7, width:3, borderRadius:"0 2px 2px 0", background:CAT_COLORS[b.category] }}/>
                      <div style={{ display:"flex", alignItems:"center", gap:8, paddingLeft:4 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color: b.done?"#aaa":"#111", textDecoration: b.done?"line-through":"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.title}</div>
                          <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>{b.time} · {CAT_LABELS[b.category]}{b.note?" · "+b.note:""}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                          <button onClick={() => startEdit(b)} style={sty.iconBtn} title="Edit">✏️</button>
                          <button onClick={() => { setPendingDeleteId(b.id); setShowDeleteModal(true); }} style={sty.iconBtn} title="Delete">🗑</button>
                          {b.done && <span style={{ fontSize:13 }}>⭐</span>}
                          <div onClick={() => toggleDone(b)} style={{ width:22, height:22, borderRadius:"50%", border: b.done?"none":"1.5px solid #ccc", background: b.done?"#1D9E75":"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"white", fontSize:12, flexShrink:0 }}>
                            {b.done?"✓":""}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add placeholder */}
              <div style={{ display:"flex", gap:12, marginTop:4 }}>
                <div style={{ width:44 }}/>
                <div onClick={() => setShowAddModal(true)} style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"9px 14px", border:"1.5px dashed #e5e7eb", borderRadius:12, cursor:"pointer", color:"#bbb", fontSize:13 }}>
                  + Add a personal task
                </div>
              </div>
            </div>
          )}

          {/* ── CALENDAR ── */}
          {view === "calendar" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <button onClick={() => { let m=calMonth-1,y=calYear; if(m<0){m=11;y--;} setCalMonth(m);setCalYear(y);setSelectedCalDay(null);setSelectedDayBlocks([]);setSelectedDayData(null); }} style={sty.btn}>‹</button>
                  <span style={{ fontWeight:500, fontSize:14, minWidth:130, textAlign:"center" }}>{MONTHS[calMonth]} {calYear}</span>
                  <button onClick={() => { let m=calMonth+1,y=calYear; if(m>11){m=0;y++;} setCalMonth(m);setCalYear(y);setSelectedCalDay(null);setSelectedDayBlocks([]);setSelectedDayData(null); }} style={sty.btn}>›</button>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <div style={sty.legendChip}><CaterpillarIcon size={14}/> Day done</div>
                  <div style={sty.legendChip}><ButterflyIcon size={14}/> Perfect week</div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1, background:"#f0f0f0", border:"1px solid #f0f0f0", borderRadius:12, overflow:"hidden" }}>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i) => (
                  <div key={d} style={{ background:"#fafafa", textAlign:"center", fontSize:10, fontWeight:500, color: i===6?"#D85A30":"#999", padding:"5px 0" }}>{d}</div>
                ))}
                {renderCalendarCells()}
              </div>
              <p style={{ fontSize:11, color:"#aaa", textAlign:"center", marginTop:8 }}>Click any past day to see your tasks · 🐛 all done · 🦋 perfect week on Sunday</p>
              {selectedCalDay && (
                <div style={{ marginTop:14, border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", background:"#fafafa", borderBottom:"1px solid #eee", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500 }}>
                        {new Date(calYear,calMonth,selectedCalDay).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                      </div>
                      {selectedDayData && (
                        <div style={{ fontSize:11, color:"#888", marginTop:2 }}>
                          {selectedDayData.done}/{selectedDayData.total} done · {selectedDayData.total>0?Math.round((selectedDayData.done/selectedDayData.total)*100):0}%
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelectedCalDay(null);setSelectedDayBlocks([]);setSelectedDayData(null); }} style={sty.btn}>Close</button>
                  </div>
                  <div style={{ padding:"10px 14px" }}>
                    {/* Guardian tasks shown as read-only (all assumed done for past days if summary says so) */}
                    <div style={{ fontSize:11, color:"#bbb", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>Guardian tasks</div>
                    {GUARDIAN_TASKS.map(t => (
                      <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #f5f5f5" }}>
                        <div style={{ width:16, height:16, borderRadius:"50%", background:"#1D9E75", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"white", flexShrink:0 }}>✓</div>
                        <span style={{ flex:1, fontSize:12 }}>{t.title}</span>
                        <span style={{ fontSize:11, color:"#aaa" }}>{t.time}</span>
                        <span style={{ fontSize:11 }}>⭐</span>
                      </div>
                    ))}
                    {selectedDayBlocks.length > 0 && (
                      <>
                        <div style={{ fontSize:11, color:"#bbb", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.05em", margin:"10px 0 6px" }}>Personal tasks</div>
                        {selectedDayBlocks.map(b => (
                          <div key={b.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #f5f5f5" }}>
                            <div style={{ width:16, height:16, borderRadius:"50%", background: b.done?"#1D9E75":"#eee", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"white", flexShrink:0 }}>{b.done?"✓":""}</div>
                            <span style={{ flex:1, fontSize:12, color: b.done?"#111":"#aaa", textDecoration: b.done?"none":"line-through" }}>{b.title}</span>
                            <span style={{ fontSize:11, color:"#aaa" }}>{b.time}</span>
                            {b.done && <span style={{ fontSize:11 }}>⭐</span>}
                          </div>
                        ))}
                      </>
                    )}
                    <p style={{ fontSize:11, color:"#bbb", marginTop:8, fontStyle:"italic" }}>Past days are read-only</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SUMMARY ── */}
          {view === "summary" && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:20 }}>
                {[["Total earned","⭐ "+totalEarned,"#7F77DD"],["Penalties","−"+totalDeducted+" pts","#E24B4A"],["Net score",(totalEarned-totalDeducted)+" pts","#111"]].map(([l,v,c]) => (
                  <div key={l} style={{ background:"#f9fafb", borderRadius:10, padding:"11px 13px" }}>
                    <div style={{ fontSize:10, color:"#aaa", marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:600, color:c }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize:11, fontWeight:600, color:"#bbb", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Task-wise points breakdown</div>
              <div style={{ border:"1px solid #eee", borderRadius:12, padding:"12px 14px", marginBottom:16 }}>
                {taskSummary.length === 0 ? (
                  <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"12px 0" }}>Complete tasks to see your breakdown here</div>
                ) : taskSummary.map((t, i) => {
                  const maxPts = Math.max(...taskSummary.map(x => x.pts), 1);
                  const pct = Math.round((t.pts / maxPts) * 100);
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom: i<taskSummary.length-1?"1px solid #f5f5f5":"none" }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:CAT_COLORS[t.category]||"#999", flexShrink:0 }}/>
                      <span style={{ flex:1, fontSize:12 }}>{t.name}</span>
                      <div style={{ width:90, height:4, background:"#f0f0f0", borderRadius:2, flexShrink:0 }}>
                        <div style={{ height:4, width:pct+"%", background:CAT_COLORS[t.category]||"#999", borderRadius:2 }}/>
                      </div>
                      <span style={{ fontSize:12, fontWeight:500, width:46, textAlign:"right", flexShrink:0 }}>⭐ {t.pts}</span>
                      <span style={{ fontSize:11, color: t.streak===0?"#E24B4A":t.streak>10?"#1D9E75":"#aaa", width:60, textAlign:"right", flexShrink:0 }}>
                        {t.streak===0?"⚠ 0 streak":t.streak+"d streak"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize:11, fontWeight:600, color:"#bbb", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Penalty log</div>
              <div style={{ border:"1px solid #eee", borderRadius:12, padding:"10px 14px" }}>
                {penaltyLog.length === 0 ? (
                  <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"10px 0" }}>No penalties yet — great work!</div>
                ) : penaltyLog.map((p, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom: i<penaltyLog.length-1?"1px solid #f5f5f5":"none", fontSize:12 }}>
                    <span style={{ fontSize:11, color:"#aaa", flexShrink:0, width:46 }}>{p.date}</span>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:p.category==="health"?"#1D9E75":"#7F77DD", flexShrink:0 }}/>
                    <span style={{ flex:1 }}>{p.task}</span>
                    <span style={{ fontSize:10, background:"#FCEBEB", color:"#A32D2D", padding:"1px 6px", borderRadius:4, fontWeight:500, flexShrink:0 }}>{p.deduction} pts</span>
                    <span style={{ fontSize:11, color:"#aaa", flexShrink:0 }}>{p.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CHARTS ── */}
          {view === "charts" && (
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:"#bbb", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Completion rate by task (all time)</div>
              <div style={{ border:"1px solid #eee", borderRadius:12, padding:"14px", marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:500, marginBottom:14 }}>How consistently are you completing each task?</div>
                {taskSummary.length === 0 ? (
                  <div style={{ color:"#bbb", fontSize:13, textAlign:"center", padding:"20px 0" }}>Complete tasks over a few days to see chart data</div>
                ) : (
                  <>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:10, height:110, marginBottom:8 }}>
                      {taskSummary.map((t, i) => {
                        const pct = t.completionRate || 0;
                        const barH = Math.round((pct/100) * 90);
                        return (
                          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                            <span style={{ fontSize:9, fontWeight:500, color:"#111" }}>{pct}%</span>
                            <div style={{ width:"100%", background:"#f0f0f0", borderRadius:"4px 4px 0 0", height:90, display:"flex", alignItems:"flex-end" }}>
                              <div style={{ width:"100%", height:barH, background:CAT_COLORS[t.category]||"#999", borderRadius:"4px 4px 0 0" }}/>
                            </div>
                            <span style={{ fontSize:9, color:"#aaa", textAlign:"center", lineHeight:1.2 }}>{t.name.split(" ")[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      {Object.entries(CAT_COLORS).map(([k,v]) => (
                        <div key={k} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#666" }}>
                          <div style={{ width:10, height:10, borderRadius:2, background:v }}/>{CAT_LABELS[k]}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div style={{ fontSize:11, fontWeight:600, color:"#bbb", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Monthly completion heatmap</div>
              <div style={{ border:"1px solid #eee", borderRadius:12, padding:"14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:500 }}>{MONTHS[calMonth]} {calYear}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:3, fontSize:10, color:"#aaa" }}>
                    Less
                    {["#f0f0f0","#C0DD97","#97C459","#3B6D11"].map(c => <div key={c} style={{ width:8, height:8, borderRadius:1, background:c }}/>)}
                    More
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
                  {["M","T","W","T","F","S","S"].map((d,i) => (
                    <div key={i} style={{ fontSize:9, color: i===6?"#D85A30":"#aaa", textAlign:"center", marginBottom:2 }}>{d}</div>
                  ))}
                  {Array.from({ length: new Date(calYear,calMonth,1).getDay()===0?6:new Date(calYear,calMonth,1).getDay()-1 }).map((_,i) => (
                    <div key={"pad"+i} style={{ aspectRatio:"1" }}/>
                  ))}
                  {Array.from({ length: new Date(calYear,calMonth+1,0).getDate() }).map((_,i) => {
                    const d = i+1;
                    const date = new Date(calYear,calMonth,d);
                    const key = date.toISOString().split("T")[0];
                    const data = dayDataMap[key];
                    const pct = data && data.total > 0 ? data.done/data.total : -1;
                    const isFuture = date > today;
                    const bg = isFuture ? "#f9fafb" : pct < 0 ? "#f0f0f0" : pct < 0.5 ? "#C0DD97" : pct < 0.8 ? "#97C459" : "#3B6D11";
                    return (
                      <div key={d} style={{ aspectRatio:"1", borderRadius:3, background:bg, cursor:"pointer" }} title={`${key}: ${data?Math.round(pct*100)+"% done":"no data"}`} onClick={() => { setCalMonth(new Date(calYear,calMonth,d).getMonth()); selectCalDay(d, date<=today); if(view!=="calendar")setView("calendar"); }}/>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── LEADERBOARD ── */}
          {view === "leaderboard" && (
            <div>
              <p style={{ fontSize:12, color:"#aaa", marginBottom:18 }}>Top 3 · ranked by net points (earned − penalties) · updates live</p>

              {/* Podium */}
              {topThree.length >= 2 && (
                <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"center", gap:10, marginBottom:24 }}>
                  {/* 2nd */}
                  {topThree[1] && (() => {
                    const m = topThree[1];
                    const i = members.findIndex(x => x.uid === m.uid);
                    const mb = memberBlocks[m.uid]||[];
                    const done = mb.filter(b=>b.done).length + GUARDIAN_TASKS.length;
                    return (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, width:"30%" }}>
                        <span style={{ fontSize:22 }}>🥈</span>
                        <Avatar photo={m.photo} name={m.name} size={42} colorIdx={i}/>
                        <div style={{ fontSize:12, fontWeight:500, textAlign:"center" }}>{m.name?.split(" ")[0]}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#475569" }}>{done} pts</div>
                        <div style={{ height:50, width:"90%", background:"#E8ECEF", borderRadius:"8px 8px 0 0" }}/>
                      </div>
                    );
                  })()}
                  {/* 1st */}
                  {topThree[0] && (() => {
                    const m = topThree[0];
                    const i = members.findIndex(x => x.uid === m.uid);
                    const mb = memberBlocks[m.uid]||[];
                    const done = mb.filter(b=>b.done).length + GUARDIAN_TASKS.length;
                    const pct = Math.round(memberScore(m)*100);
                    return (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, width:"34%" }}>
                        <span style={{ fontSize:26 }}>🥇</span>
                        <Avatar photo={m.photo} name={m.name} size={50} colorIdx={i}/>
                        <div style={{ fontSize:13, fontWeight:700, textAlign:"center" }}>{m.name?.split(" ")[0]}</div>
                        <div style={{ fontSize:15, fontWeight:700, color:"#92400E" }}>{done} pts</div>
                        <div style={{ fontSize:10, color:"#aaa" }}>{pct}% completion</div>
                        <div style={{ height:76, width:"90%", background:"#FEF3C7", border:"1.5px solid #EF9F27", borderRadius:"8px 8px 0 0" }}/>
                      </div>
                    );
                  })()}
                  {/* 3rd */}
                  {topThree[2] && (() => {
                    const m = topThree[2];
                    const i = members.findIndex(x => x.uid === m.uid);
                    const mb = memberBlocks[m.uid]||[];
                    const done = mb.filter(b=>b.done).length + GUARDIAN_TASKS.length;
                    return (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, width:"30%" }}>
                        <span style={{ fontSize:20 }}>🥉</span>
                        <Avatar photo={m.photo} name={m.name} size={38} colorIdx={i}/>
                        <div style={{ fontSize:12, fontWeight:500, textAlign:"center" }}>{m.name?.split(" ")[0]}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#9A3412" }}>{done} pts</div>
                        <div style={{ height:34, width:"90%", background:"#FEF0E7", borderRadius:"8px 8px 0 0" }}/>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Detail cards */}
              {topThree.map((m, i) => {
                const mIdx = members.findIndex(x => x.uid === m.uid);
                const mb = memberBlocks[m.uid]||[];
                const mDone = mb.filter(b => b.done).length + GUARDIAN_TASKS.filter(t => m.uid===user.uid?guardianDone[t.id]:true).length;
                const mTotal = mb.length + GUARDIAN_TASKS.length;
                const pct = mTotal > 0 ? Math.round((mDone/mTotal)*100) : 0;
                const isMe = m.uid === user.uid;
                const cardStyles = [
                  { border:"1.5px solid #EF9F27", background:"#FFFBF0" },
                  { border:"1px solid #B0B8C1",   background:"#F8F9FA" },
                  { border:"1px solid #C8956C",   background:"#FDF6F0" },
                ];
                const pctColors = ["#92400E","#475569","#9A3412"];
                const barColors2 = ["#EF9F27","#B0B8C1","#C8956C"];
                return (
                  <div key={m.uid} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, marginBottom:8, ...cardStyles[i] }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:["#FEF3C7","#F1F5F9","#FEF0E7"][i], color:["#92400E","#475569","#9A3412"][i], display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                    <Avatar photo={m.photo} name={m.name} size={36} colorIdx={mIdx}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                        <span style={{ fontSize:13, fontWeight: isMe?700:500 }}>{m.name}{isMe?" (you)":""}</span>
                        <span style={{ fontSize:10, background:"#E1F5EE", color:"#085041", padding:"1px 6px", borderRadius:20, fontWeight:500 }}>+{mDone} earned</span>
                      </div>
                      <div style={{ height:5, background:"#f0f0f0", borderRadius:3 }}>
                        <div style={{ height:5, width:pct+"%", background:barColors2[i], borderRadius:3, transition:"width 0.4s" }}/>
                      </div>
                      <div style={{ fontSize:10, color:"#aaa", marginTop:3 }}>{mDone}/{mTotal} tasks · {pct}% completion</div>
                    </div>
                    <div style={{ fontSize:18, fontWeight:700, color:pctColors[i], flexShrink:0 }}>{pct}%</div>
                  </div>
                );
              })}

              {/* Rest of members (not in top 3) */}
              {rest.length > 0 && (
                <div style={{ marginTop:12, padding:"10px 14px", background:"#f9fafb", borderRadius:12, border:"1px solid #eee" }}>
                  <div style={{ fontSize:11, color:"#aaa", marginBottom:8 }}>Not in top 3 this month</div>
                  {rest.map((m, i) => {
                    const mIdx = members.findIndex(x => x.uid === m.uid);
                    const mb = memberBlocks[m.uid]||[];
                    const mDone = mb.filter(b => b.done).length;
                    const pct = Math.round(memberScore(m)*100);
                    return (
                      <div key={m.uid} style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 0", fontSize:12 }}>
                        <Avatar photo={m.photo} name={m.name} size={24} colorIdx={mIdx}/>
                        <span style={{ flex:1, color:"#666" }}>{m.name?.split(" ")[0]}</span>
                        <span style={{ color:"#aaa" }}>{pct}%</span>
                        <span style={{ color:"#BA7517", fontWeight:500 }}>⭐{mDone}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── NOTES ── */}
          {view === "notes" && (
            <div>
              <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>Personal notes from each member — visible to the whole group.</p>
              {members.map((m, i) => {
                const isMe = m.uid === user.uid;
                const noteText = isMe ? myNote : (memberNotes[m.uid] || "");
                const isOpen = noteOpenId === m.uid;
                return (
                  <div key={m.uid} style={{ border:"1px solid #eee", borderRadius:12, marginBottom:8, overflow:"hidden" }}>
                    <div onClick={() => setNoteOpenId(isOpen ? null : m.uid)} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", cursor:"pointer", background: isOpen?"#fafafa":"#fff" }}>
                      <Avatar photo={m.photo} name={m.name} size={28} colorIdx={i}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:500 }}>{m.name}{isMe?" (you)":""}</div>
                        <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>{noteText ? noteText.slice(0,50)+(noteText.length>50?"…":"") : "No notes yet"}</div>
                      </div>
                      <span style={{ color:"#aaa", fontSize:13, display:"inline-block", transform: isOpen?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding:"12px 14px", borderTop:"1px solid #eee" }}>
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
                              <button style={sty.btn} onClick={() => setNoteOpenId(null)}>Cancel</button>
                              <button style={sty.btnSolid} onClick={saveMyNote}>Save note</button>
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
        </div>
      </div>

      {/* ── Add block modal ── */}
      {showAddModal && (
        <div style={sty.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={sty.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Add personal task</h3>
            {[["Activity name","text","newTitle","e.g. Evening walk"],["Time","text","newTime","e.g. 6:00 PM"]].map(([label,,field,ph]) => (
              <div key={field} style={sty.field}>
                <label style={sty.fieldLabel}>{label}</label>
                <input style={sty.fieldInput} value={field==="newTitle"?newTitle:newTime} onChange={e => field==="newTitle"?setNewTitle(e.target.value):setNewTime(e.target.value)} onKeyDown={e => e.key==="Enter"&&addBlock()} placeholder={ph} autoFocus={field==="newTitle"}/>
              </div>
            ))}
            <div style={sty.field}>
              <label style={sty.fieldLabel}>Category</label>
              <select style={sty.fieldInput} value={newCat} onChange={e => setNewCat(e.target.value)}>
                <option value="work">Work</option><option value="health">Health & fitness</option><option value="personal">Personal</option><option value="learn">Learning</option>
              </select>
            </div>
            <div style={sty.field}>
              <label style={sty.fieldLabel}>Note (optional)</label>
              <input style={sty.fieldInput} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Any details…"/>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button style={sty.btn} onClick={() => setShowAddModal(false)}>Cancel</button>
              <button style={sty.btnSolid} onClick={addBlock}>Add task</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {showDeleteModal && (
        <div style={sty.modalOverlay} onClick={() => setShowDeleteModal(false)}>
          <div style={{ ...sty.modal, width:280 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>Delete this task?</h3>
            <p style={{ fontSize:13, color:"#888", marginBottom:16 }}>"{myBlocks.find(b=>b.id===pendingDeleteId)?.title}" will be permanently removed.</p>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={sty.btn} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button style={{ ...sty.btnSolid, background:"#c0392b" }} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sty = {
  btn: { padding:"6px 14px", fontSize:13, border:"1px solid #e5e7eb", borderRadius:8, cursor:"pointer", background:"transparent", color:"#111", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4 },
  btnSolid: { padding:"6px 14px", fontSize:13, border:"none", borderRadius:8, cursor:"pointer", background:"#111", color:"#fff", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4 },
  editInput: { width:"100%", padding:"7px 9px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, fontFamily:"system-ui,sans-serif", color:"#111", background:"#fff", outline:"none" },
  iconBtn: { width:26, height:26, border:"1px solid #ebebeb", borderRadius:6, background:"#fafafa", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 },
  calCell: { background:"#fff", minHeight:60, padding:"4px 5px", position:"relative", display:"flex", flexDirection:"column" },
  calDayNum: { fontSize:10, fontWeight:500, color:"#111", width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center" },
  legendChip: { display:"flex", alignItems:"center", gap:5, background:"#f9fafb", border:"1px solid #eee", borderRadius:20, padding:"3px 10px", fontSize:11, color:"#666" },
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" },
  modal: { background:"#fff", borderRadius:14, padding:22, width:310, border:"1px solid #eee", maxHeight:"90vh", overflowY:"auto" },
  field: { marginBottom:12 },
  fieldLabel: { fontSize:11, color:"#888", display:"block", marginBottom:4 },
  fieldInput: { width:"100%", padding:"8px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, fontFamily:"system-ui,sans-serif", color:"#111", background:"#fff" },
};