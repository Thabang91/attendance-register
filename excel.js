// ─── excel.js ─────────────────────────────────────────────────────────────────

export async function parseStudentExcel(file) {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const students = [];
        rows.forEach((row, i) => {
          if (i === 0 && isNaN(Number(String(row[0]).trim()))) return;
          const studentNo = String(row[0] || '').trim();
          const surnameInitials = String(row[1] || '').trim();
          if (studentNo && surnameInitials) students.push({ studentNo, surnameInitials });
        });
        resolve(students);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function exportAttendanceExcel(course, sessions, students, lecturerName) {
  const XLSX = await import('xlsx');
  const courseSessions = sessions.filter(s => s.course_id === course.id);
  courseSessions.sort((a, b) => new Date(a.date) - new Date(b.date));

  const headerRows = [
    ['ATTENDANCE REGISTER'],
    ['Faculty of Management Sciences — Polokwane'],
    [`Course: ${course.name} (${course.code})`],
    [`Department: ${course.department}`],
    [`Lecturer: ${lecturerName}`],
    [`Year: ${course.year} | Semester: ${course.semester}`],
    [`Total Planned Classes: ${course.total_planned_classes}`],
    ['Policy: Students must maintain at least 80% attendance'],
    [`Generated: ${new Date().toLocaleString('en-ZA')}`],
    [],
    ['Student No', 'Surname & Initials',
      ...courseSessions.map(s => `${s.date}\n${s.start_time}`),
      'Present', 'Late', 'Absent', 'Total Sessions', 'Attendance %', 'Status', 'AT RISK (80% Policy)'],
  ];

  const dataRows = students.map(st => {
    let present = 0, late = 0, absent = 0;
    const cells = courseSessions.map(session => {
      const scan = (session.scans || []).find(sc => sc.student_no === st.student_no);
      if (!scan) { absent++; return 'ABS'; }
      if (scan.status === 'late') { late++; return `LATE (+${scan.minutes_late}min)`; }
      present++; return 'P';
    });
    const total = courseSessions.length;
    const attPct = total === 0 ? 0 : Math.round(((present + late) / total) * 100);
    const status = attPct >= 80 ? 'Good Standing' : attPct >= 60 ? 'At Risk' : 'Critical';
    const atRisk = attPct < 80 ? 'YES — INTERVENTION NEEDED' : 'No';
    return [st.student_no, st.surname_initials, ...cells, present, late, absent, total, `${attPct}%`, status, atRisk];
  });

  const summaryRows = [
    [],
    ['SUMMARY'],
    ['Total Students', students.length],
    ['Students At Risk (<80%)', dataRows.filter(r => r[r.length - 1] !== 'No').length],
    ['Sessions Conducted', courseSessions.length],
    ['Class Average', dataRows.length > 0
      ? Math.round(dataRows.reduce((sum, r) => sum + parseInt(r[r.length - 3]), 0) / dataRows.length) + '%'
      : 'N/A'],
  ];

  const allRows = [...headerRows, ...dataRows, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = [
    { wch: 14 }, { wch: 26 },
    ...courseSessions.map(() => ({ wch: 14 })),
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Register');
  XLSX.writeFile(wb, `Attendance_${course.code}_${course.name.replace(/\s+/g, '_')}.xlsx`);
}

export async function downloadStudentTemplate() {
  const XLSX = await import('xlsx');
  const rows = [
    ['Student Number', 'Surname and Initials'],
    ['20210001', 'Khumalo T.S.'],
    ['20210002', 'Sithole L.R.'],
    ['20210003', 'Mokoena N.P.'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, 'Student_Upload_Template.xlsx');
}
