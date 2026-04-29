"use client";
import { useState, useRef, useEffect, createContext, useContext } from "react";

// ── Inject animations ──────────────────────────────────────────────────────────
const STYLES = `
@keyframes shred {
  0%   { transform: translateY(0px) rotate(0deg) scaleX(1); opacity: 1; }
  20%  { transform: translateY(40px) rotate(-2deg) scaleX(0.95); opacity: 0.9; }
  40%  { transform: translateY(20px) rotate(3deg) scaleX(0.6); opacity: 0.7; }
  60%  { transform: translateY(60px) rotate(-4deg) scaleX(0.3); opacity: 0.4; }
  100% { transform: translateY(120px) rotate(6deg) scaleX(0.05); opacity: 0; }
}
@keyframes toss {
  0%   { transform: translateY(0px) rotate(0deg) scale(1); opacity: 1; }
  30%  { transform: translateY(-80px) rotate(-4deg) scale(1.05); opacity: 1; }
  100% { transform: translateY(-420px) rotate(8deg) scale(0.7); opacity: 0; }
}
@keyframes doneFlash {
  0%   { opacity: 0; transform: scale(0.5); }
  40%  { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0; transform: scale(1.4); }
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { overscroll-behavior: none; }
`;

// ── Themes ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#0f0e0c", surface:"#1a1915", card:"#211f1b", cardBack:"#1a1915",
  border:"#2e2c26", accent:"#c9a84c", accentDim:"#8a6f32", green:"#52c77a",
  textPrimary:"#f0ead8", textSecondary:"#7a7060", textMuted:"#4a4438",
  urgent:"#e05252", normal:"#c9a84c", intention:"#7eb8d4",
  shadow:"rgba(0,0,0,0.55)", newBtn:"#c9a84c", newBtnText:"#0f0e0c", selectBg:"#1a1915",
};
const LIGHT = {
  bg:"#f5f2eb", surface:"#ffffff", card:"#ffffff", cardBack:"#faf8f3",
  border:"#ddd8cc", accent:"#8a5c1e", accentDim:"#b07b3a", green:"#2d8f56",
  textPrimary:"#1a1710", textSecondary:"#6b6050", textMuted:"#a09080",
  urgent:"#c0392b", normal:"#8a5c1e", intention:"#2e6e96",
  shadow:"rgba(0,0,0,0.10)", newBtn:"#8a5c1e", newBtnText:"#ffffff", selectBg:"#ffffff",
};

const ThemeCtx = createContext(DARK);
const useTheme = () => useContext(ThemeCtx);

const WORKSPACES = ["Personal", "Sightbox"];
const CATEGORIES = { Sightbox: ["Client Task", "Sightbox Task"], Personal: [] };
const SOURCES_META = [
  { id: "sort-stack", name: "Personal / Sightbox", icon: "🗂" },
  { id: "thompson",   name: "Team Thompson",       icon: "🏠" },
];
const getTypes = (C) => [
  { key: "Normal",    color: C.normal    },
  { key: "Urgent",    color: C.urgent    },
  { key: "Intention", color: C.intention },
];

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiUpdateStatus(pageId, sourceId, status) {
  await fetch("/api/tasks/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId, sourceId, status }),
  });
}

