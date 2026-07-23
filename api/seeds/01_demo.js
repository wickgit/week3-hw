import bcrypt from 'bcryptjs';

export async function seed(knex) {
  // RESTART IDENTITY keeps ids deterministic across re-seeds, which the demo
  // scenario and the API tests both rely on.
  await knex.raw(
    'TRUNCATE enrollments, students, courses, schools, users RESTART IDENTITY CASCADE',
  );

  const password_hash = await bcrypt.hash('admin123', 10);
  await knex('users').insert({
    email: 'admin@school.example',
    password_hash,
    role: 'admin',
  });

  const [bright, riverside] = await knex('schools')
    .insert([
      { name: 'Bright Future Academy', city: 'Kyiv' },
      { name: 'Riverside College', city: 'Lviv' },
    ])
    .returning('id');

  const [python, algebra, history] = await knex('courses')
    .insert([
      { school_id: bright.id, title: 'Intro to Python', subject: 'Computer Science', credits: 5 },
      { school_id: bright.id, title: 'Linear Algebra', subject: 'Mathematics', credits: 4 },
      { school_id: riverside.id, title: 'World History', subject: 'History', credits: 3 },
    ])
    .returning('id');

  const [olena, andriy] = await knex('students')
    .insert([
      { school_id: bright.id, full_name: 'Olena Kovalenko', email: 'olena@bright.example' },
      { school_id: bright.id, full_name: 'Andriy Shevchenko', email: 'andriy@bright.example' },
    ])
    .returning('id');

  await knex('enrollments').insert([
    { student_id: olena.id, course_id: python.id, status: 'active' },
    { student_id: olena.id, course_id: algebra.id, status: 'active' },
    { student_id: andriy.id, course_id: python.id, status: 'completed', grade: 'A' },
  ]);
}
