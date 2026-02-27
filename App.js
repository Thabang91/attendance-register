import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getAdminConfig, upsertAdminConfig, updateAdminPassword,
  getLecturers, createLecturer, updateLecturerPasswords, deleteLecturer,
  getCourses, createCourse, deleteCourse,
  getStudentsForCourse, getAllStudents, upsertStudentAndEnrol, upsertManyStudents, removeStudentFromCourse,
  getSessions, getSession, createSession, closeSession, getAllSessions,
  recordScan, getScansForSession,
  subscribeToScans, subscribeToSession,
} from './supabase';
import { genId, gen5Passwords, pct, attendanceStatus, getScanStatus, studentCourseStats, copyText } from './helpers';
import { parseStudentExcel, exportAttendanceExcel, downloadStudentTemplate } from './excel';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#06080F', surface: '#0D1117', card: '#111827', border: '#1E2D45',
  borderLight: '#243550', accent: '#1B6EF3', accentGlow: '#1B6EF322',
  green: '#00D68F', greenDim: '#00D68F1A', red: '#FF4D6D', redDim: '#FF4D6D1A',
  yellow: '#FFB800', yellowDim: '#FFB8001A', blue: '#38BDF8', purple: '#A78BFA',
  text: '#E2E8F0', muted: '#64748B', mutedLight: '#94A3B8',
};
const FACULTY = 'Faculty of Management Sciences';
const INSTITUTION = 'Polokwane';

