// to bypass ACL when lecturer want to take attendance for when they have to substitude other class
export const listSubstituteScheduleHandler = async (ctx: any, next: any) => {
    const user = ctx.auth.user;
    // find all schedule where user is not listed as lectuers or co-lecturers and that the faculty is
    const scheduleRepo = ctx.db.getRepository('schedule');
    const teachingSchedules = await scheduleRepo.find({
        filter: {
            $or: [
                {
                    lecturers: {
                        id: {
                            $ne: user.id
                        }
                    }
                },
                {
                    'co-lecturers': {
                        id: {
                            $ne: user.id
                        }
                    }
                }
            ]
        },
        appends: ['class.program'],
        fields: ['class.program.facultyId']
    });

    const teachingFacultyIds = new Set();
    for (const schedule of teachingSchedules)
        teachingFacultyIds.add(schedule.get('class').get('program').get('facultyId'));
    
    const schedules = await scheduleRepo.find({
        filter: {
            $and: [
                {
                    lecturers: {
                        id: {
                            $ne: user.id
                        }
                    },
                    'co-lecturers': {
                        id: {
                            $ne: user.id
                        }
                    }
                },
                {
                    $or: [
                    ...Array.from(teachingFacultyIds).map((facultyId) => ({
                            class: {
                                program: { facultyId }
                            }
                        }))
                    ]
                },
            ]
        },
        appends: ['course', 'lecturers', 'class']
    });
    ctx.body = schedules;
    await next();
};
