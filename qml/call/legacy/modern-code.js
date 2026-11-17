// Runs in a page of the Gecko WebView (Aurora OS 5.1, Firefox 78 engine)
// before the page's own code: adds the newer built-in functions the Jitsi
// whiteboard uses, and loads the server's script chunks itself, rewriting a
// chunk the engine cannot parse with auroraDowngrade (downgrade.js, which
// needs acorn.js; both run before this file).
(function () {
    'use strict';
    // Installed once per page (the frame script runs it again when the
    // document is ready, in case the window was replaced).
    if (window.__auroraModernCode) return;
    window.__auroraModernCode = true;

    function define(target, name, value) {
        if (target && !(name in target)) {
            Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
        }
    }

    // --------------------------------------------------------- built-ins
    function at(index) {
        const length = this.length >>> 0;
        let i = Math.trunc(index) || 0;
        if (i < 0) i += length;
        return i < 0 || i >= length ? undefined : this[i];
    }
    define(Array.prototype, 'at', at);
    define(String.prototype, 'at', function (index) { return at.call(String(this), index); });
    const typed = Object.getPrototypeOf(Int8Array.prototype);
    define(typed, 'at', at);
    define(Array.prototype, 'findLast', function (test, self) {
        for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return this[i];
        return undefined;
    });
    define(Array.prototype, 'findLastIndex', function (test, self) {
        for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return i;
        return -1;
    });
    define(Object, 'hasOwn', function (object, key) { return Object.prototype.hasOwnProperty.call(Object(object), key); });
    define(window, 'structuredClone', function (value) {
        // Plain data only (what the whiteboard clones: scene elements).
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    });
    if (window.crypto) {
        define(window.crypto, 'randomUUID', function () {
            const bytes = window.crypto.getRandomValues(new Uint8Array(16));
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
            return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
        });
    }
    if (!Promise.any) {
        define(Promise, 'any', function (values) {
            return new Promise((resolve, reject) => {
                const list = Array.from(values);
                let left = list.length;
                if (!left) reject(new Error('All promises were rejected'));
                list.forEach(item => Promise.resolve(item).then(resolve, () => {
                    if (--left === 0) reject(new Error('All promises were rejected'));
                }));
            });
        });
    }
    function roundRect(x, y, width, height, radii) {
        let r = Array.isArray(radii) ? radii[0] : radii;
        r = typeof r === 'number' ? r : (r && typeof r.x === 'number' ? r.x : 0);
        r = Math.max(0, Math.min(r, Math.abs(width) / 2, Math.abs(height) / 2));
        this.moveTo(x + r, y);
        this.lineTo(x + width - r, y);
        this.arcTo(x + width, y, x + width, y + r, r);
        this.lineTo(x + width, y + height - r);
        this.arcTo(x + width, y + height, x + width - r, y + height, r);
        this.lineTo(x + r, y + height);
        this.arcTo(x, y + height, x, y + height - r, r);
        this.lineTo(x, y + r);
        this.arcTo(x, y, x + r, y, r);
        this.closePath();
    }
    if (window.CanvasRenderingContext2D) define(CanvasRenderingContext2D.prototype, 'roundRect', roundRect);
    if (window.Path2D) define(Path2D.prototype, 'roundRect', roundRect);

    // ------------------------------------------------------ script chunks
    // A chunk script (webpack) is fetched and checked; one the engine cannot
    // parse is rewritten, then run as an inline script, and the original
    // element gets its load (or error) event as webpack expects.
    const appendChild = Node.prototype.appendChild;
    const insertBefore = Node.prototype.insertBefore;
    const own = new WeakSet();

    function report(text) {
        try { console.warn('[aurora] ' + text); } catch (error) { /* nothing */ }
    }

    function take(node) {
        if (!(node instanceof HTMLScriptElement) || own.has(node) || !node.src) return false;
        report('script ' + node.src);
        // The page's own entry scripts are in the HTML and already parsed.
        if (!/\/libs\/.+\.js(\?|$)/.test(node.src) || /lib-jitsi-meet|app\.bundle/.test(node.src)) return false;
        const element = node;
        fetch(element.src, { credentials: 'same-origin' }).then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
        }).then(text => {
            let code = text;
            try {
                // eslint-disable-next-line no-new-func
                new Function(code);
            } catch (error) {
                if (!(error instanceof SyntaxError) || !window.auroraDowngrade || !window.acorn) throw error;
                const started = Date.now();
                code = window.auroraDowngrade(code, window.acorn);
                report('rewrote ' + element.src + ' in ' + (Date.now() - started) + ' ms');
            }
            const script = document.createElement('script');
            own.add(script);
            script.text = code + '\n//# sourceURL=' + element.src;
            appendChild.call(document.head || document.documentElement, script);
            element.dispatchEvent(new Event('load'));
        }).catch(error => {
            report('chunk ' + element.src + ' failed: ' + (error && error.message));
            element.dispatchEvent(new Event('error'));
        });
        return true;
    }

    Node.prototype.appendChild = function (node) {
        return take(node) ? node : appendChild.call(this, node);
    };
    Node.prototype.insertBefore = function (node, reference) {
        return take(node) ? node : insertBefore.call(this, node, reference);
    };
    report('installed in ' + location.href.split('#')[0]);
}());
