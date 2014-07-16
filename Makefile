SRC 			:= index.js $(shell find lib *.js) lib/parser.js
BUNDLE_ENTRY	:= app/main.js

dist/bundle.js: $(BUNDLE_ENTRY) $(SRC)
	browserify -o $@ $<

lib/parser.js: lib/grammar.peg
	./node_modules/.bin/pegjs --allowed-start-rules Line $< $@