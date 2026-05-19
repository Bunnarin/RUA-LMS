let classes = [];
await ctx.api.request({
    url: 'workflows.endpoint:execute?title=academic-dashboard',
}).then(res => classes = res.data.data);

const { React } = ctx.libs;
const { useMemo } = React;
const { Table, Collapse, Typography } = ctx.libs.antd;
const { Panel } = Collapse;
const { Title } = Typography;

const App = () => {
    const groupedData = useMemo(() => {
        const groups = {};
        classes.forEach(cls => {
            const pName = cls.program_name || 'No Program';
            groups[pName] ??= [];
            groups[pName].push(cls);
        });

        // Convert to array and sort by program name
        return Object.entries(groups)
            .map(([program_name, items]) => ({ program_name, items }))
            .sort((a, b) => a.program_name.localeCompare(b.program_name));
    }, []);

    return (
        <div style={{ padding: '24px 0' }}>
            <Title level={4} style={{ marginBottom: 24 }}>Classes Without Attendance</Title>

            {groupedData.length === 0 ? (
                <div>No classes found.</div>
            ) : (
                <Collapse defaultActiveKey={groupedData.length > 0 ? [groupedData[0].program_name] : []}>
                    {groupedData.map(group => (
                        <Panel header={`${group.program_name} (${group.items.length})`} key={group.program_name}>
                            <Table
                                rowKey="class_name"
                                columns={[
                                    { title: 'Class Name', dataIndex: 'class_name', key: 'class_name' },
                                ]}
                                dataSource={group.items}
                                pagination={false}
                                size="small"
                                showHeader={false}
                            />
                        </Panel>
                    ))}
                </Collapse>
            )}
        </div>
    );
};

ctx.render(<App />);