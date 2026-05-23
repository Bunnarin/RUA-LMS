export const SQLQueryHandler = async (ctx: any, next: any) => {
  const allowedRoles = ['finance', 'academic', 'admin', 'lecturer'];

  if (!ctx.auth.user.roles.find((r: any) => allowedRoles.includes(r.get('name')))) {
      ctx.body = { success: false, message: 'You are not authorized to run SQL' };
      return;
  }

  const params = ctx.action?.params.values;

  let sql = '';

  if (params.type === 'course-spec')
    sql = `
      SELECT 
          w.id,
          COUNT(s.id)
      FROM weight w
      LEFT JOIN score s ON w.id = s."weightId" AND s."value" > 0
      WHERE w."courseId" = ${params.courseId}
      GROUP BY w.id;
    `;
  else if (params.type == 'OBE-acheivement')
    sql = `
      SELECT 
        c."semesterNum",
        c."englishName",
        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'CLO_number', clo.number,
                    'PLO_number', plo.number,
                    'weight', w_grouped."total_weight",
                    'scores', coalesce(s_grouped.scores, '[]'::jsonb)
                  )
              ), '[]'::jsonb
          ) AS "weights"
      FROM course c
      INNER JOIN (
          -- 1. Group and sum the weights strictly by course, CLO, and PLO
          SELECT 
              "courseId",
              "CLOId",
              "PLOId",
              SUM("weight") AS "total_weight"
          FROM weight
          GROUP BY "courseId", "CLOId", "PLOId"
      ) w_grouped ON w_grouped."courseId" = c.id
      LEFT JOIN (
          -- 2. Aggregate scores separately to avoid multiplying weight sums
          SELECT 
              w."courseId",
              w."CLOId",
              w."PLOId",
              jsonb_agg(s."value") FILTER (WHERE s."value" IS NOT NULL) AS scores
          FROM weight w
          INNER JOIN score s ON s."weightId" = w.id
          GROUP BY w."courseId", w."CLOId", w."PLOId"
      ) s_grouped ON s_grouped."courseId" = w_grouped."courseId" 
                AND s_grouped."CLOId" = w_grouped."CLOId" 
                AND s_grouped."PLOId" = w_grouped."PLOId"
      LEFT JOIN "CLO" clo ON w_grouped."CLOId" = clo.id
      LEFT JOIN "PLO" plo ON w_grouped."PLOId" = plo.id
      WHERE c."programId" = ${params.programId} AND c."semesterNum" = ${params.semesterNum}
      GROUP BY c.id;
    `;

  const result = await ctx.db.sequelize.query(sql);

  ctx.body = result[0];
  await next();
};
