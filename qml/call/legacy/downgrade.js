// Rewrites the syntax that Gecko 78 (Aurora OS 5.1) cannot parse into syntax
// it can, for the whiteboard code of the server (Excalidraw):
//   static { body }      ->  static __aurora_sbN = (() => { body })();
//   #name (fields, methods, a.#name, a?.#name)  ->  __aurora_name
//   #name in object      ->  "__aurora_name" in object
//   a ??= b (also ||=, &&=)  ->  a ?? (a = b)
// The private names become ordinary properties; the code keeps working as
// long as it does not rely on their privacy. Written in ES2017 so that it
// runs in Gecko 78 itself; needs the acorn parser (window.acorn).
(function (root) {
    'use strict';

    const LOGICAL = { '??=': '??', '||=': '||', '&&=': '&&' };

    function privateName(name) {
        return '__aurora_' + name;
    }

    function parse(source, acorn) {
        return acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
    }

    function children(node, callback) {
        for (const key in node) {
            if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
            const value = node[key];
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    if (value[i] && typeof value[i].type === 'string') callback(value[i]);
                }
            } else if (value && typeof value === 'object' && typeof value.type === 'string') {
                callback(value);
            }
        }
    }

    function apply(source, edits) {
        if (!edits.length) return source;
        edits.sort((a, b) => a.start - b.start);
        const parts = [];
        let at = 0;
        for (const edit of edits) {
            if (edit.start < at) continue;
            parts.push(source.slice(at, edit.start), edit.text);
            at = edit.end;
        }
        parts.push(source.slice(at));
        return parts.join('');
    }

    // Classes: static blocks and private names (the edits never overlap).
    function classes(source, ast) {
        const edits = [];
        let staticBlocks = 0;
        (function visit(node) {
            switch (node.type) {
            case 'StaticBlock': {
                // The body keeps its own text; only the frame changes.
                const open = source.indexOf('{', node.start);
                edits.push({ start: node.start, end: open + 1, text: 'static __aurora_sb' + (staticBlocks++) + '=(()=>{' });
                edits.push({ start: node.end - 1, end: node.end, text: '})();' });
                break;
            }
            case 'PrivateIdentifier':
                edits.push({ start: node.start, end: node.end, text: privateName(node.name) });
                return;
            case 'BinaryExpression':
                if (node.operator === 'in' && node.left.type === 'PrivateIdentifier') {
                    edits.push({ start: node.left.start, end: node.left.end, text: JSON.stringify(privateName(node.left.name)) });
                    visit(node.right);
                    return;
                }
                break;
            default:
                break;
            }
            children(node, visit);
        }(ast));
        return apply(source, edits);
    }

    // Logical assignments, innermost first (one level per pass).
    function logical(source, ast) {
        const edits = [];
        let found = false;
        (function visit(node) {
            let inner = false;
            const before = edits.length;
            children(node, child => { if (visit(child)) inner = true; });
            const mine = node.type === 'AssignmentExpression' && LOGICAL[node.operator];
            if (!mine) return inner;
            found = true;
            if (inner) {
                // An inner one is rewritten first; this one in a later pass.
                return true;
            }
            edits.length = before;
            const op = LOGICAL[node.operator];
            const value = source.slice(node.right.start, node.right.end);
            const target = node.left;
            let text;
            if (target.type === 'Identifier') {
                text = '(' + target.name + op + '(' + target.name + '=' + value + '))';
            } else if (target.type === 'MemberExpression' && !target.computed) {
                const object = source.slice(target.object.start, target.object.end);
                const name = target.property.name;
                text = '((__o)=>__o.' + name + op + '(__o.' + name + '=' + value + '))((' + object + '))';
            } else if (target.type === 'MemberExpression') {
                const object = source.slice(target.object.start, target.object.end);
                const key = source.slice(target.property.start, target.property.end);
                text = '((__o,__k)=>__o[__k]' + op + '(__o[__k]=' + value + '))((' + object + '),(' + key + '))';
            } else {
                return true;
            }
            edits.push({ start: node.start, end: node.end, text });
            return true;
        }(ast));
        return { source: apply(source, edits), found, changed: edits.length > 0 };
    }

    function downgrade(source, acorn) {
        let code = /static\s*\{|#/.test(source) ? classes(source, parse(source, acorn)) : source;
        if (!/\?\?=|\|\|=|&&=/.test(code)) return code;
        for (let pass = 0; pass < 20; pass++) {
            const result = logical(code, parse(code, acorn));
            code = result.source;
            if (!result.found || !result.changed) break;
        }
        return code;
    }

    root.auroraDowngrade = downgrade;
    if (typeof module === 'object' && module.exports) module.exports = downgrade;
}(typeof window !== 'undefined' ? window : this));
