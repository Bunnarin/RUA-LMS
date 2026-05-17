const { Select } = ctx.libs.antd;

const { data: { data: users } } = await ctx.api.request({
    url: 'users:list',
    filter: {
        studentId: null
    }
});

const App = () => 
    <Select
        mode="multiple"
        showSearch={{
            filterOption: (input, option) => {
                const [enName, khName] = option.label.split(' | ');
                if (enName.toLowerCase().includes(input.toLowerCase())) return true;
                if (khName.toLowerCase().includes(input.toLowerCase())) return true;
                // also account for switched names when searching for include
                if (enName.split(' ').reverse().join(' ').toLowerCase().includes(input.toLowerCase())) return true;
                if (khName.split(' ').reverse().join(' ').toLowerCase().includes(input.toLowerCase())) return true;
                
                if (getSimilarity(enName, input) > 0.8) return true;
                if (getSimilarity(khName, input) > 0.8) return true;
                // also account for switched names in reverse (e.g., "Doe John" matches "John Doe")
                if (getSimilarity(enName.split(' ').reverse().join(' '), input) > 0.8) return true;
                if (getSimilarity(khName.split(' ').reverse().join(' '), input) > 0.8) return true;
                return false;
            }
        }}
        options={users.map(user => ({
            value: user.id,
            label: user.englishName + ' | ' + user.khmerName
        }))}
        defaultValue={() => ctx.getValue()}
        onChange={value => ctx.setValue(value.map(v => users.find(u => u.id === v)))}
    />

ctx.render(<App />);

function getSimilarity(s1, s2) {
    if (!s1 || !s2) return 0; // Don't match empty names
    let longer = s1.length > s2.length ? s1 : s2;
    let shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / parseFloat(longer.length);
}

function editDistance(s1, s2) {
    let costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) != s2.charAt(j - 1))
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}