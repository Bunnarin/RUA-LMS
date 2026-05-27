const { data: { data: schedules } } = await ctx.api.request({
    url: 'custom:list-substitute-schedules'
});

const { Button, Select, Steps } = ctx.libs.antd;
const { React } = ctx.libs;
const { useState, useMemo, useEffect } = React;

const App = () => {
    const [step, setStep] = useState(0);
    const [lecturerId, setLecturerId] = useState(null);
    const [courseId, setCourseId] = useState(null);
    const [classId, setClassId] = useState(null);

    const lecturerOptions = useMemo(() => {
        const map = new Map();
        schedules.forEach(s =>
            s.lecturers.forEach(l => {
                if (!map.has(l.id)) map.set(l.id, l.englishName);
            })
        );
        return Array.from(map, ([id, name]) => ({ value: id, label: name }));
    }, []);

    const courseOptions = useMemo(() => {
        if (!lecturerId) return [];
        const map = new Map();
        schedules
            .filter(s => s.lecturers.some(l => l.id === lecturerId))
            .forEach(s => {
                if (s.course && !map.has(s.course.id))
                    map.set(s.course.id, s.course.name);
            });
        return Array.from(map, ([id, name]) => ({ value: id, label: name }));
    }, [lecturerId]);

    const classOptions = useMemo(() => {
        if (!lecturerId || !courseId) return [];
        const map = new Map();
        schedules
            .filter(s =>
                s.lecturers.some(l => l.id === lecturerId) &&
                s.course?.id === courseId
            )
            .forEach(s => {
                if (s.class && !map.has(s.class.id))
                    map.set(s.class.id, s.class.name);
            });
        return Array.from(map, ([id, name]) => ({ value: id, label: name }));
    }, [lecturerId, courseId]);

    const selectLecturer = (id) => { setLecturerId(id); setStep(1); };
    const selectCourse = (id) => { setCourseId(id); setStep(2); };
    const selectClass = (id) => {
        const match = schedules.find(s =>
            s.lecturers.some(l => l.id === lecturerId) &&
            s.course?.id === courseId &&
            s.class?.id === id
        );
        if (match)
            window.location.href = `/admin/9s3bdn1jxnw/view/9a8d633a145/filterbytk/${match.id}`;
    };

    const handleBack = () => {
        if (step === 1) { setLecturerId(null); setCourseId(null); }
        if (step === 2) { setCourseId(null); setClassId(null); }
        setStep(prev => prev - 1);
    };

    useEffect(() => {
        if (step === 0 && lecturerOptions.length === 1) selectLecturer(lecturerOptions[0].value);
    }, [lecturerOptions]);

    useEffect(() => {
        if (step === 1 && courseOptions.length === 1) selectCourse(courseOptions[0].value);
    }, [courseOptions]);

    useEffect(() => {
        if (step === 2 && classOptions.length === 1) selectClass(classOptions[0].value);
    }, [classOptions]);

    const stepItems = [
        { title: 'Lecturer' },
        { title: 'Course' },
        { title: 'Class' },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: '480px' }}>
            <Steps current={step} items={stepItems} style={{ marginBottom: '32px' }} />

            {step === 0 && (
                <Select
                    autoFocus
                    style={{ width: '100%' }}
                    placeholder="Select a lecturer"
                    showSearch
                    value={lecturerId}
                    onChange={selectLecturer}
                    options={lecturerOptions}
                />
            )}

            {step === 1 && (
                <Select
                    autoFocus
                    style={{ width: '100%' }}
                    placeholder="Select a course"
                    showSearch
                    value={courseId}
                    onChange={selectCourse}
                    options={courseOptions}
                />
            )}

            {step === 2 && (
                <Select
                    autoFocus
                    style={{ width: '100%' }}
                    placeholder="Select a class"
                    showSearch
                    value={classId}
                    onChange={selectClass}
                    options={classOptions}
                />
            )}

            {step > 0 && (
                <div style={{ marginTop: '24px' }}>
                    <Button onClick={handleBack}>Back</Button>
                </div>
            )}
        </div>
    );
};

ctx.render(<App />);