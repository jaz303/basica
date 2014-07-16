module.exports = Machine;

var Console         = require('echo-chamber');
var parser          = require('./parser');
var builtins        = require('./builtins');
var Program         = require('./Program');
var VERSION         = require('../package.json').version;

var USER            = 1,
    FUNCTION        = 2,
    COMMAND         = 3;

var E               = require('./errors');
var SYNTAX_ERROR    = E.SYNTAX_ERROR;
var TYPE_MISMATCH   = E.TYPE_MISMATCH;

function Machine(el, opts) {

    var opts = opts || {};

    opts.prompt = false;
    opts.handler = this.evaluate.bind(this);
    opts.cancel = this.cancel.bind(this);
    opts.greeting = " Curious Chip presents\n\n BASICA " + VERSION + "\n";

    this.console = new Console(el, opts);

    this.running = false;
    this.pc = -1;

    this.reset();
    this.newCommand();

}

Machine.prototype.evaluate = function(konsole, command) {
    
    if (command.match(/^\s*$/)) {
        konsole.newline();
        return;
    }

    try {
        
        var parsed = parser.parse(command + "\n", {startRule: "Line"});

        if (parsed.line !== null) {
            this.program.insertLine(parsed.line, parsed.statements);
            konsole.newline();
        } else {
            this.evalStatements(parsed.statements);
            if (!this.running) {
                this.newCommand();  
            }
        }

    } catch (e) {
        this.printError(E.SYNTAX_ERROR);
        this.newCommand();
        console.log(e);
    }

}

Machine.prototype.cancel = function(konsole) {
    if (this.running) {
        this.running = false;
        this.console.print("** BREAK **");
    }
}

Machine.prototype.reset = function() {
    this.program = new Program();
    this.symbols = {};
    this.types = {};

    builtins(this);
}

Machine.prototype.jump = function(line) {

    if (this.program.dirty) {
        this.program.reindex();
    }

    if (line === 0) {
        this.pc = 0;
    } else {
        this.pc = this.program.indexOfLine(line);
    }

    this.jumped = true;

    if (!this.running) {
        this.start();
    }
    
}

Machine.prototype.start = function() {

    if (this.running) {
        return;
    }

    this.running = true;

    var self = this;

    var _tick = function() {

        if (!this.running) {
            this.newCommand();
            return;
        }

        this.jumped = false;

        var stmts = this.program.getLineAtIndex(this.pc++);
        if (!stmts) {
            this.running = false;
        } else {
            this.evalStatements(stmts);
        }

        setTimeout(_tick, 0);

    }.bind(this);

    setTimeout(_tick, 0);

}

Machine.prototype.function = function(name, fn, vararg) {
    fn.vararg = !!vararg;
    this.symbols[name] = fn;
    this.types[name] = FUNCTION;
}

Machine.prototype.command = function(name, fn, vararg) {
    fn.vararg = !!vararg;
    this.symbols[name] = fn;
    this.types[name] = COMMAND;
}

Machine.prototype.evalStatements = function(stmts) {
    try {
        for (var i = 0; i < stmts.length; ++i) {
            this.evalStatement(stmts[i]);
            if (this.jumped) {
                return;
            }
        }
    } catch (e) {
        if (e === E.SYNTAX_ERROR || e === E.TYPE_MISMATCH || e === E.NO_SUCH_LINE) {
            this.printError(e);
        } else {
            throw e;
        }
    }
}

Machine.prototype.evalStatement = function(stmt) {
    switch (stmt.type) {
        case 'command':
            var name = stmt.name;
            if (this.types[name] !== COMMAND) {
                throw SYNTAX_ERROR;
            }
            var cmd = this.symbols[name];
            var args = stmt.args.map(function(a) {
                return this.evalExpression(a);
            }, this);
            if (!cmd.vararg && args.length !== cmd.length) {
                throw SYNTAX_ERROR;
            }
            cmd.apply(this, args);
            break;
        case 'assign':
            var sym = stmt.left.name;
            var type = this.types[sym];
            if (type === USER || !type) {
                var val = this.evalExpression(stmt.right);
                var tag = sym.charAt(sym.length-1);
                if (tag === '$' && typeof val !== 'string') {
                    throw TYPE_MISMATCH;
                } else if (tag === '%') {
                    if (typeof val !== 'number') {
                        throw TYPE_MISMATCH;
                    }
                    val |= 0;
                }
                this.symbols[sym] = val;
                if (!type) this.types[sym] = USER;
            } else {
                throw SYNTAX_ERROR;
            }
            break;
    }
}

Machine.prototype.evalExpression = function(exp) {
    if (typeof exp === 'number' || typeof exp === 'string') {
        return exp;
    } else if (exp.type === 'ident') {
        var name = exp.name;
        var type = this.types[name];
        if (type === FUNCTION) {
            return this.symbols[name].call(this);
        } else if (type === USER) {
            return this.symbols[name];
        } else if (!type) {
            return (name.charAt(name.length - 1) === '$') ? '' : 0;
        } else {
            throw SYNTAX_ERROR;
        }
    } else if (exp.type === 'call') {
        var name = exp.name;
        var type = this.types[name];
        if (type !== FUNCTION) {
            throw SYNTAX_ERROR;
        }
        return this.symbols[name].apply(this, exp.args.map(function(a) {
            return this.evalExpression(a);
        }, this));
    }
}

Machine.prototype.printError = function(err) {
    this.console.print(this._errorMessageForError(err));
}

Machine.prototype._errorMessageForError = function(err) {
    if (err === E.SYNTAX_ERROR) {
        return "Syntax error";
    } else if (err === E.TYPE_MISMATCH) {
        return "Type mismatch";
    } else if (err === E.NO_SUCH_LINE) {
        return "Line does not exist";
    }
}

Machine.prototype.newCommand = function() {
    this.console.print("Ready");
    this.console.newline();
}