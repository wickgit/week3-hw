export async function up(knex) {
  await knex.schema.createTable('courses', (t) => {
    t.increments('id').primary();
    t.integer('school_id').notNullable().references('id').inTable('schools').onDelete('CASCADE');
    t.string('title').notNullable();
    t.string('subject');
    t.integer('credits').notNullable().defaultTo(0);
    t.timestamps(true, true);

    t.index('school_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('courses');
}
