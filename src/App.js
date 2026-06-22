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

// Helper — add this ABOVE the App() function
function isWeekPerfect(dayDataMap, year, month, sundayDate) {
  for (let i = 6; i >= 0; i--) {
    const d = new Date(year, month, sundayDate - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const data = dayDataMap[key];
    if (!data || data.done < data.total) return false;
  }
  return true;
}

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

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    const q = query(
      collection(db, "users", user.uid, "days", today, "blocks"),
      orderBy("createdAt")
    );
    return onSnapshot(q, snap => {
      setBlocks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  useEffect(() => {
    if (!user || members.length === 0) return;
    const today = new Date().toISOString().split("T")[0];
    const unsubs = members.map(m => {
      const q = query(
        collection(db, "users", m.uid, "days", today, "blocks"),
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
  }, [user, members]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function addBlock() {
    if (!newTitle.trim()) return;
    const today = new Date().toISOString().split("T")[0];
    const ref = doc(collection(db, "users", user.uid, "days", today, "blocks"));
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
    const today = new Date().toISOString().split("T")[0];
    const ref = doc(db, "users", user.uid, "days", today, "blocks", block.id);
    await updateDoc(ref, { done: !block.done });
    const newBlocks = blocks.map(b => b.id === block.id ? { ...b, done: !b.done } : b);
    const allDone = newBlocks.length > 0 && newBlocks.every(b => b.done);
    if (!block.done && allDone) showToast("🐾 All tasks done! Cat paw earned!");
    else if (!block.done) showToast("⭐ +1 star — " + block.title);
    else showToast("Star removed — " + block.title);
  }

  const myStars = blocks.filter(b => b.done).length;
  const allDone = blocks.length > 0 && blocks.every(b => b.done);
  const today = new Date();

  if (!user) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", gap:16, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ fontSize:40 }}>🐾</div>
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

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:"#FAEEDA", color:"#633806", border:"1px solid #FAC775", borderRadius:10, padding:"8px 18px", fontSize:13, fontWeight:500, zIndex:100, whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}

      {/* Sidebar */}
      <div style={{ width:200, borderRight:"1px solid #eee", background:"#fafafa", display:"flex", flexDirection:"column", flexShrink:0 }}>
        <div style={{ padding:"14px 16px", borderBottom:"1px solid #eee" }}>
          <div style={{ fontWeight:600, fontSize:15 }}>🐾 DaySync</div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{user.displayName}</div>
        </div>
        <div style={{ padding:"10px 8px", flex:1 }}>
          {[["schedule","📅 My schedule"],["calendar","🗓 Calendar"],["progress","📊 Progress"],["leaderboard","🏆 Leaderboard"]].map(([v,label]) => (
            <div key={v} onClick={() => setView(v)} style={{ padding:"8px 10px", borderRadius:8, cursor:"pointer", background: view===v ? "#fff" : "transparent", fontWeight: view===v ? 500 : 400, fontSize:13, color: view===v ? "#000" : "#666", marginBottom:2, border: view===v ? "0.5px solid #eee" : "none" }}>
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

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

        {/* Topbar */}
        <div style={{ padding:"12px 20px", borderBottom:"1px solid #eee", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:500, fontSize:15 }}>
              { view==="schedule" && "My schedule" }
              { view==="calendar" && "Calendar" }
              { view==="progress" && "Group progress" }
              { view==="leaderboard" && "Leaderboard" }
              { allDone && <span style={{ marginLeft:8 }}>🐾</span> }
            </div>
            <div style={{ fontSize:11, color:"#aaa" }}>{today.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" })}</div>
          </div>
          <div style={{ background:"#FAEEDA", color:"#633806", padding:"5px 12px", borderRadius:8, fontSize:13, fontWeight:500 }}>⭐ {myStars} pts</div>
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
                <div key={b.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", border:`1px solid ${b.done ? "#1D9E75" : "#eee"}`, borderRadius:10, marginBottom:6, background: b.done ? "#f0faf6" : "#fff", transition:"all 0.2s" }}>
                  <div style={{ width:3, alignSelf:"stretch", borderRadius:2, flexShrink:0, background: b.category==="work"?"#7F77DD":b.category==="health"?"#1D9E75":b.category==="personal"?"#D85A30":"#378ADD" }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, textDecoration: b.done?"line-through":"none", color: b.done?"#aaa":"#000" }}>{b.title}</div>
                    <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>{b.time} · {CAT_LABELS[b.category]}{b.note ? " · "+b.note : ""}</div>
                  </div>
                  {b.done && <span style={{ fontSize:14, flexShrink:0 }}>⭐</span>}
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
                {Array.from({ length: new Date(calYear, calMonth, 1).getDay() }).map((_,i) => (
                  <div key={"pad"+i} style={{ background:"#fafafa", minHeight:68 }} />
                ))}
                {Array.from({ length: new Date(calYear, calMonth+1, 0).getDate() }).map((_,i) => {
                  const d = i+1;
                  const isToday = d===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
                  const isPast = new Date(calYear, calMonth, d) <= today;
                  // In production this comes from Firestore per-day completion data
                  const mockAllDone = [1,2,5,8,12,16,17,19].includes(d) && calMonth === today.getMonth();
                  const mockStars = mockAllDone ? 5 : [3,9,15,18].includes(d) ? 3 : 0;
                  return (
                    <div key={d} style={{ background:"#fff", minHeight:68, padding:6, position:"relative", outline: isToday?"2px solid #000":"none", outlineOffset:"-2px" }}>
                      <div style={{ fontSize:11, fontWeight: isToday?600:400, width:20, height:20, borderRadius:"50%", background: isToday?"#000":"transparent", color: isToday?"#fff":"#000", display:"flex", alignItems:"center", justifyContent:"center" }}>{d}</div>
                      {isPast && mockStars > 0 && !mockAllDone && (
                        <div style={{ fontSize:10, color:"#BA7517", marginTop:2 }}>⭐{mockStars}</div>
                      )}
                      {mockAllDone && (
                        <div style={{ position:"absolute", bottom:4, right:5, fontSize:20, lineHeight:1 }} title="All tasks completed!">🐾</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize:11, color:"#aaa", textAlign:"center", marginTop:10 }}>🐾 appears when every task for that day is completed</p>
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
      </div>
    </div>
  );
}