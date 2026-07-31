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
