const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { React } = ctx.libs;
const { useState, useRef, forwardRef } = React;
const { Button, Switch } = ctx.libs.antd;

const programId = await ctx.getVar('ctx.popup.resource.filterByTk');

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

const { data: { data: program } } = await ctx.api.request({
    url: 'program:get',
    params: {
        appends: ['faculty'],
        filterByTk: programId
    }
});

const { data: { data: classes } } = await ctx.api.request({
    url: 'class:list',
    params: {
        filter: {
            programId
        },
        appends: ['schedules','schedules.course','schedules.course.weights','students','students.scores','students.scores.weight']
    }
});

const students = classes.flatMap(cls => cls.students);
// stringify cuz set cannot compare objects
const specialCourseIds = [123, 109, 99];
let courses = classes.flatMap(cls => cls.schedules).map(schedule => JSON.stringify(schedule.course));
courses = [...new Set(courses)].map(course => JSON.parse(course))
    .sort((a, b) => specialCourseIds.indexOf(a.id) - specialCourseIds.indexOf(b.id));

let englishCourseSpec;
const hasEngish = courses.find(c => c.englishName.toLowerCase() == 'english');
if (hasEngish)
    await ctx.api.request({
        url: 'KV:get',
        params: {
            filterByTk: 'englishCourseSpec'
        }
    }).then(res => englishCourseSpec = JSON.parse(resObj(res).value));

const getCourseInfo = (scores, courseId, noWeights = false) => {
    // some course have no weight
    const courseScores = scores.filter(score => noWeights ? score.courseId == courseId : score.weight?.courseId == courseId);
    let total = courseScores.reduce((acc, score) => acc + score.value, 0);
    const hasMakeup = courseScores.some(score => score.makeup);

    let displayValue = scoreToGPA(total).toFixed(2);
    // different pass logic for LC
    if (courseId == 123) {
        total = 0;
        englishCourseSpec.weights.forEach(({ id, weight }) => {
            const entry = courseScores.find(s => s.weightId == id);
            total += entry?.value * weight / 100;
        });
        total = Math.round(total);
        const passThreshold = englishCourseSpec.semesterPassThresholds[semester.number - 1];
        displayValue = total >= passThreshold ? 'sastified' : 'unsastified';
    } else if (courseId == 109 || courseId == 99)
        displayValue = total >= 50 ? 'sastified' : 'unsastified';
    // displayValue can be either GPA or either sastified/unsastified
    return { total, displayValue, hasMakeup };
}

const totalCredit = courses.reduce((acc, course) => {
    if (specialCourseIds.includes(course.id)) return acc;
    const credit = course.theoryCredit + course.practiceCredit;
    return acc + credit;
}, 0);

let gradeSpec;
await ctx.api.request({
    url: 'KV:get',
    params: {
        filterByTk: 'gradeSpec'
    }
}).then(res => gradeSpec = JSON.parse(resObj(res).value));

const GPAtoGrade = (GPA) => gradeSpec.find(g => Math.round(GPA * 2) / 2 >= g.GPA)?.grade;

const scoreToGPA = (score) => gradeSpec.find(g => score >= g.min).GPA;

// 3b. Pre-compute avgScore & rank for each student
const studentStats = students.map(student => {
    let includeMakeup = false;
    const weightedTotalGPA = courses.reduce((acc, course) => {
        // displayValue is already GPA
        const { displayValue, hasMakeup } = getCourseInfo(student.scores, course.id, course.weights.length == 0);
        if (hasMakeup) includeMakeup = true;
        if (isNaN(displayValue)) return acc;
        const credit = course.theoryCredit + course.practiceCredit;
        return acc + displayValue * credit;
    }, 0).toFixed(2);
    return { studentId: student.id, weightedTotalGPA, includeMakeup };
});

// Rank by avgScore descending – students with the same avgScore share the same rank
const sorted = [...studentStats].sort((a, b) => b.weightedTotalGPA - a.weightedTotalGPA);
const rankMap = {};
let currentRank = 1;
sorted.forEach((s, i) => {
    if (i > 0 && s.weightedTotalGPA !== sorted[i - 1].weightedTotalGPA) currentRank = i + 1;
    rankMap[s.studentId] = currentRank;
});

