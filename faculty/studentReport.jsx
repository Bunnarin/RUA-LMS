const { React } = ctx.libs;
const { useState, useRef, forwardRef } = React;
const { Button, Select } = ctx.libs.antd;

const facultyId = await ctx.getVar('ctx.popup.resource.filterByTk');
const { data: { data: faculty } } = await ctx.api.request({
    url: 'faculty:get',
    params: {
        filterByTk: facultyId,
        appends: 'programs'
    }
});

// we need to show other delegated program as well
const delegatedGSProgramIds = [22, 26, 28, 29, 35, 38, 39];
if (faculty.abbreviation == 'GS')
    await ctx.api.request({
        url: 'program:list',
        params: {
            $or: [
                { degree: 'MSc' },
                { degree: 'PhD' }
            ]
        }
    }).then(res => {
        const delgatedPrograms = res.data.data.filter(p => delegatedGSProgramIds.includes(p.id));
        faculty.programs = [...faculty.programs, ...delgatedPrograms];
        console.log(faculty.programs);
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

// $or neither enrollments's association nor enrollments's attribute
// why also filter by class? cuz foundation year
let filter = {
    $and: [
        { enrollments: { graduationDate: { $empty: true }, dropoutDate: { $empty: true } } },
    ]
};

if (facultyId == 1)
    filter.$and.push({ classes: { programId: 1 } });
else if (faculty.abbreviation == 'GS')
    filter.$and.push({
        $or: [
            // cuz we store MSc and PhD as 2, 3
            { enrollments: { program: { degree: '2' } } },
            { enrollments: { program: { degree: '3' } } }
        ]
    });
else
    filter.$and.push({ enrollments: { program: { facultyId } } });

const { data: { data: students } } = await ctx.api.request({
    url: 'student:list',
    params: {
        pageSize: 10000,
        sort: 'khmerName',
        filter,
        appends: 'background,background.province,scholarshipSource,classes,user,enrollments,enrollments.program,enrollments.program.faculty'
    }
});

function buildGroups(filtered, groupBy) {
    const groups = {};
    filtered.forEach(student => {
        if (groupBy === 'faculty')
            student.enrollments.forEach(e => {
                const fac = e.program.faculty;
                const key = fac?.id || 'unknown';
                groups[key] ??= { key, label: `មហាវិទ្យាល័យ ${fac?.khmerName}`, students: [] };
                groups[key].students.push(student);
            });
        else if (groupBy === 'program')
            student.enrollments.forEach(e => {
                if (faculty.abbreviation != 'GS' && e.program.facultyId != facultyId) return;
                if (faculty.abbreviation == 'GS' && !delegatedGSProgramIds.includes(e.program.id)) return;
                const key = e.programId || 'unknown';
                groups[key] ??= { key, label: e.program.khmerName, students: [] };
                groups[key].students.push(student);
            });
        else if (groupBy === 'generation') {
            student.enrollments.forEach(e => {
                if (e.program.facultyId != facultyId) return;
                const key = e.generation || 'unknown';
                groups[key] ??= { key, label: `ជំនាន់ទី ${key}`, students: [] };
                groups[key].students.push(student);
            });
        } else if (groupBy === 'year') {
            student.enrollments.forEach(e => {
                if (e.program.facultyId != facultyId) return;
                const key = e.year || 'unknown';
                groups[key] ??= { key, label: `ឆ្នាំទី ${key}`, students: [] };
                groups[key].students.push(student);
            });
        } else if (!groupBy) {
            const key = 'all';
            groups[key] ??= { key, label: 'all', students: [] };
            groups[key].students.push(student);
        }
    });
    return Object.values(groups);
}

// for some reason the react style block have some power over the doc download, except the font
const DocTemplate = forwardRef(({ selectedProgramId, selectedYear, selectedGeneration, groupBy }, ref) => {
    const selectedProgram = faculty.programs?.find(p => p.id === selectedProgramId);
    const filtered = students.filter(s =>
        (!selectedYear || s.enrollments.some(e => e.year == selectedYear)) &&
        (!selectedGeneration || s.enrollments.some(e => e.generation == selectedGeneration)) &&
        (!selectedProgramId || s.enrollments.some(e => e.programId === selectedProgramId))
    );
    const sortedGroups = buildGroups(filtered, groupBy);
    const colCount = 11 + (!selectedProgramId ? 1 : 0) + (!selectedYear ? 1 : 0) + (!selectedGeneration ? 1 : 0);
    let globalIndex = 0;
    return (<div ref={ref}>
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
                    <br />សាកលវិទ្យាល័យភូមិន្ទកសិកម្ម<br />{faculty.khmerName}
                </td>
                <td></td>
                <td>
                    ព្រះរាជាណាចក្រកម្ពុជា<br />ជាតិ សាសនា ព្រះមហាក្សត្រ
                </td>
            </tr>
        </table>
        <p style={{ textAlign: 'center' }}>
            បញ្ជីរាយនាមនិស្សិត {selectedProgram?.khmerName}
            <br />
            {selectedYear ? `ឆ្នាំទី ${selectedYear}` : ''}
            {/* if we have field we use it, if not we calculate (will be depracte in the future since we planning to use workflow to populate field) */}
            {selectedGeneration ? `ជំនាន់ទី ${selectedGeneration}` :
                selectedYear && selectedProgram ? `ជំនាន់ទី ${semester.startYear - selectedProgram.startYear + 1 - selectedYear}` : ''}
            ឆ្នាំសិក្សា {semester.startYear} - {semester.startYear + 1} ឆមាសទី {semester.number}
        </p>
        <table>
            <thead>
                <tr>
                    <th>No.</th>
                    <th>ID</th>
                    <th>ឈ្មោះ</th>
                    <th>ឈ្មោះឡាតាំង</th>
                    <th>ភេទ</th>
                    <th>ថ្ងៃខែឆ្នាំកំណើត</th>
                    <th>មកពី</th>
                    {!selectedProgramId && groupBy != 'program' && groupBy == 'faculty' && <th>ជំនាញ</th>}
                    {!selectedYear && groupBy != 'year' && <th>ឆ្នាំ</th>}
                    {!selectedGeneration && groupBy != 'generation' && <th>ជំនាន់</th>}
                    <th>ថ្នាក់</th>
                    <th>អាហារូបករណ៍</th>
                    <th>លេខទូរស័ព្ទ</th>
                </tr>
            </thead>
            <tbody>
                {sortedGroups.map(group => (
                    <React.Fragment key={group.key}>
                        {groupBy &&
                            <tr>
                                <td colSpan={colCount} style={{ textAlign: 'left', backgroundColor: '#e2e2e2' }}>
                                    {group.label}
                                </td>
                            </tr>
                        }
                        {group.students.map(s => {
                            globalIndex++;
                            return (
                                <tr key={`${group.key}-${s.id}`}>
                                    <td>{globalIndex}</td>
                                    <td>{s.id}</td>
                                    <td>{s.khmerName}</td>
                                    <td>{s.englishName}</td>
                                    <td>{s.sex}</td>
                                    <td>{s.birthday}</td>
                                    <td>{s.background?.province?.name}</td>
                                    {!selectedProgramId && groupBy != 'program' && groupBy != 'faculty' && <td>{s.enrollments.find(e => e.program.facultyId == facultyId)?.program?.khmerName}</td>}
                                    {groupBy == 'faculty' && <td>{s.enrollments.filter(e => e.program.facultyId == group.key)?.map(e => e.program.khmerName)?.join(', ')}</td>}
                                    {!selectedYear && groupBy != 'year' && groupBy != 'faculty' && <td>{s.enrollments.find(e => e.program.facultyId == facultyId)?.year}</td>}
                                    {!selectedYear && groupBy == 'faculty' && <td>{s.enrollments.find(e => e.program.facultyId == group.key)?.year}</td>}
                                    {!selectedGeneration && groupBy != 'generation' && <td>{s.enrollments.find(e => e.program.facultyId == facultyId)?.generation}</td>}
                                    <td>{s.classes.filter(cls => cls.programId == selectedProgramId || !selectedProgramId).map(c => c.name).join(', ')}</td>
                                    <td>
                                        {s.scholarshipSource ? s.scholarshipSource.name + s.scholarshipCoverage : 'បង់ថ្លៃ'}
                                    </td>
                                    <td>{s.user.phone}</td>
                                </tr>
                            );
                        })}
                        {groupBy &&
                            <tr>
                                <td colSpan={colCount} style={{ textAlign: 'left' }}>
                                    សរុប៖ {group.students.length} នាក់ (ស្រី៖ {group.students.filter(s => s.sex == 'F').length} នាក់)
                                </td>
                            </tr>
                        }
                    </React.Fragment>
                ))}
            </tbody>
        </table>
        <table className="invisible-table">
            <tr>
                <td>
                    {facultyId == 1 && <>
                        ចំនួននិស្សិតសរុប(រាប់ជំនាញ២)៖ {filtered.reduce((acc, s) => acc + (s.enrollments.length || 0), 0)}នាក់ (ស្រី៖ {filtered.filter(s => s.sex == 'F').reduce((acc, s) => acc + (s.enrollments?.length || 0), 0)}នាក់)
                        <br />
                    </>}
                    ចំនួននិស្សិតសរុប៖ {filtered.length}នាក់ (ស្រី៖ {filtered.filter(s => s.sex == 'F').length}នាក់)
                    <br /><br />
                    បានឃើញ និងឯកភាព
                    <br />
                    សាកលវិទ្យាធិការ
                </td>
                <td>
                    បានពិនិត្យត្រឹមត្រូវ
                    <br />
                    នាយកមជ្ឈមណ្ឌលសិក្សានិងសេវានិស្សិត
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
    </div >);
});

const App = () => {
    const docRef = useRef(null);
    const [selectedProgramId, setSelectedProgramId] = useState(null);
    const [selectedYear, setSelectedYear] = useState(null);
    const [selectedGeneration, setSelectedGeneration] = useState(null);
    const [groupBy, setGroupBy] = useState(facultyId == 1 ? 'faculty' : 'program');

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

    const generations = [...new Set(students.flatMap(s => s.enrollments?.map(e => e.generation)).filter(g => g != null))].sort((a, b) => a - b);
    const years = [...new Set(students.flatMap(s => s.enrollments?.map(e => e.year)).filter(y => y != null))].sort();
    return (<>
        program:
        <Select
            value={selectedProgramId}
            onChange={setSelectedProgramId}
            options={[
                { value: null, label: 'All' },
                ...faculty.programs.map(p => ({ value: p.id, label: p.khmerName }))
            ]}
            style={{ marginRight: '10px', marginBottom: '10px' }}
        />
        year:
        <Select
            value={selectedYear}
            onChange={setSelectedYear}
            options={[
                { value: null, label: 'All' },
                ...years.map(y => ({ value: y, label: String(y) }))
            ]}
        />
        generation:
        <Select
            value={selectedGeneration}
            onChange={setSelectedGeneration}
            options={[
                { value: null, label: 'All' },
                ...generations.map(g => ({ value: g, label: String(g) }))
            ]}
        />
        {facultyId == 1 ? null : (<>
            group by:
            <Select
                value={groupBy}
                onChange={setGroupBy}
                options={[
                    { value: null, label: 'None' },
                    ...(!selectedYear ? [{ value: 'year', label: 'ឆ្នាំ' }] : []),
                    ...(!selectedProgramId ? [{ value: 'program', label: 'ជំនាញ' }] : []),
                    ...(!selectedGeneration ? [{ value: 'generation', label: 'ជំនាន់' }] : []),
                ]}
            />
        </>)}
        <Button type="primary" onClick={() => download(false)}>download word</Button>
        <Button onClick={() => download(true)}>download excel</Button>
        <DocTemplate selectedProgramId={selectedProgramId} selectedYear={selectedYear} selectedGeneration={selectedGeneration} groupBy={groupBy} ref={docRef} />
    </>);
};

ctx.render(<App />);