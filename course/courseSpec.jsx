// bcuz the nocobase res isn't consistent
const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { React } = ctx.libs;
const { useState } = React;
const { Select, Button, Modal } = ctx.libs.antd;

// need to check if there's existing score before we allow editing
let editableWeightIds = [];
await ctx.api.request({
    url: 'users:run-sql',
    method: 'POST',
    data: {
        sql: `
            SELECT 
                w."id",
                COUNT(s."id")
            FROM weight w
            LEFT JOIN score s ON w."id" = s."weightId" AND s."value" > 0
            WHERE w."courseId" = ${ctx.value}
            GROUP BY w."id";
        `
    }
}).then(res => editableWeightIds = res.data.data.filter(w => w.count === 0).map(w => w.id));

const weightToDetach = [];
const cloToDetach = [];

// get config, see if we're allowed to make change during this period
// this KV table has a key val pair. it's is ISOstring that tells us the last date that we're allowed to make change
let deadlinePassed = true;
await ctx.api.request({
    url: 'KV:get',
    params: {
        filterByTk: 'courseSpecDeadline'
    },
}).then(res => {
    const data = resObj(res);
    if (data?.value)
        deadlinePassed = new Date(data.value) <= new Date();
});

const { data: { data: { programId, CLOs, weights: oldWeights } } } = await ctx.api.request({
    url: 'course:get',
    params: {
        filterByTk: ctx.value,
        appends: 'weights,CLOs'
    },
});

let { data: { data: PLOs } } = await ctx.api.request({
    url: 'PLO:list'
});

// restrict PLO if has programId
const specificPLOs = PLOs.filter(p => p.programId == programId);
if (specificPLOs.length > 0)
    PLOs = specificPLOs;
else // use the default PLOs
    PLOs = PLOs.filter(p => p.programId == null);

const { data: { data: assessments } } = await ctx.api.request({
    url: 'assessment:list',
    params: {
        pageSize: 10000 // or else it'll default to only 20
    }
});

