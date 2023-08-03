//import {MersenneTwister} from './mersenne_twister.js';

/*
Testing of parsing complicated dice expressions.

To Do:
Clean up the code.
	Standard commenting.
	Check that it still works.
	Clean up the global namespace, limit it to what is needed globally.
		Consider using the module pattern.
Post it online and ask for reviews.
Accessiility

Globals:
MESSAGES: Possible initial messages for the roll panel. (array of string)
state: The current state of the dice panel. (object)
twister: Better PRNG. (MersenneTwister)

Classes:
MultiResult: The result of a complex roll with multiple parts.
Result: The result of a single, simple roll. (MultiResult)

Modules:
roller: Functions and constants for handling dice rolls.

Functions
randomInt: Generate a random integer. (integer)
*/

const MESSAGES = ['Come on, roll something, I dare you.', 'Chaos awaits.',
	'May the odds be ever in your favor.', 'Death and dice level all distinctions.',
	"If you don't roll the dice, you'll never get a crit."]

const state = {
	history: []
};

const twister = new MersenneTwister;

class MultiResult {
	/*
	The result of a complex roll with multiple parts.
	
	Attributes:
	crit: A flag for the roll being a critical. (boolean)
	fumble: A flag for the roll being a fumble. (boolean)
	operators: The math operators connecting the results. (array of string)
	results: The results of the parts of the roll. (array of MultiResult)
	rollText: The original text specification of the roll. (string)
	total: The final value of the roll. (number)

	Methods:
	add: Add this result to another one. (MultiResult)
	html: Full HTML for this result. (string)
	subText: Text for this result as part of a larger result. (string)
	subtract: Subtract another result from this one. (MultiResult)
	text: Display text for this result. (string)
	*/

	constructor(rollText, total, results, operators) {
		// Assign the given attributes.
		this.rollText = rollText;
		this.total = total;
		this.results = results;
		this.operators = operators;
		// Calculate the crit and fumble flags.
		this.crit = this.results.every((result) => result.crit);
		this.fumble = this.results.every((result) => result.fumble);
	}

	add(other) {
		/*
		Add this result to another one. (MultiResult)

		Parameters:
		other: The result to add. (MultiResult)
		*/
		var rollText = `${this.rollText} + ${other.rollText}`;
		return new MultiResult(rollText, this.total + other.total, [this, other], ['+']);
	}

	html() {
		// Full HTML for this result. (string)
		var graph;
		if (this.crit) {
			graph = '<p class="roll-result crit" ';
		} else if (this.fumble) {
			graph = '<p class="roll-result fumble" ';
		} else {
			graph = '<p class="roll-result" ';
		}
		graph += `title="${this.rollText}">`
		return `${graph}<strong>${this.total}</strong>: ${this.text()} </p>`;
	}

	subText() {
		// Text for this result as part of a larger result. (string)
		var outText;
		if (this.results.length == 1) {
			outText = this.text();
		} else {
			// put complex results in parentheses.
			outText = `(${this.text()})`
		}
		return outText;
	}

	subtract(other) {
		/*
		Subtract another result from this one. (MultiResult)

		Parameters:
		other: The result to subtract. (MultiResult)
		*/
		var rollText = `${this.rollText} - ${other.rollText}`;
		return new MultiResult(rollText, this.total - other.total, [this, other], ['-']);
	}

	text() {
		// Display text for this result. (string)
		var outText;
		if (this.results.length == 1) {
			// Return single result text.
			outText = this.results[0].text();
		} else {
			// Combine multiple result texts with the operators.
			outText = this.results[0].subText();
			for (let result = 1; result < this.results.length; result++) {
				outText += ` ${this.operators[result - 1]} ${this.results[result].subText()}`
			}
		}
		return outText;
	}
}

class RollResult extends MultiResult {
	/*
	The result of a single, simple roll. (MultiResult)

	Extra Attributes:
	split: The number of dice used in the sum of the roll. (integer)

	Modified Methods:
	constructor
	text
	*/

