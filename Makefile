.PHONY: test lint privacy backend-test frontend-test e2e eval load format

PY = backend/.venv/Scripts/python

backend-test:
	cd backend && .venv/Scripts/python -m pytest -q

frontend-test:
	cd frontend && npm test

e2e:
	cd frontend && npx playwright test

test: backend-test frontend-test

lint:
	$(PY) -m ruff check backend tests scripts
	$(PY) -m black --check -q backend tests scripts
	cd frontend && npm run lint && npm run format:check

format:
	$(PY) -m black -q backend tests scripts
	cd frontend && npm run format

privacy:
	./scripts/privacy_scan.sh

eval:
	$(PY) scripts/eval_report.py

load:
	$(PY) tests/load/run_load.py --clinicians 20 --minutes 30 --out docs/evaluation/load_test.md
