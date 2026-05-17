const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const scheduleId = await ctx.getVar('ctx.popup.resource.filterByTk');

const { React } = ctx.libs;
const { useState } = React;
const { Button, Select, Input } = ctx.libs.antd;

// get config, see if we're allowed to make change during this period
// this KV table has a key val pair. it's is ISOstring that tells us the last date that we're allowed to make change
let deadlinePassed = true;
await ctx.api.request({
  url: 'KV:get',
  params: {
    filterByTk: 'evaluationDeadline'
  },
}).then(res => {
  if (resObj(res).value)
    deadlinePassed = new Date(resObj(res).value) <= new Date();
});

let { data: { data: questions } } = await ctx.api.request({
  url: 'evaluationQuestion:list',
});

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

// if today is closer to the end than the mid of the semester, then we append the CLO qs
const now = new Date().getTime();
const start = new Date(semester.startDate).getTime();
const end = new Date(semester.endDate).getTime();
const mid = (start + end) / 2;
const closerToEnd = Math.abs(end - now) < Math.abs(mid - now);

if (closerToEnd) {
  let CLOs = [];
  await ctx.api.request({
    url: 'schedule:get',
    params: {
      filterByTk: scheduleId,
      appends: 'course.CLOs'
    },
  }).then(res => CLOs = resObj(res).course.CLOs);
  questions.push(...CLOs.map(CLO => ({
    label: `សូមវាយតម្លៃសមត្ថភាពដែលប្អូនទទួលបានសម្រាប់ CLO ${CLO.number} "${CLO.khmerStatement || CLO.statement}"`,
    type: 'mcq',
    required: true,
    choices: '<50\n51-60\n61-70\n71-80\n81-90\n91-100'
  })));
}

const App = () => {
  const [formData, setFormData] = useState({});

  const handleInputChange = (label, value) =>
    setFormData(prev => ({ ...prev, [label]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (deadlinePassed)
      return ctx.modal.error({ title: 'Deadline has passed. You cannot submit changes.' });

    // Validate required fields
    const emptyAnswers = ['គ្មាន', 'អត់មាន', 'មិនមាន', 'none', 'n/a'];
    for (const field of questions)
      if (field.required && !formData[field.label])
        return ctx.modal.error({ title: `Please answer: ${field.label}` });
      // don't want to store empty answer
      else if (!field.required && field.type == 'text' &&
        emptyAnswers.includes(formData[field.label]?.trim()?.toLowerCase().replace('ទេ', '')))
        formData[field.label] = '';

    await ctx.api.request({
      url: 'workflows.endpoint:execute?title=submit-evaluation',
      method: 'POST',
      data: {
        scheduleId,
        answers: questions.map(q => formData[q.label]?.trim() ?? '')
      }
    }).then(() => {
      ctx.message.success('រួចរាល់');
      setTimeout(() => window.location.href = '/', 3000);
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      fontFamily: 'Khmer OS Battambang'
    }}>
      {deadlinePassed && <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(255, 255, 255, 0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}></div>}
      {questions.map((field, index) => (
        <div key={index} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <label>
            {field.label}
            {field.required && <span style={{ color: '#ef4444' }}>*</span>}
          </label>

          {field.type === 'text' && (
            <Input
              placeholder={!field.required && 'បើគ្មានមិនបាច់សរសេរទេ'}
              value={formData[field.label]}
              onChange={(e) => handleInputChange(field.label, e.target.value)}
            />
          )}

          {(field.type === 'mcq' || field.type === 'checkbox') && (
            <Select
              mode={field.type === 'checkbox' ? 'multiple' : undefined}
              placeholder={field.type === 'checkbox' ? 'Select options...' : 'Select an option...'}
              value={formData[field.label] || (field.type === 'checkbox' ? [] : undefined)}
              onChange={(val) => handleInputChange(field.label, val)}
              options={field.choices.split('\n').filter(c => c.trim()).map(c => ({
                label: c,
                value: c
              }))}
            />
          )}
        </div>
      ))}

      <Button type="primary" htmlType="submit">
        submit
      </Button>
    </form>
  );
};

ctx.render(<App />);
