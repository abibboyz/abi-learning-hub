.PHONY: up down logs reset-db export-db restore-db test-python test-node typecheck-web install

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

reset-db:
	docker compose exec postgres psql -U hub -d learning_hub -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	docker compose restart api-python api-node

export-db:
	./scripts/export-db.sh

restore-db:
	./scripts/restore-db.sh $(FILE)

test-python:
	cd api-python && python -m pytest -q

test-node:
	cd api-node && npm test

typecheck-web:
	cd web && npx tsc --noEmit

install:
	cd api-python && pip install -r requirements.txt
	cd api-node && npm install
	cd web && npm install
