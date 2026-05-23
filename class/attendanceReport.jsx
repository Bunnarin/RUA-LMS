const classId = await ctx.getVar('ctx.popup.resource.filterByTk');

const { React } = ctx.libs;
const { useState, useMemo, useRef } = React;
const { Select, Table, DatePicker, Tag, Button } = ctx.libs.antd;
const { RangePicker } = DatePicker;

let attendances = [];

await ctx.api.request({
    url: 'attendance:list',
    params: {
        filter: {
            student: {
                classes: {
                    id: classId
                }
            },
            date: {
                $dateAfter: {
                    type: 'past',
                    number: 1,
                    unit: 'year'
                }
            }
        },
        appends: ['student', 'course'],
        pageSize: 1000000 // or else it'll default to 20
    }
}).then(res => attendances = res.data.data);

const { data: { data: semesters } } = await ctx.api.request({
    url: 'custom:get-recent-semesters'
});

const currentSemester = semesters[0];
const previousSemester = semesters[1];

const statusColorMap = {
    'P': 'green',
    'A': 'red',
    'L': 'orange',
    'E': 'blue'
};

const App = () => {
    const docRef = useRef(null);
    const [selectedSemester, setSelectedSemester] = useState(currentSemester);
    const [dateRange, setDateRange] = useState(null);

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

    // Filter attendance data based on selected semester and date range
    const filteredAttendances = useMemo(() => {
        let filtered = attendances.filter(a => a.course?.semesterNum === selectedSemester.number);

        if (dateRange && (dateRange[0] || dateRange[1]))
            filtered = filtered.filter(a => {
                const attendanceDate = new Date(a.date);

                if (dateRange[0] && dateRange[1])
                    // Both start and end date provided
                    return attendanceDate >= dateRange[0].startOf('day') && attendanceDate <= dateRange[1].endOf('day');

                return true;
            });

        return filtered;
    }, [attendances, selectedSemester, dateRange]);

    // Process attendance data for table display
    const { tableData, columns } = useMemo(() => {
        // Group attendance by student and date
        const studentDateMap = {};
        const allDates = new Set();
        const allStudents = new Map();

        filteredAttendances.forEach(attendance => {
            const studentId = attendance.student?.id;
            const date = attendance.date;

            if (!studentId || !date) return;

            allDates.add(date);
            allStudents.set(studentId, attendance.student);

            studentDateMap[studentId] ??= {};

            studentDateMap[studentId][date] ??= [];

            studentDateMap[studentId][date].push(attendance.status);
        });

        const sortedDates = Array.from(allDates).sort();
        const sortedStudents = Array.from(allStudents.entries()).sort((a, b) =>
            (a[1].khmerName).localeCompare(b[1].khmerName)
        );

        // Generate table data
        const tableData = sortedStudents.map(([studentId, student]) => {
            const row = {
                key: studentId,
                student: student.khmerName,
                studentId: studentId,
            };

            // Calculate student summary statistics
            const studentSummary = { P: 0, A: 0, L: 0, E: 0 };

            sortedDates.forEach(date => {
                const statuses = studentDateMap[studentId]?.[date] || [];

                if (statuses.length === 0) {
                    row[date] = { status: null, count: 0, details: null };
                } else if (statuses.length === 1) {
                    row[date] = { status: statuses[0], count: 1, details: null };
                    studentSummary[statuses[0]] = (studentSummary[statuses[0]] || 0) + 1;
                } else {
                    // Impure attendance - multiple statuses
                    const statusCounts = {};
                    statuses.forEach(status => {
                        statusCounts[status] = (statusCounts[status] || 0) + 1;
                    });

                    const dominantStatus = Object.entries(statusCounts)
                        .sort((a, b) => b[1] - a[1])[0][0];

                    // Count impure attendance as 1 for the dominant status only
                    studentSummary[dominantStatus] = (studentSummary[dominantStatus] || 0) + 1;

                    row[date] = {
                        status: dominantStatus,
                        count: statuses.length,
                        details: statusCounts
                    };
                }
            });

            // Add summary columns
            row.totalP = studentSummary.P;
            row.totalA = studentSummary.A;
            row.totalL = studentSummary.L;
            row.totalE = studentSummary.E;

            return row;
        });

        // Generate columns
        const columns = [
            {
                title: 'ID',
                dataIndex: 'studentId',
                key: 'studentId',
                width: 100,
            },
            {
                title: 'Name',
                dataIndex: 'student',
                key: 'student',
                fixed: 'left',
                width: 150,
            },
            {
                title: 'P',
                dataIndex: 'totalP',
                key: 'totalP',
                width: 80,
            },
            {
                title: 'A',
                dataIndex: 'totalA',
                key: 'totalA',
                width: 80,
            },
            {
                title: 'L',
                dataIndex: 'totalL',
                key: 'totalL',
                width: 80,
            },
            {
                title: 'E',
                dataIndex: 'totalE',
                key: 'totalE',
                width: 80,
            }
        ];

        sortedDates.forEach(date => {
            columns.push({
                title: new Date(date).toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit'
                }),
                dataIndex: date,
                key: date,
                render: (cellData) => {
                    if (!cellData || cellData.count === 0) return '-';

                    if (cellData.count === 1) {
                        return (
                            <Tag color={statusColorMap[cellData.status]}>
                                {cellData.status}
                            </Tag>
                        );
                    } else {
                        // Impure attendance
                        const nonAbsentCount = Object.entries(cellData.details)
                            .filter(([status]) => status !== 'A')
                            .reduce((sum, [, count]) => sum + count, 0);

                        return (
                            <Tag color={statusColorMap[cellData.status]}>
                                {nonAbsentCount != cellData.count && nonAbsentCount > 0 ? `${nonAbsentCount}/${cellData.count} ` : ''}{cellData.status}
                            </Tag>
                        );
                    }
                }
            });
        });

        return { tableData, columns };
    }, [filteredAttendances]);

    return (<>
        {/* Filters */}
        <Select
            style={{ width: 150 }}
            value={selectedSemester.number}
            onChange={(value) => setSelectedSemester(semesters.find(s => s.number === value))}
        >
            <Select.Option value={currentSemester.number}>Semester {currentSemester.number}</Select.Option>
            {previousSemester && previousSemester.number !== currentSemester.number && (
                <Select.Option value={previousSemester.number}>Semester {previousSemester.number}</Select.Option>
            )}
        </Select>
        <RangePicker
            placeholder={['Start Date', 'End Date']}
            onChange={setDateRange}
        />
        <Button type="primary" onClick={() => download(false)}>download word</Button>
        <Button onClick={() => download(true)}>download excel</Button>
        <br /><br />

        {/* Attendance Table */}
        <div ref={docRef}>
            <p>P: វត្តមាន, A: អវត្តមាន, L: យឺត, E: ដាក់ច្បាប់</p>
            <Table
                columns={columns}
                dataSource={tableData}
                pagination={false}
            />
        </div>
    </>);
};

ctx.render(<App />);