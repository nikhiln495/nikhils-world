// =============================================================
// NIKHIL'S WORLD — Design Components Bundle
// Generated: 2026-05-25 — For integration into index.html
// Components: TodayTab, StuckOverlay, KaizenBits, KaizenJournal, KaizenTab, RouletteTab
// =============================================================

// ===== TodayTab.jsx =====
// TodayTab.jsx — Nikhil's World, Today tab
// Mobile PWA hi-fi prototype. Dark, Space Mono, accent #a78bfa.

const SPRINTS = {
  S1: { label: 'Urgent',   fg: '#fca5a5', bg: 'rgba(239, 68, 68, 0.14)',  bd: 'rgba(239, 68, 68, 0.38)' },
  S2: { label: 'Deadline', fg: '#fcd34d', bg: 'rgba(245, 158, 11, 0.14)', bd: 'rgba(245, 158, 11, 0.38)' },
  S3: { label: 'Admin',    fg: '#cbd5e1', bg: 'rgba(148, 163, 184, 0.14)',bd: 'rgba(148, 163, 184, 0.38)' },
  S4: { label: 'Creative', fg: '#c4b5fd', bg: 'rgba(167, 139, 250, 0.14)',bd: 'rgba(167, 139, 250, 0.38)' },
  S5: { label: 'Practice', fg: '#5eead4', bg: 'rgba(20, 184, 166, 0.14)', bd: 'rgba(20, 184, 166, 0.38)' },
};

// ─────────────────────────────────────────────────────────────
// Mock data — drawn from real backup so it feels native
// ─────────────────────────────────────────────────────────────
const MOCK = {
  morningSeed:
    'Orientation is not the same as action. Pick the smallest first move and start before you feel ready.',
  stats: {
    protein: 42, proteinTarget: 130,
    steps: 4823,
    hrv: 38, hrvHistory: [31, 34, 33, 37, 41, 39, 38],
  },
  projects: [
    { id: 'perfreview', title: 'Performance Review — Rich + ASMP',  sprint: 'S1', completion: 43, nextSubtask: 'Ask Gemini for raise framing language' },
    { id: 'dsgnappeal', title: 'DSGN F130 Academic Appeal',          sprint: 'S2', completion: 0,  nextSubtask: 'Open appeal doc — read once, no writing' },
    { id: 'asmpq2',     title: 'ASMP Q2 Outreach Metrics',           sprint: 'S2', completion: 60, nextSubtask: 'Render PDF via Playwright' },
    { id: 'vo2',        title: 'Spring VO2 Block — back to 48',      sprint: 'S5', completion: 28, nextSubtask: 'Z2 Smith Lake loop, 85 RPM' },
  ],
  tasks: [
    { id: 't1', title: 'Reply to Richard re: review slot',                sprint: 'S1', estimatedMin: 10, done: false },
    { id: 't2', title: 'Ask Gemini for raise framing language',           sprint: 'S1', estimatedMin: 15, done: false },
    { id: 't3', title: 'Open DSGN appeal doc — read once, no writing',    sprint: 'S2', estimatedMin: 15, done: false },
    { id: 't4', title: 'Reschedule parking pass renewal',                 sprint: 'S3', estimatedMin: 15, done: false },
    { id: 't5', title: 'Write one verse for "Unravelled / Antidote"',     sprint: 'S4', estimatedMin: 25, done: false },
    { id: 't6', title: '60 min Z2 ride — Smith Lake loop',                sprint: 'S5', estimatedMin: 60, done: false },
    { id: 't7', title: 'Voo breath ×3 between sessions',                  sprint: 'S5', estimatedMin: 5,  done: true  },
  ],
};

// ─────────────────────────────────────────────────────────────
// Section 1 — Morning Seed
// ─────────────────────────────────────────────────────────────
function MorningSeed({ text }) {
  const today = new Date('2026-05-24').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).toUpperCase();

  return (
    <div style={{
      position: 'relative', padding: '88px 24px 28px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* pulsing purple glow behind text */}
      <div className="seed-glow" style={{
        position: 'absolute', top: '40%', left: '50%',
        width: 320, height: 160, transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.32) 0%, rgba(167,139,250,0.10) 35%, transparent 70%)',
        pointerEvents: 'none', filter: 'blur(8px)',
      }} />
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        letterSpacing: 2.6, color: 'rgba(255,255,255,0.42)',
        marginBottom: 18, position: 'relative', zIndex: 1,
      }}>
        {today} · MORNING SEED
      </div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 19, lineHeight: 1.45,
        color: '#fafafa', textAlign: 'center', letterSpacing: -0.2,
        textWrap: 'pretty', position: 'relative', zIndex: 1, maxWidth: 320,
      }}>
        {text}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section 2 — Stats cockpit
// ─────────────────────────────────────────────────────────────
function StatCard({ children, style = {} }) {
  return (
    <div style={{
      flex: 1, background: '#111111', border: '1px solid #1f1f1f',
      borderRadius: 14, padding: '12px 12px 14px', minHeight: 96,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      ...style,
    }}>{children}</div>
  );
}

function CardLabel({ children }) {
  return (
    <div style={{
      fontFamily: '"Space Mono", monospace', fontSize: 9,
      letterSpacing: 1.8, color: 'rgba(255,255,255,0.42)',
      textTransform: 'uppercase',
    }}>{children}</div>
  );
}

function ProteinCard({ value, target }) {
  const [w, setW] = React.useState(0);
  const pct = Math.min(100, (value / target) * 100);
  React.useEffect(() => {
    const t = setTimeout(() => setW(pct), 120);
    return () => clearTimeout(t);
  }, [pct]);

  const atTarget = value >= target;
  const fill = atTarget
    ? 'linear-gradient(90deg, #a78bfa 0%, #34d399 100%)'
    : `linear-gradient(90deg, #a78bfa 0%, #c4b5fd ${Math.max(40, pct)}%)`;

  return (
    <StatCard>
      <CardLabel>Protein</CardLabel>
      <div>
        <div style={{
          fontFamily: '"Space Mono", monospace',
          fontSize: 22, color: '#fafafa', lineHeight: 1,
          display: 'flex', alignItems: 'baseline', gap: 3,
        }}>
          {value}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
            /{target}g
          </span>
        </div>
        <div style={{
          marginTop: 10, height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${w}%`, height: '100%', background: fill,
            transition: 'width 1100ms cubic-bezier(.2,.8,.2,1)',
            boxShadow: '0 0 10px rgba(167,139,250,0.5)',
          }} />
        </div>
      </div>
    </StatCard>
  );
}

function StepsCard({ value }) {
  const goal = 8000;
  const pct = Math.min(100, (value / goal) * 100);
  const [dash, setDash] = React.useState(0);
  const C = 2 * Math.PI * 18;
  React.useEffect(() => {
    const t = setTimeout(() => setDash((pct / 100) * C), 120);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <StatCard>
      <CardLabel>Steps</CardLabel>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
          <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" fill="none" />
          <circle cx="22" cy="22" r="18" stroke="#a78bfa" strokeWidth="3.5" fill="none"
            strokeLinecap="round" strokeDasharray={`${dash} ${C}`}
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dasharray 1100ms cubic-bezier(.2,.8,.2,1)' }}
          />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: '"Space Mono", monospace', fontSize: 18,
            color: '#fafafa', lineHeight: 1,
          }}>{value.toLocaleString()}</div>
          <div style={{
            fontFamily: '"Space Mono", monospace', fontSize: 9,
            color: 'rgba(255,255,255,0.42)', marginTop: 4, letterSpacing: 0.6,
          }}>/ {goal.toLocaleString()}</div>
        </div>
      </div>
    </StatCard>
  );
}

function HRVCard({ value, history }) {
  // Sparkline path
  const W = 84, H = 28;
  const min = Math.min(...history), max = Math.max(...history);
  const range = Math.max(1, max - min);
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const last = pts[pts.length - 1];
  const trend = history[history.length - 1] - history[0];
  const trendUp = trend >= 0;

  // Animate stroke draw
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    requestAnimationFrame(() => {
      el.style.transition = 'stroke-dashoffset 1200ms cubic-bezier(.2,.8,.2,1)';
      el.style.strokeDashoffset = 0;
    });
  }, []);

  return (
    <StatCard>
      <CardLabel>HRV</CardLabel>
      <div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 22,
          color: '#fafafa', lineHeight: 1,
          display: 'flex', alignItems: 'baseline', gap: 4,
        }}>
          {value}
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>ms</span>
          <span style={{
            marginLeft: 'auto', fontSize: 10,
            color: trendUp ? '#5eead4' : '#fca5a5',
            display: 'flex', alignItems: 'center', gap: 2,
          }}>
            {trendUp ? '▲' : '▼'} {Math.abs(trend)}
          </span>
        </div>
        <svg width={W} height={H + 4} viewBox={`0 0 ${W} ${H + 4}`} style={{ marginTop: 6, display: 'block', width: '100%' }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="hrvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#hrvFill)" />
          <path ref={ref} d={d} fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last[0]} cy={last[1]} r="2.2" fill="#fafafa" stroke="#a78bfa" strokeWidth="1" />
        </svg>
      </div>
    </StatCard>
  );
}

function StatsCockpit({ stats }) {
  return (
    <div style={{
      padding: '8px 16px 4px', display: 'flex', gap: 8,
    }}>
      <ProteinCard value={stats.protein} target={stats.proteinTarget} />
      <StepsCard value={stats.steps} />
      <HRVCard value={stats.hrv} history={stats.hrvHistory} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section 3 — Active projects strip
// ─────────────────────────────────────────────────────────────
function SprintPill({ sprint, size = 'sm' }) {
  const s = SPRINTS[sprint];
  const px = size === 'sm' ? '3px 7px' : '4px 9px';
  const fs = size === 'sm' ? 9 : 10;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: px, borderRadius: 6,
      background: s.bg, border: `1px solid ${s.bd}`,
      color: s.fg, fontFamily: '"Space Mono", monospace',
      fontSize: fs, letterSpacing: 0.5, fontWeight: 700,
      lineHeight: 1, whiteSpace: 'nowrap',
    }}>
      {sprint} · {s.label}
    </span>
  );
}

function ProjectCard({ project, index }) {
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setW(project.completion), 200 + index * 90);
    return () => clearTimeout(t);
  }, [project.completion, index]);

  const sprintColor = SPRINTS[project.sprint].fg;

  return (
    <div style={{
      flex: '0 0 220px', scrollSnapAlign: 'start',
      background: '#111111', border: '1px solid #1f1f1f',
      borderRadius: 14, padding: '14px 14px 13px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <SprintPill sprint={project.sprint} />
        <span style={{
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
        }}>{project.completion}%</span>
      </div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 13.5,
        color: '#fafafa', lineHeight: 1.3, fontWeight: 700,
        textWrap: 'pretty',
      }}>
        {project.title}
      </div>
      {/* progress bar */}
      <div style={{
        height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${w}%`, height: '100%',
          background: `linear-gradient(90deg, ${sprintColor} 0%, ${sprintColor}cc 100%)`,
          transition: 'width 1200ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: `0 0 8px ${sprintColor}66`,
        }} />
      </div>
      {/* next subtask */}
      <div style={{
        marginTop: 2, paddingTop: 9, borderTop: '1px dashed rgba(255,255,255,0.08)',
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 14, height: 14, marginTop: 1, flexShrink: 0,
          borderRadius: 4, border: '1.5px solid rgba(167,139,250,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 4, height: 4, borderRadius: 1, background: '#a78bfa' }} />
        </div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.78)', lineHeight: 1.35,
          textWrap: 'pretty',
        }}>
          {project.nextSubtask}
        </div>
      </div>
    </div>
  );
}

