.PHONY: setup test lint format verify build clean

setup:
	@echo "Fetching Maia weights..."
	bash scripts/fetch-weights.sh
	@echo "Installing Node dependencies..."
	npm install

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

verify:
	npm run lint
	npm run test:coverage
	npm audit --audit-level=high --omit=dev

build:
	bash scripts/fetch-weights.sh
	docker compose build

clean:
	rm -rf coverage/ node_modules/
