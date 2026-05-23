const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { React } = ctx.libs;
const { useRef, useState, forwardRef } = React;
const { Button, Checkbox, Select } = ctx.libs.antd;

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
  url: 'custom:get-recent-semesters'
});

const currentSemester = semesters[0];
const previousSemester = semesters[1];

let CLOs = [];
await ctx.api.request({
  url: 'CLO:list',
  params: {
    pageSize: 100000,
    filter: scheduleId ? { courseId: schedules[0].courseId } : {}
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

const getContent = (isText, answers) => {
  if (!answers) return "";
  if (!isText) return getPercent(answers);
  const answerList = Object.entries(answers).flatMap(([answer, frequency]) => Array(frequency).fill(answer));
  return answerList.join("\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0");
}

// 2. The Document Template
const DocTemplate = forwardRef(({ showCLO, colWidth, filteredSchedules }, ref) => (<div ref={ref}>
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

  {filteredSchedules.map((s, idx) => <div key={idx}>
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
              {getContent(qs.type == 'text', s[`question${i}`])}
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
    </div>)}
</div>));

// 3. Main App
const App = () => {
  const [colWidth, setColWidth] = useState(35);
  const [selectedSemester, setSelectedSemester] = useState(currentSemester);
  const [showCLO, setShowCLO] = useState(true);
  const docRef = useRef(null);

  // also filter any with empty answers all
  const filteredSchedules = schedules
    .filter(s => s.course?.semesterNum === selectedSemester.number && 
      // for all key of s that starts with question return true if at least one has a key
      Object.keys(s).some(key => key.startsWith('question') && s[key])
    );
  
  if (filteredSchedules.length == 0 && selectedSemester == currentSemester)
    setSelectedSemester(previousSemester);

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

      <Select
        value={selectedSemester.number}
        onChange={(value) => setSelectedSemester(semesters.find(s => s.number === value))}
        style={{ width: 120 }}
      >
        <Select.Option value={currentSemester.number}>Semester {currentSemester.number}</Select.Option>
        {previousSemester && previousSemester.number !== currentSemester.number && (
          <Select.Option value={previousSemester.number}>Semester {previousSemester.number}</Select.Option>
        )}
      </Select>

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
      showCLO={showCLO}
      colWidth={colWidth}
      filteredSchedules={filteredSchedules}
    />
  </div>);
};

ctx.render(<App />);