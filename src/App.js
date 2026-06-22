import React, { useState, useEffect } from "react";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, setDoc, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc
} from "firebase/firestore";

const CAT_LABELS = { work:"Work", health:"Health & fitness", personal:"Personal", learn:"Learning" };
const BAR_COLORS = ["#7F77DD","#1D9E75","#D85A30","#378ADD"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Small icons
const CATERPILLAR = "🐛";
const BUTTERFLY = "🦋";

export default function App() {
  const [user, setUser] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [view, setView] = useState("schedule");
  const [members, setMembers] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newCat, setNewCat] = useState("work");
  const [newNote, setNewNote] = useState("");
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [memberBlocks, setMemberBlocks] = useState({});
  const [toast, setToast] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Selected date (user can navigate back/forward). Default = today.
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) joinGroup(u);
    });
  }, []);

  async function joinGroup(u) {
    await setDoc(doc(db, "members", u.uid), {
      name: u.displayName,
      photo: u.photoURL,
      uid: u.uid,
      lastSeen: serverTimestamp(),
    }, { merge: true });
  }

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "members"), snap => {
      setMembers(snap.docs.map(d => d.data()));
    });
  }, [user]);

  // Use selectedDate to load blocks for that date
  useEffect(() => {
    if (!user || !selectedDate) return;
    const dateStr = selectedDate.toISOString().split("T")[0];
    const q = query(
      collection(db, "users", user.uid, "days", dateStr, "blocks"),
      orderBy("createdAt")
    );
    return onSnapshot(q, snap => {
      setBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user, selectedDate]);

  // memberBlocks per selectedDate
  useEffect(() => {
    if (!user || members.length === 0 || !selectedDate) return;
    const dateStr = selectedDate.toISOString().split("T")[0];
    const unsubs = members.map(m => {
      const q = query(
        collection(db, "users", m.uid, "days", dateStr, "blocks"),
        orderBy("createdAt")
      );
      return onSnapshot(q, snap => {
        setMemberBlocks(prev => ({
          ...prev,
          [m.uid]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
        }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [user, members, selectedDate]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function addBlock() {
    if (!newTitle.trim() || !user) return;
    const dateStr = selectedDate.toISOString().split("T")[0];
    const ref = doc(collection(db, "users", user.uid, "days", dateStr, "blocks"));
    await setDoc(ref, {
      title: newTitle,
      time: newTime || "TBD",
      category: newCat,
      note: newNote,
      done: false,
      createdAt: serverTimestamp(),
    });
    setNewTitle(""); setNewTime(""); setNewNote("");
  }

  async function toggleDone(block) {
    if (!user) return;
    const dateStr = selectedDate.toISOString().split("T")[0];
    const ref = doc(db, "users", user.uid, "days", dateStr, "blocks", block.id);
    await updateDoc(ref, { done: !block.done });
    const newBlocks = blocks.map(b => b.id === block.id ? { ...b, done: !b.done } : b);
    const allDone = newBlocks.length > 0 && newBlocks.every(b => b.done);
    if (!block.done && allDone) showToast(`${CATERPILLAR} All tasks done! Caterpillar earned!`);
    else if (!block.done) showToast(`${CATERPILLAR} +1 caterpillar — ${block.title}`);
    else showToast(`Caterpillar removed — ${block.title}`);
  }

  const myStars = blocks.filter(b => b.done).length;
  const allDone = blocks.length > 0 && blocks.every(b => b.done);

  // Helper to change selected date
  function changeSelectedDateBy(days) {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      d.setHours(0,0,0,0);
      return d;
    });
  }

  function goToday() {
    const d = new Date();
    d.setHours(0,0,0,0);
    setSelectedDate(d);
  }

  // Sidebar component so it can be rendered in drawer and below calendar
  function SidebarContent() {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
        <div style={{ padding:"14px 16px", borderBottom:"1px solid #eee" }}>
          <div style={{ fontWeight:600, fontSize:15 }}>{CATERPILLAR} DaySync</div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{user?.displayName}</div>
        </div>
        <div style={{ padding:"10px 8px", flex:1 }}>
          {[["schedule","📅 My schedule"],["calendar","🗓 Calendar"],["progress","📊 Progress"],["leaderboard","🏆 Leaderboard"]].map(([v,label]) => (
            <div key={v} onClick={() => { setView(v); setMobileMenuOpen(false); }} style={{ padding:"8px 10px", borderRadius:8, cursor:"pointer", background: view===v ? "#fff" : "transparent", fontWeight: view===v ? 500 : 400, fontSize:13, color: view===v ? "#000" : "#666", marginBottom:2, border: view===v ? "0.5px solid #eee" : "none" }}>
              {label}
            </div>
          ))}
        </div>
        <div style={{ padding:"10px 12px", borderTop:"1px solid #eee" }}>
          <div style={{ fontSize:10, color:"#bbb", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.07em" }}>Members</div>
          {members.map(m => {
            const mb = memberBlocks[m.uid] || [];
            const mStars = mb.filter(b => b.done).length;
            return (
              <div key={m.uid} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0", fontSize:12 }}>
                <img src={m.photo} alt="" style={{ width:22, height:22, borderRadius:"50%", flexShrink:0 }} />
                <span style={{ flex:1, color:"#555", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name?.split(" ")[0]}</span>
                <span style={{ fontSize:11, color:"#BA7517", fontWeight:500 }}>⭐{mStars}</span>
              </div>
            );
          })}
          <button onClick={() => signOut(auth)} style={{ marginTop:8, fontSize:11, color:"#bbb", border:"none", background:"none", cursor:"pointer", padding:0 }}>Sign out</button>
        </div>
      </div>
    );
  }

  // Keep an actual "now" for highlighting the real current day in the calendar
  const now = new Date();
  now.setHours(0,0,0,0);

  // -- CALENDAR: prepare mock data and compute weekly caterpillar counts --
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const mockAllDoneSet = new Set([1,2,5,8,12,16,17,19]); // existing mock positions
  const dayInfos = Array.from({ length: daysInMonth }).map((_, idx) => {
    const d = idx + 1;
    const isToday = d===now.getDate() && calMonth===now.getMonth() && calYear===now.getFullYear();
    const mockAllDone = mockAllDoneSet.has(d) && calMonth === now.getMonth();
    const mockStars = mockAllDone ? 5 : ([3,9,15,18].includes(d) ? 3 : 0);
    return { d, isToday, mockAllDone, mockStars, idx };
  });
  const weeksCount = Math.ceil((firstDayOfMonth + daysInMonth) / 7);
  const caterpillarCounts = Array(weeksCount).fill(0);
  dayInfos.forEach((info, i) => {
    const weekIndex = Math.floor((firstDayOfMonth + i) / 7);
    if (info.mockAllDone) caterpillarCounts[weekIndex]++;
  });

  // If user not signed in: sign-in screen
  if (!user) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:16, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ fontSize:40 }}>{CATERPILLAR}</div>
      <h1 style={{ fontSize:24, fontWeight:600, margin:0 }}>DaySync</h1>
      <p style={{ color:"#888", margin:0 }}>Daily schedule tracker for you and your crew</p>
      <button onClick={() => signInWithPopup(auth, provider)}
        style={{ marginTop:8, padding:"12px 28px", borderRadius:10, border:"none", background:"#000", color:"#fff", fontSize:15, cursor:"pointer", fontFamily:"system-ui,sans-serif" }}>
        Sign in with Google
      </button>
    </div>
  );

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"system-ui,sans-serif", fontSize:14, position:"relative" }}>
      <style>{`
        /* we now use the same behavior on phone and desktop:
           - left sidebar hidden by default
           - use the menu button to open the drawer
           - show sidebar below calendar when view === "calendar"
        */
        .sidebar-below { display:none; }
        .left-sidebar { display:none; } /* hide left sidebar everywhere */
        .block-card { transition: transform .14s ease, box-shadow .14s ease; }
        .block-card:hover { transform: translateY(-6px); box-shadow: 0 10px 20px rgba(20,20,40,0.06); }

        /* menu button and drawer are always available */
        .mobile-menu-button { display:inline-flex; align-items:center; justify-content:center; width:40px; height:36px; border-radius:8px; border:none; background:transparent; font-size:20px; cursor:pointer; margin-right:8px; }
        .mobile-menu-button:active { transform: translateY(1px); }

        .mobile-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.28); z-index:200; display:flex; align-items:flex-start; justify-content:flex-start; padding-top:56px; }
        .mobile-drawer { width:320px; max-width:86%; height:100%; background:#fff; box-shadow:0 20px 40px rgba(20,20,40,0.12); border-right:1px solid #eee; overflow-y:auto; padding:12px; }
        .mobile-drawer .close-btn { display:block; margin:8px 0 12px; padding:8px 12px; border-radius:8px; border:none; background:#f3f3f3; cursor:pointer; }

        /* show below-sidebar area when viewing calendar */
        .sidebar-below { display:block; width:100%; border-top:1px solid #eee; background:#fafafa; padding:12px; }
      `}</style>

      {/* Left sidebar (hidden by design now) */}
      <div className="left-sidebar" style={{ borderRight:"1px solid #eee", background:"#fafafa", display:"flex", flexDirection:"column" }}>
        <SidebarContent />
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* Topbar */}
        <div style={{ padding:"12px 20px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* Menu button (always visible) */}
            <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">☰</button>

            <div>
              <div style={{ fontWeight:500, fontSize:15 }}>
                { view==="schedule" && "My schedule" }
                { view==="calendar" && "Calendar" }
                { view==="progress" && "Group progress" }
                { view==="leaderboard" && "Leaderboard" }
                { allDone && <span style={{ marginLeft:8 }}>{CATERPILLAR}</span> }
              </div>
              <div style={{ fontSize:11, color:"#aaa" }}>
                {/* show the selected date in the topbar */}
                {selectedDate.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" })}
              </div>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {/* Day navigation controls */}
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button onClick={() => changeSelectedDateBy(-1)} style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #ddd", background:"transparent", cursor:"pointer" }}>‹</button>
              <button onClick={goToday} style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #ddd", background:"transparent", cursor:"pointer" }}>Today</button>
              <button onClick={() => changeSelectedDateBy(1)} style={{ padding:"6px 10px", borderRadius:8, border:"1px solid #ddd", background:"transparent", cursor:"pointer" }}>›</button>
            </div>

            <div style={{ background:"#FAEEDA", color:"#633806", padding:"5px 12px", borderRadius:8, fontSize:13, fontWeight:500 }}>⭐ {myStars} pts</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <img src={user.photoURL} alt="" style={{ width:36, height:36, borderRadius:"50%", objectFit:"cover" }} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:20 }}>

          {/* ── SCHEDULE ── */}
          {view === "schedule" && (
            <div>
              <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addBlock()} placeholder="Activity name" style={{ padding:"7px 10px", border:"1px solid #ddd", borderRadius:8, fontSize:13, flex:1, minWidth:120, fontFamily:"system-ui,sans-serif" }} />
                <input value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="e.g. 9:00 AM" style={{ padding:"7px 10px", border:"1px solid #ddd", borderRadius:8, fontSize:13, width:130, fontFamily:"system-ui,sans-serif" }} />
                <select value={newCat} onChange={e => setNewCat(e.target.value)} style={{ padding:"7px 10px", border:"1px solid #ddd", borderRadius:8, fontSize:13, fontFamily:"system-ui,sans-serif" }}>
                  <option value="work">Work</option>
                  <option value="health">Health</option>
                  <option value="personal">Personal</option>
                  <option value="learn">Learning</option>
                </select>
                <button onClick={addBlock} style={{ padding:"7px 18px", background:"#000", color:"#fff", border:"none", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"system-ui,sans-serif" }}>+ Add</button>
              </div>
              {blocks.length === 0 && <div style={{ color:"#bbb", fontSize:13, textAlign:"center", marginTop:40 }}>No blocks yet — type an activity above and press Add</div>}
              {blocks.map(b => (
                <div key={b.id} className="block-card" style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", border:`1px solid ${b.done ? "#1D9E75" : "#eee"}`, borderRadius:10, marginBottom:6, background: b.done ? "#f0faf6" : "#fff", transition:"all 0.2s" }}>
                  <div style={{ width:3, alignSelf:"stretch", borderRadius:2, flexShrink:0, background: b.category==="work"?"#7F77DD":b.category==="health"?"#1D9E75":b.category==="personal"?"#D85A30":"#378ADD" }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, textDecoration: b.done?"line-through":"none", color: b.done?"#aaa":"#000" }}>{b.title}</div>
                    <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>{b.time} · {CAT_LABELS[b.category]}{b.note ? " · "+b.note : ""}</div>
                  </div>
                  {b.done && <span style={{ fontSize:14, flexShrink:0 }}>{CATERPILLAR}</span>}
                  <div onClick={() => toggleDone(b)} style={{ width:22, height:22, borderRadius:"50%", border: b.done?"none":"1.5px solid #ccc", background: b.done?"#1D9E75":"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"white", fontSize:12, flexShrink:0 }}>
                    {b.done ? "✓" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CALENDAR ── */}
          {view === "calendar" && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <button onClick={() => { let m=calMonth-1,y=calYear; if(m<0){m=11;y--;} setCalMonth(m);setCalYear(y); }} style={{ width:28, height:28, border:"1px solid #ddd", borderRadius:6, cursor:"pointer", background:"transparent", fontSize:16 }}>‹</button>
                <span style={{ fontWeight:500, fontSize:14, minWidth:140, textAlign:"center" }}>{MONTHS[calMonth]} {calYear}</span>
                <button onClick={() => { let m=calMonth+1,y=calYear; if(m>11){m=0;y++;} setCalMonth(m);setCalYear(y); }} style={{ width:28, height:28, border:"1px solid #ddd", borderRadius:6, cursor:"pointer", background:"transparent", fontSize:16 }}>›</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1, background:"#eee", border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <div key={d} style={{ background:"#fafafa", textAlign:"center", fontSize:10, fontWeight:500, color:"#999", padding:"6px 0" }}>{d}</div>
                ))}
                {Array.from({ length: firstDayOfMonth }).map((_,i) => (
                  <div key={"pad"+i} style={{ background:"#fafafa", minHeight:68 }} />
                ))}
                {dayInfos.map((info, i) => {
                  const d = info.d;
                  const isToday = info.isToday;
                  const weekIndex = Math.floor((firstDayOfMonth + i) / 7);
                  const isSunday = new Date(calYear, calMonth, d).getDay() === 0;
                  const weekCaterpillars = caterpillarCounts[weekIndex] || 0;
                  const showButterfly = isSunday && weekCaterpillars >= 6;
                  return (
                    <div key={d} style={{ background:"#fff", minHeight:68, padding:6, position:"relative", outline: isToday?"2px solid #000":"none", outlineOffset:"-2px" }}>
                      <div style={{ fontSize:11, fontWeight: isToday?600:400, width:20, height:20, borderRadius:"50%", background: isToday?"#000":"transparent", color: isToday?"#fff":"#000", display:"flex", alignItems:"center", justifyContent:"center" }}>{d}</div>
                      {showButterfly && (
                        <div style={{ position:"absolute", bottom:4, right:5, fontSize:20, lineHeight:1 }} title="Butterfly reward!">{BUTTERFLY}</div>
                      )}
                      {!showButterfly && info.mockAllDone && (
                        <div style={{ position:"absolute", bottom:6, right:6, fontSize:16, lineHeight:1 }} title="All tasks completed!">{CATERPILLAR}</div>
                      )}
                      {!showButterfly && !info.mockAllDone && info.mockStars > 0 && (
                        <div style={{ fontSize:10, color:"#BA7517", marginTop:2 }}>⭐{info.mockStars}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize:11, color:"#aaa", textAlign:"center", marginTop:10 }}>{CATERPILLAR} appears when every task for that day is completed — collect 6 caterpillars in a week to get a {BUTTERFLY} on Sunday</p>
            </div>
          )}

          {/* ── PROGRESS ── */}
          {view === "progress" && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:20 }}>
                {[["My tasks today", blocks.length],["Completed", myStars],["Stars earned","⭐ "+myStars]].map(([l,v]) => (
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
                      <img src={m.photo} alt="" style={{ width:26, height:26, borderRadius:"50%" }} />
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
              <div style={{ fontSize:12, color:"#aaa", marginBottom:14 }}>1 star per completed activity · resets daily at midnight</div>
              {[...members].sort((a,b) => {
                const aS = (memberBlocks[a.uid]||[]).filter(b=>b.done).length;
                const bS = (memberBlocks[b.uid]||[]).filter(b=>b.done).length;
                return bS - aS;
              }).map((m, i) => {
                const mb = memberBlocks[m.uid] || [];
                const mStars = mb.filter(b => b.done).length;
                return (
                  <div key={m.uid} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", border: i===0?"1.5px solid #EF9F27":"1px solid #eee", borderRadius:10, marginBottom:6, background: i===0?"#FAEEDA22":"#fff" }}>
                    <span style={{ fontSize:20, width:28, textAlign:"center" }}>{["🥇","🥈","🥉"][i]||i+1}</span>
                    <img src={m.photo} alt="" style={{ width:30, height:30, borderRadius:"50%" }} />
                    <span style={{ flex:1, fontSize:13, fontWeight: m.uid===user.uid?600:400 }}>{m.name}{m.uid===user.uid ? " (you)":""}</span>
                    <span style={{ fontSize:14, fontWeight:500, color:"#633806" }}>⭐ {mStars} pts</span>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Show sidebar below calendar view (as requested) */}
        <div className="sidebar-below">
          {view === "calendar" && <SidebarContent />}
        </div>

      </div>

      {/* Drawer overlay (menu) */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setMobileMenuOpen(false)}>Close</button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:"#FAEEDA", color:"#633806", border:"1px solid #FAC775", borderRadius:10, padding:"8px 18px", fontSize:13, fontWeight:500, zIndex:100, whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}

    </div>
  );
}