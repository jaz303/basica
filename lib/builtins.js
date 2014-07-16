var E = require('./errors');

module.exports = function(vm) {

	vm.command("GOTO", function(line) {
		if (typeof line !== 'number')
			throw E.SYNTAX_ERROR;
		this.jump(line);
	});

	vm.command("LIST", function() {
		
	});

	vm.function("LOWER$", function(str) {
		return ('' + str).toLowerCase();
	});

	vm.function("MAX", function() {
		return Math.max.apply(null, arguments);
	}, true);

	vm.function("MID$", function(str, start, len) {
		return str.substring(start, len);
	});

	vm.function("MIN", function() {
		return Math.min.apply(null, arguments);
	}, true)

	vm.command("NEW", function() {
		this.reset();
	});

	vm.function("PI", function() {
		return Math.PI;
	});

	vm.function("RND", function() {
		return Math.random();
	});

	vm.command("PRINT", function(str) {
		if (arguments.length === 0) {
			this.console.print('');
		} else if (typeof str === 'number') {
			this.console.print(' ' + str);
		} else {
			this.console.print(str);	
		}
	}, true);

	vm.function("SGN", function(x) {
		return (x < 0) ? -1 : (x > 0 ? 1 : 0);
	});

	vm.function("SQR", function(x) {
		return Math.sqrt(x);
	});

	vm.function("STR$", function(x) {
		return '' + x;
	});

	vm.function("UPPER$", function(str) {
		return ('' + str).toUpperCase();
	});

	vm.command("RUN", function() {
		this.jump(0);
	});

}