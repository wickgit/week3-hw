import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';

import { db } from '../db.js';
import { signToken } from '../auth/jwt.js';
import { requireUser } from './context.js';

function conflict(message) {
  return new GraphQLError(message, { extensions: { code: 'CONFLICT', http: { status: 409 } } });
}

function notFound(message) {
  return new GraphQLError(message, { extensions: { code: 'NOT_FOUND', http: { status: 404 } } });
}

function badRequest(message) {
  return new GraphQLError(message, { extensions: { code: 'BAD_REQUEST', http: { status: 400 } } });
}

async function mustExist(table, id, label) {
  const row = await db(table).where({ id }).first();
  if (!row) throw notFound(`${label} with id ${id} not found`);
  return row;
}

const isUnique = (err) => err?.code === '23505';

function searchList(table, columns, q) {
  const query = db(table).select('*').orderBy('id');
  if (q) {
    query.where((b) => {
      columns.forEach((col, i) =>
        i === 0 ? b.whereILike(col, `%${q}%`) : b.orWhereILike(col, `%${q}%`),
      );
    });
  }
  return query;
}

export const resolvers = {
  Query: {
    schools: (_p, { q }, ctx) => (requireUser(ctx), searchList('schools', ['name', 'city'], q)),
    school: (_p, { id }, ctx) => (requireUser(ctx), ctx.loaders.school.load(id)),
    courses: (_p, { schoolId, q }, ctx) => {
      requireUser(ctx);
      const query = searchList('courses', ['title', 'subject'], q);
      if (schoolId) query.where({ school_id: schoolId });
      return query;
    },
    course: (_p, { id }, ctx) => (requireUser(ctx), ctx.loaders.course.load(id)),
    students: (_p, { schoolId, q }, ctx) => {
      requireUser(ctx);
      const query = searchList('students', ['full_name', 'email'], q);
      if (schoolId) query.where({ school_id: schoolId });
      return query;
    },
    student: (_p, { id }, ctx) => (requireUser(ctx), ctx.loaders.student.load(id)),
    enrollments: (_p, { studentId, courseId }, ctx) => {
      requireUser(ctx);
      const query = db('enrollments').select('*').orderBy('id');
      if (studentId) query.where({ student_id: studentId });
      if (courseId) query.where({ course_id: courseId });
      return query;
    },
  },

  Mutation: {
    login: async (_p, { email, password }) => {
      const user = await db('users').where({ email }).first();
      const ok = user && (await bcrypt.compare(password, user.password_hash));
      if (!ok) {
        throw new GraphQLError('Invalid email or password', {
          extensions: { code: 'INVALID_CREDENTIALS', http: { status: 401 } },
        });
      }
      return { token: signToken(user), user: { id: user.id, email: user.email, role: user.role } };
    },

    createSchool: async (_p, { name, city }, ctx) => {
      requireUser(ctx);
      try {
        const [school] = await db('schools').insert({ name, city: city ?? null }).returning('*');
        return school;
      } catch (err) {
        if (isUnique(err)) throw conflict(`School "${name}" already exists in ${city ?? 'this city'}`);
        throw err;
      }
    },

    createCourse: async (_p, { schoolId, title, subject, credits }, ctx) => {
      requireUser(ctx);
      await mustExist('schools', schoolId, 'School');
      const [course] = await db('courses')
        .insert({ school_id: schoolId, title, subject: subject ?? null, credits: credits ?? 0 })
        .returning('*');
      return course;
    },

    createStudent: async (_p, { schoolId, fullName, email }, ctx) => {
      requireUser(ctx);
      await mustExist('schools', schoolId, 'School');
      try {
        const [student] = await db('students')
          .insert({ school_id: schoolId, full_name: fullName, email })
          .returning('*');
        return student;
      } catch (err) {
        if (isUnique(err)) throw conflict(`Student with email ${email} already exists in this school`);
        throw err;
      }
    },

    createEnrollment: async (_p, { studentId, courseId, status }, ctx) => {
      requireUser(ctx);
      const student = await mustExist('students', studentId, 'Student');
      const course = await mustExist('courses', courseId, 'Course');
      if (student.school_id !== course.school_id) {
        throw badRequest('Student and course belong to different schools');
      }
      try {
        const [enrollment] = await db('enrollments')
          .insert({ student_id: studentId, course_id: courseId, status: status ?? 'active' })
          .returning('*');
        return enrollment;
      } catch (err) {
        if (isUnique(err)) throw conflict('Student is already enrolled in this course');
        throw err;
      }
    },
  },

  School: {
    courses: (school, _a, ctx) => ctx.loaders.coursesBySchool.load(school.id),
    students: (school, _a, ctx) => ctx.loaders.studentsBySchool.load(school.id),
  },

  Course: {
    school: (course, _a, ctx) => ctx.loaders.school.load(course.school_id),
    enrollments: (course, _a, ctx) => ctx.loaders.enrollmentsByCourse.load(course.id),
  },

  Student: {
    school: (student, _a, ctx) => ctx.loaders.school.load(student.school_id),
    enrollments: (student, _a, ctx) => ctx.loaders.enrollmentsByStudent.load(student.id),
  },

  Enrollment: {
    student: (enrollment, _a, ctx) => ctx.loaders.student.load(enrollment.student_id),
    course: (enrollment, _a, ctx) => ctx.loaders.course.load(enrollment.course_id),
  },
};
