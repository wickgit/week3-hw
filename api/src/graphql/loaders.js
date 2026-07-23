import DataLoader from 'dataloader';

import { db } from '../db.js';

// DataLoader collects the ids requested during one tick, then this runs a single
// `where in` query and returns rows in the same order it was asked for them.
function byId(table) {
  return async (ids) => {
    const rows = await db(table).whereIn('id', ids);
    const map = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => map.get(id) ?? null);
  };
}

function childrenBy(table, column) {
  return async (parentIds) => {
    const rows = await db(table).whereIn(column, parentIds).orderBy('id');
    const grouped = new Map(parentIds.map((id) => [id, []]));
    for (const row of rows) {
      grouped.get(row[column])?.push(row);
    }
    return parentIds.map((id) => grouped.get(id));
  };
}

// A fresh set per request: batching windows and caching must not leak between
// clients or across mutations.
export function createLoaders() {
  return {
    school: new DataLoader(byId('schools')),
    course: new DataLoader(byId('courses')),
    student: new DataLoader(byId('students')),
    coursesBySchool: new DataLoader(childrenBy('courses', 'school_id')),
    studentsBySchool: new DataLoader(childrenBy('students', 'school_id')),
    enrollmentsByStudent: new DataLoader(childrenBy('enrollments', 'student_id')),
    enrollmentsByCourse: new DataLoader(childrenBy('enrollments', 'course_id')),
  };
}
