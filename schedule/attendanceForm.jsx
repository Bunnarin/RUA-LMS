// used for both schedule and class table
const filterByTk = await ctx.getVar('ctx.popup.resource.filterByTk');
const collectionName = ctx.popup.resource.collectionName;

const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { Button, DatePicker } = ctx.libs.antd;
const { React, dayjs } = ctx.libs;
const { useState, useEffect, useCallback } = React;

let schedule = {};
if (collectionName == 'schedule')
    await ctx.api.request({
        url: 'schedule:get',
        params: {
            filterByTk,
            appends: ['class.students']
        }
    }).then(res => schedule = resObj(res));
else if (collectionName == 'class')
    await ctx.api.request({
        url: 'class:get',
        params: {
            filterByTk,
            appends: ['students']
        }
    }).then(res => schedule.class = resObj(res));

// Cache for attendance data by date
const attendanceCache = new Map();

const students = schedule.class.students.sort((a, b) => a.khmerName.localeCompare(b.khmerName));

const App = () => {
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [attendanceStates, setAttendanceStates] = useState({});
    const [loading, setLoading] = useState(false);
    const [hasExistingAttendance, setHasExistingAttendance] = useState(false);

    // Lazy load attendance data with caching
    const loadAttendance = useCallback(async (date) => {
        const dateStr = date.format('YYYY-MM-DD');
        
        // Check cache first
        if (attendanceCache.has(dateStr))
            return attendanceCache.get(dateStr);

        setLoading(true);
        try {
            const filter = { 
                date: dateStr, 
                student: { 
                    classes: { 
                        id: schedule?.classId || filterByTk 
                    } 
                } 
            };
            if (collectionName == 'schedule')
                filter.courseId = schedule.courseId;
            const { data: { data: attendances } } = await ctx.api.request({
                url: 'attendance:list',
                params: {
                    pageSize: 1000,
                    filter
                }
            });
            
            // Cache the result
            attendanceCache.set(dateStr, attendances);
            return attendances;
        } finally {
            setLoading(false);
        }
    }, [schedule?.classId, schedule?.courseId, filterByTk]);

    // Initialize attendance states when date changes
    useEffect(() => {
        const initAttendance = async () => {
            const attendances = await loadAttendance(selectedDate);
            
            // Check if there's any existing attendance for this date
            const hasExisting = attendances.length > 0;
            setHasExistingAttendance(hasExisting);

            const map = {};
            students.forEach(s => {
                const att = attendances.find(a => a.studentId === s.id);
                if (att) {
                    // Lock all records if past attendance exists
                    const isPastDate = selectedDate.isBefore(dayjs(), 'day');
                    map[s.id] = {
                        ...att,
                        isLocked: isPastDate || att.status !== 'A'
                    };
                } else {
                    // No record = Absent and Unlocked (only if no existing attendance for the date)
                    map[s.id] = { status: 'A', isLocked: hasExisting, id: null, comment: '' };
                }
            });
            setAttendanceStates(map);
        };
        
        initAttendance();
    }, [selectedDate, loadAttendance]);

    const getNextStatus = {
        A: 'L',
        L: 'P',
        P: 'E',
        E: 'A'
    };

    const getColor = {
        A: '#ef4444',
        L: '#f59e0b',
        P: '#10b981',
        E: '#3b82f6'
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

    const handleCommentChange = (studentId, comment) =>
        setAttendanceStates(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], comment }
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
        const currentAttendances = attendanceCache.get(selectedDate.format('YYYY-MM-DD')) || [];
        const results = await Promise.all(recordsToProcess.map(async (s) => {
            const state = attendanceStates[s.id];
            const originalAtt = currentAttendances.find(a => a.studentId === s.id);
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
                        date: selectedDate.format('YYYY-MM-DD'),
                        status: state.status,
                        student: s.id,
                        course: schedule?.courseId,
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
                    isLocked: attendance.status !== 'A',
                }
            );
            return next;
        });

        // Update cache
        const updatedAttendances = [...currentAttendances, ...results.filter(Boolean)];
        attendanceCache.set(selectedDate.format('YYYY-MM-DD'), updatedAttendances);
        setHasExistingAttendance(true);

        ctx.message.success('Submitted successfully.');
    };

    const isToday = selectedDate.isSame(dayjs(), 'day');
    const isPastDate = selectedDate.isBefore(dayjs(), 'day');

    return (
        <div style={{
            fontFamily: "'Khmer OS Battambang', sans-serif",
        }}>
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button 
                    onClick={() => setSelectedDate(prev => prev.subtract(1, 'day'))}
                    disabled={loading}
                >
                    ←
                </Button>
                <DatePicker 
                    value={selectedDate}
                    onChange={setSelectedDate}
                    disabledDate={(current) => current && current.isAfter(dayjs(), 'day')}
                    format="ddd DD MMM"
                    style={{ flex: 1 }}
                />
                <Button 
                    onClick={() => setSelectedDate(prev => prev.add(1, 'day'))}
                    disabled={isToday || loading}
                >
                    →
                </Button>
            </div>
            
            {hasExistingAttendance && isPastDate && (
                <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#fef3c7', 
                    borderRadius: '8px', 
                    marginBottom: '16px',
                    color: '#92400e',
                    fontSize: '0.9rem'
                }}>
                    ⚠️ មិនអាចកែបាន
                </div>
            )}
            
            <p>P: វត្តមាន, A: អវត្តមាន, L: យឺត, E: ដាក់ច្បាប់</p>
            <Button 
                onClick={() => markAll('P')}
                disabled={hasExistingAttendance && isPastDate}
            >
                Mark All Present
            </Button>
            <br />
            <table>
                {students.map((student, idx) => {
                    const studentState = attendanceStates[student.id];
                    if (!studentState) return null;
                    
                    const { status, isLocked } = studentState;
                    const color = getColor[status];

                    return (
                        <tr key={student.id} className="attendance-row">
                            <td>
                                {idx + 1}. {student.khmerName}
                            </td>
                            <td style={{ width: '100px', textAlign: 'right' }}>
                                <button
                                    onClick={() => handleToggle(student.id)}
                                    disabled={isLocked || (hasExistingAttendance && isPastDate)}
                                    style={{
                                        backgroundColor: isLocked ? '#f1f5f9' : '#eff6ff',
                                        color: isLocked ? '#64748b' : color,
                                        border: isLocked ? '1px solid #e2e8f0' : `1px solid ${color}40`,
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
                                    {status}
                                </button>
                            </td>
                            <td style={{ width: '180px' }}>
                                {status === 'E' && (
                                    <input
                                        type="text"
                                        placeholder="Reason..."
                                        value={attendanceStates[student.id].comment}
                                        onChange={(e) => handleCommentChange(student.id, e.target.value)}
                                        disabled={isLocked || !!attendanceStates[student.id].id || (hasExistingAttendance && isPastDate)}
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
                disabled={hasExistingAttendance && isPastDate}
            >
                Submit
            </Button>
        </div>
    );
};

ctx.render(<App />);