const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { React } = ctx.libs;
const { useRef, forwardRef } = React;
const { Button } = ctx.libs.antd;

const passThreshold = 50;

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

let gradeSpec;

await ctx.api.request({
    url: 'KV:get',
    params: {
        filterByTk: 'gradeSpec'
    }
}).then(res => gradeSpec = JSON.parse(resObj(res).value));

const scoreToGrade = (score) => gradeSpec.find(g => score >= g.min)?.grade;

const { data: { data: schedule } } = await ctx.api.request({
    url: 'schedule:get',
    params: {
        filterByTk: ctx.value,
        appends: ['class','class.program','class.program.faculty','class.students','class.students.scores','course','course.weights','course.weights.CLO','course.weights.PLO']
    }
});

const students = schedule.class.students.sort((a, b) => a.khmerName.localeCompare(b.khmerName, 'km'));
const { weights, theoryCredit, practiceCredit } = schedule.course;
const { program } = schedule.class;
const credit = theoryCredit + practiceCredit;

// 2. Logic: Group weights by PLO
const plosMap = {};
weights.forEach(w => {
    plosMap[w.PLO.id] ??= {
        ...w.PLO,
        closMap: {}
    };

    const ploEntry = plosMap[w.PLO.id];
    ploEntry.closMap[w.CLO.id] ??= {
        ...w.CLO,
        totalWeight: 0,
        weightIds: []
    }

    ploEntry.closMap[w.CLO.id].totalWeight += (w.weight || 0);
    ploEntry.closMap[w.CLO.id].weightIds.push(w.id);
});

const PLOs = Object.values(plosMap).sort((a, b) => a.number - b.number);

// 4. Sub-components

const PLOTable = ({ plo }) => {
    const ploCLOs = Object.values(plo.closMap).sort((a, b) => a.number - b.number);
    const ploMaxWeight = ploCLOs.reduce((acc, c) => acc + c.totalWeight, 0);

    const studentResults = students.map(student => {
        let ploTotalScore = 0;
        const cloScores = ploCLOs.map(clo => {
            let cloScore = 0;
            let hasMakeup = false;
            clo.weightIds.forEach(wid => {
                const scoreRecord = student.scores.find(s => s.weightId === wid);
                cloScore += scoreRecord?.value || 0;
                if (scoreRecord?.makeup) hasMakeup = true;
            });
            ploTotalScore += cloScore;
            return { value: cloScore, hasMakeup };
        });

        const ploHasMakeup = cloScores.some(c => c.hasMakeup);

        // Deal breaker criteria: if any assessment (across all PLOs) has a total score of 0
        let hasAnyZeroAssessment = false;
        const assessmentTotals = {};
        weights.forEach(w => {
            const scoreRecord = student.scores.find(s => s.weightId === w.id);
            assessmentTotals[w.assessmentId] = (assessmentTotals[w.assessmentId] || 0) + scoreRecord?.value || 0;
        });

        // Check only assessments with positive weight
        Object.keys(assessmentTotals).forEach(aId => {
            const totalWeight = weights.filter(w => w.assessmentId == aId).reduce((s, w) => s + (w.weight || 0), 0);
            hasAnyZeroAssessment = totalWeight > 0 && assessmentTotals[aId] === 0;
        });

        const percentage = ploMaxWeight > 0 ? (ploTotalScore / ploMaxWeight) * 100 : 0;
        const isPass = !hasAnyZeroAssessment && percentage >= passThreshold;
        return { student, cloScores, ploTotalScore, percentage, isPass, hasAnyZeroAssessment, hasMakeup: ploHasMakeup };
    });

    const passCount = studentResults.filter(r => r.isPass).length;
    const failCount = studentResults.length - passCount;
    const passPercentage = ((passCount / studentResults.length) * 100).toFixed(0);
    const failPercentage = ((failCount / studentResults.length) * 100).toFixed(0);

    return (<div className="plo-page">
        <h3>{`PLO ${plo.number}: ${plo.statement}`}</h3>
        <table>
            <thead>
                <tr>
                    <th rowSpan={2}>ល.រ.</th>
                    <th rowSpan={2}>ID</th>
                    <th rowSpan={2}>Name</th>
                    {ploCLOs.map(clo => (
                        <th key={clo.id}>CLO {clo.number}</th>
                    ))}
                    <th colSpan={3}>PLO {plo.number} score</th>
                </tr>
                <tr>
                    {ploCLOs.map(clo => (
                        <th key={clo.id}>{clo.totalWeight}%</th>
                    ))}
                    <th>max {ploMaxWeight}</th>
                    <th>100%</th>
                    <th>grade</th>
                </tr>
                <tr>
                    <td colSpan={3}>CW = weight x credit ({credit})</td>
                    {ploCLOs.map(clo => (
                        <td key={clo.id}>
                            {(clo.totalWeight * credit / 100).toFixed(2)}
                        </td>
                    ))}
                    <td colSpan={3}>
                        {(ploMaxWeight * credit / 100).toFixed(2)}
                    </td>
                </tr>
            </thead>
            <tbody>
                {studentResults.map((res, idx) => (
                    <tr key={res.student.id}>
                        <td>{idx + 1}</td>
                        <td>{res.student.id}</td>
                        <td>{res.student.khmerName}</td>
                        {res.cloScores.map((score, i) => (
                            <td key={i}>{score.value}{score.hasMakeup ? '*' : ''}</td>
                        ))}
                        <td>{res.ploTotalScore}{res.hasMakeup ? '*' : ''}</td>
                        <td>
                            {res.percentage.toFixed(0)}%{res.hasMakeup ? '*' : ''}
                        </td>
                        <td>
                            {(() => {
                                if (res.hasAnyZeroAssessment) return 'F';
                                return scoreToGrade(res.percentage) + (res.hasMakeup ? '*' : '');
                            })()}
                        </td>
                    </tr>
                ))}
            </tbody>
            <tfoot>
                <tr>
                    <td colSpan={2 + ploCLOs.map(c => 1).length} rowSpan={2}></td>
                    <td>fail</td>
                    <td>{failCount} ({failPercentage}%)</td>
                    <td>Avg. PLO achieved</td>
                </tr>
                <tr>
                    <td>pass (≥{passThreshold}%)</td>
                    <td>{passCount} ({passPercentage}%)</td>
                    <td>{passPercentage >= 50 ? 'yes' : 'no'}</td>
                </tr>
            </tfoot>
        </table>
    </div>);
};

