export async function up(knex) {
  await knex.schema.createTable('schools', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('city');
    t.timestamps(true, true);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('schools');
}
