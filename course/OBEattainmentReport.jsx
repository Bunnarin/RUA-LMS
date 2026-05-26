const { React } = ctx.libs;
const { useState, useRef } = React;
const { Button, Select } = ctx.libs.antd;

const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const courseId = await ctx.getVar('ctx.popup.resource.filterByTk');

const { data: { data: semesters } } = await ctx.api.request({
    url: 'custom:get-recent-semesters'
});

let course;
await ctx.api.request({
    url: 'course:get?filterByTk=' + courseId
}).then(res => course = resObj(res));
const credit = course.theoryCredit + course.practiceCredit;

const semester = semesters.reduce((acc, sem) =>
    Math.abs(new Date() - new Date(acc.endDate)) < Math.abs(new Date() - new Date(sem.endDate)) ? acc : sem
, semesters[0]);

let passThreshold = 50;
await ctx.api.request({
    url: 'KV:get?filterByTk=gradeSpec'
}).then(res => passThreshold = JSON.parse(resObj(res).value).find(g => g.passThreshold).min);

const { data: { data: weights } } = await ctx.api.request({
    url: 'custom:sql-query',
    method: 'post',
    data: {
        type: 'OBE-course-attainment',
        courseId,
        startDate: semester.startDate,
    }
});

// All rows share the same class list (CROSS JOIN in SQL guarantees this)
const classes = weights[0].classes.map(c => c.name);

// Aggregate raw (CLO, PLO) rows into unique CLO or PLO rows,
// summing total_weight and combining per-class score arrays element-wise
const buildRows = (mode) => {
    const key = mode === 'CLO' ? 'CLO_number' : 'PLO_number';
    const groups = {};
    for (const weight of weights) {
        const k = weight[key];
        groups[k] ??= { number: k, totalWeight: 0, classMaps: {} };
        groups[k].totalWeight += parseInt(weight.total_weight);
        for (const cls of classes) {
            const scores = weight.classes.find(c => c.name === cls)?.scores;
            if (!groups[k].classMaps[cls])
                groups[k].classMaps[cls] = [...scores];
            else
                groups[k].classMaps[cls] = groups[k].classMaps[cls].map((v, i) => v + scores[i]);
        }
    }
    return Object.values(groups).sort((a, b) => a.number - b.number);
};

const AttainmentTable = () => {
    const [mode, setMode] = useState('CLO');
    const docRef = useRef(null);

    const download = (isExcel = false) => {
        const fullHTML = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office'
                  xmlns:x='urn:schemas-microsoft-com:office:${isExcel ? 'excel' : 'word'}'
                  xmlns='https://www.w3.org/TR/html40'>
                <head><meta charset='utf-8'></head>
                <body>${docRef.current.innerHTML}</body>
            </html>
        `;
        const blob = new Blob([fullHTML], { type: isExcel ? 'application/vnd.ms-excel' : 'application/msword' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = isExcel ? 'export.xls' : 'export.doc';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const rows = buildRows(mode);

    // Pre-compute per-class totals (summed across all CLO/PLO rows) for tfoot
    const classTotals = classes.map(cls => {
        const classSize = rows[0]?.classMaps[cls]?.length ?? 0;
        const totalPass = rows.reduce((sum, row) => {
            const scores = row.classMaps[cls];
            return sum + scores.filter(s => s / row.totalWeight > passThreshold / 100).length;
        }, 0);
        return { classSize, totalPass };
    });
    const overallStudents = classTotals.reduce((s, c) => s + c.classSize, 0);

    return (<>
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <Select
                options={[{ label: 'CLO', value: 'CLO' }, { label: 'PLO', value: 'PLO' }]}
                value={mode}
                onChange={setMode}
            />
            <Button type="primary" onClick={() => download(false)}>Download Word</Button>
            <Button onClick={() => download(true)}>Download Excel</Button>
        </div>
        <div ref={docRef}>
            <h1>{course.name} {credit}({course.theoryCredit}-{course.practiceCredit})</h1>
            <table border="1" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'center' }}>
                <thead>
                    <tr>
                        <th rowSpan={2}>{mode}</th>
                        <th rowSpan={2}>credit weight</th>
                        <th rowSpan={2}>max weight</th>
                        {classes.map(cls => (
                            <th key={cls} colSpan={2}>{cls} ({rows[0]?.classMaps[cls]?.length ?? 0} students)</th>
                        ))}
                        <th colSpan={2}>Total ({overallStudents} students)</th>
                    </tr>
                    <tr>
                        {classes.map(cls => (
                            <React.Fragment key={cls}>
                                <th>pass (#)</th>
                                <th>achievement</th>
                            </React.Fragment>
                        ))}
                        <th>pass (#)</th>
                        <th>achievement</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const rowTotalStudents = classes.reduce((s, cls) => s + (row.classMaps[cls]?.length || 0), 0);
                        const rowTotalPass = classes.reduce((s, cls) => {
                            const scores = row.classMaps[cls];
                            return s + scores.filter(sc => sc / row.totalWeight > passThreshold / 100).length;
                        }, 0);
                        return (
                            <tr key={row.number}>
                                <td>{mode} {row.number}</td>
                                <td>{(row.totalWeight * credit / 100).toFixed(2)}</td>
                                <td>{row.totalWeight}</td>
                                {classes.map(cls => {
                                    const scores = row.classMaps[cls];
                                    const nPass = scores.filter(s => s / row.totalWeight > passThreshold / 100).length;
                                    return (
                                        <React.Fragment key={cls}>
                                            <td>{nPass}</td>
                                            <td>{(nPass / (scores.length || 1) * 100).toFixed(2) + '%'}</td>
                                        </React.Fragment>
                                    );
                                })}
                                <td>{rowTotalPass}</td>
                                <td>{(rowTotalPass / (rowTotalStudents || 1) * 100).toFixed(2)}%</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            pass: student receives at least {passThreshold}% of the maximum score<br />
            achievement: percentage of student who passed
        </div>
    </>);
};

ctx.render(<AttainmentTable />);