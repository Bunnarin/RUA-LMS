const React = ctx.React;
const { useState } = React;
const { InputNumber } = ctx.libs.antd;

function JsEditableField() {
    const lastYear = new Date().getFullYear() - 1;
    ctx.setValue(lastYear);
    const [value, setValue] = useState(lastYear);

    return (<>
        <InputNumber
            style={{ width: '50px' }}
            value={value}
            onChange={val => {
                setValue(val);
                ctx.setValue(val);
            }}
            controls={true}
        />
        - {value + 1}
    </>);
}

ctx.render(<JsEditableField />);
