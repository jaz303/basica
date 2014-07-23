(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var basica = require('../');
var Console = require('echo-chamber');

window.init = function() {
	basica(document.querySelector('#console'), {
		capabilities: Modernizr
	});
}
},{"../":2,"echo-chamber":8}],2:[function(require,module,exports){
module.exports = basica;

var Machine = require('./lib/Machine');

function basica(el, opts) {
	return new Machine(el, opts);
}
},{"./lib/Machine":3}],3:[function(require,module,exports){
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
            for (var i = 0; i < parsed.statements.length; ++i) {
                this.execStatement(parsed.statements[i]);
                // if we're running after executing a statement it means
                // a jump was encountered.
                if (this.running) {
                    break;
                }
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

        while (this.running && batch--) {
            var stmt = this.program.getStatementAtIndex(this.pc++);
            if (!stmt) {
                this.running = false;
            } else {
                this.execStatement(stmt);
            }
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

Machine.prototype.execStatement = function(stmt) {
    try {
        this.evalStatement(stmt);
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

Machine.prototype.newCommand = function() {
    this.console.print("Ready");
    this.console.newline();
}
},{"../package.json":17,"./Program":4,"./builtins":5,"./errors":6,"./parser":7,"echo-chamber":8}],4:[function(require,module,exports){
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
},{"./errors":6}],5:[function(require,module,exports){
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
        return str.substring(start - 1, len);
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
},{"./errors":6}],6:[function(require,module,exports){
exports.SYNTAX_ERROR    = {};
exports.TYPE_MISMATCH   = {};
exports.NO_SUCH_LINE    = {};
},{}],7:[function(require,module,exports){
module.exports = (function() {
  /*
   * Generated by PEG.js 0.8.0.
   *
   * http://pegjs.majda.cz/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function SyntaxError(message, expected, found, offset, line, column) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.offset   = offset;
    this.line     = line;
    this.column   = column;

    this.name     = "SyntaxError";
  }

  peg$subclass(SyntaxError, Error);

  function parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},

        peg$FAILED = {},

        peg$startRuleFunctions = { Line: peg$parseLine },
        peg$startRuleFunction  = peg$parseLine,

        peg$c0 = [],
        peg$c1 = /^[ \t]/,
        peg$c2 = { type: "class", value: "[ \\t]", description: "[ \\t]" },
        peg$c3 = peg$FAILED,
        peg$c4 = /^[1-9]/,
        peg$c5 = { type: "class", value: "[1-9]", description: "[1-9]" },
        peg$c6 = /^[0-9]/,
        peg$c7 = { type: "class", value: "[0-9]", description: "[0-9]" },
        peg$c8 = ".",
        peg$c9 = { type: "literal", value: ".", description: "\".\"" },
        peg$c10 = /^[a-zA-Z]/,
        peg$c11 = { type: "class", value: "[a-zA-Z]", description: "[a-zA-Z]" },
        peg$c12 = /^[a-zA-Z0-9]/,
        peg$c13 = { type: "class", value: "[a-zA-Z0-9]", description: "[a-zA-Z0-9]" },
        peg$c14 = null,
        peg$c15 = "$",
        peg$c16 = { type: "literal", value: "$", description: "\"$\"" },
        peg$c17 = "\n",
        peg$c18 = { type: "literal", value: "\n", description: "\"\\n\"" },
        peg$c19 = function(x) { return x; },
        peg$c20 = function(line, stmts) {
        		return {
        			line: parseInt(line, 10),
        			statements: stmts.statements
        		};
        	},
        peg$c21 = ":",
        peg$c22 = { type: "literal", value: ":", description: "\":\"" },
        peg$c23 = function(head, tail) {
        		return {
        			line: null,
        			statements: [head].concat(tail.map(function(t) { return t[2]; }))
        		};
        	},
        peg$c24 = /^[iI]/,
        peg$c25 = { type: "class", value: "[iI]", description: "[iI]" },
        peg$c26 = /^[fF]/,
        peg$c27 = { type: "class", value: "[fF]", description: "[fF]" },
        peg$c28 = function(exp, b, e) {
        		return { 
        			type: "if",
        			condition: exp,
        			bodyPart: b,
        			elsePart: e || null
        		};
        	},
        peg$c29 = /^[tT]/,
        peg$c30 = { type: "class", value: "[tT]", description: "[tT]" },
        peg$c31 = /^[hH]/,
        peg$c32 = { type: "class", value: "[hH]", description: "[hH]" },
        peg$c33 = /^[eE]/,
        peg$c34 = { type: "class", value: "[eE]", description: "[eE]" },
        peg$c35 = /^[nN]/,
        peg$c36 = { type: "class", value: "[nN]", description: "[nN]" },
        peg$c37 = function(line) { return makeGoto(line); },
        peg$c38 = /^[gG]/,
        peg$c39 = { type: "class", value: "[gG]", description: "[gG]" },
        peg$c40 = /^[oO]/,
        peg$c41 = { type: "class", value: "[oO]", description: "[oO]" },
        peg$c42 = function(stmt) { return stmt; },
        peg$c43 = /^[lL]/,
        peg$c44 = { type: "class", value: "[lL]", description: "[lL]" },
        peg$c45 = /^[sS]/,
        peg$c46 = { type: "class", value: "[sS]", description: "[sS]" },
        peg$c47 = "=",
        peg$c48 = { type: "literal", value: "=", description: "\"=\"" },
        peg$c49 = function(left, right) {
        		return { type: "assign", left: left, right: right };
        	},
        peg$c50 = function(name, args) {
        		return { type: "command", name: name, args: args || [] };
        	},
        peg$c51 = /^[$%]/,
        peg$c52 = { type: "class", value: "[$%]", description: "[$%]" },
        peg$c53 = function(name) {
        		return name.toUpperCase();
        	},
        peg$c54 = ",",
        peg$c55 = { type: "literal", value: ",", description: "\",\"" },
        peg$c56 = function(head, tail) {
        		return [head].concat(tail.map(function(t) { return t[2]; }));
        	},
        peg$c57 = function(head, tail) {
        		return makeBinaryOperator(head, tail, 3);
        	},
        peg$c58 = "<",
        peg$c59 = { type: "literal", value: "<", description: "\"<\"" },
        peg$c60 = "<=",
        peg$c61 = { type: "literal", value: "<=", description: "\"<=\"" },
        peg$c62 = ">",
        peg$c63 = { type: "literal", value: ">", description: "\">\"" },
        peg$c64 = ">=",
        peg$c65 = { type: "literal", value: ">=", description: "\">=\"" },
        peg$c66 = "<>",
        peg$c67 = { type: "literal", value: "<>", description: "\"<>\"" },
        peg$c68 = "OR",
        peg$c69 = { type: "literal", value: "OR", description: "\"OR\"" },
        peg$c70 = "XOR",
        peg$c71 = { type: "literal", value: "XOR", description: "\"XOR\"" },
        peg$c72 = "AND",
        peg$c73 = { type: "literal", value: "AND", description: "\"AND\"" },
        peg$c74 = "+",
        peg$c75 = { type: "literal", value: "+", description: "\"+\"" },
        peg$c76 = "-",
        peg$c77 = { type: "literal", value: "-", description: "\"-\"" },
        peg$c78 = function(head, tail) {
        		return makeBinaryOperator(head, tail, 2);
        	},
        peg$c79 = "*",
        peg$c80 = { type: "literal", value: "*", description: "\"*\"" },
        peg$c81 = function() { return '*'; },
        peg$c82 = "/",
        peg$c83 = { type: "literal", value: "/", description: "\"/\"" },
        peg$c84 = function() { return '/'; },
        peg$c85 = "\\",
        peg$c86 = { type: "literal", value: "\\", description: "\"\\\\\"" },
        peg$c87 = function() { return '\\'; },
        peg$c88 = /^[mM]/,
        peg$c89 = { type: "class", value: "[mM]", description: "[mM]" },
        peg$c90 = /^[dD]/,
        peg$c91 = { type: "class", value: "[dD]", description: "[dD]" },
        peg$c92 = function() { return 'MOD'; },
        peg$c93 = function(exp) {
        		return { type: "not", exp: exp };
        	},
        peg$c94 = function(exp) {
        		return { type: "negate", exp: exp };
        	},
        peg$c95 = /^[xX]/,
        peg$c96 = { type: "class", value: "[xX]", description: "[xX]" },
        peg$c97 = /^[pP]/,
        peg$c98 = { type: "class", value: "[pP]", description: "[pP]" },
        peg$c99 = function() { return 'EXP'; },
        peg$c100 = "(",
        peg$c101 = { type: "literal", value: "(", description: "\"(\"" },
        peg$c102 = ")",
        peg$c103 = { type: "literal", value: ")", description: "\")\"" },
        peg$c104 = function(name, args) {
        		return {
        			type: "function-call",
        			name: name.toUpperCase(),
        			args: args
        		};
        	},
        peg$c105 = function(v) { return v; },
        peg$c106 = function(exp) { return exp; },
        peg$c107 = function(val) { return parseFloat(val); },
        peg$c108 = function(val) { return parseInt(val, 10); },
        peg$c109 = "\"",
        peg$c110 = { type: "literal", value: "\"", description: "\"\\\"\"" },
        peg$c111 = function(str) { return str; },
        peg$c112 = "\\n",
        peg$c113 = { type: "literal", value: "\\n", description: "\"\\\\n\"" },
        peg$c114 = function() { return "\n"; },
        peg$c115 = "\\t",
        peg$c116 = { type: "literal", value: "\\t", description: "\"\\\\t\"" },
        peg$c117 = function() { return "\t"; },
        peg$c118 = "\\\"",
        peg$c119 = { type: "literal", value: "\\\"", description: "\"\\\\\\\"\"" },
        peg$c120 = function() { return '"'; },
        peg$c121 = "\\\\",
        peg$c122 = { type: "literal", value: "\\\\", description: "\"\\\\\\\\\"" },
        peg$c123 = function() { return "\\"; },
        peg$c124 = /^[^"]/,
        peg$c125 = { type: "class", value: "[^\"]", description: "[^\"]" },
        peg$c126 = function(name) {
        		return { "type": "ident", name: name }
        	},

        peg$currPos          = 0,
        peg$reportedPos      = 0,
        peg$cachedPos        = 0,
        peg$cachedPosDetails = { line: 1, column: 1, seenCR: false },
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleFunctions)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
    }

    function text() {
      return input.substring(peg$reportedPos, peg$currPos);
    }

    function offset() {
      return peg$reportedPos;
    }

    function line() {
      return peg$computePosDetails(peg$reportedPos).line;
    }

    function column() {
      return peg$computePosDetails(peg$reportedPos).column;
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        peg$reportedPos
      );
    }

    function error(message) {
      throw peg$buildException(message, null, peg$reportedPos);
    }

    function peg$computePosDetails(pos) {
      function advance(details, startPos, endPos) {
        var p, ch;

        for (p = startPos; p < endPos; p++) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }
        }
      }

      if (peg$cachedPos !== pos) {
        if (peg$cachedPos > pos) {
          peg$cachedPos = 0;
          peg$cachedPosDetails = { line: 1, column: 1, seenCR: false };
        }
        advance(peg$cachedPosDetails, peg$cachedPos, pos);
        peg$cachedPos = pos;
      }

      return peg$cachedPosDetails;
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, pos) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0180-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1080-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      var posDetails = peg$computePosDetails(pos),
          found      = pos < input.length ? input.charAt(pos) : null;

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        pos,
        posDetails.line,
        posDetails.column
      );
    }

    function peg$parse_() {
      var s0, s1;

      s0 = [];
      if (peg$c1.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c2); }
      }
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        if (peg$c1.test(input.charAt(peg$currPos))) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c2); }
        }
      }

      return s0;
    }

    function peg$parse__() {
      var s0, s1;

      s0 = [];
      if (peg$c1.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c2); }
      }
      if (s1 !== peg$FAILED) {
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          if (peg$c1.test(input.charAt(peg$currPos))) {
            s1 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c2); }
          }
        }
      } else {
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsenon_zero_digit() {
      var s0;

      if (peg$c4.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c5); }
      }

      return s0;
    }

    function peg$parsedigit() {
      var s0;

      if (peg$c6.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c7); }
      }

      return s0;
    }

    function peg$parsefloat() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$parsenon_zero_digit();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parsedigit();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parsedigit();
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s4 = peg$c8;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c9); }
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parsedigit();
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$parsedigit();
              }
            } else {
              s5 = peg$c3;
            }
            if (s5 !== peg$FAILED) {
              s2 = [s2, s3, s4, s5];
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$c3;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$c3;
      }
      if (s1 !== peg$FAILED) {
        s1 = input.substring(s0, peg$currPos);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseinteger() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parsedigit();
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parsedigit();
        }
      } else {
        s1 = peg$c3;
      }
      if (s1 !== peg$FAILED) {
        s1 = input.substring(s0, peg$currPos);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsefunction_name() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$currPos;
      if (peg$c10.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c11); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c12.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c13); }
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          if (peg$c12.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c13); }
          }
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 36) {
            s4 = peg$c15;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c16); }
          }
          if (s4 === peg$FAILED) {
            s4 = peg$c14;
          }
          if (s4 !== peg$FAILED) {
            s2 = [s2, s3, s4];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$c3;
      }
      if (s1 !== peg$FAILED) {
        s1 = input.substring(s0, peg$currPos);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseTERM() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$parse_();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 10) {
          s2 = peg$c17;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseLine() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parse_();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseNumberedLine();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseTERM();
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c19(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parse_();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseStatements();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseTERM();
            if (s3 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c19(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      }

      return s0;
    }

    function peg$parseNumberedLine() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parseinteger();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseStatements();
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c20(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseStatements() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parseStatement();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 58) {
          s4 = peg$c21;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c22); }
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parse_();
          if (s5 !== peg$FAILED) {
            s6 = peg$parseStatement();
            if (s6 !== peg$FAILED) {
              s4 = [s4, s5, s6];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 58) {
            s4 = peg$c21;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c22); }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseStatement();
              if (s6 !== peg$FAILED) {
                s4 = [s4, s5, s6];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c23(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseStatement() {
      var s0;

      s0 = peg$parseIfStatement();
      if (s0 === peg$FAILED) {
        s0 = peg$parseAssignStatement();
        if (s0 === peg$FAILED) {
          s0 = peg$parseCommandStatement();
        }
      }

      return s0;
    }

    function peg$parseIfStatement() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      if (peg$c24.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c25); }
      }
      if (s1 !== peg$FAILED) {
        if (peg$c26.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c27); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse__();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseComparisonExpression();
            if (s4 !== peg$FAILED) {
              s5 = peg$parse__();
              if (s5 !== peg$FAILED) {
                s6 = peg$parseConsequentPart();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseElsePart();
                  if (s7 === peg$FAILED) {
                    s7 = peg$c14;
                  }
                  if (s7 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c28(s4, s6, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseConsequentPart() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      if (peg$c29.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c30); }
      }
      if (s1 !== peg$FAILED) {
        if (peg$c31.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c32); }
        }
        if (s2 !== peg$FAILED) {
          if (peg$c33.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c34); }
          }
          if (s3 !== peg$FAILED) {
            if (peg$c35.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c36); }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parse__();
              if (s5 !== peg$FAILED) {
                s6 = peg$parseInteger();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parse_();
                  if (s7 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c37(s6);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (peg$c38.test(input.charAt(peg$currPos))) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c39); }
        }
        if (s1 !== peg$FAILED) {
          if (peg$c40.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c41); }
          }
          if (s2 !== peg$FAILED) {
            if (peg$c29.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c30); }
            }
            if (s3 !== peg$FAILED) {
              if (peg$c40.test(input.charAt(peg$currPos))) {
                s4 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c41); }
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parse__();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parseInteger();
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parse_();
                    if (s7 !== peg$FAILED) {
                      peg$reportedPos = s0;
                      s1 = peg$c37(s6);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$c3;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (peg$c29.test(input.charAt(peg$currPos))) {
            s1 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c30); }
          }
          if (s1 !== peg$FAILED) {
            if (peg$c31.test(input.charAt(peg$currPos))) {
              s2 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c32); }
            }
            if (s2 !== peg$FAILED) {
              if (peg$c33.test(input.charAt(peg$currPos))) {
                s3 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c34); }
              }
              if (s3 !== peg$FAILED) {
                if (peg$c35.test(input.charAt(peg$currPos))) {
                  s4 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s4 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c36); }
                }
                if (s4 !== peg$FAILED) {
                  s5 = peg$parse__();
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parseStatement();
                    if (s6 !== peg$FAILED) {
                      peg$reportedPos = s0;
                      s1 = peg$c42(s6);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$c3;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        }
      }

      return s0;
    }

    function peg$parseElsePart() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      if (peg$c33.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c34); }
      }
      if (s1 !== peg$FAILED) {
        if (peg$c43.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c44); }
        }
        if (s2 !== peg$FAILED) {
          if (peg$c45.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c46); }
          }
          if (s3 !== peg$FAILED) {
            if (peg$c33.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c34); }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parse__();
              if (s5 !== peg$FAILED) {
                s6 = peg$parseInteger();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parse_();
                  if (s7 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c37(s6);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (peg$c33.test(input.charAt(peg$currPos))) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c34); }
        }
        if (s1 !== peg$FAILED) {
          if (peg$c43.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c44); }
          }
          if (s2 !== peg$FAILED) {
            if (peg$c45.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c46); }
            }
            if (s3 !== peg$FAILED) {
              if (peg$c33.test(input.charAt(peg$currPos))) {
                s4 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c34); }
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parse__();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parseStatement();
                  if (s6 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c42(s6);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      }

      return s0;
    }

    function peg$parseAssignStatement() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parseIdent();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 61) {
            s3 = peg$c47;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c48); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseComparisonExpression();
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  peg$reportedPos = s0;
                  s1 = peg$c49(s1, s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseCommandStatement() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parseCommandName();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseArgList();
          if (s3 === peg$FAILED) {
            s3 = peg$c14;
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c50(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseVariableName() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$currPos;
      if (peg$c10.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c11); }
      }
      if (s3 !== peg$FAILED) {
        s4 = [];
        if (peg$c12.test(input.charAt(peg$currPos))) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c13); }
        }
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          if (peg$c12.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c13); }
          }
        }
        if (s4 !== peg$FAILED) {
          if (peg$c51.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c52); }
          }
          if (s5 === peg$FAILED) {
            s5 = peg$c14;
          }
          if (s5 !== peg$FAILED) {
            s3 = [s3, s4, s5];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$c3;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$c3;
      }
      if (s2 !== peg$FAILED) {
        s2 = input.substring(s1, peg$currPos);
      }
      s1 = s2;
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c53(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseCommandName() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$currPos;
      if (peg$c10.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c11); }
      }
      if (s3 !== peg$FAILED) {
        s4 = [];
        if (peg$c12.test(input.charAt(peg$currPos))) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c13); }
        }
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          if (peg$c12.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c13); }
          }
        }
        if (s4 !== peg$FAILED) {
          s3 = [s3, s4];
          s2 = s3;
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$c3;
      }
      if (s2 !== peg$FAILED) {
        s2 = input.substring(s1, peg$currPos);
      }
      s1 = s2;
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c53(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseArgList() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parseComparisonExpression();
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c54;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c55); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseComparisonExpression();
              if (s7 !== peg$FAILED) {
                s8 = peg$parse_();
                if (s8 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$c3;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$c3;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$c3;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$c3;
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c54;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c55); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseComparisonExpression();
                if (s7 !== peg$FAILED) {
                  s8 = peg$parse_();
                  if (s8 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$c3;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$c3;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$c3;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$c3;
            }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c56(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseComparisonExpression() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseBitwiseOrExpression();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          s5 = peg$parseComparisonOp();
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseBitwiseOrExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseComparisonOp();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseBitwiseOrExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$c3;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c57(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseComparisonOp() {
      var s0, s1;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 60) {
        s1 = peg$c58;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c59); }
      }
      if (s1 !== peg$FAILED) {
        s1 = input.substring(s0, peg$currPos);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c60) {
          s1 = peg$c60;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c61); }
        }
        if (s1 !== peg$FAILED) {
          s1 = input.substring(s0, peg$currPos);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 62) {
            s1 = peg$c62;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c63); }
          }
          if (s1 !== peg$FAILED) {
            s1 = input.substring(s0, peg$currPos);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c64) {
              s1 = peg$c64;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c65); }
            }
            if (s1 !== peg$FAILED) {
              s1 = input.substring(s0, peg$currPos);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 2) === peg$c66) {
                s1 = peg$c66;
                peg$currPos += 2;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c67); }
              }
              if (s1 !== peg$FAILED) {
                s1 = input.substring(s0, peg$currPos);
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 61) {
                  s1 = peg$c47;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c48); }
                }
                if (s1 !== peg$FAILED) {
                  s1 = input.substring(s0, peg$currPos);
                }
                s0 = s1;
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parseBitwiseOrExpression() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseBitwiseXorExpression();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c68) {
            s5 = peg$c68;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c69); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseBitwiseXorExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c68) {
              s5 = peg$c68;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c69); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseBitwiseXorExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$c3;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c57(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseBitwiseXorExpression() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseBitwiseAndExpression();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c70) {
            s5 = peg$c70;
            peg$currPos += 3;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c71); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseBitwiseAndExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c70) {
              s5 = peg$c70;
              peg$currPos += 3;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c71); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseBitwiseAndExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$c3;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c57(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseBitwiseAndExpression() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseAdditiveExpression();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c72) {
            s5 = peg$c72;
            peg$currPos += 3;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c73); }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseAdditiveExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c72) {
              s5 = peg$c72;
              peg$currPos += 3;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c73); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseAdditiveExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$c3;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c57(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseAdditiveExpression() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseMultiplicativeExpression();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          s5 = peg$parseAdditiveOp();
          if (s5 !== peg$FAILED) {
            s6 = peg$parse_();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseMultiplicativeExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseAdditiveOp();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseMultiplicativeExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$c3;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c57(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseAdditiveOp() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 43) {
        s0 = peg$c74;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c75); }
      }
      if (s0 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 45) {
          s0 = peg$c76;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c77); }
        }
      }

      return s0;
    }

    function peg$parseMultiplicativeExpression() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parseUnaryExpression();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          s5 = peg$parseMultiplicativeOp();
          if (s5 !== peg$FAILED) {
            s6 = peg$parseUnaryExpression();
            if (s6 !== peg$FAILED) {
              s4 = [s4, s5, s6];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseMultiplicativeOp();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseUnaryExpression();
              if (s6 !== peg$FAILED) {
                s4 = [s4, s5, s6];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c78(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseMultiplicativeOp() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 42) {
        s1 = peg$c79;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c80); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c81();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 47) {
          s1 = peg$c82;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c83); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c84();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c85;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c86); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c87();
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (peg$c88.test(input.charAt(peg$currPos))) {
              s1 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c89); }
            }
            if (s1 !== peg$FAILED) {
              if (peg$c40.test(input.charAt(peg$currPos))) {
                s2 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c41); }
              }
              if (s2 !== peg$FAILED) {
                if (peg$c90.test(input.charAt(peg$currPos))) {
                  s3 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c91); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = peg$parse__();
                  if (s4 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c92();
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          }
        }
      }

      return s0;
    }

    function peg$parseUnaryExpression() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      if (peg$c35.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c36); }
      }
      if (s1 !== peg$FAILED) {
        if (peg$c40.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c41); }
        }
        if (s2 !== peg$FAILED) {
          if (peg$c29.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c30); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseUnaryExpression();
              if (s5 !== peg$FAILED) {
                peg$reportedPos = s0;
                s1 = peg$c93(s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 45) {
          s1 = peg$c76;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c77); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseUnaryExpression();
            if (s3 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c94(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parsePowExpression();
        }
      }

      return s0;
    }

    function peg$parsePowExpression() {
      var s0, s1, s2, s3, s4, s5, s6, s7;

      s0 = peg$currPos;
      s1 = peg$parseFunctionCall();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$parse_();
        if (s4 !== peg$FAILED) {
          s5 = peg$parsePowOp();
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseFunctionCall();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$c3;
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$currPos;
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsePowOp();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseFunctionCall();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$c3;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$c3;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c57(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsePowOp() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (peg$c33.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c34); }
      }
      if (s1 !== peg$FAILED) {
        if (peg$c95.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c96); }
        }
        if (s2 !== peg$FAILED) {
          if (peg$c97.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c98); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c99();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseFunctionCall() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parsefunction_name();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s2 = peg$c100;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c101); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse_();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseArgList();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s5 = peg$c102;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c103); }
              }
              if (s5 !== peg$FAILED) {
                peg$reportedPos = s0;
                s1 = peg$c104(s1, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$parseAtom();
      }

      return s0;
    }

    function peg$parseAtom() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parseFloat();
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c105(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseInteger();
        if (s1 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c105(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseString();
          if (s1 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c105(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseIdent();
            if (s1 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c105(s1);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 40) {
                s1 = peg$c100;
                peg$currPos++;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c101); }
              }
              if (s1 !== peg$FAILED) {
                s2 = peg$parse_();
                if (s2 !== peg$FAILED) {
                  s3 = peg$parseComparisonExpression();
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parse_();
                    if (s4 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s5 = peg$c102;
                        peg$currPos++;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c103); }
                      }
                      if (s5 !== peg$FAILED) {
                        peg$reportedPos = s0;
                        s1 = peg$c106(s3);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$c3;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$c3;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$c3;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$c3;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parseFloat() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parsefloat();
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c107(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseInteger() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parseinteger();
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c108(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseString() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 34) {
        s1 = peg$c109;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c110); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = [];
        s4 = peg$parseStringChar();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseStringChar();
        }
        if (s3 !== peg$FAILED) {
          s3 = input.substring(s2, peg$currPos);
        }
        s2 = s3;
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 34) {
            s3 = peg$c109;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c110); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c111(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseStringChar() {
      var s0, s1;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c112) {
        s1 = peg$c112;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c113); }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c114();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c115) {
          s1 = peg$c115;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c116); }
        }
        if (s1 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c117();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 2) === peg$c118) {
            s1 = peg$c118;
            peg$currPos += 2;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c119); }
          }
          if (s1 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c120();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c121) {
              s1 = peg$c121;
              peg$currPos += 2;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c122); }
            }
            if (s1 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c123();
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              if (peg$c124.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c125); }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parseIdent() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parseVariableName();
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c126(s1);
      }
      s0 = s1;

      return s0;
    }


    	function makeGoto(line) {
    		return { type: "command", name: "GOTO", args: [line] };
    	}

    	function makeBinaryOperator(head, rest, rix) {
    	    var result = head;
    	    rest.forEach(function(i) {
    	    	result = {
    	    		type: "binary-op",
    	    		op: i[1],
    	    		left: result,
    	    		right: i[rix]
    	    	}
    	    });
    	    return result;
    	}


    peg$result = peg$startRuleFunction();

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(null, peg$maxFailExpected, peg$maxFailPos);
    }
  }

  return {
    SyntaxError: SyntaxError,
    parse:       parse
  };
})();

},{}],8:[function(require,module,exports){
var du = require('domutil');

module.exports = Console;

var S_INIT              = 0,
    S_INPUT             = 1,
    S_PROCESSING        = 2;

var DEFAULT_PROMPT      = '> ';
var DEFAULT_PROMPT_NONE = null;
var NULL_HANDLER        = function(console, cmd) { console.newline(); }

//
// Space Handling

var VISUAL_SPACE        = String.fromCharCode(160);
var RE_VS               = new RegExp(VISUAL_SPACE, 'g');
var RE_LS               = / /g;

function logicalSpaceToVisualSpace(ch) {
    return ch === ' ' ? VISUAL_SPACE : ch;
}

function replaceLogicalSpaceWithVisualSpace(str) {
    return str.replace(RE_LS, VISUAL_SPACE);
}

function replaceVisualSpaceWithLogicalSpace(str) {
    return str.replace(RE_VS, ' ');
}

/**
 * Constructor.
 *
 */
function Console(el, opts) {

    opts = opts || {};

    this.root           = el;
    this.state          = S_INIT;
    this._textarea      = null;
    this._prompt        = null;
    this._handler       = opts.handler || NULL_HANDLER;
    this._cancel        = opts.cancel || NULL_HANDLER;
    this._cursor        = null;
    this._inputLine     = null;

    var needsTextarea = ('capabilities' in opts) ? !!(opts.capabilities.touch) : false;
    var tabIndex = opts.tabIndex || 0;
    
    if (needsTextarea) {
        this._textarea = document.createElement('textarea');
        this._textarea.setAttribute('tabindex', tabIndex);
        this.root.appendChild(this._textarea);
        this._bind(this._textarea);
    } else {
        this.root.setAttribute('tabindex', tabIndex);
        this._bind(this.root);
    }

    if ('prompt' in opts) {
        this._prompt = opts.prompt || DEFAULT_PROMPT_NONE;
    } else {
        this._prompt = DEFAULT_PROMPT;
    }

    if ('greeting' in opts) {
        this.print(opts.greeting);
    }

}

//
// Public API

Console.prototype.setHandler = function(handler) {
    this._handler = handler || NULL_HANDLER;
}

Console.prototype.setPrompt = function(prompt) {
    this._prompt = prompt;
}

Console.prototype.getInput = function() {
    
    if (this.state !== S_INPUT)
        throw new Error("cannot get console input - illegal state");

    return replaceVisualSpaceWithLogicalSpace(
        this._getRawInputFromElement(this._inputLine)
    );
    
}

Console.prototype.print = function(str) {
    
    var start = 0, end = str.indexOf("\n", start);
    while (end >= 0) {
        this._appendLine(str.substring(start, end));
        start = end + 1;
        end = str.indexOf("\n", start);
    }
    
    this._appendLine(str.substr(start));

}

Console.prototype.append = function(el, className) {
    this._appendElement(el, className);
}

Console.prototype.clearInput = function() {

    if (this.state !== S_INPUT) return;

    var l = this._inputLine,
        s = l.hasPrompt ? 1 : 0,
        v = l.childNodes.length - 2;

    while (v >= s) {
        l.removeChild(l.childNodes[v--]);
    }

    this._cursor = l.childNodes[s];
    this._cursor.className = 'cursor';

}

Console.prototype.newline = function() {

    //
    // If there's existing input, replace the existing div-of-spans with
    // a single text node.

    if (this._inputLine) {
        
        var input = this._getRawInputFromElement(this._inputLine);
        
        var max = this._inputLine.hasPrompt ? 1 : 0;
        while (this._inputLine.childNodes.length > max) {
            this._inputLine.removeChild(this._inputLine.lastChild);
        }

        this._inputLine.appendChild(document.createTextNode(input));
        this._inputLine.appendChild(document.createElement('br'));

        du.removeClass(this._inputLine, 'input');
    
    }

    //
    // Create new input container with prompt/cursor
    
    this._inputLine = document.createElement('div');
    this._inputLine.className = 'item text input';

    var prompt = this._generatePrompt();
    if (prompt) {
        prompt.className = 'prompt';
        this._inputLine.appendChild(prompt);
        this._inputLine.hasPrompt = true;
    } else {
        this._inputLine.hasPrompt = false;
    }
    
    this._cursor = document.createElement('span');
    du.setText(this._cursor, VISUAL_SPACE);
    this._cursor.className = 'cursor';
    this._inputLine.appendChild(this._cursor);
    
    this.root.appendChild(this._inputLine);
    
    this._scrollToBottom();

    this.state = S_INPUT;

}

Console.prototype.focus = function() {
    if (this._textarea) {
        this._textarea.focus();    
    } else {
        this.root.focus();
    }
}

//
// Key handlers

Console.prototype._keydown = function(evt) {
    switch (evt.keyCode) {
        case 8:
            evt.preventDefault();
            if (this.state === S_INPUT) {
                this._backspace();
            }
            break;
        case 37: /* left */
            evt.preventDefault();
            if (this.state === S_INPUT) {
                this._cursorLeft();
            }
            break;
        case 38: /* up */
            // TODO: history
            break;
        case 39: /* right */
            evt.preventDefault();
            if (this.state === S_INPUT) {
                this._cursorRight();
            }
            break;
        case 40: /* down */
            // TODO: history management
            break;
    }
}

Console.prototype._keyup = function(evt) {
    switch (evt.keyCode) {
        case 27: /* escape */
            evt.preventDefault();
            if (this.state === S_INPUT) {
                this.clearInput();
            } else if (this.state === S_PROCESSING) {
                this._cancel(this);
            }
            break;
    }
}

Console.prototype._keypress = function(evt) {
    var input, result;

    if (this.state === S_INPUT) {

        // Enter
        if (evt.charCode === 13 || evt.keyCode === 13) {
            evt.preventDefault();
            this._clearSelection();
            input = this.getInput();
            du.removeClass(this._cursor, 'cursor');
            this._cursor = null;
            this.state = S_PROCESSING;
            this._handler(this, input);
            return;
        }

        switch (evt.charCode) {
            case 32: /* space - insert &nbsp; */
                evt.preventDefault();
                this._clearSelection();
                this._insertStringBeforeCursor(VISUAL_SPACE);
                break;
            default:
                // TODO: ignore if meta-key (alt, option, cmd) is engaged
                if (evt.charCode > 32 && evt.charCode < 127) {
                    evt.preventDefault();
                    this._clearSelection();
                    this._insertStringBeforeCursor(String.fromCharCode(evt.charCode));
                } else {
                    console.log("whoops - keypress received non-printable value");
                }
        }
    }
}

//
// 

Console.prototype._getRawInputFromElement = function(el) {

    var str = '',
        m   = el.childNodes.length - 1,
        s   = el.hasPrompt ? 1 : 0;

    while (s < m) {
        str += du.getText(el.childNodes[s++]);
    }
    
    return str;

}

Console.prototype._generatePrompt = function() {

    var prompt = this._prompt;

    if (typeof prompt === 'function') {
        prompt = prompt(this);
    }

    if (typeof prompt === 'string') {
        var node = document.createElement('span');
        du.setText(node, prompt);
        prompt = node;
    }

    return prompt;

}

Console.prototype._scrollToBottom = function() {
    this.root.scrollTop = this.root.scrollHeight;
}

Console.prototype._clearSelection = function() {
    //window.getSelection().empty();
}

Console.prototype._backspace = function() {
    if (!this._cursor) return;

    var prev = this._cursor.previousSibling;
    if (prev && !du.hasClass(prev, 'prompt')) {
        this._inputLine.removeChild(prev);
    }
}

Console.prototype._cursorLeft = function() {
    if (!this._cursor) return;

    var prev = this._cursor.previousSibling;
    if (prev && !du.hasClass(prev, 'prompt')) {
        du.addClass(prev, 'cursor');
        du.removeClass(this._cursor, 'cursor');
        this._cursor = prev;
    }
}

Console.prototype._cursorRight = function() {
    if (!this._cursor) return;

    var next = this._cursor.nextSibling;
    if (next) {
        du.addClass(next, 'cursor');
        du.removeClass(this._cursor, 'cursor');
        this._cursor = next;
    }
}

// Append a line of text to the container
Console.prototype._appendLine = function(str) {

    var line = document.createElement('div');
    line.className = 'item text';
    line.appendChild(document.createTextNode(replaceLogicalSpaceWithVisualSpace(str)));
    line.appendChild(document.createElement('br'));

    this._appendRaw(line);

}

Console.prototype._appendElement = function(el, className) {
    
    var wrap = document.createElement('div');
    wrap.className = 'item ' + (className || '');
    wrap.appendChild(el);

    this._appendRaw(el);

}

Console.prototype._appendRaw = function(el) {
    if (this.state === S_INPUT) {
        this.root.insertBefore(el, this._inputLine);
    } else {
        this.root.appendChild(el);
    }
    this._scrollToBottom();
}

Console.prototype._insertStringBeforeCursor = function(str) {
    if (!this._cursor) return;

    for (var i = 0; i < str.length; i++) {
        var ch = document.createElement('span');
        du.setText(ch, logicalSpaceToVisualSpace(str.charAt(i)));
        this._inputLine.insertBefore(ch, this._cursor);
    }
}

Console.prototype._bind = function(consoleEl) {
    du.bind(this.root,  'click',    this.focus.bind(this));
    du.bind(consoleEl,  'keydown',  this._keydown.bind(this));
    du.bind(consoleEl,  'keyup',    this._keyup.bind(this));
    du.bind(consoleEl,  'keypress', this._keypress.bind(this));
}
},{"domutil":16}],9:[function(require,module,exports){
if (typeof window.DOMTokenList === 'undefined') {

	// Constants from jQuery
	var rclass = /[\t\r\n]/g;
	var core_rnotwhite = /\S+/g;

	// from jQuery
	exports.hasClass = function(ele, className) {
	    className = " " + className + " ";
	    return (" " + ele.className + " ").replace(rclass, " ").indexOf(className) >= 0;
	}

	exports.addClass = function(ele, value) {
	    var classes = (value || "").match(core_rnotwhite) || [],
	            cur = ele.className ? (" " + ele.className + " ").replace(rclass, " ") : " ";

	    if (cur) {
	        var j = 0, clazz;
	        while ((clazz = classes[j++])) {
	            if (cur.indexOf(" " + clazz + " ") < 0) {
	                cur += clazz + " ";
	            }
	        }
	        ele.className = cur.trim();
	    }
	}

	exports.removeClass = function(ele, value) {
	    var classes = (value || "").match(core_rnotwhite) || [],
	            cur = ele.className ? (" " + ele.className + " ").replace(rclass, " ") : " ";

	    if (cur) {
	        var j = 0, clazz;
	        while ((clazz = classes[j++])) {
	            while (cur.indexOf(" " + clazz + " ") >= 0) {
	                cur = cur.replace(" " + clazz + " ", " ");
	            }
	            ele.className = value ? cur.trim() : "";
	        }
	    }
	}

	exports.toggleClass = function(ele, value) {
	    var classes = (value || "").match(core_rnotwhite) || [],
	            cur = ele.className ? (" " + ele.className + " ").replace(rclass, " ") : " ";

	    if (cur) {
	        var j = 0, clazz;
	        while ((clazz = classes[j++])) {
	            var removeCount = 0;
	            while (cur.indexOf(" " + clazz + " ") >= 0) {
	                cur = cur.replace(" " + clazz + " ", " ");
	                removeCount++;
	            }
	            if (removeCount === 0) {
	                cur += clazz + " ";
	            }
	            ele.className = cur.trim();
	        }
	    }
	}

} else {

	exports.hasClass = function(el, className) {
	    return el.classList.contains(className);
	}

	exports.addClass = function(el, classes) {
	    if (classes.indexOf(' ') >= 0) {
	        classes.split(/\s+/).forEach(function(c) {
	            el.classList.add(c);
	        });
	    } else {
	        el.classList.add(classes);
	    }
	}

	exports.removeClass = function(el, classes) {
	    if (classes.indexOf(' ') >= 0) {
	        classes.split(/\s+/).forEach(function(c) {
	            el.classList.remove(c);
	        });
	    } else {
	        el.classList.remove(classes);
	    }
	}

	exports.toggleClass = function(el, classes) {
	    if (classes.indexOf(' ') >= 0) {
	        classes.split(/\s+/).forEach(function(c) {
	            el.classList.toggle(c);
	        });
	    } else {
	        el.classList.toggle(classes);
	    }
	}

}

},{}],10:[function(require,module,exports){
var matchesSelector = require('./matches_selector').matchesSelector;

var bind = null, unbind = null;

if (typeof window.addEventListener === 'function') {

	bind = function(el, evtType, cb, useCapture) {
		el.addEventListener(evtType, cb, useCapture || false);
		return cb;
	}

	unbind = function(el, evtType, cb, useCapture) {
		el.removeEventListener(evtType, cb, useCapture || false);
		return cb;
	}

} else if (typeof window.attachEvent === 'function') {

	bind = function(el, evtType, cb, useCapture) {
		
		function handler(evt) {
			evt = evt || window.event;
			
			if (!evt.preventDefault) {
				evt.preventDefault = function() { evt.returnValue = false; }
			}
			
			if (!evt.stopPropagation) {
				evt.stopPropagation = function() { evt.cancelBubble = true; }
			}

			cb.call(el, evt);
		}
		
		el.attachEvent('on' + evtType, handler);
		return handler;
	
	}

	unbind = function(el, evtType, cb, useCapture) {
		el.detachEvent('on' + evtType, cb);
		return cb;
	}

}

function delegate(el, evtType, selector, cb, useCapture) {
	return bind(el, evtType, function(evt) {
		var currTarget = evt.target;
		while (currTarget && currTarget !== el) {
			if (matchesSelector(selector, currTarget)) {
				evt.delegateTarget = currTarget;
				cb.call(el, evt);
				break;
			}
			currTarget = currTarget.parentNode;
		}
	}, useCapture);
}

function bind_c(el, evtType, cb, useCapture) {
	cb = bind(el, evtType, cb, useCapture);

	var removed = false;
	return function() {
		if (removed) return;
		removed = true;
		unbind(el, evtType, cb, useCapture);
		el = cb = null;
	}
}

function delegate_c(el, evtType, selector, cb, useCapture) {
	cb = delegate(el, evtType, selector, cb, useCapture);

	var removed = false;
	return function() {
		if (removed) return;
		removed = true;
		unbind(el, evtType, cb, useCapture);
		el = cb = null;
	}
}

function stop(evt) {
	evt.preventDefault();
	evt.stopPropagation();
}

exports.bind = bind;
exports.unbind = unbind;
exports.delegate = delegate;
exports.bind_c = bind_c;
exports.delegate_c = delegate_c;
exports.stop = stop;
},{"./matches_selector":12}],11:[function(require,module,exports){
exports.setRect = function(el, x, y, width, height) {
	el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = width + 'px';
    el.style.height = height + 'px';
}

exports.setPosition = function(el, x, y) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
}

exports.setSize = function(el, width, height) {
    el.style.width = width + 'px';
    el.style.height = height + 'px';
}
},{}],12:[function(require,module,exports){
var proto = window.Element.prototype;
var nativeMatch = proto.webkitMatchesSelector
					|| proto.mozMatchesSelector
					|| proto.msMatchesSelector
					|| proto.oMatchesSelector;

if (nativeMatch) {
	
	exports.matchesSelector = function(selector, el) {
		return nativeMatch.call(el, selector);
	}

} else {

	console.warn("Warning: using slow matchesSelector()");
	
	var indexOf = Array.prototype.indexOf;
	exports.matchesSelector = function(selector, el) {
		return indexOf.call(document.querySelectorAll(selector), el) >= 0;
	}

}

},{}],13:[function(require,module,exports){
exports.isElement = function(el) {
	return el && el.nodeType === 1;
}

exports.replace = function(oldEl, newEl) {
	oldEl.parentNode.replaceChild(newEl, oldEl);
}
},{}],14:[function(require,module,exports){
if ('textContent' in document.createElement('span')) {
    
    exports.getText = function(el) {
        return el.textContent;
    }

    exports.setText = function(el, text) {
        el.textContent = text;
    }

} else {

    exports.getText = function(el) {
        return el.innerText;
    }

    exports.setText = function(el, text) {
        el.innerText = text;
    }

}
},{}],15:[function(require,module,exports){
// http://stackoverflow.com/questions/1248081/get-the-browser-viewport-dimensions-with-javascript
exports.viewportSize = function() {
	return {
	    width: Math.max(document.documentElement.clientWidth, window.innerWidth || 0),
	    height: Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
	};
}
},{}],16:[function(require,module,exports){
var du = module.exports = {};

extend(require('./impl/classes'));
extend(require('./impl/events'));
extend(require('./impl/layout'));
extend(require('./impl/matches_selector'));
extend(require('./impl/node'));
extend(require('./impl/text'));
extend(require('./impl/viewport'));

function extend(things) {
    for (var k in things) {
        du[k] = things[k];
    }
}

},{"./impl/classes":9,"./impl/events":10,"./impl/layout":11,"./impl/matches_selector":12,"./impl/node":13,"./impl/text":14,"./impl/viewport":15}],17:[function(require,module,exports){
module.exports={
  "name": "basica",
  "version": "0.3.0",
  "description": "BASIC interpreter",
  "main": "index.js",
  "dependencies": {
    "echo-chamber": "~0.3.0",
    "domutil": "~0.3.5",
    "pegjs": "~0.8.0"
  },
  "devDependencies": {},
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "basic",
    "interpreter",
    "programming",
    "language"
  ],
  "author": "Jason Frame <jason@onehackoranother.com> (http://jasonframe.co.uk)",
  "license": "ISC"
}

},{}]},{},[1])