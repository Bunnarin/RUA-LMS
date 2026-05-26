const { React } = ctx.libs;
const { useState, useRef } = React;
const { Select, Button } = ctx.libs.antd;

const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const programId = await ctx.getVar('ctx.popup.resource.filterByTk');

const { data: { data: semesters } } = await ctx.api.request({
    url: 'custom:get-recent-semesters'
});

// between the 0th and the 1st, find which whoever whose end is clostest to now
const semester = semesters.reduce((acc, sem) => 
    Math.abs(new Date() - new Date(acc.endDate)) < Math.abs(new Date() - new Date(sem.endDate)) ? acc : sem
, semesters[0]);

let passThreshold = 50;
await ctx.api.request({
    url: 'KV:get?filterByTk=gradeSpec'
}).then(res => passThreshold = JSON.parse(resObj(res).value).find(g => g.passThreshold).min);

const { data: { data: courses } } = await ctx.api.request({
    url: 'custom:sql-query',
    method: 'post',
    data: {
        type: 'OBE-attainment',
        programId,
        semesterNum: semester.number,
        startDate: semester.startDate,
    }
});

const plos = [...new Set(courses.flatMap(({weights}) => [...new Set(weights.map(w => w.PLO_number))]))];

// Build attainment lookup: { courseName: { CLO: { PLO: percentage } } }
const buildCLOPLOTable = () => {
    const rows = courses.map(course => {
        const cloMap = {};
        for (const w of course.weights) {
            const clo = w.CLO_number;
            const plo = w.PLO_number;
            cloMap[clo] ??= {};
            const passed = w.scores.filter(s => s / w.weight > passThreshold / 100).length;
            cloMap[clo][plo] = ((passed / (w.scores.length || 1)) * 100).toFixed(2) + '%';
        }
        return { ...course, cloMap };
    });
    return rows;
};

// Build summary: collapse CLO axis, average attainment per PLO, compute CW = credit × attainment
const buildPLOTable = () => {
    const rows = courses.map(course => {
        const credit = course.theoryCredit + course.practiceCredit;
        const PLOData = {};
        for (const PLO of plos) {
            // find the relevant weight
            const weights = course.weights.filter(w => w.PLO_number == PLO);
            if (weights.length === 0) continue;
            const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
            // combine all weight.scores into a matrix
            const scoreMatrix = weights.map(w => w.scores);
            const ploScores = scoreMatrix.reduce((acc, row) => 
                acc.map((val, i) => val + row[i])
            );
            const numOfPass = ploScores.filter(s => s / totalWeight > passThreshold / 100).length;
            PLOData[PLO] = {
                attainment: ((numOfPass / (ploScores.length || 1)) * 100),
                creditWeight: credit * totalWeight / 100
            };
        }
        return { name: course.name, credit, PLOData };
    });
    return rows;
};

const buildCLOTable = () => {
    const rows = courses.map(course => {
        const CLOs = [...new Set(course.weights.map(w => w.CLO_number))];
        const CLOData = {};
        CLOs.forEach(CLO => {
            const weights = course.weights.filter(w => w.CLO_number == CLO);
            const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
            // combine all weight.scores into a matrix
            const scoreMatrix = weights.map(w => w.scores);
            const cloScores = scoreMatrix.reduce((acc, row) => 
                acc.map((val, i) => val + row[i])
            );
            const numOfPass = cloScores.filter(s => s / totalWeight > passThreshold / 100).length;
            CLOData[CLO] = ((numOfPass / (cloScores.length || 1)) * 100)
        });
        
        return { ...course, CLOs, CLOData };
    });
    return rows;
};

const CLOPLOTable = ({ rows, plos }) =>
    <table border="1" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'center' }}>
        <thead>
            <tr>
                <th rowSpan={2}>Subject</th>
                <th rowSpan={2}>CLOs</th>
                <th colSpan={plos.length}>PLOs</th>
            </tr>
            <tr>
                {plos.map(p => <th key={p}>{p}</th>)}
            </tr>
        </thead>
        <tbody>
            {rows.map((c) => {
                const clos = Object.keys(c.cloMap).sort((a, b) => a - b);
                return clos.map((clo, i) => (
                    <tr key={`${c.name}-${clo}`}>
                        {i === 0 && <td rowSpan={clos.length}>{c.name} {c.theoryCredit + c.practiceCredit}({c.theoryCredit}-{c.practiceCredit})</td>}
                        <td>CLO{clo}</td>
                        {plos.map(p => <td key={p}>{c.cloMap[clo][p] || ''}</td>)}
                    </tr>
                ));
            })}
        </tbody>
    </table>

