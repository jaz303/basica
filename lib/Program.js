module.exports = Program;

var E = require('./errors');

var splice = Array.prototype.splice;

function Program() {
    this.numbers = [];
    this.statements = [];
    this.lineMax = -1;
    this.index = null;
    this.dirty = true;
}

Program.prototype.insertLine = function(number, statements) {
    this.dirty = true;
    if (number > this.lineMax) {
        this._insertLineAtIndex(this.statements.length, 0, number, statements);
        this.lineMax = number;
    } else {
        var i = 0, remove = 0;
        while (i < this.numbers.length) {
            if (this.numbers[i] === number) {
                var j = i + 1;
                while (j < this.numbers.length && this.numbers[j] === null) ++j;
                remove = j - i;
                break;
            } else if (number < this.numbers[i]) {
                break;
            }
            i++;
        }
        this._insertLineAtIndex(i, remove, number, statements);
    }

    console.log(this);
}

Program.prototype._insertLineAtIndex = function(ix, remove, lineNumber, statements) {

    var numbers = statements.map(function(s) { return null; });
    numbers[0] = lineNumber;
    splice.apply(this.numbers, [ix, remove].concat(numbers));

    splice.apply(this.statements, [ix, remove].concat(statements));

}

Program.prototype.indexOfLine = function(line) {
    var ix = this.index[line];
    if (typeof ix !== 'number') {
        throw E.NO_SUCH_LINE;
    }
    return ix;
}

Program.prototype.getStatementAtIndex = function(index) {
    return this.statements[index];
}

Program.prototype.reindex = function() {

    this.index = {};
    this.numbers.forEach(function(ln, ix) {
        if (ln) this.index[ln] = ix;
    }, this);

    this.dirty = false;

}