	constructor(rollText, total, results, split = null, crit = false, fumble = false) {
		// Run the parent constructor with a sum.
		super(rollText, total, results, Array(results.length - 1).fill('+'));
		// Add the other specified attributes.
		this.split = split;
		this.crit = crit;
		this.fumble = fumble;
	}

	text() {
		var outText;
		var spanClass;
		// Figure out crit and fumble
		if (this.crit && ! this.fumble) {spanClass = 'crit';}
		if (this.fumble && ! this.crit) {spanClass = 'fumble';}
		// Handle splits, single dice, and multiple dice.
		if (this.split !== null) {
			var start = this.results.slice(0, this.split).join(' + ');
			var end = this.results.slice(this.split).join(', ');
			outText = `<span class="${spanClass}">${start}</span> | ${end}`;
		} else if (this.results.length == 1) {
			outText = `<span class="${spanClass}">${this.total}</span>`;
		} else {
			outText = `<span class="${spanClass}">${this.results.join(' + ')}</span>`;
		}
		return outText;
	}
}

var roller = (function() {
	/*
	Functions and constants for handling dice rolls.

	Private Properties:
	operators: Basic math functions keyed by operator. (object of string: function)
	precedence: Precedence groupings of the operators. (array of string)
	rollRegex: The regular expression for a die roll. (regex)

	Private Methods:
	displayRoll: Display a roll result. (null)
	multiRoll: Handle a comple roll with multiple parts. (MultiResult)
	parseDice: Parse a dice specification. (array)
	singleRoll: Handle rolling a simple roll with modifiers. (RollResult)
	splitPush: Push values before the split between totalled and saved dice. (integer)

	Public Methods:
	buttonRoll: Roll dice as specified on a button. (null)
	fieldRoll: Handle a custom die roll. (null)
	recentRoll: Handle clicking on a recent roll button. (null)
	savedRoll: Handle rolling a saved roll (null)
	*/

	const operators = {'+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y,
		'/': (x, y) => x / y, '^': (x, y) => x ** y, '%': (x, y) => x % y};

	const precedence = ['^', '*/%', '+-'];

	const rollRegex = /(\d*)d(\d+)([a-z]\d+)?([a-z]\d+)?([a-z]\d+)?([a-z]\d+)?/;

	function buttonRoll(event, store = true) {
		/*
		Roll dice as specified on a button. (null)

		Parameters:
		event: The triggering button click. (event)
		store: A flag for updating the roll history. (boolean)
		*/
		// Get the roll information
		var rawRoll = $(event.target).text();
		var modifier = $('#modifier').val()
		// Set up the variables.
		var roll;
		var rollValues = [];
		var result;
		// Check for special rolls.
		switch (rawRoll) {
			case 'd20 adv':
				roll = '2d20k1';
				break;
			case 'd20 dis':
				roll = '2d20h1';
				break;
			case 'd%':
				roll = '1d100';
				break;
			case 'Yes/No':
				roll = '1d2';
				rollValues = ['', 'Yes', 'No'];
				store = false;
				modifier = '';
				break;
			case 'Direction':
				roll = '1d8';
				rollValues = ['', 'N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'];
				store = false;
				modifier = '';
				break;
			case 'Likert':
				roll = '1d5';
				rollValues = ['', 'Strongly Against', 'Against', 'Neutral', 'For', 
					'Strongly For'];
				store = false;
				modifier = '';
				break;
			case 'TBD':
				return;
			default:
				roll = rawRoll;
		}
		// Handle the modifier, but only for button-dice.
		if (modifier != '' && modifier != '0' && $(event.target).hasClass('button-die')) {
			if (modifier[0] != '-') {
				roll = `${roll} + ${modifier}`;
			} else {
				roll += modifier;
			}
			result = multiRoll(roll, parseDice(roll));
		} else {
			result = singleRoll(roll, rollValues);
		}
		// Check for adding to/subtracting from the previous roll.
		if (event.shiftKey) {
			result = state.history[0].add(result);
		} else if (event.altKey) {
			result = state.history[0].subtract(result);
		}
		// output.
		displayRoll(result, store);
		//console.log(event.target.id);
	}

	function displayRoll(result, store = true) {
		/* 
		Display a roll result. (null)

		Parameters:
		result: the result to display. (result)
		store: A flag for updating the roll history. (boolean)
		*/
		// Update the history of rolls for buttons that should affect it.
		if (store) {
			state.history.unshift(result);
			if (state.history.length > 10) state.history.pop();
			if ($('#recent-1').text() != result.rollText) {
				$('#recent-4').text($('#recent-3').text());
				$('#recent-3').text($('#recent-2').text());
				$('#recent-2').text($('#recent-1').text());
				$('#recent-1').text(result.rollText);
			}
		}
		// Display the output and update the displayed history.
		$('#output').prepend(result.html());
		$('.roll-result:nth-child(6)').remove();
		$('.dummy-result').remove();
	}

	function displayError(err) {
		/*
		Display an error message in the results area. (null)

		Parameters:
		err: The text of the error message.
		*/
		$('#output').prepend(`<p class="roll-result fumble"><strong>Error</strong>: ${err}</p>`);
		$('.roll-result:nth-child(6)').remove();
		$('.dummy-result').remove();
	}

	function fieldRoll(event) {
		/*
		Handle a custom die roll. (null)

		Parameters:
		event: The triggering event, which is ignored. (event)
		*/
		// Get the roll specification.
		var rollText = $('#roll-text').val()
		try {
			// Parse the text and roll the dice.
			var parsed = parseDice(rollText);
			var result = multiRoll(rollText, parsed);
		}
		catch(err) {
			// Display errors to the user.
			displayError(err);
			return;
		}
		// Display the result.
		displayRoll(result);
	}

	function multiRoll(rollText, parsed) {
		/*
		Handle a comple roll with multiple parts. (MultiResult)
		*/
		// Do the rolls and split out the operators.
		var rolls = [];
		var rollOps = [];
		for (let item = 0; item < parsed.length; item++) {
			if (Array.isArray(parsed[item])) {
				rolls.push(multiRoll(parsed[item].join(' '), parsed[item]));
			} else if (Object.hasOwn(operators, parsed[item])) {
				rollOps.push(parsed[item]);
			} else if (parsed[item].indexOf('d') >= 0) {
				rolls.push(singleRoll(parsed[item]));
			} else if (/\d+/.test(parsed[item])) {
				rolls.push(new RollResult(parsed[item], Number(parsed[item]), 
					[Number(parsed[item])], split = null, crit = true, fumble = true));
			} else {
				throw `Invalid roll text: '${parsed[item]}'`;
			}
		}
		// Calculate the total using order of operations.
		var sub_totals = rolls.map(result => result.total);
		var sub_ops = rollOps.slice()
		// Loop through precendence levels.
		for (let ops = 0; ops < precedence.length; ops++) {
			let op_list = precedence[ops];
			// Loop through operators and rolls, reducing both lists for valid operators.
			for (let sub = 1; sub < sub_totals.length; sub++) {
				let operator = sub_ops[sub - 1];
				//console.log(operator);
				if (op_list.indexOf(operator) > -1) {
					let values = sub_totals.slice(sub - 1, sub + 1);
					sub_totals.splice(sub - 1, 2, operators[operator](...values));
					sub_ops.splice(sub - 1, 1);
					sub--;
				}
				//console.log(sub_totals, sub_ops);
			}
		}
		return new MultiResult(rollText, sub_totals[0], rolls, rollOps)
	}

	function parseDice(text) {
		/*
		Parse a dice specification. (array)

		Parameters:
		text: The text specifying the die roll. (string)
		*/
		// Set up the parsing.
		var parsed = [];
		var current = parsed;
		var previous = [];
		var heldText = '';
		var chuck;
		// Parse the string one character at a time.
		for (let charIndex = 0; charIndex < text.length; charIndex++) {
			let char = text[charIndex];
			chuck = null;
			// Handle open parenthesis.
			if (char == '(') {
				parsed.push([]);
				previous.push(current);
				chuck = current;
				current = parsed[parsed.length - 1];
			}
			// Handle close parenthesis.
			else if (char == ')') {
				chuck = current;
				current = previous.pop();
			}
			// Handle operators.
			else if (Object.hasOwn(operators, char)) {
				if (heldText) current.push(heldText);
				if (current.length == 0) {
					throw "Expressions may not start with an operator.";
				} else if (Object.hasOwn(operators, current[current.length - 1])) {
					throw "Two operators may not be next to each other";
				}
				current.push(char);
				heldText = '';
			}
			// Handle everything else, ignoring whitespace.
			else if (char != ' ') {
				heldText = heldText + char;
			}
			// Handle  saving previous text.
			if (chuck !== null && heldText != '') {
				chuck.push(heldText);
				heldText = '';
			}
		}
		// Save the last bit of parsing.
		current.push(heldText);
		//console.log(parsed);
		return parsed;
	}

	function recentRoll(event) {
		/*
		Handle clicking on a recent roll button. (null)

		Paramters:
		event: The triggering click event. (event)
		*/
		if (event.ctrlKey) {
			// Handle saving the roll.
			var pushText = $(event.target).text();
			var holdText = '';
			// Shift previously saved rolls until you get to an unused (TBD) button.
			for (let button = 1; button < 5; button++) {
				holdText = $(`#saved-${button}`).text();
				$(`#saved-${button}`).text(pushText);
				if (holdText == 'TBD') break;
				pushText = holdText;
			}
		} else {
			// Handle rerolling the roll.
			var rollText = $(event.target).text();
			var parsed = parseDice(rollText);
			var result = multiRoll(rollText, parsed);
			displayRoll(result, store = false);
		}
	}

	function savedRoll(event) {
		/*
		Handle rolling a saved roll (null)

		Paramters:
		event: The triggering button click event. (event)
		*/
		var rollText = $(event.target).text();
		var parsed = parseDice(rollText);
		var result = multiRoll(rollText, parsed);
		displayRoll(result, store = false);
	}

	function singleRoll(rollText, rollValues = []) {
		/*
		Handle rolling a simple roll with modifiers. (RollResult)

		Parameters:
		rollText: The text specifying the roll. (str)
		rollValues: Values to replace the numeric result. (array of string)
		*/
		// Parse the roll specification with a regex.
		var rollParts = rollText.match(rollRegex);
		if (rollParts === null) throw "Invalid roll specification for a single roll.";
		var [number, sides] = rollParts.slice(1, 3);
		if (number == '') {number = 1;}
		// Set the default result attributes.
		var dice = [];
		var split = null;
		var critOn = sides;
		var fumbleOn = 1;
		var isCrit = false;
		var isFumble = false;
		// Roll the dice
		for (let die = 0; die < number; die++) {
			dice.push(randomInt(sides));
		}
		//console.log(rollParts);
		// Check for modifiers to the roll.
		for (let groupIndex = 3; groupIndex < rollParts.length; groupIndex++) {
			if (rollParts[groupIndex] !== undefined) {
				var char = rollParts[groupIndex][0];
				var value = rollParts[groupIndex].slice(1);
				switch(char) {
					case 'd':
						// Drop low dice.
						dice.sort(function(x, y) {return y - x});
						split = dice.length - value;
						break;
					case 'h':
						// Hold low dice.
						dice.sort(function(x, y) {return x - y});
						split = value;
						break;
					case 'k':
						// Keep high dice.
						dice.sort(function(x, y) {return y - x});
						split = value;
						break;
					case 'p':
						// Pop high dice.
						dice.sort(function(x, y) {return x - y});
						split = dice.length - value;
						break;
					case 'c':
						// Change the critical value.
						critOn = value;
						break;
					case 'f':
						// Change the fumble value.
						fumbleOn = value;
						break;
					case 'r':
						// Reroll low dice, keeping the values at the end.
						for (die = 0; die < (split !== null ? split : number); die++) {
							if (dice[die] <= value) {
								dice.push(dice[die]);
								dice[die] = randomInt(sides);
								if (split === null) {
									split = number;
								}
							}
						}
						break;
					case 'e':
						// Explode high dice, adding the values at the end.
						for (die = 0; die < (split !== null ? split : number); die++) {
							if (dice[die] >= value) {
								split = splitPush(split, dice, randomInt(sides));
							}
						}
						break;
					default:
						// Error for bad modifier.
						throw 'Invaid modifier to a single roll.';
				}
			}
		}
		// Get the total ignoring dice past the split.
		if (split === null) {
			var sum_dice = [...dice];
		} else {
			var sum_dice = dice.slice(0, split);
		}
		var total = sum_dice.reduce((x, y) => x + y, 0)
		if (rollValues.length > 0) {
			// Handle text results.
			total = rollValues[total];
		} else {
			// Determine critical or fumble.
			isCrit = sum_dice.every((die) => die >= critOn);
			isFumble = sum_dice.every((die) => die <= fumbleOn);
		}
		return new RollResult(rollText, total, dice, split, isCrit, isFumble);
	}

	function splitPush(split, arr, ...values) {
		/*
		Push values before the split between totalled and saved dice. (integer)

		Parameters:
		split: The split point in the array. (integer)
		arr: The array of values. (array)
		...values: The new values to push. (anything)
		*/
		if (split === null) {
			arr.push(...values);
		} else {
			arr.splice(split, 0, ...values);
			split++;
		}
		return split;
	}

	// Expose the public methods.
	return {
		buttonRoll: buttonRoll,
		fieldRoll: fieldRoll,
		recentRoll: recentRoll,
		savedRoll: savedRoll
	};
})();