function ProjectStrip({ projects }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: '0 16px 8px',
      }}>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          letterSpacing: 1.8, color: 'rgba(255,255,255,0.42)',
        }}>
          ACTIVE PROJECTS · {projects.length}
        </div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          color: 'rgba(255,255,255,0.32)',
        }}>swipe →</div>
      </div>
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        padding: '2px 16px 4px', scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
      }} className="hidescroll">
        {projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section 4 — Today's task list
// ─────────────────────────────────────────────────────────────
function TaskRow({ task, onToggle }) {
  const [animating, setAnimating] = React.useState(false);
  const [ripple, setRipple] = React.useState(null);
  const s = SPRINTS[task.sprint];

  const handleTap = (e) => {
    if (task.done || animating) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
    setAnimating(true);
    // After ripple, mark done in parent
    setTimeout(() => {
      onToggle(task.id);
      setAnimating(false);
    }, 520);
  };

  const isStruck = task.done || animating;

  return (
    <div
      onClick={handleTap}
      style={{
        position: 'relative', overflow: 'hidden',
        background: '#111111', border: '1px solid #1f1f1f',
        borderRadius: 12, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: task.done ? 'default' : 'pointer',
        opacity: task.done ? 0.42 : 1,
        transition: 'opacity 380ms ease',
      }}
    >
      {/* ripple */}
      {ripple && (
        <span
          key={ripple.key}
          className="ripple"
          style={{
            position: 'absolute', left: ripple.x, top: ripple.y,
            width: 12, height: 12, marginLeft: -6, marginTop: -6,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${s.fg}66 0%, ${s.fg}00 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* checkbox */}
      <div style={{
        width: 20, height: 20, flexShrink: 0,
        borderRadius: 6,
        border: isStruck ? `1.5px solid ${s.fg}` : '1.5px solid rgba(255,255,255,0.22)',
        background: isStruck ? s.bg : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 220ms ease',
      }}>
        {isStruck && (
          <svg width="11" height="11" viewBox="0 0 11 11">
            <path d="M2 5.5L4.5 8L9 3" stroke={s.fg} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {/* title + sprint */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 13.5,
          color: '#fafafa', lineHeight: 1.3,
          textDecoration: isStruck ? 'line-through' : 'none',
          textDecorationColor: s.fg,
          textDecorationThickness: '1.5px',
          transition: 'text-decoration-color 220ms ease',
        }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SprintPill sprint={task.sprint} />
          <span style={{
            fontFamily: '"Space Mono", monospace', fontSize: 10,
            color: 'rgba(255,255,255,0.45)', letterSpacing: 0.4,
          }}>
            {task.estimatedMin}min
          </span>
        </div>
      </div>
    </div>
  );
}

function TaskList({ tasks, onToggle }) {
  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  const totalMin = open.reduce((s, t) => s + t.estimatedMin, 0);

  return (
    <div style={{ padding: '14px 16px 12px' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10,
      }}>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          letterSpacing: 1.8, color: 'rgba(255,255,255,0.42)',
        }}>TODAY · {open.length} OPEN</div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          color: 'rgba(255,255,255,0.32)',
        }}>~{totalMin}min</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map(t => <TaskRow key={t.id} task={t} onToggle={onToggle} />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section 5 — "I'm Stuck" button + overlay
// ─────────────────────────────────────────────────────────────
function StuckButton({ onClick }) {
  return (
    <div style={{ padding: '6px 16px 24px' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%', padding: '15px 18px',
          background: 'transparent',
          border: '1px solid rgba(167,139,250,0.35)',
          borderRadius: 14, color: '#c4b5fd',
          fontFamily: '"Space Mono", monospace', fontSize: 13.5,
          letterSpacing: 1.2, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}
        className="stuck-btn"
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: '#a78bfa',
          boxShadow: '0 0 10px rgba(167,139,250,0.8)',
        }} />
        I'M STUCK
      </button>
    </div>
  );
}

function StuckCard({ title, sub, icon, onPick }) {
  return (
    <div
      onClick={onPick}
      style={{
        background: 'rgba(17,17,17,0.85)',
        border: '1px solid #1f1f1f',
        borderRadius: 16, padding: '18px 18px 20px',
        cursor: 'pointer',
        display: 'flex', alignItems: 'flex-start', gap: 14,
        backdropFilter: 'blur(20px)',
      }}
      className="stuck-card"
    >
      <div style={{
        width: 40, height: 40, flexShrink: 0,
        borderRadius: 12, background: 'rgba(167,139,250,0.12)',
        border: '1px solid rgba(167,139,250,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#c4b5fd',
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 14,
          color: '#fafafa', fontWeight: 700, marginBottom: 4,
        }}>{title}</div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.55)', lineHeight: 1.45,
        }}>{sub}</div>
      </div>
    </div>
  );
}

function StuckOverlay({ open, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 80,
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.62)',
          backdropFilter: 'blur(8px)',
          opacity: open ? 1 : 0,
          transition: 'opacity 320ms ease',
        }}
      />
      {/* sheet */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#0a0a0a',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: '14px 18px 38px',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 420ms cubic-bezier(.2,.85,.2,1)',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
        border: '1px solid #1f1f1f',
        borderBottom: 'none',
      }}>
        <div style={{
          width: 38, height: 4, background: 'rgba(255,255,255,0.18)',
          borderRadius: 2, margin: '0 auto 18px',
        }} />
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 17,
          color: '#fafafa', textAlign: 'center', marginBottom: 4,
        }}>You're not behind.</div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.5)', textAlign: 'center',
          marginBottom: 18, letterSpacing: 0.3,
        }}>Pick a hand on the shoulder.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StuckCard
            title="Tin Can Protocol"
            sub="Shrink the task. One thing, three minutes. Just pick up the can."
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="4" y="3" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M4 6h10" stroke="currentColor" strokeWidth="1.4"/></svg>}
            onPick={onClose}
          />
          <StuckCard
            title="Voo Breath"
            sub="Three rounds. Long low vowel on the exhale. Drop into the body."
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9c2-4 10-4 12 0M3 9c2 4 10 4 12 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
            onPick={onClose}
          />
          <StuckCard
            title="Talk to Claude"
            sub="Voice or text. Name the loop, say what it's blocking. No fix needed."
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4h12v8H8l-3 3v-3H3V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>}
            onPick={onClose}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom tab bar (visual context, not functional)
// ─────────────────────────────────────────────────────────────
function TabBar() {
  const tabs = [
    { id: 'today', label: 'Today', active: true,  icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" fill="currentColor"/><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id: 'proj',  label: 'Projects', active: false, icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="3" y="9" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="3" y="14" width="9" height="3" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg> },
    { id: 'body',  label: 'Body', active: false, icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 11l3-4 3 5 2-3 3 4 3-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { id: 'spark', label: 'Spark', active: false, icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v3M10 14v3M3 10h3M14 10h3M5 5l2 2M13 13l2 2M5 15l2-2M13 7l2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
      background: 'rgba(10,10,10,0.85)',
      backdropFilter: 'blur(24px) saturate(180%)',
      borderTop: '1px solid #1f1f1f',
      padding: '10px 0 26px',
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => (
        <div key={t.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          color: t.active ? '#a78bfa' : 'rgba(255,255,255,0.4)',
        }}>
          {t.icon}
          <div style={{
            fontFamily: '"Space Mono", monospace', fontSize: 9,
            letterSpacing: 0.8,
          }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main TodayTab
// ─────────────────────────────────────────────────────────────
function TodayTab({
  morningSeed = MOCK.morningSeed,
  stats = MOCK.stats,
  projects = MOCK.projects,
  tasks: tasksProp = MOCK.tasks,
} = {}) {
  const [tasks, setTasks] = React.useState(tasksProp);
  const [stuck, setStuck] = React.useState(false);

  const onToggle = (id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: '#0a0a0a',
    }}>
      {/* Scrollable content */}
      <div style={{
        height: '100%', overflowY: 'auto',
        paddingBottom: 88, // room for tab bar
      }}>
        <MorningSeed text={morningSeed} />
        <StatsCockpit stats={stats} />
        <ProjectStrip projects={projects} />
        <TaskList tasks={tasks} onToggle={onToggle} />
        <StuckButton onClick={() => setStuck(true)} />
      </div>
      {/* Siblings of the scroll region — anchored to the visible device viewport */}
      <TabBar />
      <StuckOverlay open={stuck} onClose={() => setStuck(false)} />
    </div>
  );
}

Object.assign(window, {
  TodayTab, MOCK, SPRINTS,
  MorningSeed, StatsCockpit, ProjectStrip, TaskList,
  StuckButton, StuckOverlay, SprintPill,
});
-e 

// ===== StuckOverlay.jsx =====
// StuckOverlay.jsx — Expanded "I'm Stuck" overlay
// Sectioned, context-aware, sourced from active Shobha framework + tonight's Reduction.
// Replaces the simpler StuckOverlay defined in TodayTab.jsx (loaded after it in the HTML).

// ─────────────────────────────────────────────────────────────
// Mock framework state — would come from Firestore /appdata/active-frameworks
// or from the latest Reduction's "active framework" extraction.
// ─────────────────────────────────────────────────────────────
const SHOBHA_ACTIVE = {
  framework: 'Orient before action · name the alarm · continue',
  latestSession: 'Shobha · May 21',
  patterns: [
    { id: 'doing-wrong', name: '"Doing wrong" alarm',   cue: 'Freeze before starting, not during.' },
    { id: 'orient-act',  name: 'Orientation ≠ action',  cue: 'Knowing what to do isn\'t doing it.' },
    { id: 'belonging',   name: 'Belonging wound',       cue: 'Bracing for not-belonging.' },
    { id: 'all-nothing', name: 'All-or-nothing trap',   cue: 'One bad signal = write off the day.' },
    { id: 'selective',   name: 'Selective abstraction', cue: 'Filtering for evidence you\'re behind.' },
  ],
};

const BRIGHTON_ACTIVE = {
  framework: '7-min dorsal vagal exit · Voo breath',
  protocol: ['Voice + eyes', 'Voo ×5', 'Eye sweeps', 'Head turns', 'Elbows 30s', 'Side-roll exit'],
};

// ─────────────────────────────────────────────────────────────
// Icon helpers
// ─────────────────────────────────────────────────────────────
const Icons = {
  voo:     <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9c2-4 10-4 12 0M3 9c2 4 10 4 12 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  tincan:  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="4" y="3" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M4 6h10" stroke="currentColor" strokeWidth="1.4"/></svg>,
  vagal:   <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/><circle cx="9" cy="9" r="2" fill="currentColor"/></svg>,
  needs:   <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3L11 7L15 7L12 10L13 14L9 12L5 14L6 10L3 7L7 7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  pattern: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="5" cy="5" r="1.2" fill="currentColor"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="13" cy="13" r="1.2" fill="currentColor"/></svg>,
  reframe: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9c0-3 3-6 6-6M15 9c0 3-3 6-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M3 9l-2-2M3 9l-2 2M15 9l2-2M15 9l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  remote:  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="6" y="2" width="6" height="14" rx="1.4" stroke="currentColor" strokeWidth="1.4"/><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="13" r="1" fill="currentColor"/></svg>,
  claude:  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4h12v8H8l-3 3v-3H3V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  voice:   <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="7" y="2" width="4" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M4 9a5 5 0 0010 0M9 14v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  bubbess: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 16c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  focus:   <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/><circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4"/></svg>,
};

// ─────────────────────────────────────────────────────────────
// Card row
// ─────────────────────────────────────────────────────────────
function StuckCard({ icon, title, sub, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className="stuck-card"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        width: '100%', textAlign: 'left',
        background: 'rgba(17,17,17,0.85)',
        border: '1px solid #1f1f1f',
        borderRadius: 12, padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 220ms ease',
      }}
    >
      <div style={{
        width: 32, height: 32, flexShrink: 0,
        borderRadius: 8, background: 'rgba(167,139,250,0.12)',
        border: '1px solid rgba(167,139,250,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#c4b5fd',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 3,
        }}>
          <div style={{
            fontFamily: '"Space Mono", monospace', fontSize: 12.5,
            color: '#fafafa', fontWeight: 700,
          }}>{title}</div>
          {badge && (
            <span style={{
              fontFamily: '"Space Mono", monospace', fontSize: 9,
              letterSpacing: 0.6, color: 'rgba(255,255,255,0.42)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4, padding: '1px 5px',
            }}>{badge}</span>
          )}
        </div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.55)', lineHeight: 1.45,
          textWrap: 'pretty',
        }}>{sub}</div>
      </div>
    </button>
  );
}

