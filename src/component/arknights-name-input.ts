import { findExactOperator, searchOperators } from '../search/search.js';
import type {
  CharacterSelectDetail,
  OperatorRecord,
  SearchResult,
  SelectedCharacter,
} from '../data/types.js';
import { componentStyles } from './styles.js';

let hasWarnedAboutInvalidMaxResults = false;
let nextListId = 0;

function validatedMaxResults(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;

  if (!hasWarnedAboutInvalidMaxResults) {
    console.warn('arknights-name-input: max-results must be a positive integer; using 8');
    hasWarnedAboutInvalidMaxResults = true;
  }
  return ArknightsNameInputElement.defaultMaxResults;
}

export class ArknightsNameInputElement extends HTMLElement {
  static readonly observedAttributes = [
    'value',
    'placeholder',
    'disabled',
    'max-results',
  ];

  static readonly defaultMaxResults = 8;

  readonly #input: HTMLInputElement;
  readonly #list: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #operators: readonly OperatorRecord[];
  readonly #listId: string;
  #value = '';
  #maxResults = ArknightsNameInputElement.defaultMaxResults;
  #selectedCharacter: SelectedCharacter | null = null;
  #isReflectingAttribute = false;
  #results: SearchResult[] = [];
  #activeIndex = -1;
  #isComposing = false;
  #isDispatchingCompositionEndInput = false;
  #pendingCompositionValue: string | null = null;

  constructor(operators: readonly OperatorRecord[]) {
    super();
    this.#operators = operators;

    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    this.#listId = `akni-list-${++nextListId}`;
    this.#input = document.createElement('input');
    this.#list = document.createElement('div');
    this.#status = document.createElement('div');
    this.#input.setAttribute('role', 'combobox');
    this.#input.setAttribute('aria-autocomplete', 'list');
    this.#input.setAttribute('aria-controls', this.#listId);
    this.#input.setAttribute('aria-expanded', 'false');
    this.#list.id = this.#listId;
    this.#list.className = 'list';
    this.#list.setAttribute('role', 'listbox');
    this.#list.hidden = true;
    this.#status.className = 'status';
    this.#status.setAttribute('role', 'status');
    this.#status.setAttribute('aria-live', 'polite');

    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';
    wrapper.append(this.#input, this.#list, this.#status);
    const style = document.createElement('style');
    style.textContent = componentStyles;
    root.append(style, wrapper);

    this.addEventListener('input', (event) => {
      if (event.composedPath()[0] !== this.#input) return;

      event.stopImmediatePropagation();
      if (
        this.#isComposing
        || (event instanceof InputEvent && event.isComposing)
      ) return;

      if (!this.#isDispatchingCompositionEndInput) {
        if (this.#pendingCompositionValue === this.#input.value) {
          this.#pendingCompositionValue = null;
          return;
        }
        this.#pendingCompositionValue = null;
      }
      this.#setValue(this.#input.value, true);
      this.#search();
      this.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: event instanceof InputEvent ? event.inputType : '',
      }));
    }, { capture: true });

