import snapshotJson from '../data/operators.generated.json';
import { ArknightsNameInputElement } from './component/arknights-name-input.js';
import { assertOperatorSnapshot } from './data/schema.js';

const snapshot: unknown = snapshotJson;
assertOperatorSnapshot(snapshot);
const validatedSnapshot = snapshot;

export { ArknightsNameInputElement };

export function defineArknightsNameInput(): void {
  if (customElements.get('arknights-name-input') !== undefined) return;

  const operators = validatedSnapshot.operators;
  customElements.define(
    'arknights-name-input',
    class extends ArknightsNameInputElement {
      constructor() {
        super(operators);
      }
    },
  );
}

defineArknightsNameInput();

declare global {
  interface HTMLElementTagNameMap {
    'arknights-name-input': ArknightsNameInputElement;
  }
}
