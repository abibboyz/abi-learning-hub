.PHONY: up down logs reset-db export-db restore-db test-python test-node test-pw test-pw-e2e typecheck-web install config test

# One platform — brings up postgres + internal runners + web
up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

config:
	docker compose config

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

# Playwright track: runner unit/API tests, app-under-test tests, runner typecheck
test-pw:
	cd pw-runner && npm test && npx tsc -p .
	cd pw-app && npm test

# Walks every task solution, every planted wrong solution and every runnable lesson through
# the real gate + Chromium (needs: cd pw-runner && npx playwright install chromium). ~3-5 min.
test-pw-e2e:
	cd pw-runner && npm run test:e2e

test: test-python test-node test-pw typecheck-web

typecheck-web:
	cd web && npx tsc --noEmit

install:
	cd api-python && pip install -r requirements.txt
	cd api-node && npm install
	cd web && npm install
	cd pw-runner && npm ci && npx playwright install chromium
