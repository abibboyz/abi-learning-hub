"""Reference + wrong solutions for the database tracks (python-sqlalchemy, node-typescript, node-javascript).

Each wrong solution lists the gate rule ids it must fail with. scripts/gen_db_tracks.py writes these into the
task/lesson JSON; api-python and api-node tests walk them against a real Postgres.
"""

PY_HEAD = '''from sqlalchemy import String, Integer, Numeric, Boolean, ForeignKey, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass

'''
PY_TAIL = '''
engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)
'''


def py(body: str, tail: str = PY_TAIL) -> str:
    return PY_HEAD + body.strip("\n") + "\n" + tail


PRISMA_JS_NOTE = "// JavaScript track — same Prisma schema DSL; Zod validates inputs at the JS boundary.\n"


# ----------------------------------------------------------------------------- python tasks

PY_TASKS = {
    "rel-01-create-connect": {
        "solution": py('''
class LabAuthor(Base):
    __tablename__ = "lab_authors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    books: Mapped[list["LabBook"]] = relationship(back_populates="author")


class LabBook(Base):
    __tablename__ = "lab_books"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    author_id: Mapped[int] = mapped_column(ForeignKey("lab_authors.id"))
    author: Mapped["LabAuthor"] = relationship(back_populates="books")
'''),
        "wrong": [
            {"label": "author_id is a plain integer (no ForeignKey)", "expect": ["not-foreign-key"], "code": py('''
class LabAuthor(Base):
    __tablename__ = "lab_authors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabBook(Base):
    __tablename__ = "lab_books"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    author_id: Mapped[int] = mapped_column(Integer)
''')},
            {"label": "forgot the books table", "expect": ["missing-table"], "code": py('''
class LabAuthor(Base):
    __tablename__ = "lab_authors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
''')},
        ],
    },
    "rel-02-types-pks": {
        "solution": py('''
from decimal import Decimal


class LabProduct(Base):
    __tablename__ = "lab_products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
'''),
        "wrong": [
            {"label": "price stored as text, in_stock as integer", "expect": ["wrong-type"], "code": py('''
class LabProduct(Base):
    __tablename__ = "lab_products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True)
    price: Mapped[str] = mapped_column(String(20))
    in_stock: Mapped[int] = mapped_column(Integer)
''')},
            {"label": "sku is not unique", "expect": ["not-unique"], "code": py('''
from decimal import Decimal


class LabProduct(Base):
    __tablename__ = "lab_products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(40))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
''')},
        ],
    },
    "rel-03-one-to-many": {
        "solution": py('''
class LabPublisher(Base):
    __tablename__ = "lab_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    magazines: Mapped[list["LabMagazine"]] = relationship(back_populates="publisher")


class LabMagazine(Base):
    __tablename__ = "lab_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    publisher_id: Mapped[int] = mapped_column(ForeignKey("lab_publishers.id"))
    publisher: Mapped["LabPublisher"] = relationship(back_populates="magazines")
'''),
        "wrong": [
            {"label": "FK on the wrong side (publisher points at a magazine)", "expect": ["missing-column"], "code": py('''
class LabMagazine(Base):
    __tablename__ = "lab_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


class LabPublisher(Base):
    __tablename__ = "lab_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    magazine_id: Mapped[int] = mapped_column(ForeignKey("lab_magazines.id"))
''')},
            {"label": "UNIQUE on publisher_id turns 1:N into 1:1", "expect": ["must-not-be-unique"], "code": py('''
class LabPublisher(Base):
    __tablename__ = "lab_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabMagazine(Base):
    __tablename__ = "lab_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    publisher_id: Mapped[int] = mapped_column(ForeignKey("lab_publishers.id"), unique=True)
''')},
        ],
    },
    "rel-04-many-to-one": {
        "solution": py('''
from decimal import Decimal


class LabCustomer(Base):
    __tablename__ = "lab_customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)


class LabOrder(Base):
    __tablename__ = "lab_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    customer_id: Mapped[int] = mapped_column(ForeignKey("lab_customers.id"))
    customer: Mapped["LabCustomer"] = relationship()
'''),
        "wrong": [
            {"label": "customer_id references the wrong table", "expect": ["wrong-fk-target"], "code": py('''
from decimal import Decimal


class LabCustomer(Base):
    __tablename__ = "lab_customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)


class LabOrder(Base):
    __tablename__ = "lab_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    customer_id: Mapped[int] = mapped_column(ForeignKey("lab_orders.id"))
''')},
            {"label": "orders can exist without a customer (nullable FK)", "expect": ["must-be-not-null"], "code": py('''
from decimal import Decimal


class LabCustomer(Base):
    __tablename__ = "lab_customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)


class LabOrder(Base):
    __tablename__ = "lab_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("lab_customers.id"))
''')},
        ],
    },
    "rel-05-one-to-one": {
        "solution": py('''
class LabAccount(Base):
    __tablename__ = "lab_accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    settings: Mapped["LabSettings"] = relationship(back_populates="account", uselist=False)


class LabSettings(Base):
    __tablename__ = "lab_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    theme: Mapped[str] = mapped_column(String(40), default="dark")
    account_id: Mapped[int] = mapped_column(ForeignKey("lab_accounts.id"), unique=True)
    account: Mapped["LabAccount"] = relationship(back_populates="settings")
'''),
        "wrong": [
            {"label": "account_id is a FK but not UNIQUE (that is 1:N)", "expect": ["not-unique"], "code": py('''
class LabAccount(Base):
    __tablename__ = "lab_accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)


class LabSettings(Base):
    __tablename__ = "lab_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    theme: Mapped[str] = mapped_column(String(40), default="dark")
    account_id: Mapped[int] = mapped_column(ForeignKey("lab_accounts.id"))
''')},
        ],
    },
    "rel-06-many-to-many": {
        "solution": py('''
class LabLearner(Base):
    __tablename__ = "lab_learners"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabClass(Base):
    __tablename__ = "lab_classes"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


class LabClassEnrollment(Base):
    __tablename__ = "lab_class_enrollments"
    learner_id: Mapped[int] = mapped_column(ForeignKey("lab_learners.id"), primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("lab_classes.id"), primary_key=True)
'''),
        "wrong": [
            {"label": "junction table without a composite key (duplicates allowed)", "expect": ["missing-composite-key"], "code": py('''
class LabLearner(Base):
    __tablename__ = "lab_learners"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabClass(Base):
    __tablename__ = "lab_classes"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


class LabClassEnrollment(Base):
    __tablename__ = "lab_class_enrollments"
    id: Mapped[int] = mapped_column(primary_key=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("lab_learners.id"))
    class_id: Mapped[int] = mapped_column(ForeignKey("lab_classes.id"))
''')},
            {"label": "only one side has a FK", "expect": ["not-foreign-key"], "code": py('''
class LabLearner(Base):
    __tablename__ = "lab_learners"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabClass(Base):
    __tablename__ = "lab_classes"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


class LabClassEnrollment(Base):
    __tablename__ = "lab_class_enrollments"
    learner_id: Mapped[int] = mapped_column(ForeignKey("lab_learners.id"), primary_key=True)
    class_id: Mapped[int] = mapped_column(Integer, primary_key=True)
''')},
        ],
    },
    "rel-07-self-referential": {
        "solution": py('''
class LabStaff(Base):
    __tablename__ = "lab_staff"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("lab_staff.id"))
    manager: Mapped["LabStaff | None"] = relationship(remote_side=[id], back_populates="reports")
    reports: Mapped[list["LabStaff"]] = relationship(back_populates="manager")
'''),
        "wrong": [
            {"label": "manager_id NOT NULL — the CEO cannot be inserted", "expect": ["must-be-nullable"], "code": py('''
class LabStaff(Base):
    __tablename__ = "lab_staff"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    manager_id: Mapped[int] = mapped_column(ForeignKey("lab_staff.id"))
''')},
        ],
    },
    "rel-08-cascades-loading": {
        "solution": py('''
class LabCategory(Base):
    __tablename__ = "lab_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    items: Mapped[list["LabItem"]] = relationship(
        back_populates="category", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin"
    )


class LabItem(Base):
    __tablename__ = "lab_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(120))
    category_id: Mapped[int] = mapped_column(ForeignKey("lab_categories.id", ondelete="CASCADE"))
    category: Mapped["LabCategory"] = relationship(back_populates="items")
'''),
        "wrong": [
            {"label": "ORM cascade only — the database FK has no ON DELETE", "expect": ["wrong-on-delete"], "code": py('''
class LabCategory(Base):
    __tablename__ = "lab_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    items: Mapped[list["LabItem"]] = relationship(cascade="all, delete-orphan")


class LabItem(Base):
    __tablename__ = "lab_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(120))
    category_id: Mapped[int] = mapped_column(ForeignKey("lab_categories.id"))
''')},
        ],
    },
    "rel-09-insert-query": {
        "solution": py('''
from sqlalchemy import select
from sqlalchemy.orm import Session


class LabTeam(Base):
    __tablename__ = "lab_teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    players: Mapped[list["LabPlayer"]] = relationship(back_populates="team")


class LabPlayer(Base):
    __tablename__ = "lab_players"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    team_id: Mapped[int] = mapped_column(ForeignKey("lab_teams.id"))
    team: Mapped["LabTeam"] = relationship(back_populates="players")
''', tail='''
engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)

with Session(engine) as session:
    reds = LabTeam(name="Reds", players=[LabPlayer(name="Ana"), LabPlayer(name="Ben")])
    blues = LabTeam(name="Blues", players=[LabPlayer(name="Chen")])
    session.add_all([reds, blues])
    session.commit()

    rows = session.execute(
        select(LabPlayer.name, LabTeam.name).join(LabPlayer.team).order_by(LabPlayer.name)
    ).all()
    print(rows)
'''),
        "wrong": [
            {"label": "creates the tables but never inserts rows", "expect": ["missing-data"], "code": py('''
class LabTeam(Base):
    __tablename__ = "lab_teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabPlayer(Base):
    __tablename__ = "lab_players"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    team_id: Mapped[int] = mapped_column(ForeignKey("lab_teams.id"))
''')},
            {"label": "adds rows but forgets to commit", "expect": ["missing-data"], "code": py('''
from sqlalchemy.orm import Session


class LabTeam(Base):
    __tablename__ = "lab_teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    players: Mapped[list["LabPlayer"]] = relationship()


class LabPlayer(Base):
    __tablename__ = "lab_players"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    team_id: Mapped[int] = mapped_column(ForeignKey("lab_teams.id"))
''', tail='''
engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)

with Session(engine) as session:
    session.add(LabTeam(name="Reds", players=[LabPlayer(name="Ana"), LabPlayer(name="Ben")]))
    session.flush()
''')},
        ],
    },
    "rel-10-mini-domain": {
        "solution": py('''
class LabBlogger(Base):
    __tablename__ = "lab_bloggers"
    id: Mapped[int] = mapped_column(primary_key=True)
    handle: Mapped[str] = mapped_column(String(60), unique=True)
    posts: Mapped[list["LabPost"]] = relationship(back_populates="blogger")


class LabPost(Base):
    __tablename__ = "lab_posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    blogger_id: Mapped[int] = mapped_column(ForeignKey("lab_bloggers.id"))
    blogger: Mapped["LabBlogger"] = relationship(back_populates="posts")


class LabTag(Base):
    __tablename__ = "lab_tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(60), unique=True)


class LabPostTag(Base):
    __tablename__ = "lab_post_tags"
    post_id: Mapped[int] = mapped_column(ForeignKey("lab_posts.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("lab_tags.id", ondelete="CASCADE"), primary_key=True)
'''),
        "wrong": [
            {"label": "post_tags without a composite key and handle not unique", "expect": ["missing-composite-key", "not-unique"], "code": py('''
class LabBlogger(Base):
    __tablename__ = "lab_bloggers"
    id: Mapped[int] = mapped_column(primary_key=True)
    handle: Mapped[str] = mapped_column(String(60))


class LabPost(Base):
    __tablename__ = "lab_posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    blogger_id: Mapped[int] = mapped_column(ForeignKey("lab_bloggers.id"))


class LabTag(Base):
    __tablename__ = "lab_tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(60), unique=True)


class LabPostTag(Base):
    __tablename__ = "lab_post_tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("lab_posts.id"))
    tag_id: Mapped[int] = mapped_column(ForeignKey("lab_tags.id"))
''')},
        ],
    },
}


