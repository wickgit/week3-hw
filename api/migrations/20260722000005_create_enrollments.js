export async function up(knex) {
  await knex.schema.createTable('enrollments', (t) => {
    t.increments('id').primary();
    t.integer('student_id').notNullable().references('id').inTable('students').onDelete('CASCADE');
    t.integer('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    t.string('status').notNullable().defaultTo('active');
    t.string('grade');
    t.timestamp('enrolled_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['student_id', 'course_id']);
    t.index('student_id');
    t.index('course_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('enrollments');
}
