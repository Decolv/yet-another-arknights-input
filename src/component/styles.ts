export const componentStyles = `
:host {
  --akni-width: 100%;
  --akni-font-family: system-ui, sans-serif;
  --akni-font-size: 14px;
  --akni-text-color: #202632;
  --akni-background: #ffffff;
  --akni-border-color: #b8c0cc;
  --akni-accent-color: #2864dc;
  --akni-radius: 6px;
  --akni-input-height: 40px;
  --akni-option-height: 44px;
  --akni-list-max-height: 320px;
  --akni-z-index: 1000;
  display: inline-block;
  width: var(--akni-width);
  color: var(--akni-text-color);
  font-family: var(--akni-font-family);
  font-size: var(--akni-font-size);
}

.wrapper {
  position: relative;
  width: 100%;
}

input {
  box-sizing: border-box;
  width: 100%;
  height: var(--akni-input-height);
  padding: 0 12px;
  color: var(--akni-text-color);
  font: inherit;
  background: var(--akni-background);
  border: 1px solid var(--akni-border-color);
  border-radius: var(--akni-radius);
}

input:focus {
  outline: 2px solid var(--akni-accent-color);
  outline-offset: 1px;
}

.list {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: var(--akni-z-index);
  box-sizing: border-box;
  max-height: var(--akni-list-max-height);
  overflow-y: auto;
  color: var(--akni-text-color);
  background: var(--akni-background);
  border: 1px solid var(--akni-border-color);
  border-radius: var(--akni-radius);
}

.option {
  display: flex;
  align-items: center;
  min-height: var(--akni-option-height);
  padding: 4px 10px;
  gap: 8px;
  cursor: pointer;
}

.option[aria-selected="true"] {
  color: var(--akni-background);
  background: var(--akni-accent-color);
}

.option img {
  width: calc(var(--akni-option-height) - 12px);
  height: calc(var(--akni-option-height) - 12px);
  flex: none;
  object-fit: cover;
  border-radius: calc(var(--akni-radius) / 2);
}

.option.avatar-failed {
  gap: 0;
}

.avatar-failed img {
  display: none;
}

.status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.status.no-match {
  position: static;
  width: auto;
  height: auto;
  padding: 8px 12px;
  overflow: visible;
  clip: auto;
  white-space: normal;
  color: var(--akni-text-color);
  background: var(--akni-background);
  border: 1px solid var(--akni-border-color);
  border-radius: var(--akni-radius);
}
`;
