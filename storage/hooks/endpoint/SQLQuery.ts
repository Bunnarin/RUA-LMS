export const SQLQueryHandler = async (ctx: any, next: any) => {
  const { type } = ctx.action?.params.values;
  if (type === 'course-spec') {
    // Execute the SQL query
    const allowedRoles = ['finance', 'academic', 'admin', 'lecturer'];

    if (!ctx.auth.user.roles.find((r: any) => allowedRoles.includes(r.get('name')))) {
        ctx.body = { success: false, message: 'You are not authorized to run SQL' };
        return;
    }

    // execute
    const result = await ctx.db.sequelize.query(`
      SELECT 
          w."id",
          COUNT(s."id")
      FROM weight w
      LEFT JOIN score s ON w."id" = s."weightId" AND s."value" > 0
      WHERE w."courseId" = ${ctx.action?.params.values.courseId}
      GROUP BY w."id";
    `);

    ctx.body = result[0];
  }
  await next();
};
