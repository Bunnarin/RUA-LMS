const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { Button } = ctx.libs.antd;
const React = ctx.libs.React;
const { useState } = React;

const { data: { data: schedule } } = await ctx.api.request({
    url: 'schedule:get',
    params: {
        filterByTk: ctx.value,
        appends: 'class.students'
    }
});

const today = new Date().toISOString().split('T')[0];
let { data: { data: attendances } } = await ctx.api.request({
    url: 'attendance:list',
    params: {
        pageSize: 100, // or else it'll default to 20
        filter: {
            $and: [
                {
                    date: today,
                    student: {
                        classes: {
                            id: schedule.classId
                        }
                    }
                },
                {
                    // bcuz the student might have a whole day excuse
                    $or: [
                        {
                            courseId: schedule.courseId,
                            status: 'E'
                        }
                    ]
                }
            ]
        }
    }
});

const { students } = schedule.class;

const App = () => {
    // Initialize state
    // Key: studentId, Value: { status: 'A'|'P'|'L', isLocked: boolean, id?: number }
    const [attendanceStates, setAttendanceStates] = useState(() => {
        const map = {};
        students.forEach(s => {
            const att = attendances.find(a => a.studentId === s.id);
            if (att)
                // Lock if Present, Late or Excused. Keep Unlocked if Absent so it can be updated.
                map[s.id] = {
                    status: att.status,
                    isLocked: att.status !== 'A',
                    id: att.id,
                    comment: att.comment || ''
                };
            else
                // No record = Absent and Unlocked
                map[s.id] = { status: 'A', isLocked: false, id: null, comment: '' };
        });
        return map;
    });

    const getNextStatus = {
        A: 'L',
        L: 'P',
        P: 'E',
        E: 'A'
    };

    const getStatusConfig = {
        A: { label: 'A', color: '#ef4444' },
        L: { label: 'L', color: '#f59e0b' },
        P: { label: 'P', color: '#10b981' },
        E: { label: 'E', color: '#3b82f6' }
    }

    const handleToggle = (studentId) =>
        setAttendanceStates(prev => {
            const current = prev[studentId];
            if (current.isLocked) return prev; // Cannot change locked records

            return {
                ...prev,
                [studentId]: {
                    ...current,
                    status: getNextStatus[current.status],
                }
            };
        });

    const handleCommentChange = (studentId, value) =>
        setAttendanceStates(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], comment: value }
        }));

    const markAll = (status) =>
        setAttendanceStates(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(studentId => {
                // Only update unlocked records
                if (!next[studentId].isLocked)
                    next[studentId] = {
                        ...next[studentId],
                        status,
                        comment: status === 'E' ? next[studentId].comment : ''
                    };
            });
            return next;
        });

    const onSubmit = async () => {
        // Validation: Excused status requires a comment
        const invalidRecords = students.filter(s => {
            const state = attendanceStates[s.id];
            return !state.isLocked && state.status === 'E' && !state.comment?.trim();
        });

        if (invalidRecords.length > 0)
            return ctx.modal.error({ title: `Please provide a reason for excused students` });

        // We process all unlocked records
        const recordsToProcess = students.filter(s => !attendanceStates[s.id].isLocked);
        const results = await Promise.all(recordsToProcess.map(async (s) => {
            const state = attendanceStates[s.id];
            const originalAtt = attendances.find(a => a.studentId === s.id);
            const statusChanged = state.status !== originalAtt?.status;
            let newRecord;
            if (state.id && statusChanged)
                await ctx.api.request({
                    url: 'attendance:update',
                    method: 'POST',
                    params: { filterByTk: state.id },
                    data: { status: state.status }
                }).then(res => newRecord = resObj(res));
            else if (!state.id)
                await ctx.api.request({
                    url: 'attendance:create',
                    method: 'POST',
                    data: {
                        date: today,
                        status: state.status,
                        student: s.id,
                        course: schedule.courseId,
                        comment: state.comment
                    }
                }).then(res => newRecord = resObj(res));
            return newRecord;
        }));

        // Update local state with new IDs, locks and final data
        setAttendanceStates(prev => {
            const next = { ...prev };
            results.filter(Boolean).forEach(attendance =>
                next[attendance.studentId] = {
                    ...attendance,
                    // Lock it if it is NOT Absent. If Absent, keep unlocked.
                    isLocked: attendance.status !== 'A',
                }
            );
            return next;
        });

        ctx.message.success('Submitted successfully.');
    };

    return (
        <div style={{
            fontFamily: "'Khmer OS Battambang', sans-serif",
        }}>
            <p>P: វត្តមាន, A: អវត្តមាន, L: យឺត, E: ដាក់ច្បាប់</p>
            <Button onClick={() => markAll('P')}>
                Mark All Present
            </Button>
            <br />
            <table>
                {students.map(student => {
                    const { status, isLocked } = attendanceStates[student.id];
                    const config = getStatusConfig[status];

                    return (
                        <tr key={student.id} className="attendance-row">
                            <td>
                                {student.khmerName}
                            </td>
                            <td style={{ width: '100px', textAlign: 'right' }}>
                                <button
                                    onClick={() => handleToggle(student.id)}
                                    disabled={isLocked}
                                    style={{
                                        backgroundColor: isLocked ? '#f1f5f9' : '#eff6ff',
                                        color: isLocked ? '#64748b' : config.color,
                                        border: isLocked ? '1px solid #e2e8f0' : `1px solid ${config.color}40`,
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        justifyContent: 'center',
                                        marginLeft: 'auto',
                                    }}
                                >
                                    {config.label}
                                </button>
                            </td>
                            <td style={{ width: '180px' }}>
                                {status === 'E' && (
                                    <input
                                        type="text"
                                        placeholder="Reason..."
                                        value={attendanceStates[student.id].comment}
                                        onChange={(e) => handleCommentChange(student.id, e.target.value)}
                                        disabled={isLocked || !!attendanceStates[student.id].id}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            fontSize: '0.85rem',
                                            width: '160px',
                                            outline: 'none',
                                            transition: 'border-color 0.2s',
                                            backgroundColor: (isLocked || !!attendanceStates[student.id].id) ? '#f8fafc' : 'white',
                                            cursor: (isLocked || !!attendanceStates[student.id].id) ? 'not-allowed' : 'text'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                )}
                            </td>
                        </tr>
                    );
                })}
            </table>
            <br />
            <Button
                onClick={onSubmit}
                type="primary"
            >
                Submit
            </Button>
        </div>
    );
};

ctx.render(<App />);