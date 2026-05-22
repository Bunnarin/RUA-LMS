const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { React } = ctx.libs;
const { useRef, useState, forwardRef } = React;
const { Button, Checkbox } = ctx.libs.antd;

let schedules = [];
// 2 scenario: if we read only one schedule, or we read all schedule
const scheduleId = await ctx.getVar('ctx.popup.resource.filterByTk');
if (scheduleId)
  await ctx.api.request({
    url: 'schedule:get',
    params: {
      filterByTk: scheduleId,
      appends: ['completedStudents','course','lecturers','class'],
    }
  }).then(res => schedules = [resObj(res)]);
else
  await ctx.api.request({
    url: 'schedule:list',
    params: {
      appends: ['completedStudents','course','lecturers','class'],
      pageSize: 1000
    }
  }).then(res => schedules = res.data.data);

// 1. Fetch Data
const { data: { data: questions } } = await ctx.api.request({
  url: 'evaluationQuestion:list'
});

const { data: { data: semesters } } = await ctx.api.request({
  url: 'semester:list',
  params: {
    filter: {
      $or: [
        { startDate: { $dateOn: { type: "lastYear" } } },
        { startDate: { $dateOn: { type: "thisYear" } } },
        { startDate: { $dateOn: { type: "nextYear" } } }
      ]
    }
  }
});

// find the semester whose middle is closest to now
const semester = semesters.reduce((prev, curr) => {
  const time = (dateStr) => new Date(dateStr).getTime();
  const prevMiddle = time(prev.startDate) + (time(prev.endDate) - time(prev.startDate)) / 2;
  const currMiddle = time(curr.startDate) + (time(curr.endDate) - time(curr.startDate)) / 2;
  const prevDiff = Math.abs(prevMiddle - new Date().getTime());
  const currDiff = Math.abs(currMiddle - new Date().getTime());
  return currDiff < prevDiff ? curr : prev;
});

// if today is closer to the end than the mid of the semester, then we append the CLO qs
const now = new Date().getTime();
const start = new Date(semester.startDate).getTime();
const end = new Date(semester.endDate).getTime();
const mid = (start + end) / 2;
const closerToEnd = Math.abs(end - now) < Math.abs(mid - now);

let CLOs = [];

if (closerToEnd)
  await ctx.api.request({
    url: 'CLO:list',
    params: {
      pageSize: 1000
    }
  }).then(res => CLOs = res.data.data);

// Helpers
const getPercent = (answers) => {
  if (!answers) return "";
  const total = Object.values(answers).reduce((a, b) => a + b, 0);
  return Object.entries(answers)
    .map(([key, value]) => `${key}៖ ${((value / total) * 100).toFixed(0)}%`)
    .sort()
    .join("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0");
};

const getContent = (isText, showAiSummary, loading, answers, summaries) => {
  if (!answers) return "";
  if (!isText) return getPercent(answers);
  if (showAiSummary && loading) { // not updated yet
    const time = new Date();
    const minutesToWait = schedules.length * 5;
    time.setMinutes(time.getMinutes() + minutesToWait);
    return `summarizing. you can close this window and come back at ${time.toLocaleTimeString()}`;
  } else if (showAiSummary && !loading) // summary is updated
    return getPercent(summaries);
  const answerList = Object.entries(answers).flatMap(([answer, frequency]) => Array(frequency).fill(answer));
  return answerList.join("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0");
}