function StuckSection({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 9,
        letterSpacing: 1.8, color: 'rgba(255,255,255,0.42)',
        textTransform: 'uppercase', marginBottom: 8,
        padding: '0 2px',
      }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Voo breath — animated 3-round breathing
// ─────────────────────────────────────────────────────────────
function VooBreath({ onComplete, onCancel }) {
  const [round, setRound] = React.useState(1);
  const [phase, setPhase] = React.useState('inhale'); // 'inhale' | 'exhale' | 'done'
  const TOTAL = 3;

  React.useEffect(() => {
    if (round > TOTAL) { setPhase('done'); return; }
    const inhaleMs = 4000, exhaleMs = 6000;
    setPhase('inhale');
    const tIn = setTimeout(() => setPhase('exhale'), inhaleMs);
    const tEx = setTimeout(() => setRound(r => r + 1), inhaleMs + exhaleMs);
    return () => { clearTimeout(tIn); clearTimeout(tEx); };
  }, [round]);

  return (
    <div style={{
      padding: '4px 4px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: 320,
    }}>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        letterSpacing: 2, color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        {phase === 'done' ? 'Body received' : `Voo breath · round ${Math.min(round, TOTAL)} of ${TOTAL}`}
      </div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 14,
        color: '#fafafa', marginBottom: 28,
      }}>
        {phase === 'inhale' && 'Breathe in.'}
        {phase === 'exhale' && 'Low voo on the exhale…'}
        {phase === 'done'   && 'Three rounds complete.'}
      </div>

      {/* Breathing circle */}
      <div style={{
        width: 180, height: 180, position: 'relative',
        marginBottom: 32,
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.32) 0%, rgba(167,139,250,0.08) 60%, transparent 100%)',
          transform: phase === 'inhale' ? 'scale(1.35)' : 'scale(1)',
          transition: phase === 'inhale' ? 'transform 4s cubic-bezier(.4,.2,.2,1)' : 'transform 6s cubic-bezier(.4,.2,.2,1)',
        }} />
        <div style={{
          position: 'absolute', inset: 35,
          borderRadius: '50%',
          border: '1px solid rgba(167,139,250,0.45)',
          background: 'rgba(167,139,250,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: phase === 'inhale' ? 'scale(1.2)' : 'scale(1)',
          transition: phase === 'inhale' ? 'transform 4s cubic-bezier(.4,.2,.2,1)' : 'transform 6s cubic-bezier(.4,.2,.2,1)',
        }}>
          <span style={{
            fontFamily: '"Space Mono", monospace', fontSize: 13,
            color: '#c4b5fd', letterSpacing: 1.5,
          }}>
            {phase === 'done' ? '✓' : (phase === 'inhale' ? 'in' : 'voo')}
          </span>
        </div>
      </div>

      {phase === 'done' ? (
        <button
          onClick={onComplete}
          style={{
            padding: '12px 22px',
            background: 'linear-gradient(135deg, rgba(167,139,250,0.2) 0%, rgba(167,139,250,0.08) 100%)',
            border: '1px solid rgba(167,139,250,0.4)',
            borderRadius: 10, color: '#c4b5fd',
            fontFamily: '"Space Mono", monospace', fontSize: 12,
            letterSpacing: 1, cursor: 'pointer',
          }}
        >RETURN</button>
      ) : (
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, color: 'rgba(255,255,255,0.55)',
            fontFamily: '"Space Mono", monospace', fontSize: 11,
            cursor: 'pointer', letterSpacing: 0.6,
          }}
        >back to menu</button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tin Can timer — 3-minute countdown