// ─── UI primitives ────────────────────────────────────────────────────────────
const Badge = ({ color = C.accent, children, small }) => (
  <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 4, padding: small ? '1px 6px' : '3px 10px', fontSize: small ? 10 : 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-block' }}>{children}</span>
);
const Pill = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? C.accent : 'transparent', fontWeight: 700, color: active ? '#fff' : C.muted, fontSize: 13, transition: 'all 0.15s' }}>{children}</button>
);
const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, cursor: onClick ? 'pointer' : 'default', ...style }}>{children}</div>
);
const inputStyle = (err) => ({ width: '100%', padding: '10px 14px', borderRadius: 9, border: `1px solid ${err ? C.red : C.border}`, background: C.surface, color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' });
const Fld = ({ label, error, children }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>}
    {children}
    {error && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{error}</div>}
  </div>
);
const Inp = ({ label, error, ...props }) => (
  <Fld label={label} error={error}>
    <input {...props} style={{ ...inputStyle(error), ...(props.style || {}) }} onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = error ? C.red : C.border} />
  </Fld>
);
const Sel = ({ label, options, error, ...props }) => (
  <Fld label={label} error={error}>
    <select {...props} style={{ ...inputStyle(error), appearance: 'none' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Fld>
);
const Btn = ({ children, variant = 'primary', size = 'md', onClick, style = {}, disabled, loading }) => {
  const bg = { primary: C.accent, danger: C.red, success: C.green, ghost: 'transparent', warning: C.yellow, purple: C.purple }[variant] || C.accent;
  const fg = ['ghost'].includes(variant) ? C.muted : (variant === 'success' || variant === 'warning') ? '#000' : '#fff';
  const pad = { sm: '6px 14px', md: '9px 20px', lg: '12px 28px' }[size] || '9px 20px';
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ padding: pad, borderRadius: 9, border: variant === 'ghost' ? `1px solid ${C.border}` : 'none', background: bg, color: fg, fontWeight: 700, cursor: (disabled || loading) ? 'not-allowed' : 'pointer', fontSize: size === 'sm' ? 12 : 14, opacity: (disabled || loading) ? 0.6 : 1, ...style }}>
      {loading ? '⟳ Loading…' : children}
    </button>
  );
};
const MiniBar = ({ value }) => {
  const p = Math.min(100, Math.max(0, value));
  const c = p >= 80 ? C.green : p >= 60 ? C.yellow : C.red;
  return <div style={{ background: C.border, borderRadius: 6, height: 7, width: '100%', overflow: 'hidden' }}><div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: 6, transition: 'width 0.5s ease' }} /></div>;
};
const StatCard = ({ label, value, color = C.accent, sub }) => (
  <Card><div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div><div style={{ color, fontSize: 30, fontWeight: 900 }}>{value}</div>{sub && <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{sub}</div>}</Card>
);
const Alert = ({ type = 'info', children, style = {} }) => {
  const map = { info: [C.accent, C.accentGlow], success: [C.green, C.greenDim], warning: [C.yellow, C.yellowDim], danger: [C.red, C.redDim] };
  const [color, bg] = map[type] || map.info;
  return <div style={{ padding: '10px 14px', background: bg, border: `1px solid ${color}44`, borderRadius: 9, fontSize: 13, color, marginBottom: 16, ...style }}>{children}</div>;
};
const Spinner = ({ text = 'Loading…' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', padding: 48, color: C.muted }}>
    <div style={{ fontSize: 28, animation: 'spin 1s linear infinite' }}>⟳</div>
    <span>{text}</span>
    <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
  </div>
);
const QRCodeSVG = ({ data, size = 200 }) => {
  const N = 21, seed = data.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1) * 31, 0), cs = size / N;
  const cells = [];
  for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
    const inCorner = (r < 7 && col < 7) || (r < 7 && col >= N - 7) || (r >= N - 7 && col < 7);
    if (inCorner || (seed + r * 1000 + col * 37 + r * col * 13) % 100 > 42) cells.push([r, col]);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" rx={10} />
      {cells.map(([r, c]) => <rect key={`${r}-${c}`} x={c * cs + 1} y={r * cs + 1} width={cs - 2} height={cs - 2} fill="#06080F" rx={2} />)}
      {[[0, 0], [0, N - 7], [N - 7, 0]].map(([cr, cc], i) => (
        <g key={i}><rect x={cc * cs} y={cr * cs} width={7 * cs} height={7 * cs} fill="none" stroke="#06080F" strokeWidth={2.5} rx={3} /><rect x={(cc + 2) * cs} y={(cr + 2) * cs} width={3 * cs} height={3 * cs} fill="#06080F" rx={2} /></g>
      ))}
    </svg>
  );
};
const Shell = ({ role, children, onLogout }) => (
  <div style={{ minHeight: '100vh', background: C.bg }}>
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px', display: 'flex', alignItems: 'center', height: 60, position: 'sticky', top: 0, zIndex: 100 }}>
      <span style={{ fontWeight: 900, fontSize: 17, marginRight: 'auto' }}>📋 <span style={{ color: C.accent }}>Attendance</span> Register <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>— {FACULTY}, {INSTITUTION}</span></span>
      <span style={{ fontSize: 13, color: C.mutedLight, marginRight: 18 }}>{role}</span>
      <Btn variant="ghost" size="sm" onClick={onLogout}>Sign Out</Btn>
    </div>
    <div style={{ maxWidth: 1160, margin: '0 auto', padding: '36px 24px' }}>{children}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// FIRST-RUN SETUP
// ═══════════════════════════════════════════════════════════════════════════════
function FirstRunSetup({ onComplete }) {
  const [form, setForm] = useState({ username: 'admin', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const e = {};
    if (!form.username.trim()) e.username = 'Required';
    if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    setErrors(e); if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await upsertAdminConfig({ username: form.username.trim(), password: form.password });
      setDone(true); setTimeout(onComplete, 1500);
    } catch (err) { setErrors({ submit: 'Failed to save. Check your Supabase connection.' }); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(ellipse 70% 50% at 50% -5%, ${C.accent}25, transparent), ${C.bg}`, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 68, height: 68, borderRadius: 18, background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px', boxShadow: `0 0 50px ${C.accent}44` }}>📋</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Welcome to Attendance Register</h1>
          <div style={{ color: C.muted }}>{FACULTY} — <span style={{ color: C.accent, fontWeight: 700 }}>{INSTITUTION}</span></div>
        </div>
        {done ? (
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.green }}>Admin account created! Redirecting…</div>
          </Card>
        ) : (
          <Card>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Set Up Admin Account</div>
            <Alert type="info">One-time setup. These credentials work from any device since data is now stored in the cloud.</Alert>
            {errors.submit && <Alert type="danger">{errors.submit}</Alert>}
            <Inp label="Admin Username" value={form.username} error={errors.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
            <Inp label="Admin Password" type="password" value={form.password} error={errors.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Minimum 8 characters" />
            <Inp label="Confirm Password" type="password" value={form.confirm} error={errors.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} onKeyDown={e => e.key === 'Enter' && submit()} />
            <Alert type="warning" style={{ marginBottom: 16 }}>⚠ Write down your credentials. There is no password recovery option.</Alert>
            <Btn onClick={submit} size="lg" style={{ width: '100%' }} loading={loading}>Create Admin Account →</Btn>
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ adminConfig, onLogin }) {
  const [tab, setTab] = useState('admin');
  const [form, setForm] = useState({ id: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr(''); setLoading(true);
    try {
      if (tab === 'admin') {
        if (form.id === adminConfig.username && form.password === adminConfig.password) {
          onLogin({ role: 'admin' });
        } else setErr('Incorrect username or password.');
      } else if (tab === 'lecturer') {
        const lecturers = await getLecturers();
        const lec = lecturers.find(l => l.email.toLowerCase() === form.id.toLowerCase() && (l.passwords || []).includes(form.password));
        if (lec) onLogin({ role: 'lecturer', lecturer: lec });
        else setErr('Incorrect email or password. Contact admin if all passwords are lost.');
      } else {
        onLogin({ role: 'student' });
      }
    } catch { setErr('Connection error. Check your internet and try again.'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(ellipse 70% 50% at 50% -5%, ${C.accent}25, transparent), ${C.bg}`, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px', boxShadow: `0 0 40px ${C.accent}44` }}>📋</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Attendance Register</h1>
          <div style={{ color: C.muted, fontSize: 13 }}>{FACULTY} — <span style={{ color: C.accent, fontWeight: 700 }}>{INSTITUTION}</span></div>
        </div>
        <Card>
          <div style={{ display: 'flex', background: C.surface, borderRadius: 10, padding: 4, marginBottom: 24, gap: 3 }}>
            {[['admin', '🔐 Admin'], ['lecturer', '🧑‍🏫 Lecturer'], ['student', '👤 Student']].map(([t, l]) => (
              <Pill key={t} active={tab === t} onClick={() => { setTab(t); setErr(''); setForm({ id: '', password: '' }); }}>{l}</Pill>
            ))}
          </div>
          {tab !== 'student' ? (
            <>
              <Inp label={tab === 'admin' ? 'Username' : 'Email Address'} value={form.id} onChange={e => setForm(p => ({ ...p, id: e.target.value }))} placeholder={tab === 'admin' ? 'admin username' : 'lecturer@fms.edu.za'} />
              <Inp label="Password" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handle()} />
            </>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center', color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
              Students check in via the <strong style={{ color: C.text }}>QR code</strong> shown in class. Tap below to open check-in.
            </div>
          )}
          {err && <Alert type="danger">{err}</Alert>}
          <Btn onClick={handle} size="lg" style={{ width: '100%' }} loading={loading}>
            {tab === 'student' ? 'Open Student Check-In →' : 'Sign In →'}
          </Btn>
          {tab === 'lecturer' && <div style={{ marginTop: 14, fontSize: 12, color: C.muted, textAlign: 'center' }}>Forgot password? Contact the admin — they can view your 5 passwords.</div>}
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({ adminConfig, onLogout }) {
  const [tab, setTab] = useState('lecturers');
  const [msg, setMsg] = useState(null);
  const flash = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  return (
    <Shell role="Main Admin" onLogout={onLogout}>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: C.surface, padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {['lecturers', 'courses', 'students', 'sessions', 'settings'].map(t => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</Pill>
        ))}
      </div>
      {tab === 'lecturers' && <AdminLecturers flash={flash} />}
      {tab === 'courses'   && <AdminCourses flash={flash} />}
      {tab === 'students'  && <AdminStudents />}
      {tab === 'sessions'  && <AdminSessions />}
      {tab === 'settings'  && <AdminSettings adminConfig={adminConfig} flash={flash} />}
    </Shell>
  );
}

// ─── Admin: Lecturers ─────────────────────────────────────────────────────────
function AdminLecturers({ flash }) {
  const [lecturers, setLecturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', department: '' });
  const [errors, setErrors] = useState({});
  const [newLec, setNewLec] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [regenTarget, setRegenTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLecturers(await getLecturers()); } catch { flash('Failed to load lecturers', 'danger'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (!form.department.trim()) e.department = 'Required';
    if (lecturers.find(l => l.email.toLowerCase() === form.email.toLowerCase())) e.email = 'Email already registered';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const addLecturer = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const passwords = gen5Passwords();
      const lec = await createLecturer({ id: genId(), name: form.name.trim(), email: form.email.trim().toLowerCase(), department: form.department.trim(), passwords });
      setNewLec({ ...lec, passwords });
      setForm({ name: '', email: '', department: '' }); setShowAdd(false);
      await load();
    } catch (err) { flash('Failed to save lecturer: ' + err.message, 'danger'); }
    setSaving(false);
  };

  const regenerate = async (lecId) => {
    const passwords = gen5Passwords();
    try { await updateLecturerPasswords(lecId, passwords); await load(); flash('5 new passwords generated'); } catch { flash('Failed to regenerate', 'danger'); }
    setRegenTarget(null);
  };

  const remove = async (lecId) => {
    if (!window.confirm('Remove this lecturer? Their courses remain.')) return;
    try { await deleteLecturer(lecId); await load(); flash('Lecturer removed', 'warning'); } catch { flash('Failed to remove', 'danger'); }
  };

  const printCreds = (lec) => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Credentials — ${lec.name}</title><style>body{font-family:monospace;padding:32px;max-width:500px;margin:0 auto}h1{font-size:18px}h2{color:#555;font-size:14px;margin-bottom:24px}.box{border:2px solid #000;padding:20px;border-radius:8px;margin-top:16px}.pw{background:#f5f5f5;padding:8px 14px;margin:6px 0;border-radius:4px;font-size:18px;letter-spacing:2px}.note{font-size:11px;color:#888;margin-top:16px}</style></head><body><h1>Attendance Register — Login Credentials</h1><h2>${FACULTY} — ${INSTITUTION}</h2><div class="box"><strong>Name:</strong> ${lec.name}<br><strong>Department:</strong> ${lec.department}<br><strong>Login Email:</strong> ${lec.email}<br><br><strong>Your 5 Passwords</strong> (use any one):<br>${(lec.passwords || []).map(p => `<div class="pw">${p}</div>`).join('')}</div><p class="note">Login at: ${window.location.origin}</p><script>window.print()<\/script></body></html>`);
    w.document.close();
  };

  if (loading) return <Spinner text="Loading lecturers…" />;

  return (
    <>
      {newLec && (
        <Card style={{ marginBottom: 24, borderColor: C.green + '66', background: C.greenDim }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div><div style={{ color: C.green, fontWeight: 800, marginBottom: 4 }}>✅ Lecturer registered!</div><div style={{ fontWeight: 700 }}>{newLec.name} — {newLec.email}</div></div>
            <button onClick={() => setNewLec(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20 }}>×</button>
          </div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🔑 5 Generated Passwords — share with lecturer:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 14 }}>
            {newLec.passwords.map((pw, i) => (
              <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4 }}>PW {i + 1}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, letterSpacing: 1 }}>{pw}</div>
              </div>
            ))}
          </div>
          <Alert type="warning">Save or print these now. The lecturer can use any one of these 5 passwords to log in from any device.</Alert>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn size="sm" variant="success" onClick={() => { copyText(`Attendance Register\nEmail: ${newLec.email}\nPasswords:\n${newLec.passwords.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\nLogin: ${window.location.origin}`); flash('Copied!'); }}>📋 Copy Credentials</Btn>
            <Btn size="sm" variant="ghost" onClick={() => printCreds(newLec)}>🖨 Print / PDF</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Lecturers ({lecturers.length})</div>
        <Btn onClick={() => { setShowAdd(!showAdd); setErrors({}); }}>+ Register Lecturer</Btn>
      </div>

      {showAdd && (
        <Card style={{ marginBottom: 20, borderColor: C.accent + '55' }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>New Lecturer — 5 passwords auto-generated</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Inp label="Full Name & Title" value={form.name} error={errors.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Dr. Jane Smith" />
            <Inp label="Email Address" value={form.email} error={errors.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="j.smith@fms.edu.za" />
            <Inp label="Department" value={form.department} error={errors.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} placeholder="Business Management" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}><Btn onClick={addLecturer} loading={saving}>Generate Passwords & Register</Btn><Btn variant="ghost" onClick={() => { setShowAdd(false); setErrors({}); }}>Cancel</Btn></div>
        </Card>
      )}

      {lecturers.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}><div style={{ fontSize: 40, marginBottom: 12 }}>🧑‍🏫</div><div style={{ fontWeight: 700, marginBottom: 8 }}>No lecturers yet</div><div style={{ color: C.muted }}>Register your first lecturer above.</div></Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {lecturers.map(lec => {
            const isExp = expanded === lec.id;
            return (
              <Card key={lec.id} style={{ padding: 0, overflow: 'hidden' }}>
                <div onClick={() => setExpanded(isExp ? null : lec.id)} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg,${C.accent},${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{lec.name.split(' ').pop()?.[0]}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{lec.name}</div><div style={{ color: C.muted, fontSize: 13 }}>{lec.email} · {lec.department}</div></div>
                  <div style={{ color: C.muted }}>{isExp ? '▲' : '▼'}</div>
                </div>
                {isExp && (
                  <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ paddingTop: 16, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>🔑 Passwords (any one works — click to copy):</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 14 }}>
                      {(lec.passwords || []).map((pw, i) => (
                        <div key={i} onClick={() => { copyText(pw); flash('Password copied!'); }} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, textAlign: 'center', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.borderColor = C.accent} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4 }}>PW {i + 1}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{pw}</div>
                        </div>
                      ))}
                    </div>
                    {regenTarget === lec.id && (
                      <div style={{ padding: 12, background: C.redDim, borderRadius: 9, border: `1px solid ${C.red}44`, marginBottom: 14 }}>
                        <div style={{ fontWeight: 700, color: C.red, marginBottom: 8 }}>Regenerate all 5 passwords?</div>
                        <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Old passwords stop working immediately.</div>
                        <div style={{ display: 'flex', gap: 10 }}><Btn variant="danger" size="sm" onClick={() => regenerate(lec.id)}>Yes, Regenerate</Btn><Btn variant="ghost" size="sm" onClick={() => setRegenTarget(null)}>Cancel</Btn></div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Btn size="sm" variant="ghost" onClick={() => { copyText(`Email: ${lec.email}\nPasswords:\n${(lec.passwords || []).map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\nLogin: ${window.location.origin}`); flash('Copied!'); }}>📋 Copy Credentials</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => printCreds(lec)}>🖨 Print</Btn>
                      <Btn size="sm" variant="warning" onClick={() => setRegenTarget(lec.id)}>🔄 Regenerate Passwords</Btn>
                      <Btn size="sm" variant="danger" onClick={() => remove(lec.id)}>🗑 Remove</Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Admin: Courses overview ──────────────────────────────────────────────────
function AdminCourses() {
  const [courses, setCourses] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, l, s] = await Promise.all([getCourses(), getLecturers(), getAllSessions()]);
        setCourses(c); setLecturers(l); setSessions(s);
      } catch { }
      setLoading(false);
    })();
  }, []);

  if (loading) return <Spinner />;
  return (
    <>
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 20 }}>All Courses ({courses.length})</div>
      {courses.length === 0 ? <Card style={{ textAlign: 'center', padding: 40, color: C.muted }}>No courses yet — lecturers create courses from their portal.</Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {courses.map(c => {
            const lec = lecturers.find(l => l.id === c.lecturer_id);
            const sesCount = sessions.filter(s => s.course_id === c.id).length;
            return (
              <Card key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div><Badge color={C.accent} small>{c.code}</Badge><div style={{ fontWeight: 700, fontSize: 15, marginTop: 6 }}>{c.name}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{lec?.name} · {c.department} · Yr {c.year} Sem {c.semester}</div></div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.muted }}><span>{sesCount} sessions done</span><span>of {c.total_planned_classes} planned</span></div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getAllStudents().then(setStudents).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <Spinner />;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>All Students ({students.length})</div>
      {students.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: C.muted }}>No students yet</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: C.surface }}>{['Student No', 'Surname & Initials', 'Enrolled In'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
          <tbody>{students.map((st, i) => (
            <tr key={st.id} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 ? C.surface + '40' : 'transparent' }}>
              <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: C.muted }}>{st.student_no}</td>
              <td style={{ padding: '9px 14px', fontWeight: 600 }}>{st.surname_initials}</td>
              <td style={{ padding: '9px 14px' }}>{(st.enrolments || []).map(e => <Badge key={e.course_id} color={C.accent} small>{e.course_id}</Badge>)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

function AdminSessions() {
  const [sessions, setSessions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([getAllSessions(), getCourses(), getLecturers()]).then(([s, c, l]) => { setSessions(s); setCourses(c); setLecturers(l); }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 16 }}>All Sessions ({sessions.length})</div>
      {sessions.length === 0 ? <Card style={{ textAlign: 'center', padding: 40, color: C.muted }}>No sessions yet</Card> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {sessions.map(ses => {
            const course = courses.find(c => c.id === ses.course_id);
            const lec = lecturers.find(l => l.id === ses.lecturer_id);
            const scans = ses.scans || [];
            return (
              <Card key={ses.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: ses.status === 'active' ? C.green + '22' : C.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{ses.status === 'active' ? '🔴' : '📋'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{course?.name} <span style={{ color: C.muted, fontSize: 12 }}>({course?.code})</span></div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{lec?.name} · {ses.date} {ses.start_time} · 📍 {ses.room}</div>
                </div>
                <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800, fontSize: 20, color: C.accent }}>{scans.length}</div><div style={{ fontSize: 11, color: C.yellow }}>{scans.filter(s => s.status === 'late').length} late</div></div>
                <Badge color={ses.status === 'active' ? C.green : C.muted}>{ses.status}</Badge>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminSettings({ adminConfig, flash }) {
  const [form, setForm] = useState({ currentPw: '', newPw: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    const e = {};
    if (form.currentPw !== adminConfig.password) e.currentPw = 'Current password incorrect';
    if (form.newPw.length < 8) e.newPw = 'Minimum 8 characters';
    if (form.newPw !== form.confirm) e.confirm = 'Passwords do not match';
    setErrors(e); if (Object.keys(e).length) return;
    setSaving(true);
    try { await updateAdminPassword(form.newPw); setForm({ currentPw: '', newPw: '', confirm: '' }); flash('Password updated! Please sign in again.'); } catch { flash('Failed to update password', 'danger'); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 20 }}>Settings</div>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Change Admin Password</div>
        <Alert type="success" style={{ marginBottom: 16 }}>✅ Data is stored in Supabase cloud — login works from any device or browser.</Alert>
        <Inp label="Current Password" type="password" value={form.currentPw} error={errors.currentPw} onChange={e => setForm(p => ({ ...p, currentPw: e.target.value }))} />
        <Inp label="New Password" type="password" value={form.newPw} error={errors.newPw} onChange={e => setForm(p => ({ ...p, newPw: e.target.value }))} />
        <Inp label="Confirm New Password" type="password" value={form.confirm} error={errors.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} />
        <Btn onClick={changePassword} loading={saving}>Update Password</Btn>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LECTURER DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function LecturerDashboard({ lecturer, onLogout }) {
  const [tab, setTab] = useState('courses');
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [msg, setMsg] = useState(null);

  const flash = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); };

  const loadCourses = useCallback(async () => {
    try {
      const all = await getCourses();
      setCourses(all.filter(c => c.lecturer_id === lecturer.id));
    } catch { flash('Failed to load courses', 'danger'); }
    setLoading(false);
  }, [lecturer.id]);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  const startSession = async (course, room) => {
    const doStart = async (lat, lng) => {
      try {
        const now = new Date();
        const session = await createSession({
          id: genId(), course_id: course.id, lecturer_id: lecturer.id,
          date: now.toISOString().split('T')[0], start_time: now.toTimeString().slice(0, 5),
          room: room || course.room || 'TBA', lat, lng,
        });
        setActiveSessionId(session.id); setTab('session');
      } catch (err) { flash('Failed to start session: ' + err.message, 'danger'); }
    };
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => doStart(pos.coords.latitude, pos.coords.longitude), () => doStart(-23.9045, 29.4688));
    else doStart(-23.9045, 29.4688);
  };

  const endSession = async () => {
    if (activeSessionId) { try { await closeSession(activeSessionId); } catch {} }
    setActiveSessionId(null); setTab('courses');
  };

  if (loading) return <Shell role={lecturer.name} onLogout={onLogout}><Spinner text="Loading your courses…" /></Shell>;

  return (
    <Shell role={lecturer.name} onLogout={onLogout}>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: C.surface, padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {['courses', 'students', 'reports', ...(activeSessionId ? ['session'] : [])].map(t => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{t === 'session' ? '🔴 Live Session' : t.charAt(0).toUpperCase() + t.slice(1)}</Pill>
        ))}
      </div>
      {tab === 'courses'  && <CoursesTab lecturer={lecturer} courses={courses} onCourseAdded={loadCourses} onStartSession={startSession} activeSessionId={activeSessionId} flash={flash} />}
      {tab === 'students' && <LecturerStudentsTab courses={courses} flash={flash} />}
      {tab === 'reports'  && <ReportsTab lecturer={lecturer} courses={courses} flash={flash} />}
      {tab === 'session'  && activeSessionId && <LiveSessionTab sessionId={activeSessionId} onEnd={endSession} />}
    </Shell>
  );
}

function CoursesTab({ lecturer, courses, onCourseAdded, onStartSession, activeSessionId, flash }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', department: lecturer.department || '', year: new Date().getFullYear(), semester: '1', total_planned_classes: 40, room: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [roomInputs, setRoomInputs] = useState({});

  const addCourse = async () => {
    const e = {};
    if (!form.code.trim()) e.code = 'Required';
    if (!form.name.trim()) e.name = 'Required';
    setErrors(e); if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await createCourse({ id: genId(), lecturer_id: lecturer.id, ...form, year: Number(form.year), total_planned_classes: Number(form.total_planned_classes) });
      setForm({ code: '', name: '', department: lecturer.department || '', year: new Date().getFullYear(), semester: '1', total_planned_classes: 40, room: '' });
      setShowAdd(false); await onCourseAdded(); flash('Course added!');
    } catch (err) { flash('Failed: ' + err.message, 'danger'); }
    setSaving(false);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>My Courses & Subjects<span style={{ color: C.muted, fontSize: 14, fontWeight: 400, marginLeft: 10 }}>({courses.length})</span></div>
        <Btn onClick={() => { setShowAdd(!showAdd); setErrors({}); }}>+ Add Course / Subject</Btn>
      </div>
      {showAdd && (
        <Card style={{ marginBottom: 24, borderColor: C.accent + '55' }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>New Course / Subject</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Inp label="Course Code *" value={form.code} error={errors.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. BUS301" />
            <Inp label="Course / Subject Name *" value={form.name} error={errors.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Business Ethics" />
            <Inp label="Department" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} placeholder="e.g. Business Management" />
            <Inp label="Default Venue" value={form.room} onChange={e => setForm(p => ({ ...p, room: e.target.value }))} placeholder="e.g. Lecture Hall A" />
            <Inp label="Academic Year" type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} />
            <Sel label="Semester" value={form.semester} onChange={e => setForm(p => ({ ...p, semester: e.target.value }))} options={[{ value: '1', label: 'Semester 1' }, { value: '2', label: 'Semester 2' }, { value: 'Full Year', label: 'Full Year' }]} />
            <Inp label="Total Planned Classes" type="number" value={form.total_planned_classes} onChange={e => setForm(p => ({ ...p, total_planned_classes: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}><Btn onClick={addCourse} loading={saving}>Save Course</Btn><Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn></div>
        </Card>
      )}
      {courses.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}><div style={{ fontSize: 40, marginBottom: 12 }}>📚</div><div style={{ fontWeight: 700, marginBottom: 8 }}>No courses yet</div><div style={{ color: C.muted }}>Add your first course above.</div></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {courses.map(course => {
            const isThisActive = activeSessionId && false; // we'd need to track which session is for which course
            return (
              <Card key={course.id} style={{ borderColor: isThisActive ? C.green + '66' : C.border }}>
                <div style={{ marginBottom: 10 }}>
                  <Badge color={C.accent} small>{course.code}</Badge>
                  <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6 }}>{course.name}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{course.department} · Yr {course.year} · Sem {course.semester}</div>
                  {course.room && <div style={{ color: C.muted, fontSize: 12 }}>📍 {course.room}</div>}
                </div>
                {!activeSessionId ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={roomInputs[course.id] || ''} onChange={e => setRoomInputs(p => ({ ...p, [course.id]: e.target.value }))} placeholder={course.room || 'Venue for today'} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, outline: 'none' }} />
                    <Btn size="sm" onClick={() => onStartSession(course, roomInputs[course.id] || course.room)}>▶ Start</Btn>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.muted }}>End the active session first</div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function LecturerStudentsTab({ courses, flash }) {
  const [selectedCourse, setSelectedCourse] = useState(courses[0]?.id || '');
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ studentNo: '', surnameInitials: '' });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const course = courses.find(c => c.id === selectedCourse);

  const load = useCallback(async () => {
    if (!selectedCourse) return;
    setLoading(true);
    try {
      const [sts, sess] = await Promise.all([getStudentsForCourse(selectedCourse), getSessions(selectedCourse)]);
      setStudents(sts); setSessions(sess);
    } catch { flash('Failed to load students', 'danger'); }
    setLoading(false);
  }, [selectedCourse]);

  useEffect(() => { load(); }, [load]);

  const processFile = async (file) => {
    if (!selectedCourse) { flash('Select a course first', 'warning'); return; }
    setUploading(true);
    try {
      const parsed = await parseStudentExcel(file);
      if (!parsed.length) { flash('No valid rows found. Check file format.', 'warning'); return; }
      const { added, skipped } = await upsertManyStudents(parsed, selectedCourse);
      await load();
      flash(`✓ ${added} added${skipped ? `, ${skipped} already enrolled` : ''}`);
    } catch (e) { flash('Error reading file: ' + e.message, 'danger'); }
    setUploading(false);
  };

  const addManual = async () => {
    if (!manual.studentNo.trim() || !manual.surnameInitials.trim()) { flash('Both fields required', 'danger'); return; }
    try { await upsertStudentAndEnrol(manual.studentNo.trim(), manual.surnameInitials.trim(), selectedCourse); await load(); flash('Student added'); setManual({ studentNo: '', surnameInitials: '' }); } catch (e) { flash('Failed: ' + e.message, 'danger'); }
  };

  const remove = async (studentId) => {
    try { await removeStudentFromCourse(studentId, selectedCourse); await load(); } catch { flash('Failed to remove', 'danger'); }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Student Register</div>
        <div style={{ display: 'flex', gap: 8 }}><Btn variant="ghost" size="sm" onClick={downloadStudentTemplate}>⬇ Template</Btn><Btn size="sm" onClick={() => setShowManual(!showManual)}>+ Add Manually</Btn></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {courses.map(c => <button key={c.id} onClick={() => setSelectedCourse(c.id)} style={{ padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: `1px solid ${selectedCourse === c.id ? C.accent : C.border}`, background: selectedCourse === c.id ? C.accentGlow : 'transparent', color: selectedCourse === c.id ? C.accent : C.muted }}>{c.code} — {c.name}</button>)}
      </div>
      {selectedCourse && (
        <>
          <Card style={{ marginBottom: 20, borderColor: dragOver ? C.accent + '88' : C.border, textAlign: 'center', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
            <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]); }} style={{ padding: '20px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{uploading ? '⟳' : '📂'}</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{uploading ? 'Processing…' : 'Upload Student List (Excel)'}</div>
              <div style={{ color: C.muted, fontSize: 13 }}>Drag & drop or click · <strong>Col A:</strong> Student Number · <strong>Col B:</strong> Surname and Initials</div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }} />
          </Card>
          {showManual && (
            <Card style={{ marginBottom: 16, borderColor: C.accent + '44' }}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Add Student Manually to {course?.code}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Inp label="Student Number" value={manual.studentNo} onChange={e => setManual(p => ({ ...p, studentNo: e.target.value }))} placeholder="e.g. 20210001" />
                <Inp label="Surname and Initials" value={manual.surnameInitials} onChange={e => setManual(p => ({ ...p, surnameInitials: e.target.value }))} placeholder="e.g. Khumalo T.S." />
              </div>
              <div style={{ display: 'flex', gap: 10 }}><Btn onClick={addManual}>Add Student</Btn><Btn variant="ghost" onClick={() => setShowManual(false)}>Cancel</Btn></div>
            </Card>
          )}
          {loading ? <Spinner /> : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>{course?.name}</span><Badge color={C.accent}>{students.length} enrolled</Badge>
              </div>
              {students.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: C.muted }}>No students yet — upload or add manually.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: C.surface }}>{['#', 'Student No', 'Surname & Initials', 'Present', 'Late', 'Absent', 'Att. %', 'Status', ''].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
                  <tbody>{students.map((st, i) => {
                    const { present, late, absent, total } = studentCourseStats(st.student_no, selectedCourse, sessions);
                    const p = pct(present + late, Math.max(total, 1));
                    const { label, color } = attendanceStatus(p);
                    return (
                      <tr key={st.id} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 ? C.surface + '40' : 'transparent' }}>
                        <td style={{ padding: '9px 12px', color: C.muted, fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12, color: C.muted }}>{st.student_no}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>{st.surname_initials}</td>
                        <td style={{ padding: '9px 12px', color: C.green, fontWeight: 700 }}>{present}</td>
                        <td style={{ padding: '9px 12px', color: C.yellow, fontWeight: 700 }}>{late}</td>
                        <td style={{ padding: '9px 12px', color: C.red, fontWeight: 700 }}>{absent}</td>
                        <td style={{ padding: '9px 12px', minWidth: 90 }}><div style={{ fontWeight: 700, color, marginBottom: 3 }}>{p}%</div><MiniBar value={p} /></td>
                        <td style={{ padding: '9px 12px' }}><Badge color={color} small>{label}</Badge></td>
                        <td style={{ padding: '9px 12px' }}><button onClick={() => remove(st.id)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18 }}>×</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}

function LiveSessionTab({ sessionId, onEnd }) {
  const [session, setSession] = useState(null);
  const [scans, setScans] = useState([]);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [elapsed, setElapsed] = useState('00:00');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSession(sessionId);
        setSession(s); setScans(s?.scans || []);
        const enrolled = await getStudentsForCourse(s.course_id);
        setEnrolledCount(enrolled.length);
      } catch {}
      setLoading(false);
    })();
    // Real-time scan updates
    const unsub = subscribeToScans(sessionId, (newScan) => setScans(prev => [newScan, ...prev]));
    return unsub;
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    const start = new Date(`${session.date}T${session.start_time}:00`);
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date() - start) / 1000));
      setElapsed(`${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`);
    };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [session]);

  if (loading) return <Spinner text="Loading session…" />;
  if (!session) return <Alert type="danger">Session not found.</Alert>;

  const sessionUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
  const present = scans.filter(s => s.status === 'present').length;
  const late = scans.filter(s => s.status === 'late').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green, boxShadow: `0 0 0 5px ${C.green}33` }} />
        <span style={{ fontWeight: 800, color: C.green, fontSize: 16 }}>LIVE SESSION</span>
        <span style={{ fontFamily: 'monospace', color: C.muted }}>{elapsed}</span>
        <span style={{ color: C.muted, fontSize: 13 }}>· Updates in real-time from any device</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Session: {session.date} · {session.start_time} · 📍 {session.room}</div>
          <div style={{ display: 'inline-block', background: 'white', padding: 12, borderRadius: 14, margin: '14px 0' }}>
            <QRCodeSVG data={sessionId} size={180} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, wordBreak: 'break-all', fontFamily: 'monospace', marginBottom: 10 }}>{sessionUrl}</div>
          <Btn size="sm" variant="ghost" onClick={() => copyText(sessionUrl)}>📋 Copy Link</Btn>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StatCard label="Present" value={present} color={C.green} />
            <StatCard label="Late" value={late} color={C.yellow} />
            <StatCard label="Enrolled" value={enrolledCount} color={C.accent} />
            <StatCard label="Not Yet In" value={Math.max(0, enrolledCount - scans.length)} color={C.red} />
          </div>
          <MiniBar value={scans.length} max={Math.max(enrolledCount, 1)} />
          <div style={{ textAlign: 'center', fontSize: 13, color: C.muted }}>{scans.length} of {enrolledCount} scanned · ⏱ LATE after 10 min</div>
          <Btn variant="danger" size="lg" onClick={onEnd}>■ End Session</Btn>
        </div>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          Live Scan Log <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>— updates automatically from all devices</span>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {scans.length === 0 ? <div style={{ padding: 28, textAlign: 'center', color: C.muted }}>Waiting for students to scan in…</div> : (
            scans.map((sc, i) => (
              <div key={i} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}22`, display: 'flex', alignItems: 'center', gap: 14 }}>
                <Badge color={sc.status === 'late' ? C.yellow : C.green} small>{sc.status}</Badge>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: C.muted, width: 90 }}>{sc.student_no}</div>
                <div style={{ fontWeight: 600, flex: 1 }}>{sc.surname_initials}</div>
                {sc.minutes_late > 0 && <span style={{ fontSize: 12, color: C.yellow }}>+{sc.minutes_late}min</span>}
                <div style={{ fontSize: 12, color: C.muted }}>{new Date(sc.scanned_at).toLocaleTimeString('en-ZA')}</div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function ReportsTab({ lecturer, courses, flash }) {
  const [sel, setSel] = useState(courses[0]?.id || '');
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const course = courses.find(c => c.id === sel);

  useEffect(() => {
    if (!sel) return;
    setLoading(true);
    Promise.all([getStudentsForCourse(sel), getSessions(sel)]).then(([s, sess]) => { setStudents(s); setSessions(sess); }).catch(() => {}).finally(() => setLoading(false));
  }, [sel]);

  const atRisk = students.filter(st => { const { present, late, total } = studentCourseStats(st.student_no, sel, sessions); return total > 0 && pct(present + late, total) < 80; });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Attendance Reports</div>
        <Btn variant="success" disabled={!course} onClick={async () => { if (course) await exportAttendanceExcel(course, sessions, students, lecturer.name); }}>⬇ Download Excel Register</Btn>
      </div>
      <Alert type="warning"><strong>80% Policy:</strong> Students must attend 80% of all conducted sessions. Late arrivals count as present. Below 80% = flagged in Excel export.</Alert>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {courses.map(c => <button key={c.id} onClick={() => setSel(c.id)} style={{ padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: `1px solid ${sel === c.id ? C.accent : C.border}`, background: sel === c.id ? C.accentGlow : 'transparent', color: sel === c.id ? C.accent : C.muted }}>{c.code}</button>)}
      </div>
      {loading ? <Spinner /> : course && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
            <StatCard label="Enrolled" value={students.length} />
            <StatCard label="Sessions Done" value={sessions.length} sub={`of ${course.total_planned_classes} planned`} color={C.blue} />
            <StatCard label="At Risk" value={atRisk.length} color={C.red} sub="< 80%" />
            <StatCard label="Good Standing" value={students.length - atRisk.length} color={C.green} />
          </div>
          {atRisk.length > 0 && (
            <Card style={{ marginBottom: 20, borderColor: C.red + '44', background: C.redDim }}>
              <div style={{ fontWeight: 700, color: C.red, marginBottom: 12 }}>⚠ Intervention Required ({atRisk.length})</div>
              {atRisk.map(st => { const { present, late, absent, total } = studentCourseStats(st.student_no, sel, sessions); const p = pct(present + late, Math.max(total, 1)); return <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 12px', background: C.card, borderRadius: 8, marginBottom: 6 }}><div style={{ fontFamily: 'monospace', fontSize: 12, color: C.muted, width: 90 }}>{st.student_no}</div><div style={{ fontWeight: 600, flex: 1 }}>{st.surname_initials}</div><div style={{ fontSize: 12, color: C.muted }}>P:{present} L:{late} A:{absent}</div><Badge color={p >= 60 ? C.yellow : C.red}>{p}%</Badge></div>; })}
            </Card>
          )}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>Full Register — {course.name}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: C.surface }}>{['#', 'Student No', 'Surname & Initials', 'P', 'L', 'A', 'Total', 'Att. %', 'Status'].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
              <tbody>{students.map((st, i) => { const { present, late, absent, total } = studentCourseStats(st.student_no, sel, sessions); const p = pct(present + late, Math.max(total, 1)); const { label, color } = attendanceStatus(p); return <tr key={st.id} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 ? C.surface + '40' : 'transparent' }}><td style={{ padding: '9px 12px', color: C.muted }}>{i + 1}</td><td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12, color: C.muted }}>{st.student_no}</td><td style={{ padding: '9px 12px', fontWeight: 600 }}>{st.surname_initials}</td><td style={{ padding: '9px 12px', color: C.green, fontWeight: 700 }}>{present}</td><td style={{ padding: '9px 12px', color: C.yellow, fontWeight: 700 }}>{late}</td><td style={{ padding: '9px 12px', color: C.red, fontWeight: 700 }}>{absent}</td><td style={{ padding: '9px 12px', color: C.muted }}>{total}</td><td style={{ padding: '9px 12px', minWidth: 90 }}><div style={{ fontWeight: 700, color, marginBottom: 3 }}>{p}%</div><MiniBar value={p} /></td><td style={{ padding: '9px 12px' }}><Badge color={color} small>{label}</Badge></td></tr>; })}</tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT CHECK-IN
// ═══════════════════════════════════════════════════════════════════════════════
function StudentScanView({ sessionId, onBack }) {
  const [session, setSession] = useState(null);
  const [course, setCourse] = useState(null);
  const [step, setStep] = useState('loading');
  const [studentNo, setStudentNo] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!sessionId) { setStep('no_session'); return; }
    (async () => {
      try {
        const s = await getSession(sessionId);
        if (!s || s.status !== 'active') { setStep('no_session'); return; }
        setSession(s);
        const allCourses = await getCourses();
        setCourse(allCourses.find(c => c.id === s.course_id));
        setStep('enter');
      } catch { setStep('no_session'); }
    })();
  }, [sessionId]);

  const handleScan = async () => {
    setErr('');
    const sNo = studentNo.trim();
    if (!sNo) { setErr('Please enter your student number'); return; }
    // Check already scanned
    const existing = (session?.scans || []).find(sc => sc.student_no === sNo);
    if (existing) { setResult({ ...existing, alreadyDone: true }); setStep('already'); return; }

    setStep('verifying');
    const doLog = async (lat, lng) => {
      try {
        const now = new Date().toISOString();
        const { status, minutesLate } = getScanStatus(now, session.date, session.start_time);
        // Look up student name
        const allStudents = await getStudentsForCourse(session.course_id);
        const student = allStudents.find(st => st.student_no === sNo);
        const scan = await recordScan({ session_id: sessionId, student_no: sNo, surname_initials: student?.surname_initials || sNo, status, minutes_late: minutesLate, lat, lng });
        setResult(scan); setStep('success');
      } catch (e) {
        if (e.code === '23505') { setErr('You have already scanned in for this session.'); setStep('enter'); }
        else { setErr('Failed to record. Try again.'); setStep('enter'); }
      }
    };
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => doLog(pos.coords.latitude, pos.coords.longitude), () => doLog(-23.9045, 29.4688));
    else doLog(-23.9045, 29.4688);
  };

  const bg = `radial-gradient(ellipse 70% 50% at 50% -5%, ${C.accent}22, transparent), ${C.bg}`;

  if (step === 'loading') return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg }}><Spinner text="Loading session…" /></div>;

  if (step === 'no_session') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, padding: 24 }}>
      <Card style={{ maxWidth: 400, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>No active session</div>
        <div style={{ color: C.muted, fontSize: 14 }}>This session link has expired or the session has been closed.</div>
        {onBack && <div style={{ marginTop: 16 }}><Btn variant="ghost" onClick={onBack}>← Back to Login</Btn></div>}
      </Card>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: C.muted }}>{FACULTY} — {INSTITUTION}</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: '6px 0 4px' }}>Student Check-In</h1>
          {course && <div style={{ color: C.accent, fontWeight: 700 }}>{course.code}: {course.name}</div>}
          {session && <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>📅 {session.date} · 🕐 {session.start_time} · 📍 {session.room}</div>}
        </div>
        {step === 'enter' && (
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Enter Your Student Number</div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Type your student number to record your attendance.</div>
            <Fld label="Student Number">
              <input value={studentNo} onChange={e => setStudentNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleScan()} placeholder="e.g. 20210001" autoFocus style={{ ...inputStyle(err), fontSize: 20, fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center' }} onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = err ? C.red : C.border} />
            </Fld>
            {err && <Alert type="danger">{err}</Alert>}
            <Btn onClick={handleScan} size="lg" style={{ width: '100%', marginTop: 4 }}>✓ Log Attendance</Btn>
            <div style={{ marginTop: 12, padding: 10, background: C.yellowDim, borderRadius: 8, fontSize: 12, color: C.yellow, border: `1px solid ${C.yellow}33`, textAlign: 'center' }}>⏱ Arrivals after <strong>10 minutes</strong> are recorded as LATE</div>
          </Card>
        )}
        {step === 'verifying' && <Card style={{ textAlign: 'center', padding: 48 }}><div style={{ fontSize: 40, marginBottom: 16, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div><div style={{ fontWeight: 700 }}>Recording…</div><style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style></Card>}
        {step === 'success' && result && (
          <Card style={{ textAlign: 'center', borderColor: result.status === 'late' ? C.yellow + '66' : C.green + '66' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>{result.status === 'late' ? '⏰' : '✅'}</div>
            <div style={{ fontWeight: 900, fontSize: 20, color: result.status === 'late' ? C.yellow : C.green, marginBottom: 8 }}>{result.status === 'late' ? 'Marked as LATE' : 'Attendance Recorded!'}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{result.surname_initials}</div>
            <div style={{ fontFamily: 'monospace', color: C.muted, marginBottom: 16 }}>{result.student_no}</div>
            {result.status === 'late' && <Alert type="warning">Arrived {result.minutes_late} minute{result.minutes_late !== 1 ? 's' : ''} after session start — recorded as LATE.</Alert>}
            <div style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12 }}>
              <div style={{ color: C.muted, marginBottom: 4 }}>📍 Location captured · {new Date(result.scanned_at).toLocaleTimeString('en-ZA')}</div>
              <div style={{ fontFamily: 'monospace', color: C.accent, fontSize: 11 }}>{result.lat?.toFixed(5)}, {result.lng?.toFixed(5)}</div>
            </div>
            <Btn variant="ghost" onClick={() => { setStep('enter'); setStudentNo(''); setResult(null); }} style={{ width: '100%' }}>Done</Btn>
          </Card>
        )}
        {step === 'already' && result && (
          <Card style={{ textAlign: 'center', borderColor: C.blue + '66' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>ℹ️</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Already Checked In</div>
            <div style={{ color: C.muted, marginBottom: 8 }}>{result.surname_initials}</div>
            <Badge color={result.status === 'late' ? C.yellow : C.green}>{result.status}</Badge>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>Checked in at {new Date(result.scanned_at).toLocaleTimeString('en-ZA')}</div>
            <div style={{ marginTop: 16 }}><Btn variant="ghost" onClick={() => { setStep('enter'); setStudentNo(''); }} style={{ width: '100%' }}>OK</Btn></div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP — boot sequence: check Supabase → first run or login
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [bootState, setBootState] = useState('loading'); // loading | no_config | ready | error
  const [adminConfig, setAdminConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [sessionParam, setSessionParam] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) { setSessionParam(sid); return; }

    (async () => {
      try {
        const config = await getAdminConfig();
        if (!config || !config.initialized) { setBootState('no_config'); }
        else { setAdminConfig(config); setBootState('ready'); }
      } catch (err) {
        console.error(err);
        setBootState('error');
      }
    })();
  }, []);

  // QR scan entry point
  if (sessionParam) return <StudentScanView sessionId={sessionParam} onBack={() => { setSessionParam(null); window.history.replaceState({}, '', window.location.pathname); }} />;

  if (bootState === 'loading') return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: C.muted }}>
        <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
        <div style={{ fontWeight: 700 }}>Connecting to database…</div>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (bootState === 'error') return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12, color: C.red }}>Cannot connect to database</div>
        <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Could not reach Supabase. This usually means:<br />
          1. The <code style={{ background: C.surface, padding: '1px 6px', borderRadius: 4 }}>REACT_APP_SUPABASE_URL</code> or <code style={{ background: C.surface, padding: '1px 6px', borderRadius: 4 }}>REACT_APP_SUPABASE_ANON_KEY</code> environment variables are missing.<br /><br />
          2. On Netlify: go to <strong>Site Settings → Environment Variables</strong> and add them, then redeploy.
        </div>
        <Btn onClick={() => window.location.reload()} variant="ghost">Retry</Btn>
      </Card>
    </div>
  );

  if (bootState === 'no_config') return <FirstRunSetup onComplete={async () => { const config = await getAdminConfig(); setAdminConfig(config); setBootState('ready'); }} />;

  if (!user) return <LoginScreen adminConfig={adminConfig} onLogin={u => { setUser(u); if (u.role === 'admin') setAdminConfig(adminConfig); }} />;
  if (user.role === 'admin') return <AdminDashboard adminConfig={adminConfig} onLogout={() => setUser(null)} />;
  if (user.role === 'lecturer') return <LecturerDashboard lecturer={user.lecturer} onLogout={() => setUser(null)} />;
  if (user.role === 'student') return <StudentScanView sessionId={null} onBack={() => setUser(null)} />;

  return null;
}