function randomInt(low = 1, high = null) {
	/*
	Generate a random integer. (integer)

	If only one parameter is given it is assumed to be the high parameter.

	Parameters:
	low: The lowest possible result. (integer)
	high: The highest possible result. (integer)
	*/
	if (high === null) {
		high = low;
		low = 1;
	}
	return Math.floor(twister.random() * (high - low + 1) + low)
}

// Set up
$(function() {
	// Set up the dice rolling elements.
	// Set up the buttons that roll dice.
	$('.button-die').click(roller.buttonRoll);
	$('.recent-die').click(roller.recentRoll);
	$('.saved-die').click(roller.savedRoll);
	// Set up the modifier field.
	$('#modifier').on('wheel', function(event) {
		var delta = Math.round(event.originalEvent.deltaY / 100);
		$('#modifier').val($('#modifier').val() - delta);
	});
	$('#modifier').dblclick(function(event) {$('#modifier').val('');});
	// Set up user specified roll field and button.
	$('#roll-text').keyup(function(event) {if (event.which == 13) {roller.fieldRoll();}});
	$('#from-input').click(roller.fieldRoll);
	// Set up dragging recent rolls onto saved buttons.
	$('.recent-die').on('dragstart', function(event) {
		event.originalEvent.dataTransfer.setData('roll', $(event.target).text());
	});
	$('.saved-die').on('drop', function(event) {
		event.preventDefault();
		var roll = event.originalEvent.dataTransfer.getData('roll');
		$(event.target).text(roll);
	});
	$('.saved-die').on('dragover', function(event) {event.preventDefault();});
	// Add a random start message.
	$('.dummy-result').text(MESSAGES[randomInt(0, MESSAGES.length - 1)]);
	console.log('76667');
	console.log('GOOFY');
});
