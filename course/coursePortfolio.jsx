const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

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

const { data: { data: portfolios } } = await ctx.api.request({
    url: 'coursePortfolio:list',
    params: {
        'appends[]': 'files',
        filter: {
            semesterId: semester.id,
            courseId: ctx.value
        }
    }
});

const { data: { data: criterias } } = await ctx.api.request({
    url: 'coursePortfolioCriteria:list',
});

const FILE_COLOR = {
    '.docx': '#2b579a',
    '.doc': '#2b579a',
    '.xlsx': '#217346',
    '.xls': '#217346',
    '.pptx': '#d24726',
    '.ppt': '#d24726',
    '.pdf': '#ff0000'
};

const { React } = ctx.libs;
const { useState } = React;

const App = () => {
    const [loading, setLoading] = useState({});

    const handleUpload = async (criteriaId, e) => {
        setLoading(prev => ({ ...prev, [criteriaId]: true }));
        const newFileIds = [];
        for (const file of e.target.files)
            await ctx.api.request({
                url: 'file:create',
                method: 'POST',
                data: { file },
                headers: { 'Content-Type': 'multipart/form-data' }
            }).then(res => newFileIds.push({ id: resObj(res).id }));
        // Step 2: Update or Create the Portfolio record
        const existing = portfolios.find(p => p.criteriaId === criteriaId);
        if (existing)
            await ctx.api.request({
                url: `coursePortfolio:update`,
                method: 'POST',
                params: {
                    filterByTk: existing.id
                },
                data: {
                    files: [...existing.files, ...newFileIds]
                }
            });
        else
            await ctx.api.request({
                url: 'coursePortfolio:create',
                method: 'POST',
                data: {
                    course: ctx.value,
                    criteria: criteriaId,
                    semester: semester.id,
                    files: newFileIds
                }
            }).then(res => portfolios.push(resObj(res)));
        window.location.reload();
    };

    return (<>
        <h1>{semester.startYear}-{(semester.startYear + 1) % 100} - ឆមាសទី {semester.number}</h1>
        <table>
            <thead>
                <tr>
                    <th>Criteria</th>
                    <th>Attached Files</th>
                </tr>
            </thead>
            <tbody>
                {criterias.map(crit => {
                    const portfolio = portfolios.find(p => p.criteriaId === crit.id);
                    const hasFiles = portfolio?.files?.length > 0;

                    return (
                        <tr key={crit.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td>
                                <div style={{ fontWeight: '600' }}>{crit.name}</div>
                                <label style={{ ...styles.uploadBtn, backgroundColor: hasFiles ? '#696969ff' : '#1890ff' }}>
                                    {loading[crit.id] ? '...' : 'Upload'}
                                    <input
                                        multiple
                                        type="file"
                                        style={{ display: 'none' }}
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                        onChange={(e) => handleUpload(crit.id, e)}
                                        disabled={loading[crit.id]}
                                    />
                                </label>
                            </td>

                            <td>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                    {portfolio?.files.map(f => (
                                        <div key={f.id} style={styles.fileWrapper}>
                                            <div
                                                onClick={() => window.open(f.url, '_blank')}
                                                style={{ ...styles.fileBlock, color: '#ffffff', backgroundColor: FILE_COLOR[f.extname] }}>
                                                {f.extname.slice(1)}
                                            </div>
                                            {f.filename}
                                        </div>
                                    ))}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </>);
};

const styles = {
    uploadBtn: {
        display: 'inline-block',
        padding: '6px 16px',
        color: '#fff',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px'
    },
    fileWrapper: {
        width: '75px', // Slightly wider to accommodate text
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px',
        borderRadius: '4px',
        marginRight: '12px'
    },
    fileBlock: {
        width: '40px',
        height: '30px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        border: 'none' // Removed border since background color is now primary
    },
    // Updated as requested: White text for the filename
    fileNameText: {
        fontSize: '10px',
        color: '#ffffff', // Your change applied
        textAlign: 'center',
        width: '100%',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        padding: '0 2px'
    }
};

ctx.render(<App />);