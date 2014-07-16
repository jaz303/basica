var basica = require('../');
var Console = require('echo-chamber');

window.init = function() {
	basica(document.querySelector('#console'), {
		capabilities: Modernizr
	});
}