// 5. DocTemplate Component
const DocTemplate = forwardRef((props, ref) => (<div ref={ref}>
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
    <table className="invisible-table">
        <tr>
            <td>
                <br /><br />សាកលវិទ្យាល័យភូមិន្ទកសិកម្ម<br />{program.faculty.khmerName}
            </td>
            <td></td>
            <td>
                ព្រះរាជាណាចក្រកម្ពុជា<br />ជាតិ សាសនា ព្រះមហាក្សត្រ
            </td>
        </tr>
    </table>
    <p style={{ textAlign: 'center' }}>
        បញ្ជីរាយនាមនិស្សិត {program.khmerName}
        <br />
        ឆ្នាំទី{schedule.course.year} ជំនាន់ទី{semester.academicYear - program.startYear + 1 - schedule.class.year} ឆ្នាំសិក្សា {semester.academicYear}-{semester.academicYear + 1}
        <br />
        {schedule.course.khmerName} ថ្នាក់ {schedule.class.name}
    </p>
    {PLOs.map(plo => <PLOTable key={plo.id} plo={plo} />)}
    <table className="invisible-table">
        <tr>
            <td>
                សំគាល់៖ ពិន្ទុដែលទទួលបានក្រោម {gradeSpec.find(g => g.passThreshold).GPA.toFixed(2)} ជាពិន្ទុប្រឡងធ្លាក់ដែលត្រូវប្រឡងសង។
                <br /><br />
                បានឃើញ និងឯកភាព
                <br />
                ប្រធានគណៈកម្មការប្រឡង
            </td>
            <td>
                ថ្ងៃ ខែ ឆ្នាំម្សាញ់ សប្តស័ក ព.ស ២៥៦៩
                <br />
                រាជធានីភ្នំពេញ, ថ្ងៃទី ខែ ឆ្នាំ ២០២៦
                <br />
                ព្រឺទ្ធបុរស
            </td>
        </tr>
    </table>
</div>));

// 6. Main App
const App = () => {
    const docRef = useRef(null);

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
        <Button type="primary" onClick={() => download(false)}>download word</Button>
        <Button onClick={() => download(true)}>download excel</Button>
        <DocTemplate ref={docRef} />
    </>);
};

ctx.render(<App />);