import { findExactOperator } from '../search/search.js';
import type {
  CharacterSelectDetail,
  OperatorRecord,
  SearchResult,
  SelectedCharacter,
} from '../data/types.js';

let hasWarnedAboutInvalidMaxResults = false;

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
  #value = '';
  #maxResults = ArknightsNameInputElement.defaultMaxResults;
  #selectedCharacter: SelectedCharacter | null = null;
  #isReflectingAttribute = false;

  constructor(operators: readonly OperatorRecord[]) {
    super();
    this.#operators = operators;

    const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
    this.#input = document.createElement('input');
    this.#list = document.createElement('div');
    this.#status = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';
    wrapper.append(this.#input, this.#list, this.#status);
    root.append(wrapper);

    this.addEventListener('input', (event) => {
      if (event.composedPath()[0] !== this.#input) return;

      event.stopImmediatePropagation();
      this.#setValue(this.#input.value, true);
      this.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: event instanceof InputEvent ? event.inputType : '',
      }));
    }, { capture: true });
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
    this.#list.replaceChildren();
    this.#status.textContent = '';
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
    this.value = result.operator.name;
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
