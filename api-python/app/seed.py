"""Pre-seed demo tables covering all major relationship types."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine


SEED_SQL = """
CREATE TABLE IF NOT EXISTS demo_authors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS demo_books (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  author_id INTEGER NOT NULL REFERENCES demo_authors(id) ON DELETE CASCADE,
  published_year INTEGER,
  isbn VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS demo_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(200) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES demo_users(id) ON DELETE CASCADE,
  bio TEXT,
  avatar_url VARCHAR(300)
);

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
  grade VARCHAR(2),
  PRIMARY KEY (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS demo_employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  title VARCHAR(120),
  manager_id INTEGER REFERENCES demo_employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS demo_departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS demo_projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  department_id INTEGER REFERENCES demo_departments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS demo_project_members (
  project_id INTEGER NOT NULL REFERENCES demo_projects(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES demo_employees(id) ON DELETE CASCADE,
  role VARCHAR(80) DEFAULT 'contributor',
  PRIMARY KEY (project_id, employee_id)
);
"""

SEED_DATA = """
INSERT INTO demo_authors (id, name, country)
VALUES (1, 'Ada Lovelace', 'UK'), (2, 'Alan Turing', 'UK')
ON CONFLICT DO NOTHING;

INSERT INTO demo_books (id, title, author_id, published_year, isbn)
VALUES
  (1, 'Notes on the Analytical Engine', 1, 1843, 'ADA-1843'),
  (2, 'Computing Machinery and Intelligence', 2, 1950, 'TUR-1950')
ON CONFLICT DO NOTHING;

INSERT INTO demo_users (id, email)
VALUES (1, 'learner@example.com'), (2, 'mentor@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO demo_profiles (id, user_id, bio)
VALUES (1, 1, 'Curious database learner'), (2, 2, 'ORM guide')
ON CONFLICT DO NOTHING;

INSERT INTO demo_students (id, name)
VALUES (1, 'Sam'), (2, 'Riley'), (3, 'Jordan')
ON CONFLICT DO NOTHING;

INSERT INTO demo_courses (id, title, credits)
VALUES (1, 'Intro to SQL', 3), (2, 'ORM Patterns', 4)
ON CONFLICT DO NOTHING;

INSERT INTO demo_enrollments (student_id, course_id, grade)
VALUES (1, 1, 'A'), (1, 2, 'B'), (2, 1, 'A')
ON CONFLICT DO NOTHING;

INSERT INTO demo_employees (id, name, title, manager_id)
VALUES
  (1, 'Pat', 'CTO', NULL),
  (2, 'Alex', 'Eng Manager', 1),
  (3, 'Casey', 'Engineer', 2)
ON CONFLICT DO NOTHING;

INSERT INTO demo_departments (id, name)
VALUES (1, 'Engineering'), (2, 'Research')
ON CONFLICT DO NOTHING;

INSERT INTO demo_projects (id, name, department_id)
VALUES (1, 'Learning Hub', 1), (2, 'Knowledge Graph', 2)
ON CONFLICT DO NOTHING;

INSERT INTO demo_project_members (project_id, employee_id, role)
VALUES (1, 2, 'lead'), (1, 3, 'contributor'), (2, 1, 'sponsor')
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('demo_authors','id'), (SELECT COALESCE(MAX(id),1) FROM demo_authors));
SELECT setval(pg_get_serial_sequence('demo_books','id'), (SELECT COALESCE(MAX(id),1) FROM demo_books));
SELECT setval(pg_get_serial_sequence('demo_users','id'), (SELECT COALESCE(MAX(id),1) FROM demo_users));
SELECT setval(pg_get_serial_sequence('demo_profiles','id'), (SELECT COALESCE(MAX(id),1) FROM demo_profiles));
SELECT setval(pg_get_serial_sequence('demo_students','id'), (SELECT COALESCE(MAX(id),1) FROM demo_students));
SELECT setval(pg_get_serial_sequence('demo_courses','id'), (SELECT COALESCE(MAX(id),1) FROM demo_courses));
SELECT setval(pg_get_serial_sequence('demo_employees','id'), (SELECT COALESCE(MAX(id),1) FROM demo_employees));
SELECT setval(pg_get_serial_sequence('demo_departments','id'), (SELECT COALESCE(MAX(id),1) FROM demo_departments));
SELECT setval(pg_get_serial_sequence('demo_projects','id'), (SELECT COALESCE(MAX(id),1) FROM demo_projects));
"""


def seed_database(engine: Engine) -> None:
    with engine.begin() as conn:
        for stmt in SEED_SQL.strip().split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
        for stmt in SEED_DATA.strip().split(";"):
            s = stmt.strip()
            if s:
                try:
                    conn.execute(text(s))
                except Exception:
                    # Seed is idempotent-ish; conflict / sequence quirks are fine
                    pass


def reset_to_seed(engine: Engine) -> None:
    """Drop learner lab tables (lab_*) and re-seed demos."""
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public'
                  AND (tablename LIKE 'lab_%' OR tablename LIKE 'task_%')
                """
            )
        ).fetchall()
        for (name,) in rows:
            conn.execute(text(f'DROP TABLE IF EXISTS "{name}" CASCADE'))
    seed_database(engine)
