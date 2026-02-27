// ─── helpers.js ───────────────────────────────────────────────────────────────

export const genId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
};

export function genPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  let pw = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    all[Math.floor(Math.random() * all.length)],
  ];
  for (let i = pw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

export function gen5Passwords() {
  const set = new Set();
  while (set.size < 5) set.add(genPassword());
  return [...set];
}

export function pct(attended, total) {
  return total === 0 ? 0 : Math.round((attended / total) * 100);
}

export function attendanceStatus(p) {
  if (p >= 80) return { label: 'Good Standing', color: '#00D68F' };
  if (p >= 60) return { label: 'At Risk', color: '#FFB800' };
  return { label: 'Critical', color: '#FF4D6D' };
}

export function getScanStatus(scanTime, sessionDate, sessionStartTime) {
  const start = new Date(`${sessionDate}T${sessionStartTime}:00`);
  const diff = (new Date(scanTime) - start) / 60000;
  return { status: diff <= 10 ? 'present' : 'late', minutesLate: Math.max(0, Math.round(diff)) };
}

// Compute per-student stats from sessions+scans arrays (both already loaded)
export function studentCourseStats(studentNo, courseId, sessions) {
  const cs = sessions.filter(s => s.course_id === courseId);
  let present = 0, late = 0, absent = 0;
  cs.forEach(session => {
    const scan = (session.scans || []).find(sc => sc.student_no === studentNo);
    if (!scan) absent++;
    else if (scan.status === 'late') late++;
    else present++;
  });
  return { total: cs.length, present, late, absent };
}

export function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  else {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    document.execCommand('copy'); document.body.removeChild(t);
  }
}
