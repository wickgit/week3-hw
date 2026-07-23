export const typeDefs = `#graphql
  type School {
    id: Int!
    name: String!
    city: String
    courses: [Course!]!
    students: [Student!]!
  }

  type Course {
    id: Int!
    title: String!
    subject: String
    credits: Int!
    school: School!
    enrollments: [Enrollment!]!
  }

  type Student {
    id: Int!
    full_name: String!
    email: String!
    school: School!
    enrollments: [Enrollment!]!
  }

  type Enrollment {
    id: Int!
    status: String!
    grade: String
    student: Student!
    course: Course!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type User {
    id: Int!
    email: String!
    role: String!
  }

  type Query {
    schools(q: String): [School!]!
    school(id: Int!): School
    courses(schoolId: Int, q: String): [Course!]!
    course(id: Int!): Course
    students(schoolId: Int, q: String): [Student!]!
    student(id: Int!): Student
    enrollments(studentId: Int, courseId: Int): [Enrollment!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    createSchool(name: String!, city: String): School!
    createCourse(schoolId: Int!, title: String!, subject: String, credits: Int): Course!
    createStudent(schoolId: Int!, fullName: String!, email: String!): Student!
    createEnrollment(studentId: Int!, courseId: Int!, status: String): Enrollment!
  }
`;