    this.#input.addEventListener('compositionstart', () => {
      this.#isComposing = true;
      this.#pendingCompositionValue = null;
    });
    this.#input.addEventListener('compositionend', () => {
      this.#isComposing = false;
      this.#pendingCompositionValue = this.#input.value;
      this.#isDispatchingCompositionEndInput = true;
      try {
        this.#input.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertCompositionText',
        }));
      } finally {
        this.#isDispatchingCompositionEndInput = false;
      }
    });
    this.#input.addEventListener('keydown', (event) => {
      this.#handleKeydown(event);
    });
    this.addEventListener('focusout', () => {
      queueMicrotask(() => {
        if (!this.matches(':focus-within')) this.#closeResults();
      });
    });
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue || this.#isReflectingAttribute) return;

    switch (name) {
      case 'value':
        this.#setValue(newValue ?? '', false);
        break;
      case 'placeholder':
        this.#input.placeholder = newValue ?? '';
        break;
      case 'disabled':
        this.#input.disabled = newValue !== null;
        break;
      case 'max-results':
        this.#setMaxResults(newValue ?? '', true);
        break;
    }
  }

  get value(): string {
    return this.#value;
  }

  set value(value: string) {
    this.#setValue(String(value), true);
  }

  get placeholder(): string {
    return this.#input.placeholder;
  }

  set placeholder(value: string) {
    const nextValue = String(value);
    this.#input.placeholder = nextValue;
    this.#reflectStringAttribute('placeholder', nextValue);
  }

  get disabled(): boolean {
    return this.#input.disabled;
  }

  set disabled(value: boolean) {
    const nextValue = Boolean(value);
    this.#input.disabled = nextValue;
    this.#reflectBooleanAttribute('disabled', nextValue);
  }

  get maxResults(): number {
    return this.#maxResults;
  }

  set maxResults(value: number) {
    this.#setMaxResults(value, true);
  }

  get valid(): boolean {
    return this.#selectedCharacter !== null;
  }

  get selectedCharacter(): SelectedCharacter | null {
    return this.#selectedCharacter === null
      ? null
      : { ...this.#selectedCharacter };
  }

  override focus(options?: FocusOptions): void {
    this.#input.focus(options);
  }

  clear(): void {
    this.value = '';
    this.#closeResults();
  }

  #setValue(value: string, reflect: boolean): void {
    this.#value = value;
    this.#input.value = value;
    const operator = findExactOperator(this.#operators, value);
    this.#selectedCharacter = operator === null
      ? null
      : {
          id: operator.id,
          name: operator.name,
          avatarUrl: operator.avatarUrl,
        };

    if (reflect) this.#reflectStringAttribute('value', value);
  }

  #setMaxResults(value: string | number, reflect: boolean): void {
    this.#maxResults = validatedMaxResults(value);
    if (reflect) {
      this.#reflectStringAttribute('max-results', String(this.#maxResults));
    }
  }

  #search(): void {
    this.#results = searchOperators(
      this.#operators,
      this.#input.value,
      this.#maxResults,
    );
    this.#activeIndex = -1;
    this.#renderResults();
  }

  #renderResults(): void {
    this.#list.replaceChildren();
    this.#results.forEach((result, index) => {
      const option = document.createElement('div');
      option.id = `${this.#listId}-option-${index}`;
      option.className = 'option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');

      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = result.operator.avatarUrl;
      image.addEventListener('error', () => {
        image.hidden = true;
        option.classList.add('avatar-failed');
      }, { once: true });

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = result.operator.name;
      option.append(image, name);
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault();
      });
      option.addEventListener('click', () => {
        this.#selectResult(result);
      });
      this.#list.append(option);
    });

    const isOpen = this.#results.length > 0;
    this.#list.hidden = !isOpen;
    this.#input.setAttribute('aria-expanded', String(isOpen));
    this.#input.removeAttribute('aria-activedescendant');
    const hasQuery = this.#input.value.trim().length > 0;
    const hasNoMatch = hasQuery && !isOpen;
    this.#status.classList.toggle('no-match', hasNoMatch);
    this.#status.textContent = hasNoMatch
      ? '未找到干员'
      : isOpen
        ? `${this.#results.length} 个候选`
        : '';
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (this.#isComposing || this.#results.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.#setActiveIndex(
          this.#activeIndex < 0
            ? 0
            : (this.#activeIndex + 1) % this.#results.length,
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#setActiveIndex(
          this.#activeIndex < 0
            ? this.#results.length - 1
            : (this.#activeIndex - 1 + this.#results.length)
              % this.#results.length,
        );
        break;
      case 'Enter': {
        const result = this.#results[this.#activeIndex];
        if (result === undefined) return;
        event.preventDefault();
        this.#selectResult(result);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.#closeResults();
        break;
    }
  }

  #setActiveIndex(index: number): void {
    const previous = this.#list.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    previous?.setAttribute('aria-selected', 'false');

    this.#activeIndex = index;
    const active = this.#list.querySelector<HTMLElement>(
      `#${this.#listId}-option-${index}`,
    );
    active?.setAttribute('aria-selected', 'true');
    if (active !== null) {
      this.#input.setAttribute('aria-activedescendant', active.id);
    }
  }

  #closeResults(): void {
    this.#results = [];
    this.#activeIndex = -1;
    this.#list.replaceChildren();
    this.#list.hidden = true;
    this.#input.setAttribute('aria-expanded', 'false');
    this.#input.removeAttribute('aria-activedescendant');
    this.#status.classList.remove('no-match');
    this.#status.textContent = '';
  }

  #reflectStringAttribute(name: string, value: string): void {
    if (this.getAttribute(name) === value) return;
    this.#isReflectingAttribute = true;
    try {
      this.setAttribute(name, value);
    } finally {
      this.#isReflectingAttribute = false;
    }
  }

  #reflectBooleanAttribute(name: string, value: boolean): void {
    if (this.hasAttribute(name) === value) return;
    this.#isReflectingAttribute = true;
    try {
      this.toggleAttribute(name, value);
    } finally {
      this.#isReflectingAttribute = false;
    }
  }

  #selectResult(result: SearchResult): void {
    if (this.disabled) return;

    this.value = result.operator.name;
    this.#closeResults();
    const detail: CharacterSelectDetail = {
      id: result.operator.id,
      name: result.operator.name,
      avatarUrl: result.operator.avatarUrl,
      matchedBy: result.matchedBy,
      matchedText: result.matchedText,
    };
    this.dispatchEvent(new CustomEvent<CharacterSelectDetail>('character-select', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }
}
