const util = require('./util');
const types = require('./types');
const sets = require('./sets');
const positions = require('./positions');


module.exports = (regexpStr) => {
    let i = 0, l, character;
    let start = {type: types.ROOT, stack: []};

    // Keep track of last clause/group and stack.
    let lastGroup = start;
    let last = start.stack;
    let groupStack = [];


    const repeatErr = (i) => {
        util.error(regexpStr, `Nothing to repeat at column ${i - 1}`);
    };

    // Decode a few escaped characters.
    let str = util.strToChars(regexpStr);
    l = str.length;

    // Iterate through each character in string.
    while (i < l) {
        character = str[i++];

        switch (character) {
            // Handle escaped characters, includes a few sets.
            case '\\':
                character = str[i++];

                switch (character) {
                    case 'b':
                        last.push(positions.wordBoundary());
                        break;

                    case 'B':
                        last.push(positions.nonWordBoundary());
                        break;

                    case 'w':
                        last.push(sets.words());
                        break;

                    case 'W':
                        last.push(sets.notWords());
                        break;

                    case 'd':
                        last.push(sets.integers());
                        break;

                    case 'D':
                        last.push(sets.notIntegers());
                        break;

                    case 's':
                        last.push(sets.whitespace());
                        break;

                    case 'S':
                        last.push(sets.notWhitespace());
                        break;

                    default:
                        // Check if character is integer.
                        // In which case it's a reference.
                        if (/\d/.test(character)) {
                            last.push({type: types.REFERENCE, value: parseInt(character, 10)});

                            // Escaped character.
                        } else {
                            last.push({type: types.CHAR, value: character.charCodeAt(0)});
                        }
                }

                break;


            // Positional
            case '^':
                last.push(positions.begin());
                break;

            case '$':
                last.push(positions.end());
                break;


            // Handle custom sets.
            case '[': {
                // Check if this class is 'anti' i.e. [^abc].
                let not;
                if (str[i] === '^') {
                    not = true;
                    i++;
                } else {
                    not = false;
                }

                // Get all the characters in class.
                let classTokens = util.tokenizeClass(str.slice(i), regexpStr);

                // Increase index by length of class.
                i += classTokens[1];
                last.push({
                    type: types.SET,
                    set: classTokens[0],
                    not,
                });

                break;
            }


            // Class of any character except \n.
            case '.':
                last.push(sets.anyChar());
                break;


            // Push group onto stack.
            case '(': {
                // Create group.
                let group = {
                    type: types.GROUP,
                    stack: [],
                    remember: true,
                };

                character = str[i];

                // If if this is a special kind of group.
                if (character === '?') {
                    character = str[i + 1];
                    i += 2;

                    // Match if followed by.
                    if (character === '=') {
                        group.followedBy = true;

                        // Match if not followed by.
                    } else if (character === '!') {
                        group.notFollowedBy = true;

                    } else if (character !== ':') {
                        util.error(regexpStr,
                            `Invalid group, character '${character}'` +
                            ` after '?' at column ${i - 1}`);
                    }

                    group.remember = false;
                }

                // Insert subgroup into current group stack.
                last.push(group);

                // Remember the current group for when the group closes.
                groupStack.push(lastGroup);

                // Make this new group the current group.
                lastGroup = group;
                last = group.stack;
                break;
            }


            // Pop group out of stack.
            case ')':
                if (groupStack.length === 0) {
                    util.error(regexpStr, `Unmatched ) at column ${i - 1}`);
                }
                lastGroup = groupStack.pop();

                // Check if this group has a PIPE.
                // To get back the correct last stack.
                last = lastGroup.options ?
                    lastGroup.options[lastGroup.options.length - 1] : lastGroup.stack;
                break;


            // Use pipe character to give more choices.
            case '|': {
                // Create array where options are if this is the first PIPE
                // in this clause.
                if (!lastGroup.options) {
                    lastGroup.options = [lastGroup.stack];
                    delete lastGroup.stack;
                }

                // Create a new stack and add to options for rest of clause.
                let stack = [];
                lastGroup.options.push(stack);
                last = stack;
                break;
            }


            // Repetition.
            // For every repetition, remove last element from last stack
            // then insert back a RANGE object.
            // This design is chosen because there could be more than
            // one repetition symbols in a regex i.e. `a?+{2,3}`.
            case '{': {
                let rs = /^(\d+)(,(\d+)?)?}/.exec(str.slice(i)), min, max;
                if (rs !== null) {
                    if (last.length === 0) {
                        repeatErr(i);
                    }
                    min = parseInt(rs[1], 10);
                    max = rs[2] ? rs[3] ? parseInt(rs[3], 10) : Infinity : min;
                    i += rs[0].length;

                    last.push({
                        type: types.REPETITION,
                        min,
                        max,
                        value: last.pop(),
                    });
                } else {
                    last.push({
                        type: types.CHAR,
                        value: 123,
                    });
                }
                break;
            }

            case '?':
                if (last.length === 0) {
                    repeatErr(i);
                }
                last.push({
                    type: types.REPETITION,
                    min: 0,
                    max: 1,
                    value: last.pop(),
                });
                break;

            case '+':
                if (last.length === 0) {
                    repeatErr(i);
                }
                last.push({
                    type: types.REPETITION,
                    min: 1,
                    max: Infinity,
                    value: last.pop(),
                });
                break;

            case '*':
                if (last.length === 0) {
                    repeatErr(i);
                }
                last.push({
                    type: types.REPETITION,
                    min: 0,
                    max: Infinity,
                    value: last.pop(),
                });
                break;


            // Default is a character that is not `\[](){}?+*^$`.
            default:
                last.push({
                    type: types.CHAR,
                    value: character.charCodeAt(0),
                });
        }

    }

    // Check if any groups have not been closed.
    if (groupStack.length !== 0) {
        util.error(regexpStr, 'Unterminated group');
    }

    return start;
};

module.exports.types = types;