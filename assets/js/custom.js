/* Custom behavior for Annah's Last Rodeo.
 *
 * Split into small, individually testable functions. A tiny export shim at the
 * bottom hands the API to Node (for unit tests in test/custom.test.js) and
 * auto-initializes in the browser. No build step or module loader required. */
(function () {
	'use strict';

	var SCROLL_THRESHOLD = 400; // px scrolled before the back-to-top button shows
	var POLL_INTERVAL_MS = 100; // hash-scroll poll interval
	var STABLE_TICKS_TO_SETTLE = 3; // consecutive unchanged positions => layout settled
	var MAX_SCROLL_ATTEMPTS = 40; // hard stop (~attempts * interval) so we never loop forever

	// Inline SVG arrow (centered in its viewBox) instead of a font glyph,
	// which avoids the icon-font's off-center metrics.
	var ARROW_SVG =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
		'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<polyline points="6 12 12 6 18 12"></polyline>' +
		'<line x1="12" y1="6" x2="12" y2="18"></line></svg>';

	// --- Back-to-top button --------------------------------------------------

	function createBackToTopButton(document) {
		var button = document.createElement('button');
		button.id = 'scroll-top';
		button.type = 'button';
		button.setAttribute('aria-label', 'Back to top');
		button.innerHTML = ARROW_SVG;
		return button;
	}

	// Pure: show/hide the button purely from a scroll position.
	function updateVisibility(button, scrollY) {
		if (scrollY > SCROLL_THRESHOLD) button.classList.add('visible');
		else button.classList.remove('visible');
	}

	function initBackToTop(browserWindow, document) {
		var button = createBackToTopButton(document);
		document.body.appendChild(button);

		var refreshVisibility = function () { updateVisibility(button, browserWindow.pageYOffset); };
		browserWindow.addEventListener('scroll', refreshVisibility, { passive: true });
		refreshVisibility();

		button.addEventListener('click', function () {
			browserWindow.scrollTo({ top: 0, behavior: 'smooth' });
			button.blur(); // drop focus so the button doesn't stay "selected"
		});
		return button;
	}

	// --- Hash scrolling ------------------------------------------------------

	// Build a stateful "scroll attempt" function. Each call nudges the window
	// toward the #hash target and returns true when polling should STOP. Two
	// things fight a clean jump, so a one-shot scroll isn't enough:
	//   1) the cowgirl photos have no intrinsic size, so they load *after* the
	//      browser's initial hash jump and reflow the target downward;
	//   2) on StatiCrypt pages the real content is injected only after decryption.
	// We re-scroll whenever the target's absolute position shifts, and stop once
	// it has held still for STABLE_TICKS_TO_SETTLE ticks (or we hit the cap).
	function makeHashScroller(browserWindow) {
		var previousTop = null;
		var stableTicks = 0;
		var attempts = 0;

		return function attemptScrollToTarget() {
			var hash = browserWindow.location.hash;
			if (!hash || hash === '#') return true;

			var targetElement;
			try { targetElement = browserWindow.document.querySelector(hash); }
			catch (selectorError) { return true; } // malformed selector: nothing we can do

			if (!targetElement) return ++attempts > MAX_SCROLL_ATTEMPTS; // target not present (yet)

			var currentTop = Math.round(
				targetElement.getBoundingClientRect().top + browserWindow.pageYOffset
			);
			if (currentTop !== previousTop) { targetElement.scrollIntoView(); stableTicks = 0; }
			else stableTicks++;
			previousTop = currentTop;

			return stableTicks >= STABLE_TICKS_TO_SETTLE || ++attempts > MAX_SCROLL_ATTEMPTS;
		};
	}

	function initHashScroll(browserWindow) {
		if (!browserWindow.location.hash) return null;
		// Don't let the browser restore the previous scroll position over our jump.
		if (browserWindow.history && 'scrollRestoration' in browserWindow.history)
			browserWindow.history.scrollRestoration = 'manual';

		var attemptScrollToTarget = makeHashScroller(browserWindow);
		var intervalId = browserWindow.setInterval(function () {
			if (attemptScrollToTarget()) browserWindow.clearInterval(intervalId);
		}, POLL_INTERVAL_MS);
		return intervalId;
	}

	function init(browserWindow, document) {
		initBackToTop(browserWindow, document);
		initHashScroll(browserWindow);
	}

	var api = {
		createBackToTopButton: createBackToTopButton,
		updateVisibility: updateVisibility,
		makeHashScroller: makeHashScroller,
		initBackToTop: initBackToTop,
		initHashScroll: initHashScroll,
		init: init,
		constants: {
			SCROLL_THRESHOLD: SCROLL_THRESHOLD,
			POLL_INTERVAL_MS: POLL_INTERVAL_MS,
			STABLE_TICKS_TO_SETTLE: STABLE_TICKS_TO_SETTLE,
			MAX_SCROLL_ATTEMPTS: MAX_SCROLL_ATTEMPTS
		}
	};

	if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node / tests
	else init(window, document); // browser

})();