// ─────────────────────────────────────────────────────────────
function TinCanTimer({ onComplete, onCancel }) {
  const TOTAL = 180;
  const [left, setLeft] = React.useState(TOTAL);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!running) return;
    if (left <= 0) return;
    const id = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [running, left]);

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const pct = ((TOTAL - left) / TOTAL) * 100;

  return (
    <div style={{
      padding: '4px 4px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: 320,
    }}>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        letterSpacing: 2, color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase', marginBottom: 8,
      }}>Tin Can Protocol</div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 14,
        color: '#fafafa', marginBottom: 6,
        textAlign: 'center', textWrap: 'pretty', padding: '0 16px',
      }}>
        Smallest possible move. Pick up the can.
      </div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 11.5,
        color: 'rgba(255,255,255,0.55)', marginBottom: 28,
        textAlign: 'center', textWrap: 'pretty', padding: '0 16px',
        fontStyle: 'italic',
      }}>
        Not the work. Not even the start. Just the can.
      </div>

      {/* Circular timer */}
      <div style={{
        width: 180, height: 180, position: 'relative',
        marginBottom: 24,
      }}>
        <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="90" cy="90" r="78" stroke="rgba(255,255,255,0.06)" strokeWidth="3" fill="none" />
          <circle cx="90" cy="90" r="78" stroke="#a78bfa" strokeWidth="3" fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * (2 * Math.PI * 78)} ${2 * Math.PI * 78}`}
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <span style={{
            fontFamily: '"Space Mono", monospace', fontSize: 32,
            color: '#fafafa', letterSpacing: -0.5,
          }}>{mm}:{ss}</span>
          <span style={{
            fontFamily: '"Space Mono", monospace', fontSize: 10,
            color: 'rgba(255,255,255,0.42)', letterSpacing: 1.4,
            marginTop: 2,
          }}>{left === 0 ? 'DONE' : (running ? 'GO' : 'READY')}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {left === 0 ? (
          <button
            onClick={onComplete}
            style={{
              padding: '12px 22px',
              background: 'linear-gradient(135deg, rgba(167,139,250,0.2) 0%, rgba(167,139,250,0.08) 100%)',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 10, color: '#c4b5fd',
              fontFamily: '"Space Mono", monospace', fontSize: 12,
              letterSpacing: 1, cursor: 'pointer',
            }}
          >CAN PICKED UP</button>
        ) : (
          <button
            onClick={() => setRunning(r => !r)}
            style={{
              padding: '12px 22px',
              background: running
                ? 'rgba(255,255,255,0.04)'
                : 'linear-gradient(135deg, rgba(167,139,250,0.2) 0%, rgba(167,139,250,0.08) 100%)',
              border: `1px solid ${running ? 'rgba(255,255,255,0.15)' : 'rgba(167,139,250,0.4)'}`,
              borderRadius: 10,
              color: running ? 'rgba(255,255,255,0.7)' : '#c4b5fd',
              fontFamily: '"Space Mono", monospace', fontSize: 12,
              letterSpacing: 1, cursor: 'pointer',
            }}
          >{running ? 'PAUSE' : 'START'}</button>
        )}
        <button
          onClick={onCancel}
          style={{
            padding: '12px 18px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, color: 'rgba(255,255,255,0.55)',
            fontFamily: '"Space Mono", monospace', fontSize: 11,
            cursor: 'pointer', letterSpacing: 0.6,
          }}
        >back</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pattern naming — chips of active patterns
// ─────────────────────────────────────────────────────────────
function PatternNaming({ patterns, onName, onCancel }) {
  const [named, setNamed] = React.useState(null);
  return (
    <div style={{ padding: '4px 4px 20px', minHeight: 320 }}>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        letterSpacing: 2, color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase', marginBottom: 8, textAlign: 'center',
      }}>Name the pattern</div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 13,
        color: '#fafafa', marginBottom: 20, textAlign: 'center',
        lineHeight: 1.45, textWrap: 'pretty', padding: '0 8px',
      }}>
        Naming it is the intervention. Tap the one that's running right now.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {patterns.map(p => (
          <button
            key={p.id}
            onClick={() => { setNamed(p); setTimeout(() => onName(p), 800); }}
            disabled={!!named}
            style={{
              padding: '12px 14px',
              background: named?.id === p.id
                ? 'linear-gradient(90deg, rgba(167,139,250,0.22) 0%, rgba(167,139,250,0.06) 100%)'
                : 'rgba(17,17,17,0.85)',
              border: `1px solid ${named?.id === p.id ? 'rgba(167,139,250,0.5)' : '#1f1f1f'}`,
              borderRadius: 10,
              color: named?.id === p.id ? '#c4b5fd' : '#fafafa',
              fontFamily: '"Space Mono", monospace', fontSize: 12.5,
              textAlign: 'left', cursor: 'pointer',
              transition: 'all 280ms ease',
              opacity: named && named.id !== p.id ? 0.3 : 1,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 3 }}>{p.name}</div>
            <div style={{
              fontSize: 10.5, color: 'rgba(255,255,255,0.5)',
              fontStyle: 'italic',
            }}>{p.cue}</div>
          </button>
        ))}
      </div>
      {!named && (
        <button
          onClick={onCancel}
          style={{
            marginTop: 14,
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, color: 'rgba(255,255,255,0.55)',
            fontFamily: '"Space Mono", monospace', fontSize: 11,
            cursor: 'pointer', letterSpacing: 0.6,
            display: 'block', marginLeft: 'auto', marginRight: 'auto',
          }}
        >back to menu</button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Confirm flash — brief toast inside the sheet
// ─────────────────────────────────────────────────────────────
function ConfirmFlash({ message }) {
  return (
    <div style={{
      padding: '16px 18px', minHeight: 320,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'rgba(167,139,250,0.14)',
        border: '1px solid rgba(167,139,250,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
      }}>
        <span style={{ color: '#c4b5fd', fontSize: 24 }}>✓</span>
      </div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 15,
        color: '#fafafa', textAlign: 'center', marginBottom: 8,
        textWrap: 'pretty', maxWidth: 320,
      }}>{message}</div>
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8,
        textTransform: 'uppercase',
      }}>logged · surfaces in tonight's reduction</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main expanded StuckOverlay
// ─────────────────────────────────────────────────────────────
function StuckOverlay({ open, onClose, reduction }) {
  const [stage, setStage] = React.useState('menu');
  const [confirmation, setConfirmation] = React.useState(null);

  // Reset stage when overlay closes
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStage('menu');
        setConfirmation(null);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [open]);

  const fallbackReduction = {
    arcNote: 'Today\'s entry point is to read the comments once without responding. The "doing wrong" alarm will fire — name it and proceed.',
    date: 'May 24',
  };
  const r = reduction || fallbackReduction;

  const flash = (message) => {
    setStage('confirm');
    setConfirmation(message);
    setTimeout(() => {
      onClose();
    }, 1800);
  };

  const renderStage = () => {
    if (stage === 'voo') return (
      <VooBreath
        onComplete={() => flash('Body received. The arc holds.')}
        onCancel={() => setStage('menu')}
      />
    );
    if (stage === 'tincan') return (
      <TinCanTimer
        onComplete={() => flash('The can is picked up. That counts.')}
        onCancel={() => setStage('menu')}
      />
    );
    if (stage === 'pattern') return (
      <PatternNaming
        patterns={SHOBHA_ACTIVE.patterns}
        onName={(p) => flash(`Named: ${p.name}. Keep going.`)}
        onCancel={() => setStage('menu')}
      />
    );
    if (stage === 'confirm') return <ConfirmFlash message={confirmation} />;

    // Default — menu
    return (
      <div>
        {/* Header */}
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 17,
          color: '#fafafa', textAlign: 'center', marginBottom: 4,
          textWrap: 'pretty',
        }}>You're not behind.</div>
        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.5)', textAlign: 'center',
          marginBottom: 18, letterSpacing: 0.3,
        }}>Pick a hand on the shoulder.</div>

        {/* Tonight's arc — sourced from Reduction */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(167,139,250,0.10) 0%, rgba(167,139,250,0.02) 100%)',
          border: '1px solid rgba(167,139,250,0.22)',
          borderRadius: 12, padding: '12px 14px',
          marginBottom: 18,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 8,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: '#a78bfa',
              boxShadow: '0 0 6px rgba(167,139,250,0.8)',
            }} />
            <span style={{
              fontFamily: '"Space Mono", monospace', fontSize: 9,
              letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
            }}>FROM TODAY'S REDUCTION · {r.date}</span>
          </div>
          <div style={{
            fontFamily: '"Space Mono", monospace', fontSize: 12,
            color: '#c4b5fd', lineHeight: 1.5, marginBottom: 8,
            textWrap: 'pretty',
          }}>{r.arcNote}</div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            <span style={{
              fontFamily: '"Space Mono", monospace', fontSize: 9,
              letterSpacing: 0.6, color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4, padding: '2px 6px',
              textTransform: 'uppercase',
            }}>active framework</span>
            <span style={{
              fontFamily: '"Space Mono", monospace', fontSize: 10,
              color: 'rgba(255,255,255,0.7)',
            }}>{SHOBHA_ACTIVE.framework}</span>
          </div>
          <div style={{
            fontFamily: '"Space Mono", monospace', fontSize: 9,
            color: 'rgba(255,255,255,0.32)', letterSpacing: 0.4,
            marginTop: 4,
          }}>Source · {SHOBHA_ACTIVE.latestSession}</div>
        </div>

        <StuckSection label="In the body">
          <StuckCard
            icon={Icons.voo}
            title="Voo breath"
            sub="Three rounds. Long low vowel on the exhale. Drop into the body."
            badge="~30s"
            onClick={() => setStage('voo')}
          />
          <StuckCard
            icon={Icons.tincan}
            title="Tin Can Protocol"
            sub="Shrink the task. Three minutes. Just pick up the can."
            badge="3min"
            onClick={() => setStage('tincan')}
          />
          <StuckCard
            icon={Icons.needs}
            title="Body needs check"
            sub="Hungry? Cold? Tired? Bathroom? Unmet needs contaminate every decision."
            badge="60s"
            onClick={() => flash('Checked. Don\'t override what surfaced.')}
          />
        </StuckSection>

        <StuckSection label="In the mind">
          <StuckCard
            icon={Icons.pattern}
            title="Name the pattern"
            sub="Doing-wrong alarm, all-or-nothing, selective abstraction. Pick the one running."
            badge="Shobha"
            onClick={() => setStage('pattern')}
          />
          <StuckCard
            icon={Icons.reframe}
            title='Replace "should" with "can"'
            sub="Shobha tool. Read the next thought, swap the word. Notice what changes."
            onClick={() => flash('Swapped. The next thought is yours, not borrowed.')}
          />
          <StuckCard
            icon={Icons.remote}
            title="Whose remote?"
            sub="Yours vs theirs. Name what you actually control here."
            onClick={() => flash('Remote handed back. Eyes forward.')}
          />
        </StuckSection>

        <StuckSection label="Reach out">
          <StuckCard
            icon={Icons.claude}
            title="Talk to Claude"
            sub="Voice or text. Name the loop, say what it's blocking. No fix needed."
            onClick={() => flash('Channel open. Speak when ready.')}
          />
          <StuckCard
            icon={Icons.voice}
            title="Voice memo for Shobha"
            sub="Record what's loud right now. Goes in the session note."
            onClick={() => flash('Memo started. Stop when you\'re done.')}
          />
          <StuckCard
            icon={Icons.bubbess}
            title="Sit near Bubbess"
            sub="Body doubling. No conversation required. Just shared room."
            onClick={() => flash('Move toward shared room.')}
          />
          <StuckCard
            icon={Icons.focus}
            title="Focusmate"
            sub="50-minute session. Camera off OK. Externalized accountability."
            onClick={() => flash('Open Focusmate when ready.')}
          />
        </StuckSection>

        <div style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          color: 'rgba(255,255,255,0.32)', textAlign: 'center',
          marginTop: 8, letterSpacing: 0.4, lineHeight: 1.5,
          textWrap: 'pretty',
        }}>
          Whatever you pick gets logged. Tonight's Reduction will know you were here.
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 80,
      pointerEvents: open ? 'auto' : 'none',
    }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.66)',
          backdropFilter: 'blur(8px)',
          opacity: open ? 1 : 0,
          transition: 'opacity 320ms ease',
        }}
      />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#0a0a0a',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: '14px 18px 38px',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 420ms cubic-bezier(.2,.85,.2,1)',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
        border: '1px solid #1f1f1f',
        borderBottom: 'none',
        maxHeight: '88%', overflowY: 'auto',
      }}>
        <div style={{
          width: 38, height: 4, background: 'rgba(255,255,255,0.18)',
          borderRadius: 2, margin: '0 auto 16px',
          position: 'sticky', top: 0,
        }} />
        {renderStage()}
      </div>
    </div>
  );
}

Object.assign(window, { StuckOverlay, SHOBHA_ACTIVE, BRIGHTON_ACTIVE });
-e 

// ===== KaizenJournal.jsx =====
// KaizenJournal.jsx — daily log section (brain dump, wins, highlight, reflection)
// Preserves the original Kaizen3 log fields. Inline editable, autosaves on blur.

// ─────────────────────────────────────────────────────────────
// Mock today's journal — would come from Firestore /appdata/kaizen3_logs/{today}
// ─────────────────────────────────────────────────────────────
const JOURNAL_TODAY = {
  date: '2026-05-24',
  highlight: '',
  brainBits: [
    { id: 'bb1', text: 'Anxious about Wed review — keeps showing up between tasks.', at: '2026-05-24T10:14:00Z' },
    { id: 'bb2', text: 'Z2 ride helped. Body reset thing actually works.', at: '2026-05-24T16:45:00Z' },
    { id: 'bb3', text: 'Jennifer Lawrence is giving raccoon with a raven\'s frontal lobe in a peacock\'s dress', at: '2026-05-24T19:50:00Z' },
  ],
  wins: [
    { id: 'w1', text: 'Sent appeal docs draft to academic advisor', at: '09:14' },
    { id: 'w2', text: 'Z2 Goldhill ride, 85 RPM cadence held', at: '11:42' },
    { id: 'w3', text: 'Brain dump in Drive doc (not the app field)', at: '14:08' },
  ],
  reflection: '',
};

// ─────────────────────────────────────────────────────────────
// Brain Bits — timestamped thought chunks (replaces brainDump)
// Storage key: kaizen3:logs[date].brainBits = [{id,text,at}]
// ─────────────────────────────────────────────────────────────
function BrainBit({ bit, onEdit, onDelete }) {
  const [hovered, setHovered] = React.useState(false);
  const EditableText = window.EditableText;
  const t = new Date(bit.at);
  const timeLabel = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <span style={{
        fontFamily: '"Space Mono", monospace', fontSize: 9,
        color: 'rgba(255,255,255,0.35)', letterSpacing: 0.6,
        marginTop: 3, flexShrink: 0, width: 40, textAlign: 'right',
      }}>{timeLabel}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <EditableText
          value={bit.text}
          onChange={(v) => onEdit({ ...bit, text: v })}
          multiline={true}
          style={{
            fontFamily: '"Space Mono", monospace', fontSize: 12.5,
            color: '#fafafa', lineHeight: 1.5,
          }}
          placeholder="Edit…"
        />
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(bit.id); }}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)', fontSize: 14, lineHeight: 1,
          opacity: hovered ? 0.7 : 0, transition: 'opacity 220ms ease',
          flexShrink: 0, padding: '2px 4px',
        }}
        title="Delete"
      >×</button>
    </div>
  );
}

function BrainBitsInput({ onAdd }) {
  const [text, setText] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const ref = React.useRef(null);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed) { onAdd(trimmed); setText(''); }
    setFocused(false);
  };

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '8px 0',
      borderBottom: focused ? '1px solid rgba(167,139,250,0.35)' : '1px solid transparent',
      transition: 'border-color 220ms ease',
    }}>
      <span style={{
        fontFamily: '"Space Mono", monospace', fontSize: 9,
        color: 'rgba(255,255,255,0.22)', letterSpacing: 0.6,
        marginTop: 3, flexShrink: 0, width: 40, textAlign: 'right',
      }}>now</span>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { setText(''); setFocused(false); }
        }}
        placeholder="What's on your mind? (Enter to log)"
        rows={focused ? 2 : 1}
        style={{
          flex: 1, resize: 'none',
          background: 'transparent', border: 'none',
          fontFamily: '"Space Mono", monospace', fontSize: 12.5,
          color: '#fafafa', lineHeight: 1.5,
          outline: 'none',
          transition: 'height 180ms ease',
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Quick-add wins row
// ─────────────────────────────────────────────────────────────
function QuickAddWin({ onAdd }) {
  const [text, setText] = React.useState('');
  const submit = () => {
    if (text.trim()) {
      onAdd(text.trim());
      setText('');
    }
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'rgba(94,234,212,0.7)',
        boxShadow: '0 0 6px rgba(94,234,212,0.6)',
        flexShrink: 0,
      }} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        onBlur={submit}
        placeholder="What I just did…"
        style={{
          flex: 1, minWidth: 0,
          background: 'transparent', border: 'none',
          borderBottom: '1px dashed rgba(255,255,255,0.08)',
          padding: '4px 2px',
          fontFamily: '"Space Mono", monospace', fontSize: 12,
          color: '#fafafa', outline: 'none',
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Win row — strike + delete on hover
// ─────────────────────────────────────────────────────────────
function WinRow({ win, onEdit, onDelete }) {
  const [hovered, setHovered] = React.useState(false);
  const EditableText = window.EditableText;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 0',
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'rgba(94,234,212,0.7)',
        boxShadow: '0 0 6px rgba(94,234,212,0.6)',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <EditableText
          value={win.text}
          onChange={(v) => onEdit({ ...win, text: v })}
          style={{
            fontFamily: '"Space Mono", monospace', fontSize: 12.5,
            color: '#fafafa',
          }}
        />
      </div>
      <span style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        color: 'rgba(255,255,255,0.35)', flexShrink: 0,
        letterSpacing: 0.4,
      }}>{win.at}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(win.id); }}
        style={{
          width: 18, height: 18, padding: 0,
          background: 'transparent', border: 'none',
          cursor: 'pointer', flexShrink: 0,
          opacity: hovered ? 0.65 : 0,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 14, lineHeight: 1,
          transition: 'opacity 220ms ease',
        }}
        title="Delete win"
      >×</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main KaizenJournal — collapsible section
// ─────────────────────────────────────────────────────────────
function KaizenJournal({ journal, onUpdate }) {
  const [expanded, setExpanded] = React.useState(false);
  const EditableText = window.EditableText;

  const set = (key, value) => onUpdate({ ...journal, [key]: value });

  const addBit = (text) => {
    const bit = { id: `bb_${Math.random().toString(36).slice(2, 8)}`, text, at: new Date().toISOString() };
    set('brainBits', [bit, ...(journal.brainBits || [])]);
  };
  const editBit = (updated) => {
    set('brainBits', (journal.brainBits || []).map(b => b.id === updated.id ? updated : b));
  };
  const deleteBit = (id) => {
    set('brainBits', (journal.brainBits || []).filter(b => b.id !== id));
  };

  const addWin = (text) => {
    const at = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    set('wins', [...journal.wins, { id: `w_${Math.random().toString(36).slice(2, 8)}`, text, at }]);
  };
  const editWin = (updated) => set('wins', journal.wins.map(w => w.id === updated.id ? updated : w));
  const deleteWin = (id) => set('wins', journal.wins.filter(w => w.id !== id));

  const bits = journal.brainBits || [];
  const summary = [
    journal.wins.length && `${journal.wins.length} win${journal.wins.length === 1 ? '' : 's'}`,
    bits.length && `${bits.length} bit${bits.length === 1 ? '' : 's'}`,
    journal.reflection?.trim() && 'reflection',
    journal.highlight?.trim() && 'highlight',
  ].filter(Boolean).join(' · ') || 'empty — tap to add';

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '10px 12px',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: '#5eead4',
          boxShadow: '0 0 6px rgba(94,234,212,0.6)',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          letterSpacing: 1.4, color: 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase', flexShrink: 0,
        }}>TODAY'S LOG</span>
        <span style={{
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          color: 'rgba(255,255,255,0.6)',
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{summary}</span>
        <span style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          color: 'rgba(255,255,255,0.4)',
        }}>{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div style={{
          marginTop: 10,
          background: '#111111',
          border: '1px solid #1f1f1f',
          borderRadius: 14, padding: '14px 16px 16px',
        }}>
          {/* Highlight */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 9,
              letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', marginBottom: 6,
            }}>Highlight</div>
            <input
              value={journal.highlight}
              onChange={(e) => set('highlight', e.target.value)}
              placeholder="best moment / what mattered most…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'transparent',
                border: 'none', borderBottom: '1px dashed rgba(255,255,255,0.1)',
                padding: '4px 0',
                fontFamily: '"Space Mono", monospace', fontSize: 13,
                color: '#fafafa', outline: 'none',
              }}
            />
          </div>

          {/* Brain Bits */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline',
              justifyContent: 'space-between', marginBottom: 6,
            }}>
              <span style={{
                fontFamily: '"Space Mono", monospace', fontSize: 9,
                letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
              }}>Brain Bits</span>
              <span style={{
                fontFamily: '"Space Mono", monospace', fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
              }}>{bits.length} logged · timestamped</span>
            </div>
            {/* Quick-add at top */}
            <BrainBitsInput onAdd={addBit} />
            {/* Bits reverse-chrono */}
            {bits.map(b => (
              <BrainBit key={b.id} bit={b} onEdit={editBit} onDelete={deleteBit} />
            ))}
          </div>

          {/* Wins / Ta-da */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline',
              justifyContent: 'space-between', marginBottom: 6,
            }}>
              <span style={{
                fontFamily: '"Space Mono", monospace', fontSize: 9,
                letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
              }}>Wins · ta-da</span>
              <span style={{
                fontFamily: '"Space Mono", monospace', fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
              }}>{journal.wins.length}</span>
            </div>
            <div>
              {journal.wins.map(w => (
                <WinRow key={w.id} win={w} onEdit={editWin} onDelete={deleteWin} />
              ))}
              <QuickAddWin onAdd={addWin} />
            </div>
          </div>

          {/* Reflection */}
          <div>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 9,
              letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', marginBottom: 6,
            }}>Reflection</div>
            <textarea
              value={journal.reflection}
              onChange={(e) => set('reflection', e.target.value)}
              placeholder="What I notice. Honest read of the day."
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'transparent', border: 'none', resize: 'none',
                fontFamily: '"Space Mono", monospace', fontSize: 12.5,
                color: '#fafafa', lineHeight: 1.5, outline: 'none', padding: 0,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { KaizenJournal, JOURNAL_TODAY });
-e 

// ===== KaizenTab.jsx =====
// KaizenTab.jsx — Nikhil's World, Kaizen tab (full editing version)
// Nested progress + decompose + edit/add/delete + archive + reorder + reduction-sourced.

const SPRINTS       = window.SPRINTS;
const SprintPill    = window.SprintPill;
const EditableText  = window.EditableText;
const ReductionBanner = window.ReductionBanner;
const KaizenJournal = window.KaizenJournal;
const JOURNAL_TODAY = window.JOURNAL_TODAY;

// ─────────────────────────────────────────────────────────────
// Today's reduction (mock — wires to Firestore appdata/daily-reductions/[date])
// ─────────────────────────────────────────────────────────────
const REDUCTION_TODAY = {
  date: 'May 24',
  time: '04:00 AKDT',
  summary: 'Phase 1 of review closed. Today: orient, don\'t write.',
  morningSeed: 'Orientation is not the same as action. Pick the smallest first move and start before you feel ready.',
  arcNote: 'Yesterday Phase 1 of the performance review closed (Gemini summary + doc feed). Today\'s entry point is to read the comments once without responding. The "doing wrong" alarm will fire — name it and proceed.',
  sources: [
    { source: 'Fireflies',  note: 'Shobha session May 21 — orient before action; name the alarm, continue.' },
    { source: 'Brain Dump', note: 'May 23 — anxiety about Rich review surfaced post-ride.' },
    { source: 'Drive',      note: 'synthesis-protocol-v3.md · arc continuity check active.' },
    { source: 'Health',     note: 'HRV 38ms (rising 7d). Sleep 6.5h. Recovery day.' },
    { source: 'Gmail',      note: 'Rich confirmed May 27 11 AM slot.' },
    { source: 'Calendar',   note: 'Performance review Wed; band practice Thu.' },
  ],
};

// ─────────────────────────────────────────────────────────────
// Mock data — drawn from real backup + project context
// ─────────────────────────────────────────────────────────────
const KAIZEN_MOCK = [
  {
    id: 'perfreview',
    title: 'Performance Review — Rich + ASMP team',
    sprint: 'S1', deadline: '2026-05-27', archived: false,
    phases: [
      { id: 'pr-p1', label: 'Orient + AI assist', subtasks: [
        { id: 'pr1', title: 'Ask Gemini: past year month-by-month',  sprint: 'S1', estimatedMin: 20, done: true  },
        { id: 'pr2', title: 'Feed review doc to Gemini → suggestions',sprint: 'S1', estimatedMin: 25, done: true  },
        { id: 'pr3', title: 'Ask for raise framing language',         sprint: 'S1', estimatedMin: 15, done: false },
        { id: 'pr4', title: 'Paste all into Claude → synthesize',     sprint: 'S1', estimatedMin: 20, done: false },
      ]},
      { id: 'pr-p2', label: 'Write', subtasks: [
        { id: 'pr5', title: 'Open doc + read ALL comments once, no responses yet', sprint: 'S1', estimatedMin: 15, done: false },
        { id: 'pr6', title: 'Write self-assessment paragraph',        sprint: 'S1', estimatedMin: 30, done: false },
        { id: 'pr7', title: 'Draft responses to each comment',        sprint: 'S1', estimatedMin: 45, done: false },
      ]},
      { id: 'pr-p3', label: 'Prep', subtasks: [
        { id: 'pr8', title: 'Final review pass + tone check',         sprint: 'S1', estimatedMin: 20, done: false },
        { id: 'pr9', title: 'Walk in empty-handed, dynamic mode',     sprint: 'S1', estimatedMin: 5,  done: false },
      ]},
    ],
  },
  {
    id: 'dsgnappeal',
    title: 'DSGN F130 Academic Appeal',
    sprint: 'S2', deadline: 'rolling', archived: false,
    phases: [
      { id: 'd-p1', label: 'Orient (read, don\'t write)', subtasks: [
        { id: 'd1', title: 'Open appeal doc + read once, no writing',  sprint: 'S2', estimatedMin: 15, done: false },
        { id: 'd2', title: 'List what already happened, no interpretation', sprint: 'S2', estimatedMin: 20, done: false },
      ]},
    ],
  },
  {
    id: 'asmpq2',
    title: 'ASMP Q2 Outreach Metrics',
    sprint: 'S2', deadline: '2026-05-30', archived: false,
    phases: [
      { id: 'a-p1', label: 'Pull', subtasks: [
        { id: 'a1', title: 'Export attendance data Q1',                sprint: 'S2', estimatedMin: 20, done: true },
        { id: 'a2', title: 'Export survey scores Q1',                  sprint: 'S2', estimatedMin: 20, done: true },
      ]},
      { id: 'a-p2', label: 'Build', subtasks: [
        { id: 'a3', title: 'Generate Chart.js charts',                 sprint: 'S2', estimatedMin: 30, done: true  },
        { id: 'a4', title: 'Render PDF via Playwright',                sprint: 'S2', estimatedMin: 20, done: false },
        { id: 'a5', title: 'Send to Rich for review',                  sprint: 'S2', estimatedMin: 5,  done: false },
      ]},
    ],
  },
  {
    id: 'parking',
    title: 'Parking pass renewal',
    sprint: 'S3', deadline: 'rolling', archived: false,
    phases: [], // Undecomposed — demo the ✨ Decompose flow here
  },
  {
    id: 'tracklist',
    title: '"you seem pretty sad" — split "the cure"',
    sprint: 'S4', secondarySprints: ['S5'],
    deadline: 'rolling', archived: true, // Done for now
    phases: [
      { id: 't-p1', label: 'Concept', subtasks: [
        { id: 't1', title: 'Catch "Unravelled / Antidote" split idea', sprint: 'S4', estimatedMin: 30, done: true },
        { id: 't2', title: 'Write one verse for opening track',        sprint: 'S4', estimatedMin: 25, done: true },
      ]},
    ],
  },
  {
    id: 'vo2',
    title: 'Spring VO2 Block — back to 48',
    sprint: 'S5', secondarySprints: ['S2'],
    deadline: '2026-07-19', archived: false,
    phases: [
      { id: 'v-p1', label: 'Base — Z2 only', subtasks: [
        { id: 'v1', title: 'Z2 Goldhill week 1 (3 rides)',             sprint: 'S5', estimatedMin: 180, done: true  },
        { id: 'v2', title: 'Z2 Goldhill week 2 (3 rides)',             sprint: 'S5', estimatedMin: 180, done: true  },
        { id: 'v3', title: 'Z2 Smith Lake week 3 (3 rides)',           sprint: 'S5', estimatedMin: 180, done: false },
      ]},
      { id: 'v-p2', label: 'Build — 4×4 intervals', subtasks: [
        { id: 'v4', title: 'Week 1 interval block',                    sprint: 'S5', estimatedMin: 240, done: false },
      ]},
    ],
  },
];

const FAKE_DECOMPOSE = {
  parking: [
    { id: 'pk-p1', label: 'Find the form', subtasks: [
      { id: 'pk1', title: 'Open UAF parking portal',                   sprint: 'S3', estimatedMin: 2,  done: false },
      { id: 'pk2', title: 'Locate "Annual Pass Renewal" link',         sprint: 'S3', estimatedMin: 3,  done: false },
    ]},
    { id: 'pk-p2', label: 'Fill it out', subtasks: [
      { id: 'pk3', title: 'Complete personal + vehicle info',          sprint: 'S3', estimatedMin: 8,  done: false },
      { id: 'pk4', title: 'Upload insurance card photo',               sprint: 'S3', estimatedMin: 5,  done: false },
      { id: 'pk5', title: 'Pay online + screenshot receipt',           sprint: 'S3', estimatedMin: 4,  done: false },
    ]},
  ],
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const makeId = () => `id_${Math.random().toString(36).slice(2, 10)}`;
const flatSubtasks = (p) => (p.phases || []).flatMap(ph => ph.subtasks);
const completionPct = (p) => {
  const all = flatSubtasks(p);
  if (!all.length) return 0;
  return Math.round((all.filter(s => s.done).length / all.length) * 100);
};
const nextOpenSubtask = (p) => flatSubtasks(p).find(s => !s.done);
const daysUntil = (iso) => {
  if (!iso || iso === 'rolling') return null;
  const today = new Date('2026-05-24');
  const t = new Date(iso);
  return Math.ceil((t - today) / 86400000);
};

function DeadlinePill({ deadline }) {
  const d = daysUntil(deadline);
  if (d === null) {
    return <span style={{
      fontFamily: '"Space Mono", monospace', fontSize: 10,
      color: 'rgba(255,255,255,0.4)', letterSpacing: 0.4,
    }}>rolling</span>;
  }
  let label, color;
  if (d < 0)        { label = `${Math.abs(d)}d over`; color = '#fca5a5'; }
  else if (d === 0) { label = 'today';                color = '#fca5a5'; }
  else if (d <= 3)  { label = `${d}d left`;           color = '#fcd34d'; }
  else              { label = `${d}d left`;           color = 'rgba(255,255,255,0.55)'; }
  return <span style={{
    fontFamily: '"Space Mono", monospace', fontSize: 10,
    color, letterSpacing: 0.4,
  }}>{label}</span>;
}

function CountUp({ value, suffix = '' }) {
  const [display, setDisplay] = React.useState(value);
  const prevRef = React.useRef(value);
  React.useEffect(() => {
    const from = prevRef.current, to = value;
    if (from === to) return;
    const duration = 600, start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display}{suffix}</>;
}

// ─────────────────────────────────────────────────────────────
// Subtask row — editable + deletable
// ─────────────────────────────────────────────────────────────
function SubtaskRow({ subtask, onToggle, onEdit, onDelete, cascadeColor }) {
  const s = SPRINTS[subtask.sprint];
  const [justChecked, setJustChecked] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);

  const handleCheckClick = (e) => {
    e.stopPropagation();
    if (!subtask.done) {
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 900);
    }
    onToggle(subtask.id);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 4px',
        opacity: subtask.done ? 0.42 : 1,
        transition: 'opacity 320ms ease',
        position: 'relative',
      }}
    >
      {/* checkbox */}
      <button
        onClick={handleCheckClick}
        style={{
          width: 18, height: 18, flexShrink: 0,
          borderRadius: 5, padding: 0,
          border: subtask.done ? `1.5px solid ${s.fg}` : '1.5px solid rgba(255,255,255,0.22)',
          background: subtask.done ? s.bg : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 220ms ease',
          transform: justChecked ? 'scale(1.18)' : 'scale(1)',
          cursor: 'pointer',
        }}
      >
        {subtask.done && (
          <svg width="10" height="10" viewBox="0 0 11 11">
            <path d="M2 5.5L4.5 8L9 3" stroke={s.fg} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {/* title — editable */}
      <div style={{
        flex: 1, minWidth: 0,
        fontFamily: '"Space Mono", monospace', fontSize: 12.5,
        color: 'rgba(255,255,255,0.86)', lineHeight: 1.35,
        textDecoration: subtask.done ? 'line-through' : 'none',
        textDecorationColor: s.fg, textDecorationThickness: '1.5px',
      }}>
        <EditableText
          value={subtask.title}
          onChange={(v) => onEdit({ ...subtask, title: v })}
          placeholder="Subtask name…"
        />
      </div>
      {/* min — editable */}
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        color: 'rgba(255,255,255,0.4)', flexShrink: 0,
        letterSpacing: 0.4, minWidth: 32,
      }}>
        <EditableText
          value={subtask.estimatedMin}
          onChange={(v) => onEdit({ ...subtask, estimatedMin: Number(v) || 0 })}
          type="number"
          suffix="m"
          style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}
        />
      </div>
      {/* delete on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(subtask.id); }}
        style={{
          width: 18, height: 18, padding: 0, flexShrink: 0,
          background: 'transparent',
          border: 'none', cursor: 'pointer',
          opacity: hovered ? 0.7 : 0,
          transition: 'opacity 220ms ease',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 14, lineHeight: 1,
        }}
        title="Delete subtask"
      >×</button>
      {/* cascade spark */}
      {justChecked && (
        <span
          style={{
            position: 'absolute', left: -16, top: '50%',
            width: 2, height: 'calc(100% + 8px)',
            background: `linear-gradient(to top, ${cascadeColor} 0%, transparent 100%)`,
            transform: 'translateY(-50%)',
            opacity: 0.7,
            pointerEvents: 'none',
          }}
          className="cascade-spark"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AddSubtaskForm — inline form to add a subtask to a phase
// ─────────────────────────────────────────────────────────────
function AddSubtaskForm({ onAdd, sprint }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [minutes, setMinutes] = React.useState(15);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const commit = () => {
    if (title.trim()) {
      onAdd({ id: makeId(), title: title.trim(), estimatedMin: minutes, sprint, done: false });
      setTitle(''); setMinutes(15);
    }
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none',
          padding: '8px 4px', cursor: 'pointer',
          color: 'rgba(255,255,255,0.38)',
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          letterSpacing: 0.4,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        add subtask
      </button>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 4px',
    }}>
      <div style={{ width: 18, flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setTitle(''); setOpen(false); }
        }}
        onBlur={commit}
        placeholder="Subtask name…"
        style={{
          flex: 1, minWidth: 0,
          background: 'rgba(167,139,250,0.06)',
          border: '1px solid rgba(167,139,250,0.35)',
          borderRadius: 4, padding: '4px 8px',
          fontFamily: '"Space Mono", monospace', fontSize: 12.5,
          color: '#fafafa', outline: 'none',
        }}
      />
      <input
        type="number" min="1" value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value) || 0)}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 44, padding: '4px 6px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4, color: 'rgba(255,255,255,0.6)',
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          outline: 'none', textAlign: 'right',
        }}
      />
      <span style={{
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
      }}>m</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Project card — full-edit version
// ─────────────────────────────────────────────────────────────
function KaizenProjectCard({ project, onUpdate, onMenu }) {
  const [expanded, setExpanded] = React.useState(false);
  const [decomposing, setDecomposing] = React.useState(false);
  const [animPct, setAnimPct] = React.useState(0);
  const [barGlow, setBarGlow] = React.useState(false);

  const s = SPRINTS[project.sprint];
  const pct = completionPct(project);
  const allSubs = flatSubtasks(project);
  const doneCount = allSubs.filter(x => x.done).length;
  const nextOpen = nextOpenSubtask(project);
  const hasPhases = (project.phases || []).length > 0;

  React.useEffect(() => {
    const t = setTimeout(() => setAnimPct(pct), 60);
    return () => clearTimeout(t);
  }, [pct]);

  const updatePhases = (newPhases) => onUpdate({ ...project, phases: newPhases });

  const toggleSubtask = (subtaskId) => {
    updatePhases(project.phases.map(ph => ({
      ...ph,
      subtasks: ph.subtasks.map(st =>
        st.id === subtaskId ? { ...st, done: !st.done } : st
      ),
    })));
    setBarGlow(true);
    setTimeout(() => setBarGlow(false), 900);
  };

  const editSubtask = (updated) => {
    updatePhases(project.phases.map(ph => ({
      ...ph,
      subtasks: ph.subtasks.map(st => st.id === updated.id ? updated : st),
    })));
  };

  const deleteSubtask = (subtaskId) => {
    updatePhases(project.phases.map(ph => ({
      ...ph,
      subtasks: ph.subtasks.filter(st => st.id !== subtaskId),
    })));
  };

  const addSubtask = (phaseId, subtask) => {
    updatePhases(project.phases.map(ph =>
      ph.id === phaseId ? { ...ph, subtasks: [...ph.subtasks, subtask] } : ph
    ));
  };

  const addPhase = () => {
    updatePhases([...project.phases, { id: makeId(), label: 'New phase', subtasks: [] }]);
  };

  const editPhaseLabel = (phaseId, label) => {
    updatePhases(project.phases.map(ph => ph.id === phaseId ? { ...ph, label } : ph));
  };

  const deletePhase = (phaseId) => {
    updatePhases(project.phases.filter(ph => ph.id !== phaseId));
  };

  const handleDecompose = (e) => {
    e.stopPropagation();
    setDecomposing(true);
    setExpanded(true);
    setTimeout(() => {
      const newPhases = FAKE_DECOMPOSE[project.id] || [
        { id: makeId(), label: 'Generated steps', subtasks: [
          { id: makeId(), title: 'First concrete action (10min)',  sprint: project.sprint, estimatedMin: 10, done: false },
          { id: makeId(), title: 'Second concrete action (15min)', sprint: project.sprint, estimatedMin: 15, done: false },
          { id: makeId(), title: 'Third concrete action (10min)',  sprint: project.sprint, estimatedMin: 10, done: false },
        ]},
      ];
      onUpdate({ ...project, phases: newPhases });
      setDecomposing(false);
    }, 1500);
  };

  return (
    <div style={{
      background: project.archived ? 'rgba(17,17,17,0.6)' : '#111111',
      border: '1px solid #1f1f1f',
      borderRadius: 14, padding: '14px 16px 16px',
      position: 'relative', overflow: 'hidden',
      transition: 'border-color 280ms ease, opacity 280ms ease',
      borderColor: barGlow ? s.bd : '#1f1f1f',
      opacity: project.archived ? 0.55 : 1,
    }}>
      {/* Decomposing shimmer */}
      {decomposing && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(110deg, transparent 30%, ${s.bg} 50%, transparent 70%)`,
            backgroundSize: '200% 100%',
          }} className="shimmer-sweep" />
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        flexWrap: 'wrap',
      }}>
        <SprintPill sprint={project.sprint} />
        {(project.secondarySprints || []).map(sp => (
          <span key={sp} style={{
            fontFamily: '"Space Mono", monospace', fontSize: 9,
            padding: '2px 5px', borderRadius: 4,
            background: SPRINTS[sp].bg, color: SPRINTS[sp].fg,
            border: `1px solid ${SPRINTS[sp].bd}`,
            letterSpacing: 0.5, fontWeight: 700,
          }}>+{sp}</span>
        ))}
        <DeadlinePill deadline={project.deadline} />
        <div style={{ flex: 1 }} />
        {hasPhases && (
          <span style={{
            fontFamily: '"Space Mono", monospace', fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
          }}>{doneCount}/{allSubs.length}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onMenu(project); }}
          style={{
            background: 'transparent', border: 'none',
            padding: '2px 4px', cursor: 'pointer',
            color: 'rgba(255,255,255,0.45)',
            fontSize: 16, lineHeight: 1,
          }}
          title="Project actions"
        >···</button>
      </div>

      {/* Title — editable */}
      <div
        onClick={() => hasPhases && setExpanded(!expanded)}
        style={{
          cursor: hasPhases ? 'pointer' : 'default',
          fontFamily: '"Space Mono", monospace', fontSize: 15,
          color: '#fafafa', lineHeight: 1.3, fontWeight: 700,
          textWrap: 'pretty',
        }}
      >
        <EditableText
          value={project.title}
          onChange={(v) => onUpdate({ ...project, title: v })}
          placeholder="Project name…"
        />
      </div>

      {/* Completion bar */}
      {hasPhases && (
        <div style={{ marginTop: 12, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, height: 6, borderRadius: 3,
              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
              boxShadow: barGlow ? `0 0 14px ${s.fg}66` : 'none',
              transition: 'box-shadow 320ms ease',
            }}>
              <div style={{
                width: `${animPct}%`, height: '100%',
                background: `linear-gradient(90deg, ${s.fg} 0%, ${s.fg}cc 100%)`,
                transition: 'width 850ms cubic-bezier(.2,.85,.2,1)',
                boxShadow: `0 0 8px ${s.fg}66`,
              }} />
            </div>
            <span style={{
              fontFamily: '"Space Mono", monospace', fontSize: 12,
              color: barGlow ? s.fg : 'rgba(255,255,255,0.65)',
              minWidth: 32, textAlign: 'right',
              transition: 'color 320ms ease',
              fontWeight: 700,
            }}><CountUp value={pct} suffix="%" /></span>
          </div>
        </div>
      )}

      {/* Collapsed preview */}
      {hasPhases && !expanded && nextOpen && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px dashed rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <div style={{
            width: 5, height: 5, marginTop: 7, flexShrink: 0,
            borderRadius: 1, background: s.fg,
            boxShadow: `0 0 8px ${s.fg}aa`,
          }} />
          <div style={{
            flex: 1, fontFamily: '"Space Mono", monospace', fontSize: 11.5,
            color: 'rgba(255,255,255,0.7)', lineHeight: 1.4,
          }}>
            next: {nextOpen.title} <span style={{ color: 'rgba(255,255,255,0.4)' }}>· {nextOpen.estimatedMin}m</span>
          </div>
        </div>
      )}

      {/* Expanded — phases + subtasks */}
      {hasPhases && expanded && (
        <div style={{ marginTop: 14 }}>
          {project.phases.map((phase, pi) => {
            const phaseDone = phase.subtasks.filter(x => x.done).length;
            return (
              <div key={phase.id} style={{ marginBottom: pi < project.phases.length - 1 ? 16 : 8 }}>
                {/* Phase header — label editable, delete on hover */}
                <PhaseHeader
                  index={pi}
                  label={phase.label}
                  done={phaseDone}
                  total={phase.subtasks.length}
                  onEditLabel={(v) => editPhaseLabel(phase.id, v)}
                  onDelete={() => deletePhase(phase.id)}
                />
                <div style={{ paddingLeft: 4 }}>
                  {phase.subtasks.map(st => (
                    <SubtaskRow
                      key={st.id}
                      subtask={st}
                      onToggle={toggleSubtask}
                      onEdit={editSubtask}
                      onDelete={deleteSubtask}
                      cascadeColor={s.fg}
                    />
                  ))}
                  <AddSubtaskForm
                    onAdd={(st) => addSubtask(phase.id, st)}
                    sprint={project.sprint}
                  />
                </div>
              </div>
            );
          })}
          <button
            onClick={addPhase}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.12)',
              padding: '8px 12px', borderRadius: 8,
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)',
              fontFamily: '"Space Mono", monospace', fontSize: 11,
              letterSpacing: 0.6, marginTop: 4,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            add phase
          </button>
        </div>
      )}

      {/* Decompose + expand/collapse buttons */}
      <div style={{
        marginTop: hasPhases ? 12 : 14,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button
          onClick={handleDecompose}
          disabled={decomposing}
          className="decompose-btn"
          style={{
            flex: hasPhases ? 'none' : 1,
            padding: hasPhases ? '6px 11px' : '11px 14px',
            background: hasPhases ? 'transparent' : `linear-gradient(135deg, ${s.bg} 0%, rgba(167,139,250,0.18) 100%)`,
            border: `1px solid ${hasPhases ? 'rgba(167,139,250,0.25)' : s.bd}`,
            borderRadius: 10, color: hasPhases ? 'rgba(255,255,255,0.55)' : '#c4b5fd',
            fontFamily: '"Space Mono", monospace', fontSize: hasPhases ? 10 : 12,
            letterSpacing: hasPhases ? 0.6 : 0.8,
            cursor: decomposing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: decomposing ? 0.55 : 1,
            transition: 'all 280ms ease',
          }}
        >
          <span style={{ fontSize: hasPhases ? 11 : 14 }}>✨</span>
          {decomposing ? 'thinking…' : (hasPhases ? 'decompose further' : 'Decompose')}
        </button>
        {hasPhases && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, color: 'rgba(255,255,255,0.55)',
              fontFamily: '"Space Mono", monospace', fontSize: 10,
              cursor: 'pointer', letterSpacing: 0.6,
            }}
          >
            {expanded ? '▴ collapse' : '▾ expand'}
          </button>
        )}
      </div>
    </div>
  );
}

