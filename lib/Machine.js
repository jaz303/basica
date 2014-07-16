module.exports = Machine;

var Console = require('echo-chamber');
var Parser 	= require('./parser').Parser;
var VERSION = require('../package.json').version;

function Machine(el, opts) {

	var opts = opts || {};

	opts.prompt = false;
	opts.handler = this.evaluate.bind(this);
	opts.greeting = " Curious Chip presents\n\n BASICA " + VERSION + "\n\nReady";

	this.console = new Console(el, opts);

}

Machine.prototype.evaluate = function(konsole, command) {
	konsole.print("EVALUATE!");
	konsole.newline();
}
