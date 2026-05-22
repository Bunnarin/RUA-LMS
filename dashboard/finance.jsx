const resObj = (res) => Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;

const { Button, Select } = ctx.libs.antd;
const { useState } = ctx.React;

// why tf do I have to lerng mah klek mah klek? isn't that debt?
// that mean we should just server side select the damn thing? ofc... but sometime, we may not do guaranteed to be before, during, or after?
// we cnanot infer this from the majority either. since they may be from scholarship or whatever. no maybe we can infer from the majority on where the semester is
// this is fking bs. alright majority it is then

let topValidTilSemesters = [];

await ctx.api.request({
    url: 'users:run-sql',
    method: 'post',
    data: {
        sql: `
            SELECT 
                e."validTilSemesterId" AS "id",
                s."number",
                s."academicYear",
                COUNT(*) AS "count"
            FROM "enrollment" e
            JOIN "semester" s ON e."validTilSemesterId" = s."id"
            GROUP BY e."validTilSemesterId", s."number", s."academicYear"
            ORDER BY "count" DESC
            LIMIT 3;
        `
    }
}).then(res => topValidTilSemesters = res.data.data);

// exclude lastNotifiedSemesterId
await ctx.api.request({
    url: 'KV:get',
    params: {
        filterByTk: 'lastNotifiedSemesterId'
    }
}).then(res => topValidTilSemesters = topValidTilSemesters.filter(s => s.id !== resObj(res)?.value));

// I'm not creating any thing in the client
// get or create the next one somehow
const getNextSemLabel = (oldSem) => { 
    const nextAcademicYear = oldSem.number === 2 ? oldSem.academicYear + 1 : oldSem.academicYear;
    const nextNumber = oldSem.number === 2 ? 1 : 2;
    return `${nextAcademicYear}-${(nextAcademicYear + 1) % 100} (ឆមាសទី${nextNumber})`;
}

const App = () => {
    const [semesters, setSemesters] = useState(topValidTilSemesters);
    const [srcSemesterId, setSrcSemesterId] = useState(topValidTilSemesters[0]?.id);
    const notifyPayment = () =>
        ctx.api.request({
            url: 'student:notify-payment',
            method: 'post',
            data: { srcSemesterId }
        }).then(() => setSemesters(prev => prev.filter(s => s.id !== srcSemesterId)));
    return (
        <div>
            <Button onClick={notifyPayment}>auto clear finance for full scholarship and notify student to pay for: </Button>
            {/* we show the next sem (for visual purpose) but actually use the prev sem id. we delegate the creation of new semester to the server*/}
            <Select value={srcSemesterId} onChange={setSrcSemesterId} options={semesters.map(s => ({ value: s.id, label: getNextSemLabel(s) }))}/>
        </div>
    );
}

ctx.render(<App />);