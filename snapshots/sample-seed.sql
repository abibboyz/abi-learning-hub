-- Sample SQL snapshot of demo seed tables (human-readable reference).
-- Prefer scripts/export-db.sh for binary dumps of a live lab DB.

-- Authors 1:N Books
CREATE TABLE IF NOT EXISTS demo_authors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS demo_books (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  author_id INTEGER NOT NULL REFERENCES demo_authors(id) ON DELETE CASCADE,
  published_year INTEGER
);

-- Users 1:1 Profiles
CREATE TABLE IF NOT EXISTS demo_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(200) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES demo_users(id) ON DELETE CASCADE,
  bio TEXT,
  avatar_url VARCHAR(300)
);

-- Students M:N Courses via association
CREATE TABLE IF NOT EXISTS demo_students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_courses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  credits INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS demo_enrollments (
  student_id INTEGER NOT NULL REFERENCES demo_students(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES demo_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, course_id)
);

-- Self-referential employees
CREATE TABLE IF NOT EXISTS demo_employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  manager_id INTEGER REFERENCES demo_employees(id) ON DELETE SET NULL
);
