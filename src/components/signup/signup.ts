/**
 * Early access sign-up: progressive enhancement for every [data-signup-root]
 * (the pop-up and the /join page), plus the pop-up controller.
 *
 * Without this script the form still works: it posts to /api/subscribe and the
 * server redirects to /join/thanks.
 */
import { track } from '@vercel/analytics';
import { FIELD, type SubscribeRequest, type SubscribeResponse } from '@/lib/signups/contract';

const UTM_KEYS = [
  FIELD.utmSource,
  FIELD.utmMedium,
  FIELD.utmCampaign,
  FIELD.utmContent,
  FIELD.utmTerm,
] as const;
const ATTRIBUTION_KEY = 'sac:attribution';

type Attribution = Partial<Pick<SubscribeRequest, (typeof UTM_KEYS)[number] | 'referrer' | 'page'>>;

/** Remember where the visitor came from (first page of the visit wins, new UTM tags replace it). */
function captureAttribution(): Attribution {
  let stored: Attribution = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) ?? '{}') as Attribution;
  } catch {
    /* storage unavailable: fine */
  }
  const params = new URLSearchParams(window.location.search);
  const fromUrl: Attribution = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) fromUrl[key] = value.slice(0, 100);
  }
  const externalReferrer =
    document.referrer && !document.referrer.startsWith(window.location.origin)
      ? document.referrer.slice(0, 500)
      : undefined;

  const next: Attribution =
    Object.keys(fromUrl).length > 0
      ? { ...fromUrl, referrer: externalReferrer, page: window.location.pathname }
      : {
          ...stored,
          referrer: stored.referrer ?? externalReferrer,
          page: stored.page ?? window.location.pathname,
        };
  try {
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

const attribution = captureAttribution();

interface Messages {
  email: string;
  firstName: string;
  generic: string;
  rateLimited: string;
  submitting: string;
}

function enhance(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-signup-form]');
  if (!form) return;
  form.noValidate = true; // we show our own, friendlier messages

  const messages = JSON.parse(root.dataset.messages ?? '{}') as Messages;
  const formError = root.querySelector<HTMLElement>('[data-form-error]');
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]');
  const submitLabel = form.querySelector<HTMLElement>('[data-submit-label]');
  const idleLabel = submitLabel?.textContent ?? '';
  const successBody = root.querySelector<HTMLElement>('[data-success-body]');
  const successTitle = root.querySelector<HTMLElement>('[data-success-title]');
  // In the pop-up, the dialog's accessible name follows the visible state.
  const dialogEl = root.closest('dialog');
  const formLabel = dialogEl?.getAttribute('aria-labelledby') ?? null;
  const formDescription = dialogEl?.getAttribute('aria-describedby') ?? null;
  let shownAt = performance.now();
  let busy = false;

  const input = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

  function setFieldError(name: 'email' | 'firstName', message?: string) {
    const field = input(name);
    const hint = root.querySelector<HTMLElement>(`[data-field-error="${name}"]`);
    if (!field || !hint) return;
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      hint.textContent = message;
      hint.classList.remove('hidden');
    } else {
      field.removeAttribute('aria-invalid');
      hint.textContent = '';
      hint.classList.add('hidden');
    }
  }

  function showFormError(message?: string) {
    if (!formError) return;
    formError.textContent = message ?? '';
    formError.classList.toggle('hidden', !message);
  }

  function clearErrors() {
    setFieldError('email');
    setFieldError('firstName');
    showFormError();
  }

  function setBusy(next: boolean) {
    busy = next;
    if (submit) {
      submit.disabled = next;
      submit.setAttribute('aria-busy', String(next));
    }
    if (submitLabel) submitLabel.textContent = next ? messages.submitting : idleLabel;
  }

  function showSuccess(firstName: string | null) {
    if (successBody) {
      const template = firstName ? successBody.dataset.templateName : successBody.dataset.templatePlain;
      successBody.textContent = (template ?? '').replace('{name}', firstName ?? '');
    }
    root.dataset.state = 'success';
    if (dialogEl && successTitle?.id) {
      dialogEl.setAttribute('aria-labelledby', successTitle.id);
      dialogEl.removeAttribute('aria-describedby');
    }
    successTitle?.focus();
    try {
      track('Early access sign-up', { source: attribution.utm_source ?? 'direct' });
    } catch {
      /* analytics is optional */
    }
  }

  root.addEventListener('signup:reset', () => {
    shownAt = performance.now();
    clearErrors();
    if (root.dataset.state === 'success') form.reset();
    root.dataset.state = 'form';
    if (dialogEl && formLabel) dialogEl.setAttribute('aria-labelledby', formLabel);
    if (dialogEl && formDescription) dialogEl.setAttribute('aria-describedby', formDescription);
  });

  // Errors passed back by the no-JS redirect (/join?error=…)
  const errorParam = new URLSearchParams(window.location.search).get('error');
  if (errorParam) {
    showFormError(errorParam === 'rate_limited' ? messages.rateLimited : messages.generic);
  }

  // Clear a field's error as soon as it's edited.
  form.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === FIELD.email || target.name === FIELD.firstName) {
      setFieldError(target.name as 'email' | 'firstName');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    clearErrors();

    const emailInput = input(FIELD.email);
    const nameInput = input(FIELD.firstName);
    const email = emailInput?.value.trim() ?? '';
    const firstName = nameInput?.value.trim() ?? '';

    // Quick checks in the browser; the server validates again.
    if (!email || (emailInput && !emailInput.checkValidity()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('email', messages.email);
      emailInput?.focus();
      return;
    }
    if (firstName.length > 60) {
      setFieldError('firstName', messages.firstName);
      nameInput?.focus();
      return;
    }

    const payload: SubscribeRequest = {
      email,
      firstName: firstName || undefined,
      sac_hp: input(FIELD.honeypot)?.value ?? '',
      elapsedMs: Math.round(performance.now() - shownAt),
      consentVersion: input(FIELD.consentVersion)?.value,
      ...attribution,
    };

    setBusy(true);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({ ok: false, error: 'server' }))) as SubscribeResponse;

      if (result.ok) {
        showSuccess(result.firstName);
      } else if (result.error === 'validation') {
        const { email: emailError, firstName: nameError } = result.fieldErrors;
        if (nameError) setFieldError('firstName', nameError);
        if (emailError) setFieldError('email', emailError);
        (emailError ? emailInput : nameInput)?.focus();
      } else if (result.error === 'rate_limited') {
        showFormError(messages.rateLimited);
      } else {
        showFormError(messages.generic);
      }
    } catch {
      showFormError(messages.generic);
    } finally {
      setBusy(false);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Pop-up controller                                                    */
/* ------------------------------------------------------------------ */

function setupDialog(dialog: HTMLDialogElement) {
  const root = dialog.querySelector<HTMLElement>('[data-signup-root]');
  const finePointer = window.matchMedia('(pointer: fine)');
  let pushedHash = false;
  let pressStartedOnBackdrop = false;
  // Safari doesn't focus links on tap, so remember the button that opened the pop-up and
  // put focus back on it when it closes (keeps VoiceOver users where they were).
  let opener: HTMLElement | null = null;

  function open(fromClick: boolean) {
    if (dialog.open) return;
    root?.dispatchEvent(new Event('signup:reset'));
    dialog.showModal();
    // Phones: don't throw the keyboard up straight away; focus the title instead.
    const target = finePointer.matches
      ? dialog.querySelector<HTMLElement>('[data-autofocus]')
      : dialog.querySelector<HTMLElement>('[data-view="form"] [tabindex="-1"]');
    target?.focus();
    if (fromClick && window.location.hash !== '#join') {
      history.pushState({ signup: true }, '', '#join');
      pushedHash = true;
    }
  }

  dialog.addEventListener('close', () => {
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
    if (window.location.hash === '#join') {
      if (pushedHash) history.back();
      else history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    pushedHash = false;
  });

  // Close when clicking the backdrop (press and release both outside the panel).
  dialog.addEventListener('pointerdown', (event) => {
    pressStartedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && pressStartedOnBackdrop) dialog.close();
  });

  dialog.addEventListener('click', (event) => {
    if ((event.target as Element).closest('[data-signup-close]')) dialog.close();
  });

  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element).closest<HTMLElement>('[data-signup-open]');
    if (!trigger) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return; // let new-tab clicks go to /join
    }
    event.preventDefault();
    opener = trigger;
    open(true);
  });

  // /#join opens the pop-up (QR codes, links from Instagram or emails).
  const openFromHash = () => {
    if (window.location.hash === '#join') open(false);
    else if (dialog.open) dialog.close();
  };
  window.addEventListener('hashchange', openFromHash);
  window.addEventListener('popstate', () => {
    if (dialog.open && window.location.hash !== '#join') {
      pushedHash = false;
      dialog.close();
    }
  });
  openFromHash();
}

for (const root of document.querySelectorAll<HTMLElement>('[data-signup-root]')) enhance(root);
const dialog = document.querySelector<HTMLDialogElement>('[data-signup-dialog]');
if (dialog) setupDialog(dialog);
