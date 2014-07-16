module.exports = Program;

var E = require('./errors');

function Program() {
    this.lines = [];
    this.lineMax = -1;
    this.index = null;
    this.dirty = true;
}

Program.prototype.insertLine = function(number, statements) {
    this.dirty = true;
    if (number > this.lineMax) {
        this.lines.push([number, statements]);
        this.lineMax = number;
    } else if (number === this.lineMax) {
        this.lines[this.lines.length-1][1] = statements;
    } else {
        // TODO: binary search!
        for (var i = 0; i < this.lines.length; ++i) {
            if (number === this.lines[i][0]) {
                this.lines[i][1] = statements;
                break;
            } else if (number < this.lines[i][0]) {
                this.lines.splice(i, 0, [number, statements]);
                break;
            }
        }
    }
}

Program.prototype.indexOfLine = function(line) {
    var ix = this.index[line];
    if (typeof ix !== 'number') {
        throw E.NO_SUCH_LINE;
    }
    return ix;
}

Program.prototype.getLineAtIndex = function(index) {
    var line = this.lines[index];
    return line ? line[1] : null;
}

Program.prototype.reindex = function() {

    this.index = {};
    this.lines.forEach(function(ln, ix) {
        this.index[ln[0]] = ix;
    }, this);

    this.dirty = false;

}