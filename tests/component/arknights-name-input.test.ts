// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArknightsNameInputElement,
  defineArknightsNameInput,
} from '../../src/index.js';

beforeEach(() => {
  defineArknightsNameInput();
  document.body.replaceChildren();
});

function componentParts(): {
  element: ArknightsNameInputElement;
  input: HTMLInputElement;
  list: HTMLDivElement;
  status: HTMLDivElement;
} {
  const element = document.createElement('arknights-name-input');
  document.body.append(element);
  const input = element.shadowRoot?.querySelector('input');
  const wrapper = element.shadowRoot?.querySelector('.wrapper');
  const list = wrapper?.children[1];
  const status = wrapper?.children[2];

  expect(input).toBeInstanceOf(HTMLInputElement);
  expect(list).toBeInstanceOf(HTMLDivElement);
  expect(status).toBeInstanceOf(HTMLDivElement);
  if (
    !(input instanceof HTMLInputElement)
    || !(list instanceof HTMLDivElement)
    || !(status instanceof HTMLDivElement)
  ) {
    throw new Error('component parts were not rendered');
  }
  return { element, input, list, status };
}

function edit(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    composed: true,
    inputType: 'insertText',
  }));
}

function press(input: HTMLInputElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    key,
  });
  input.dispatchEvent(event);
  return event;
}

describe('ArknightsNameInputElement public API', () => {
  it('observes exactly the four public attributes', () => {
    expect(ArknightsNameInputElement.observedAttributes).toEqual([
      'value',
      'placeholder',
      'disabled',
      'max-results',
    ]);
  });

  it('reflects value, placeholder, disabled, and max-results in both directions', () => {
    const element = document.createElement('arknights-name-input');
    element.setAttribute('value', '铃兰');
    element.setAttribute('placeholder', '输入干员');
    element.setAttribute('max-results', '3');
    element.setAttribute('disabled', '');
    document.body.append(element);

    expect(element.value).toBe('铃兰');
    expect(element.placeholder).toBe('输入干员');
    expect(element.maxResults).toBe(3);
    expect(element.disabled).toBe(true);

    element.value = '能天使';
    element.placeholder = '正式名称';
    element.maxResults = 5;
    element.disabled = false;

    expect(element.getAttribute('value')).toBe('能天使');
    expect(element.getAttribute('placeholder')).toBe('正式名称');
    expect(element.getAttribute('max-results')).toBe('5');
    expect(element.hasAttribute('disabled')).toBe(false);
  });

  it('marks only exact official display names valid and returns a cloned selection', () => {
    const element = document.createElement('arknights-name-input');
    document.body.append(element);

    element.value = '铃兰';
    expect(element.valid).toBe(true);
    expect(element.selectedCharacter?.id).toBe('prts:147');

    const selected = element.selectedCharacter;
    expect(selected).not.toBe(element.selectedCharacter);
    if (selected !== null) selected.name = '已篡改';
    expect(element.selectedCharacter?.name).toBe('铃兰');

    element.value = 'll';
    expect(element.value).toBe('ll');
    expect(element.valid).toBe(false);
    expect(element.selectedCharacter).toBeNull();
  });

  it('does not dispatch user events for programmatic value or clear', () => {
    const element = document.createElement('arknights-name-input');
    const inputListener = vi.fn();
    const selectListener = vi.fn();
    element.addEventListener('input', inputListener);
    element.addEventListener('character-select', selectListener);
    document.body.append(element);

    element.value = '铃兰';
    element.clear();

    expect(element.value).toBe('');
    expect(element.valid).toBe(false);
    expect(element.selectedCharacter).toBeNull();
    expect(inputListener).not.toHaveBeenCalled();
    expect(selectListener).not.toHaveBeenCalled();
  });

  it('re-emits one composed bubbling input event for genuine user editing', () => {
    const element = document.createElement('arknights-name-input');
    const captureListener = vi.fn();
    const bubbleListener = vi.fn();
    element.addEventListener('input', captureListener, { capture: true });
    element.addEventListener('input', bubbleListener);
    document.body.append(element);
    const input = element.shadowRoot?.querySelector('input');
    expect(input).toBeInstanceOf(HTMLInputElement);

    if (!(input instanceof HTMLInputElement)) return;
    input.value = '自由文本';
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
    }));

    expect(captureListener).toHaveBeenCalledOnce();
    expect(bubbleListener).toHaveBeenCalledOnce();
    const event = captureListener.mock.calls[0]?.[0] as InputEvent;
    expect(event).toBe(bubbleListener.mock.calls[0]?.[0]);
    expect(event).toBeInstanceOf(InputEvent);
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.inputType).toBe('insertText');
    expect(element.value).toBe('自由文本');
    expect(element.valid).toBe(false);
  });

  it('falls back to 8 for invalid max-results and warns only once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const element = document.createElement('arknights-name-input');
    document.body.append(element);

    element.setAttribute('max-results', '0');
    element.setAttribute('max-results', 'not-a-number');

    expect(element.maxResults).toBe(8);
    expect(element.getAttribute('max-results')).toBe('8');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('contains an input, list, and status inside a Shadow DOM wrapper', () => {
    const element = document.createElement('arknights-name-input');
    document.body.append(element);

    const wrapper = element.shadowRoot?.querySelector('.wrapper');
    expect(wrapper?.children).toHaveLength(3);
    expect(wrapper?.children[0]).toBeInstanceOf(HTMLInputElement);
    expect(wrapper?.children[1]).toBeInstanceOf(HTMLDivElement);
    expect(wrapper?.children[2]).toBeInstanceOf(HTMLDivElement);
  });

  it('focuses the internal input', () => {
    const element = document.createElement('arknights-name-input');
    document.body.append(element);

    element.focus();

    expect(element.shadowRoot?.activeElement).toBe(
      element.shadowRoot?.querySelector('input'),
    );
  });

  it('does not throw or re-register on repeated definition', () => {
    const registered = customElements.get('arknights-name-input');

    expect(() => {
      defineArknightsNameInput();
      defineArknightsNameInput();
    }).not.toThrow();
    expect(customElements.get('arknights-name-input')).toBe(registered);
  });
});

