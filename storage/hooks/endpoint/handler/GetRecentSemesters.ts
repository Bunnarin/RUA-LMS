export const getRecentSemestersHandler = async (ctx: any, next: any) => {
    const semesters = await ctx.db.getRepository('semester').find({
        values: {
            academicYear: { $gte: new Date().getFullYear() - 2 }
        }
    });
    // sort by whose mid is closest to now
    const now = Date.now();
    const mid = (s: any) => (new Date(s.get('startDate')).getTime() + new Date(s.get('endDate')).getTime()) / 2;
    semesters.sort((a: any, b: any) => Math.abs(mid(a) - now) - Math.abs(mid(b) - now));
    ctx.body = semesters;
    await next();
};