async function apiCreateTask(task) {
  const res = await fetch("/api/tasks/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  return res.json();
}

async function apiRefreshTasks() {
  const res = await fetch("/api/tasks");
  const data = await res.json();
  return data.tasks || [];
}

// ── Small components ───────────────────────────────────────────────────────────
function Tag({ children, color }) {
  const C = useTheme();
  return (
    <span style={{ fontSize:10, fontFamily:"monospace", letterSpacing:"0.08em", textTransform:"uppercase",
      whiteSpace:"nowrap", color:color||C.textSecondary,
      border:`1px solid ${color ? color+"55" : C.border}`, borderRadius:3, padding:"2px 6px" }}>
      {children}
    </span>
  );
}

// ── Swipe Card ─────────────────────────────────────────────────────────────────
const LONG_PRESS_MS = 420;

function SwipeCard({ task, onSwipe, onDone }) {
  const C = useTheme();
  const types = getTypes(C);
  const typeColor = types.find((t) => t.key === task.taskType)?.color || C.normal;

  const [pos, setPos]         = useState({ x:0, y:0 });
  const [dragging, setDragging] = useState(false);
  const [axis, setAxis]       = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [exitAnim, setExitAnim] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [pressProgress, setPressProgress] = useState(0);

  const startPt    = useRef({ x:0, y:0 });
  const hasMoved   = useRef(false);
  const prevY      = useRef(0);
  const velocityY  = useRef(0);
  const longTimer  = useRef(null);
  const pressRaf   = useRef(null);
  const pressStart = useRef(0);

  const startLongPress = () => {
    pressStart.current = performance.now();
    const tick = () => {
      const p = Math.min((performance.now() - pressStart.current) / LONG_PRESS_MS, 1);
      setPressProgress(p);
      if (p < 1) pressRaf.current = requestAnimationFrame(tick);
    };
    pressRaf.current = requestAnimationFrame(tick);
    longTimer.current = setTimeout(() => { setPressProgress(0); setFlipped((f) => !f); }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    clearTimeout(longTimer.current);
    cancelAnimationFrame(pressRaf.current);
    setPressProgress(0);
  };

  const onStart = (cx, cy) => {
    hasMoved.current = false; setAxis(null); setPos({ x:0, y:0 });
    setDragging(true); startPt.current = { x:cx, y:cy };
    prevY.current = cy; velocityY.current = 0;
    startLongPress();
  };
  const onMove = (cx, cy) => {
    if (!dragging) return;
    const dx = cx - startPt.current.x, dy = cy - startPt.current.y;
    velocityY.current = cy - prevY.current; prevY.current = cy;
    if (!hasMoved.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      hasMoved.current = true; cancelLongPress();
      setAxis(Math.abs(dx) >= Math.abs(dy) ? "h" : "v");
    }
    if (!hasMoved.current) return;
    if (Math.abs(dx) >= Math.abs(dy)) setPos({ x:dx, y:0 });
    else setPos({ x:0, y:dy });
  };
  const triggerDone = (type) => {
    setExitAnim(type);
    if (type === "toss") setShowDone(true);
    setTimeout(() => { setShowDone(false); onDone(); }, type === "toss" ? 600 : 500);
  };
  const onEnd = () => {
    if (!dragging) return;
    setDragging(false); cancelLongPress();
    if (!hasMoved.current) { setPos({ x:0, y:0 }); return; }
    const { x, y } = pos;
    if (axis === "v") {
      if (y < -90 && velocityY.current < -2) { triggerDone("toss"); return; }
      if (y > 90)                             { triggerDone("shred"); return; }
    }
    if (axis === "h") {
      if (x > 110)       { setFlipped(false); onSwipe("today"); }
      else if (x < -110) { setFlipped(false); onSwipe("skip"); }
    }
    setPos({ x:0, y:0 });
  };

  const tx = flipped ? 0 : pos.x, ty = flipped ? 0 : pos.y;
  const rotate = flipped ? 0 : pos.x * 0.07;
  const opacity = flipped ? 1 : Math.max(0.35, 1 - (Math.abs(pos.x) + Math.abs(pos.y)) / 320);
  const showToday = !flipped && axis === "h" && pos.x > 30;
  const showSkip  = !flipped && axis === "h" && pos.x < -30;
  const showToss  = !flipped && axis === "v" && pos.y < -50;
  const showShred = !flipped && axis === "v" && pos.y > 50;
  const borderW   = 1 + pressProgress * 3;

  const face = {
    position:"absolute", inset:0, borderRadius:16, padding:"28px",
    backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
    display:"flex", flexDirection:"column", justifyContent:"space-between",
  };

  const animStyle = exitAnim === "toss"  ? { animation:"toss 0.55s cubic-bezier(0.2,0,0.8,1) forwards" }
                  : exitAnim === "shred" ? { animation:"shred 0.45s cubic-bezier(0.4,0,1,1) forwards" }
                  : {};

  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
      {showDone && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:20, pointerEvents:"none" }}>
          <div style={{ fontSize:64, animation:"doneFlash 0.6s ease-out forwards", filter:`drop-shadow(0 0 20px ${C.green})` }}>✓</div>
        </div>
      )}
      <div
        onMouseDown={(e) => onStart(e.clientX, e.clientY)}
        onMouseMove={(e) => onMove(e.clientX, e.clientY)}
        onMouseUp={onEnd} onMouseLeave={onEnd}
        onTouchStart={(e) => onStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchEnd={onEnd}
        style={{
          position:"absolute", inset:0, borderRadius:16,
          cursor:(dragging && hasMoved.current) ? "grabbing" : "grab",
          userSelect:"none", perspective:1000,
          transform:`translateX(${tx}px) translateY(${ty}px) rotate(${rotate}deg)`,
          transition:(dragging || exitAnim) ? "none" : "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          opacity, boxShadow:`0 20px 50px ${C.shadow}`,
          pointerEvents:exitAnim ? "none" : "auto",
          ...animStyle,
        }}
      >
        {pressProgress > 0 && (
          <div style={{ position:"absolute", inset:-2, borderRadius:18, pointerEvents:"none", zIndex:5,
            border:`${borderW}px solid ${typeColor}`, opacity:pressProgress,
            boxShadow:`0 0 ${12 * pressProgress}px ${typeColor}80` }} />
        )}
        <div style={{ position:"absolute", inset:0, transformStyle:"preserve-3d",
          transition:"transform 0.5s cubic-bezier(0.4,0,0.2,1)",
          transform:flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>

          {/* FRONT */}
          <div style={{ ...face, background:C.card, border:`1px solid ${C.border}` }}>
            <div style={{ position:"absolute", top:0, left:28, right:28, height:3, background:typeColor, borderRadius:"0 0 4px 4px", opacity:0.85 }} />
            {showToday && <div style={{ position:"absolute", top:18, left:18, background:C.green, color:"#fff", fontFamily:"monospace", fontWeight:700, fontSize:11, letterSpacing:"0.1em", padding:"4px 10px", borderRadius:4, transform:"rotate(-10deg)", zIndex:10 }}>TODAY</div>}
            {showSkip  && <div style={{ position:"absolute", top:18, right:18, background:C.textMuted, color:C.bg, fontFamily:"monospace", fontWeight:700, fontSize:11, letterSpacing:"0.1em", padding:"4px 10px", borderRadius:4, transform:"rotate(10deg)", zIndex:10 }}>SKIP</div>}
            {showToss  && <div style={{ position:"absolute", inset:0, borderRadius:16, background:`${C.green}18`, display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}><span style={{ fontSize:36, filter:`drop-shadow(0 0 12px ${C.green})` }}>✓</span></div>}
            {showShred && <div style={{ position:"absolute", inset:0, borderRadius:16, background:`${C.urgent}12`, display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}><span style={{ fontSize:28, color:C.urgent, fontFamily:"monospace", letterSpacing:"0.1em", fontWeight:700 }}>SHRED</span></div>}
            <div>
              <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
                <Tag color={typeColor}>{task.taskType}</Tag>
                <Tag>{task.workspace}</Tag>
                {task.category && <Tag>{task.category}</Tag>}
              </div>
              <p style={{ margin:0, fontSize:21, fontFamily:"Georgia, serif", color:C.textPrimary, lineHeight:1.45 }}>{task.title}</p>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace", letterSpacing:"0.06em" }}>
                {pressProgress > 0 ? "HOLD TO FLIP…" : "DRAG · HOLD TO FLIP"}
              </span>
              <div style={{ width:6, height:6, borderRadius:"50%", background:typeColor, opacity:0.7 }} />
            </div>
          </div>

          {/* BACK */}
          <div style={{ ...face, background:C.cardBack, border:`1px solid ${typeColor}50`, transform:"rotateY(180deg)" }}>
            <div style={{ position:"absolute", top:0, left:28, right:28, height:3, background:typeColor, borderRadius:"0 0 4px 4px", opacity:0.4 }} />
            <div style={{ display:"flex", flexDirection:"column", gap:14, overflow:"hidden" }}>
              <p style={{ margin:0, fontSize:10, color:C.accentDim, fontFamily:"monospace", letterSpacing:"0.07em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, paddingBottom:10 }}>
                {task.workspace}{task.category ? ` · ${task.category}` : ""}
              </p>
              {task.notes && (
                <div>
                  <div style={{ fontSize:9, color:C.textMuted, fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>Notes</div>
                  <p style={{ margin:0, fontSize:13.5, color:C.textPrimary, fontFamily:"Georgia, serif", lineHeight:1.65 }}>{task.notes}</p>
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {task.assignee && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:9, color:C.textMuted, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Assignee</span>
                    <span style={{ fontSize:11, color:C.textSecondary, fontFamily:"monospace" }}>{task.assignee}</span>
                  </div>
                )}
                {task.dueDate && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:9, color:C.textMuted, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Due</span>
                    <span style={{ fontSize:11, color:C.urgent, fontFamily:"monospace" }}>{task.dueDate}</span>
                  </div>
                )}
                {task.createdAt && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:9, color:C.textMuted, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"0.08em" }}>Added</span>
                    <span style={{ fontSize:11, color:C.textSecondary, fontFamily:"monospace" }}>{task.createdAt}</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace", letterSpacing:"0.06em" }}>HOLD TO FLIP BACK</span>
              {task.notionUrl && (
                <a href={task.notionUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  style={{ fontSize:10, color:C.accentDim, fontFamily:"monospace", textDecoration:"none", border:`1px solid ${C.border}`, borderRadius:4, padding:"3px 8px" }}>
                  NOTION ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Form ────────────────────────────────────────────────────────────────
function CreateForm({ onSave, onCancel, activeSource }) {
  const C = useTheme();
  const types = getTypes(C);
  const defaultSourceId = activeSource === "all" ? "sort-stack" : activeSource;
  const [formSourceId, setFormSourceId] = useState(defaultSourceId);
  const [form, setForm] = useState({ title:"", workspace:"Personal", category:"", taskType:"Normal", notes:"" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const cats = CATEGORIES[form.workspace] || [];
  const showSourcePicker = activeSource === "all";

  const inp = { width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8,
    color:C.textPrimary, padding:"10px 14px", fontSize:14, fontFamily:"Georgia, serif", outline:"none" };
  const lbl = { fontSize:10, color:C.textSecondary, fontFamily:"monospace", letterSpacing:"0.1em",
    textTransform:"uppercase", marginBottom:6, display:"block" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      {showSourcePicker && (
        <div>
          <label style={lbl}>Deck</label>
          <div style={{ display:"flex", gap:8 }}>
            {SOURCES_META.map((s) => (
              <button key={s.id} onClick={() => setFormSourceId(s.id)} style={{
                flex:1, padding:"9px 6px", borderRadius:8,
                border:`1px solid ${formSourceId === s.id ? C.accent : C.border}`,
                background:formSourceId === s.id ? `${C.accent}18` : "transparent",
                color:formSourceId === s.id ? C.accent : C.textSecondary,
                cursor:"pointer", fontSize:11, fontFamily:"monospace",
              }}>{s.icon} {s.name}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label style={lbl}>Task</label>
        <textarea value={form.title} onChange={(e) => set("title", e.target.value)}
          placeholder="What needs doing?" rows={2} style={{ ...inp, resize:"vertical" }} />
      </div>
      <div>
        <label style={lbl}>Notes</label>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="Context, reminders, links…" rows={2} style={{ ...inp, resize:"vertical" }} />
      </div>
      {formSourceId === "sort-stack" && (
        <div style={{ display:"grid", gridTemplateColumns:cats.length ? "1fr 1fr" : "1fr", gap:12 }}>
          <div>
            <label style={lbl}>Workspace</label>
            <select value={form.workspace} onChange={(e) => { set("workspace", e.target.value); set("category",""); }} style={{ ...inp, cursor:"pointer" }}>
              {WORKSPACES.map((w) => <option key={w}>{w}</option>)}
            </select>
          </div>
          {cats.length > 0 && (
            <div>
              <label style={lbl}>Category</label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                <option value="">— none —</option>
                {cats.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <div>
        <label style={lbl}>Type</label>
        <div style={{ display:"flex", gap:8 }}>
          {types.map((t) => (
            <button key={t.key} onClick={() => set("taskType", t.key)} style={{
              flex:1, padding:"9px 6px", borderRadius:8,
              border:`1px solid ${form.taskType === t.key ? t.color : C.border}`,
              background:form.taskType === t.key ? `${t.color}20` : "transparent",
              color:form.taskType === t.key ? t.color : C.textSecondary,
              cursor:"pointer", fontSize:11, fontFamily:"monospace",
            }}>{t.key}</button>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:4 }}>
        <button onClick={onCancel} style={{ flex:1, padding:"11px", borderRadius:8, border:`1px solid ${C.border}`,
          background:"transparent", color:C.textSecondary, cursor:"pointer", fontFamily:"monospace", fontSize:12 }}>Cancel</button>
        <button onClick={() => form.title.trim() && onSave({ ...form, sourceId:formSourceId })} style={{
          flex:2, padding:"11px", borderRadius:8, border:"none",
          background:C.newBtn, color:C.newBtnText, cursor:"pointer",
          fontFamily:"monospace", fontSize:12, fontWeight:700, letterSpacing:"0.07em",
          opacity:form.title.trim() ? 1 : 0.45,
        }}>ADD TO STACK</button>
      </div>
    </div>
  );
}

// ── Board View ─────────────────────────────────────────────────────────────────
function BoardView({ tasks, onMove }) {
  const C = useTheme();
  const types = getTypes(C);
  const cols = [
    { key:"today", label:"Today", color:C.green },
    { key:"stack", label:"Stack", color:C.accentDim },
    { key:"done",  label:"Done",  color:C.textMuted },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, height:"100%", overflowY:"auto" }}>
      {cols.map((col) => (
        <div key={col.key}>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:col.color }} />
            <span style={{ fontSize:10, color:col.color, fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase" }}>{col.label}</span>
            <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace" }}>({tasks.filter((t) => t.status === col.key).length})</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {tasks.filter((t) => t.status === col.key).map((task) => {
              const tc = types.find((x) => x.key === task.taskType)?.color || C.normal;
              return (
                <div key={task.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`3px solid ${tc}`, borderRadius:10, padding:"12px 14px", boxShadow:`0 2px 8px ${C.shadow}` }}>
                  <p style={{ margin:"0 0 8px", fontSize:13, color:C.textPrimary, fontFamily:"Georgia, serif", lineHeight:1.4 }}>{task.title}</p>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                    <Tag color={tc}>{task.taskType}</Tag>
                    <Tag>{task.workspace}</Tag>
                  </div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {col.key !== "today" && <button onClick={() => onMove(task.id, "today")} style={{ fontSize:10, color:C.green, background:"transparent", border:`1px solid ${C.green}40`, borderRadius:4, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace" }}>→ Today</button>}
                    {col.key !== "stack" && <button onClick={() => onMove(task.id, "stack")} style={{ fontSize:10, color:C.accentDim, background:"transparent", border:`1px solid ${C.accentDim}40`, borderRadius:4, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace" }}>→ Stack</button>}
                    {col.key !== "done"  && <button onClick={() => onMove(task.id, "done")}  style={{ fontSize:10, color:C.textMuted, background:"transparent", border:`1px solid ${C.textMuted}40`, borderRadius:4, padding:"2px 8px", cursor:"pointer", fontFamily:"monospace" }}>✓ Done</button>}
                  </div>
                </div>
              );
            })}
            {tasks.filter((t) => t.status === col.key).length === 0 && (
              <div style={{ padding:"20px 0", textAlign:"center", color:C.textMuted, fontSize:11, fontFamily:"monospace" }}>empty</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Table View ─────────────────────────────────────────────────────────────────
function TableView({ tasks, onMove }) {
  const C = useTheme();
  const types = getTypes(C);
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const fBtn = (key) => ({
    fontSize:10, fontFamily:"monospace", letterSpacing:"0.06em", textTransform:"uppercase",
    padding:"5px 12px", borderRadius:6, cursor:"pointer", transition:"all 0.15s",
    border:`1px solid ${filter === key ? C.accent : C.border}`,
    background:filter === key ? `${C.accent}20` : "transparent",
    color:filter === key ? C.accent : C.textSecondary,
  });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, height:"100%", overflow:"hidden" }}>
      <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
        {["all","today","stack","done"].map((f) => <button key={f} onClick={() => setFilter(f)} style={fBtn(f)}>{f}</button>)}
      </div>
      <div style={{ overflowY:"auto", flex:1 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>{["Task","Type","Workspace","Category","Status",""].map((h) => (
              <th key={h} style={{ textAlign:"left", fontSize:9, color:C.textMuted, fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", padding:"8px 12px", borderBottom:`1px solid ${C.border}` }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {filtered.map((task) => {
              const tc = types.find((x) => x.key === task.taskType)?.color || C.normal;
              return (
                <tr key={task.id} style={{ borderBottom:`1px solid ${C.border}50` }}>
                  <td style={{ padding:"10px 12px", fontSize:13, color:C.textPrimary, fontFamily:"Georgia, serif", maxWidth:260 }}>{task.title}</td>
                  <td style={{ padding:"10px 12px" }}><Tag color={tc}>{task.taskType}</Tag></td>
                  <td style={{ padding:"10px 12px", fontSize:11, color:C.textSecondary, fontFamily:"monospace" }}>{task.workspace}</td>
                  <td style={{ padding:"10px 12px", fontSize:11, color:C.textSecondary, fontFamily:"monospace" }}>{task.category||"—"}</td>
                  <td style={{ padding:"10px 12px" }}><Tag>{task.status}</Tag></td>
                  <td style={{ padding:"10px 12px" }}>
                    <select defaultValue="" onChange={(e) => e.target.value && onMove(task.id, e.target.value)}
                      style={{ background:C.selectBg, border:`1px solid ${C.border}`, color:C.textSecondary, borderRadius:4, fontSize:10, padding:"2px 6px", cursor:"pointer", fontFamily:"monospace" }}>
                      <option value="">Move…</option>
                      {["today","stack","done"].filter((s) => s !== task.status).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding:40, textAlign:"center", color:C.textMuted, fontFamily:"monospace", fontSize:11 }}>no tasks</div>}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function SortStackApp({ initialTasks }) {
  const [dark, setDark] = useState(true);
  const C = dark ? DARK : LIGHT;

  const [tasks, setTasks]           = useState(initialTasks || []);
  const [view, setView]             = useState("swipe");
  const [cardIndex, setCardIndex]   = useState(0);
  const [activeSource, setActiveSource] = useState("all");
  const [syncing, setSyncing]       = useState(false);

  // Inject styles once
  useEffect(() => {
    if (!document.getElementById("ss-styles")) {
      const el = document.createElement("style");
      el.id = "ss-styles"; el.textContent = STYLES;
      document.head.appendChild(el);
    }
  }, []);

  const visibleTasks  = activeSource === "all" ? tasks : tasks.filter((t) => t.sourceId === activeSource);
  const stackTasks    = visibleTasks.filter((t) => t.status === "stack");
  const skippedCount  = visibleTasks.filter((t) => t.status === "skipped").length;
  const todayCount    = visibleTasks.filter((t) => t.status === "today").length;

  const syncStatus = (task, newStatus) => {
    apiUpdateStatus(task.id, task.sourceId, newStatus).catch(console.error);
  };

  const handleSwipe = (direction) => {
    const task = stackTasks[cardIndex];
    if (!task) return;
    if (direction === "today") {
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status:"today" } : t));
      setCardIndex((i) => (i >= stackTasks.length - 2 ? 0 : i));
      syncStatus(task, "today");
    } else {
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status:"skipped" } : t));
      setCardIndex((i) => (i + 1 >= stackTasks.length ? 0 : i + 1));
      syncStatus(task, "skipped");
    }
  };

  const handleDone = () => {
    const task = stackTasks[cardIndex];
    if (!task) return;
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status:"done" } : t));
    setCardIndex((i) => (i >= stackTasks.length - 2 ? 0 : i));
    syncStatus(task, "done");
  };

  const handleCreate = async (form) => {
    const localId = "local-" + Date.now();
    const newTask = { ...form, id:localId, status:"stack", createdAt:"Today", notionUrl:"#" };
    setTasks((prev) => [...prev, newTask]);
    setView("swipe");
    try {
      const result = await apiCreateTask(form);
      if (result?.id) {
        setTasks((prev) => prev.map((t) => t.id === localId ? { ...t, id:result.id, notionUrl:result.url||"#" } : t));
      }
    } catch (e) { console.error("Create failed:", e); }
  };

  const handleMove = (id, status) => {
    const task = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    if (task) syncStatus(task, status);
  };

  const handleResort = () => {
    setTasks((prev) => prev.map((t) => t.status === "skipped" ? { ...t, status:"stack" } : t));
    setCardIndex(0);
  };

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      const fresh = await apiRefreshTasks();
      setTasks(fresh);
      setCardIndex(0);
    } catch (e) { console.error(e); }
    setSyncing(false);
  };

  const navTabs = [
    { key:"swipe", label:"Sort",  icon:"⟷" },
    { key:"board", label:"Board", icon:"⊞" },
    { key:"table", label:"List",  icon:"☰"  },
  ];

  return (
    <ThemeCtx.Provider value={C}>
      <div style={{ background:C.bg, minHeight:"100dvh", color:C.textPrimary, fontFamily:"Georgia, serif", display:"flex", flexDirection:"column", transition:"background 0.35s" }}>

        {/* Header */}
        <div style={{ padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <span style={{ fontSize:15, fontFamily:"monospace", letterSpacing:"0.14em", color:C.accent, textTransform:"uppercase" }}>Stack</span>
            <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace" }}>
              {todayCount > 0 && <span style={{ color:C.green }}>{todayCount} today · </span>}
              {stackTasks.length} in stack
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={handleRefresh} disabled={syncing} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 10px", cursor:"pointer", fontSize:12, color:C.textSecondary }}>
              {syncing ? "…" : "↺"}
            </button>
            <button onClick={() => setDark((d) => !d)} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 11px", cursor:"pointer", fontSize:13, color:C.textSecondary }}>
              {dark ? "☀" : "☾"}
            </button>
            <button onClick={() => setView("create")} style={{ background:C.newBtn, color:C.newBtnText, border:"none", borderRadius:6, padding:"7px 13px", cursor:"pointer", fontSize:11, fontFamily:"monospace", fontWeight:700, letterSpacing:"0.07em" }}>+ NEW</button>
          </div>
        </div>

        {/* Source filter */}
        {view !== "create" && (
          <div style={{ display:"flex", gap:6, padding:"8px 20px", borderBottom:`1px solid ${C.border}`, overflowX:"auto" }}>
            {[{ id:"all", name:"All", icon:"◈" }, ...SOURCES_META].map((s) => (
              <button key={s.id} onClick={() => { setActiveSource(s.id); setCardIndex(0); }} style={{
                fontSize:10, fontFamily:"monospace", letterSpacing:"0.06em", whiteSpace:"nowrap",
                padding:"4px 12px", borderRadius:20, cursor:"pointer", transition:"all 0.15s",
                border:`1px solid ${activeSource === s.id ? C.accent : C.border}`,
                background:activeSource === s.id ? `${C.accent}22` : "transparent",
                color:activeSource === s.id ? C.accent : C.textSecondary,
              }}>{s.icon} {s.name}</button>
            ))}
          </div>
        )}

        {/* Nav */}
        {view !== "create" && (
          <div style={{ display:"flex", borderBottom:`1px solid ${C.border}` }}>
            {navTabs.map((tab) => (
              <button key={tab.key} onClick={() => setView(tab.key)} style={{
                flex:1, padding:"10px", border:"none", background:"transparent",
                color:view === tab.key ? C.accent : C.textMuted, cursor:"pointer",
                fontSize:11, fontFamily:"monospace", letterSpacing:"0.08em",
                borderBottom:`2px solid ${view === tab.key ? C.accent : "transparent"}`,
                transition:"all 0.15s",
              }}>{tab.icon} {tab.label}</button>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex:1, padding:"20px", overflow:"hidden", display:"flex", flexDirection:"column" }}>

          {view === "swipe" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
              {stackTasks.length === 0 ? (
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
                  <div style={{ fontSize:44, filter:`drop-shadow(0 0 16px ${C.green})` }}>✓</div>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ color:C.textPrimary, fontFamily:"Georgia, serif", fontSize:18, margin:"0 0 6px" }}>Deck sorted.</p>
                    <p style={{ color:C.textSecondary, fontFamily:"monospace", fontSize:11, margin:0, letterSpacing:"0.04em" }}>
                      {todayCount} for today{skippedCount > 0 ? ` · ${skippedCount} set aside` : ""}
                    </p>
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    {skippedCount > 0 && (
                      <button onClick={handleResort} style={{ padding:"9px 18px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textSecondary, cursor:"pointer", fontFamily:"monospace", fontSize:11 }}>
                        ↺ RESORT ({skippedCount})
                      </button>
                    )}
                    <button onClick={() => setView("create")} style={{ padding:"9px 18px", borderRadius:8, border:"none", background:C.newBtn, color:C.newBtnText, cursor:"pointer", fontFamily:"monospace", fontSize:11, fontWeight:700 }}>+ NEW CARD</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ position:"relative", width:"100%", maxWidth:380, height:340, marginBottom:24 }}>
                    {stackTasks.slice(cardIndex + 1, cardIndex + 3).reverse().map((_, i) => (
                      <div key={i} style={{ position:"absolute", inset:0, background:C.card, border:`1px solid ${C.border}`, borderRadius:16, transform:`translateY(${(i+1)*-6}px) scale(${1-(i+1)*0.03})`, opacity:0.35-i*0.1 }} />
                    ))}
                    {stackTasks[cardIndex] && <SwipeCard task={stackTasks[cardIndex]} onSwipe={handleSwipe} onDone={handleDone} />}
                  </div>
                  <div style={{ display:"flex", gap:16, alignItems:"center" }}>
                    <button onClick={() => handleSwipe("skip")} style={{ width:52, height:52, borderRadius:"50%", border:`1px solid ${C.border}`, background:C.surface, color:C.textSecondary, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>
                    <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace" }}>{cardIndex+1} / {stackTasks.length}</span>
                    <button onClick={() => handleSwipe("today")} style={{ width:52, height:52, borderRadius:"50%", border:`1px solid ${C.green}50`, background:`${C.green}18`, color:C.green, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>→</button>
                  </div>
                  <div style={{ marginTop:14, display:"flex", gap:24, fontSize:10, color:C.textMuted, fontFamily:"monospace" }}>
                    <span>← skip</span><span>↑ done</span><span>today →</span>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "create" && (
            <div style={{ maxWidth:480, width:"100%", margin:"0 auto" }}>
              <h2 style={{ fontSize:13, color:C.textSecondary, fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:22, marginTop:4 }}>New Card</h2>
              <CreateForm onSave={handleCreate} onCancel={() => setView("swipe")} activeSource={activeSource} />
            </div>
          )}

          {view === "board" && <BoardView tasks={visibleTasks} onMove={handleMove} />}
          {view === "table" && <TableView tasks={visibleTasks} onMove={handleMove} />}
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}
