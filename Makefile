build:
	jlpm build

run:
	jlpm build && jupyter lab

watch:
	jlpm run watch

delete:
	rm -rf node_modules
	rm -rf .yarn
	rm -rf lib
	rm -f tsconfig.tsbuildinfo

# ensures tasks are always executed
.PHONY: build run watch delete