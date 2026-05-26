const { data: { data: schedules } } = await ctx.api.request({
    url: 'custom:list-substitute-schedules'
});

const { Button, Select, Steps } = ctx.libs.antd;
const { React } = ctx.libs;
const { useState, useMemo } = React;

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

    const handleNext = () => {
        if (step === 2) {
            const match = schedules.find(s =>
                s.lecturers.some(l => l.id === lecturerId) &&
                s.course?.id === courseId &&
                s.class?.id === classId
            );
            if (match)
                window.location.href = `/admin/z1boq93dfpg/view/9a8d633a145/filterbytk/${match.id}`;
        } else {
            setStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (step === 1) { setCourseId(null); }
        if (step === 2) { setClassId(null); }
        setStep(prev => prev - 1);
    };

    const canProceed = [!!lecturerId, !!courseId, !!classId][step];

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
                    onChange={setLecturerId}
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
                    onChange={setCourseId}
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
                    onChange={setClassId}
                    options={classOptions}
                />
            )}

            <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
                {step > 0 && (
                    <Button onClick={handleBack}>Back</Button>
                )}
                <Button type="primary" disabled={!canProceed} onClick={handleNext}>
                    {step === 2 ? 'Go' : 'Next'}
                </Button>
            </div>
        </div>
    );
};

ctx.render(<App />);