// 2. The Document Template
const DocTemplate = forwardRef(({ showAiSummary, showCLO, colWidth }, ref) => (<div ref={ref}>
  <style>{`
      table, p {
          font-family: 'Khmer OS Battambang', sans-serif;
          border-collapse: collapse;
          width: 100%;
      }
      td, th {
          text-align: center;
          border: 1pt solid #ccc;
      }
      .invisible-table td {
          border: none;
          text-align: center;
      }
  `}</style>

  {schedules.map((s, idx) => {
    const [loading, setLoading] = useState(false);
    if (showAiSummary && !loading)
      // we check if all the number of summary matches with answers, if not then update them
      questions.forEach((qs, idx) => {
        if (qs.type !== 'text') return;
        const answerCount = Object.values(s[`question${idx}`]).reduce((a, b) => a + b, 0);
        const summaryCount = Object.values(s[`summary${idx}`]).reduce((a, b) => a + b, 0);
        if (answerCount == summaryCount) return;
        // the server will summarize and save. we'll need to wait and refresh
        setLoading(true);
        ctx.api.request({
          url: 'workflows.endpoint:execute?title=summarize-schedule',
          method: 'POST',
          data: {
            scheduleId: s.id,
          }
        });
        setTimeout(window.location.reload, schedules.length * 5 * 60 * 1000);
      });

    return (<div key={idx}>
      <p style={{ marginBottom: '20px' }}>
        មុខវិជ្ជា៖ <strong>{s.course.khmerName}</strong>&nbsp;
        គ្រូបង្រៀន៖ <strong>{s.lecturers.map(l => l.khmerName || l.englishName).join(', ')}</strong>&nbsp;
        ថ្នាក់៖ <strong>{s.class.name}</strong><br />
        ចំនួនសិស្សឆ្លើយសរុប៖ <strong>{s.completedStudents?.length}</strong>
      </p>

      <table>
        <thead>
          <tr>
            <th style={{ width: `${colWidth}%` }}>សំណួរ</th>
            <th>ចម្លើយ</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((qs, i) => (<tr key={i}>
            <td>{qs.label}</td>
            <td>
              {getContent(qs.type == 'text', showAiSummary, loading, s[`question${i}`], s[`summary${i}`])}
            </td>
          </tr>))}
          {showCLO && CLOs.filter(CLO => CLO.courseId == s.courseId).map((CLO, i) => (
            <tr key={i + questions.length}>
              <td>CLO {CLO.number} achieved</td>
              <td>{getPercent(s[`question${i + questions.length}`])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <br /><br />
    </div>);
  })}
</div>));

// 3. Main App
const App = () => {
  const [showCLO, setShowCLO] = useState(closerToEnd);
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [colWidth, setColWidth] = useState(35);
  const docRef = useRef(null);

  const download = (isExcel = false) => {
    const fullHTML = `
      <html 
        xmlns:o='urn:schemas-microsoft-com:office:office' 
        xmlns:w='urn:schemas-microsoft-com:office:${isExcel ? 'excel' : 'word'}' 
        xmlns='https://www.w3.org/TR/html40'>
        <head>
          <meta charset='utf-8'>
        </head>
        <body>
          ${docRef.current.innerHTML}
        </body>
      </html>
    `;

    const blob = new Blob([fullHTML], { type: isExcel ? 'application/vnd.ms-excel' : 'application/msword' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = isExcel ? 'export.xls' : 'export.doc';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (<div>
    <div style={{
      position: 'sticky', top: 0, background: '#fff', padding: '12px 20px',
      borderBottom: '1px solid #d9d9d9', zIndex: 100, display: 'flex', gap: '20px', alignItems: 'center'
    }}>
      <Button onClick={() => download(false)} type="primary">download word</Button>
      <Button onClick={() => download(true)}>download excel</Button>

      <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Checkbox checked={showCLO} onChange={(e) => setShowCLO(e.target.checked)} />
        show CLOs
      </label>

      {/* <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Checkbox checked={showAiSummary} onChange={(e) => setShowAiSummary(e.target.checked)} />
        AI Summary
      </label> */}

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <label>Question Width: {colWidth}%</label>
        <input type="range" min="30" max="60" value={colWidth} onChange={(e) => setColWidth(e.target.value)} />
      </div>
    </div>

    <DocTemplate
      ref={docRef}
      showAiSummary={showAiSummary}
      showCLO={showCLO}
      colWidth={colWidth}
    />
  </div>);
};

ctx.render(<App />);