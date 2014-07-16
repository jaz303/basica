exports["LOWER$"] = function(str) {
	return ('' + str).toLowerCase();
}

exports["MAX"] = function() {
	return Math.max.apply(null, arguments);
}

exports["MAX"].vararg = true;

exports["MID$"] = function(str, start, len) {
	return str.substring(start, len);
}

exports["MIN"] = function() {
	return Math.min.apply(null, arguments);
}

exports["MIN"].vararg = true;

exports["PI"] = function() {
	return Math.PI;
}

exports["RND"] = function() {
	return Math.random();
}

exports["SGN"] = function(x) {
	return (x < 0) ? -1 : (x > 0 ? 1 : 0);
}

exports["SQR"] = function(x) {
	return Math.sqrt(x);
}

exports["STR$"] = function(x) {
	return '' + x;
}

exports["UPPER$"] = function(str) {
	return ('' + str).toUpperCase();
}