function PhaseHeader({ index, label, done, total, onEditLabel, onDelete }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 4,
      }}
    >
      <div style={{ width: 16, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      <div style={{
        fontFamily: '"Space Mono", monospace', fontSize: 9,
        letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>Phase {index + 1}</span>
        <span>·</span>
        <EditableText
          value={label}
          onChange={onEditLabel}
          style={{ fontSize: 9, letterSpacing: 1.5 }}
        />
        <span>· {done}/{total}</span>
      </div>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <button
        onClick={onDelete}
        style={{
          background: 'transparent', border: 'none',
          padding: 0, cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 12, lineHeight: 1,
          opacity: hovered ? 0.7 : 0,
          transition: 'opacity 220ms ease',
        }}
        title="Delete phase"
      >×</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sprint section
// ─────────────────────────────────────────────────────────────
function SprintSection({ sprint, projects, onUpdate, onMenu }) {
  const s = SPRINTS[sprint];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 18px 8px', position: 'sticky', top: 0, zIndex: 2,
        background: 'linear-gradient(to bottom, #0a0a0a 65%, transparent 100%)',
        paddingTop: 6,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: 2, background: s.fg,
          boxShadow: `0 0 10px ${s.fg}88`,
        }} />
        <span style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          letterSpacing: 1.8, color: s.fg, fontWeight: 700,
        }}>{sprint} · {s.label.toUpperCase()}</span>
        <span style={{
          fontFamily: '"Space Mono", monospace', fontSize: 10,
          color: 'rgba(255,255,255,0.32)', marginLeft: 'auto',
        }}>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '0 16px',
      }}>
        {projects.map(p => (
          <KaizenProjectCard key={p.id} project={p} onUpdate={onUpdate} onMenu={onMenu} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Archived section
// ─────────────────────────────────────────────────────────────
function ArchivedSection({ projects, onUpdate, onMenu }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!projects.length) return null;
  return (
    <div style={{ padding: '4px 16px 20px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '10px 14px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          fontFamily: '"Space Mono", monospace', fontSize: 11,
          letterSpacing: 1.4, color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>DONE FOR NOW · {projects.length}</span>
        <span style={{ fontSize: 10 }}>{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div style={{
          marginTop: 10,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {projects.map(p => (
            <KaizenProjectCard key={p.id} project={p} onUpdate={onUpdate} onMenu={onMenu} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main KaizenTab
// ─────────────────────────────────────────────────────────────
function KaizenTab({ ui = {} } = {}) {
  const [projects, setProjects] = React.useState(KAIZEN_MOCK);
  const [filter, setFilter] = React.useState('all');
  const [journal, setJournal] = React.useState(JOURNAL_TODAY);

  const safeShowActionSheet = ui.showActionSheet || (() => {});
  const safeShowUndoToast = ui.showUndoToast || (() => {});
  const safeShowReductionSheet = ui.showReductionSheet || (() => {});

  const updateProject = (updated) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const deleteProject = (project) => {
    const idx = projects.findIndex(p => p.id === project.id);
    setProjects(prev => prev.filter(p => p.id !== project.id));
    safeShowUndoToast(
      `Deleted "${project.title.length > 20 ? project.title.slice(0, 18) + '…' : project.title}"`,
      () => {
        setProjects(prev => {
          const next = [...prev];
          next.splice(Math.min(idx, next.length), 0, project);
          return next;
        });
      }
    );
  };

  const reorderProject = (project, direction) => {
    setProjects(prev => {
      const sameSprint = prev.filter(p => p.sprint === project.sprint);
      const idx = sameSprint.findIndex(p => p.id === project.id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= sameSprint.length) return prev;
      // Swap in original list
      const otherId = sameSprint[newIdx].id;
      const idx1 = prev.findIndex(p => p.id === project.id);
      const idx2 = prev.findIndex(p => p.id === otherId);
      const next = [...prev];
      [next[idx1], next[idx2]] = [next[idx2], next[idx1]];
      return next;
    });
  };

  const moveSprint = (project, sprint) => {
    updateProject({ ...project, sprint });
  };

  const toggleArchive = (project) => {
    updateProject({ ...project, archived: !project.archived });
  };

  const openProjectMenu = (project) => {
    const items = [
      { icon: '↑', label: 'Move up',   onClick: () => reorderProject(project, -1) },
      { icon: '↓', label: 'Move down', onClick: () => reorderProject(project, +1) },
      ...['S1','S2','S3','S4','S5'].map(sp => ({
        icon: '→',
        label: `Move to ${sp} · ${SPRINTS[sp].label}`,
        sub: project.sprint === sp ? 'current' : '',
        disabled: project.sprint === sp,
        onClick: () => moveSprint(project, sp),
      })),
      {
        icon: project.archived ? '↩' : '✓',
        label: project.archived ? 'Reactivate' : 'Done for now',
        onClick: () => toggleArchive(project),
      },
      { icon: '🗑', danger: true, label: 'Delete', onClick: () => deleteProject(project) },
    ];
    safeShowActionSheet(project.title, items);
  };

  const addProject = () => {
    const newProj = {
      id: makeId(),
      title: 'New project',
      sprint: 'S3', deadline: 'rolling', archived: false,
      phases: [],
    };
    setProjects(prev => [newProj, ...prev]);
  };

  // Group + filter
  const order = ['S1', 'S2', 'S3', 'S4', 'S5'];
  const active = projects.filter(p => !p.archived);
  const archived = projects.filter(p => p.archived);
  const groups = order.map(sp => ({
    sprint: sp,
    projects: active.filter(p => p.sprint === sp),
  })).filter(g => filter === 'all' || filter === g.sprint);
  const visibleGroups = groups.filter(g => g.projects.length > 0);

  const totalOpen = projects.reduce((acc, p) => {
    if (p.archived) return acc;
    const open = flatSubtasks(p).filter(s => !s.done).length;
    return acc + open;
  }, 0);

  return (
    <div style={{
      width: '100%', minHeight: '100%',
      background: '#0a0a0a', paddingBottom: 24,
    }}>
      {/* Header */}
      <div style={{ padding: '88px 18px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 14, gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 10,
              letterSpacing: 2.4, color: 'rgba(255,255,255,0.42)',
              marginBottom: 4,
            }}>KAIZEN · {active.length} ACTIVE</div>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 24,
              color: '#fafafa', lineHeight: 1, letterSpacing: -0.3,
            }}>The mountain, sliced.</div>
          </div>
          <button
            onClick={addProject}
            style={{
              flexShrink: 0,
              padding: '8px 12px',
              background: 'linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0.08) 100%)',
              border: '1px solid rgba(167,139,250,0.35)',
              borderRadius: 9, color: '#c4b5fd',
              fontFamily: '"Space Mono", monospace', fontSize: 11,
              fontWeight: 700, letterSpacing: 0.6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>+</span>
            new project
          </button>
        </div>

        {/* Reduction banner */}
        <ReductionBanner
          reduction={REDUCTION_TODAY}
          onOpen={safeShowReductionSheet}
        />

        {/* Today's log — brain dump + wins + highlight + reflection */}
        <KaizenJournal journal={journal} onUpdate={setJournal} />

        {/* Filter chips */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          scrollbarWidth: 'none',
        }} className="hidescroll">
          {[
            { id: 'all', label: 'All', count: active.length },
            ...order.map(sp => ({
              id: sp, label: sp,
              count: active.filter(p => p.sprint === sp).length,
            })),
          ].map(chip => {
            const isActive = filter === chip.id;
            const cs = SPRINTS[chip.id];
            return (
              <button
                key={chip.id}
                onClick={() => setFilter(chip.id)}
                style={{
                  flexShrink: 0,
                  padding: '6px 11px',
                  background: isActive
                    ? (cs ? cs.bg : 'rgba(255,255,255,0.08)')
                    : 'transparent',
                  border: `1px solid ${isActive ? (cs ? cs.bd : 'rgba(255,255,255,0.18)') : '#1f1f1f'}`,
                  borderRadius: 8,
                  color: isActive ? (cs ? cs.fg : '#fafafa') : 'rgba(255,255,255,0.55)',
                  fontFamily: '"Space Mono", monospace', fontSize: 11,
                  fontWeight: 700, letterSpacing: 0.5,
                  cursor: 'pointer', transition: 'all 220ms ease',
                }}
              >
                {chip.label} <span style={{ opacity: 0.55 }}>{chip.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sprint sections */}
      {visibleGroups.map(g => (
        <SprintSection
          key={g.sprint}
          sprint={g.sprint}
          projects={g.projects}
          onUpdate={updateProject}
          onMenu={openProjectMenu}
        />
      ))}

      {/* Empty filter state */}
      {visibleGroups.length === 0 && (
        <div style={{
          padding: '40px 18px',
          fontFamily: '"Space Mono", monospace', fontSize: 12,
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
        }}>
          Nothing here. Try All, or tap + to add one.
        </div>
      )}

      {/* Archived */}
      <ArchivedSection
        projects={archived}
        onUpdate={updateProject}
        onMenu={openProjectMenu}
      />
    </div>
  );
}

Object.assign(window, {
  KaizenTab, KaizenProjectCard, KAIZEN_MOCK, REDUCTION_TODAY,
});
-e 

// ===== RouletteTab.jsx =====
// RouletteTab.jsx — Creative Roulette, context-integrated version
// Each spin pulls a prompt informed by Fireflies, Brain Dump, Catch, Drive, Reduction.

const SPRINTS_R = window.SPRINTS;

// ─────────────────────────────────────────────────────────────
// Prompt library — each prompt cites the sources that informed it.
// In production: the nightly Reduction synthesizes these and writes to Firestore.
// ─────────────────────────────────────────────────────────────
const PROMPTS = [
  {
    id: 'p1', kind: 'Song',
    prompt: 'Write one verse drawing from your "Unravelled / Antidote" tracklist split. 5-minute timer. Lyrics OR melody — whichever surfaces first.',
    sources: [
      { tag: 'Catch',  detail: 'May 23 — tracklist concept' },
      { tag: 'Fireflies', detail: 'Shobha May 21 — orient first' },
    ],
    invitation: 'Open ear, not perfect line. The catch is yours; the verse is just the next breath.',
  },
  {
    id: 'p2', kind: 'Movement',
    prompt: 'Three rounds of Voo breath. Then write one sentence the body said. Brighton\'s territory.',
    sources: [
      { tag: 'Therapy', detail: 'Brighton — somatic exit protocol' },
      { tag: 'Health',  detail: 'HRV 38ms · recovery day' },
    ],
    invitation: 'The body is already speaking. You\'re writing down what it said, not making it say something.',
  },
  {
    id: 'p3', kind: 'Visual',
    prompt: 'Take the Costco-pizza-stacking pattern from your food log this week. Name the song. One title. No second guess.',
    sources: [
      { tag: 'Food log', detail: 'Sodium stack May 21' },
      { tag: 'Brain Dump', detail: 'May 23 — patterns I run' },
    ],
    invitation: 'Defiance framing — the silly title is the point. Resist polishing.',
  },
  {
    id: 'p4', kind: 'Writing',
    prompt: 'One sentence to Rae for her September 29 birthday. Not a card. Not a plan. One sentence about what you want to say.',
    sources: [
      { tag: 'Calendar', detail: 'Rae bday Sep 29 · 4 months out' },
      { tag: 'Memory', detail: 'Recognition language: written notes' },
    ],
    invitation: 'Doing-wrong alarm fires here. Name it. Write the sentence anyway.',
  },
  {
    id: 'p5', kind: 'Writing',
    prompt: 'Pull one image from yesterday\'s brain dump. Make it a song title. No second guess.',
    sources: [
      { tag: 'Brain Dump', detail: 'May 23 entry' },
      { tag: 'Catch', detail: 'Stream of titles, May 22' },
    ],
    invitation: 'The image is already there. You\'re labeling, not generating.',
  },
  {
    id: 'p6', kind: 'Practice',
    prompt: 'On today\'s Z2 Smith Lake ride: pick ONE technical lever. Cadence (85+ RPM) OR breath cadence. Not both.',
    sources: [
      { tag: 'Health', detail: 'VO2 max 40 · trending to 48' },
      { tag: 'Drive', detail: 'May 22 reduction — mashing pattern' },
    ],
    invitation: 'One variable. Ride is the lab. Goldhill loop is the data.',
  },
];

// ─────────────────────────────────────────────────────────────
// Classic / random prompts — the original Roulette vibe
// Date-blind, context-blind, just spark a thing.
// ─────────────────────────────────────────────────────────────
const RANDOM_PROMPTS = [
  { id: 'r1', kind: 'Writing',     prompt: 'Write 3 lines about a fruit you don\'t usually buy.' },
  { id: 'r2', kind: 'Song',        prompt: 'Hum the melody you woke up with. Voice memo, 30 seconds.' },
  { id: 'r3', kind: 'Visual',      prompt: 'What would the room look like if you were leaving in 10 minutes?' },
  { id: 'r4', kind: 'Writing',     prompt: 'Describe a sound from yesterday in two sentences.' },
  { id: 'r5', kind: 'Performance', prompt: 'Choreograph 8 counts of anything. Voice memo a description.' },
  { id: 'r6', kind: 'Writing',     prompt: 'What\'s a word you\'ve been overusing? Find its replacement.' },
  { id: 'r7', kind: 'Visual',      prompt: 'Photograph one corner of your space. The corner is the subject.' },
  { id: 'r8', kind: 'Song',        prompt: 'Sing the most boring sentence you said today. Make it a hook.' },
  { id: 'r9', kind: 'Movement',    prompt: 'Walk backwards across one room. Notice what changes.' },
  { id: 'r10',kind: 'Writing',     prompt: 'Write the title of a song that doesn\'t exist yet. Just the title.' },
];

const KIND_COLORS = {
  Song:        { fg: '#c4b5fd', bg: 'rgba(167,139,250,0.14)', bd: 'rgba(167,139,250,0.38)' },
  Movement:    { fg: '#5eead4', bg: 'rgba(20,184,166,0.14)',  bd: 'rgba(20,184,166,0.38)' },
  Visual:      { fg: '#fcd34d', bg: 'rgba(245,158,11,0.14)',  bd: 'rgba(245,158,11,0.38)' },
  Writing:     { fg: '#fafafa', bg: 'rgba(255,255,255,0.06)', bd: 'rgba(255,255,255,0.2)' },
  Performance: { fg: '#fca5a5', bg: 'rgba(239,68,68,0.14)',   bd: 'rgba(239,68,68,0.38)' },
  Practice:    { fg: '#5eead4', bg: 'rgba(20,184,166,0.14)',  bd: 'rgba(20,184,166,0.38)' },
};

// ─────────────────────────────────────────────────────────────
// Spin animation
// ─────────────────────────────────────────────────────────────
function SourcePill({ source }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 9px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      fontFamily: '"Space Mono", monospace', fontSize: 10,
      color: 'rgba(255,255,255,0.7)',
    }}>
      <span style={{
        width: 4, height: 4, borderRadius: '50%',
        background: '#a78bfa', boxShadow: '0 0 5px rgba(167,139,250,0.7)',
      }} />
      <span style={{
        color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5,
        textTransform: 'uppercase', fontSize: 9,
      }}>{source.tag}</span>
      <span>·</span>
      <span>{source.detail}</span>
    </div>
  );
}

function RouletteTab() {
  const [mode, setMode] = React.useState('synthesized'); // 'synthesized' | 'random'
  const [idx, setIdx] = React.useState(0);
  const [spinning, setSpinning] = React.useState(false);
  const [streak] = React.useState(11);
  const [recent, setRecent] = React.useState([0]);

  const pool = mode === 'synthesized' ? PROMPTS : RANDOM_PROMPTS;
  const safeIdx = idx % pool.length;
  const current = pool[safeIdx];
  const kc = KIND_COLORS[current.kind] || KIND_COLORS.Writing;

  // Reset index when switching modes
  React.useEffect(() => { setIdx(0); }, [mode]);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    let count = 0;
    const target = 8 + Math.floor(Math.random() * 6);
    const interval = setInterval(() => {
      setIdx(i => (i + 1) % pool.length);
      count++;
      if (count >= target) {
        clearInterval(interval);
        setSpinning(false);
        setRecent(r => [idx, ...r].slice(0, 7));
      }
    }, 90);
  };

  const handleCaught = () => {
    spin();
  };

  return (
    <div style={{
      width: '100%', minHeight: '100%', background: '#0a0a0a',
      paddingBottom: 24,
    }}>
      {/* Header */}
      <div style={{ padding: '88px 18px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <div>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 10,
              letterSpacing: 2.4, color: 'rgba(255,255,255,0.42)',
              marginBottom: 4,
            }}>CREATIVE ROULETTE</div>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 24,
              color: '#fafafa', lineHeight: 1, letterSpacing: -0.3,
            }}>Today's spin.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 10,
              letterSpacing: 1.4, color: 'rgba(255,255,255,0.42)',
              marginBottom: 2,
            }}>STREAK</div>
            <div style={{
              fontFamily: '"Space Mono", monospace', fontSize: 22,
              color: '#a78bfa', lineHeight: 1, fontWeight: 700,
            }}>{streak}d</div>
          </div>
        </div>

        {/* Mode toggle — Synthesized | Random */}
        <div style={{
          display: 'flex', gap: 4, padding: 4,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid #1f1f1f',
          borderRadius: 10,
        }}>
          {[
            { id: 'synthesized', label: 'Synthesized', sub: 'context-cited' },
            { id: 'random',      label: 'Random',      sub: 'classic spin'  },
          ].map(m => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  flex: 1, padding: '8px 10px',
                  background: active
                    ? 'linear-gradient(135deg, rgba(167,139,250,0.20) 0%, rgba(167,139,250,0.08) 100%)'
                    : 'transparent',
                  border: `1px solid ${active ? 'rgba(167,139,250,0.4)' : 'transparent'}`,
                  borderRadius: 7,
                  color: active ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
                  fontFamily: '"Space Mono", monospace', fontSize: 11,
                  fontWeight: 700, letterSpacing: 0.6,
                  cursor: 'pointer', transition: 'all 220ms ease',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}
              >
                <span>{m.label}</span>
                <span style={{
                  fontSize: 9, fontWeight: 400, letterSpacing: 0.5,
                  color: active ? 'rgba(196,181,253,0.6)' : 'rgba(255,255,255,0.35)',
                }}>{m.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Prompt hero card */}
      <div style={{ padding: '0 16px' }}>
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: '#111111',
          border: `1px solid ${kc.bd}`,
          borderRadius: 18, padding: '20px 20px 22px',
          minHeight: 220,
          transition: 'border-color 320ms ease',
        }}>
          {/* Subtle gradient bg */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${kc.bg} 0%, transparent 80%)`,
            pointerEvents: 'none',
          }} />

          {/* Kind pill */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 14,
          }}>
            <span style={{
              padding: '4px 9px', borderRadius: 6,
              background: kc.bg, border: `1px solid ${kc.bd}`,
              fontFamily: '"Space Mono", monospace', fontSize: 10,
              color: kc.fg, fontWeight: 700, letterSpacing: 0.8,
            }}>{current.kind.toUpperCase()}</span>
            {spinning && (
              <span style={{
                fontFamily: '"Space Mono", monospace', fontSize: 10,
                color: 'rgba(255,255,255,0.5)', letterSpacing: 0.8,
              }} className="spinning-label">spinning…</span>
            )}
          </div>

          {/* Prompt */}
          <div
            key={current.id /* re-trigger fade-in on prompt change */}
            style={{
              position: 'relative', zIndex: 1,
              fontFamily: '"Space Mono", monospace', fontSize: 16,
              color: '#fafafa', lineHeight: 1.5,
              textWrap: 'pretty', marginBottom: 14,
              opacity: spinning ? 0.55 : 1,
              transition: 'opacity 280ms ease',
            }}
            className="prompt-text"
          >
            {current.prompt}
          </div>

          {/* Invitation — only in synthesized mode */}
          {!spinning && current.invitation && (
            <div style={{
              position: 'relative', zIndex: 1,
              fontFamily: '"Space Mono", monospace', fontSize: 11.5,
              color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
              fontStyle: 'italic', marginBottom: 14,
              borderLeft: `2px solid ${kc.fg}66`,
              paddingLeft: 10,
            }}>
              {current.invitation}
            </div>
          )}

          {/* Source pills — only in synthesized mode */}
          {!spinning && current.sources && (
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', flexWrap: 'wrap', gap: 6,
              marginBottom: 4,
            }}>
              {current.sources.map((s, i) => <SourcePill key={i} source={s} />)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{
          marginTop: 12, display: 'flex', gap: 10,
        }}>
          <button
            onClick={handleCaught}
            disabled={spinning}
            className="decompose-btn"
            style={{
              flex: 1, padding: '14px 16px',
              background: 'linear-gradient(135deg, rgba(167,139,250,0.22) 0%, rgba(167,139,250,0.08) 100%)',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 12, color: '#c4b5fd',
              fontFamily: '"Space Mono", monospace', fontSize: 13,
              fontWeight: 700, letterSpacing: 1,
              cursor: spinning ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: spinning ? 0.55 : 1,
            }}
          >
            <span>✓</span>
            CAUGHT IT
          </button>
          <button
            onClick={spin}
            disabled={spinning}
            style={{
              padding: '14px 16px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              color: 'rgba(255,255,255,0.6)',
              fontFamily: '"Space Mono", monospace', fontSize: 12,
              letterSpacing: 0.8, cursor: spinning ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: spinning ? 0.55 : 1,
            }}
          >
            <span style={{
              display: 'inline-block',
              transition: 'transform 600ms ease',
              transform: spinning ? 'rotate(720deg)' : 'rotate(0deg)',
            }}>↻</span>
            spin
          </button>
        </div>
      </div>

      {/* Footer explanation */}
      <div style={{
        padding: '24px 22px 4px',
        fontFamily: '"Space Mono", monospace', fontSize: 10,
        color: 'rgba(255,255,255,0.32)', lineHeight: 1.55,
        letterSpacing: 0.4, textWrap: 'pretty',
      }}>
        {mode === 'synthesized'
          ? 'Synthesized nightly from Fireflies, Brain Dump, Catch, Drive, and your Reduction. Expands what\'s already in your system — doesn\'t invent.'
          : 'Classic random prompts. Date-blind, context-blind — just spark a thing.'
        }
      </div>
    </div>
  );
}

Object.assign(window, { RouletteTab, PROMPTS });

// ===== KaizenBits.jsx =====
// EditableText, ActionSheet, UndoToast, ReductionBanner, ReductionSheet

function EditableText({
  value, onChange, style = {}, placeholder = '',
  multiline = false, type = 'text', suffix = '',
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef(null);
  React.useEffect(() => { setDraft(value); }, [value]);
  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select && inputRef.current.select();
    }
  }, [editing]);
  const commit = () => {
    const trimmed = type === 'number' ? Number(draft) || 0 : String(draft).trim();
    if (trimmed !== value && trimmed !== '') onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  };
  const cancel = () => { setDraft(value); setEditing(false); };
  if (editing) {
    const Input = multiline ? 'textarea' : 'input';
    return (
      <Input ref={inputRef} type={type} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        style={{ fontFamily: '"Space Mono", monospace', background: 'rgba(167,139,250,0.08)',
          border: '1px solid rgba(167,139,250,0.45)', color: '#fafafa', borderRadius: 4,
          padding: '2px 6px', outline: 'none', width: '100%', boxSizing: 'border-box', ...style }}
      />
    );
  }
  return (
    <span onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{ cursor: 'text', borderRadius: 3, ...style }}
      className="editable-text" title="Click to edit">
      {value || <span style={{ color: 'rgba(255,255,255,0.3)' }}>{placeholder}</span>}{suffix}
    </span>
  );
}

function ActionSheet({ open, onClose, title, items }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)', opacity: open ? 1 : 0, transition: 'opacity 260ms ease' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#0a0a0a',
        border: '1px solid #1f1f1f', borderBottom: 'none', borderTopLeftRadius: 22, borderTopRightRadius: 22,
        padding: '12px 16px 32px',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 360ms cubic-bezier(.2,.85,.2,1)',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.6)', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 2, margin: '0 auto 14px' }} />
        {title && <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 11, letterSpacing: 1.4,
          color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', textAlign: 'center',
          marginBottom: 10, padding: '0 12px' }}>{title}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, i) => (
            <button key={i} onClick={() => { item.onClick(); onClose(); }} disabled={item.disabled}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background: item.danger ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${item.danger ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 10, color: item.danger ? '#fca5a5' : '#fafafa',
                fontFamily: '"Space Mono", monospace', fontSize: 13,
                textAlign: 'left', cursor: 'pointer', opacity: item.disabled ? 0.4 : 1 }}>
              <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.sub && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.4 }}>{item.sub}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function UndoToast({ message, onUndo, onDismiss, visible }) {
  React.useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDismiss, 5500);
    return () => clearTimeout(t);
  }, [visible, onDismiss]);
  return (
    <div style={{ position: 'absolute', top: 76, left: '50%',
      transform: `translate(-50%, ${visible ? '0' : 'calc(-100% - 80px)'})`,
      zIndex: 150, transition: 'transform 360ms cubic-bezier(.2,.85,.2,1)',
      maxWidth: 'calc(100% - 32px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#1a1a1a',
        border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px 10px 14px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontFamily: '"Space Mono", monospace',
        fontSize: 12, color: '#fafafa', whiteSpace: 'nowrap', maxWidth: '90vw' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa',
          boxShadow: '0 0 8px rgba(167,139,250,0.7)' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{message}</span>
        <button onClick={onUndo} style={{ background: 'rgba(167,139,250,0.12)',
          border: '1px solid rgba(167,139,250,0.35)', color: '#c4b5fd', borderRadius: 6,
          padding: '4px 10px', fontFamily: '"Space Mono", monospace', fontSize: 11,
          fontWeight: 700, letterSpacing: 0.6, cursor: 'pointer' }}>UNDO</button>
      </div>
    </div>
  );
}

function ReductionBanner({ reduction, onOpen }) {
  if (!reduction) return null;
  return (
    <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', boxSizing: 'border-box',
      background: 'linear-gradient(90deg, rgba(167,139,250,0.10) 0%, rgba(167,139,250,0.02) 100%)',
      border: '1px solid rgba(167,139,250,0.18)', borderRadius: 10, padding: '9px 12px',
      textAlign: 'left', cursor: 'pointer', fontFamily: '"Space Mono", monospace', marginBottom: 14 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa',
        boxShadow: '0 0 8px rgba(167,139,250,0.8)', flexShrink: 0 }} />
      <span style={{ fontSize: 10, letterSpacing: 1.3, color: 'rgba(255,255,255,0.55)',
        textTransform: 'uppercase' }}>Reduction</span>
      <span style={{ fontSize: 11.5, color: '#c4b5fd', flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reduction.summary}</span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>↗</span>
    </button>
  );
}

function ReductionSheet({ open, onClose, reduction }) {
  if (!reduction) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 220, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)', opacity: open ? 1 : 0, transition: 'opacity 260ms ease' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#0a0a0a',
        border: '1px solid #1f1f1f', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '14px 22px 36px', transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 420ms cubic-bezier(.2,.85,.2,1)', maxWidth: 640, margin: '0 auto',
        maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 2, margin: '0 auto 18px' }} />
        <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 10, letterSpacing: 2.4,
          color: 'rgba(255,255,255,0.42)', marginBottom: 4 }}>KAIZEN REDUCTION · {reduction.date}</div>
        <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 16, color: '#fafafa',
          lineHeight: 1.4, marginBottom: 18 }}>{reduction.morningSeed}</div>
        <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 10, letterSpacing: 1.5,
          color: 'rgba(255,255,255,0.42)', marginBottom: 8, textTransform: 'uppercase' }}>Arc note</div>
        <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 12.5, color: 'rgba(255,255,255,0.78)',
          lineHeight: 1.45, marginBottom: 18 }}>{reduction.arcNote}</div>
        {reduction.sources && (
          <>
            <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 10, letterSpacing: 1.5,
              color: 'rgba(255,255,255,0.42)', marginBottom: 8, textTransform: 'uppercase' }}>Sources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reduction.sources.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontFamily: '"Space Mono", monospace',
                  fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', width: 70, flexShrink: 0,
                    letterSpacing: 0.6, textTransform: 'uppercase' }}>{s.source}</span>
                  <span style={{ flex: 1, lineHeight: 1.4 }}>{s.note}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { EditableText, ActionSheet, UndoToast, ReductionBanner, ReductionSheet });
