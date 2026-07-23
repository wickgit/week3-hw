export async function up(knex) {
  await knex.schema.alterTable('schools', (t) => {
    t.unique(['name', 'city']);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('schools', (t) => {
    t.dropUnique(['name', 'city']);
  });
}
