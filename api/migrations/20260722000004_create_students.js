export async function up(knex) {
  await knex.schema.createTable('students', (t) => {
    t.increments('id').primary();
    t.integer('school_id').notNullable().references('id').inTable('schools').onDelete('CASCADE');
    t.string('full_name').notNullable();
    t.string('email').notNullable();
    t.timestamps(true, true);

    t.unique(['school_id', 'email']);
    t.index('school_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('students');
}
