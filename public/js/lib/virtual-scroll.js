(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VirtualScroll = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_ITEM_HEIGHT = 50;
  var DEFAULT_BUFFER_SIZE = 5;
  var DEFAULT_THROTTLE_MS = 16;

  /**
   * VirtualScroll - Efficiently renders large lists by only rendering visible items
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.container - Container element
   * @param {Array} options.items - Array of items to render
   * @param {Function} options.renderItem - Function to render each item (item, index) => HTMLElement
   * @param {number} options.itemHeight - Height of each item in pixels
   * @param {number} options.bufferSize - Number of extra items to render above/below viewport
   * @param {Function} options.onScroll - Optional callback on scroll
   */
  function VirtualScroll(options) {
    if (!options.container) {
      throw new Error('VirtualScroll requires a container element');
    }
    if (!options.items) {
      throw new Error('VirtualScroll requires items array');
    }
    if (!options.renderItem || typeof options.renderItem !== 'function') {
      throw new Error('VirtualScroll requires renderItem function');
    }

    this.container = options.container;
    this.items = options.items || [];
    this.renderItem = options.renderItem;
    this.itemHeight = options.itemHeight || DEFAULT_ITEM_HEIGHT;
    this.bufferSize = options.bufferSize || DEFAULT_BUFFER_SIZE;
    this.onScrollCallback = options.onScroll || null;

    this.scrollContainer = null;
    this.contentContainer = null;
    this.renderedElements = {};
    this.visibleRange = { start: 0, end: 0 };
    this.scrollThrottleTimer = null;
    this.observer = null;

    this.init();
  }

  VirtualScroll.prototype.init = function () {
    this.setupDOM();
    this.updateTotalHeight();
    this.attachScrollListener();
    this.setupIntersectionObserver();
    this.render();
  };

  VirtualScroll.prototype.setupDOM = function () {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';

    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'virtual-scroll-content';
    this.contentContainer.style.position = 'relative';
    this.contentContainer.style.width = '100%';
    this.contentContainer.style.contain = 'layout style';

    this.container.appendChild(this.contentContainer);
  };

  VirtualScroll.prototype.updateTotalHeight = function () {
    var totalHeight = this.items.length * this.itemHeight;
    this.contentContainer.style.height = totalHeight + 'px';
  };

  VirtualScroll.prototype.attachScrollListener = function () {
    var self = this;
    this.container.addEventListener('scroll', function () {
      if (self.scrollThrottleTimer) return;
      self.scrollThrottleTimer = setTimeout(function () {
        self.handleScroll();
        self.scrollThrottleTimer = null;
      }, DEFAULT_THROTTLE_MS);
    });
  };

  VirtualScroll.prototype.setupIntersectionObserver = function () {
    var self = this;
    if (typeof IntersectionObserver === 'undefined') return;

    this.observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var index = parseInt(entry.target.dataset.virtualIndex, 10);
          if (!entry.isIntersecting && self.renderedElements[index]) {
            self.recycleElement(index);
          }
        });
      },
      {
        root: this.container,
        rootMargin: this.itemHeight * this.bufferSize + 'px'
      }
    );
  };

  VirtualScroll.prototype.handleScroll = function () {
    this.render();
    if (this.onScrollCallback) {
      this.onScrollCallback(this.container.scrollTop);
    }
  };

  VirtualScroll.prototype.getVisibleRange = function () {
    var scrollTop = this.container.scrollTop;
    var viewportHeight = this.container.clientHeight;

    var startIndex = Math.floor(scrollTop / this.itemHeight) - this.bufferSize;
    var endIndex =
      Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + this.bufferSize;

    startIndex = Math.max(0, startIndex);
    endIndex = Math.min(this.items.length - 1, endIndex);

    return { start: startIndex, end: endIndex };
  };

  VirtualScroll.prototype.render = function () {
    var newRange = this.getVisibleRange();
    var i;

    // Remove elements outside the new range
    for (i = this.visibleRange.start; i <= this.visibleRange.end; i++) {
      if (i < newRange.start || i > newRange.end) {
        this.recycleElement(i);
      }
    }

    // Add elements in the new range
    for (i = newRange.start; i <= newRange.end; i++) {
      if (!this.renderedElements[i]) {
        this.renderItemAtIndex(i);
      }
    }

    this.visibleRange = newRange;
  };

  VirtualScroll.prototype.renderItemAtIndex = function (index) {
    if (index < 0 || index >= this.items.length) return;
    if (this.renderedElements[index]) return;

    var item = this.items[index];
    var element = this.renderItem(item, index);

    if (!element || !element.nodeType) {
      throw new Error('renderItem must return a valid DOM element');
    }

    element.style.position = 'absolute';
    element.style.top = index * this.itemHeight + 'px';
    element.style.width = '100%';
    element.style.height = this.itemHeight + 'px';
    element.dataset.virtualIndex = index;

    this.contentContainer.appendChild(element);
    this.renderedElements[index] = element;

    if (this.observer) {
      this.observer.observe(element);
    }
  };

  VirtualScroll.prototype.recycleElement = function (index) {
    var element = this.renderedElements[index];
    if (!element) return;

    if (this.observer) {
      this.observer.unobserve(element);
    }

    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }

    delete this.renderedElements[index];
  };

  VirtualScroll.prototype.updateItems = function (newItems) {
    this.items = newItems || [];
    this.clear();
    this.updateTotalHeight();
    this.render();
  };

  VirtualScroll.prototype.scrollToIndex = function (index, behavior) {
    if (index < 0 || index >= this.items.length) return;
    var scrollTop = index * this.itemHeight;
    this.container.scrollTo({
      top: scrollTop,
      behavior: behavior || 'smooth'
    });
  };

  VirtualScroll.prototype.clear = function () {
    if (!this.renderedElements) return;
    var indices = Object.keys(this.renderedElements);
    for (var i = 0; i < indices.length; i++) {
      this.recycleElement(parseInt(indices[i], 10));
    }
    this.visibleRange = { start: 0, end: 0 };
  };

  VirtualScroll.prototype.destroy = function () {
    this.clear();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }

    if (this.contentContainer && this.contentContainer.parentNode) {
      this.contentContainer.parentNode.removeChild(this.contentContainer);
    }

    this.container = null;
    this.items = null;
    this.renderItem = null;
    this.renderedElements = null;
  };

  VirtualScroll.prototype.getRenderedCount = function () {
    return Object.keys(this.renderedElements).length;
  };

  VirtualScroll.prototype.getTotalCount = function () {
    return this.items.length;
  };

  return VirtualScroll;
});
