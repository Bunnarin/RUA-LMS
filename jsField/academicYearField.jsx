const React = ctx.React;
const { useState } = React;
const { InputNumber } = ctx.libs.antd;

const lastYear = new Date().getFullYear() - 1;
ctx.setValue(lastYear);

function JsEditableField() {
    const [value, setValue] = useState(lastYear);

    const onChange = (val) => {
        setValue(val);
        ctx.setValue(val);
    };

    return (<>
        <InputNumber
            style={{ width: '50px' }}
            value={value}
            onChange={onChange}
            controls={true}
        /> - {value + 1}
    </>);
}

ctx.render(<JsEditableField />);
