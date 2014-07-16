SRC 			:= index.js $(shell find lib *.js) lib/parser.js
BUNDLE_ENTRY	:= app/main.js

dist/bundle.js: $(BUNDLE_ENTRY) $(SRC) package.json
	browserify -o $@ $<

lib/parser.js: lib/grammar.peg
	./node_modules/.bin/pegjs --allowed-start-rules Line $< $@

clean:
	rm -f lib/parser.js
	rm -f dist/bundle.js

.PHONY: clean