const DocTemplate = forwardRef(({ showGPA }, ref) => (<div ref={ref}>
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
                <br />សាកលវិទ្យាល័យភូមិន្ទកសិកម្ម<br />{program.faculty.khmerName}
            </td>
            <td></td>
            <td>
                ព្រះរាជាណាចក្រកម្ពុជា<br />ជាតិ សាសនា ព្រះមហាក្សត្រ
            </td>
        </tr>
    </table>
    <p style={{ textAlign: 'center' }}>
        លទ្ធផលប្រឡងឆមាសទី {semester.number} ឆ្នាំសិក្សា {semester.academicYear}-{semester.academicYear + 1}
    </p>
    <table>
        <thead>
            <tr>
                <th rowSpan={4}>ល.រ.</th>
                <th rowSpan={4}>ID</th>
                <th rowSpan={4}>ឈ្មោះ</th>
                <th rowSpan={4}>ភេទ</th>
                <th rowSpan={4}>ថ្ងៃខែឆ្នាំកំណើត</th>
                <th colSpan={courses.length}>មុខវិជ្ជានិងចំនួនក្រេឌីត</th>
                <th rowSpan={2}>ពិន្ទុសរុប</th>
                <th rowSpan={2}>GPA</th>
                <th rowSpan={2}>អក្សរ</th>
                {programId != 1 && <th rowSpan={2}>ចំណាត់ថ្នាក់</th>}
            </tr>
            <tr>
                {courses.map(course => (<th key={course.id}>
                    {course.khmerName}
                </th>))}
            </tr>
            <tr>
                {courses.map(course => (<th key={course.id}>
                    {course.name}
                </th>))}
                <th>Total Score</th>
                <th rowSpan={2}>Grade Point Average</th>
                <th rowSpan={2}>Mention</th>
                {programId != 1 && <th rowSpan={2}>Rank</th>}
            </tr>
            <tr>
                {courses.map(c => (<th key={c.id}>
                    {c.practiceCredit + c.theoryCredit} ({c.theoryCredit}-{c.practiceCredit})
                </th>))}
                {/* we don't use the totalCredit var here cuz it exclude the special course */}
                <th>{courses.reduce((acc, c) => acc + c.practiceCredit + c.theoryCredit, 0)}</th>
            </tr>
        </thead>
        <tbody>
            {students.map((student, idx) => {
                const stats = studentStats.find(s => s.studentId === student.id);
                return (
                    <tr key={student.id}>
                        <td>{idx + 1}</td>
                        <td>{student.id}</td>
                        <td>{student.khmerName}</td>
                        <td>{student.sex}</td>
                        <td>{student.birthday}</td>
                        {courses.map(course => {
                            const { total, displayValue, hasMakeup } = getCourseInfo(student.scores, course.id, course.weights.length == 0);
                            if (isNaN(displayValue)) return <td key={course.id}>{displayValue}{hasMakeup ? '*' : ''}</td>;
                            return <td key={course.id} style={{ backgroundColor: displayValue >= 2 ? 'white' : '#ccc' }}>{showGPA ? displayValue : total}{hasMakeup ? '*' : ''}</td>;
                        })}
                        <td>{stats.weightedTotalGPA}{stats.includeMakeup ? '*' : ''}</td>
                        <td>{(stats.weightedTotalGPA / totalCredit).toFixed(2)}</td>
                        <td>{GPAtoGrade(stats.weightedTotalGPA / totalCredit)}</td>
                        {programId != 1 && <td>{rankMap[student.id]}</td>}
                    </tr>
                );
            })}
        </tbody>
    </table>
    <table className="invisible-table">
        <tr>
            <td>
                សំគាល់៖ ពិន្ទុដែលទទួលបានក្រោម {gradeSpec.find(g => g.passThreshold).GPA.toFixed(2)} ឬ Unsatisfied ជាពិន្ទុប្រឡងធ្លាក់ដែលត្រូវប្រឡងសង។
                <br /><br />
                បានឃើញ និងឯកភាព
                <br />
                ប្រធានគណៈកម្មការប្រឡង
            </td>
            <td>
                ថ្ងៃ..............ខែ...............ឆ្នាំម្សាញ់ សប្តស័ក ព.ស ២៥៦៩
                <br />
                រាជធានីភ្នំពេញ, ថ្ងៃទី......ខែ........ឆ្នាំ ២០....
                <br />
                ព្រឹទ្ធបុរស
            </td>
        </tr>
    </table>
</div>))

const App = () => {
    const docRef = useRef(null);
    const [showGPA, setShowGPA] = useState(true);

    const download = (isExcel = false) => {
        const fullHTML = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office'
                  xmlns:w='urn:schemas-microsoft-com:office:${isExcel ? 'excel' : 'word'}'
                  xmlns='https://www.w3.org/TR/html40'>
                <head>
                    <meta charset='utf-8'>
                    <style>
                        @page Section1 {
                            size: 841.9pt 595.3pt;
                            mso-page-orientation: landscape;
                            margin: 1in 1in 1in 1in;
                        }
                        div.Section1 { page: Section1; }
                    </style>
                </head>
                <body>
                    <div class="Section1">
                        ${docRef.current.innerHTML}
                    </div>
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
        <span>
            show GPA?
            <Switch checked={showGPA} onChange={setShowGPA} />
        </span>
        <Button type="primary" onClick={() => download(false)}>download word</Button>
        <Button onClick={() => download(true)}>download excel</Button>
        <DocTemplate ref={docRef} showGPA={showGPA} />
    </>);
};

ctx.render(<App />);