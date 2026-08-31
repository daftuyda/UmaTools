(function () {
  if (window.UmaTutorial && typeof window.UmaTutorial.create === 'function') return;

  const STORAGE_PREFIX = 'umatools.tutorial';
  const MOBILE_MEDIA_QUERY = '(max-width: 760px)';
  const FOCUSABLE_SELECTOR =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseJSON(input, fallback) {
    try {
      return JSON.parse(input);
    } catch (_) {
      return fallback;
    }
  }

  function formatCopy(template, tokens) {
    if (typeof template !== 'string') return '';
    const dict = tokens && typeof tokens === 'object' ? tokens : {};
    return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key) => {
      const value = dict[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function sanitizeKey(input) {
    return String(input || 'page')
      .replace(/[^a-z0-9_-]/gi, '-')
      .toLowerCase();
  }

  class TutorialController {
    constructor(config) {
      this.config = config || {};
      this.pageKey = this.config.pageKey || 'default';
      this.panelTitle = this.config.panelTitle || t('tutorial.quickSetup');
      this.steps = Array.isArray(this.config.steps) ? this.config.steps : [];
      this.openButton =
        typeof this.config.openButton === 'string'
          ? document.querySelector(this.config.openButton)
          : this.config.openButton;
      this.stateKey = `${STORAGE_PREFIX}.${this.pageKey}`;
      this.state = this.readState();
      this.currentStep = clamp(
        Number.isFinite(Number(this.state.step)) ? Number(this.state.step) : 0,
        0,
        Math.max(0, this.steps.length - 1)
      );
      this.active = false;
      this.activeTarget = null;
      this.runtimeListenersAttached = false;

      this.panel = null;
      this.toast = null;
      this.coachmark = null;
      this.progressEl = null;
      this.currentTitleEl = null;
      this.currentCopyEl = null;
      this.checklistEl = null;
      this.backBtn = null;
      this.nextBtn = null;
      this.skipBtn = null;
      this.jumpBtn = null;
      this.closeBtn = null;
      this.liveEl = null;
      this.coachTitleEl = null;
      this.coachCopyEl = null;
      this.toastTitleEl = null;
      this.toastCopyEl = null;
      this.toastStartBtn = null;
      this.toastDismissBtn = null;

      this.onOpenClick = this.onOpenClick.bind(this);
      this.onChecklistClick = this.onChecklistClick.bind(this);
      this.onRuntimeReposition = this.onRuntimeReposition.bind(this);
      this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
    }

    init() {
      if (!this.steps.length) return;
      this.ensureUI();
      this.bindStaticEvents();
      this.refreshOpenButtonState();

      if (this.state.status === 'in_progress') {
        this.showPrompt('resume');
      } else if (!this.state.status) {
        this.showPrompt('start');
      }
    }

    ensureUI() {
      if (!document.body || this.panel) return;
      const panelId = `tutorial-panel-${sanitizeKey(this.pageKey)}`;

      const panel = document.createElement('section');
      panel.id = panelId;
      panel.className = 'tutorial-panel';
      panel.hidden = true;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'false');
      panel.setAttribute('aria-label', this.panelTitle);
      panel.innerHTML = `
        <div class="tutorial-panel-header">
          <h2 class="tutorial-panel-title"></h2>
          <button type="button" class="tutorial-close-btn" aria-label="Close tutorial" data-i18n-aria="tutorial.closeTutorial">&times;</button>
        </div>
        <p class="tutorial-progress"></p>
        <h3 class="tutorial-current-title"></h3>
        <p class="tutorial-current-copy"></p>
        <button type="button" class="btn btn-secondary tutorial-jump-btn" data-i18n="tutorial.jumpToField" hidden>Jump to highlighted field</button>
        <ol class="tutorial-checklist"></ol>
        <div class="tutorial-controls">
          <button type="button" class="btn btn-secondary tutorial-back" data-i18n="tutorial.back">Back</button>
          <button type="button" class="btn tutorial-next" data-i18n="tutorial.next">Next</button>
          <button type="button" class="btn btn-secondary tutorial-skip" data-i18n="tutorial.skip">Skip</button>
        </div>
        <p class="tutorial-hint" data-i18n="tutorial.keyboardHint">Use Left/Right Arrow for steps. Press Esc to skip.</p>
        <p class="tutorial-sr-only tutorial-live" aria-live="polite"></p>
      `;

      const coachmark = document.createElement('div');
      coachmark.className = 'tutorial-coachmark';
      coachmark.hidden = true;
      coachmark.setAttribute('role', 'status');
      coachmark.setAttribute('aria-live', 'polite');
      coachmark.innerHTML = `
        <p class="tutorial-coachmark-title"></p>
        <p class="tutorial-coachmark-copy"></p>
      `;

      const toast = document.createElement('aside');
      toast.className = 'tutorial-launch-toast';
      toast.hidden = true;
      toast.innerHTML = `
        <p class="tutorial-toast-title"></p>
        <p class="tutorial-toast-copy"></p>
        <div class="tutorial-toast-actions">
          <button type="button" class="btn tutorial-toast-start" data-i18n="tutorial.startTour">Start tour</button>
          <button type="button" class="btn btn-secondary tutorial-toast-dismiss" data-i18n="tutorial.notNow">Not now</button>
        </div>
      `;

      document.body.appendChild(panel);
      document.body.appendChild(coachmark);
      document.body.appendChild(toast);

      // Apply i18n translations to dynamically created elements
      if (typeof window.applyI18n === 'function') {
        window.applyI18n(panel);
        window.applyI18n(toast);
      }

      this.panel = panel;
      this.coachmark = coachmark;
      this.toast = toast;
      this.progressEl = panel.querySelector('.tutorial-progress');
      this.currentTitleEl = panel.querySelector('.tutorial-current-title');
      this.currentCopyEl = panel.querySelector('.tutorial-current-copy');
      this.checklistEl = panel.querySelector('.tutorial-checklist');
      this.backBtn = panel.querySelector('.tutorial-back');
      this.nextBtn = panel.querySelector('.tutorial-next');
      this.skipBtn = panel.querySelector('.tutorial-skip');
      this.jumpBtn = panel.querySelector('.tutorial-jump-btn');
      this.closeBtn = panel.querySelector('.tutorial-close-btn');
      this.liveEl = panel.querySelector('.tutorial-live');
      this.coachTitleEl = coachmark.querySelector('.tutorial-coachmark-title');
      this.coachCopyEl = coachmark.querySelector('.tutorial-coachmark-copy');
      this.toastTitleEl = toast.querySelector('.tutorial-toast-title');
      this.toastCopyEl = toast.querySelector('.tutorial-toast-copy');
      this.toastStartBtn = toast.querySelector('.tutorial-toast-start');
      this.toastDismissBtn = toast.querySelector('.tutorial-toast-dismiss');
      const panelTitleEl = panel.querySelector('.tutorial-panel-title');
      if (panelTitleEl) panelTitleEl.textContent = this.panelTitle;
    }

    bindStaticEvents() {
      if (this.openButton) {
        this.openButton.addEventListener('click', this.onOpenClick);
      }
      if (this.checklistEl) {
        this.checklistEl.addEventListener('click', this.onChecklistClick);
      }
      if (this.backBtn) {
        this.backBtn.addEventListener('click', () => this.prevStep());
      }
      if (this.nextBtn) {
        this.nextBtn.addEventListener('click', () => this.nextStep());
      }
      if (this.skipBtn) {
        this.skipBtn.addEventListener('click', () => this.skip());
      }
      if (this.jumpBtn) {
        this.jumpBtn.addEventListener('click', () => this.jumpToTarget());
      }
      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', () => this.close({ reason: 'manual' }));
      }
      if (this.toastStartBtn) {
        this.toastStartBtn.addEventListener('click', () => {
          const shouldResume = this.toast && this.toast.dataset.kind === 'resume';
          this.start({ resume: shouldResume });
        });
      }
      if (this.toastDismissBtn) {
        this.toastDismissBtn.addEventListener('click', () => {
          this.writeState({ status: 'dismissed', step: this.currentStep });
          this.hidePrompt();
        });
      }
    }

    onOpenClick(event) {
      if (event) event.preventDefault();
      if (this.active) {
        this.close({ reason: 'manual' });
        return;
      }
      this.start({ resume: true, focusPanel: true });
    }

    onChecklistClick(event) {
      const button =
        event.target && event.target.closest
          ? event.target.closest('.tutorial-check-button')
          : null;
      if (!button) return;
      const index = Number(button.dataset.stepIndex);
      if (!Number.isFinite(index)) return;
      this.goToStep(index);
    }

    start({ resume = true, focusPanel = false } = {}) {
      if (!this.steps.length) return;
      this.hidePrompt();
      const saved = this.readState();
      const startStep = resume && saved.status === 'in_progress' ? Number(saved.step) : 0;
      this.currentStep = clamp(
        Number.isFinite(startStep) ? startStep : 0,
        0,
        this.steps.length - 1
      );
      this.active = true;
      this.attachRuntimeEvents();
      this.writeState({ status: 'in_progress', step: this.currentStep });

      if (this.panel) this.panel.hidden = false;
      this.renderCurrentStep({ shouldScroll: true });
      this.refreshOpenButtonState();

      if (focusPanel && this.nextBtn) {
        this.nextBtn.focus({ preventScroll: true });
      }
    }

    close({ reason = 'manual' } = {}) {
      if (!this.active && reason !== 'skip' && reason !== 'complete') {
        this.hidePrompt();
        this.refreshOpenButtonState();
        return;
      }

      this.active = false;
      this.detachRuntimeEvents();
      this.clearTargetHighlight();
      this.hidePrompt();

      if (this.panel) this.panel.hidden = true;
      if (this.coachmark) this.coachmark.hidden = true;

      if (reason === 'skip') {
        this.writeState({ status: 'dismissed', step: this.currentStep });
      } else if (reason === 'complete') {
        this.writeState({ status: 'completed', step: this.steps.length - 1 });
      } else if (reason === 'manual') {
        this.writeState({ status: 'in_progress', step: this.currentStep });
      }

      this.refreshOpenButtonState();
    }

    skip() {
      this.close({ reason: 'skip' });
    }

    complete() {
      this.close({ reason: 'complete' });
    }

    nextStep() {
      if (!this.active) return;
      if (this.currentStep >= this.steps.length - 1) {
        this.complete();
        return;
      }
      this.currentStep += 1;
      this.writeState({ status: 'in_progress', step: this.currentStep });
      this.renderCurrentStep({ shouldScroll: true });
    }

    prevStep() {
      if (!this.active) return;
      if (this.currentStep <= 0) return;
      this.currentStep -= 1;
      this.writeState({ status: 'in_progress', step: this.currentStep });
      this.renderCurrentStep({ shouldScroll: false });
    }

    goToStep(index) {
      if (!this.active) return;
      if (!Number.isFinite(index)) return;
      this.currentStep = clamp(index, 0, this.steps.length - 1);
      this.writeState({ status: 'in_progress', step: this.currentStep });
      this.renderCurrentStep({ shouldScroll: true });
    }

    renderCurrentStep({ shouldScroll = true } = {}) {
      if (!this.active) return;
      const step = this.steps[this.currentStep];
      if (!step) return;

      const tokens = this.resolveTokens();
      const title = formatCopy(step.title || `Step ${this.currentStep + 1}`, tokens).trim();
      const copy = formatCopy(step.text || '', tokens).trim();

      if (this.progressEl) {
        this.progressEl.textContent = t('tutorial.stepOf', {
          current: this.currentStep + 1,
          total: this.steps.length,
        });
      }
      if (this.currentTitleEl) this.currentTitleEl.textContent = title;
      if (this.currentCopyEl) this.currentCopyEl.textContent = copy;
      if (this.liveEl)
        this.liveEl.textContent =
          t('tutorial.stepOf', { current: this.currentStep + 1, total: this.steps.length }) +
          ': ' +
          title;
      if (this.coachTitleEl) this.coachTitleEl.textContent = title;
      if (this.coachCopyEl) this.coachCopyEl.textContent = copy;
      if (this.backBtn) this.backBtn.disabled = this.currentStep === 0;
      if (this.nextBtn) {
        this.nextBtn.textContent =
          this.currentStep >= this.steps.length - 1 ? t('tutorial.done') : t('tutorial.next');
      }

      this.renderChecklist(tokens);
      this.applyTarget(step, { shouldScroll });
      this.updateJumpButton();
      this.positionCoachmark();
    }

    renderChecklist(tokens) {
      if (!this.checklistEl) return;
      const fragment = document.createDocumentFragment();
      this.steps.forEach((step, index) => {
        const li = document.createElement('li');
        li.className = 'tutorial-check-item';
        if (index < this.currentStep) li.classList.add('is-complete');
        if (index === this.currentStep) li.classList.add('is-active');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn tutorial-check-button';
        button.dataset.stepIndex = String(index);
        const label = formatCopy(
          step.shortTitle || step.title || `Step ${index + 1}`,
          tokens
        ).trim();
        button.textContent = `${index + 1}. ${label}`;
        if (index === this.currentStep) {
          button.setAttribute('aria-current', 'step');
        }
        li.appendChild(button);
        fragment.appendChild(li);
      });

      this.checklistEl.innerHTML = '';
      this.checklistEl.appendChild(fragment);
    }

    applyTarget(step, { shouldScroll = true } = {}) {
      const target = this.resolveTarget(step.target);
      this.clearTargetHighlight();

      if (!target) {
        this.activeTarget = null;
        if (this.coachmark) this.coachmark.hidden = true;
        return;
      }

      this.activeTarget = target;
      target.classList.add('tutorial-target-active');

      if (shouldScroll) {
        this.scrollTargetIntoView(target);
      }
    }

    clearTargetHighlight() {
      if (this.activeTarget && this.activeTarget.classList) {
        this.activeTarget.classList.remove('tutorial-target-active');
      }
      this.activeTarget = null;
    }

    resolveTarget(targetDef) {
      if (!targetDef) return null;

      let target = null;
      if (typeof targetDef === 'string') {
        target = document.querySelector(targetDef);
      } else if (typeof targetDef === 'function') {
        target = targetDef();
      } else if (targetDef && targetDef.nodeType === 1) {
        target = targetDef;
      }

      if (!target || typeof target.getBoundingClientRect !== 'function') {
        return null;
      }
      const rect = target.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        return null;
      }
      return target;
    }

    scrollTargetIntoView(target) {
      if (!target || typeof target.getBoundingClientRect !== 'function') return;
      const rect = target.getBoundingClientRect();
      const margin = this.isMobile() ? 92 : 120;
      const isOutOfView = rect.top < margin || rect.bottom > window.innerHeight - margin;
      if (!isOutOfView) return;
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }

    updateJumpButton() {
      if (!this.jumpBtn) return;
      if (!this.activeTarget) {
        this.jumpBtn.hidden = true;
        return;
      }
      const rect = this.activeTarget.getBoundingClientRect();
      const isOutOfView = rect.top < 0 || rect.bottom > window.innerHeight;
      this.jumpBtn.hidden = !(this.isMobile() || isOutOfView);
    }

    jumpToTarget() {
      if (!this.activeTarget) return;
      this.scrollTargetIntoView(this.activeTarget);
      const focusTarget = this.findFocusableTarget(this.activeTarget);
      if (focusTarget) {
        focusTarget.focus({ preventScroll: true });
      }
    }

    findFocusableTarget(target) {
      if (!target || typeof target.matches !== 'function') return null;
      if (target.matches(FOCUSABLE_SELECTOR) && !target.disabled) {
        return target;
      }
      const nested = target.querySelector(FOCUSABLE_SELECTOR);
      if (nested && !nested.disabled) {
        return nested;
      }
      return null;
    }

    positionCoachmark() {
      if (!this.coachmark) return;
      if (!this.active || !this.activeTarget || this.isMobile()) {
        this.coachmark.hidden = true;
        return;
      }

      const targetRect = this.activeTarget.getBoundingClientRect();
      if (!targetRect || (targetRect.width === 0 && targetRect.height === 0)) {
        this.coachmark.hidden = true;
        return;
      }

      this.coachmark.hidden = false;
      this.coachmark.style.visibility = 'hidden';
      this.coachmark.style.top = '0px';
      this.coachmark.style.left = '0px';

      const box = this.coachmark.getBoundingClientRect();
      const margin = 12;
      let top = targetRect.top - box.height - margin;
      let placement = 'top';
      if (top < margin) {
        top = targetRect.bottom + margin;
        placement = 'bottom';
      }
      top = clamp(top, margin, Math.max(margin, window.innerHeight - box.height - margin));
      let left = targetRect.left + (targetRect.width - box.width) / 2;
      left = clamp(left, margin, Math.max(margin, window.innerWidth - box.width - margin));

      this.coachmark.dataset.placement = placement;
      this.coachmark.style.top = `${Math.round(top)}px`;
      this.coachmark.style.left = `${Math.round(left)}px`;
      this.coachmark.style.visibility = 'visible';
    }

    onRuntimeReposition() {
      if (!this.active) return;
      this.positionCoachmark();
      this.updateJumpButton();
    }

    onDocumentKeydown(event) {
      if (!this.active || !event) return;
      const key = event.key;
      if (key === 'Escape') {
        event.preventDefault();
        this.skip();
        return;
      }

      const target = event.target;
      const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isTextEditingOutsidePanel =
        !this.panel?.contains(target) &&
        (tagName === 'input' || tagName === 'textarea' || tagName === 'select');
      if (isTextEditingOutsidePanel) return;

      if (key === 'ArrowRight') {
        event.preventDefault();
        this.nextStep();
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        this.prevStep();
      }
    }

    attachRuntimeEvents() {
      if (this.runtimeListenersAttached) return;
      window.addEventListener('resize', this.onRuntimeReposition);
      window.addEventListener('scroll', this.onRuntimeReposition, true);
      document.addEventListener('keydown', this.onDocumentKeydown);
      this.runtimeListenersAttached = true;
    }

    detachRuntimeEvents() {
      if (!this.runtimeListenersAttached) return;
      window.removeEventListener('resize', this.onRuntimeReposition);
      window.removeEventListener('scroll', this.onRuntimeReposition, true);
      document.removeEventListener('keydown', this.onDocumentKeydown);
      this.runtimeListenersAttached = false;
    }

    showPrompt(kind) {
      if (this.active || !this.toast || this.state.status === 'completed') return;
      this.toast.dataset.kind = kind;
      if (kind === 'resume') {
        const stepNumber = clamp((Number(this.state.step) || 0) + 1, 1, this.steps.length);
        if (this.toastTitleEl) this.toastTitleEl.textContent = t('tutorial.resumeTitle');
        if (this.toastCopyEl)
          this.toastCopyEl.textContent = t('tutorial.resumeCopy', {
            step: stepNumber,
            total: this.steps.length,
          });
        if (this.toastStartBtn) this.toastStartBtn.textContent = t('tutorial.resume');
      } else {
        if (this.toastTitleEl) this.toastTitleEl.textContent = t('tutorial.newHereTitle');
        if (this.toastCopyEl) this.toastCopyEl.textContent = t('tutorial.newHereCopy');
        if (this.toastStartBtn) this.toastStartBtn.textContent = t('tutorial.startTour');
      }
      this.toast.hidden = false;
    }

    hidePrompt() {
      if (this.toast) this.toast.hidden = true;
    }

    resolveTokens() {
      if (typeof this.config.getTokens === 'function') {
        try {
          const tokens = this.config.getTokens();
          if (tokens && typeof tokens === 'object') return tokens;
        } catch (_) {
          return {};
        }
      }
      return {};
    }

    isMobile() {
      return (
        typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_MEDIA_QUERY).matches
      );
    }

    readState() {
      try {
        const raw = localStorage.getItem(this.stateKey);
        if (!raw) return {};
        const parsed = parseJSON(raw, {});
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    writeState(patch) {
      const nextState = {
        ...this.readState(),
        ...(patch || {}),
        updatedAt: Date.now(),
      };
      this.state = nextState;
      this.currentStep = clamp(
        Number.isFinite(Number(nextState.step)) ? Number(nextState.step) : this.currentStep,
        0,
        Math.max(0, this.steps.length - 1)
      );
      try {
        localStorage.setItem(this.stateKey, JSON.stringify(nextState));
      } catch (_) {}
      return nextState;
    }

    refreshOpenButtonState() {
      if (!this.openButton) return;
      const controlsId = this.panel ? this.panel.id : '';
      if (controlsId) {
        this.openButton.setAttribute('aria-controls', controlsId);
      }
      this.openButton.setAttribute('aria-expanded', this.active ? 'true' : 'false');
      this.openButton.setAttribute('aria-label', t('tutorial.openHelp'));
    }
  }

  window.UmaTutorial = {
    create(config) {
      return new TutorialController(config);
    },
  };
})();