describe('ArknightsNameInputElement autocomplete interaction', () => {
  it('opens at most maxResults options and images with combobox semantics', () => {
    const { element, input, list, status } = componentParts();
    element.maxResults = 2;

    edit(input, 'l');

    const options = list.querySelectorAll<HTMLElement>('[role="option"]');
    const images = list.querySelectorAll<HTMLImageElement>('[role="option"] img');
    expect(options).toHaveLength(2);
    expect(images).toHaveLength(2);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(list.id).not.toBe('');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('2 个候选');
    expect(options[0]?.id).toBe(`${list.id}-option-0`);
    expect(options[0]?.getAttribute('aria-selected')).toBe('false');
    expect(images[0]?.alt).toBe('');
    expect(images[0]?.decoding).toBe('async');
    expect(images[0]?.src).toMatch(/^https:\/\//);
  });

  it('moves aria-activedescendant with wrapping ArrowDown and ArrowUp', () => {
    const { element, input, list } = componentParts();
    element.maxResults = 2;
    edit(input, 'll');
    const options = list.querySelectorAll<HTMLElement>('[role="option"]');

    const down = press(input, 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');

    const up = press(input, 'ArrowUp');
    expect(up.defaultPrevented).toBe(true);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    expect(options[0]?.getAttribute('aria-selected')).toBe('false');
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('selects the active option with Enter', () => {
    const { element, input } = componentParts();
    edit(input, 'linglan');
    press(input, 'ArrowDown');

    const enter = press(input, 'Enter');

    expect(enter.defaultPrevented).toBe(true);
    expect(element.value).toBe('铃兰');
    expect(element.valid).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('closes with Escape without changing free text', () => {
    const { element, input, list } = componentParts();
    edit(input, 'll');

    const escape = press(input, 'Escape');

    expect(escape.defaultPrevented).toBe(true);
    expect(element.value).toBe('ll');
    expect(element.valid).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('selects an option by pointer without losing the input first', () => {
    const { element, input, list } = componentParts();
    const blurListener = vi.fn();
    input.addEventListener('blur', blurListener);
    input.focus();
    edit(input, 'linglan');
    const option = list.querySelector<HTMLElement>('[role="option"]');
    expect(option).toBeInstanceOf(HTMLElement);
    if (!(option instanceof HTMLElement)) return;

    const pointerdown = new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(pointerdown, 'pointerType', { value: 'mouse' });
    option.dispatchEvent(pointerdown);

    expect(pointerdown.defaultPrevented).toBe(true);
    expect(element.shadowRoot?.activeElement).toBe(input);
    expect(blurListener).not.toHaveBeenCalled();

    option.click();
    expect(element.value).toBe('铃兰');
  });

  it('preserves touch pointer defaults and selects through compatibility click', () => {
    const { element, input, list } = componentParts();
    edit(input, 'linglan');
    const option = list.querySelector<HTMLElement>('[role="option"]');
    expect(option).toBeInstanceOf(HTMLElement);
    if (!(option instanceof HTMLElement)) return;
    const pointerdown = new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(pointerdown, 'pointerType', { value: 'touch' });

    option.dispatchEvent(pointerdown);

    expect(pointerdown.defaultPrevented).toBe(false);
    option.click();
    expect(element.value).toBe('铃兰');
  });

  it.each(['property', 'attribute'] as const)(
    'closes open options and blocks selection when disabled via %s',
    (disabledVia) => {
      const { element, input, list } = componentParts();
      const selectListener = vi.fn();
      element.addEventListener('character-select', selectListener);
      edit(input, 'linglan');
      const option = list.querySelector<HTMLElement>('[role="option"]');
      expect(option).toBeInstanceOf(HTMLElement);
      if (!(option instanceof HTMLElement)) return;
      if (disabledVia === 'property') {
        element.disabled = true;
      } else {
        element.setAttribute('disabled', '');
      }

      expect(element.disabled).toBe(true);
      expect(input.getAttribute('aria-expanded')).toBe('false');
      expect(list.hidden).toBe(true);
      expect(list.querySelectorAll('[role="option"]')).toHaveLength(0);

      option.click();

      expect(element.value).toBe('linglan');
      expect(element.valid).toBe(false);
      expect(selectListener).not.toHaveBeenCalled();
    },
  );

  it('does not search during composition and searches once after compositionend', () => {
    const { element, input, list } = componentParts();
    edit(input, 'll');
    const initialNames = Array.from(
      list.querySelectorAll<HTMLElement>('[role="option"]'),
      (option) => option.textContent,
    );
    const inputListener = vi.fn();
    element.addEventListener('input', inputListener);

    input.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      composed: true,
    }));
    input.value = 'linglan';
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertCompositionText',
      isComposing: true,
    }));

    expect(Array.from(
      list.querySelectorAll<HTMLElement>('[role="option"]'),
      (option) => option.textContent,
    )).toEqual(initialNames);
    expect(inputListener).not.toHaveBeenCalled();

    input.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      composed: true,
      data: '澜',
    }));
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertCompositionText',
    }));

    expect(element.value).toBe('linglan');
    expect(list.querySelector('[role="option"]')?.textContent).toBe('铃兰');
    expect(inputListener).toHaveBeenCalledOnce();
    const event = inputListener.mock.calls[0]?.[0] as InputEvent;
    expect(event).toBeInstanceOf(InputEvent);
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });

  it('keeps free text and renders 未找到干员 for no matches', () => {
    const { element, input, list, status } = componentParts();

    edit(input, 'zzzznomatch');

    expect(element.value).toBe('zzzznomatch');
    expect(element.valid).toBe(false);
    expect(element.selectedCharacter).toBeNull();
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(status.textContent).toBe('未找到干员');
  });

  it('closes on focus leaving the component without clearing text', async () => {
    const { element, input, list } = componentParts();
    const outside = document.createElement('button');
    document.body.append(outside);
    input.focus();
    edit(input, 'll');
    expect(input.getAttribute('aria-expanded')).toBe('true');

    outside.focus();
    await Promise.resolve();

    expect(element.value).toBe('ll');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('reopens results when refocusing with existing text after blur', async () => {
    const { element, input, list } = componentParts();
    const outside = document.createElement('button');
    document.body.append(outside);
    input.focus();
    edit(input, 'll');
    expect(input.getAttribute('aria-expanded')).toBe('true');

    outside.focus();
    await Promise.resolve();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(0);

    input.focus();

    expect(element.value).toBe('ll');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(list.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
  });

  it('does not reopen results on refocus when the input is empty', async () => {
    const { element, input, list } = componentParts();
    const outside = document.createElement('button');
    document.body.append(outside);
    input.focus();

    outside.focus();
    await Promise.resolve();

    input.focus();

    expect(element.value).toBe('');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('hides a failed image and leaves the option selectable', () => {
    const { element, input, list } = componentParts();
    element.maxResults = 1;
    edit(input, 'linglan');
    const option = list.querySelector<HTMLElement>('[role="option"]');
    const image = option?.querySelector('img');
    expect(option).toBeInstanceOf(HTMLElement);
    expect(image).toBeInstanceOf(HTMLImageElement);
    if (!(option instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

    image.dispatchEvent(new Event('error'));

    expect(image.hidden).toBe(true);
    expect(option.classList.contains('avatar-failed')).toBe(true);
    expect(option.textContent).toBe('铃兰');

    option.click();
    expect(element.value).toBe('铃兰');
    expect(element.valid).toBe(true);
  });

  it('emits one composed character-select event with matchedBy and matchedText', () => {
    const { element, input, list } = componentParts();
    const captureListener = vi.fn();
    const bubbleListener = vi.fn();
    element.addEventListener('character-select', captureListener, { capture: true });
    element.addEventListener('character-select', bubbleListener);
    edit(input, 'linglan');
    list.querySelector<HTMLElement>('[role="option"]')?.click();

    expect(captureListener).toHaveBeenCalledOnce();
    expect(bubbleListener).toHaveBeenCalledOnce();
    const event = captureListener.mock.calls[0]?.[0] as CustomEvent;
    expect(event).toBe(bubbleListener.mock.calls[0]?.[0]);
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.detail).toEqual({
      id: 'prts:147',
      name: '铃兰',
      avatarUrl: expect.stringMatching(/^https:\/\//),
      matchedBy: 'name-pinyin',
      matchedText: '铃兰',
    });
  });
});
