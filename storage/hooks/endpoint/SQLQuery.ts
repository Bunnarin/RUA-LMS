export const SQLQueryHandler = async (ctx: any, next: any) => {
  const allowedRoles = ['finance', 'academic', 'admin', 'lecturer'];

  if (!ctx.auth.user.roles.find((r: any) => allowedRoles.includes(r.get('name')))) {
      ctx.body = { success: false, message: 'You are not authorized to run SQL' };
      return;
  }

  const params = ctx.action?.params.values;

  // prevent sql injection
  const regex = /(select |update |delete |truncate |drop |alter |create |insert |exec |execute )/i;
  for (const value of Object.values(params))
    if (regex.test(value as string)) {
      ctx.body = { success: false, message: 'Invalid query type' };
      return;
    }

  let sql = '';

  if (params.type === 'course-spec')
    sql = `
      SELECT 
          w.id,
          COUNT(s.id)
      FROM weight w
      LEFT JOIN score s ON w.id = s."weightId" AND s.value > 0
      WHERE w."courseId" = ${params.courseId}
      GROUP BY w.id;
    `;
  else if (params.type == 'OBE-attainment')
    sql = `
      WITH course_students AS (
          -- Canonical student list per course, ordered by studentId
          SELECT DISTINCT sch."courseId", sc."studentId"
          FROM schedule sch
          INNER JOIN "studentsClasses" sc ON sc."classId" = sch."classId"
      ),
      weight_groups AS (
          -- Sum weights by (course, CLO, PLO)
          SELECT "courseId", "CLOId", "PLOId", SUM("weight") AS "total_weight"
          FROM weight
          GROUP BY "courseId", "CLOId", "PLOId"
      ),
      student_scores AS (
          -- Sum of scores per student per (course, CLO, PLO) group
          SELECT 
              w."courseId", w."CLOId", w."PLOId", s."studentId",
              SUM(s.value) AS total
          FROM weight w
          INNER JOIN score s ON s."weightId" = w.id AND s."createdAt" >= '${params.startDate}'
          GROUP BY w."courseId", w."CLOId", w."PLOId", s."studentId"
      ),
      ordered_scores AS (
          -- Build ordered array per weight group; 0 for students with no score
          SELECT 
              wg."courseId", wg."CLOId", wg."PLOId",
              jsonb_agg(COALESCE(ss.total, 0) ORDER BY cs."studentId") AS scores
          FROM weight_groups wg
          INNER JOIN course_students cs ON cs."courseId" = wg."courseId"
          LEFT JOIN student_scores ss ON ss."courseId" = wg."courseId"
              AND ss."CLOId" = wg."CLOId"
              AND ss."PLOId" = wg."PLOId"
              AND ss."studentId" = cs."studentId"
          GROUP BY wg."courseId", wg."CLOId", wg."PLOId"
      )
      SELECT 
          c.name,
          c."theoryCredit",
          c."practiceCredit",
          COALESCE(
              jsonb_agg(
                  jsonb_build_object(
                      'CLO_number', clo.number,
                      'PLO_number', plo.number,
                      'weight', wg."total_weight",
                      'scores', COALESCE(os.scores, '[]'::jsonb)
                  )
              ), '[]'::jsonb
          ) AS "weights"
      FROM course c
      INNER JOIN weight_groups wg ON wg."courseId" = c.id
      LEFT JOIN ordered_scores os ON os."courseId" = wg."courseId"
          AND os."CLOId" = wg."CLOId"
          AND os."PLOId" = wg."PLOId"
      LEFT JOIN "CLO" clo ON wg."CLOId" = clo.id
      LEFT JOIN "PLO" plo ON wg."PLOId" = plo.id
      WHERE c."programId" = ${params.programId} AND c."semesterNum" = ${params.semesterNum}
      GROUP BY c.id;
    `;

  const result = await ctx.db.sequelize.query(sql);

  ctx.body = result[0];
  await next();
};