const App = () => {
    const [weights, setWeights] = useState(oldWeights);
    const [localCLOs, setLocalCLOs] = useState(CLOs);
    const [localAssessments, setLocalAssessments] = useState(assessments);
    const [assessmentSearch, setAssessmentSearch] = useState('');

    const onSubmit = async (e) => {
        if (deadlinePassed)
            return ctx.modal.error({ title: 'Deadline has passed. You cannot submit changes.' });

        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        if (totalWeight !== 100 && totalWeight !== 0)
            return ctx.modal.error({ title: 'the total weight is not 100%' });

        // make sure each weight have assessment and PLO
        for (const w of weights)
            if (!w.assessmentId || !w.PLOId)
                return ctx.modal.error({ title: 'Please select an assessment and PLO for all weights' });

        // make sure that all CLO haver khmerStatement
        for (const clo of localCLOs)
            if (!clo.khmerStatement)
                return ctx.modal.error({ title: 'Please fill in the khmerStatement for all CLOs.' });

        // detach weights
        for (const weightId of weightToDetach)
            await ctx.api.request({
                url: 'weight:update',
                method: 'POST',
                params: { filterByTk: weightId },
                data: { courseId: null }
            });

        // detach CLOs
        for (const cloId of cloToDetach)
            await ctx.api.request({
                url: 'CLO:update',
                method: 'POST',
                params: { filterByTk: cloId },
                data: { courseId: null }
            });

        // Create/Update CLOs
        const cloIdMap = {};
        for (let i = 0; i < localCLOs.length; i++) {
            const clo = localCLOs[i];
            if (clo.new)
                await ctx.api.request({
                    url: 'CLO:create',
                    method: 'POST',
                    data: {
                        number: clo.number,
                        statement: clo.statement,
                        khmerStatement: clo.khmerStatement,
                        course: ctx.value
                    }
                }).then(res => {
                    const newId = resObj(res).id;
                    // so that the weight with tempId gets the dbId
                    cloIdMap[clo.id] = newId;
                })
            else if (clo.edited)
                ctx.api.request({
                    url: 'CLO:update',
                    method: 'POST',
                    params: { filterByTk: clo.id },
                    data: {
                        statement: clo.statement,
                        khmerStatement: clo.khmerStatement
                    }
                });
        }

        const currentWeights = [...weights];
        for (let i = 0; i < currentWeights.length; i++) {
            const w = currentWeights[i];
            // only create the newly formed weight
            if (w.new) {
                const payload = {
                    ...w,
                    assessment: w.assessmentId,
                    PLO: w.PLOId,
                    // map from temp id to db id
                    CLO: cloIdMap[w.CLOId]
                };
                delete payload.id;

                await ctx.api.request({
                    url: 'weight:create',
                    method: 'POST',
                    data: payload
                }).then(res => currentWeights[i] = resObj(res));

                setWeights([...currentWeights]);
            }
            else if (w.edited) {
                // update the weight
                await ctx.api.request({
                    url: 'weight:update',
                    method: 'POST',
                    params: { filterByTk: w.id },
                    data: w
                }).then(res => currentWeights[i] = resObj(res));

                setWeights([...currentWeights]);
            }
        }
        // sorry but I really tried to update the local state after submit but it just doesn't work
        window.location.reload();
    }

    const addCLO = () => {
        const nextNum = localCLOs.length > 0 ? Math.max(...localCLOs.map(c => c.number)) + 1 : 1;
        setLocalCLOs(prev => [
            ...prev,
            {
                new: true,
                id: 'temp-' + Math.random().toString(36).slice(2, 9),
                number: nextNum,
                statement: ''
            }
        ]);
    };

    const removeCLO = (cloId) =>
        Modal.confirm({
            title: 'Are you sure you want to remove this CLO?',
            content: 'This will also remove all associated weights.',
            onOk() {
                setLocalCLOs(prev => prev.filter(c => c.id !== cloId));
                if (typeof cloId == 'number')
                    cloToDetach.push(cloId);

                // Also detach any associated weights
                weights.filter(w => w.CLOId === cloId && !w.new)
                    .forEach(w => weightToDetach.push(w.id));
                setWeights(prev => prev.filter(w => w.CLOId !== cloId));
            }
        });

    const updateCLO = (cloId, key, value) =>
        setLocalCLOs(prev => prev.map(c =>
            c.id !== cloId ? c : { ...c, [key]: value, edited: !c.new }
        ));

    const addWeight = (CLOId) =>
        setWeights(prev => [
            ...prev,
            {
                new: true,
                id: Math.random().toString(36).slice(2, 9),
                course: ctx.value,
                CLOId,
                PLOId: '',
                assessmentId: '',
                weight: 10
            }
        ]);

    const removeWeight = (weightId) => {
        setWeights(prev => prev.filter(w => w.id !== weightId));
        if (typeof weightId == 'number') // meaning that it isn't new
            weightToDetach.push(weightId);
    }

    const updateWeight = (weightId, key, value) =>
        setWeights(prev => prev.map(w =>
            w.id != weightId ? w : { ...w, [key]: parseInt(value), edited: true }
        ));

    return (<div style={{ position: 'relative' }}>
        <style>{`
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 10px; border: 1px solid #ddd; text-align: left; vertical-align: top; }
            th { background-color: #f5f5f5; }
            input, textarea { padding: 6px; border: 1px solid #ccc; border-radius: 4px; }
            textarea { resize: vertical; min-height: 60px; }
            
            .deadline-overlay {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(255, 255, 255, 0.5);
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
        `}</style>

        {deadlinePassed && <div className="deadline-overlay"></div>}

        <Button onClick={addCLO}>Add CLO</Button>
        <br /><br />
        <table>
            <thead>
                <tr>
                    <th>CLO</th>
                    <th>EN Statement</th>
                    <th>KH Statement</th>
                    <th>PLO</th>
                    <th>Assessment</th>
                    <th>Weight (%)</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                {localCLOs.map((clo) => {
                    const cloWeights = weights.filter(w => w.CLOId === clo.id);

                    if (cloWeights.length === 0)
                        return (<tr key={`empty-${clo.id}`}>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    CLO {clo.number}
                                    <Button onClick={() => addWeight(clo.id)} title="add weight">➕</Button>
                                    <Button danger onClick={() => removeCLO(clo.id)} title="remove CLO">✕</Button>
                                </div>
                            </td>
                            <td>
                                <textarea
                                    placeholder="english statement..."
                                    value={clo.statement}
                                    onChange={(e) => updateCLO(clo.id, 'statement', e.target.value)}
                                />
                            </td>
                            <td>
                                <textarea
                                    placeholder="khmer statement..."
                                    value={clo.khmerStatement}
                                    onChange={(e) => updateCLO(clo.id, 'khmerStatement', e.target.value)}
                                />
                            </td>
                            <td colSpan="4">No weights assigned</td>
                        </tr>);

                    return cloWeights.map((w, index) => {
                        // Logic: Is this row fully "configured"?
                        const isLocked = !editableWeightIds.includes(w.id) && w.PLOId && w.assessmentId;

                        // Uniqueness logic: Filter assessments already used for THIS CLO + THIS PLO
                        const usedAssessmentIds = weights
                            .filter(other =>
                                other.CLOId === clo.id &&
                                other.PLOId === w.PLOId &&
                                other.id !== w.id &&
                                w.PLOId // Only filter if PLO is selected
                            )
                            .map(other => parseInt(other.assessmentId));

                        // Filter PLOs already used for THIS CLO + THIS Assessment
                        const usedPLOIds = weights
                            .filter(other =>
                                other.CLOId === clo.id &&
                                other.assessmentId === w.assessmentId &&
                                other.id !== w.id &&
                                w.assessmentId // Only filter if Assessment is selected
                            )
                            .map(other => parseInt(other.PLOId));

                        return (<tr key={w.id}>
                            {index === 0 && (<>
                                <td rowSpan={cloWeights.length}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        CLO {clo.number}
                                        <Button onClick={() => addWeight(clo.id)} title="add weight">➕</Button>
                                        <Button danger onClick={() => removeCLO(clo.id)} title="remove CLO">✕</Button>
                                    </div>
                                </td>
                                <td rowSpan={cloWeights.length}>
                                    <textarea
                                        placeholder="Enter CLO statement..."
                                        value={clo.statement}
                                        onChange={(e) => updateCLO(clo.id, 'statement', e.target.value)}
                                    />
                                </td>
                                <td rowSpan={cloWeights.length}>
                                    <textarea
                                        placeholder="khmer statement..."
                                        value={clo.khmerStatement}
                                        onChange={(e) => updateCLO(clo.id, 'khmerStatement', e.target.value)}
                                    />
                                </td>
                            </>)}
                            <td>
                                <Select
                                    style={{ width: '100%' }}
                                    showSearch
                                    placeholder="Select PLO"
                                    optionFilterProp="label"
                                    value={w.PLOId || undefined}
                                    disabled={isLocked}
                                    title={'to edit, you must remove this weight and add a new one'}
                                    onChange={(val) => updateWeight(w.id, 'PLOId', val)}
                                    options={PLOs
                                        .filter(p => !usedPLOIds.includes(p.id))
                                        .map(p => ({ label: `PLO ${p.number}`, value: p.id }))
                                    }
                                />
                            </td>
                            <td>
                                <Select
                                    style={{ width: '100%' }}
                                    showSearch
                                    placeholder="Select Assessment"
                                    onSearch={setAssessmentSearch}
                                    filterOption={false}
                                    value={w.assessmentId || undefined}
                                    disabled={!w.PLOId || isLocked}
                                    title={'to edit, you must remove this weight and add a new one'}
                                    onChange={async (val) => {
                                        // create if new
                                        if (typeof val === 'string' && val.startsWith('__new__')) {
                                            const name = val.split(':')[1];
                                            const res = await ctx.api.request({
                                                url: 'assessment:create',
                                                method: 'POST',
                                                data: { name }
                                            });
                                            const newA = resObj(res);
                                            setLocalAssessments(prev => [...prev, newA]);
                                            updateWeight(w.id, 'assessmentId', newA.id);
                                        } else {
                                            updateWeight(w.id, 'assessmentId', val);
                                        }
                                        setAssessmentSearch('');
                                    }}
                                    options={(() => {
                                        const opts = localAssessments
                                            .filter(a => !usedAssessmentIds.includes(a.id))
                                            .filter(a => a.name.toLowerCase().includes(assessmentSearch.toLowerCase()))
                                            .map(a => ({ label: a.name, value: a.id }));
                                        if (assessmentSearch && !localAssessments.some(a => a.name.toLowerCase() === assessmentSearch.toLowerCase()))
                                            opts.push({ label: `➕ Create "${assessmentSearch}"`, value: `__new__:${assessmentSearch}` });
                                        return opts;
                                    })()}
                                />
                            </td>
                            <td>
                                <input
                                    required
                                    disabled={isLocked}
                                    title={'to edit, you must remove this weight and add a new one'}
                                    type="number"
                                    min="1"
                                    max="100"
                                    step="1"
                                    value={w.weight}
                                    onChange={(e) => updateWeight(w.id, 'weight', e.target.value)}
                                />
                            </td>
                            <td>
                                <Button danger onClick={() => removeWeight(w.id)}>✕</Button>
                            </td>
                        </tr>);
                    });
                })}
            </tbody>
        </table>
        <br />
        <Button type="primary" onClick={onSubmit}>submit</Button>
    </div>);
}

ctx.render(<App />);