# ----------------------------------------------------------------------------- node (Prisma schema DSL)
# node-typescript and node-javascript share the DSL; the JS track prefixes PRISMA_JS_NOTE.

NODE_TASKS = {
    "rel-01-create-connect": {
        "starter": '''// Declare two models mapped to lab_authors and lab_books.
model LabAuthor {
  id   Int    @id @default(autoincrement())
  name String
  // TODO: books LabBook[]
  @@map("lab_authors")
}

// TODO: model LabBook — id, title, authorId (@map("author_id")) + @relation to LabAuthor, @@map("lab_books")
''',
        "solution": '''model LabAuthor {
  id    Int       @id @default(autoincrement())
  name  String
  books LabBook[]
  @@map("lab_authors")
}

model LabBook {
  id       Int       @id @default(autoincrement())
  title    String
  authorId Int       @map("author_id")
  author   LabAuthor @relation(fields: [authorId], references: [id])
  @@map("lab_books")
}
''',
        "wrong": [
            {"label": "authorId without @relation (no FK)", "expect": ["not-foreign-key"], "code": '''model LabAuthor {
  id   Int    @id @default(autoincrement())
  name String
  @@map("lab_authors")
}

model LabBook {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int    @map("author_id")
  @@map("lab_books")
}
'''},
            {"label": "forgot @@map on the book model", "expect": ["rejected"], "code": '''model LabAuthor {
  id   Int    @id @default(autoincrement())
  name String
  @@map("lab_authors")
}

model LabBook {
  id       Int       @id @default(autoincrement())
  title    String
  authorId Int       @map("author_id")
  author   LabAuthor @relation(fields: [authorId], references: [id])
}
'''},
        ],
    },
    "rel-02-types-pks": {
        "starter": '''model LabProduct {
  id Int @id @default(autoincrement())
  // TODO: sku (unique String), price (Decimal), inStock (Boolean, @map("in_stock"))
  @@map("lab_products")
}
''',
        "solution": '''model LabProduct {
  id      Int     @id @default(autoincrement())
  sku     String  @unique
  price   Decimal @db.Decimal(10, 2)
  inStock Boolean @default(true) @map("in_stock")
  @@map("lab_products")
}
''',
        "wrong": [
            {"label": "price as Float, inStock as Int", "expect": ["wrong-type"], "code": '''model LabProduct {
  id      Int    @id @default(autoincrement())
  sku     String @unique
  price   Float
  inStock Int    @map("in_stock")
  @@map("lab_products")
}
'''},
            {"label": "sku not @unique", "expect": ["not-unique"], "code": '''model LabProduct {
  id      Int     @id @default(autoincrement())
  sku     String
  price   Decimal
  inStock Boolean @default(true) @map("in_stock")
  @@map("lab_products")
}
'''},
        ],
    },
    "rel-03-one-to-many": {
        "starter": '''model LabPublisher {
  id   Int    @id @default(autoincrement())
  name String
  // TODO: magazines LabMagazine[]
  @@map("lab_publishers")
}

model LabMagazine {
  id    Int    @id @default(autoincrement())
  title String
  // TODO: publisherId (@map("publisher_id")) + publisher @relation(...)
  @@map("lab_magazines")
}
''',
        "solution": '''model LabPublisher {
  id        Int           @id @default(autoincrement())
  name      String
  magazines LabMagazine[]
  @@map("lab_publishers")
}

model LabMagazine {
  id          Int          @id @default(autoincrement())
  title       String
  publisherId Int          @map("publisher_id")
  publisher   LabPublisher @relation(fields: [publisherId], references: [id])
  @@map("lab_magazines")
}
''',
        "wrong": [
            {"label": "@unique on publisherId makes it 1:1", "expect": ["must-not-be-unique"], "code": '''model LabPublisher {
  id       Int          @id @default(autoincrement())
  name     String
  magazine LabMagazine?
  @@map("lab_publishers")
}

model LabMagazine {
  id          Int          @id @default(autoincrement())
  title       String
  publisherId Int          @unique @map("publisher_id")
  publisher   LabPublisher @relation(fields: [publisherId], references: [id])
  @@map("lab_magazines")
}
'''},
        ],
    },
    "rel-04-many-to-one": {
        "starter": '''model LabCustomer {
  id    Int    @id @default(autoincrement())
  email String @unique
  @@map("lab_customers")
}

model LabOrder {
  id    Int     @id @default(autoincrement())
  total Decimal
  // TODO: customerId (@map("customer_id")) + customer @relation(...) — every order has a customer
  @@map("lab_orders")
}
''',
        "solution": '''model LabCustomer {
  id     Int        @id @default(autoincrement())
  email  String     @unique
  orders LabOrder[]
  @@map("lab_customers")
}

model LabOrder {
  id         Int         @id @default(autoincrement())
  total      Decimal
  customerId Int         @map("customer_id")
  customer   LabCustomer @relation(fields: [customerId], references: [id])
  @@map("lab_orders")
}
''',
        "wrong": [
            {"label": "optional customer (Int?) lets orders exist without one", "expect": ["must-be-not-null"], "code": '''model LabCustomer {
  id     Int        @id @default(autoincrement())
  email  String     @unique
  orders LabOrder[]
  @@map("lab_customers")
}

model LabOrder {
  id         Int          @id @default(autoincrement())
  total      Decimal
  customerId Int?         @map("customer_id")
  customer   LabCustomer? @relation(fields: [customerId], references: [id])
  @@map("lab_orders")
}
'''},
        ],
    },
    "rel-05-one-to-one": {
        "starter": '''model LabAccount {
  id       Int    @id @default(autoincrement())
  username String @unique
  // TODO: settings LabSettings?
  @@map("lab_accounts")
}

model LabSettings {
  id    Int    @id @default(autoincrement())
  theme String @default("dark")
  // TODO: accountId — UNIQUE foreign key to LabAccount (@map("account_id"))
  @@map("lab_settings")
}
''',
        "solution": '''model LabAccount {
  id       Int          @id @default(autoincrement())
  username String       @unique
  settings LabSettings?
  @@map("lab_accounts")
}

model LabSettings {
  id        Int        @id @default(autoincrement())
  theme     String     @default("dark")
  accountId Int        @unique @map("account_id")
  account   LabAccount @relation(fields: [accountId], references: [id])
  @@map("lab_settings")
}
''',
        "wrong": [
            {"label": "accountId without @unique (that is 1:N)", "expect": ["not-unique"], "code": '''model LabAccount {
  id       Int           @id @default(autoincrement())
  username String        @unique
  settings LabSettings[]
  @@map("lab_accounts")
}

model LabSettings {
  id        Int        @id @default(autoincrement())
  theme     String     @default("dark")
  accountId Int        @map("account_id")
  account   LabAccount @relation(fields: [accountId], references: [id])
  @@map("lab_settings")
}
'''},
        ],
    },
    "rel-06-many-to-many": {
        "starter": '''model LabLearner {
  id   Int    @id @default(autoincrement())
  name String
  @@map("lab_learners")
}

model LabClass {
  id    Int    @id @default(autoincrement())
  title String
  @@map("lab_classes")
}

// TODO: explicit junction model LabClassEnrollment → lab_class_enrollments
//       learnerId + classId, both @relation, and @@id([learnerId, classId])
''',
        "solution": '''model LabLearner {
  id          Int                  @id @default(autoincrement())
  name        String
  enrollments LabClassEnrollment[]
  @@map("lab_learners")
}

model LabClass {
  id          Int                  @id @default(autoincrement())
  title       String
  enrollments LabClassEnrollment[]
  @@map("lab_classes")
}

model LabClassEnrollment {
  learnerId Int        @map("learner_id")
  classId   Int        @map("class_id")
  learner   LabLearner @relation(fields: [learnerId], references: [id])
  class     LabClass   @relation(fields: [classId], references: [id])
  @@id([learnerId, classId])
  @@map("lab_class_enrollments")
}
''',
        "wrong": [
            {"label": "junction with its own id and no composite key", "expect": ["missing-composite-key"], "code": '''model LabLearner {
  id          Int                  @id @default(autoincrement())
  name        String
  enrollments LabClassEnrollment[]
  @@map("lab_learners")
}

model LabClass {
  id          Int                  @id @default(autoincrement())
  title       String
  enrollments LabClassEnrollment[]
  @@map("lab_classes")
}

model LabClassEnrollment {
  id        Int        @id @default(autoincrement())
  learnerId Int        @map("learner_id")
  classId   Int        @map("class_id")
  learner   LabLearner @relation(fields: [learnerId], references: [id])
  class     LabClass   @relation(fields: [classId], references: [id])
  @@map("lab_class_enrollments")
}
'''},
        ],
    },
    "rel-07-self-referential": {
        "starter": '''model LabStaff {
  id   Int    @id @default(autoincrement())
  name String
  // TODO: managerId Int? (@map("manager_id")), manager + reports with a named relation ("Reports")
  @@map("lab_staff")
}
''',
        "solution": '''model LabStaff {
  id        Int        @id @default(autoincrement())
  name      String
  managerId Int?       @map("manager_id")
  manager   LabStaff?  @relation("Reports", fields: [managerId], references: [id])
  reports   LabStaff[] @relation("Reports")
  @@map("lab_staff")
}
''',
        "wrong": [
            {"label": "managerId required (Int) — the CEO cannot be inserted", "expect": ["must-be-nullable"], "code": '''model LabStaff {
  id        Int        @id @default(autoincrement())
  name      String
  managerId Int        @map("manager_id")
  manager   LabStaff   @relation("Reports", fields: [managerId], references: [id])
  reports   LabStaff[] @relation("Reports")
  @@map("lab_staff")
}
'''},
        ],
    },
    "rel-08-cascades-loading": {
        "starter": '''model LabCategory {
  id    Int       @id @default(autoincrement())
  name  String
  items LabItem[]
  @@map("lab_categories")
}

model LabItem {
  id    Int    @id @default(autoincrement())
  label String
  // TODO: categoryId (@map("category_id")) + category @relation(..., onDelete: Cascade)
  @@map("lab_items")
}
''',
        "solution": '''model LabCategory {
  id    Int       @id @default(autoincrement())
  name  String
  items LabItem[]
  @@map("lab_categories")
}

model LabItem {
  id         Int         @id @default(autoincrement())
  label      String
  categoryId Int         @map("category_id")
  category   LabCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  @@map("lab_items")
}
''',
        "wrong": [
            {"label": "relation without onDelete: Cascade", "expect": ["wrong-on-delete"], "code": '''model LabCategory {
  id    Int       @id @default(autoincrement())
  name  String
  items LabItem[]
  @@map("lab_categories")
}

model LabItem {
  id         Int         @id @default(autoincrement())
  label      String
  categoryId Int         @map("category_id")
  category   LabCategory @relation(fields: [categoryId], references: [id])
  @@map("lab_items")
}
'''},
        ],
    },
    "rel-09-insert-query": {
        "starter": '''model LabTeam {
  id   Int    @id @default(autoincrement())
  name String
  // TODO: players LabPlayer[]
  @@map("lab_teams")
}

// TODO: model LabPlayer — id, name, teamId (@map("team_id")) + team @relation, @@map("lab_players")
''',
        "solution": '''model LabTeam {
  id      Int         @id @default(autoincrement())
  name    String
  players LabPlayer[]
  @@map("lab_teams")
}

model LabPlayer {
  id     Int     @id @default(autoincrement())
  name   String
  teamId Int     @map("team_id")
  team   LabTeam @relation(fields: [teamId], references: [id])
  @@map("lab_players")
}
''',
        "wrong": [
            {"label": "player.teamId is optional — orphan players and an empty INNER JOIN", "expect": ["must-be-not-null"], "code": '''model LabTeam {
  id      Int         @id @default(autoincrement())
  name    String
  players LabPlayer[]
  @@map("lab_teams")
}

model LabPlayer {
  id     Int      @id @default(autoincrement())
  name   String
  teamId Int?     @map("team_id")
  team   LabTeam? @relation(fields: [teamId], references: [id])
  @@map("lab_players")
}
'''},
        ],
    },
    "rel-10-mini-domain": {
        "starter": '''model LabBlogger {
  id     Int    @id @default(autoincrement())
  handle String @unique
  @@map("lab_bloggers")
}

// TODO: LabPost (blogger 1:N posts), LabTag (unique label), LabPostTag junction with @@id([postId, tagId])
''',
        "solution": '''model LabBlogger {
  id     Int       @id @default(autoincrement())
  handle String    @unique
  posts  LabPost[]
  @@map("lab_bloggers")
}

model LabPost {
  id        Int          @id @default(autoincrement())
  title     String
  bloggerId Int          @map("blogger_id")
  blogger   LabBlogger   @relation(fields: [bloggerId], references: [id])
  tags      LabPostTag[]
  @@map("lab_posts")
}

model LabTag {
  id    Int          @id @default(autoincrement())
  label String       @unique
  posts LabPostTag[]
  @@map("lab_tags")
}

model LabPostTag {
  postId Int     @map("post_id")
  tagId  Int     @map("tag_id")
  post   LabPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag    LabTag  @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([postId, tagId])
  @@map("lab_post_tags")
}
''',
        "wrong": [
            {"label": "post tags reference a misspelled model", "expect": ["rejected"], "code": '''model LabBlogger {
  id     Int       @id @default(autoincrement())
  handle String    @unique
  posts  LabPost[]
  @@map("lab_bloggers")
}

model LabPost {
  id        Int        @id @default(autoincrement())
  title     String
  bloggerId Int        @map("blogger_id")
  blogger   LabBlogger @relation(fields: [bloggerId], references: [id])
  @@map("lab_posts")
}

model LabTag {
  id    Int    @id @default(autoincrement())
  label String @unique
  @@map("lab_tags")
}

model LabPostTag {
  postId Int    @map("post_id")
  tagId  Int    @map("tag_id")
  post   LabPots @relation(fields: [postId], references: [id])
  tag    LabTag  @relation(fields: [tagId], references: [id])
  @@id([postId, tagId])
  @@map("lab_post_tags")
}
'''},
            {"label": "handle not unique, no composite key", "expect": ["not-unique", "missing-composite-key"], "code": '''model LabBlogger {
  id     Int       @id @default(autoincrement())
  handle String
  posts  LabPost[]
  @@map("lab_bloggers")
}

model LabPost {
  id        Int          @id @default(autoincrement())
  title     String
  bloggerId Int          @map("blogger_id")
  blogger   LabBlogger   @relation(fields: [bloggerId], references: [id])
  tags      LabPostTag[]
  @@map("lab_posts")
}

model LabTag {
  id    Int          @id @default(autoincrement())
  label String       @unique
  posts LabPostTag[]
  @@map("lab_tags")
}

model LabPostTag {
  id     Int     @id @default(autoincrement())
  postId Int     @map("post_id")
  tagId  Int     @map("tag_id")
  post   LabPost @relation(fields: [postId], references: [id])
  tag    LabTag  @relation(fields: [tagId], references: [id])
  @@map("lab_post_tags")
}
'''},
        ],
    },
}