const CLOTable = ({ rows }) =>
    <table border="1" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'center' }}>
        <thead>
            <tr>
                <th>Subject</th>
                <th>CLOs</th>
                <th>Average CLO</th>
                <th>Achieved</th>
                <th>Need Improvement</th>
                <th>Improvement</th>
            </tr>
        </thead>
        <tbody>
            {rows.map(c => 
                c.CLOs.map((CLO, i) => 
                    <tr key={`${c.name}-${CLO}`}>
                        {i === 0 && <td rowSpan={c.CLOs.length}>{c.name} {c.theoryCredit + c.practiceCredit}({c.theoryCredit}-{c.practiceCredit})</td>}
                        <td>CLO {CLO}</td>
                        <td>{c.CLOData[CLO].toFixed(2)}%</td>
                        <td>{c.CLOData[CLO] > 50 ? 'Yes' : 'No'}</td>
                        <td>-</td>
                        <td>-</td>
                    </tr>
                )
            )}
        </tbody>
    </table>

const PLOTable = ({ rows, plos }) => {
    // for the summary footer
    // each row is a course
    const cwTotals = {};
    plos.forEach(p => {
        cwTotals[p] = rows.reduce((sum, r) => sum + (r.PLOData[p]?.creditWeight || 0), 0);
    });
    
    const avgPLOAchievements = {};
    plos.forEach(p => {
        avgPLOAchievements[p] = rows.reduce((sum, r) => 
            sum + (r.PLOData[p]?.attainment || 0) * (r.PLOData[p]?.creditWeight || 0),
        0) / cwTotals[p];
    });
    return (
        <table border="1" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'center' }}>
            <thead>
                <tr>
                    <th rowSpan={2}>Course</th>
                    <th rowSpan={2}>Credit</th>
                    {plos.map(p => <th key={p} colSpan={2}>PLO {p}</th>)}
                </tr>
                <tr>
                    {plos.map(p => (<React.Fragment key={p}>
                        <th>CW</th>
                        <th>Achieve</th>
                    </React.Fragment>))}
                </tr>
            </thead>
            <tbody>
                {rows.map(c => (
                    <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{c.credit}</td>
                        {plos.map(p => (
                            <React.Fragment key={p}>
                                <td>{c.PLOData[p] ? c.PLOData[p].creditWeight.toFixed(2) : ''}</td>
                                <td>{c.PLOData[p] ? c.PLOData[p].attainment?.toFixed(2) + '%' : ''}</td>
                            </React.Fragment>
                        ))}
                    </tr>
                ))}
                <tr>
                    <td colSpan={2}>CW Total</td>
                    {plos.map(p => (<React.Fragment key={p}>
                        <td colSpan={2}>{cwTotals[p].toFixed(2)}</td>
                    </React.Fragment>))}
                </tr>
                <tr>
                    <td colSpan={2}>Avg PLO achievement</td>
                    {plos.map(p => (<React.Fragment key={p}>
                        <td colSpan={2}>{avgPLOAchievements[p].toFixed(0)}%</td>
                    </React.Fragment>))}
                </tr>
            </tbody>
        </table>
    );
};

const App = () => {
    const [viewMode, setViewMode] = useState('CLO+PLO');
    const docRef = useRef(null);

    const CLOPLORows = buildCLOPLOTable();
    const PLORows = buildPLOTable();
    const CLORows = buildCLOTable();

    const download = (isExcel = false) => {
        const fullHTML = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office'
                  xmlns:x='urn:schemas-microsoft-com:office:${isExcel ? 'excel' : 'word'}'
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
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = isExcel ? 'export.xls' : 'export.doc';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (<>
        <div style={{ marginBottom: 16 }}>
            <Select
                options={[
                    { label: 'PLO only', value: 'PLO' },
                    { label: 'CLO + PLO', value: 'CLO+PLO' },
                    { label: 'CLO only', value: 'CLO' },
                ]}
                value={viewMode}
                onChange={setViewMode}
            />
            <Button type="primary" onClick={() => download(false)}>download word</Button>
            <Button onClick={() => download(true)}>download excel</Button>
        </div>
        <div ref={docRef}>
            {viewMode === 'PLO' && <PLOTable rows={PLORows} plos={plos} />}
            {viewMode === 'CLO+PLO' && <CLOPLOTable rows={CLOPLORows} plos={plos} />}
            {viewMode === 'CLO' && <CLOTable rows={CLORows} />}
        </div>
    </>);
};

ctx.render(<App />);