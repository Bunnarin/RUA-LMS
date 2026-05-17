const React = ctx.React;
const { useState, useMemo } = React;
const { Button } = ctx.libs.antd;
const key = ctx.record.id;

function JsEditableField() {
    const [showCheckbox, setShowCheckbox] = useState(false);

    // Check if the original value was in the past once on mount
    // bcuz if deadline hasnt pass yet, obviously we dont need to reset past results
    const isOldDatePast = useMemo(() => new Date(ctx.getValue()) < new Date(), []);

    const handleChange = (e) => {
        ctx.setValue(e.target.value);
        // Add checkbox only for evaluationDeadline if it was originally in the past
        if (key === 'evaluationDeadline' && isOldDatePast)
            setShowCheckbox(true);
    };

    const currentValue = ctx.getValue();
    const defaultValue = currentValue ? new Date(currentValue).toISOString().split('T')[0] : '';
    const minDate = new Date().toISOString().split('T')[0];

    if (key === 'evaluationDeadline' || key === 'courseSpecDeadline') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                    type="date"
                    min={minDate}
                    defaultValue={defaultValue}
                    onChange={handleChange}
                />
                {showCheckbox && (
                    <Button
                        onClick={e => {
                            // call the api
                            ctx.api.request({
                                url: 'apiCall:create',
                                method: 'post',
                                data: {
                                    path: 'clear-schedules'
                                }
                            });
                        }}
                    >
                        Clear past results?
                    </Button>
                )}
            </div>
        );
    }

    return (
        <input
            type="date"
            min={minDate}
            defaultValue={defaultValue}
            onChange={e => ctx.setValue?.(e.target.value)}
        />
    );
}

// Mount to the field container
ctx.render(<JsEditableField />);

