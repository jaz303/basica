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
            // TODO: this is all wrong; needs to be turned into a Program and executed.
            // (so that immediate code can support WHILE, FOR)
            try {
                for (var i = 0; i < parsed.statements.length; ++i) {
                    this.evalStatement(parsed.statements[i]);
                    // if we're running after executing a statement it means
                    // a jump was encountered.
                    if (this.running) {
                        break;
                    }
                }    
            } catch (e) {
                this._handleRuntimeError(e);
            }
            
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

        var batch = 20;

        try {
            while (this.running && batch--) {
                var stmt = this.program.getStatementAtIndex(this.pc++);
                if (!stmt) {
                    this.running = false;
                } else {
                    this.evalStatement(stmt);
                }
            }
        } catch (e) {
            this._handleRuntimeError(e);
            this.running = false;
        }

        if (this.running) {
            setTimeout(_tick, 0);    
        } else {
            this.newCommand();
        }

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
        case 'if':
        	var test = this.evalExpression(stmt.condition);
        	if (typeof test !== 'number') {
        		throw TYPE_MISMATCH;
        	}
        	if (test === 0) {
        		if (stmt.elsePart) {
        			this.evalStatement(stmt.elsePart);
        		}
        	} else {
        		this.evalStatement(stmt.bodyPart);
        	}
        	break;
    }
}

var OPS = {
	'+': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l+r;
	},
	'-': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l-r;
	},
	'/': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l/r;
	},
	'*': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l*r;
	},
	'\\': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return Math.floor(l/r);
	},
	'MOD': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l%r;
	},
	'EXP': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return Math.pow(l, r);
	},
	'AND': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l & r;
	},
	'OR': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l | r;
	},
	'XOR': function(l, r) {
		if (typeof l !== 'number' || typeof r !== 'number') throw TYPE_MISMATCH;
		return l ^ r;
	},
	'<': function(l, r) {
		if (typeof l !== typeof r) throw TYPE_MISMATCH;
		return l < r ? -1 : 0;
	},
	'<=': function(l, r) {
		if (typeof l !== typeof r) throw TYPE_MISMATCH;
		return l <= r ? -1 : 0;
	},
	'>': function(l, r) {
		if (typeof l !== typeof r) throw TYPE_MISMATCH;
		return l > r ? -1 : 0;
	},
	'>=': function(l, r) {
		if (typeof l !== typeof r) throw TYPE_MISMATCH;
		return l < r ? -1 : 0;
	},
	'=': function(l, r) {
		if (typeof l !== typeof r) throw TYPE_MISMATCH;
		return l === r ? -1 : 0;
	},
	'<>': function(l, r) {
		if (typeof l !== typeof r) throw TYPE_MISMATCH;
		return l !== r ? -1 : 0;
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
    } else if (exp.type === 'function-call') {
        var name = exp.name;
        var type = this.types[name];
        if (type !== FUNCTION) {
            throw SYNTAX_ERROR;
        }
        return this.symbols[name].apply(this, exp.args.map(function(a) {
            return this.evalExpression(a);
        }, this));
    } else if (exp.type === 'not') {
    	var val = this.evalExpression(exp.exp);
    	if (typeof val !== 'number') {
    		throw TYPE_MISMATCH;
    	}
    	return ~val;
    } else if (exp.type === 'negate') {
    	var val = this.evalExpression(exp.exp);
    	if (typeof val !== 'number') {
    		throw TYPE_MISMATCH;
    	}
    	return -val;
    } else if (exp.type === 'binary-op') {
    	return OPS[exp.op](
    		this.evalExpression(exp.left),
    		this.evalExpression(exp.right)
    	);
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

Machine.prototype._handleRuntimeError = function(err) {
    if (err === E.SYNTAX_ERROR || err === E.TYPE_MISMATCH || err === E.NO_SUCH_LINE) {
        this.printError(err);
    } else {
        throw err;
    }
}

Machine.prototype.newCommand = function() {
    this.console.print("Ready");
    this.console.newline();
}