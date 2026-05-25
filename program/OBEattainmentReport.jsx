const { React } = ctx.libs;
const { useState, useRef, forwardRef } = React;
const { Select } = ctx.libs.antd;

const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const programId = await ctx.getVar('ctx.popup.resource.filterByTk');

const { data: { data: semesters } } = await ctx.api.request({
    url: 'custom:get-recent-semesters'
});

let passThreshold = 50;
await ctx.api.request({
    url: 'KV:get?filterByTk=gradeSpec'
}).then(res => passThreshold = JSON.parse(resObj(res).value).find(g => g.passThreshold).min);

// Build attainment lookup: { courseName: { CLO: { PLO: percentage } } }
const buildTable = (courses) => {
    const allPLOs = new Set();
    const rows = courses.map(course => {
        const cloMap = {};
        for (const w of course.weights) {
            const clo = w.CLO_number;
            const plo = w.PLO_number;
            allPLOs.add(plo);
            cloMap[clo] ??= {};
            const passed = w.scores.filter(s => s / w.weight > passThreshold / 100).length;
            cloMap[clo][plo] = ((passed / (w.scores.length || 1)) * 100).toFixed(2) + '%';
        }
        return { name: course.name, cloMap };
    });
    return { rows, plos: [...allPLOs].sort((a, b) => a - b) };
};

// Build summary: collapse CLO axis, average attainment per PLO, compute CW = credit × attainment
const buildSummary = (courses) => {
    const allPLOs = new Set();
    const rows = courses.map(course => {
        const credit = course.theoryCredit + course.practiceCredit;
        const PLOData = {};
        const PLOs = [...new Set(course.weights.map(w => w.PLO_number))];
        allPLOs.addAll(...PLOs);
        for (const PLO of PLOs) {
            // find the relevant weight
            const weights = course.weights.filter(w => w.PLO_number == PLO);
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
    return { rows, plos: [...allPLOs].sort((a, b) => a - b) };
};

const DetailTable = ({ rows, plos }) => (
    <table border="1" cellPadding="6" cellSpacing="0" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'center' }}>
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
            {rows.map((course) => {
                const clos = Object.keys(course.cloMap).sort((a, b) => a - b);
                return clos.map((clo, i) => (
                    <tr key={`${course.name}-${clo}`}>
                        {i === 0 && <td rowSpan={clos.length}>{course.name}</td>}
                        <td>CLO{clo}</td>
                        {plos.map(p => <td key={p}>{course.cloMap[clo][p] || ''}</td>)}
                    </tr>
                ));
            })}
        </tbody>
    </table>
);

const CLOTable = ({ courses }) => {
    const rows = courses.map(course => {
        const cloData = {};
        for (const w of course.weights) {
            const clo = w.CLO_number;
            cloData[clo] ??= { totalWeight: 0, scores: null };
            cloData[clo].totalWeight += w.weight;
            if (!cloData[clo].scores) {
                cloData[clo].scores = [...w.scores];
            } else {
                cloData[clo].scores = cloData[clo].scores.map((val, i) => val + w.scores[i]);
            }
        }
        const clos = Object.keys(cloData).sort((a, b) => a - b);
        return { name: course.name, clos, cloData };
    });
    return (
        <table border="1" cellPadding="6" cellSpacing="0" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'center' }}>
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
                {rows.map(course => {
                    return course.clos.map((clo, i) => {
                        const d = course.cloData[clo];
                        const passed = d.scores.filter(s => s / d.totalWeight > passThreshold / 100).length;
                        const avg = (passed / (d.scores.length || 1)) * 100;
                        const achieved = avg > 50;
                        return (
                            <tr key={`${course.name}-${clo}`}>
                                {i === 0 && <td rowSpan={course.clos.length} style={{ textAlign: 'left', fontWeight: 'bold' }}>{course.name}</td>}
                                <td>CLO{clo}</td>
                                <td>{avg.toFixed(2)}%</td>
                                <td>{achieved ? 'Yes' : 'No'}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>
                        );
                    });
                })}
            </tbody>
        </table>
    );
};

const SummaryTable = ({ rows, plos }) => {
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
        <table border="1" cellPadding="6" cellSpacing="0" style={{ borderCollapse: 'collapse', width: '100%', textAlign: 'center' }}>
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
                {rows.map(course => (
                    <tr key={course.name}>
                        <td>{course.name}</td>
                        <td>{course.credit}</td>
                        {plos.map(p => (
                            <React.Fragment key={p}>
                                <td>{course.PLOData[p] ? course.PLOData[p].creditWeight.toFixed(2) : ''}</td>
                                <td>{course.PLOData[p] ? course.PLOData[p].attainment?.toFixed(2) + '%' : ''}</td>
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
    const [selectedSemester, setSelectedSemester] = useState(semesters[1]);
    const [courses, setCourses] = useState(data);
    const [viewMode, setViewMode] = useState('CLO+PLO');

    const fetchData = async () => {
        const { data: { data: newData } } = await ctx.api.request({
            url: 'custom:sql-query',
            method: 'post',
            data: {
                type: 'OBE-attainment',
                programId,
                semesterNum: selectedSemester.number,
                startDate: selectedSemester.startDate,
            }
        });
        setCourses(newData);
    };

    fetchData();

    const detail = buildTable(courses || []);
    const summary = buildSummary(courses || []);

    return (<div>
        <div style={{ marginBottom: 16 }}>
            semester:
            <Select
                style={{ width: 120, marginLeft: 8 }}
                options={semesters.map((semester) => ({
                    label: semester.number,
                    value: semester.id,
                }))}
                value={selectedSemester.id}
                onChange={(id) =>
                    setSelectedSemester(semesters.find(s => s.id === id))
                }
            />
            view:
            <Select
                style={{ width: 140, marginLeft: 8 }}
                options={[
                    { label: 'PLO only', value: 'PLO' },
                    { label: 'CLO and PLO', value: 'CLO+PLO' },
                    { label: 'CLO only', value: 'CLO' },
                ]}
                value={viewMode}
                onChange={setViewMode}
            />
        </div>
        {viewMode === 'PLO' && <SummaryTable rows={summary.rows} plos={summary.plos} />}
        {viewMode === 'CLO+PLO' && <DetailTable rows={detail.rows} plos={detail.plos} />}
        {viewMode === 'CLO' && <CLOTable courses={courses || []} />}
    </div>);
};

ctx.render(<App />);