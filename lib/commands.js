exports["GOTO"] = function(line) {
	this.jump(line);
}

exports["LIST"] = function() {

}

exports["NEW"] = function() {

}

exports["PRINT"] = function(str) {
	this.console.print(str);
}

exports["PRINT"].vararg = true;

exports["RUN"] = function() {
	
}