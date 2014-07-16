module.exports = basica;

var Machine = require('./lib/Machine');

function basica(el, opts) {
	return new Machine(el, opts);
}